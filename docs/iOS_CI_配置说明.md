# BFX1 iOS 云端 CI 出包 · 配置说明（TestFlight 内部测试）

> 目标：用 **GitHub Actions（macos-latest）** 自动构建 iOS IPA 并上传 **TestFlight**。
> 代码（React19 + TS + Vite）与 Android 完全复用，只换 Capacitor iOS 原生壳。
> 本文不依赖本地 Mac，全部在云端完成；最后给一份「本地 Mac 等价步骤」备用。

---

## 一、整体链路

```
push ios-ci 分支 / 手动 Run workflow
        │
        ▼
GitHub Actions (macos-latest, 自带 Xcode)
   1. npm ci            → 装依赖
   2. npm run build     → 产出 dist/ (webDir)
   3. npx cap sync ios  → 生成/刷新 iOS 原生工程
   4. patch_ios_plist.sh→ 注入 BLE / 麦克风 / 后台 / ATS 权限（cap sync 会重置 plist）
   5. 导入证书+profile  → 解锁 keychain、install mobileprovision
   6. xcodebuild archive→ 出 .xcarchive
   7. xcodebuild -exportArchive → 出 App.ipa
   8. xcrun altool --upload-app → 进 TestFlight
```

---

## 二、前置条件（一次性准备）

| 项目 | 说明 |
|---|---|
| Apple 开发者账号（$99/年） | TestFlight 内部测试必需 |
| App Store Connect API Key | 用于 `altool` 上传。后台 ▸ Users ▸ Keys ▸ 生成 `.p8`，记录 **Key ID** 与 **Issuer ID** |
| iPhone Distribution 证书 | 开发者后台 ▸ Certificates ▸ Apple Distribution，导出 `.p12` 并记密码 |
| App Store 分发 Provisioning Profile | 后台 ▸ Profiles ▸ App Store，绑定 App ID `com.bfx1.processor` 与上面证书 |

> App ID `com.bfx1.processor`、App Name `BFX1` 来自 `capacitor.config.ts`，不要改。

---

## 三、GitHub Secrets 配置（仓库 ▸ Settings ▸ Secrets）

| Secret 名 | 内容 |
|---|---|
| `IOS_CERT_P12` | Distribution 证书 `.p12` 的 **base64**（命令行：`base64 -i cert.p12`） |
| `IOS_CERT_PASSWORD` | 该 p12 的导出密码 |
| `IOS_PROVISIONING_PROFILE` | `.mobileprovision` 的 **base64** |
| `IOS_PROFILE_NAME` | Provisioning Profile 的 **名称**（不是 UUID），`xcodebuild` 用 specifier 匹配 |
| `APPLE_TEAM_ID` | 开发者团队 10 位 ID |
| `APPSTORE_KEY_ID` | API Key 的 Key ID（如 `ABCDEFGHIJ`） |
| `APPSTORE_ISSUER_ID` | API Key 的 Issuer ID（UUID） |
| `APPSTORE_API_KEY_P8` | `.p8` 文件的 **base64** |
| `KEYCHAIN_PASSWORD` | CI 临时 keychain 密码（随便设个强随机值） |

---

## 四、触发与查看

- **手动**：Actions 页 ▸ `iOS CI (TestFlight)` ▸ Run workflow
- **自动**：`git push origin ios-ci`
- 构建完：TestFlight 里出现新构建 → 选版本 → 加内部测试员 → 发邀请
- 失败排查：Actions 日志；产物 `BFX1-iOS-IPA`（即使上传失败也会保留 IPA 供下载）

---

## 五、本地 Mac 等价步骤（无 CI / 调试用）

```bash
npm ci
npm run build
npx cap sync ios
bash scripts/patch_ios_plist.sh ios/App/App/Info.plist   # ★ 必须，否则权限丢失
npx cap open ios                  # 打开 Xcode
# Xcode：Signing & Capabilities 选 Team + 自动/手动签名
# Product ▸ Archive ▸ Distribute App ▸ App Store Connect ▸ 上传 TestFlight
```

---

## 六、已知坑（必读）

1. **`cap sync ios` 会重置 Info.plist** — 所以 BLE/麦克风/后台/ATS 全靠 `patch_ios_plist.sh`，**不要手改后指望 sync 保留**。
2. **麦克风权限缺失会崩** — `LooperPanel.tsx:319` 用 `getUserMedia({audio:true})`，无 `NSMicrophoneUsageDescription` 真机直接报错/崩溃。
3. **ATS 明文 HTTP** — 音频服务 `124.223.119.201:8000` 是明文，靠 `NSAllowsArbitraryLoads` 放行；**上架前必须收紧**（改 `NSExceptionDomains` 或切 HTTPS），否则 App Review 拒。
4. **BLE 模拟器不支持** — CI 出包是真机 IPA 没问题；但本地若用模拟器调试蓝牙，连不上设备，必须用真机。
5. **Safe Area** — iOS 有刘海/灵动岛 + 底部 Home 指示条（~34pt），首页底栏固定 59px 需加 `env(safe-area-inset-bottom)` 适配，否则被挡。
6. **altool 弃用风险** — 若未来 Xcode 移除 `xcrun altool`，workflow 注释里给了 `fastlane pilot` 备选。
7. **`androidScheme: 'http'` 不影响 iOS** — Capacitor 对 iOS 默认 `capacitor://localhost`，该字段仅 Android 用。
8. **onnxruntime-web (WASM)** — WKWebView 一般可用，但需确认 WASM 流式编译不被 ATS/跨域拦截；首次真机建议重点验证音色模型加载。

---

## 七、本次已落地的文件

| 文件 | 作用 |
|---|---|
| `ios/App/App/Info.plist` | 已补 `NSMicrophoneUsageDescription`（源文件，sync 后会由脚本再覆盖补齐） |
| `scripts/patch_ios_plist.sh` | sync 后注入 iOS 必需键（单一真相，CI + 本地通用） |
| `scripts/exportOptions.plist` | `xcodebuild -exportArchive` 用，`method=app-store` |
| `.github/workflows/ios.yml` | 完整 CI：sync → patch → 签名 → archive → 上传 TestFlight |
