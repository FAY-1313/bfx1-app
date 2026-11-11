# BFX1 APK 构建说明

> 版本 2026-10-03 · 已实测通过
> 产物：`C:\Users\FAY\Downloads\APK开发\BFX1-debug.apk`（123.0 MB）
>
> **2026-10-12 更新**：项目移入 Downloads 后原生程序被系统拦截，一键脚本
> 在本机已不可用 —— 必须改用第十节的外部工具链流程（已实测出包成功）。

---

# 一 · 一键构建

```powershell
pwsh -File "C:\Users\FAY\Downloads\APK开发\bfx1app\01_app\build_apk.ps1"
```

脚本自动完成：工具链定位 → Web 构建 → cap sync → Gradle 构建 → 复制产物。
**所有已知坑的规避都已内置**（见第四节）。

---

# 二 · 工具链（已装好，3.16 GB）

**位置**：`bfx1app/tools/_android/`

| 组件 | 版本 | 路径 |
|---|---|---|
| **JDK** | Temurin **17.0.20.1+1** | `_android/jdk17/jdk-17.0.20.1+1/` |
| **Gradle** | **8.14.3** | `_android/gradle-8.14.3/` |
| **Android SDK** | — | `_android/sdk/` |
| ├ platform-tools | latest | `sdk/platform-tools/` |
| ├ build-tools | **35.0.0** | `sdk/build-tools/35.0.0/` |
| ├ platforms | **android-35 + android-36** | `sdk/platforms/` |
| └ cmdline-tools | 11076708 | `sdk/cmdline-tools/latest/` |
| **Gradle 缓存** | 依赖 | `_android/gradle/` |

## 环境变量（已持久化到用户级）

```
JAVA_HOME        = ...\_android\jdk17\jdk-17.0.20.1+1
ANDROID_HOME     = ...\_android\sdk
ANDROID_SDK_ROOT = ...\_android\sdk
```

## ⚠️ 不要设 `ANDROID_USER_HOME`

设了会让 AGP 的 `AndroidLocationsBuildService` 初始化失败：

```
Could not create provider for value source AndroidLocationsBuildService.AndroidDirectoryCreator
```

**用默认的 `C:\Users\FAY\.android` 即可。**

---

# 三 · 手工构建步骤

```powershell
# ── 环境 ──
$AND = 'C:\Users\FAY\Downloads\APK开发\bfx1app\tools\_android'
$R   = 'C:\Users\FAY\Downloads\APK开发\bfx1app\01_app'
$jdk = (Get-ChildItem "$AND\jdk17" -Directory | Select-Object -First 1).FullName
$env:JAVA_HOME = $jdk
$env:ANDROID_HOME = "$AND\sdk"
$env:ANDROID_SDK_ROOT = "$AND\sdk"
$env:GRADLE_USER_HOME = "$AND\gradle"
$env:PATH = "$jdk\bin;$AND\sdk\platform-tools;$env:PATH"

# ★ 关键：TEMP 指向工程内（避免 esbuild 临时文件权限问题）
$env:TEMP = "$R\_tmp"; $env:TMP = "$R\_tmp"
New-Item -ItemType Directory -Force -Path $env:TEMP | Out-Null

# ── ① Web 构建 ──
Set-Location $R
$env:NODE_OPTIONS = "--max-old-space-size=8192"
npm run build

# ── ② 同步到 Android ──
npx cap sync android

# ── ③ Gradle 构建（★ 不用 wrapper，用解压版）──
Set-Location "$R\android"
& "$AND\gradle-8.14.3\bin\gradle.bat" assembleDebug --no-daemon --console=plain

# ── ④ 产物 ──
# android\app\build\outputs\apk\debug\app-debug.apk
```

**耗时**：首次 ~3 分钟（含依赖下载），增量 ~1.5 分钟

---

# 四 · ⚠️ 已踩的 8 个坑（全部已解）

| # | 症状 | 根因 | 解法 |
|---|---|---|---|
| **1** | GitHub 下 JDK **卡死在 0 MB** | 国内访问 GitHub Releases 极慢 | 换**清华 Adoptium 镜像**<br>`https://mirrors.tuna.tsinghua.edu.cn/Adoptium/17/jdk/x64/windows/`<br>→ 182 MB / **17 秒** |
| **2** | `sdkmanager` **拉不到 manifest**<br>`IO exception while downloading manifest` | sdkmanager 的 Java HTTP 客户端问题（URL 本身用 `Invoke-WebRequest` 是通的） | **手动下载 3 个 zip** 解压：<br>`platform-tools-latest-windows.zip`<br>`build-tools_r35_windows.zip`<br>`platform-36_r02.zip` |
| **3** | Gradle wrapper **下载卡死** | 同上，Java HTTP 客户端 | **预下 Gradle zip** 解压后**直接跑 `gradle.bat`**，绕过 wrapper |
| **4** | Gradle 官方源 **2.4 秒延迟** | services.gradle.org 国内慢 | 换**腾讯镜像**<br>`https://mirrors.cloud.tencent.com/gradle/`<br>→ 10.9 MB/s |
| **5** | Maven 依赖慢 | google()/mavenCentral() 国内慢 | `android/build.gradle` 加**阿里云镜像**（放最前） |
| **6** | ⭐ esbuild **`Access is denied`**<br>删不掉系统临时文件 | 系统 TEMP 目录权限 | **`TEMP`/`TMP` 指向工程内 `_tmp/`** |
| **7** | ⭐ **AGP 拒绝构建**<br>`Your project path contains non-ASCII characters` | 路径含中文 `APK开发` | `android/gradle.properties` 加<br>**`android.overridePathCheck=true`** |
| **8** | ⭐ `~/.android` 不存在 + **keystore 锁权限**<br>`AccessDeniedException: debug.keystore.lock` | 首次构建该目录没建 | **手动建目录 + `keytool` 预生成 keystore** |

