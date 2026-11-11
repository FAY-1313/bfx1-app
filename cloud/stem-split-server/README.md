# BFX-1 AI 分轨 — 云端服务 (B 端)

Demucs HTDemucs **6-stem** (htdemucs_6s) 真实 AI 分轨服务, 配合 App 内"云端 · 6 轨"模式使用.

## 部署方式 (任选其一)

### 方式 A: CloudBase 云托管 (推荐, 公网 HTTPS, App 免填地址) — 见下方专节

### 方式 B: Docker (自建服务器/本机)

```bash
cd cloud/stem-split-server
docker build -t stem-split .
docker run -p 8000:8000 stem-split
```

### 方式 C: 直接运行 (本机调试)

```bash
pip install -r requirements.txt
uvicorn server:app --host 0.0.0.0 --port 8000
```

首次分离会下载 htdemucs_6s 预训练权重 (~160MB), 缓存后不再重复下载.
Dockerfile 已安装 CPU 版 torch (无 GPU 也可跑; 有 GPU 可自行改 CUDA 镜像提速).

## API

- `GET /` — 健康检查 (云托管默认探测路径)
- `GET /health` — 健康检查 (含模型就绪状态)
- `POST /split` — `multipart/form-data` 上传音频 (`file` 字段), 返回 ZIP (6 个 wav: `vocals/drums/bass/guitar/piano/other`)
  - 上传上限 200MB (环境变量 `MAX_UPLOAD` 可调)
  - 内存紧张时设 `DEMUCS_SEGMENT` (如 `8` = 8 秒分段推理, 降峰值内存)

## CloudBase 云托管部署 (公网 HTTPS)

> 目标: 让 App 直接连公网地址, 彻底摆脱局域网 IP.

### 1. 开通云托管

控制台 → [云托管](https://console.cloud.tencent.com/tcb/run) → 选择环境
`bfx1-v1-fay-d6g6w79ss8e4d9bf5` (ap-shanghai) → 开通 (按量计费, 首次需绑支付方式).

> 环境当前为个人版, **2026-09-22 到期**; 长期使用请先在控制台续期/升级环境,
> 否则到期后服务会被回收.

### 2. 登录 CLI

```bash
tcb login --apiKeyId <SecretId> --apiKey <SecretKey>
```

要求密钥具备云托管权限 (tcbr). 若报 `not authorized ... tcbr:xxx`, 请:
- 在 [CAM 访问管理](https://console.cloud.tencent.com/cam) 给该密钥授权
  `CloudBase Run 全读写` (QcloudTCBRFullAccess), 或
- 使用主账号/更高权限密钥 (用完建议轮换).

### 3. 一键部署

```bash
bash cloud/stem-split-server/deploy_cloudbase.sh
```

脚本会自动: 上传源码 → 云端构建镜像 (首次约 5~15 分钟, 含 torch) → 创建服务
`stem-split` (2核4G, 无请求缩容到 0, 8 秒分段降内存) → 打印服务地址.

### 4. 关键控制台配置

- **请求超时**: 云托管控制台 → 服务设置 → 请求超时调到最大 (900s).
  Demucs CPU 推理一首 3~4 分钟歌曲约需 3~10 分钟, 默认超时会中断.
- **首次冷启动**: 首个 `/split` 会等待模型下载 (~160MB), 服务器已在后台预热,
  不阻塞健康检查; 若希望更稳可开启「最小实例数 ≥ 1」常驻.

### 5. App 接入

部署完成后把服务地址 (形如
`https://stem-split-<id>.ap-shanghai.app.tcloudbase.com`) 填入 App:

- 临时: 分轨页云端失败 → 弹出的配置框粘贴一次, App 会记住.
- 永久: 改 `src/components/StemSplitter.tsx` 中 `DEFAULT_SERVER`, 重新构建 APK.

## App 内配置 (局域网方案)

App 已预填默认服务器地址, 无需输入. 若你的服务器 IP 不同, 在分轨页云端失败时弹出的配置框里改一次即可, App 会记住.

- 端口默认 `8000`.
- 真机同局域网: 填电脑的局域网 IP, 如 `http://192.168.x.x:8000`.
- Android 模拟器: `http://10.0.2.2:8000` (指向电脑本机).
