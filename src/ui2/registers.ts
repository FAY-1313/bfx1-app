/**
 * BFX1 新 UI · 寄存器规格表（v8）
 *
 * 每个旋钮声明：寄存器地址 / 范围 / 步进 / 显示格式
 * ⚠️ min/max/def 一律用【寄存器值】；步进与物理量一一对应（见下）
 *
 * ── v8 箱头寄存器（ID 57–98 + MASTER 239）──────────────────────────
 *   57 整块旁通 | 58 N1库 | 59-62 N1 4段PEQ | 63 N2级
 *   64 GAIN      0…92   （0.5 dB/LSB → 0…+46 dB）
 *   65 DCOFFSET  0…100  （0.01 b/LSB → −0.50…+0.50）
 *   66 VOLUME1   166…286（0.25 dB/LSB → −30.5…−0.5 dB）
 *   67 N4库 | 68-71 N4 4段PEQ
 *   72 整块旁通 | 73 N5库 | 74-77 N5 4段PEQ | 78 N6级
 *   79 DRIVE     0…92   （0.5 dB/LSB）
 *   80 DCOFFSET2 0…100
 *   81 VOLUME2   166…286
 *   82 N8库 | 83-98 N8 16段PEQ（前几段=旋钮段，其余=补偿段）
 *   239 MASTER   100…500（0.1 dB/LSB → −40.0…0.0 dB，0=−∞）
 *
 * ── 换算公式（权威）───────────────────────────────────────────────
 *   音量类 66/81 : reg = 288 + dB / 0.25        （上限 50 = 0 dB 的 101/104 是另一类）
 *   驱动类 64/79 : reg = dB / 0.5
 *   偏置类 65/80 : reg = 50 + b / 0.01
 *   主音量 239   : reg = 500 + dB / 0.1         （0 = −∞ 静音）
 *
 * ⚠️ 本文件只做「UI 值 ↔ 寄存器值」换算；真正的发送走既有 bleService。
 */

import { PEQ_FREQ_TABLE } from '../data/peqCodec';

export interface RegSpec {
  /** 寄存器地址；'PGA' 表示走 I2C PGA（ED 00 30 14 1X） */
  reg: number | 'PGA';
  min: number;
  max: number;
  /** 寄存器步进（1 = 每次 ±1） */
  step: number;
  /** 默认甜点值（寄存器值） */
  def: number;
  /** 显示格式 */
  fmt: (v: number) => string;
  /**
   * ★ v73：UI 吸附档位（**寄存器单位**）。>1 时旋钮只落在 min + k·snap 上。
   *   噪声门 0…100 / snap 10 → 恰好 11 档（0 · −10 · … · −100 dB），
   *   与 KnobRing 的 11 格刻度一一对应，不再出现 1 dB 级中间值。
   */
  snap?: number;
}

const pct = (v: number) => `${v}`;
/** ★ 2026-10-16（C5/C7）：0…100 无量纲寄存器统一按「百分比」显示 */
const pctPct = (v: number) => `${v} %`;
/** ★ 2026-10-21（用户提供固件口径）：
 *   合唱 216–220 在固件里是 216:0–20 / 217,218:0–39 / 219,220:0–9，
 *   此前 UI 全部按 0–100 处理（模板写 60/50），实际一直被夹断在量程边缘。
 *   · LEVEL 0–20  → −20…0 dB（1 dB/LSB）
 *   · RATE  0–19  → 0.05…1.00 Hz（0.05 Hz/LSB，用户限定 0–19，不用到 39）
 *   · DEPTH 0–5   → 1…6（用户限定 0–5） */
const chRate = (v: number) => `${(0.05 + v * 0.05).toFixed(2)} Hz`;
const chDepth = (v: number) => String(v + 1);
const chLevel = (v: number) => `${v - 20} dB`;
/** ★ 2026-10-16（C5）：压缩器输入阈值（dB） */
const db = (v: number) => `${v} dB`;

