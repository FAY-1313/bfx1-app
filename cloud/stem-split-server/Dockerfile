# BFX-1 AI Stem Splitter — 云端分轨服务
# 基于 Demucs HTDemucs 6-stem (htdemucs_6s), 流式返回 6 轨 ZIP.
# 兼容云托管 (CloudBase Run): 端口读 $PORT (缺省 8000), 健康检查路径 / 或 /health.
FROM python:3.10-slim

WORKDIR /app

# 国内服务器访问 deb.debian.org 极慢 -> 换阿里云镜像源 (兼容 bookworm/trixie 的 deb822 与 legacy 格式)
RUN sed -i 's|deb.debian.org|mirrors.aliyun.com|g' \
        /etc/apt/sources.list /etc/apt/sources.list.d/*.sources 2>/dev/null || true; \
    apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg libsndfile1 && rm -rf /var/lib/apt/lists/*

# 国内网络: 默认 PyPI 换清华镜像 (快速且完整), torch 必须装 CPU 版.
# 坑: 清华/阿里/腾讯的 pytorch-wheels 镜像已 404, 若用普通 PyPI 的 torch 会拉 CUDA 版
#     (自动下载 nvidia-* 依赖 2~3GB, 纯 CPU 服务器完全浪费). 上海交大 mirror.sjtu.edu.cn
#     仍在同步 pytorch CPU wheels -> 作为主源, 清华 PyPI 作 extra 解析其余依赖.
RUN pip config set global.index-url https://pypi.tuna.tsinghua.edu.cn/simple && \
    pip install --no-cache-dir \
    --index-url https://mirror.sjtu.edu.cn/pytorch-wheels/cpu \
    --extra-index-url https://pypi.tuna.tsinghua.edu.cn/simple \
    torch==2.14.0+cpu torchaudio==2.11.0+cpu

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 国内网络无法直连 huggingface.co, 权重下载走 hf-mirror.com 镜像
# (构建期与运行时均生效; 若自建服务器在海外可注释掉)
ENV HF_ENDPOINT=https://hf-mirror.com

# 构建期预下载 htdemucs_6s 权重 (~160MB) 打进镜像:
# 运行时零下载 (消除云托管冷启动首次请求超时/下载源不可达风险), 首次 /split 只做内存加载.
RUN python -c "from demucs.api import Separator; Separator(model='htdemucs_6s')"

COPY server.py .

ENV PORT=8000
EXPOSE 8000
CMD ["sh", "-c", "uvicorn server:app --host 0.0.0.0 --port ${PORT:-8000}"]
