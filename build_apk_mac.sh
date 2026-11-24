#!/bin/bash
# BFX1 Mac 一键构建：./build_apk_mac.sh [debug|release|all]   （默认 all）
# 依赖 ~/dev-tools/env.sh（Node 22 + JDK 21 + Android SDK）
set -euo pipefail
source "$HOME/dev-tools/env.sh"
cd "$(dirname "$0")"
MODE="${1:-all}"
case "$MODE" in
  debug)   TASKS="assembleDebug" ;;
  release) TASKS="assembleRelease" ;;
  *)       TASKS="assembleDebug assembleRelease" ;;
esac
[ -d node_modules ] || npm ci --no-audit --no-fund
npm run build
npx cap sync android
(cd android && ./gradlew $TASKS --console=plain)
ls -la android/app/build/outputs/apk/*/*.apk