/* ══════════ v8 物理量 ↔ 寄存器 换算 ══════════ */
/** 驱动类（GAIN 64 / DRIVE 79）：1 LSB = 0.5 dB */
export const drvReg = (db: number) => Math.round(db / 0.5);
export const drvDb = (reg: number) => reg * 0.5;
/** 音量类（VOLUME1 66 / VOLUME2 81）：1 LSB = 0.25 dB，reg 288 = 0 dB */
export const volReg = (db: number) => Math.round(288 + db / 0.25);
export const volDb = (reg: number) => (reg - 288) * 0.25;
/** 偏置类（DCOFFSET 65 / DCOFFSET2 80）：1 LSB = 0.01 b，reg 50 = 0 */
export const dcReg = (b: number) => Math.round(50 + b / 0.01);
export const dcB = (reg: number) => (reg - 50) * 0.01;
/** 主音量（MASTER 239）：1 LSB = 0.1 dB，reg 500 = 0 dB，reg 0 = −∞ */
export const masReg = (db: number) => Math.round(500 + db / 0.1);
export const masDb = (reg: number) => (reg <= 0 ? -Infinity : (reg - 500) * 0.1);

const fmt_drv = (v: number) => `${drvDb(v).toFixed(1)} dB`;
const fmt_vol = (v: number) => `${volDb(v) >= 0 ? '+' : ''}${volDb(v).toFixed(2)} dB`;
const fmt_dc = (v: number) => `${dcB(v) >= 0 ? '+' : ''}${dcB(v).toFixed(2)} b`;
const fmt_mas = (v: number) => (v <= 0 ? '−∞' : `${masDb(v).toFixed(1)} dB`);

/** 压缩器 RATIO 查表（parameterMap.ts:93 RATIO_TABLE） */
export const RATIO_TABLE = [
  1.0, 1.2, 1.4, 1.6, 1.8, 2.0, 2.4, 2.8, 3.2, 3.6,
  4.0, 4.4, 4.8, 5.2, 5.6, 6.0, 6.4, 6.8, 7.2, 7.6,
  8.0, 8.4, 9.0, 9.6, 10.2, 10.8, 11.4, 12, 13, 14,
  15, 16, 17, 18, 19, 20, 22, 24, 26, 30, 100,
];

/* ★ 2026-10-19（用户确认）：混响 HPF / LPF 用的是**和 PEQ 同一张频点表**（362 档）。
 *   PEQ_FREQ_TABLE[0] = 19.7 Hz、[204] = 1000 Hz、[361] = 20600 Hz，与固件口径严丝合缝：
 *     HPF 1…205  → 表索引 0…204   （19.7 Hz … 1 kHz，共 205 档）
 *     LPF 0…157  → 表索引 204…361 （1 kHz … 20.6 kHz，共 158 档）
 *   所以这里直接查表，不做任何插值或曲线拟合。 */
/** 混响 HPF：0 = OFF；1…205 查 PEQ 表前 205 档 */
export const rvHpfHz = (v: number): number =>
  v <= 0 ? 0 : PEQ_FREQ_TABLE[Math.min(v, 205) - 1] ?? 0;

/** 混响 LPF：0…157 查 PEQ 表第 205 档起；158 = OFF */
export const rvLpfHz = (v: number): number =>
  v >= 158 ? 0 : PEQ_FREQ_TABLE[Math.min(204 + v, PEQ_FREQ_TABLE.length - 1)] ?? 0;

/** 0 → OFF；<100 Hz 保留一位小数（频点表本身是 19.7 / 29.5 这种），≥1 kHz 用一位小数 kHz */
const rvHzFmt = (hz: number): string => {
  if (!hz) return 'OFF';
  if (hz < 100) return `${hz.toFixed(1)} Hz`;
  return hz < 1000 ? `${Math.round(hz)} Hz` : `${(hz / 1000).toFixed(1)} kHz`;
};

