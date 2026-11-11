# BFX-1 分轨服务 · 腾讯云轻量应用服务器部署指南（选项 2）

> 适用于：CloudBase 个人版到期后，把 Demucs 分轨服务迁移到自购轻量服务器。
> 配套文件：`Dockerfile`（已有，模型已烘焙）、`docker-compose.yml`、`Caddyfile`、`deploy_lighthouse.sh`。
> 整个流程约 30 分钟（含首次镜像构建 5~10 分钟）。

---

## 一、购买轻量服务器（约 5 分钟）

1. 打开购买页：<https://console.cloud.tencent.com/lighthouse/instance/create>
2. 参数选择：
   | 项 | 建议 |
   |---|---|
   | 地域 | **上海**（离你最近；广州/北京也行） |
   | 套餐 | **通用型 2核4G**（6Mbps 峰值、60GB SSD、**1TB 月流量**）— 活动价约 **¥159~199/年**，日常价 ¥75~80/月 |
   | 镜像 | 首选「使用应用模板 → **Docker CE**」——官方确认底层 Ubuntu 24.04 LTS、预装 docker、**默认已配腾讯云镜像加速源**，部署脚本可跳过安装步骤直接构建；页面找不到时退而选「基于操作系统镜像 → **Ubuntu 24.04 LTS**」（脚本会自动 apt 装 docker + compose）。⚠️ 勿选 CentOS/OpenCloudOS/Rocky（脚本用 apt，RHEL 系会失败）、勿选宝塔等网站镜像、勿选「使用容器镜像」创建方式（容器实例形态，不适用本部署包） |
   | 时长 | 1 年（享受活动折扣） |
3. 确认购买。记下**公网 IP** 和初始密码（腾讯云控制台会发站内信/短信）。
4. 活动价入口找不到时，可在购买页找「轻量上新特惠」或联系客服要活动链接；**续费同价**的套餐优先。

> 内存提示：htdemucs_6s 在 2C4G 上跑整首歌（3~5 分钟）内存够用——compose 已设 `DEMUCS_SEGMENT=8` 分段推理控制峰值。

## 二、控制台防火墙放行（约 2 分钟）

轻量服务器自带防火墙（独立于系统），默认**只放行 22**。到：
**控制台 → 轻量应用服务器 → 你的实例 → 防火墙 → 添加规则**

- **有域名（推荐）**：放行 `80`（HTTP，用于自动签证书）、`443`（HTTPS）
- **无域名**：放行 `8000`（直接 http 访问分轨服务）
- 两者都要：都放行

## 三、域名解析（可选，但有域名体验最好）

在域名服务商（腾讯云 DNSPod / 阿里云 / 其他）加一条 **A 记录**：

```
主机记录: split（或你喜欢的子域名）   记录值: <你的公网IP>
```

之后 App 用 `https://split.你的域名.com`，自动 HTTPS，无需任何证书操作。

## 四、上传代码到服务器（Windows 本机执行）

用 Windows 自带的 scp（PowerShell / CMD 均可）：

```powershell
scp -r C:\Users\FAY\AndroidStudioProjects\bfv30001\temp\UI03\cloud\stem-split-server ubuntu@<公网IP>:/home/ubuntu/
```

输入密码（购买时设置的）后等待传输完成（约 10~20 秒，目录含测试音频几 MB）。

> 若提示 `ubuntu` 用户不存在，控制台实例详情页有默认用户名（通常 ubuntu / lighthouse / root）。

## 五、SSH 登录并一键部署（约 10 分钟）

```bash
ssh ubuntu@<公网IP>
cd /home/ubuntu/stem-split-server
```

**有域名**（域名 A 记录已解析好，等待 1~2 分钟生效）：
```bash
bash deploy_lighthouse.sh split.你的域名.com
```

**无域名**：
```bash
bash deploy_lighthouse.sh
```

脚本自动完成：装 docker（如缺）→ 配腾讯云镜像加速 → **构建分轨镜像**（下载 torch + 烘焙 htdemucs_6s 权重，5~10 分钟，只需一次）→ 启动 → 等待模型就绪。

> 首次 SSH 若提示加入 docker 组，**退出重登一次**再执行脚本即可。
> 构建失败最常见原因是网络：脚本已配置清华 PyPI + hf-mirror + 腾讯云 docker 加速，一般不会；若仍失败把日志发我。

## 六、验证（服务器上执行）

```bash
# 无域名: http://<公网IP>:8000
curl http://127.0.0.1:8000/health
# 期望: {"status":"ok","model":"htdemucs_6s","model_ready":true}

# 真实分一首歌测试 (本地先传一个 mp3 到服务器, 或直接用仓库里的 test_stem_input.wav)
curl -X POST http://127.0.0.1:8000/split -F "file=@test_stem_input.wav" -o /tmp/stems.zip
unzip -l /tmp/stems.zip   # 应看到 vocals/drums/bass/guitar/piano/other.wav
```

有域名时把上面的 `http://127.0.0.1:8000` 换成 `https://split.你的域名.com`。

## 七、App 端联调

1. 手机与服务器无需同网（公网直连）。
2. 打开 App 分轨页 → 「服务器」→ 填 `https://split.你的域名.com`（或无域名 `http://<公网IP>:8000`）→ **连接测试**应显示 ✅。
3. 选一首歌 → 云端 6 轨 → 上传等待（整首歌云端 CPU 约 3~6 分钟）。

**永久生效**（可选）：修改 `src/components/StemSplitter.tsx` 里的 `DEFAULT_SERVER` 为新地址，然后：
```bash
npm run build && npx cap sync android
cd android && ./gradlew assembleDebug   # 产出 app/build/outputs/apk/debug/app-debug.apk
```
（打包机在 Windows 本机，不是在服务器上。）

## 八、日常维护

| 操作 | 命令（SSH 登录后） |
|---|---|
| 看分轨日志 | `cd /home/ubuntu/stem-split-server && docker compose logs -f app` |
| 重启服务 | `docker compose restart app` |
| 更新代码 | 重新 scp 覆盖目录 → `docker compose up -d --build app` |
| 开机自启 | compose 已设 `restart: unless-stopped`，**服务器重启自动拉起**，无需额外配置 |

## 九、别忘了：CloudBase 里的登录和预设

轻量服务器只接管了**分轨**。App 的 CloudBase **auth（登录）和 presets（预设）** 在个人版到期后仍会停摆，二选一：

- **A. 转 CloudBase 按量**（保环境、保登录/预设）：分轨不再用云托管但 auth 继续用——需在控制台把环境升级为按量并绑卡（费用大头是分轨，若不跑分轨则很低，auth 免费额度内≈0 元）。适合 App 要保留登录体系时。
- **B. 彻底脱离 CloudBase**：登录改匿名/本地模式，presets 改为从新服务器下发（JSON 文件托管，Caddy 直接静态服务即可）。适合不想再碰 CloudBase。

需要哪条我可以直接帮你在代码里落地。

---

## 成本小结

| 项目 | 费用 |
|---|---|
| 轻量 2C4G（活动价） | ≈ ¥159~199/年（约 15 元/月） |
| 域名（可选） | .com ~¥70/年，.top/.xyz 首年可低至几元 |
| 每次分轨流量 | 进出合计 ~16MB，1TB 月流量 ≈ 6 万次 |
| CloudBase（若 A 方案保留 auth） | 按量，低用量接近 0 |
