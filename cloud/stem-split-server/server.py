# AI 分轨云端服务 (B 端)
#
# 基于 Demucs HTDemucs 6-stem (htdemucs_6s) 的 FastAPI 服务: 接收客户端上传的音频,
# 分离出 人声/鼓/贝斯/吉他/钢琴/其他 6 轨, 打包成 ZIP 返回.
#
# 部署 (任选其一):
#   docker build -t stem-split . && docker run -p 8000:8000 stem-split
#   或: pip install -r requirements.txt && uvicorn server:app --host 0.0.0.0 --port 8000
#
# 云托管 (CloudBase Run) 适配:
#   - 端口读 PORT 环境变量 (云托管注入), 缺省 8000
#   - 提供 GET / 健康检查 (云托管默认探测路径), /health 亦可用
#   - 启动后后台线程预热模型 (首次冷启动即开始下载 ~160MB 权重, 不阻塞健康检查)
#   - 上传体积上限 MAX_UPLOAD (默认 200MB, 可环境变量覆盖)
#   - 内存不足时可用 DEMUCS_SEGMENT 调小分段控制峰值内存
#
# 并发/多人使用模型:
#   单机内存有限 (2C2G 实际可用 ~1.6G), Demucs 一次推理峰值 3~4G -> 同进程任何时刻
#   只允许 1 个推理在跑 (INFER_GATE 互斥锁 + 单后台 worker 线程池), 其余请求排队.
#   为此提供两套接口:
#     1) POST /split          同步接口 (兼容旧 App): 请求挂起直至分轨完成, 适合低并发.
#     2) POST /tasks 异步任务 (推荐多人场景): 立即返回 task_id,
#        GET /tasks/{id} 轮询状态 (queued/running/done/error, 含排队位置),
#        GET /tasks/{id}/download 下载 ZIP. 单 worker 天然串行, 队列上限 16 (满则 429).
#   注意: 任务状态存内存, 仅适用于单进程单实例; 多副本部署需换 Redis (暂不需要).
#
# 客户端集成 (App 内"云端"模式):
#   POST  http://<host>:8000/split  或  POST http://<host>:8000/tasks
#     multipart: file=<audio>
#   返回: application/zip (内含 6 个 wav: vocals/drums/bass/guitar/piano/other)

import asyncio
import itertools
import os
import shutil
import tempfile
import threading
import time
import uuid
from contextlib import asynccontextmanager
from dataclasses import dataclass, field

import uvicorn
import zipstream
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse

PORT = int(os.environ.get("PORT", "8000"))
MAX_UPLOAD = int(os.environ.get("MAX_UPLOAD", str(200 * 1024 * 1024)))  # 200MB
DEMUCS_SEGMENT = os.environ.get("DEMUCS_SEGMENT")  # 如 "7.8" -> 7.8s 分段, 降低内存
MODEL_NAME = os.environ.get("DEMUCS_MODEL", "htdemucs_6s")
MAX_QUEUE = int(os.environ.get("MAX_QUEUE", "16"))  # 最多排队任务数, 超出返回 429
TASK_TTL = int(os.environ.get("TASK_TTL", "1800"))  # 任务完成后保留 30min 供下载

# 国内网络无法直连 huggingface.co (实测超时), demucs 权重默认从 HF 下载;
# 这里默认走 hf-mirror.com 镜像, 保证国内部署/局域网跑通. 必须置于 import demucs 之前.
os.environ.setdefault("HF_ENDPOINT", "https://hf-mirror.com")
# Windows 无符号链接支持时屏蔽 huggingface_hub 缓存警告
os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")

SEPARATOR = None
DEMUCS_API = None
SEP_READY = threading.Event()
SEP_LOCK = threading.Lock()


def get_separator():
    """懒加载 Demucs 分离器 (首次调用时下载模型, 幂等, 线程安全)."""
    global SEPARATOR, DEMUCS_API
    if SEPARATOR is None:
        with SEP_LOCK:
            if SEPARATOR is None:
                import demucs.api

                DEMUCS_API = demucs.api
                kwargs = {"model": MODEL_NAME}
                if DEMUCS_SEGMENT:
                    kwargs["segment"] = float(DEMUCS_SEGMENT)
                SEPARATOR = demucs.api.Separator(**kwargs)
                SEP_READY.set()
    return SEPARATOR


def _warmup():
    """后台预热: 冷启动即开始下载/加载模型, 不阻塞健康检查."""
    try:
        get_separator()
        print(f"[warmup] model {MODEL_NAME} ready")
    except Exception as e:  # noqa: BLE001
        print(f"[warmup] failed (will retry on first request): {e}")


