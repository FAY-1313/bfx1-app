#!/usr/bin/env bash
# ============================================================================
# build_ios.sh —— 在 macOS（云 Mac / 本地 Mac）上一次完成 iOS 出包
#
# 用法（在 01_app 目录下执行）：
#   bash scripts/build_ios.sh <TEAM_ID> <PROFILE_NAME> [--upload <KEY_ID> <ISSUER_ID>]
#
# 例：
#   bash scripts/build_ios.sh ABCD123456 "BFX1 AppStore" --upload KEY12345678 \
#        11111111-2222-3333-4444-555555555555
#
# 依赖（一次性，在 App Store Connect / 开发者后台准备）：
#   · Apple Distribution 证书（.p12 装进钥匙串）
#   · App Store 分发用 Provisioning Profile（名称 = 第二个参数）
#   · 上传需要 App Store Connect API Key（.p8 放到 ~/.private_keys/）
#
# 产物：ios/App/build/App.ipa（同时保留 App.xcarchive 便于排查）
# ============================================================================
set -euo pipefail

TEAM="${1:?缺少 TEAM_ID（开发者团队 10 位 ID）}"
PROFILE="${2:?缺少 PROFILE_NAME（Provisioning Profile 名称，不是 UUID）}"
shift 2

UPLOAD_KEY=""
UPLOAD_ISSUER=""
if [ "${1:-}" = "--upload" ]; then
  UPLOAD_KEY="${2:?缺少 API Key ID}"
  UPLOAD_ISSUER="${3:?缺少 Issuer ID}"
fi

cd "$(dirname "$0")/.."

echo "▸ 1/6 安装依赖"
npm ci

echo "▸ 2/6 构建 Web 产物（dist/）"
npm run build

echo "▸ 3/6 同步到 iOS 工程（会刷新 public/ 与 SPM 插件列表）"
npx cap sync ios

echo "▸ 4/6 注入 iOS 必需 plist 键（BLE / 麦克风 / 后台 / ATS / 出口合规）"
bash scripts/patch_ios_plist.sh ios/App/App/Info.plist

echo "▸ 5/6 Archive（手动签名）"
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath ios/App/build/App.xcarchive \
  CODE_SIGN_STYLE=Manual \
  DEVELOPMENT_TEAM="$TEAM" \
  PROVISIONING_PROFILE_SPECIFIER="$PROFILE" \
  CODE_SIGN_IDENTITY="Apple Distribution" \
  clean archive

echo "▸ 6/6 导出 IPA"
mkdir -p ios/App/build
sed "s/YOUR_TEAM_ID/$TEAM/" scripts/exportOptions.plist > ios/App/build/exportOptions.plist
xcodebuild -exportArchive \
  -archivePath ios/App/build/App.xcarchive \
  -exportPath ios/App/build \
  -exportOptionsPlist ios/App/build/exportOptions.plist

echo "✓ 完成：ios/App/build/App.ipa"

if [ -n "$UPLOAD_KEY" ] && [ -n "$UPLOAD_ISSUER" ]; then
  echo "▸ 上传 TestFlight"
  xcrun altool --upload-app -f ios/App/build/App.ipa \
    --apiKey "$UPLOAD_KEY" --apiIssuer "$UPLOAD_ISSUER"
  echo "✓ 已上传；5–30 分钟后在 App Store Connect ▸ TestFlight 可见"
else
  echo "（未上传）可手动把 App.ipa 拖进 Transporter 应用，或补 --upload 参数"
fi
