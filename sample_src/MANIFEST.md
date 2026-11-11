# BFX1 鼓组单次采样清单（CC0 / Public Domain）

- 生成日期：2026-09-03
- 目录：`sample_src\<rock|hiphop|funk|house|lofi>\`
- 许可证证据副本：`sample_src\_licenses\`（每个来源的 LICENSE/README 原文存档）
- 下载记录：`sample_src\_download_log.txt`
- 所有条目均为 **单次打击 (one-shot)**，非 loop；flac/wav 均可被 `decodeAudioData` 解码。

| 风格 | 目录 | 文件数 | 必备四件 | 来源 | 许可证 |
|---|---|---|---|---|---|
| A rock | `rock` | 8 | ✅ | Virtuosity Drums（真实原声架子鼓） | CC0 1.0 |
| B hiphop | `hiphop` | 9 | ✅ | The Libre Sample Pack（808/beat 单次鼓） | CC0 1.0（README 声明） |
| C funk | `funk` | 10 | ✅ | BushDrum（LinnDrum LM-2 风格电鼓） | CC0 1.0 |
| D house | `house` | 10 | ✅ | BillieDrum（80s 电子鼓，909/Linn 风味） | CC0 1.0 |
| E lofi | `lofi` | 9 | ✅ | Virtuosity Drums 的专用 lo-fi 染色 bus（+ shaker） | CC0 1.0 |

总下载体积：约 11.7 MB（46 个文件）。单个采样均 < 5 MB。

---

## A. rock（真实原声架子鼓）

- 来源：Virtuosity Drums（Versilian Studios × Karoryfer Samples，KVRDC'21）
- 仓库：https://github.com/sfzinstruments/virtuosity_drums
- 许可证原文：https://github.com/sfzinstruments/virtuosity_drums/blob/master/LICENSE （CC0-1.0；副本：`_licenses/virtuosity_drums_LICENSE.txt`）
- 说明：kick 取自底鼓近距话筒 bus（kickmic），其余取自该库"mid（平衡话筒）"bus，听感一致；每件按强力度层（vl）取单次击打。vl4/vl14/vl3 为该乐器族最大力度层，snare 为 vl32/36。

| 鼓件 | 文件 | 库内原始路径 |
|---|---|---|
| kick | `rock/kick.flac` | `Samples/kickmic/kick/kickmic_kick_snon_vl4_rr1.flac` |
| snare | `rock/snare.flac` | `Samples/mid/snare/mid_snare_center_vl32.flac` |
| hihat (closed) | `rock/hihat.flac` | `Samples/mid/hh/mid_hh_closed_vl4_rr1.flac` |
| openhat | `rock/openhat.flac` | `Samples/mid/hh/mid_hh_open_vl4_rr1.flac` |
| tom (高音桶鼓) | `rock/tom.flac` | `Samples/mid/htom/mid_htom_center_vl14.flac` |
| tom (落地鼓) | `rock/floortom.flac` | `Samples/mid/ltom/mid_ltom_center_vl14.flac` |
| crash | `rock/crash.flac` | `Samples/mid/crash/mid_crash_crash_vl3_rr1.flac` |
| ride | `rock/ride.flac` | `Samples/mid/ride/mid_ride_ride_vl3_rr1.flac` |

缺失：clap、shaker（Virtuosity 无 clap 鼓件）。tom 提供高/落地两只，可当 tom 用。

---

## B. hiphop（肥厚 808 / hip-hop beat 鼓）

- 来源：The Libre Sample Pack（社区协作、全部贡献 CC0）
- 仓库：https://github.com/TheSmallTeaBoi/the-libre-sample-pack
- 许可证声明：仓库 README 明确 "License: CC0"（https://creativecommons.org/publicdomain/zero/1.0/ ；副本：`_licenses/libre-sample-pack_README.md`）
- 说明：该包无独立 LICENSE 文件，但 README 为协作贡献者统一约定 CC0；下载即该文件的唯一归属方为仓库作者贡献者（文件内带 @TeaBoi/@Klassic 标签，均可从上述 README 溯源）。风格偏 fat 808 / hip-hop beat。

| 鼓件 | 文件 | 库内原始路径 |
|---|---|---|
| kick（fat 808） | `hiphop/kick.wav` | `drums/one shot/808/fat 808 c 1 @TeaBoi.wav` |
| kick 备选（punchy） | `hiphop/kick_alt.wav` | `drums/one shot/kicks/punchy kick 1 @TeaBoi.wav` |
| snare | `hiphop/snare.wav` | `drums/one shot/snares/Snare 1 @Klassic.wav` |
| snare 备选 | `hiphop/snare2.wav` | `drums/one shot/snares/snare 5 @TeaBoi.wav` |
| hihat (closed) | `hiphop/hihat.wav` | `drums/one shot/hi hats/ch 1 @TeaBoi.wav` |
| openhat | `hiphop/openhat.wav` | `drums/one shot/hi hats/Open Hat 1 @TeaBoi.wav` |
| clap | `hiphop/clap.wav` | `drums/one shot/claps/trap clap 1 @TeaBoi.wav` |
| rim | `hiphop/rim.wav` | `drums/one shot/rimshots/rim 1 @TeaBoi.wav` |
| perc | `hiphop/perc.wav` | `drums/one shot/perc/perc 1 @TeaBoi.wav` |

缺失：tom、crash、shaker（该包无）。
说明：该源为 hip-hop/beat 取向（808 长尾 kick 等），并非纯 golden-era boom-bap；调研中未发现真正的纯 boom-bap CC0 单采样套件，故用此真实 hip-hop 素材替代（kick/snare 文件听感上更接近 boom-bap 的 punchy/round 方向，可试听后决定是否换）。

---

## C. funk（LinnDrum 风格放克电鼓）

- 来源：BushDrum by Owen Earl（SFZ kit，按 LinnDrum LM-2 建模/采样的电鼓）
- 仓库：https://github.com/EwonRael/BushDrum
- 许可证原文：https://github.com/EwonRael/BushDrum/blob/main/LICENSE （CC0-1.0；副本：`_licenses/BushDrum_LICENSE.txt`）
- 说明：整包 zip（3.6 MB）下载保留在 `_licenses/_bushdrum.zip` 作为整包源证据；snare 选 `snare-m`（中力度），hihat 选 `hihat-closed-short`（紧/短）。

| 鼓件 | 文件 | 整包内原始文件 |
|---|---|---|
| kick | `funk/kick.wav` | `kick.wav` |
| snare | `funk/snare.wav` | `snare-m.wav` |
| hihat (closed) | `funk/hihat.wav` | `hihat-closed-short.wav` |
| openhat | `funk/openhat.wav` | `hihat-open.wav` |
| clap | `funk/clap.wav` | `clap.wav` |
| tom | `funk/tom.wav` | `tom-m.wav` |
| crash | `funk/crash.wav` | `crash.wav` |
| ride | `funk/ride.wav` | `ride.wav` |
| cowbell | `funk/cowbell.wav` | `cowb.wav` |
| tambourine | `funk/tambourine.wav` | `tamb.wav` |

缺失：无（clap/crash/ride/cowbell/tambourine 加分件齐）。

---

## D. house（punchy 电子舞曲鼓）

- 来源：BillieDrum by Owen Earl（灵感取自 80s MJ 录音室鼓组音色的电子鼓，909/Linn 风味）
- 仓库：https://github.com/EwonRael/BillieDrum
- 许可证原文：https://github.com/EwonRael/BillieDrum/blob/main/LICENSE （CC0-1.0；副本：`_licenses/BillieDrum_LICENSE.txt`）

| 鼓件 | 文件 | 库内原始路径 |
|---|---|---|
| kick | `house/kick.wav` | `kick/01.wav` |
| snare | `house/snare.wav` | `snare electric.wav` |
| hihat (closed) | `house/hihat.wav` | `hihat closed/01.wav` |
| openhat | `house/openhat.wav` | `hihat open.wav` |
| clap | `house/clap.wav` | `clap electric.wav` |
| tom | `house/tom.wav` | `toms/middle.wav` |
| crash | `house/crash.wav` | `crash.wav` |
| ride | `house/ride.wav` | `ride.wav` |
| shaker | `house/shaker.wav` | `shaker/01.wav` |
| cowbell | `house/cowbell.wav` | `cowbell.wav` |

缺失：无（含 clap/shaker/cowbell 加分件）。

---

## E. lofi（温暖/微糊 lo-fi 鼓）

- 来源：Virtuosity Drums 的 **专用 lofi 染色 bus**（非 clean bus），另加该库 perc 近距话筒的 shaker
- 仓库 / 许可证：同 A，CC0-1.0（`_licenses/virtuosity_drums_LICENSE.txt`）

| 鼓件 | 文件 | 库内原始路径 |
|---|---|---|
| kick | `lofi/kick.flac` | `Samples/lofi/kick/lofi_kick_snon_vl4_rr1.flac` |
| snare | `lofi/snare.flac` | `Samples/lofi/snare/lofi_snare_center_vl32.flac` |
| hihat (closed) | `lofi/hihat.flac` | `Samples/lofi/hh/lofi_hh_closed_vl4_rr1.flac` |
| openhat | `lofi/openhat.flac` | `Samples/lofi/hh/lofi_hh_open_vl4_rr1.flac` |
| tom | `lofi/tom.flac` | `Samples/lofi/htom/lofi_htom_center_vl14.flac` |
| floortom | `lofi/floortom.flac` | `Samples/lofi/ltom/lofi_ltom_center_vl14.flac` |
| crash | `lofi/crash.flac` | `Samples/lofi/crash/lofi_crash_crash_vl3_rr1.flac` |
| ride | `lofi/ride.flac` | `Samples/lofi/ride/lofi_ride_ride_vl3_rr1.flac` |
| shaker | `lofi/shaker.wav` | `Samples/perc/close/shaker/LShaker_Shake1D_rr1_Close.wav` |

缺失：clap（Virtuosity 无 clap）。
**重要说明**：lofi 与 rock 同源于 Virtuosity 这一个 CC0 库，但取的是该库**专门做好的 lo-fi 染色 bus**（微糊/温暖质感，非 rock 所用 clean bus，音色差异真实存在）。另：未能在网络中找到**独立录音源**的 CC0 lo-fi 鼓组单采样库（常见 lo-fi pack 均为 CC-BY-NC/商业 EULA），若 App 要求各风格完全来自不同录音源，建议日后用其它 CC0 源替换本套。

---

## 许可证核实方式摘要

- GitHub 仓库：读取根目录 LICENSE / README（API `license` 返回 SPDX；正文已存档到 `_licenses`）。
- 未使用 archive.org（本机网络不可达），未使用 Freesound/需登录源，未使用 GPL/CC-BY-NC 等限制性许可证。
- 每套来源的许可证原文链接见上文各节。