export const SPECS: Record<string, RegSpec> = {
  /* ── 噪声门（reg 0 bypass / 1 threshold）── */
  /* ★ v73（用户要求）：噪声门【只做 11 档】—— 0…100 每 10 一格，不再关联其他步进值。
   * ★ 2026-10-17（用户要求）：UI 不再显示 dB 步进单位，只显示 0…10 这 11 个档位号。
   *   寄存器仍写 0…100（固件口径不变），显示值 = 寄存器值 / 10。 */
  GATE_THRESHOLD: { reg: 1, min: 0, max: 100, step: 10, snap: 10, def: 50,
    fmt: (v) => String(Math.round(v / 10)) },

  /* ── 压缩器（reg 8..13；reg 7 = bypass，2026-10-03 已开放）──
   * ★ 2026-10-16（C5）：THRESHOLD 补 dB、KNEE 补 dB */
  COMP_INPUT:  { reg: 8,  min: 0, max: 50,   step: 1, def: 12, fmt: db },
  COMP_ATTACK: { reg: 9,  min: 0, max: 999,  step: 1, def: 200, fmt: (v) => `${v} µs` },
  COMP_RELEASE:{ reg: 10, min: 0, max: 1999, step: 1, def: 300, fmt: (v) => `${v} ms` },
  COMP_RATIO:  { reg: 11, min: 0, max: 40,   step: 1, def: 10,
    fmt: (v) => `${RATIO_TABLE[v] ?? v}:1` },
  COMP_KNEE:   { reg: 12, min: 0, max: 100,  step: 1, def: 50, fmt: db },
  COMP_GAIN:   { reg: 13, min: 0, max: 12,   step: 1, def: 4,  fmt: (v) => `${v} dB` },

  /* ══════════ 激励 BOOST（PGA，无寄存器）══════════
   * ★ v8 已把 PGA 从箱头移出 → 恢复为独立 BOOST 模块
   * PGA 档位 0…10，3 dB/档 = 0…30 dB（bleService.pgaLevelToValue）
   * ★ v73 核对：已是 min0/max10/step1 = 【11 档】，与旋钮 11 格刻度一一对应，无需改动。
   * ★ 2026-10-17（用户要求）：UI 不再显示 +N dB 步进单位，只显示 0…10 档位号。 */
  BOOST_LEVEL: { reg: 'PGA', min: 0, max: 10, step: 1, def: 0,
    fmt: (v) => String(v) },

  /* ── 过载（ID 42–56）──
   * ⚠️ 每型号的旋钮【数量/地址/范围都不同】→ 由 odDef.ts 的 knobs[] 驱动
   *    这里只声明通用兜底（ts808/sd1 的 DRIVE+LEVEL） */
  OD_DRIVE: { reg: 49, min: 0, max: 92,  step: 1, def: 60,
    fmt: (v) => `${drvDb(v).toFixed(1)} dB` },
  OD_LEVEL: { reg: 51, min: 248, max: 288, step: 1, def: 280,
    fmt: (v) => `${volDb(v).toFixed(2)} dB` },

  /* ══════════ 箱头 v10（ID 57–98 + 239）══════════
   * ★ GAIN/DRIVE 的上限【按型号类别】CLEAN 20 / CRUNCH 25 / HIGH-GAIN 40 / BASS 20 dB
   *   → 用 ampGainSpec(model) / ampDriveSpec(model) 生成，不在此固定
   * ★ 音色旋钮是型号自己的 N4 四段（reg 68–71），由 ampHeadDef.knobs[] 驱动
   */

  /** VOLUME1 = reg 66（削波① 后）· −30.5…0.0 dB · 0.25 dB/LSB
   *  ★ 2026-10-21（用户实测「最大不是 0 dB，是 −0.5」）：上限原写 volReg(−0.5)=286，
   *    而固件是 (reg−288)×0.25 → 286 只有 −0.50 dB。改 volReg(0)=288，最大即 0.00 dB。 */
  AMP_VOL1: { reg: 66, min: volReg(-30.5), max: volReg(0), step: 1,
    def: volReg(-2.0), fmt: fmt_vol },
  /** VOLUME2 = reg 81（削波② 后）· −30.5…0.0 dB · 0.25 dB/LSB
   *  ⚠️ 文档旧称此寄存器为 MASTER —— 实为 VOLUME2（用户 2026-10-06 确认） */
  AMP_VOL2: { reg: 81, min: volReg(-30.5), max: volReg(0), step: 1,
    def: volReg(-3.0), fmt: fmt_vol },
  /** DCOFFSET = reg 65 · −0.50…+0.50 b · 0.01 b/LSB */
  AMP_DC1: { reg: 65, min: 0, max: 100, step: 1, def: dcReg(0.05), fmt: fmt_dc },
  /** DCOFFSET2 = reg 80 */
  AMP_DC2: { reg: 80, min: 0, max: 100, step: 1, def: dcReg(0.0), fmt: fmt_dc },
  /** MASTER = reg 239（PreMixerGuitarLevel）· 全局，非型号参数
   *  量纲：0 = −∞；1…500 = −49.9…0.0 dB；0.1 dB/LSB
   *  ⚠️ UI 只给 40 dB：reg 100…500 = −40.0…0.0 dB（用户 2026-10-06 定）*/
  AMP_MASTER: { reg: 239, min: 100, max: 500, step: 1, def: 500,  // ★ 2026-10-20 用户要求：默认拉满 = 0 dB（原 375 = −12.5 dB）
    fmt: fmt_mas },

  /** ★ v73（核定表「总音量」行）：OUT VOLUME = reg 261（M1OutVolume）· 全局总音量
   *  量纲：0 = −∞；1…50 = −49…0 dB · 1 dB/LSB
   *  ⚠️ 首页 ④ 区的「总音量」是这个寄存器，**不是**箱头模块自己的 MASTER（reg 239）；
   *     两者并存：④ 区 = 整机输出，箱头浮窗里的 MASTER = 箱头前级电平。 */
  OUT_VOLUME: { reg: 261, min: 0, max: 50, step: 1, def: 40,
    fmt: (v) => (v === 0 ? '-∞ dB' : `${v - 50} dB`) },

  /* ── 合唱（reg 216-220）──
   * ★ 2026-10-21（用户提供固件口径，替换原先错误的 0–100 百分比口径）：
   *   216 Level 0–20  → −20…0 dB，步进 1 dB
   *   217/218 Rate 0–19 → 0.05…1.00 Hz，步进 0.05 Hz（用户限定只用 0–19，固件上限 39）
   *   219/220 Depth 0–5 → 1…6，步进 1（用户限定只用 0–5，固件上限 9）
   *   ⚠️ 改动前模板里的 {216:60, 219:50} 等值全部超量程，已一并重算。 */
  CH_LEVEL:  { reg: 216, min: 0, max: 20, step: 1, def: 15, fmt: chLevel },
  CH_RATE1:  { reg: 217, min: 0, max: 19, step: 1, def: 6,  fmt: chRate },
  CH_RATE2:  { reg: 218, min: 0, max: 19, step: 1, def: 7,  fmt: chRate },
  CH_DEPTH1: { reg: 219, min: 0, max: 5,  step: 1, def: 4,  fmt: chDepth },
  CH_DEPTH2: { reg: 220, min: 0, max: 5,  step: 1, def: 3,  fmt: chDepth },

  /* ── 延迟（reg 222 repeat / 223 time）── ★ 2026-10-16（C5）：REPEAT 按 %
   * ★★ 2026-10-30（按《吉他效果器 DSP G1V7 上下位机通信协议 B版 v2.0》校准）：
   *   222 FeedbackDelay Repeat    0…75   → 0…75 %，1 LSB = 1 %
   *   223 FeedbackDelay Time      0…500  → 0…500 ms，1 LSB = 1 ms
   * ⚠️ 原来写的是 max 1000 ms / max 100 %，两个上限都超出 DSP 量程：
   *    拖过 500 / 75 之后写进硬件的值会被夹断，界面还在往上走 →
   *    「显示 800 ms，实际只有 500 ms」，听感与读数对不上。
   * ⚠️ 现有 16 格数据最大 375 ms / 30 %，改上限不会改动任何存量音色。 */
  DLY_TIME:   { reg: 223, min: 0, max: 500, step: 1, def: 230, fmt: (v) => `${v} ms` },
  DLY_REPEAT: { reg: 222, min: 0, max: 75,  step: 1, def: 33,  fmt: pctPct },

  /* ── 混响（reg 225-229）───────────────────────────────────────────────
   * ★ 2026-10-19（用户提供固件口径，替换原来的百分比显示）：
   *   225 PreDelay  0…200    → 0…200 ms（1 LSB = 1 ms）
   *   226 Time      0…80     → 0…5000 ms（1 LSB = 62.5 ms）
   *   227 HPF       0…205    → 0 = OFF；1…205 → 19.7…1000 Hz
   *   228 LPF       0…158    → 0…157 → 1000…20600 Hz；158 = OFF
   *   229 DryWetMix 0…100    → 0…100 %（1 LSB = 1 %）
   * ⚠️ 227/228 固件只给了两端点，中间按**对数刻度**插值（音频滤波器的通用做法）；
   *    若以后拿到官方逐档频率表，只需替换 rvHpfHz / rvLpfHz 两个函数即可。
   */
  RV_PREDELAY: { reg: 225, min: 0, max: 200, step: 1, def: 30,  fmt: (v) => `${Math.round(v)} ms` },
  RV_TIME:     { reg: 226, min: 0, max: 80,  step: 1, def: 16,  fmt: (v) => `${Math.round(v * 62.5)} ms` },
  RV_HPF:      { reg: 227, min: 0, max: 205, step: 1, def: 21,  fmt: (v) => rvHzFmt(rvHpfHz(v)) },
  RV_LPF:      { reg: 228, min: 0, max: 158, step: 1, def: 126, fmt: (v) => rvHzFmt(rvLpfHz(v)) },
  RV_MIX:      { reg: 229, min: 0, max: 100, step: 1, def: 20,  fmt: pctPct },
};

