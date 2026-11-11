/**
 * BFX1 箱头定义 · v10（20 型号）（2026-10-19 · v3.78 去 v19）
 *
 * 本文件由 tools/_gen_ampdef_v10.py 生成，请勿手改。
 * 来源：ALL20_v9_regs.json（驱动链 v3 / 2026-10-19 22:24）+ 驱动链重设_20台_v3.md
 *
 * ★ v10 与 v9 的关键差别：**驱动链全部重设 + 增益上限按类别统一**
 *     N1 59–62  一级硬削波音色修正（固定，逐台设计）
 *     N4 68–71  TREBLE / BASS / MID / PRESENCE（用户可调，中间四个音色旋钮）
 *     N5 74–77  二级软削波配比（固定）
 *     N8 83–98  16 段箱头性格（固定，不再挂旋钮）
 *
 * ★★★ 2026-10-31（用户实测）：**N8 第 9 段（reg 91，130 Hz）是第一"厚度"旋钮**。
 *   实测把它提到 +4 dB，声音明显厚实；原来多数箱头是 −3…+1 dB（偏薄）。
 *   现在统一：CLEAN / CRUNCH / BASS → **+4.0 dB**；HIGH-GAIN → **+2.0 dB**
 *   （高增益本来就厚，+4 会和 84 低搁架叠出低频糊）。
 *
 *   驱动级：64 GAIN(硬削波) / 65 DC1 / 66 VOL1 / 79 DRIVE(软削波) / 80 DC2 / 81 VOL2
 *   类别 → UI 旋钮（用户 2026-10-19 拍板）：
 *     CLEAN      上限 20 dB · 单级：GAIN(64) + VOL(66)
 *     CRUNCH     上限 25 dB · 两级：GAIN(64) + VOL1(66) + DRIVE(79) + VOL2(81)
 *     HIGH-GAIN  上限 40 dB · 两级：GAIN(64) + VOL1(66) + DRIVE(79) + VOL2(81)
 *     BASS       上限 20 dB · 两级：GAIN(64) + VOL1(66) + DRIVE(79) + VOL2(81)
 *   MASTER = reg 239（PreMixerGuitarLevel，箱头前级电平），全局、非型号参数；
 *   ⚠️ 与首页 ④ 区「总音量」reg 261 不是一个寄存器。
 *
 * 注意：VOL1/VOL2 设计值是 0.00 dB（reg 288），但硬件有效域 166…286
 *       （−30.5…−0.5 dB），故统一钳到 286（比设计低 0.5 dB）。
 */

export interface AmpKnob {
  name: string;        // TREBLE / BASS / MID / PRESENCE
  addr: number;        // N4 段寄存器地址（68–71）
  seg: number;         // 段号 1–4
  typ: string;         // HighShelf / LowShelf / Peak
  hz: number;          // 中心/拐点频点
  qs: number;          // Q 或 S
  pfield: 'Q' | 'S';
}

export interface AmpModel {
  /** ★ v3.78：不可变主键（纯 ASCII）—— 存档 / 云端 / 预设只认它 */
  key: string;
  /** 内部 id（历史遗留，仅供旧代码换算，不得进存档） */
  id: string;
  /** 英文显示名（★ v3.78 全英文 + 精简） */
  name: string;
  /** 历史名（旧全名 / 旧 id / v19 名）—— 只用于老存档反查 */
  aliases?: string[];
  /** 短显示名（窄位用；完整名进列表副行） */
  sn?: string;
  cls: 'CLEAN' | 'CRUNCH' | 'HIGH-GAIN' | 'BASS' | 'CUSTOM';
  /** GAIN / DRIVE 旋钮上限（dB）：CLEAN 20 · CRUNCH 25 · HIGH-GAIN 40 · BASS 20 */
  limit: number;
  /**
   * ★ 2026-10-20：版本组标记。
   *   缺省 = 原 v10 内置 20 台；`'v19'` = 箱头重做总表 v19 的「新设计」组。
   *   首页型号弹窗据此把新箱头单独归到「NEW · 新箱头 v19」分组，与原有 20 台完全分开。
   */
  gen?: 'v19';
  family: string;
  familyEn?: string;
  /** 真机面板旋钮（仅作参考文案，v10 起 UI 不再按此显隐） */
  realKnobs: string[];
  clip: { GAIN: number; DRIVE: number; VOL1: number; VOL2: number; DC1: number; DC2: number };
  knobs: AmpKnob[];      // N4 四个音色旋钮（逐台频点/Q-S 不同）
  regs: Record<number, number>;
}

/** 箱头 MASTER（reg 239）· 全局，非型号参数 */
export const AMP_MASTER_ADDR = 239;
/** UI 只给 40 dB：reg 100…500 = −40.0…0.0 dB，步进 0.1 dB */
export const AMP_MASTER_MIN = 100;
export const AMP_MASTER_MAX = 500;
export const AMP_MASTER_DEF = 500;   // ★ 2026-10-20：默认拉满 0 dB（原 375 = −12.5 dB）

