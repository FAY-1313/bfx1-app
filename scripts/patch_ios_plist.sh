#!/usr/bin/env bash
# ============================================================================
# patch_ios_plist.sh — iOS Info.plist 必需键注入
#
# ★ 为什么需要它：
#   `npx cap sync ios` 会**重置** ios/App/App/Info.plist 为 Capacitor 模板，
#   模板里不含 BLE 权限 / 麦克风权限 / 后台模式 / ATS 放行。
#   所以这些键不能只手改 Info.plist，必须在每次 sync **之后**用本脚本补齐。
#   本脚本是这些 iOS 键的「单一真相」，CI 和本地 Mac 通用。
#
# 用法：
#   bash scripts/patch_ios_plist.sh [path/to/Info.plist]
#   默认：ios/App/App/Info.plist
# ============================================================================
set -euo pipefail

PLIST="${1:-ios/App/App/Info.plist}"
PB="/usr/libexec/PlistBuddy"

if [ ! -f "$PLIST" ]; then
  echo "✗ plist not found: $PLIST"
  echo "  先运行: npx cap sync ios"
  exit 1
fi

# 幂等 set：先删（忽略错误）再添加
set_key() { # <type> <key> <value>
  "$PB" -c "Delete $2" "$PLIST" 2>/dev/null || true
  "$PB" -c "Add $2 $1 $3" "$PLIST"
}

echo "▸ patching $PLIST"

# --- 麦克风（LooperPanel:319 getUserMedia({audio:true}) 必需）---
set_key string :NSMicrophoneUsageDescription \
  "BFX1 需要麦克风用于循环录音（Looper）与音色试听录制。"

# --- 蓝牙权限（BLE 连接 BFX-1 必需）---
set_key string :NSBluetoothAlwaysUsageDescription \
  "BFX1 需要通过蓝牙连接你的 BFX-1 效果器，用来发送与读取音色参数。"
set_key string :NSBluetoothPeripheralUsageDescription \
  "BFX1 需要通过蓝牙连接你的 BFX-1 效果器。"

# --- 后台保持 BLE 连接（对应安卓「保持后台运行」）---
"$PB" -c "Delete :UIBackgroundModes" "$PLIST" 2>/dev/null || true
"$PB" -c "Add :UIBackgroundModes array" "$PLIST"
"$PB" -c "Add :UIBackgroundModes:0 string bluetooth-central" "$PLIST"

# --- 出口合规：不含非豁免加密 → 免去每次上传的加密问答 ---
set_key bool :ITSAppUsesNonExemptEncryption false

# --- ATS 放行明文 HTTP（测试期音频服务 124.223.119.201:8000；上架前收紧）---
"$PB" -c "Delete :NSAppTransportSecurity" "$PLIST" 2>/dev/null || true
"$PB" -c "Add :NSAppTransportSecurity dict" "$PLIST"
"$PB" -c "Add :NSAppTransportSecurity:NSAllowsArbitraryLoads bool true" "$PLIST"

echo "✓ done: $PLIST"