# App 需要的 6 轨 (与 Demucs 输出同名; 缺失的轨自动跳过)
STEMS = ["vocals", "drums", "bass", "guitar", "piano", "other"]

# ---------------- 并发串行化 ----------------
# 全服务 (同步 /split + 异步任务 worker) 共享同一把互斥锁: 保证任何时刻只有一个
# Demucs 推理在跑, 从根上避免 2C2G 小内存机器 OOM. 推理是 CPU 密集 + 阻塞式,
# 一律丢到后台线程执行, 不阻塞事件循环 (健康检查/其他请求仍可响应).

INFER_GATE = asyncio.Lock()


def _infer_blocking(sep, src_path, tmp):
    """在后台线程执行的同步分离 + 落盘.

    demucs.api.Separator.separate_audio_file 返回 (原始波形, {轨名: 波形}),
    是二元组不是列表 — 不能 for 解包 dict 键!
    """
    _, separated = sep.separate_audio_file(src_path)
    for stem, source in separated.items():
        DEMUCS_API.save_audio(source, f"{tmp}/{stem}.wav", samplerate=sep.samplerate)


# ---------------- 异步任务队列 ----------------

@dataclass
class StemTask:
    tid: str
    filename: str = ""
    state: str = "queued"  # queued / running / done / error
    error: str | None = None
    seq: int = 0
    created: float = field(default_factory=time.time)
    finished: float | None = None
    tmp: str = ""
    src: str = ""


TASKS: dict[str, StemTask] = {}
QUEUE: asyncio.Queue = asyncio.Queue(maxsize=MAX_QUEUE)
_SEQ = itertools.count(1)
_LAST_STARTED = 0  # 最近一次开始执行的任务 seq (用于算排队位置)


def _queue_position(t: StemTask) -> int:
    """排队位置: 0=下一个即将执行."""
    if t.state == "running":
        return 0
    if t.state != "queued":
        return -1
    return max(0, t.seq - _LAST_STARTED)


async def _worker_loop():
    """单后台 worker: 串行消费队列. 天然保证同时只有 1 个推理."""
    global _LAST_STARTED
    while True:
        t: StemTask = await QUEUE.get()
        _LAST_STARTED = t.seq
        t.state = "running"
        try:
            sep = await asyncio.to_thread(get_separator)
            async with INFER_GATE:
                await asyncio.to_thread(_infer_blocking, sep, t.src, t.tmp)
            t.state = "done"
            print(f"[task {t.tid}] done ({t.filename})")
        except Exception as e:  # noqa: BLE001
            t.state = "error"
            t.error = str(e)
            print(f"[task {t.tid}] failed: {e}")
        finally:
            t.finished = time.time()
            QUEUE.task_done()


async def _cleaner_loop():
    """周期清理过期任务目录/记录, 防止磁盘堆积."""
    while True:
        await asyncio.sleep(60)
        now = time.time()
        stale = []
        for t in TASKS.values():
            if t.state in ("done", "error") and t.finished and now - t.finished > TASK_TTL:
                stale.append(t)
            elif t.state == "queued" and now - t.created > TASK_TTL:
                stale.append(t)
        for t in stale:
            shutil.rmtree(t.tmp, ignore_errors=True)
            TASKS.pop(t.tid, None)
            print(f"[task {t.tid}] cleaned (TTL expired)")


@asynccontextmanager
async def _lifespan(app_):
    worker = asyncio.create_task(_worker_loop())
    cleaner = asyncio.create_task(_cleaner_loop())
    threading.Thread(target=_warmup, daemon=True).start()
    yield
    worker.cancel()
    cleaner.cancel()


app = FastAPI(title="BFX-1 AI Stem Splitter", lifespan=_lifespan)

# App (Capacitor WebView origin 为 https://localhost) 跨域调用本服务必须允许 CORS.
# 该服务为公开只读的分轨接口 (不携带凭证), 全放行; 如需收紧可改为显式 origin 列表.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


async def _save_upload(file: UploadFile):
    """读取并校验上传, 落盘到临时目录, 返回 (tmp_dir, src_path). 异常抛 HTTPException."""
    data = await file.read()
    if len(data) == 0:
        raise HTTPException(status_code=400, detail="empty file")
    if len(data) > MAX_UPLOAD:
        raise HTTPException(
            status_code=413,
            detail=f"file too large (max {MAX_UPLOAD // (1024 * 1024)}MB)",
        )
    tmp = tempfile.mkdtemp(prefix="bfx_stem_")
    src_path = f"{tmp}/input{_ext(file.filename or '')}"
    with open(src_path, "wb") as f:
        f.write(data)
    return tmp, src_path


