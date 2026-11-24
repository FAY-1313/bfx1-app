/**
 * BFX1 箱头旋钮 → 寄存器 解析器（v3 参数表驱动 · 2026-10-16）
 *
 * ════════════════════════════════════════════════════════════════════
 *  为什么需要这个文件
 * ════════════════════════════════════════════════════════════════════
 *  parameterMap.ts 里那两张 amp-head 公式表（MODULE_PARAM_MAP['amp-head'] 与
 *  SUB_MODEL_FORMULAS['amp-head'] 及 78 条逐 capture 键）是 v13（2026-09-23）
 *  生成的，用的是**旧寄存器布局**：
 *      GAIN→79   VOLUME→81   BASS→83 PEAK   TREBLE→85 PEAK   …
 *  v3 表（data/_def/ampHeadDef.ts）已改为：
 *      GAIN=64 · DRIVE=79 · VOL1=66 · VOL2=81 · MASTER=239
 *      N8 旋钮段 = 各型号自己的 knobs[]（数量/名称/地址/段型都不同）
 *  旧表继续生效会把 GAIN 旋钮写成 DRIVE、把 TREBLE 写成 BASS。
 *
 *  本模块直接从 AmpModel.knobs[] + clip 生成公式，是箱头的**唯一权威写入路径**。
 *
 *  归一化口径（与 v13 保持一致，勿改，否则 officialTones/GroupBase 全部变味）：
 *      GAIN / DRIVE : norm × 92 → reg 0…92（0.5 dB/LSB）⇒ 满量程 46 dB
 *      VOL1 / VOL2  : reg 166…288（−30.5…0 dB，0.25 dB/LSB）
 *      MASTER       : norm × 500（1.0 → 500 = 0 dB 满值；0.75 → 375 = −12.5 dB）
 *      音调段        : noon(norm=0.5) = 型号 regs[addr] 里的设计增益；
 *                     扫描行程取 TONE_SWEEP_DB（★ 2026-10-24 统一 ±9 dB，
 *                     CUT −12…0，单向开关 0…+12），段增益 0.2 dB/LSB，钳 0…180。
 */

import { AMP_MODELS, type AmpModel, type AmpKnob } from './_def/ampHeadDef';
import {
  buildPEQData, freqToIndex, parsePEQData, PEQ_TYPE,
  PEQ_Q_TABLE, PEQ_S_TABLE,
} from './peqCodec';

/** 与 parameterMap.ts 的 LinkedParamDef 结构一致（此处独立声明以免循环依赖） */
export interface AmpLinkedDef {
  regAddr: number;
  min: number;
  max: number;
  compute?: (norm: number, cur?: number) => number;
  decode?: (regVal: number) => number;
}

/* ── 归一化口径 ─────────────────────────────────────────────────── */

/** GAIN / DRIVE 旋钮满量程 dB（reg 92 × 0.5 dB） */
export const DRV_FS_DB = 46;
/** dB → 归一化值（**旧口径 0…46 dB**，仅历史代码引用；新代码用 gainNorm） */
export const drvNorm = (db: number) => db / DRV_FS_DB;
/** ★ v10（2026-10-19）：旋钮行程 = 该类别上限 → 归一化 = dB / limit */
export const gainNorm = (db: number, limit: number) => Math.max(0, Math.min(1, db / Math.max(1, limit)));

/** VOL1/VOL2 合法域：reg 166…288 ↔ −30.5…0.0 dB
 *  ★ 2026-10-21 修正：上限原为 286（= −0.50 dB），与固件 (reg−288)×0.25 的口径冲突，
 *    导致 UI 拉到底只显示 −0.50 dB、永远拿不到 0 dB。改为 288。 */
export const VOL_MIN_REG = 166;
export const VOL_MAX_REG = 288;

const clampGi = (gi: number) => Math.max(0, Math.min(180, gi));

/* ── 音调段 ─────────────────────────────────────────────────────── */