export const AMP_MODELS_BUILTIN: AmpModel[] = [
  /* ★★★ 2026-10-21 v3.45 二十台全量重设（用户拍板「全部改，一个版本搞定」）★★★
   *
   * 目标：每台箱头有自己的「失真指纹」，不再共用同一组频点 / 同一个 Q。
   *
   * 一、为什么改（原设计被抹平的证据）
   *   59/60 是限带、61/62 是味道，结构本来就对，但取值被统一了：
   *     61 频点：CLEAN 218/180/250/250/250（三台同频）、BASS 99/99/99/99/99（五台全同）
   *     61/62  增益：HIGH-GAIN 五台全是 −2.0…−1.0 dB（只削不提，等于没有特征段）
   *     Q 值：四十个特征段里 38 个是 1.00（带宽一律 1.39 oct），只有 AC30 / Orange 的 62 是 1.19
   *   → 频点重复 + Q 统一，两台即使频点差 20% 也会互相盖住，听感合成一片。
   *
   * 二、二十台怎么分（组内任取两台，61/62 频点与 Q 都不重叠）
   *   CLEAN     59: 65 … 173（JTM45 最松保厚度，JC-120 最紧）
   *             61/62: 164→944 / 1590→5440；Q 0.84…2.50
   *   CRUNCH    59: 58 … 149；61/62: 191→1140 / 1560→3170；Q 0.94…2.50
   *   HIGH-GAIN 59: 105 … 297（Engl 最紧）；60: 5440 … 10700；88: 8160 … 13200
   *             61/62: 241→825 / 1440→3430；Q 1.19…2.50
   *   BASS      59: 25 … 48；84 低频重量 −2.4…+7.6、85 低中凹 +3.0…−5.0（拉开贝斯差异）
   *
   * 三、硬约束（用户 O1/N1/N2）
   *   - 83 高搁架「不改」：AC30 +10.0、Mark IIC+ +12.0、Mark IV +12.0 全部保持原值。
   *     9 dB 设计上限不覆盖 83；其余所有段（61/62/84/85）都 ≤ +9 dB。
   *   - Q 上限 2.5（O1：原计划的 3.0–3.6 太窄，可能听成鼻音，已下调）。
   *   - 85 只动 BASS 五台（N5）；CRUNCH / HIGH-GAIN 的 85 原值保持（是它们的中低凹陷本体）。
   *   - 88 只动 CLEAN 三台（ac30/hiwatt/jc）与 HIGH-GAIN 五台（LPF 收顶）。
   *
   * 四、量化（同模型 band 平均跨度，改前 → v4）
   *   CLEAN SUB 11.1→14.9、LOW 8.8→12.8；HIGH-GAIN SUB 7.8→15.1、TOP 16.0→23.5、HIMID 7.0→9.6
   *   CRUNCH LOWMID 5.3→8.5、LOW 11.9→12.7；BASS SUB 3.2→7.3、MID 5.4→7.5
   *   组内平均两两差异（1/3 oct × 30 点）：HG 210.6 / CRUNCH 169.2 / CLEAN 144.6 / BASS 83.3
   *
   * 生成器：tools/_gen_v345.ts（buildPEQData 重算 + 原值比对，123/123 校验通过）
   * 方案文档：output/bfx1_amp_v2/stage3/箱头修正方案v4.docx
   */
  /* ★★★ 2026-10-21 v3.44 试听版：只动下标 0 (twin) 与 1 (jtm45c)，其余 18 台保持原样 ★★★
   *
   * 用户实测：Twin「很薄很脆」、JTM45「非常厚」，同组反差过大。
   * 定量原因（N8 固定段在 100–400 Hz 的累加，LOWMID = 84+85+92+91）：
   *   twin  = +5.6 −10.2 −3.4 −3.2 = −11.2 dB
   *   jtm45 = +11.0 −2.6 +2.6 +0.6 = +11.0 dB   → 差 22 dB
   * 且 twin 的 85（Peak 397 −10.2）是固定段，MID 旋钮(reg 70, ±12 绕 0)在预设 0.46 处只到 −0.96，
   * 根本补不回来 —— 这是"薄"的主因；60/88 = 19800 Hz 是"脆"的主因。
   *
   * twin 改动（前三级的损失在第四级 N8 补回）：
   *   59  N1 削波前 HPF   24.8 → 140 Hz   （前端收紧，削波器只处理中频 → 咬合感）
   *   84  N8 低搁架       +5.6 → +7.6 dB  ← 第四级补偿 59 切掉的低频重量
   *   85  N8 中低挖       −10.2 → −4.0 dB （取消 MID 补不回来的深坑）
   *   91  N8 130 Hz       −3.2 → −0.4 dB
   *   92  N8 250 Hz       −3.4 → +1.0 dB
   *   60/88 LPF           19800 → 16000 Hz（收"脆"）
   *   79  DRIVE           8 → 18（+5 dB）；81 VOL2 284 → 278（−1.5 dB 缓冲，防过载）
   *   → LOWMID −11.2 → +4.2 dB
   *
   * jtm45c 改动（保留"厚"，只加前端紧度与头部余量）：
   *   59  54.6 → 80.3 Hz；84 +11.0 → +10.0 dB；79 10 → 20（+5 dB）；81 270 → 264（−1.5 dB）
   *   → LOWMID +11.0 → +10.6 dB（厚度基本不变）
   */
  {
    key: "fender-twin-reverb", id: "twin", name: "Fender Twin Reverb", aliases: ['Fender Twin Reverb AB763', 'Twin Reverb', 'Fender Twin Reverb AB763 · v19', 'twin', 'B&F NAM Fender Twin Reverb/Fender Twin Reverb'],
    sn: "Twin Reverb", cls: "CLEAN", limit: 20,
    family: "American blackface / bright, glassy", familyEn: "American blackface / bright, glassy",
    realKnobs: ["GAIN", "VOLUME", "DRIVE", "VOLUME2", "TREBLE", "BASS", "MID", "PRESENCE", "MASTER"],
    clip: { GAIN: 14.0, DRIVE: 0.0, VOL1: -4.00, VOL2: -1.00, DC1: 0.02, DC2: 0.00 },
    knobs: [
      { name: "TREBLE", addr: 68, seg: 1, typ: "HighShelf", hz: 3000, qs: 1, pfield: "S" },
      { name: "BASS", addr: 69, seg: 2, typ: "LowShelf", hz: 99, qs: 1, pfield: "S" },
      { name: "MID", addr: 70, seg: 3, typ: "Peak", hz: 454, qs: 0.71, pfield: "Q" },
      { name: "PRESENCE", addr: 71, seg: 4, typ: "Peak", hz: 3170, qs: 1, pfield: "Q" },
    ],
    regs: {
      42: 0, 44: 1359446604, 45: 1353196864, 46: 1342668800, 47: 1359448517, 49: 24, 50: 53, 51: 276, 53: 1359446652,
      54: 1353189032, 55: 1359448493, 56: 1342668800, 57: 0, 58: 0, 59: 1359446628, 60: 1353196824, 61: 1359448517,
      62: 1342668800, 64: 28, 65: 52, 66: 272, 68: 2164754474, 69: 2164753057, 70: 1353155864, 71: 1359448128, 72: 0,
      73: 0, 74: 1359446692, 75: 1353176288, 76: 1353176840, 77: 1342668800, 79: 0, 80: 50, 81: 284, 83: 1627916330,
      84: 1627923105, 85: 1353106712, 86: 1359439496, 87: 1359446516, 88: 1359448541, 89: 1627883778, 90: 1353175624,
      91: 1353188112, 92: 1353167904, 93: 1353127368, 94: 1353135712, 95: 1353176960, 96: 1353189440, 97: 1353136456,
      98: 1353107952

    },
  },
  {
    /* ★★★ 2026-10-31（用户要求「JTM45 非常闷」）：后级补偿段 5 条重调 ——
       83 高架 3.17k +5.6→+6.8 dB；84 低架 109 Hz +9.0→+7.0（去轰）；
       92 峰值 250 Hz +2.6→+1.0（去盒子味）；95 2 kHz −3.4→−0.6；96 4 kHz −3.2→−0.2。
       ⛔ 不要靠 TREBLE/PRESENCE 旋钮硬拉：那个架子在 3.17 kHz 以上，救不了 2 kHz 的坑。 */
    key: "marshall-jtm45", id: "jtm45c", name: "Marshall JTM45", aliases: ['Marshall JTM45 · v19', 'jtm45c', 'B&F NAM Marshall JTM45/Marshall JTM45'],
    sn: "JTM45", cls: "CLEAN", limit: 20,
    family: "British / thick mids, grain", familyEn: "British / thick mids, grain",
    realKnobs: ["GAIN", "VOLUME", "DRIVE", "VOLUME2", "TREBLE", "BASS", "MID", "PRESENCE", "MASTER"],
    clip: { GAIN: 22.0, DRIVE: 6.0, VOL1: -5.00, VOL2: -1.50, DC1: 0.03, DC2: 0.01 },
    knobs: [
      { name: "TREBLE", addr: 68, seg: 1, typ: "HighShelf", hz: 3000, qs: 1, pfield: "S" },
      { name: "BASS", addr: 69, seg: 2, typ: "LowShelf", hz: 99, qs: 1, pfield: "S" },
      { name: "MID", addr: 70, seg: 3, typ: "Peak", hz: 500, qs: 0.71, pfield: "Q" },
      { name: "PRESENCE", addr: 71, seg: 4, typ: "Peak", hz: 3000, qs: 1, pfield: "Q" },
    ],
    regs: {
      42: 0, 44: 1359446676, 45: 1353188672, 46: 1342668800, 47: 1359448517, 49: 32, 50: 54, 51: 276, 53: 1359446652,
      54: 1353189032, 55: 1359448493, 56: 1342668800, 57: 0, 58: 0, 59: 1359446692, 60: 1353188672, 61: 1359448517,
      62: 1342668800, 64: 44, 65: 53, 66: 268, 68: 2164754474, 69: 2164753057, 70: 1353155904, 71: 1359448104, 72: 0,
      73: 0, 74: 1359446692, 75: 1353176288, 76: 1353176840, 77: 1342668800, 79: 12, 80: 51, 81: 282, 83: 1627904042,
      84: 1627923105, 85: 1353135424, 86: 1359468168, 87: 1359446628, 88: 1359448509, 89: 1627883778, 90: 1353175624,
      91: 1353188112, 92: 1353176096, 93: 1353168328, 94: 1353168480, 95: 1353176960, 96: 1353177152, 97: 1353136456,
      98: 1353107952

    },
  },
  {
    key: "vox-ac30", id: "ac30tbc", name: "Vox AC30", aliases: ['Vox AC30 Top Boost', 'Vox AC30 Top Boost · v19', 'ac30tbc', 'B&F NAM Vox AC30/Vox AC30'],
    sn: "AC30 TB", cls: "CLEAN", limit: 20,
    family: "British / EL84 chime", familyEn: "British / EL84 chime",
    realKnobs: ["GAIN", "VOLUME", "DRIVE", "VOLUME2", "TREBLE", "BASS", "MID", "PRESENCE", "MASTER"],
    clip: { GAIN: 24.0, DRIVE: 8.0, VOL1: -7.00, VOL2: -2.00, DC1: 0.05, DC2: 0.02 },
    knobs: [
      { name: "TREBLE", addr: 68, seg: 1, typ: "HighShelf", hz: 3500, qs: 1, pfield: "S" },
      { name: "BASS", addr: 69, seg: 2, typ: "LowShelf", hz: 99, qs: 1, pfield: "S" },
      { name: "MID", addr: 70, seg: 3, typ: "Peak", hz: 794, qs: 0.71, pfield: "Q" },
      { name: "PRESENCE", addr: 71, seg: 4, typ: "Peak", hz: 3500, qs: 1, pfield: "Q" },
    ],
    regs: {
      42: 0, 44: 1359446676, 45: 1353197056, 46: 1342668800, 47: 1359448517, 49: 36, 50: 56, 51: 272, 53: 1359446652,
      54: 1353189032, 55: 1359448493, 56: 1342668800, 57: 0, 58: 0, 59: 1359446692, 60: 1353197056, 61: 1359448517,
      62: 1342668800, 64: 48, 65: 55, 66: 260, 68: 2164754538, 69: 2164753057, 70: 1353156096, 71: 1359448168, 72: 0,
      73: 0, 74: 1359446692, 75: 1353176288, 76: 1353176840, 77: 1342668800, 79: 16, 80: 52, 81: 280, 83: 1627924586,
      84: 1627894433, 85: 1353135328, 86: 1359468168, 87: 1359446652, 88: 1359448525, 89: 1627883778, 90: 1353167432,
      91: 1353175824, 92: 1353167904, 93: 1353156040, 94: 1353176672, 95: 1353197440, 96: 1353209920, 97: 1353169224,
      98: 1353116144

    },
  },
  {
    key: "hiwatt-dr103", id: "dr103c", name: "Hiwatt DR103", aliases: ['Hiwatt DR103 · v19', 'dr103c', 'B&F NAM Hiwatt DR103/Hiwatt DR103'],
    sn: "DR103", cls: "CLEAN", limit: 20,
    family: "British / flat and dynamic", familyEn: "British / flat and dynamic",
    realKnobs: ["GAIN", "VOLUME", "DRIVE", "VOLUME2", "TREBLE", "BASS", "MID", "PRESENCE", "MASTER"],
    clip: { GAIN: 4.0, DRIVE: 4.0, VOL1: 0.00, VOL2: 0.00, DC1: 0.01, DC2: 0.00 },
    knobs: [
      { name: "TREBLE", addr: 68, seg: 1, typ: "HighShelf", hz: 4000, qs: 1, pfield: "S" },  // TREBLE 旋钮 默认 0
      { name: "BASS", addr: 69, seg: 2, typ: "LowShelf", hz: 120, qs: 1, pfield: "S" },  // BASS 旋钮 默认 0
      { name: "MID", addr: 70, seg: 3, typ: "Peak", hz: 1190, qs: 0.89, pfield: "Q" },  // MID 旋钮 默认 0
      { name: "PRESENCE", addr: 71, seg: 4, typ: "Peak", hz: 3500, qs: 1, pfield: "Q" },  // 第4旋钮（PRESENCE/CUT）默认 0
    ],
    regs: {
      59: 1359446742, 60: 1359448847, 61: 1367844000, 62: 1368918040, 64: 8, 65: 51, 66: 286, 68: 2164754594,
      69: 2164753137, 70: 1357350568, 71: 1359448168, 74: 2164761329, 75: 1359439528, 76: 1359456224, 77: 2164762786, 79: 8,
      80: 50, 81: 286, 83: 2567407778, 84: 1627955953, 85: 1352156840, 86: 1353123944, 87: 1359446420, 88: 1359448829,
      89: 956786946, 90: 1357292000, 91: 1353237264, 92: 1353147424, 93: 1353115080, 94: 1359378104, 95: 1366775680, 96: 1354234016,
      97: 1353161152, 98: 1357351528,
    },
  },
  {
    key: "roland-jc120", id: "jc120c", name: "Roland JC-120", aliases: ['Roland JC-120 · v19', 'jc120c', 'B&F NAM Roland JC-120/Roland JC-120'],
    sn: "JC-120", cls: "CLEAN", limit: 20,
    family: "Solid-state / ultra clean", familyEn: "Solid-state / ultra clean",
    realKnobs: ["GAIN", "VOLUME", "DRIVE", "VOLUME2", "TREBLE", "BASS", "MID", "PRESENCE", "MASTER"],
    clip: { GAIN: 3.0, DRIVE: 3.0, VOL1: 0.00, VOL2: 0.00, DC1: 0.00, DC2: 0.00 },
    knobs: [
      { name: "TREBLE", addr: 68, seg: 1, typ: "HighShelf", hz: 3000, qs: 1, pfield: "S" },  // TREBLE 旋钮 默认 0
      { name: "BASS", addr: 69, seg: 2, typ: "LowShelf", hz: 99, qs: 1, pfield: "S" },  // BASS 旋钮 默认 0
      { name: "MID", addr: 70, seg: 3, typ: "Peak", hz: 794, qs: 0.89, pfield: "Q" },  // MID 旋钮 默认 0
      { name: "PRESENCE", addr: 71, seg: 4, typ: "Peak", hz: 4000, qs: 1, pfield: "Q" },  // 第4旋钮（PRESENCE/CUT）默认 0
    ],
    regs: {
      59: 1359446926, 60: 1359448879, 61: 1366754640, 62: 1375287584, 64: 6, 65: 50, 66: 286, 68: 2164754474,
      69: 2164753057, 70: 1357350400, 71: 1359448224, 74: 2164753057, 75: 1359447552, 76: 1359448104, 77: 2164754594, 79: 6,
      80: 50, 81: 286, 83: 1627867178, 84: 1627927201, 85: 1358423552, 86: 1360509088, 87: 1359446316, 88: 1359448853,
      89: 2164754690, 90: 1353085408, 91: 1353237264, 92: 1353126944, 93: 1353106888, 94: 1353127608, 95: 1369929600, 96: 1353169056,
      97: 1353157056, 98: 1353157224,
    },
  },
  {
    key: "dumble-ods", id: "dumble_ods", name: "Dumble ODS", aliases: ['Dumble ODS-124', 'Dumble ODS-124 · v19', 'dumble_ods', 'B&F NAM Dumble ODS/Dumble ODS'],
    sn: "ODS-124", cls: "CRUNCH", limit: 25,
    family: "American / singing overdrive", familyEn: "American / singing overdrive",
    realKnobs: ["GAIN", "VOLUME", "DRIVE", "VOLUME2", "TREBLE", "BASS", "MID", "PRESENCE", "MASTER"],
    clip: { GAIN: 17.0, DRIVE: 20.0, VOL1: 0.00, VOL2: -7.80, DC1: 0.02, DC2: 0.00 },
    knobs: [
      { name: "TREBLE", addr: 68, seg: 1, typ: "HighShelf", hz: 3170, qs: 1, pfield: "S" },  // TREBLE 旋钮 默认 0
      { name: "BASS", addr: 69, seg: 2, typ: "LowShelf", hz: 99, qs: 1, pfield: "S" },  // BASS 旋钮 默认 0
      { name: "MID", addr: 70, seg: 3, typ: "Peak", hz: 595, qs: 0.89, pfield: "Q" },  // MID 旋钮 默认 0
      { name: "PRESENCE", addr: 71, seg: 4, typ: "Peak", hz: 4000, qs: 1, pfield: "Q" },  // 第4旋钮（PRESENCE/CUT）默认 0
    ],
    regs: {
      59: 1359446734, 60: 1359448647, 61: 1376314872, 62: 1372080136, 64: 34, 65: 52, 66: 286, 68: 2164754498,
      69: 2164753057, 70: 1357350280, 71: 1359448224, 74: 2164773537, 75: 1359427128, 76: 1359480704, 77: 2164775074, 79: 40,
      80: 50, 81: 257, 83: 1628022850, 84: 1627947681, 85: 1355150728, 86: 1354176672, 87: 1359446484, 88: 1359448893,
      89: 956766466, 90: 1361502688, 91: 1353237264, 92: 1369928736, 93: 1353131464, 94: 1353164472, 95: 1353086848, 96: 1354176672,
      97: 1368881600, 98: 1353153128,
    },
  },
  {
    key: "orange-ad30", id: "orange_ad30", name: "Orange AD30", aliases: ['Orange AD30 · v19', 'orange_ad30', 'B&F NAM Orange AD30/Orange AD30'],
    sn: "AD30", cls: "CRUNCH", limit: 25,
    family: "British / tight, mid-rich", familyEn: "British / tight, mid-rich",
    realKnobs: ["GAIN", "VOLUME", "DRIVE", "VOLUME2", "TREBLE", "BASS", "MID", "PRESENCE", "MASTER"],
    clip: { GAIN: 24.0, DRIVE: 19.0, VOL1: 0.00, VOL2: -7.00, DC1: 0.02, DC2: 0.00 },
    knobs: [
      { name: "TREBLE", addr: 68, seg: 1, typ: "HighShelf", hz: 3000, qs: 1, pfield: "S" },  // TREBLE 旋钮 默认 0
      { name: "BASS", addr: 69, seg: 2, typ: "LowShelf", hz: 109, qs: 1, pfield: "S" },  // BASS 旋钮 默认 0
      { name: "MID", addr: 70, seg: 3, typ: "Peak", hz: 694, qs: 0.89, pfield: "Q" },  // MID 旋钮 默认 0
      { name: "PRESENCE", addr: 71, seg: 4, typ: "Peak", hz: 3500, qs: 1, pfield: "Q" },  // 第4旋钮（PRESENCE/CUT）默认 0
    ],
    regs: {
      59: 1359446860, 60: 1359448567, 61: 1361646672, 62: 1365780248, 64: 48, 65: 52, 66: 286, 68: 2164754474,
      69: 2164753097, 70: 1357350344, 71: 1359448168, 74: 2164785865, 75: 1359414784, 76: 1359488848, 77: 2164775018, 79: 38,
      80: 50, 81: 260, 83: 2567522346, 84: 1627931337, 85: 1349920200, 86: 1354164328, 87: 1359446444, 88: 1359448773,
      89: 2164754690, 90: 1359397344, 91: 1353237264, 92: 1369924640, 93: 1369916872, 94: 1356310200, 95: 1353119616, 96: 1353132192,
      97: 1353148864, 98: 1353157224,
    },
  },
  {
    key: "peavey-classic-30", id: "supro_1696t", name: "Peavey Classic 30", aliases: ['Peavey Classic 30 · v19', 'supro_1696t', 'B&F NAM Peavey Classic 30/Peavey Classic 30'],
    sn: "Classic 30", cls: "CRUNCH", limit: 25,
    family: "American / EL84 sweetness", familyEn: "American / EL84 sweetness",
    realKnobs: ["GAIN", "VOLUME", "DRIVE", "VOLUME2", "TREBLE", "BASS", "MID", "PRESENCE", "MASTER"],
    clip: { GAIN: 20.0, DRIVE: 21.0, VOL1: 0.00, VOL2: -8.10, DC1: 0.02, DC2: 0.00 },
    knobs: [
      { name: "TREBLE", addr: 68, seg: 1, typ: "HighShelf", hz: 3000, qs: 1, pfield: "S" },  // TREBLE 旋钮 默认 0
      { name: "BASS", addr: 69, seg: 2, typ: "LowShelf", hz: 105, qs: 1, pfield: "S" },  // BASS 旋钮 默认 0
      { name: "MID", addr: 70, seg: 3, typ: "Peak", hz: 694, qs: 0.89, pfield: "Q" },  // MID 旋钮 默认 0
      { name: "PRESENCE", addr: 71, seg: 4, typ: "Peak", hz: 3500, qs: 1, pfield: "Q" },  // 第4旋钮（PRESENCE/CUT）默认 0
    ],
    regs: {
      59: 1359446772, 60: 1359448631, 61: 1369994648, 62: 1373120360, 64: 40, 65: 52, 66: 286, 68: 2164754474,
      69: 2164753081, 70: 1357350344, 71: 1359448168, 74: 2164773561, 75: 1359427072, 76: 1359480744, 77: 2164762730, 79: 42,
      80: 50, 81: 256, 83: 1627998250, 84: 1627947705, 85: 1350972872, 86: 1357310056, 87: 1359446404, 88: 1359448805,
      89: 956737794, 90: 1356239328, 91: 1353237264, 92: 1369928736, 93: 1361491400, 94: 1369933496, 95: 1353086848, 96: 1353119904,
      97: 1353161152, 98: 1358400104,
    },
  },
  {
    key: "fender-bassman", id: "bogner_ecstasy", name: "Fender Bassman", aliases: ['Fender Bassman 5F6-A', 'Fender Bassman 5F6-A · v19', 'bogner_ecstasy', 'B&F NAM Fender Bassman/Fender Bassman'],
    sn: "Bassman", cls: "CRUNCH", limit: 25,
    family: "Tweed / thick and wide", familyEn: "Tweed / thick and wide",
    realKnobs: ["GAIN", "VOLUME", "DRIVE", "VOLUME2", "TREBLE", "BASS", "MID", "PRESENCE", "MASTER"],
    clip: { GAIN: 15.0, DRIVE: 17.0, VOL1: 0.00, VOL2: -7.90, DC1: 0.02, DC2: 0.00 },
    knobs: [
      { name: "TREBLE", addr: 68, seg: 1, typ: "HighShelf", hz: 3000, qs: 1, pfield: "S" },  // TREBLE 旋钮 默认 0
      { name: "BASS", addr: 69, seg: 2, typ: "LowShelf", hz: 105, qs: 1, pfield: "S" },  // BASS 旋钮 默认 0
      { name: "MID", addr: 70, seg: 3, typ: "Peak", hz: 561, qs: 0.89, pfield: "Q" },  // MID 旋钮 默认 0
      { name: "PRESENCE", addr: 71, seg: 4, typ: "Peak", hz: 4000, qs: 1, pfield: "Q" },  // 第4旋钮（PRESENCE/CUT）默认 0
    ],
    regs: {
      59: 1359446470, 60: 1359448743, 61: 1358488496, 62: 1366820792, 64: 30, 65: 52, 66: 286, 68: 2164754474,
      69: 2164753081, 70: 1357350256, 71: 1359448224, 74: 2164785849, 75: 1359426928, 76: 1359468296, 77: 2164762786, 79: 34,
      80: 50, 81: 256, 83: 1627994154, 84: 1628066489, 85: 1349977456, 86: 1353119904, 87: 1359446364, 88: 1359448869,
      89: 1359476994, 90: 1357300192, 91: 1354285840, 92: 1353204768, 93: 1353119176, 94: 1353131704, 95: 1353136000, 96: 1353119904,
      97: 1353132480, 98: 1358400104,
    },
  },
  {
    key: "vox-ac15", id: "diezel_vh4", name: "Vox AC15", aliases: ['Vox AC15 · v19', 'diezel_vh4', 'B&F NAM Vox AC15/Vox AC15'],
    sn: "AC15", cls: "CRUNCH", limit: 25,
    family: "British / bright EL84", familyEn: "British / bright EL84",
    realKnobs: ["GAIN", "VOLUME", "DRIVE", "VOLUME2", "TREBLE", "BASS", "MID", "PRESENCE", "MASTER"],
    clip: { GAIN: 18.0, DRIVE: 20.0, VOL1: 0.00, VOL2: -4.20, DC1: 0.02, DC2: 0.00 },
    knobs: [
      { name: "TREBLE", addr: 68, seg: 1, typ: "HighShelf", hz: 3170, qs: 1, pfield: "S" },  // TREBLE 旋钮 默认 0
      { name: "BASS", addr: 69, seg: 2, typ: "LowShelf", hz: 95, qs: 1, pfield: "S" },  // BASS 旋钮 默认 0
      { name: "MID", addr: 70, seg: 3, typ: "Peak", hz: 794, qs: 0.89, pfield: "Q" },  // MID 旋钮 默认 0
      { name: "PRESENCE", addr: 71, seg: 4, typ: "Peak", hz: 5990, qs: 1, pfield: "Q" },  // 第4旋钮（PRESENCE/CUT）默认 0
    ],
    regs: {
      59: 1359446630, 60: 1359448687, 61: 1374217880, 62: 1375238208, 64: 36, 65: 52, 66: 286, 68: 2164754498,
      69: 2164753041, 70: 1357350400, 71: 1359448392, 74: 2164773521, 75: 1359427072, 76: 1359488992, 77: 2164746570, 79: 40,
      80: 50, 81: 271, 83: 2030540866, 84: 1627927185, 85: 1362601472, 86: 1353177416, 87: 1359446404, 88: 1359448837,
      89: 956766466, 90: 1358328288, 91: 1353237264, 92: 1353098272, 93: 1353086408, 94: 1369929400, 95: 1353131904, 96: 1353136288,
      97: 1361545664, 98: 1353157224,
    },
  },
  {
    key: "engl-savage-120", id: "engl_savage", name: "Engl Savage 120", aliases: ['Engl Savage 120 · v19', 'engl_savage', 'B&F NAM Engl Savage 120/Engl Savage 120'],
    sn: "Savage 120", cls: "HIGH-GAIN", limit: 40,
    family: "Modern / tight, dark, aggressive", familyEn: "Modern / tight, dark, aggressive",
    realKnobs: ["GAIN", "VOLUME", "DRIVE", "VOLUME2", "TREBLE", "BASS", "MID", "PRESENCE", "MASTER"],
    clip: { GAIN: 33.0, DRIVE: 36.0, VOL1: 0.00, VOL2: -10.30, DC1: 0.01, DC2: 0.00 },
    knobs: [
      { name: "TREBLE", addr: 68, seg: 1, typ: "HighShelf", hz: 3000, qs: 1, pfield: "S" },  // TREBLE 旋钮
      { name: "BASS", addr: 69, seg: 2, typ: "LowShelf", hz: 99, qs: 1, pfield: "S" },  // BASS 旋钮
      { name: "MID", addr: 70, seg: 3, typ: "Peak", hz: 794, qs: 0.89, pfield: "Q" },  // MID 旋钮
      { name: "PRESENCE", addr: 71, seg: 4, typ: "Peak", hz: 3500, qs: 1, pfield: "Q" },  // 第4旋钮
    ],
    regs: {
      59: 1359447148, 60: 1359448357, 61: 1376273544, 62: 1374242552, 64: 66, 65: 51, 66: 286, 68: 2164754474,
      69: 2164753057, 70: 1357350400, 71: 1359448168, 74: 2164720289, 75: 1359427072, 76: 1359468368, 77: 2164721826, 79: 72,
      80: 50, 81: 247, 83: 1627994154, 84: 1628066465, 85: 1359312384, 86: 1353115752, 87: 1359446548, 88: 1359448525,
      89: 2164738306, 90: 1363616224, 91: 1353196304, 92: 1353217056, 93: 1361552840, 94: 1353152184, 95: 1353144192, 96: 1353099424,
      97: 1353148864, 98: 1355254376,
    },
  },
  {
    key: "mesa-mark-iic-plus", id: "framus_cobra", name: "Mesa Mark IIC+", aliases: ['Mesa Boogie Mark IIC+', 'Mesa Boogie Mark IIC+ · v19', 'framus_cobra', 'B&F NAM Mesa Mark IIC+/Mesa Mark IIC+'],
    sn: "Mark IIC+", cls: "HIGH-GAIN", limit: 40,
    family: "American / deep scoop", familyEn: "American / deep scoop",
    realKnobs: ["GAIN", "VOLUME", "DRIVE", "VOLUME2", "TREBLE", "BASS", "MID", "PRESENCE", "MASTER"],
    clip: { GAIN: 24.0, DRIVE: 14.0, VOL1: -9.00, VOL2: -3.00, DC1: 0.03, DC2: 0.03 },
    knobs: [
      { name: "TREBLE", addr: 68, seg: 1, typ: "HighShelf", hz: 2520, qs: 1, pfield: "S" },
      { name: "BASS", addr: 69, seg: 2, typ: "LowShelf", hz: 99, qs: 1, pfield: "S" },
      { name: "MID", addr: 70, seg: 3, typ: "Peak", hz: 397, qs: 0.59, pfield: "Q" },
      { name: "PRESENCE", addr: 71, seg: 4, typ: "Peak", hz: 1590, qs: 1, pfield: "Q" },
    ],
    regs: {
      42: 0, 44: 1359446652, 45: 1353176576, 46: 1342668800, 47: 1359448517, 49: 36, 50: 53, 51: 272, 53: 1359446652,
      54: 1353189032, 55: 1359448493, 56: 1342668800, 57: 0, 58: 0, 59: 1359446676, 60: 1353176576, 61: 1359448517,
      62: 1342668800, 64: 48, 65: 53, 66: 252, 68: 2164754402, 69: 2164753057, 70: 1350010080, 71: 1359447840, 72: 0,
      73: 0, 74: 1359446692, 75: 1353176288, 76: 1353176840, 77: 1342668800, 79: 28, 80: 53, 81: 276, 83: 1627916330,
      84: 1627923105, 85: 1353094464, 86: 1359427208, 87: 1359446652, 88: 1359448493, 89: 1627883778, 90: 1353167432,
      91: 1353188112, 92: 1353135136, 93: 1353135560, 94: 1353135712, 95: 1353189248, 96: 1353189440, 97: 1353128264,
      98: 1353095664

    },
  },
  {
    key: "peavey-6505", id: "krank_rev", name: "Peavey 6505", aliases: ['Peavey 6505 · v19', 'krank_rev', 'B&F NAM Peavey 6505/Peavey 6505'],
    sn: "6505", cls: "HIGH-GAIN", limit: 40,
    family: "American / tight and gritty", familyEn: "American / tight and gritty",
    realKnobs: ["GAIN", "VOLUME", "DRIVE", "VOLUME2", "TREBLE", "BASS", "MID", "PRESENCE", "MASTER"],
    clip: { GAIN: 28.0, DRIVE: 14.0, VOL1: -9.00, VOL2: -3.00, DC1: 0.03, DC2: 0.08 },
    knobs: [
      { name: "TREBLE", addr: 68, seg: 1, typ: "HighShelf", hz: 3170, qs: 1, pfield: "S" },
      { name: "BASS", addr: 69, seg: 2, typ: "LowShelf", hz: 99, qs: 1, pfield: "S" },
      { name: "MID", addr: 70, seg: 3, typ: "Peak", hz: 749, qs: 0.71, pfield: "Q" },
      { name: "PRESENCE", addr: 71, seg: 4, typ: "Peak", hz: 3500, qs: 1, pfield: "Q" },
    ],
    regs: {
      42: 0, 44: 1359446732, 45: 1353197112, 46: 1342668800, 47: 1359448517, 49: 40, 50: 54, 51: 272, 53: 1359446652,
      54: 1353189032, 55: 1359448493, 56: 1342668800, 57: 0, 58: 0, 59: 1359446732, 60: 1353197112, 61: 1359448517,
      62: 1342668800, 64: 56, 65: 53, 66: 252, 68: 2164754498, 69: 2164753057, 70: 1353156072, 71: 1359448168, 72: 0,
      73: 0, 74: 1359446732, 75: 1353176288, 76: 1353176840, 77: 1342668800, 79: 28, 80: 58, 81: 276, 83: 1627916354,
      84: 1627943585, 85: 1353106752, 86: 1359439496, 87: 1359446732, 88: 1359448493, 89: 1627883778, 90: 1353187912,
      91: 1353196304, 92: 1353126944, 93: 1353135560, 94: 1353135712, 95: 1353189248, 96: 1353209920, 97: 1353148744,
      98: 1353107952

    },
  },
  {
    key: "mesa-mark-iv", id: "vht_pittbull", name: "Mesa Mark IV", aliases: ['Mesa Boogie Mark IV', 'Mesa Boogie Mark IV · v19', 'vht_pittbull', 'B&F NAM Mesa Mark IV/Mesa Mark IV'],
    sn: "Mark IV", cls: "HIGH-GAIN", limit: 40,
    family: "American / tight and smooth", familyEn: "American / tight and smooth",
    realKnobs: ["GAIN", "VOLUME", "DRIVE", "VOLUME2", "TREBLE", "BASS", "MID", "PRESENCE", "MASTER"],
    clip: { GAIN: 32.0, DRIVE: 34.0, VOL1: 0.00, VOL2: -13.10, DC1: 0.01, DC2: 0.00 },
    knobs: [
      { name: "TREBLE", addr: 68, seg: 1, typ: "HighShelf", hz: 3170, qs: 1, pfield: "S" },  // TREBLE 旋钮
      { name: "BASS", addr: 69, seg: 2, typ: "LowShelf", hz: 90.1, qs: 1, pfield: "S" },  // BASS 旋钮
      { name: "MID", addr: 70, seg: 3, typ: "Peak", hz: 749, qs: 0.89, pfield: "Q" },  // MID 旋钮
      { name: "PRESENCE", addr: 71, seg: 4, typ: "Peak", hz: 4000, qs: 1, pfield: "Q" },  // 第4旋钮
    ],
    regs: {
      59: 1359446836, 60: 1359448429, 61: 1367909680, 62: 1368946624, 64: 64, 65: 51, 66: 286, 68: 2164754498,
      69: 2164753017, 70: 1357350376, 71: 1359448224, 74: 2164732537, 75: 1359427048, 76: 1359468368, 77: 2164746402, 79: 68,
      80: 50, 81: 236, 83: 2164856898, 84: 1628025465, 85: 1356158440, 86: 1362602144, 87: 1359446516, 88: 1359448613,
      89: 2164754690, 90: 1353093600, 91: 1369973520, 92: 1353098272, 93: 1360426440, 94: 1353086648, 95: 1356326784, 96: 1353115808,
      97: 1354148288, 98: 1353136744,
    },
  },
  {
    key: "mesa-lonestar", id: "rivera_knuckle", name: "Mesa Lonestar", aliases: ['Mesa Boogie Lonestar', 'Mesa Boogie Lonestar · v19', 'rivera_knuckle', 'B&F NAM Mesa Lonestar/Mesa Lonestar'],
    sn: "Lonestar", cls: "HIGH-GAIN", limit: 40,
    family: "American / bright and smooth", familyEn: "American / bright and smooth",
    realKnobs: ["GAIN", "VOLUME", "DRIVE", "VOLUME2", "TREBLE", "BASS", "MID", "PRESENCE", "MASTER"],
    clip: { GAIN: 26.0, DRIVE: 28.0, VOL1: 0.00, VOL2: -3.60, DC1: 0.02, DC2: 0.00 },
    knobs: [
      { name: "TREBLE", addr: 68, seg: 1, typ: "HighShelf", hz: 3000, qs: 1, pfield: "S" },  // TREBLE 旋钮
      { name: "BASS", addr: 69, seg: 2, typ: "LowShelf", hz: 99, qs: 1, pfield: "S" },  // BASS 旋钮
      { name: "MID", addr: 70, seg: 3, typ: "Peak", hz: 694, qs: 0.89, pfield: "Q" },  // MID 旋钮
      { name: "PRESENCE", addr: 71, seg: 4, typ: "Peak", hz: 4000, qs: 1, pfield: "Q" },  // 第4旋钮
    ],
    regs: {
      59: 1359446716, 60: 1359448639, 61: 1364731408, 62: 1363691544, 64: 52, 65: 52, 66: 286, 68: 2164754474,
      69: 2164753057, 70: 1357350344, 71: 1359448224, 74: 2164732577, 75: 1359427016, 76: 1359480704, 77: 2164775074, 79: 56,
      80: 50, 81: 274, 83: 2433321002, 84: 1627943585, 85: 1349850568, 86: 1353128096, 87: 1359446444, 88: 1359448725,
      89: 956823810, 90: 1360450016, 91: 1353196304, 92: 1365722144, 93: 1355273672, 94: 1353189048, 95: 1353131904, 96: 1353119904,
      97: 1353144768, 98: 1353157224,
    },
  },
  {
    key: "ampeg-svt", id: "svt", name: "Ampeg SVT", aliases: ['Ampeg SVT · v19', 'svt', 'B&F NAM Ampeg SVT/Ampeg SVT'],
    sn: "SVT", cls: "BASS", limit: 20,
    family: "Bass / thick and wide", familyEn: "Bass / thick and wide",
    realKnobs: ["GAIN", "VOLUME", "DRIVE", "VOLUME2", "TREBLE", "BASS", "MID", "PRESENCE", "MASTER"],
    clip: { GAIN: 20.0, DRIVE: 6.0, VOL1: -6.00, VOL2: -1.50, DC1: 0.03, DC2: 0.02 },
    knobs: [
      { name: "TREBLE", addr: 68, seg: 1, typ: "HighShelf", hz: 3500, qs: 1, pfield: "S" },
      { name: "BASS", addr: 69, seg: 2, typ: "LowShelf", hz: 60.1, qs: 1, pfield: "S" },
      { name: "MID", addr: 70, seg: 3, typ: "Peak", hz: 500, qs: 0.71, pfield: "Q" },
      { name: "PRESENCE", addr: 71, seg: 4, typ: "Peak", hz: 3000, qs: 1, pfield: "Q" },
    ],
    regs: {
      42: 0, 44: 1359446196, 45: 1353176384, 46: 1342668800, 47: 1359448565, 49: 32, 50: 54, 51: 276, 53: 1359446196,
      54: 1353176520, 55: 1359448565, 56: 1342668800, 57: 0, 58: 0, 59: 1359446196, 60: 1353176384, 61: 1359448565,
      62: 1342668800, 64: 40, 65: 53, 66: 264, 68: 2164754538, 69: 2164752849, 70: 1353155904, 71: 1359448104, 72: 0,
      73: 0, 74: 1359446260, 75: 1353176288, 76: 1353176288, 77: 1342668800, 79: 12, 80: 52, 81: 282, 83: 1627904106,
      84: 1627922897, 85: 1353176384, 86: 1359480264, 87: 1359446196, 88: 1359448565, 89: 1627883778, 90: 1353187712,
      91: 1353196152, 92: 1353175960, 93: 1353188520, 94: 1353176520, 95: 1353168648, 96: 1353189416, 97: 1353169224,
      98: 1353128432

    },
  },
  {
    key: "gibson-lab-series-l4", id: "l4bass", name: "Gibson Lab Series L4", aliases: ['Gibson Lab Series L4 · v19', 'l4bass', 'B&F NAM Gibson Lab Series L4/Gibson Lab Series L4'],
    sn: "Lab L4", cls: "BASS", limit: 20,
    family: "Bass / flat, wide (solid-state)", familyEn: "Bass / flat, wide (solid-state)",
    realKnobs: ["GAIN", "VOLUME", "DRIVE", "VOLUME2", "TREBLE", "BASS", "MID", "PRESENCE", "MASTER"],
    clip: { GAIN: 4.0, DRIVE: 3.0, VOL1: 0.00, VOL2: 0.00, DC1: 0.00, DC2: 0.00 },
    knobs: [
      { name: "TREBLE", addr: 68, seg: 1, typ: "HighShelf", hz: 4000, qs: 1, pfield: "S" },  // TREBLE 旋钮
      { name: "BASS", addr: 69, seg: 2, typ: "LowShelf", hz: 80.3, qs: 1, pfield: "S" },  // BASS 旋钮
      { name: "MID", addr: 70, seg: 3, typ: "Peak", hz: 794, qs: 0.89, pfield: "Q" },  // MID 旋钮
      { name: "PRESENCE", addr: 71, seg: 4, typ: "Peak", hz: 4000, qs: 1, pfield: "Q" },  // 第4旋钮
    ],
    regs: {
      59: 1359446118, 60: 1359448807, 61: 1357300944, 62: 1359468312, 64: 8, 65: 50, 66: 286, 68: 2164754594,
      69: 2164752969, 70: 1357350400, 71: 1359448224, 74: 2164752969, 75: 1359447552, 76: 1359448032, 77: 2164754690, 79: 6,
      80: 50, 81: 286, 83: 2567415970, 84: 2433139273, 85: 1350071808, 86: 1353193632, 87: 1359446116, 88: 1359448909,
      89: 956741890, 90: 1353109984, 91: 1366868752, 92: 1353106464, 93: 1353115080, 94: 1369929400, 95: 1353115520, 96: 1356249248,
      97: 1353177536, 98: 1353153128,
    },
  },
  {
    key: "acoustic-360", id: "ac360", name: "Acoustic 360", aliases: ['Acoustic 360 · v19', 'ac360', 'B&F NAM Acoustic 360/Acoustic 360'],
    sn: "Acoustic 360", cls: "BASS", limit: 20,
    family: "Bass / thick", familyEn: "Bass / thick",
    realKnobs: ["GAIN", "VOLUME", "DRIVE", "VOLUME2", "TREBLE", "BASS", "MID", "PRESENCE", "MASTER"],
    clip: { GAIN: 5.0, DRIVE: 4.0, VOL1: 0.00, VOL2: -0.10, DC1: 0.00, DC2: 0.00 },
    knobs: [
      { name: "TREBLE", addr: 68, seg: 1, typ: "HighShelf", hz: 3000, qs: 1, pfield: "S" },  // TREBLE 旋钮
      { name: "BASS", addr: 69, seg: 2, typ: "LowShelf", hz: 80.3, qs: 1, pfield: "S" },  // BASS 旋钮
      { name: "MID", addr: 70, seg: 3, typ: "Peak", hz: 500, qs: 0.89, pfield: "Q" },  // MID 旋钮
      { name: "PRESENCE", addr: 71, seg: 4, typ: "Peak", hz: 3500, qs: 1, pfield: "Q" },  // 第4旋钮
    ],
    regs: {
      59: 1359446334, 60: 1359448751, 61: 1371100008, 62: 1374160280, 64: 10, 65: 50, 66: 286, 68: 2164754474,
      69: 2164752969, 70: 1357350208, 71: 1359448168, 74: 2164785737, 75: 1359426880, 76: 1359456128, 77: 2164754594, 79: 8,
      80: 50, 81: 286, 83: 1627863082, 84: 2567561801, 85: 1349907776, 86: 1356261480, 87: 1359446196, 88: 1359448869,
      89: 956737794, 90: 1353085408, 91: 1358480144, 92: 1353085984, 93: 1353123272, 94: 1353103032, 95: 1353099136, 96: 1353218208,
      97: 1353177536, 98: 1357347432,
    },
  },
  {
    key: "sunn-beta-bass", id: "betabass", name: "Sunn Beta Bass", aliases: ['Sunn Beta Bass · v19', 'betabass', 'B&F NAM Sunn Beta Bass/Sunn Beta Bass'],
    sn: "Beta Bass", cls: "BASS", limit: 20,
    family: "Bass / thick and dark", familyEn: "Bass / thick and dark",
    realKnobs: ["GAIN", "VOLUME", "DRIVE", "VOLUME2", "TREBLE", "BASS", "MID", "PRESENCE", "MASTER"],
    clip: { GAIN: 7.0, DRIVE: 6.0, VOL1: 0.00, VOL2: -5.80, DC1: 0.02, DC2: 0.00 },
    knobs: [
      { name: "TREBLE", addr: 68, seg: 1, typ: "HighShelf", hz: 3000, qs: 1, pfield: "S" },  // TREBLE 旋钮
      { name: "BASS", addr: 69, seg: 2, typ: "LowShelf", hz: 90.1, qs: 1, pfield: "S" },  // BASS 旋钮
      { name: "MID", addr: 70, seg: 3, typ: "Peak", hz: 694, qs: 0.89, pfield: "Q" },  // MID 旋钮
      { name: "PRESENCE", addr: 71, seg: 4, typ: "Peak", hz: 3000, qs: 1, pfield: "Q" },  // 第4旋钮
    ],
    regs: {
      59: 1359446390, 60: 1359448615, 61: 1373152536, 62: 1376298648, 64: 14, 65: 52, 66: 286, 68: 2164754474,
      69: 2164753017, 70: 1357350344, 71: 1359448104, 74: 2164773497, 75: 1359427016, 76: 1359447936, 77: 2164733994, 79: 12,
      80: 50, 81: 265, 83: 1627883562, 84: 1627923065, 85: 1353115080, 86: 1362569256, 87: 1359446260, 88: 1359448725,
      89: 956733698, 90: 1353085408, 91: 1356382992, 92: 1353122848, 93: 1363629512, 94: 1362589368, 95: 1356265344, 96: 1366775968,
      97: 1353177536, 98: 1358400104,
    },
  },
  {
    key: "traynor-ts50b", id: "ts50b", name: "Traynor TS-50B", aliases: ['Traynor TS-50B · v19', 'ts50b', 'B&F NAM Traynor TS-50B/Traynor TS-50B'],
    sn: "TS-50B", cls: "BASS", limit: 20,
    family: "Bass / mid-forward, thick", familyEn: "Bass / mid-forward, thick",
    realKnobs: ["GAIN", "VOLUME", "DRIVE", "VOLUME2", "TREBLE", "BASS", "MID", "PRESENCE", "MASTER"],
    clip: { GAIN: 6.0, DRIVE: 5.0, VOL1: 0.00, VOL2: -2.10, DC1: 0.02, DC2: 0.00 },
    knobs: [
      { name: "TREBLE", addr: 68, seg: 1, typ: "HighShelf", hz: 3000, qs: 1, pfield: "S" },  // TREBLE 旋钮
      { name: "BASS", addr: 69, seg: 2, typ: "LowShelf", hz: 85, qs: 1, pfield: "S" },  // BASS 旋钮
      { name: "MID", addr: 70, seg: 3, typ: "Peak", hz: 694, qs: 0.89, pfield: "Q" },  // MID 旋钮
      { name: "PRESENCE", addr: 71, seg: 4, typ: "Peak", hz: 3500, qs: 1, pfield: "Q" },  // 第4旋钮
    ],
    regs: {
      59: 1359446318, 60: 1359448687, 61: 1368892464, 62: 1375258496, 64: 12, 65: 52, 66: 286, 68: 2164754474,
      69: 2164752993, 70: 1357350344, 71: 1359448168, 74: 2164773473, 75: 1359427016, 76: 1359456168, 77: 2164754594, 79: 10,
      80: 50, 81: 280, 83: 2567403562, 84: 1627882081, 85: 1350051272, 86: 1358362728, 87: 1359446220, 88: 1359448805,
      89: 956733698, 90: 1353085408, 91: 1359528720, 92: 1353094176, 93: 1353119176, 94: 1364682424, 95: 1355200384, 96: 1353185440,
      97: 1353177536, 98: 1360497256,
    },
  },
];

/* ★ v3.78（2026-10-26 用户拍板）：只保留旧版 20 台，v19 的 20 台已移除。
   AMP_MODELS 下标 0–19 与历史完全一致，预设 / 频道 / 快照的 v8Amp 不受影响。 */
export const AMP_MODELS: AmpModel[] = [...AMP_MODELS_BUILTIN];

