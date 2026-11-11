#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# BFX-1 AI 分轨服务 — CloudBase 云托管 (CloudBase Run) 一键部署
# ═══════════════════════════════════════════════════════════════════
# 前置条件:
#   1. 腾讯云控制台已开通「云托管」: https://console.cloud.tencent.com/tcb/run
#      (环境 bfx1-v1-fay-d6g6w79ss8e4d9bf5, ap-shanghai)
#   2. 本机已登录 CloudBase CLI:
#      tcb login --apiKeyId <SecretId> --apiKey <SecretKey>
#      (密钥需有 tcbr 云托管权限; 若报 not authorized, 在控制台给密钥授权或重新生成)
#   3. 无需本地 Docker —— 使用源码上传, 云端自动构建镜像
#
# 用法: 从项目根目录执行  bash cloud/stem-split-server/deploy_cloudbase.sh
#       (脚本会 cd 到 UI03 根目录, 以便读取 cloudbaserc.json 里的 envId)
# 部署后把输出中的「服务访问地址」填到 App 分轨页的服务器地址(或改默认值)即可.
#
# CLI 兼容性说明 (CLI 3.8.1):
#   - 旧命令 `tcb run deploy` 已标记 Deprecated, 但参数最全 (cpu/mem/envParams 等),
#     且环境 ID 靠 cloudbaserc.json 读取 (不认 -e 参数)。
#   - 新命令 `tcb cloudrun deploy` 已移除资源规格参数 (规格只能控制台设置),
#     因此这里保留旧命令; 若未来旧命令失效, 改用:
#       tcb cloudrun deploy -s stem-split --source <server目录> --port 8000 --force
#     然后到控制台把规格改为 2C4G、超时 900s、环境变量 DEMUCS_SEGMENT=8。
# ═══════════════════════════════════════════════════════════════════
set -e

SERVICE="stem-split"
# 项目根目录 (含 cloudbaserc.json) — 从脚本位置向上两级
UI03_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$UI03_ROOT"
echo "▶ 工作目录: $UI03_ROOT (读取 cloudbaserc.json)"

SRC_DIR="$UI03_ROOT/cloud/stem-split-server"
PORT=8000
CPU=2
MEM=4            # GB — Demucs 6s 推理峰值内存约 3~4GB, 至少 2GB
MIN_NUM=0        # 无请求缩容到 0 (按量计费, 省钱)
MAX_NUM=1
# 环境变量: DEMUCS_SEGMENT=8 把音频分段 8s 推理, 显著降低内存峰值
#           (若服务器内存充足可去掉; 长音频更稳但稍慢)
ENV_PARAMS="DEMUCS_SEGMENT=8"

echo "▶ [1/3] 上传源码并云端构建镜像 (首次构建含 torch 下载, 约 5~15 分钟)..."
tcb run deploy \
  -s "$SERVICE" \
  --path "$SRC_DIR" \
  --containerPort "$PORT" \
  --cpu "$CPU" --mem "$MEM" \
  --minNum "$MIN_NUM" --maxNum "$MAX_NUM" \
  --envParams "$ENV_PARAMS" \
  --remark "bfx1-demucs-6s" \
  --noConfirm

echo "▶ [2/3] 校验服务状态..."
tcb cloudrun detail -s "$SERVICE" || echo "  (状态查询失败, 可忽略 — 稍后在控制台确认即可)"

echo "▶ [3/3] 部署完成!"
echo "  · 服务名:   $SERVICE"
echo "  · 访问地址: 请在上一步输出中查看 (形如 https://stem-split-<id>.ap-shanghai.app.tcloudbase.com)"
echo ""
echo "  ※ 重要: 若控制台/详情中「请求超时」不是最大值, 请到"
echo "    云托管控制台 → 服务设置 → 将请求超时调至最大 (900s, Demucs 推理较慢)."
echo "  ※ 首次调用会下载 htdemucs_6s 权重 (~160MB), 首个请求可能较慢;"
echo "    之后模型常驻内存, 后续请求正常."