/**
 * 各音调旋钮的 [下限, 上限] dB（绝对 dB，0 dB = PEQ gainIdx 120）。
 *
 * ★ 2026-10-24（用户拍板）：**所有音色旋钮行程统一 ±9 dB**，0 dB 正好落在 12 点。
 *   旧表是 BASS/TREBLE [−12, +9] · MID/PRESENCE/RESONANCE [−12, +6]，正负不等；
 *   而 UI 显示路径（ui2/moduleKnobs.ts）按「[lo,hi] 线性铺满 0…1」算归一值，
 *   于是居中(norm 0.5) 落在 −1.5 / −3.0 dB —— 用户看到的「0 dB 偏移、居中不对」就是它。
 *   改为对称 ±9 后：norm 0.5 ⇔ 0 dB ⇔ 12 点，三条路径（显示 / 写入 / 回读）一致。
 *   CUT 保留 [−12, 0]（只能挖，顶格 = 不削）；
 *   BRIGHT / BOOST / ULTRA HI / DEEP 这类单向开关改 [0, +12]（0 = 关，+12 = 开满）。
 *
 *   ★★ 本表与 ui2/moduleKnobs.ts 的 N8_RANGE **必须逐字一致**，改一处必须改另一处。
 */
const TONE_SWEEP_DB: Record<string, [number, number]> = {
  BASS: [-9, 9],
  MID: [-9, 9],
  MIDDLE: [-9, 9],
  TREBLE: [-9, 9],
  PRESENCE: [-9, 9],
  RESONANCE: [-9, 9],
  CUT: [-12, 0],
  /* ★ 2026-10-20：v19 新箱头的第 4 旋钮（都是真机上的开关/单向量程） */
  BRIGHT: [0, 12],       // JC-120 / Acoustic 360：只能开，不能挖
  BOOST: [0, 12],        // Peavey Classic 30：一按就 honk，只能加
  'ULTRA HI': [0, 12],   // Ampeg SVT：只抬顶部
  DEEP: [0, 12],         // Gibson Lab L4：只加低频
};

const TYPE_ID: Record<string, number> = {
  Peak: PEQ_TYPE.PEAK,
  LowShelf: PEQ_TYPE.LOW_SHELF,
  HighShelf: PEQ_TYPE.HIGH_SHELF,
};

/** 段增益 0.2 dB/LSB */
const TONE_GAIN_LSB = 0.2;