/* ══════════ 箱头：按型号类别生成 GAIN / DRIVE 规格 ══════════
 * 上限：CLEAN 20 dB · CRUNCH 30 dB · HIGH-GAIN 40 dB
 * （下限一律 0 dB = reg 0） */
export function ampGainSpec(limitDb: number): RegSpec {
  return { reg: 64, min: 0, max: drvReg(limitDb), step: 1,
    def: drvReg(Math.min(limitDb, 14)), fmt: fmt_drv };
}
export function ampDriveSpec(limitDb: number): RegSpec {
  return { reg: 79, min: 0, max: drvReg(limitDb), step: 1,
    def: drvReg(0), fmt: fmt_drv };
}

/* ══════════ 内部旁路位（由型号数据决定，不作开关）══════════ */
// ★ 2026-10-15：dist 已并入箱头（删除该项）；箱头改为 N2 级 63 / N6 级 78
export const INTERNAL_BYPASS: Record<string, number> = {
  'amp-head': 63,   // 箱头 N2 级
};

/* ══════════ 模块开关寄存器（★ 2026-10-15 按 v5 定案重排）══════════
 *   · 删除 amp-head / cabinet —— 箱头与箱体常开，不参与踩钉
 *   · overdrive 由内部位 48 改为模块级 42（C1 定案）
 *   · reverb   由 MIX(229) 改为模块级 224（C2 定案）
 *   · boost    走 PGA，无寄存器（reg: -1 为哨兵，on/off 由 writePGA 表达）
 */