**另有两个小坑**：
- `build-tools_r35_windows.zip` 解压后顶层目录叫 **`android-15`**（不是 35）→ 需重命名到 `build-tools/35.0.0`
- `gradle-wrapper.properties` 的 `validateDistributionUrl` 会被正则误改（PowerShell `-replace` 默认大小写不敏感）→ 换镜像时要用 `(?i)` 之外的精确匹配，或整文件重写

---

# 五 · 本次已改的文件

## 5.1 后端修复

| 文件 | 改动 |
|---|---|
| **`src/data/passThrough.ts`** | 白名单加 `7`/`57`/`58`/`67`/`72`/`73`/`82`；`[108,142]` → `[107,142]`；`CANCELLED_*` 同步收缩 |
| **`src/services/presetEngine.ts`** | ①箱头段加**强制写 0** 循环（`57/58/67/72/73/82`）②修两处跳过往逻辑（`:281` / `:311`） |

## 5.2 调试模式

| 文件 | 改动 |
|---|---|
| **`src/pages/Index.tsx`** | 导入 `BugIcon`；顶栏右集群加**甲虫图标按钮**（切换 `debugMode`，保留原「点 logo 5 次」入口） |

## 5.3 新 UI（`src/ui2/`，6 个文件）

| 文件 | 大小 | 内容 |
|---|---|---|
| `registers.ts` | 5.7 KB | 旋钮规格（reg/min/max/step/def/fmt）+ 模块开关表 + 箱头 6 位 + 三模式映射 |
| `Knob.tsx` | 3.8 KB | 拖动改值 + **步进量化** + 标签 + 实时数值 + 锁定态 |
| `PedalShell.tsx` | 2.5 KB | 单块外壳（**内容撑开，旋钮不溢出**） |
| `panels.tsx` | 10.3 KB | **8 个面板**（噪声门/压缩/过载/箱头/箱体/合唱/延迟/混响） |
| `TonePage.tsx` | 9.7 KB | 音色页（工具行 + 1:1 图 + 面板 + 链路 Dock） |
| `index.ts` | 0.5 KB | 出口 |

## 5.4 接线

`Index.tsx`：
```tsx
const [useNewToneUI, setUseNewToneUI] = useState(true);   // ★ 默认开；置 false 回退旧 UI

{useNewToneUI ? (
  <TonePage
    onParam={(reg, value) => {
      if (reg === 'PGA') bleManager.writePGA(value).catch(()=>{});
      else bleManager.writeRegister(reg, value, 0xEA).catch(()=>{});
      addDebugLog(...); setDebugRegTick(t => t + 1);
    }}
    onBypass={(modId, on) => {
      const spec = MODULE_ON_OFF[modId];
      bleManager.writeRegister(spec.reg, on ? spec.on : spec.off, 0xEA).catch(()=>{});
    }}
  />
) : (
  <PedalPanel ... />   {/* 旧 UI 保留 */}
)}
```

**BLE 完全沿用既有 `bleManager`** —— 只换 UI 层。

---

# 六 · 构建配置改动

| 文件 | 改动 |
|---|---|
| `android/build.gradle` | 加 3 个阿里云 Maven 镜像（buildscript + allprojects） |
| `android/gradle.properties` | 重写：UTF-8 编码、4G 堆、`overridePathCheck=true`、关 Jetifier |
| `android/gradle/wrapper/gradle-wrapper.properties` | `distributionUrl` → 腾讯镜像 |
| `android/local.properties` | `sdk.dir` → 实际 SDK 路径 |

---

# 七 · 产物验证

```
包名     com.bfx1.processor
版本     3.7 (versionCode 37)
大小     123.0 MB (128,933,791 bytes)
编译     compileSdk 36 / targetSdk 36 / minSdk 24
签名     CN=Android Debug, O=Android, C=US  ✓
SHA256   EC85F63DB818586217B3044A63AE8D2D5FF878325065D5ADC853D1105327A205
权限     BLUETOOTH / SCAN / CONNECT / ADVERTISE  ✓
```

**APK 内 JS bundle**：`assets/public/assets/index-CoXEPk91.js`（2,193 KB）
= 与 `dist/` 构建产物**完全一致** ✓

**新 UI 标记检查（APK 内）**：
```
CABINET      1 次   ✓
HIGH-GAIN    4 次   ✓
PRE-DLY      1 次   ✓
箱体型号      1 次   ✓
```

