# BFX1 智能分轨 — 部署与联调清单

> 生成时间: 2026-09-02 · 服务代码: `cloud/stem-split-server/` · App: `src/components/StemSplitter.tsx`

## 一、当前状态 ✅

| 项目 | 状态 |
|---|---|
| 服务端本地端到端验证 (127.0.0.1:18000) | ✅ 通过 (14.8s / 6轨 ZIP) |
| 服务端局域网模式 (0.0.0.0:8000) | ✅ 运行中, 模型已预热 |
| 关键 bug 修复 (separate_audio_file 解包) | ✅ 已修复并实测 |
| Dockerfile 模型烘焙 + HF 镜像 | ✅ 已写入 |
| App 端服务器配置 + 连接测试 (v3.9 APK) | ✅ 已构建 |
| 云托管部署 | ⏳ 待控制台授权 tcbr |

## 二、需要管理员权限执行的命令 (Windows 防火墙 + 开机自启)

普通 PowerShell 无法添加规则/注册任务, 请以**管理员身份**打开 PowerShell 执行:

```powershell
# 1) 放行 8000 端口 (局域网手机访问)
New-NetFirewallRule -DisplayName "BFX1 StemSplit 8000" `
  -Direction Inbound -Protocol TCP -LocalPort 8000 `
  -Action Allow -Profile Private,Public

# 2) 注册开机自启任务 (登录后自动拉起分轨服务, 无需手动开服务器)
schtasks /Create /TN "BFX1-StemSplit-Server" `
  /TR "C:\Users\FAY\AndroidStudioProjects\bfv30001\temp\UI03\cloud\stem-split-server\start_lan_server.bat" `
  /SC ONSTART /RL HIGHEST /F
```

验证:

```powershell
Get-NetFirewallRule -DisplayName "BFX1 StemSplit 8000" | Format-List *
schtasks /Query /TN "BFX1-StemSplit-Server"
```

> 说明: 服务启动脚本为 `cloud/stem-split-server/start_lan_server.bat`
> (固定 PORT=8000, 0.0.0.0 监听)。若不想开机自启, 手动双击该 bat 即可。

## 三、云端部署 (等控制台开通云托管后)

### 1. 控制台操作 (需要用户手动)
- 打开 https://console.cloud.tencent.com/tcb/run 开通云托管
- 给 API 密钥追加 `QcloudTCBRFullAccess` 权限 (或临时用主账号密钥)

### 2. 执行部署脚本

```bash
# 从项目根目录执行 (脚本会自动读取 cloudbaserc.json 的 envId, 无需 -e 参数)
cd C:\Users\FAY\AndroidStudioProjects\bfv30001\temp\UI03
bash cloud/stem-split-server/deploy_cloudbase.sh
```

> **CLI 兼容性已核实 (3.8.1)**:
> - 旧命令 `tcb run deploy` 已标记 Deprecated 但仍可用, 且是唯一能传 cpu/mem/envParams 的命令 → 脚本保留它
> - 新命令 `tcb cloudrun deploy` 已移除资源规格参数 (规格只能控制台设) → 若旧命令将来失效, 用:
>   `tcb cloudrun deploy -s stem-split --source <server目录> --port 8000 --force`, 再到控制台设 2C4G/900s/DEMUCS_SEGMENT=8
> - 当前密钥报 `tcbr:DescribeCloudRunServers no permission` → 必须先在控制台授权 tcbr

### 3. 控制台调整
- 请求超时调到 **900s** (Demucs 6轨在 2C4G 上约 1-3 分钟/首)
- 确认拿到公网 HTTPS 访问地址 (形如 `https://stem-split-xxxx.ap-shanghai.run.tcloudbase.com`)

## 四、App 端切换服务器

### 临时 (不重打包)
- App 分轨页 → 「服务器」按钮 → 配置框填入公网 HTTPS 地址 → 连接测试

### 永久 (重打包)
- 修改 `src/components/StemSplitter.tsx` 中 `DEFAULT_SERVER`
- 重新构建:

```bash
cd C:\Users\FAY\AndroidStudioProjects\bfv30001\temp\UI03
npm run build
npx cap sync android
cd android && ./gradlew assembleDebug
```

## 五、联调验证步骤

1. 手机和电脑连同一 WiFi
2. App 分轨页 → 服务器 → 填 `http://192.168.1.213:8000` (局域网) 或公网 HTTPS (云端)
3. 连接测试应显示 ✅ (GET /health, 8s 超时)
4. 选一首歌 → 云端 6 轨模式 → 上传 → 等待 ZIP 返回 → 分轨可听

## 六、⚠️ APK 版本核对 (重要)

**v3.9 及更早 APK 内是旧代码**: 服务器地址硬编码 `192.168.1.100`、无「服务器」配置按钮、无连接测试。

判断 APK 新旧: 解包查主 chunk 内是否含 `192.168.1.213` 或 `testConn`:

```bash
unzip -l BFX1_v3.9_studio6.apk | grep index-   # 看 chunk 名
# 新构建的 chunk 应为 index-Cz1z1TPP.js (或更新的 hash)
```

**要装含服务器配置+连接测试的 APK, 必须重新构建**:

```bash
cd C:\Users\FAY\AndroidStudioProjects\bfv30001\temp\UI03
npm run build        # 产出最新 dist
npx cap sync android # 同步进 android 工程
cd android && ./gradlew assembleDebug
# 产物: android/app/build/outputs/apk/debug/app-debug.apk
```
