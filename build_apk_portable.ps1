# BFX1 portable APK build - ASCII ONLY (PS 5.1 reads non-BOM scripts as GBK)
#   Project path contains CJK characters -> resolved via wildcard, never hardcoded.
#   Toolchain lives outside Downloads (Downloads natives cannot read files: winapi #5).
#   Success marker: a line starting with APK_OK=
$ErrorActionPreference = 'Continue'

$parent = (Get-ChildItem 'C:\Users\FAY\Downloads' -Directory -Filter 'APK*' | Select-Object -First 1).FullName
if (-not $parent) { Write-Host 'FAIL: project parent not found'; exit 1 }
$App  = Join-Path $parent 'bfx1app\01_app'
$Out  = Join-Path $parent 'bfx1app\02_apk'
$tc   = Join-Path $env:LOCALAPPDATA 'bfx1-toolchain'

$env:JAVA_HOME           = (Get-ChildItem (Join-Path $tc 'jdk17') -Directory | Select-Object -First 1).FullName
$env:ANDROID_HOME        = Join-Path $tc 'sdk'
$env:ANDROID_SDK_ROOT    = $env:ANDROID_HOME
$env:GRADLE_USER_HOME    = Join-Path $parent 'bfx1app\tools\_android\gradle'
$env:ESBUILD_BINARY_PATH = Join-Path $tc 'esbuild\esbuild.exe'
$env:TEMP = Join-Path $App '_tmp'
$env:TMP  = $env:TEMP
New-Item -ItemType Directory -Force -Path $env:TEMP | Out-Null
$env:PATH = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:PATH"
$env:NODE_OPTIONS = '--max-old-space-size=8192'

$sdk = ($env:ANDROID_HOME -replace '\\','/')
[IO.File]::WriteAllText((Join-Path $App 'android\local.properties'), "sdk.dir=$sdk`n", [Text.UTF8Encoding]::new($false))

Write-Host "=== JAVA_HOME $env:JAVA_HOME"
Write-Host "=== SDK       $env:ANDROID_HOME"

$skipWeb = $args -contains '-SkipWebBuild'

if (-not $skipWeb) {
  Write-Host "`n=== 1/3 web build ==="
  Set-Location $App
  & npm.cmd run build
  if ($LASTEXITCODE -ne 0) { Write-Host 'FAIL: web build'; exit 1 }

  Write-Host "`n=== 2/3 cap sync ==="
  & npx.cmd cap sync android
  if ($LASTEXITCODE -ne 0) { Write-Host 'FAIL: cap sync'; exit 1 }
}

Write-Host "`n=== 3/3 gradle assembleDebug ==="
Set-Location (Join-Path $App 'android')
$gradle = Join-Path $parent 'bfx1app\tools\_android\gradle-8.14.3\bin\gradle.bat'
$log = Join-Path $env:TEMP 'build_apk.log'
& $gradle assembleDebug --no-daemon --console=plain 2>&1 | Tee-Object -FilePath $log | Select-Object -Last 12
if ($LASTEXITCODE -ne 0) {
  Write-Host 'FAIL: gradle'
  Get-Content $log -Tail 25
  exit 1
}

$apk = Get-ChildItem (Join-Path $App 'android\app\build\outputs\apk') -Recurse -Filter '*.apk' -EA SilentlyContinue |
       Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $apk) { Write-Host 'FAIL: apk not found'; exit 1 }

$stamp = Get-Date -Format 'yyyyMMdd'
$dest = Join-Path $Out ("app-debug-$stamp-v4.27-ios-ble-fix.apk")
Copy-Item $apk.FullName $dest -Force
$md5 = (Get-FileHash $dest -Algorithm MD5).Hash.ToLower()
Write-Host ""
Write-Host ("APK_OK={0}" -f $dest)
Write-Host ("APK_SIZE_MB={0:N1}" -f ($apk.Length/1MB))
Write-Host ("APK_MD5={0}" -f $md5)