---

# 八 · 安装测试

```powershell
# 手机开 USB 调试后：
& "C:\Users\FAY\Downloads\APK开发\bfx1app\tools\_android\sdk\platform-tools\adb.exe" install -r "C:\Users\FAY\Downloads\APK开发\BFX1-debug.apk"
```

或把 APK 拷进手机点击安装（需允许「未知来源」）。

---

# 九 · 已知限制（本版）

| # | 项 | 说明 |
|---|---|---|
| 1 | **新 UI 只做了音色页** | 预设库 / 演奏 / 连接 三页仍是旧 UI |
| 2 | **型号/预设是循环切换** | 点按钮循环切，还没接带缩略图的弹窗 |
| 3 | **箱体两级弹窗未接** | 目前只有「选箱体」按钮占位 |
| 4 | **旋钮用 CSS 绘制** | 未接 KnobMan 切图 |
| 5 | **箱头/箱体照片共用一张** | Marshall JCM800 + Orange（通用预览） |

---

# 十 · ⚠️ 2026-10-12：Downloads 目录原生程序封锁（必读）

## 10.1 现象

项目在 `C:\Users\FAY\Downloads\APK开发` 下构建时：

```
X [ERROR] Cannot read file "package.json": winapi error #5
```

`npm run build`（vite→esbuild）与 gradle（java）全部失败；
但 node / python / powershell / git 读写同一目录完全正常。

## 10.2 根因

**Downloads 目录下的原生可执行文件（esbuild.exe、java.exe）读不了文件**
（Downloads 文件带 Low 完整性标签，系统对"从 Downloads 运行的程序"限制文件访问）。
实验实锤：把 esbuild.exe / java.exe 复制到 Downloads 外立即正常；
10-10 能出包是因为当时项目还在 Downloads 外的位置，之后被移入 Downloads。

> 判定方法：`.\node_modules\@esbuild\win32-x64\esbuild.exe vite.config.ts --bundle ...`
> 若报 `winapi error #5` 即命中此坑。

## 10.3 解法：外部工具链（已建好，2026-10-12 实测出包成功）

工具链已复制到 Downloads 外（约 800 MB）：

```
C:\Users\FAY\AppData\Local\bfx1-toolchain\
├── jdk17\jdk-17.0.20.1+1\     # JDK
├── sdk\                       # Android SDK（platform-35/36、build-tools 35.0.0、platform-tools）
└── esbuild\esbuild.exe        # 供 Web 构建（ESBUILD_BINARY_PATH）
```

Gradle 发行版（`tools\_android\gradle-8.14.3`）与依赖缓存
（`tools\_android\gradle`，2.3 GB）**留在原处即可** —— Downloads 内的
*文件*被外部 java 读写正常，被卡的只是*位于* Downloads 的程序。

**构建流程**（在 PowerShell 里执行；`build_apk.ps1` 暂不适用，见 10.4）：

```powershell
$App = 'C:\Users\FAY\Downloads\APK开发\bfx1app\01_app'
$tc  = 'C:\Users\FAY\AppData\Local\bfx1-toolchain'
$env:JAVA_HOME        = "$tc\jdk17\jdk-17.0.20.1+1"
$env:ANDROID_HOME     = "$tc\sdk"; $env:ANDROID_SDK_ROOT = "$tc\sdk"
$env:GRADLE_USER_HOME = 'C:\Users\FAY\Downloads\APK开发\bfx1app\tools\_android\gradle'
$env:ESBUILD_BINARY_PATH = "$tc\esbuild\esbuild.exe"      # ★ Web 构建关键
$env:TEMP = "$App\_tmp"; $env:TMP = $env:TEMP             # ★ esbuild 临时文件坑
$env:PATH = "$env:JAVA_HOME\bin;$tc\sdk\platform-tools;$env:PATH"
[IO.File]::WriteAllText("$App\android\local.properties",
  "sdk.dir=$($tc -replace '\\','/')/sdk`n", [Text.UTF8Encoding]::new($false))

# ① Web 构建（含 tsc 检查）
Set-Location $App; $env:NODE_OPTIONS = '--max-old-space-size=8192'; npm run build
# ② 同步
npx cap sync android
# ③ Gradle（★ 用解压版，不走 wrapper）
Set-Location "$App\android"
& 'C:\Users\FAY\Downloads\APK开发\bfx1app\tools\_android\gradle-8.14.3\bin\gradle.bat' assembleDebug --no-daemon --console=plain
# ④ 产物：android\app\build\outputs\apk\debug\app-debug.apk
```

**另注意**：`build_apk.ps1` 已补 UTF-8 BOM —— 本机没有 `pwsh`（7.0），
用 PowerShell 5.1 跑无 BOM 的脚本会把中文路径按 ANSI 读成乱码（"未找到 JDK"）。

## 10.4 长期建议

根本解法是把工程移出 Downloads（如 `D:\bfx1app`，CODEBUDDY.md 里的原始位置），
之后 `build_apk.ps1` 一键流程即可恢复。
