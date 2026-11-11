# One-shot tool: generate v64 overdrive PEQ words using the project's real peqCodec.
# ASCII only (Windows PowerShell 5.1 reads .ps1 as system ANSI = GBK on this box;
# non-ASCII bytes get mangled -> "string missing terminator").
$ErrorActionPreference = 'Stop'
$esbuild = "$env:LOCALAPPDATA\bfx1-toolchain\esbuild\esbuild.exe"
$node = "C:\Users\FAY\.workbuddy\binaries\node\versions\22.22.2-6\node.exe"
# App root is auto-detected: <Downloads>/APK*/bfx1app/01_app
$cand = Get-ChildItem -LiteralPath (Join-Path $env:USERPROFILE 'Downloads') -Directory -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -like 'APK*' -and (Test-Path -LiteralPath (Join-Path $_.FullName 'bfx1app\01_app')) } |
        Select-Object -First 1
if (-not $cand) { throw 'APP_ROOT_NOT_FOUND' }
$root = Join-Path $cand.FullName 'bfx1app\01_app'

Set-Location -LiteralPath $root
& $esbuild tools/_gen_od_v64.ts --bundle --platform=node --format=esm --outfile=tmp_od_v64.mjs --log-level=warning
if ($LASTEXITCODE -ne 0) { throw "esbuild failed" }
& $node tmp_od_v64.mjs
$code = $LASTEXITCODE
Remove-Item tmp_od_v64.mjs -ErrorAction SilentlyContinue
if ($code -ne 0) { throw "generator failed with $code" }
Write-Output "GEN_OK root=$root"
