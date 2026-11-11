#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# BFX-1 AI 分轨服务 — 腾讯云轻量应用服务器一键部署
# ═══════════════════════════════════════════════════════════════════
# 用法 (SSH 登录服务器后, 在本目录执行):
#   有域名(推荐):  bash deploy_lighthouse.sh your.domain.com
#     -> 需先把域名 A 记录解析到本机公网 IP, 控制台防火墙放行 80/443
#   无域名:        bash deploy_lighthouse.sh
#     -> App 直接填 http://<公网IP>:8000 (控制台防火墙放行 8000)
#
# 首次执行含镜像构建 (torch + 模型权重烘焙, 约 5~10 分钟), 之后秒级启动.
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

DOMAIN="${1:-}"
cd "$(dirname "$0")"

say() { printf '\n\033[1;34m▶ %s\033[0m\n' "$*"; }

# ── 0. Docker 可用性 ────────────────────────────────────────────────
say "[0/5] 检查 Docker..."
if ! command -v docker >/dev/null 2>&1; then
  echo "  未安装 Docker, 通过 apt 安装 (需 sudo)..."
  sudo apt-get update -y
  sudo apt-get install -y docker.io docker-compose-v2 || sudo apt-get install -y docker.io docker-compose-plugin
  sudo systemctl enable --now docker
fi
if ! docker info >/dev/null 2>&1; then
  echo "  当前用户无 docker 权限, 加入 docker 组..."
  sudo usermod -aG docker "$USER"
  echo "  已加入 docker 组, 请退出 SSH 后重新登录, 再执行: bash deploy_lighthouse.sh ${DOMAIN}"
  exit 0
fi
# compose v2 插件
COMPOSE="docker compose"
if ! docker compose version >/dev/null 2>&1; then
  echo "  docker compose v2 不可用, 尝试安装..."
  sudo apt-get install -y docker-compose-v2 docker-compose-plugin 2>/dev/null || true
fi
if ! docker compose version >/dev/null 2>&1; then
  COMPOSE="docker-compose"
  command -v docker-compose >/dev/null 2>&1 || { echo "  ERROR: compose 不可用, 请手动安装"; exit 1; }
fi

# ── 1. 腾讯云 docker 镜像加速 (国内拉 caddy 镜像更快; 失败可忽略) ────
say "[1/5] 配置 docker 镜像加速 (腾讯云内网)..."
sudo mkdir -p /etc/docker
if ! sudo grep -q mirror.ccs.tencentyun.com /etc/docker/daemon.json 2>/dev/null; then
  if [ -f /etc/docker/daemon.json ]; then
    sudo python3 - <<'PY' 2>/dev/null || true
import json,os
p='/etc/docker/daemon.json'
d=json.load(open(p))
d.setdefault('registry-mirrors',[])
if 'https://mirror.ccs.tencentyun.com' not in d['registry-mirrors']:
    d['registry-mirrors'].insert(0,'https://mirror.ccs.tencentyun.com')
json.dump(d,open(p,'w'),indent=2)
PY
  else
    echo '{"registry-mirrors":["https://mirror.ccs.tencentyun.com"]}' | sudo tee /etc/docker/daemon.json >/dev/null
  fi
  sudo systemctl restart docker || true
fi

# ── 2. 构建分轨镜像 (权重已烘焙, 构建后运行时零下载) ───────────────
say "[2/5] 构建分轨镜像 (首次 5~10 分钟, 请耐心)..."
$COMPOSE build app

# ── 3. 启动 ─────────────────────────────────────────────────────────
say "[3/5] 启动服务..."
if [ -n "$DOMAIN" ]; then
  echo "  域名模式: https://$DOMAIN"
  DOMAIN="$DOMAIN" $COMPOSE up -d
else
  echo "  IP 模式:   http://<公网IP>:8000"
  $COMPOSE up -d app
fi

# ── 4. 等待就绪 ─────────────────────────────────────────────────────
say "[4/5] 等待模型就绪 (首次内存加载 htdemucs_6s 约 10~30s)..."
for i in $(seq 1 24); do
  sleep 5
  if curl -sf "http://127.0.0.1:8000/health" | grep -q '"model_ready":true'; then
    echo "  ✅ 模型就绪"
    break
  fi
  printf "  等待中 (%s/24)...\n" "$i"
done

# ── 5. 汇总访问地址 ─────────────────────────────────────────────────
say "[5/5] 部署完成"
PUB_IP=$(curl -sf --max-time 5 https://metadata.tencentyun.com/latest/meta-data/public-ipv4 2>/dev/null || curl -sf --max-time 5 ifconfig.me 2>/dev/null || echo "?")
if [ -n "$DOMAIN" ]; then
  echo "  App 分轨页服务器地址: https://$DOMAIN"
  echo "  健康检查:              curl https://$DOMAIN/health"
  echo "  提示: 若证书尚未签发, 等 1~2 分钟后重试 (Caddy 自动申请, 需域名已解析)"
else
  echo "  App 分轨页服务器地址: http://$PUB_IP:8000"
  echo "  健康检查:              curl http://$PUB_IP:8000/health"
  echo "  提示: 确认轻量控制台防火墙已放行 8000 端口"
fi
echo ""
echo "  常用命令: 查看日志 $COMPOSE logs -f app  重启 $COMPOSE restart app"