export const MODULE_ON_OFF: Record<string, { reg: number; on: number; off: number }> = {
  'noise-gate': { reg: 0,   on: 0, off: 1 },
  compressor:   { reg: 7,   on: 0, off: 1 },
  /** ★ BOOST 走 PGA（无寄存器）—— reg: -1 是哨兵，on/off 由 writePGA 表达 */
  boost:        { reg: -1,  on: 0, off: 0 },
  chorus:       { reg: 215, on: 0, off: 1 },
  delay:        { reg: 221, on: 0, off: 1 },
  /* ★ 2026-10-20（用户拍板）：混响开关回到 reg 224（0 = 开 / 1 = 旁路）。
     此前用「MIX(229) 归零」是因为固件一时取消了 224；现在按用户确认改回 224，
     MIX 归预设自己管，切档不再被强制改成 20。 */
  reverb:       { reg: 224, on: 0, off: 1 },
};

/** 静音开关（C6）：挂在 MASTER 模块上，写 260 —— 1 = 静音 / 0 = 正常 */
export const MUTE_ON_OFF = { reg: 260, on: 1, off: 0 } as const;

/** 箱头 6 个「块/库使能」位 —— 固件上电默认 = 1，必须写 0 */
export const AMP_BLOCK_ENABLE = [57, 58, 67, 72, 73, 82] as const;

/** 箱头两级削波旁路位（reg 63 N2 / reg 78 N6）—— v8 单模式：两级都由型号数据决定 */
export const AMP_CLIP_BYPASS = { n2: 63, n6: 78 } as const;

/** 箱头类别（只决定 GAIN/DRIVE 上限） */
export const AMP_CLASSES = ['CLEAN', 'CRUNCH', 'HIGH-GAIN'] as const;
export type AmpClass = typeof AMP_CLASSES[number];

/* ══════════ Dock 三段分组（用户 2026-10-06 定稿）══════════
 * 中文：动态 / 音箱 / 空间 ｜ 英文：PRE / AMP / POST */
export interface DockGroup { key: string; zh: string; en: string; sub: string; ids: string[]; }
export const DOCK_GROUPS: DockGroup[] = [
  { key: 'pre',  zh: '动态', en: 'PRE',  sub: 'DYNAMICS',
    ids: ['noise-gate', 'compressor', 'boost'] },
  { key: 'amp',  zh: '音箱', en: 'AMP',  sub: 'AMP · CAB',
    ids: ['amp-head', 'cabinet'] },
  { key: 'post', zh: '空间', en: 'POST', sub: 'SPACE',
    ids: ['chorus', 'delay', 'reverb'] },
];