function nearestIndex(table: number[], v: number): number {
  let best = 0, bestD = Infinity;
  for (let i = 0; i < table.length; i++) {
    const d = Math.abs(table[i] - v);
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

/**
 * 把一个型号的 N8 旋钮段转成「可扫描」公式。
 *
 * 两种行程口径（★ 2026-10-24 定稿，必须与 ui2/moduleKnobs.ts 的 N8_RANGE 同口径）：
 *   ① **对称行程**（lo < 0 < hi，如 ±9）：**以 noon 为轴的两段线性** ——
 *      往下走满 loDb、往上走满 hiDb，norm 0.5 恒等于 noon 增益（= 0 dB）。
 *      （2026-10-21 修正：原实现是整段线性铺 0…1，noon 落在 (lo+hi)/2 = −1.5 dB，
 *        与「0.5 = 0 dB」的预设口径矛盾，被用户实测听出「MID 一挖就软」。）
 *   ② **单向行程**（lo ≥ 0 或 hi ≤ 0，如 CUT −12…0 / BRIGHT 0…+12）：
 *      **整圈线性** `loDb + n*(hiDb-loDb)`，左端就是 loDb、右端就是 hiDb。
 *      这里不能再拿 noon 当轴，否则 norm 0…0.5 全被钳在 loDb（半圈死区），
 *      而且与显示路径（`norm=(db-lo)/(hi-lo)`）算出来的位置对不上。
 */
function toneDef(m: AmpModel, k: AmpKnob): AmpLinkedDef {
  const raw = m.regs[k.addr] ?? 0;
  const noonGi = clampGi(parsePEQData(raw).gain);

  const base = k.name.split('/')[0].trim().toUpperCase();
  const [loDb, hiDb] = TONE_SWEEP_DB[base] ?? [-9, 9];
  const symmetric = loDb < 0 && hiDb > 0;
  const loGi = loDb / TONE_GAIN_LSB;   // 相对 noon 的 LSB 偏移（负）
  const hiGi = hiDb / TONE_GAIN_LSB;   // 相对 noon 的 LSB 偏移（正）

  const typ = TYPE_ID[k.typ] ?? PEQ_TYPE.PEAK;
  const fIdx = freqToIndex(k.hz);
  // v3 字段约定：Peak → Q 用设计值 / S 占位 0.71(idx10)；搁架 → Q 占位 1.00(idx16) / S 用设计值
  const qIdx = k.pfield === 'Q' ? nearestIndex(PEQ_Q_TABLE, k.qs) : 16;
  const sIdx = k.pfield === 'S' ? nearestIndex(PEQ_S_TABLE, k.qs) : 10;

  const clamped = (n: number) => Math.max(0, Math.min(1, n));

  const giOf = (n: number) => {
    const x = clamped(n);
    if (!symmetric) {
      return clampGi(Math.round(noonGi + (loDb + x * (hiDb - loDb)) / TONE_GAIN_LSB));
    }
    const off = x <= 0.5 ? loGi * ((0.5 - x) / 0.5) : hiGi * ((x - 0.5) / 0.5);
    return clampGi(Math.round(noonGi + off));
  };

  return {
    regAddr: k.addr,
    min: 0,
    max: 0xFFFFFFFF,
    compute: (n: number) => buildPEQData(typ, fIdx, giOf(n), qIdx, sIdx),
    decode: (regVal: number) => {
      const gi = clampGi(parsePEQData(regVal).gain);
      const dB = (gi - noonGi) * TONE_GAIN_LSB;   // 相对 noon 的 dB
      if (!symmetric) return clamped((dB - loDb) / (hiDb - loDb));
      if (dB >= 0) return hiDb <= 0 ? 0.5 : clamped(0.5 + 0.5 * (dB / hiDb));
      return loDb >= 0 ? 0.5 : clamped(0.5 - 0.5 * (dB / loDb));
    },
  };
}

/* ── 主入口 ─────────────────────────────────────────────────────── */

/**
 * 按【型号索引】解析箱头旋钮 → 寄存器写入定义。
 * @returns 命中返回 defs；**未命中返回 null（调用方必须跳过写入，不可回退旧表）**
 */
export function ampLinkedDefs(ampIdx: number, knobLabel: string): AmpLinkedDef[] | null {
  const m = AMP_MODELS[ampIdx];
  if (!m) return null;
  const k = knobLabel.trim().toUpperCase();

  switch (k) {
    /* ★ 2026-10-20（用户拍板）：删除原 `case 'CLEAN'`（写 reg 78 削波级旁路）。
       级/库旁路位一律不写，见 passThrough.FORBIDDEN_REGS。 */
    case 'GAIN':
    case 'DR1':
    case 'DRIVE1': {
      /* ★ v10：行程 = 类别上限（CLEAN/BASS 20 · CRUNCH 25 · HIGH-GAIN 40 dB） */
      const fs = m.limit * 2;
      return [{ regAddr: 64, min: 0, max: fs, compute: (n: number) => Math.round(n * fs), decode: (r: number) => Math.min(1, Math.max(0, r / fs)) }];
    }
    case 'DRIVE':
    case 'DR2':
    case 'DRIVE2': {
      const fs = m.limit * 2;
      return [{ regAddr: 79, min: 0, max: fs, compute: (n: number) => Math.round(n * fs), decode: (r: number) => Math.min(1, Math.max(0, r / fs)) }];
    }
    case 'VOLUME':
    case 'VOL1':
    case 'VOLUME1':
      return [{
        regAddr: 66, min: VOL_MIN_REG, max: VOL_MAX_REG,
        compute: (n: number) => Math.round(VOL_MIN_REG + n * (VOL_MAX_REG - VOL_MIN_REG)),
        decode: (r: number) => (r - VOL_MIN_REG) / (VOL_MAX_REG - VOL_MIN_REG),
      }];
    case 'VOL2':
    case 'VOLUME2':
      return [{
        regAddr: 81, min: VOL_MIN_REG, max: VOL_MAX_REG,
        compute: (n: number) => Math.round(VOL_MIN_REG + n * (VOL_MAX_REG - VOL_MIN_REG)),
        decode: (r: number) => (r - VOL_MIN_REG) / (VOL_MAX_REG - VOL_MIN_REG),
      }];
    case 'MASTER':
      /* ★ v10：与 UI 量程对齐 —— reg 100…500（−40.0…0.0 dB），norm = (reg−100)/400
         例：norm 0.75 → 375 = −12.5 dB；norm 1.0 → 500 = 0 dB */
      return [{
        regAddr: 239, min: 100, max: 500,
        compute: (n: number) => Math.round(100 + n * 400),
        decode: (r: number) => Math.max(0, Math.min(1, (r - 100) / 400)),
      }];
    case 'DC1':
      return [{ regAddr: 65, min: 0, max: 100, compute: (n: number) => Math.round(n * 100), decode: (r: number) => r / 100 }];
    case 'DC2':
      return [{ regAddr: 80, min: 0, max: 100, compute: (n: number) => Math.round(n * 100), decode: (r: number) => r / 100 }];
    default:
      break;
  }

  // ── N8 音调旋钮：按型号 knobs[] 查（名称可能含 '/'，如 "TREBLE/CUT"） ──
  // ★ 先全名精确匹配：ac30tb 同时有 "TREBLE/CUT"@83 与 "CUT"@86，查 'CUT' 必须落 86；
  //   再回退分词匹配：查 'TREBLE' 应命中 "TREBLE/CUT"@83。
  const want = k.split('/').map((s) => s.trim());
  let hit = m.knobs.find((kk) => kk.name.trim().toUpperCase() === k);
  if (!hit) {
    hit = m.knobs.find((kk) => {
      const names = kk.name.split('/').map((s) => s.trim().toUpperCase());
      return names.some((nm) => want.includes(nm));
    });
  }
  return hit ? [toneDef(m, hit)] : null;
}

/** 该型号是否拥有某旋钮（供预设校验/UI 用） */
export function ampHasKnob(ampIdx: number, knobLabel: string): boolean {
  return ampLinkedDefs(ampIdx, knobLabel) !== null;
}

/**
 * 按【型号 key】解析（= `subModels['amp-head']` 的值）。
 * ★ v3.78：兼容 key / 英文显示名 / 旧中文全名 / 旧 id（老存档四种写法都认）。
 * @returns 型号不认识 / 该型号没有这个旋钮 → null（调用方必须跳过，不可回退旧表）
 */
export function ampLinkedDefsByName(ampName: string, knobLabel: string): AmpLinkedDef[] | null {
  const i = ampIndexByName(ampName);
  if (i < 0) return null;
  return ampLinkedDefs(i, knobLabel);
}

/** 型号 key / 英文名 / 别名 / 旧 id → AMP_MODELS 索引；不认识返回 −1 */
export function ampIndexByName(ampName: string | undefined): number {
  if (!ampName) return -1;
  return AMP_MODELS.findIndex((m) => m.key === ampName || m.name === ampName
    || (m.aliases ?? []).includes(ampName) || m.id === ampName);
}

/** 箱头非音调旋钮（反解用；DC1/DC2 UI 不显示，不纳入） */
const AMP_FIXED_KNOBS = ['GAIN', 'DRIVE', 'VOL1', 'VOL2', 'MASTER'];

/**
 * ★ 2026-11-24：箱头旋钮**反解**的唯一入口（与写入同一张 v3 表）。
 *   regs 里读不到的旋钮不出现在结果里；型号不认识返回 {}（**不回退旧表**）。
 */
export function ampDecodeKnobs(ampName: string | undefined, readReg: (addr: number) => number | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  const idx = ampIndexByName(ampName);
  if (idx < 0) return out;
  for (const label of [...AMP_FIXED_KNOBS, ...ampToneKnobs(idx)]) {
    const def = ampLinkedDefs(idx, label)?.[0];
    if (!def?.decode) continue;
    const v = readReg(def.regAddr);
    if (v === undefined) continue;
    out[label] = Math.max(0, Math.min(1, def.decode(v)));
  }
  return out;
}


/** 型号的 N8 旋钮名清单（如 ['TREBLE/CUT','BASS','MID','PRESENCE']） */
export function ampToneKnobs(ampIdx: number): string[] {
  return (AMP_MODELS[ampIdx]?.knobs ?? []).map((k) => k.name);
}