def _zip_stream(tmp):
    """从任务目录流式打包 6 轨 ZIP, 结束后清理目录."""
    try:
        z = zipstream.ZipFile(mode="w", compression=zipstream.ZIP_DEFLATED)
        for stem in STEMS:
            path = f"{tmp}/{stem}.wav"
            if os.path.exists(path):
                z.write(path, arcname=f"{stem}.wav")
        for chunk in z:
            yield chunk
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


@app.get("/")
def root():
    """健康检查 (云托管默认探测路径)."""
    return {"service": "bfx1-stem-split", "status": "ok", "model": MODEL_NAME}


@app.get("/health")
def health():
    ready = SEPARATOR is not None
    return {"status": "ok", "model": MODEL_NAME, "model_ready": ready}


@app.get("/queue")
def queue_status():
    """当前队列状态: running 数量 + 排队数量 (供客户端展示 '排队中')."""
    running = sum(1 for t in TASKS.values() if t.state == "running")
    queued = sum(1 for t in TASKS.values() if t.state == "queued")
    return {"running": running, "queued": queued, "max_queue": MAX_QUEUE}


# ================= 同步接口 (兼容旧 App) =================

@app.post("/split")
async def split(file: UploadFile = File(...)):
    tmp, src_path = await _save_upload(file)
    try:
        # 与异步任务共用互斥锁: 人多时同步请求同样排队, 不会 OOM.
        sep = await asyncio.to_thread(get_separator)
        async with INFER_GATE:
            await asyncio.to_thread(_infer_blocking, sep, src_path, tmp)
    except Exception as e:  # noqa: BLE001
        shutil.rmtree(tmp, ignore_errors=True)
        print(f"[split] separation failed: {e}")
        return JSONResponse({"error": f"separation failed: {e}"}, status_code=500)
    return StreamingResponse(
        _zip_stream(tmp),
        media_type="application/zip",
        headers={"Content-Disposition": 'attachment; filename="stems.zip"'},
    )


# ================= 异步任务接口 (多人场景推荐) =================

@app.post("/tasks", status_code=202)
async def create_task(file: UploadFile = File(...)):
    tmp, src_path = await _save_upload(file)
    if QUEUE.qsize() >= MAX_QUEUE:
        shutil.rmtree(tmp, ignore_errors=True)
        raise HTTPException(status_code=429, detail=f"server busy, queue full (max {MAX_QUEUE}), retry later")

    t = StemTask(
        tid=uuid.uuid4().hex[:12],
        filename=file.filename or "audio",
        tmp=tmp,
        src=src_path,
        seq=next(_SEQ),
    )
    TASKS[t.tid] = t
    try:
        await QUEUE.put(t)
    except asyncio.QueueFull:  # 极端竞态兜底
        shutil.rmtree(tmp, ignore_errors=True)
        TASKS.pop(t.tid, None)
        raise HTTPException(status_code=429, detail=f"server busy, queue full (max {MAX_QUEUE}), retry later")
    return {"task_id": t.tid, "status": t.state, "position": _queue_position(t)}


@app.get("/tasks/{task_id}")
def task_status(task_id: str):
    t = TASKS.get(task_id)
    if t is None:
        raise HTTPException(status_code=404, detail="task not found")
    return {
        "task_id": t.tid,
        "filename": t.filename,
        "status": t.state,
        "position": _queue_position(t),
        "error": t.error,
        "created": t.created,
        "finished": t.finished,
    }


@app.get("/tasks/{task_id}/download")
def download_task(task_id: str):
    t = TASKS.get(task_id)
    if t is None:
        raise HTTPException(status_code=404, detail="task not found")
    if t.state == "error":
        raise HTTPException(status_code=500, detail=f"separation failed: {t.error}")
    if t.state != "done":
        raise HTTPException(
            status_code=409,
            detail=f"task not finished yet (status={t.state})",
        )
    return StreamingResponse(
        _zip_stream(t.tmp),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{t.filename}.stems.zip"'},
    )


def _ext(name: str) -> str:
    """推断扩展名, 便于 torchaudio/ffmpeg 解码."""
    ext = os.path.splitext(name)[1].lower()
    return ext if ext in (".wav", ".mp3", ".ogg", ".flac", ".m4a") else ".wav"


if __name__ == "__main__":
    uvicorn.run("server:app", host="0.0.0.0", port=PORT)
