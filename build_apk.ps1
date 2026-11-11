# BFX1 APK 一键构建脚本
# 用法:  pwsh -File build_apk.ps1
#
# 本脚本已包含 2026-10-03 踩过的全部坑的规避：
#   1. esbuild 删不掉系统 TEMP  →  TEMP 指向工程内 _tmp/
#   2. Gradle wrapper 下载卡死   →  用预解压的 Gradle，不走 wrapper
#   3. GitHub/Gradle 官方源慢    →  JDK 用清华镜像、Gradle 用腾讯镜像
#   4. sdkmanager 拉不到 manifest →  组件手动下载 zip 解压
#   5. 路径含中文（APK开发）      →  android.overridePathCheck=true
#   6. ~/.android 不存在          →  脚本自动创建 + 预生成 debug.keystore
#   7. 编译目标 SDK 36            →  已装 platforms/android-36
#   8. Maven 依赖慢               →  build.gradle 已加阿里云镜像

$ErrorActionPreference = 'Continue'

$App = 'C:\Users\FAY\Downloads\APK开发\bfx1app\01_app'
$AND = 'C:\Users\FAY\Downloads\APK开发\bfx1app\tools\_android'

# ── ① 工具链定位 ──
$jdk = Get-ChildItem "$AND\jdk17" -Directory -EA SilentlyContinue | Select-Object -First 1
if (-not $jdk) { Write-Host "  ✗ 未找到 JDK" -ForegroundColor Red; exit 1 }
$env:JAVA_HOME        = $jdk.FullName
$env:ANDROID_HOME     = "$AND\sdk"
$env:ANDROID_SDK_ROOT = "$AND\sdk"
$env:PATH             = "$env:JAVA_HOME\bin;$AND\sdk\platform-tools;$env:PATH"
$env:GRADLE_USER_HOME = "$AND\gradle"

# ★ 必须用系统 TEMP 的替代（esbuild 坑）
$env:TEMP = "$App\_tmp"; $env:TMP = "$App\_tmp"
New-Item -ItemType Directory -Force -Path $env:TEMP | Out-Null

# ★ 不要设 ANDROID_USER_HOME（会让 AGP 的 AndroidLocationsBuildService 失败）
Remove-Item Env:\ANDROID_USER_HOME -EA SilentlyContinue
Remove-Item Env:\ANDROID_SDK_HOME  -EA SilentlyContinue
Remove-Item Env:\ANDROID_PREFS_ROOT -EA SilentlyContinue

# ── ② 确保 ~/.android 与 debug.keystore 存在 ──
$da = "$env:USERPROFILE\.android"
New-Item -ItemType Directory -Force -Path $da, "$da\avd", "$da\cache" | Out-Null
if (-not (Test-Path "$da\debug.keystore")) {
    Write-Host "  生成 debug.keystore ..." -ForegroundColor Yellow
    & "$env:JAVA_HOME\bin\keytool.exe" -genkeypair -v `
        -keystore "$da\debug.keystore" -storepass android -keypass android `
        -alias androiddebugkey -keyalg RSA -keysize 2048 -validity 10000 `
        -dname "CN=Android Debug,O=Android,C=US" 2>&1 | Out-Null
}
Get-ChildItem $da -Filter '*.lock' -Force -EA SilentlyContinue | Remove-Item -Force -EA SilentlyContinue

# ── ③ local.properties 指向真实 SDK ──
$sdkDir = $env:ANDROID_HOME -replace '\\','/'
[IO.File]::WriteAllText("$App\android\local.properties", "sdk.dir=$sdkDir`n", [Text.UTF8Encoding]::new($false))

Write-Host "═══ 工具链 ═══" -ForegroundColor Cyan
Write-Host "  JAVA_HOME    = $env:JAVA_HOME"
Write-Host "  ANDROID_HOME = $env:ANDROID_HOME"
Write-Host "  TEMP         = $env:TEMP"

# ── ④ Web 构建 ──
Write-Host "`n═══ ① Web 构建 ═══" -ForegroundColor Cyan
Set-Location $App
$env:NODE_OPTIONS = "--max-old-space-size=8192"
& npm run build
if ($LASTEXITCODE -ne 0) { Write-Host "  ✗ Web 构建失败" -ForegroundColor Red; exit 1 }
Write-Host "  ✓ dist/ 已生成" -ForegroundColor Green

# ── ⑤ cap sync ──
Write-Host "`n═══ ② npx cap sync android ═══" -ForegroundColor Cyan
& npx cap sync android
if ($LASTEXITCODE -ne 0) { Write-Host "  ✗ cap sync 失败" -ForegroundColor Red; exit 1 }

# ── ⑥ Gradle 构建 ──
Write-Host "`n═══ ③ gradle assembleDebug ═══" -ForegroundColor Cyan
Set-Location "$App\android"
$g = "$AND\gradle-8.14.3\bin\gradle.bat"
$log = "$App\_tmp\build_apk.log"
& $g assembleDebug --no-daemon --console=plain 2>&1 | Tee-Object -FilePath $log | Select-Object -Last 20
if ($LASTEXITCODE -ne 0) {
    Write-Host "  ✗ Gradle 构建失败，日志: $log" -ForegroundColor Red
    Get-Content $log -Tail 20
    exit 1
}

# ── ⑦ 产物 ──
Write-Host "`n═══ ④ 产物 ═══" -ForegroundColor Cyan
$apk = Get-ChildItem "$App\android\app\build\outputs\apk" -Recurse -Filter '*.apk' -EA SilentlyContinue |
       Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($apk) {
    $dest = "$App\..\..\BFX1-debug.apk"
    Copy-Item $apk.FullName $dest -Force -EA SilentlyContinue
    Write-Host ("  ✓ {0}" -f $apk.FullName) -ForegroundColor Green
    Write-Host ("     {0:N1} MB   {1}" -f ($apk.Length/1MB), $apk.LastWriteTime)
    Write-Host ("  已复制到: {0}" -f (Resolve-Path $dest -EA SilentlyContinue)) -ForegroundColor Green
} else {
    Write-Host "  ✗ 未找到 APK" -ForegroundColor Red
    exit 1
}
