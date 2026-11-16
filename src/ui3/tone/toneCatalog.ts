/**
 * 首页 · 全量型号目录
 *
 * 数据源：`data/pedalData.ts` 的原始 MODULES（绕过 uiTrim），
 *        默认值来自 presetData / presets / CABINET_PEQ，
 *        旋钮寄存器来自 parameterMap 的逐 capture 公式。
 *
 * 这里只做「UI 目录 + 寄存器换算」，不碰 BLE / 引擎。
 */
import {
  MODULES,
  splitSubModelName,
  type ModuleConfig,
  type SubModel,
} from '../../data/pedalData';
import {
  AMP_HEAD_HIDDEN,
  AMP_HEAD_KNOB_DEFAULTS,
  CHORUS_DEFAULTS,
  COMPRESSOR_DEFAULTS,
  OVERDRIVE_DEFAULTS,
} from '../../data/presetData';
import { CABINET_PEQ } from '../../data/cabinetPeqData';
import {
  getLegacyLinkedDefs,
  getLinkedParamDefs,
  getParamDef,
  buildPEQData,
  clampPEGgain,
  MSK_PEQ_GAIN,
  PEQ_FREQ_TABLE,
  RATIO_TABLE,
  parsePEQData,
  peqAdjustGain,
  peqExtractGain,
  peqGainToDb,
  type LinkedParamDef,
  type ParamDef,
} from '../../data/parameterMap';
import {
  TONE25_AMP_KNOBS,
  TONE25_CABS,
  TONE25_HEADS,
  type Tone25HeadSpec,
} from '../../data/_def/tone25';
import { OD10_MODELS } from '../../data/_def/od10';
import {
  AMP_PRE_ADDRS, OD_PRE_ADDRS, VARIANT_PREFIX, loadVariants, pickPreEqWords,
} from '../../data/peqVariants';

export type ToneFamily =
  | 'compressor'
  | 'overdrive'
  | 'amp-head'
  | 'cabinet'
  | 'chorus'
  | 'delay'
  | 'reverb'
  | 'dist';

export type ToneMode = 'guitar' | 'bass';
export type ToneArt = 'pedal' | 'amp' | 'cab';

export interface ToneRow {
  /** 存档 / 预设用的完整主键（amp/OD/cab 为 硬件/捕获） */
  key: string;
  family: ToneFamily;
  mode: ToneMode;
  /** 卡片标题：单块=型号名；箱头/箱体/过载=捕获名 */
  title: string;
  /** 硬件名（两级选择的第一级） */
  hardware: string;
  /** 捕获名（无捕获时为空） */
  capture?: string;
  captureIndex?: number;
  /** 分组：箱头 CLEAN/CRUNCH/HIGH GAIN/箱头；过载系列分组；箱体品牌 */
  group: string;
  /** 副标题数据 */
  series?: string;
  /** 实际旋钮（APK 原样） */
  knobs: string[];
  /** 归一化默认值 0…1 */
  defaults: Record<string, number>;
  /** 切换型号时下发的完整寄存器 */
  baseRegs: Record<number, number>;
  art: ToneArt;
  /** 箱头/箱体缩略图 */
  photo?: string;
  /** 25 型号箱头的默认主箱体 */
  primaryCabKey?: string;
  /** 25 型号箱头旋钮母版 */
  knobImage?: string;
  /** 25 型号箱头 GAIN 上限（dB）；旧型号不填 */
  ampLimit?: number;
  /** 子型号选择器中的一句介绍（中/英） */
  desc?: { zh: string; en: string };
  /** 新 OD 型号代码 / A-B-C 参考版本 */
  code?: string;
  variant?: 'A' | 'B' | 'C';
  /** 新 OD：旋钮 → POST EQ 寄存器；旋钮映射由 buildKnobWrites 动态换算 */
  eqRegs?: Record<string, number>;
  /** B/C 对照型号沿用旧电平范围（0…288），保证旧 capture 的电平可回到默认位 */
  levelRange?: [number, number];
  /** 主键别名（显示名 / id / 组合键），用于老存档反查 */
  aliases: string[];
  /* ── ★ 2026-11-16：PRE EQ 隐藏段（卡片翻面用） ──
     基座型号与 -1 变体都带这三个字段；变体只覆盖 words，其余跟随基座。 */
  /** 'od' = 44–47 / 'amp' = 59–62 + 74–77 */
  preEqKind?: 'od' | 'amp';
  /** 型号**原始**字（±12 的中心值；变体也保留基座原值） */
  preEqBase?: Record<number, number>;
  /** 变体的基座 key（普通型号为空） */
  variantOf?: string;
}

const STRIP_ADDRS = new Set([43, 48, 52, 58, 63, 67, 73, 78, 82]);

const AMP_PHOTO = {
  twin: '/assets/tone/amp-twin.jpg',
  jcm: '/assets/tone/amp-jcm.jpg',
  plexi: '/assets/tone/amp-plexi.jpg',
  rect: '/assets/tone/amp-rect.jpg',
  ac30: '/assets/tone/amp-ac30.jpg',
} as const;

const CAB_PHOTO = '/assets/tone/cab.jpg';

function moduleOf(id: string): ModuleConfig {
  const m = MODULES.find((x) => x.id === id);
  if (!m) throw new Error(`toneCatalog: missing module ${id}`);
  return m;
}

function stripRegs(src: Record<number, number>): Record<number, number> {
  const out: Record<number, number> = {};
  for (const [k, v] of Object.entries(src)) {
    const addr = Number(k);
    if (!STRIP_ADDRS.has(addr)) out[addr] = v;
  }
  return out;
}

function allModels(m: ModuleConfig): { sm: SubModel; mode: ToneMode }[] {
  return [
    ...(m.subModels?.guitar ?? []).map((sm) => ({ sm, mode: 'guitar' as const })),
    ...(m.subModels?.bass ?? []).map((sm) => ({ sm, mode: 'bass' as const })),
  ];
}

export function cleanHardwareName(name: string): string {
  return name.replace(/^B&F NAM\s+/i, '').replace(/^B&F\s+/i, '').trim();
}

function ampPhotoOf(hardware: string, group: string): string {
  const h = hardware.toLowerCase();
  if (/vox|ac30|ac15/.test(h)) return AMP_PHOTO.ac30;
  if (/marshall/.test(h)) return /jcm/.test(h) ? AMP_PHOTO.jcm : AMP_PHOTO.plexi;
  if (/fender|twin|deluxe|bassman|champ|princeton|super|hot rod/.test(h)) return AMP_PHOTO.twin;
  if (/mesa|rectifier|boogie/.test(h)) return AMP_PHOTO.rect;
  if (/^箱头/.test(group)) return AMP_PHOTO.rect;
  if (/clean 清音/i.test(group)) return AMP_PHOTO.twin;
  if (/crunch 过载/i.test(group)) return AMP_PHOTO.plexi;
  return AMP_PHOTO.rect;
}

/* ══════════════════ 公式反解 ══════════════════ */

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function invertCompute(compute: (n: number) => number, regValue: number): number {
  const lo = compute(0);
  const hi = compute(1);
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo === hi) return 0.5;

  const loU = lo >>> 0;
  const hiU = hi >>> 0;
  const peq = loU > 0xfffff && hiU > 0xfffff
    && ((loU & ~MSK_PEQ_GAIN) >>> 0) === ((hiU & ~MSK_PEQ_GAIN) >>> 0);
  const project = peq ? (v: number) => peqExtractGain(v >>> 0) : (v: number) => v;
  const target = project(regValue);

  const inc = project(hi) >= project(lo);
  let l = 0;
  let r = 1;
  for (let i = 0; i < 40; i++) {
    const m = (l + r) / 2;
    const cv = project(compute(m));
    if (cv === target) return m;
    if (inc ? cv < target : cv > target) l = m;
    else r = m;
  }
  return (l + r) / 2;
}

const COMP_ALIAS: Record<string, ParamDef> = {
  'PEAK REDUCTION': { regAddr: 8, min: 0, max: 50 },
  RECOVERY: { regAddr: 10, min: 0, max: 1999 },
  GAIN: { regAddr: 13, min: 0, max: 12 },
  MAKEUP: { regAddr: 13, min: 0, max: 12 },
};

function compDef(label: string): ParamDef | undefined {
  return getParamDef('compressor', label) ?? COMP_ALIAS[label];
}

/** APK 文档里的 FX 旋钮映射（parameterMap 只覆盖了部分标签） */
function fxDefs(family: ToneFamily, title: string, label: string): ResolvedDef[] | null {
  if (family === 'chorus') {
    /* 用户限定：RATE / WIDTH 只用 0…19（0.05…1.00 Hz），DEPTH 只用 0…5（1…6） */
    const table: Record<string, [number, number, number]> = {
      LEVEL: [216, 0, 20],
      RATE: [217, 0, 19],
      SPEED: [217, 0, 19],
      'RATE 1': [217, 0, 19],
      'RATE 2': [218, 0, 19],
      WIDTH: [218, 0, 19],
      DEPTH: [219, 0, 5],
      'DEPTH 1': [219, 0, 5],
      'DEPTH 2': [220, 0, 5],
    };
    const d = table[label];
    return d ? [{ regAddr: d[0], min: d[1], max: d[2] }] : null;
  }
  if (family === 'delay') {
    if (label === 'REPEAT' || label === 'FEEDBACK') return [{ regAddr: 222, min: 0, max: 75 }];
    if (label === 'TIME') return [{ regAddr: 223, min: 0, max: 500 }];
    return null;
  }
  if (family === 'reverb') {
    if (label === 'DWELL' || label === 'DECAY' || label === 'SIZE' || label === 'TIME') {
      return [{ regAddr: 226, min: 0, max: 80 }];
    }
    if (label === 'MIX') return [{ regAddr: 229, min: 0, max: 100 }];
    if (label === 'PRE' || label === 'PRE-DELAY' || label === 'SPREAD') {
      return [{ regAddr: 225, min: 0, max: 200 }];
    }
    if (label === 'HPF') return [{ regAddr: 227, min: 0, max: 205 }];
    if (label === 'LPF' || label === 'TONE' || label === 'HIGH CUT') {
      return [{ regAddr: 228, min: 0, max: 158 }];
    }
  }
  return null;
}

interface ResolvedDef {
  regAddr: number;
  min: number;
  max: number;
  compute?: (n: number, cur?: number) => number;
  decode?: (v: number) => number;
}

function defsFor(row: ToneRow, label: string): ResolvedDef[] {
  const direct = getLinkedParamDefs(row.key, label);
  if (direct?.length) return direct;

  if (row.levelRange && (label === 'LEVEL' || label === 'VOLUME' || label === 'OUTPUT')) {
    return [{ regAddr: 51, min: row.levelRange[0], max: row.levelRange[1] }];
  }

  /* 新 OD10：TONE/BASS/MID/TREBLE 固定使用文档 POST 频段。
     文档给出的捕获值是旋钮默认位置的锚点；默认值由 eqRegs 的 base word 保证，
     旋钮全程做 ±12 dB 增益扫描，不改变频点/滤波器类型/Q/S。 */
  const eqReg = row.eqRegs?.[label];
  if (eqReg !== undefined) {
    const base = row.baseRegs[eqReg];
    if (typeof base === 'number') {
      const p = parsePEQData(base);
      const anchor = clamp01(row.defaults[label] ?? 0.5);
      return [{
        regAddr: eqReg,
        min: 0,
        max: 0xffffffff,
        compute: (n: number) => buildPEQData(
          p.type,
          p.freq,
          clampPEGgain(p.gain + (clamp01(n) - anchor) * 120),
          p.q,
          p.s,
        ),
      }];
    }
  }

  const fx = fxDefs(row.family, row.title, label);
  if (fx?.length) return fx;

  if (row.family === 'chorus' || row.family === 'delay' || row.family === 'reverb') {
    const byTitle = getLinkedParamDefs(row.title, label);
    if (byTitle?.length) return byTitle;
  }

  const legacy = getLegacyLinkedDefs(row.family, label);
  if (legacy?.length) return legacy;

  if (row.family === 'compressor') {
    const d = compDef(label);
    if (d) return [d];
  }

  const mod = getParamDef(row.family, label);
  return mod ? [mod] : [];
}

const N4_ADDR: Record<string, number> = {
  TREBLE: 68,
  BASS: 69,
  MID: 70,
  PRESENCE: 71,
};

/** 25 型号箱头：7 旋钮 → 驱动 / N4 / 音量寄存器 */
function buildAmp25Writes(row: ToneRow, label: string, n: number): { reg: number; value: number }[] {
  const limit = row.ampLimit ?? 40;
  if (label === 'GAIN') return [{ reg: 64, value: Math.round(n * limit * 2) }];
  if (label === 'VOLUME') return [{ reg: 66, value: 166 + Math.round(n * 122) }];
  if (label === 'MASTER') return [{ reg: 239, value: 100 + Math.round(n * 400) }];
  const addr = N4_ADDR[label];
  if (addr === undefined) return [];
  const base = row.baseRegs[addr] ?? 0;
  return [{ reg: addr, value: peqAdjustGain(base, (n - 0.5) * 18) }];
}

/** 旋钮归一值 → 寄存器写入集 */
export function buildKnobWrites(row: ToneRow, label: string, norm: number): { reg: number; value: number }[] {
  const n = clamp01(norm);
  if (row.family === 'amp-head' && row.ampLimit) return buildAmp25Writes(row, label, n);
  const out: { reg: number; value: number }[] = [];
  for (const def of defsFor(row, label)) {
    const value = def.compute
      ? def.compute(n)
      : Math.round(def.min + n * (def.max - def.min));
    if (Number.isFinite(value)) out.push({ reg: def.regAddr, value });
  }
  return out;
}

/** 寄存器值 → 旋钮归一值 */
export function decodeKnob(row: ToneRow, label: string, regs: Record<number, number>): number | null {
  if (row.family === 'amp-head' && row.ampLimit) {
    const limit = row.ampLimit;
    if (label === 'GAIN') {
      const v = regs[64];
      return typeof v === 'number' ? clamp01(v / (limit * 2)) : null;
    }
    if (label === 'VOLUME') {
      const v = regs[66];
      return typeof v === 'number' ? clamp01((v - 166) / 122) : null;
    }
    if (label === 'MASTER') {
      const v = regs[239];
      return typeof v === 'number' ? clamp01((v - 100) / 400) : null;
    }
    const addr = N4_ADDR[label];
    if (addr !== undefined) {
      const v = regs[addr];
      const base = row.baseRegs[addr];
      if (typeof v !== 'number' || typeof base !== 'number') return null;
      const db = peqGainToDb(peqExtractGain(v)) - peqGainToDb(peqExtractGain(base));
      return clamp01(0.5 + db / 18);
    }
    return null;
  }
  const defs = defsFor(row, label);
  const def = defs[0];
  if (!def) return null;
  const regValue = regs[def.regAddr];
  if (regValue === undefined) return null;
  if (def.decode) return clamp01(def.decode(regValue));
  if (def.compute) return clamp01(invertCompute(def.compute, regValue));
  const span = def.max - def.min;
  return span ? clamp01((regValue - def.min) / span) : 0;
}

/** 从寄存器反解整套旋钮值（用于预设 / 切台同步） */
export function decodeRowKnobs(row: ToneRow, regs: Record<number, number>): Record<string, number> {
  const out: Record<string, number> = { ...row.defaults };
  for (const label of row.knobs) {
    const v = decodeKnob(row, label, regs);
    if (v !== null) out[label] = v;
  }
  return out;
}

/* ══════════════════ 物理量显示（拖动气泡 / 无障碍读数） ══════════════════ */

const fmtDb = (db: number) => `${db >= 0 ? '+' : ''}${db.toFixed(1)} dB`;

const fmtHz = (hz: number): string => {
  if (!hz) return 'OFF';
  if (hz < 100) return `${hz.toFixed(1)} Hz`;
  return hz < 1000 ? `${Math.round(hz)} Hz` : `${(hz / 1000).toFixed(2)} kHz`;
};

/** 归一值 → 带单位显示文本（用于拖动气泡；卡片上的静态读数按参考设计隐藏） */
export function formatKnobValue(row: ToneRow, label: string, norm: number): string {
  const n = clamp01(norm);
  const write = buildKnobWrites(row, label, n)[0];
  if (!write) return `${Math.round(n * 100)}%`;
  const { reg, value: v } = write;

  if (row.family === 'chorus') {
    if (reg === 216) return `${v - 20} dB`;
    if (reg === 217 || reg === 218) return `${(0.05 + v * 0.05).toFixed(2)} Hz`;
    if (reg === 219 || reg === 220) return String(v + 1);
  }
  if (row.family === 'delay') {
    if (reg === 223) return `${Math.round(v)} ms`;
    if (reg === 222) return `${Math.round(v)} %`;
  }
  if (row.family === 'reverb') {
    if (reg === 225) return `${Math.round(v)} ms`;
    if (reg === 226) return `${Math.round(v * 62.5)} ms`;
    if (reg === 227) return fmtHz(v <= 0 ? 0 : PEQ_FREQ_TABLE[Math.min(v, 205) - 1] ?? 0);
    if (reg === 228) return fmtHz(v >= 158 ? 0 : PEQ_FREQ_TABLE[Math.min(204 + v, PEQ_FREQ_TABLE.length - 1)] ?? 0);
    if (reg === 229) return `${Math.round(v)} %`;
  }
  if (row.family === 'compressor') {
    if (reg === 8) return `${Math.round(v)} dB`;
    if (reg === 9) return `${Math.round(v)} µs`;
    if (reg === 10) return `${Math.round(v)} ms`;
    if (reg === 11) return `${RATIO_TABLE[v] ?? v}:1`;
    if (reg === 13) return `${Math.round(v)} dB`;
  }
  if (row.family === 'amp-head') {
    if (reg === 64 || reg === 79) return `${(v * 0.5).toFixed(1)} dB`;
    if (reg === 66 || reg === 81) return `${((v - 288) * 0.25).toFixed(2)} dB`;
    if (reg === 239) return v <= 0 ? '−∞' : `${((v - 500) * 0.1).toFixed(1)} dB`;
    if (v > 0xffff) return fmtDb(peqGainToDb(parsePEQData(v).gain));
  }
  if (row.family === 'overdrive' || row.family === 'dist') {
    if (reg === 49) return `${(v * 0.5).toFixed(1)} dB`;
    if (reg === 51) return `${((v - 288) * 0.25).toFixed(2)} dB`;
    if (v > 0xffff) return fmtDb(peqGainToDb(parsePEQData(v).gain));
  }
  return `${Math.round(n * 100)}%`;
}

/* ══════════════════ 默认值 helpers ══════════════════ */

function defaultsForAmp(key: string, knobs: string[]): Record<string, number> {
  const d = AMP_HEAD_KNOB_DEFAULTS[key] ?? {};
  const out: Record<string, number> = {};
  for (const k of knobs) {
    const v = d[k];
    out[k] = typeof v === 'number' ? clamp01(v) : 0.5;
  }
  return out;
}

function buildAmpBase(key: string): Record<number, number> {
  const hidden = AMP_HEAD_HIDDEN[key] ?? {};
  const out = stripRegs(hidden);
  delete out[78];
  delete out[79];
  delete out[81];
  const d = AMP_HEAD_KNOB_DEFAULTS[key] ?? {};
  out[79] = Math.round((d.GAIN ?? 0.5) * 92);
  out[81] = 248 + Math.round((d.VOLUME ?? 0.5) * 40);
  out[239] = Math.round((d.MASTER ?? 0.5) * 500);
  out[57] = 0;
  out[72] = 0;
  return out;
}

function buildCabBase(key: string): Record<number, number> {
  const bands = CABINET_PEQ[key] ?? [];
  const out: Record<number, number> = { 107: 0 };
  for (let i = 0; i < Math.min(35, bands.length); i++) out[108 + i] = bands[i];
  out[254] = 47;
  out[255] = 1;
  out[256] = 150;
  out[257] = 40;
  out[258] = 12;
  out[259] = 0;
  return out;
}

function buildChorusBase(title: string): { base: Record<number, number>; defaults: Record<string, number> } {
  const d = CHORUS_DEFAULTS[title];
  const base: Record<number, number> = { 215: 0 };
  const defaults: Record<string, number> = {};
  if (d) {
    for (const [k, v] of Object.entries(d.knobs)) {
      defaults[k] = clamp01(v);
      const row: ToneRow = {
        key: '', family: 'chorus', mode: 'guitar', title, hardware: '', group: '',
        knobs: [], defaults: {}, baseRegs: base, art: 'pedal', aliases: [],
      };
      for (const w of buildKnobWrites(row, k, v)) base[w.reg] = w.value;
    }
    for (const [a, v] of Object.entries(d.hidden)) base[Number(a)] = v;
  }
  return { base, defaults };
}

function buildReverbBase(title: string): { base: Record<number, number>; defaults: Record<string, number> } {
  const table: Record<string, Record<number, number>> = {
    Spring: { 225: 20, 226: 20, 227: 80, 228: 90, 229: 30 },
    Hall: { 225: 30, 226: 45, 227: 40, 228: 70, 229: 28 },
    Plate: { 225: 10, 226: 35, 227: 60, 228: 110, 229: 25 },
    Room: { 225: 5, 226: 12, 227: 70, 228: 95, 229: 20 },
    Ambient: { 225: 50, 226: 75, 227: 30, 228: 60, 229: 40 },
    Cathedral: { 225: 50, 226: 67, 227: 40, 228: 100, 229: 45 },
    'Bass Room': { 225: 5, 226: 24, 227: 60, 228: 90, 229: 25 },
    'Bass Hall': { 225: 20, 226: 48, 227: 35, 228: 80, 229: 35 },
  };
  return { base: { 224: 0, ...(table[title] ?? table.Hall) }, defaults: {} };
}

function buildDelayBase(title: string): { base: Record<number, number>; defaults: Record<string, number> } {
  const base = /Digital/i.test(title)
    ? { 221: 0, 222: 30, 223: 375 }
    : { 221: 0, 222: 33, 223: 230 };
  return { base, defaults: {} };
}

/* ══════════════════ 构建目录 ══════════════════ */

function pushPedal(
  out: ToneRow[],
  family: ToneFamily,
  mode: ToneMode,
  knobs: string[],
  baseRegs: Record<number, number>,
  defaults: Record<string, number>,
  title: string,
  hardware: string,
  group: string,
  aliases: string[],
  art: ToneArt = 'pedal',
) {
  out.push({
    key: title,
    family,
    mode,
    title,
    hardware,
    group,
    knobs,
    defaults,
    baseRegs,
    art,
    aliases,
  });
}

const COMP_DESC: Record<string, { zh: string; en: string }> = {
  'mxr-dyna': { zh: '经典 OTA 压缩，甜厚 sustain；适合 Funk、Pop、Country。', en: 'Classic OTA compression with sweet sustain; funk, pop and country.' },
  'boss-cs2': { zh: 'Boss 风格压缩，Attack 可调；适合 Rock、Pop 与清音。', en: 'Boss-style compression with adjustable attack; rock, pop and clean.' },
  la2a: { zh: '电子管光学压缩，平滑自然；适合人声、吉他与贝斯。', en: 'Tube optical compression, smooth and natural; vocals, guitar and bass.' },
  'urei-1176': { zh: 'FET 快速压缩，攻击/释放可调；适合 Rock、金属与鼓。', en: 'Fast FET compression with attack/release; rock, metal and drums.' },
  'neve-33609': { zh: 'Neve 二极管桥压缩，厚实；适合总线与贝斯。', en: 'Neve diode-bridge compression, thick; bus and bass.' },
  distressor: { zh: '多功能 FET 压缩，带谐波染色；适合 Rock、金属与鼓。', en: 'Versatile FET compression with harmonic color; rock, metal and drums.' },
  'dbx-163-b': { zh: 'dbx 压缩，干净快速；适合贝斯与现场。', en: 'Clean, fast dbx compression; bass and live use.' },
  'summit-tla': { zh: '电子管光学压缩，温暖平滑；适合贝斯与人声。', en: 'Tube optical compression, warm and smooth; bass and vocals.' },
  'keeley-bass': { zh: '贝斯专用压缩，操作简单；适合 Funk、Rock。', en: 'Bass-specific compression, simple to dial; funk and rock.' },
  'manley-vari': { zh: 'Vari-Mu 电子管压缩，慢速自然；适合总线与贝斯。', en: 'Vari-Mu tube compression, slow and natural; bus and bass.' },
  'ebs-multi': { zh: 'EBS 多段压缩；适合贝斯 Slap 与指弹。', en: 'EBS multi-band compression; bass slap and fingerstyle.' },
};

function buildCompressor(): ToneRow[] {
  const out: ToneRow[] = [];
  for (const { sm, mode } of allModels(moduleOf('compressor'))) {
    const d = COMPRESSOR_DEFAULTS[sm.name];
    const base = { ...(d?.allRegs ?? {}) };
    base[7] = 0;
    const defaults = d ? { ...d.knobs } : {};
    for (const k of sm.knobs ?? []) {
      if (typeof defaults[k] !== 'number') {
        const row: ToneRow = {
          key: sm.name, family: 'compressor', mode, title: sm.name, hardware: sm.name,
          group: '', knobs: sm.knobs ?? [], defaults: {}, baseRegs: base, art: 'pedal', aliases: [],
        };
        defaults[k] = decodeKnob(row, k, base) ?? 0.5;
      }
    }
    pushPedal(out, 'compressor', mode, sm.knobs ?? [], base, defaults, sm.name, sm.name, '', [sm.id], 'pedal');
    const row = out[out.length - 1];
    const display = cleanHardwareName(sm.name);
    row.title = display;
    row.hardware = display;
    row.aliases = [sm.id, sm.name, display];
    row.desc = COMP_DESC[sm.id];
  }
  return out;
}

function buildOverdrive(family: 'overdrive' | 'dist'): ToneRow[] {
  const out: ToneRow[] = [];
  for (const { sm, mode } of allModels(moduleOf(family))) {
    const group = sm.group ?? '';
    const display = sm.display || sm.name;
    for (const cap of sm.captures ?? []) {
      const key = `${sm.name}/${cap.pos}`;
      const d = OVERDRIVE_DEFAULTS[key];
      const base = { ...(d?.allRegs ?? {}) };
      for (const a of STRIP_ADDRS) delete base[a];
      base[42] = 0;
      const knobs = sm.knobs ?? [];
      const defaults = d ? { ...d.knobs } : {};
      const row: ToneRow = {
        key, family, mode, title: cap.label, hardware: display,
        capture: cap.label, series: sm.name, group,
        knobs, defaults: {}, baseRegs: base, art: 'pedal',
        aliases: [cap.pos, key, sm.name, display],
      };
      for (const k of knobs) {
        if (typeof defaults[k] !== 'number') defaults[k] = decodeKnob(row, k, base) ?? 0.5;
      }
      row.defaults = defaults;
      out.push(row);
    }
  }
  return out;
}

function buildOd10(): ToneRow[] {
  return OD10_MODELS.map((spec) => ({
    key: spec.key,
    family: 'overdrive' as const,
    mode: spec.category,
    title: spec.name,
    hardware: spec.display,
    group: spec.group,
    knobs: [...spec.knobs],
    defaults: { ...spec.defaults },
    baseRegs: { ...spec.baseRegs, 42: 0, 43: 0, 48: 0, 52: 0 },
    art: 'pedal' as const,
    desc: { zh: spec.descZh, en: spec.descEn },
    code: spec.code,
    variant: spec.variant,
    eqRegs: { ...spec.eqRegs },
    aliases: [...spec.aliases],
    /* ★ 2026-11-16：PRE EQ 隐藏段（翻面可调，保存为 -1） */
    preEqKind: 'od' as const,
    preEqBase: pickPreEqWords(spec.baseRegs, OD_PRE_ADDRS),
  }));
}

function buildAmp(): ToneRow[] {
  const out: ToneRow[] = [];
  for (const { sm, mode } of allModels(moduleOf('amp-head'))) {
    const hardware = cleanHardwareName(sm.name);
    for (const cap of sm.captures ?? []) {
      const key = `${sm.name}/${cap.pos}`;
      const knobs = sm.knobs ?? [];
      const defaults = defaultsForAmp(key, knobs);
      out.push({
        key,
        family: 'amp-head',
        mode,
        title: cap.label,
        hardware,
        capture: cap.label,
        captureIndex: (sm.captures ?? []).indexOf(cap),
        group: sm.group ?? '',
        knobs,
        defaults,
        baseRegs: buildAmpBase(key),
        art: 'amp',
        photo: ampPhotoOf(sm.name, sm.group ?? ''),
        aliases: [cap.pos, key, sm.name, hardware],
      });
    }
  }
  return out;
}

function buildCabinet(): ToneRow[] {
  const out: ToneRow[] = [];
  for (const { sm, mode } of allModels(moduleOf('cabinet'))) {
    const hardware = cleanHardwareName(sm.name);
    for (const cap of sm.captures ?? []) {
      const key = `${sm.name}/${cap.pos}`;
      out.push({
        key,
        family: 'cabinet',
        mode,
        title: cap.label,
        hardware,
        capture: cap.label,
        captureIndex: (sm.captures ?? []).indexOf(cap),
        group: sm.group ?? '',
        knobs: [],
        defaults: {},
        baseRegs: buildCabBase(key),
        art: 'cab',
        photo: CAB_PHOTO,
        aliases: [cap.pos, key, sm.name, hardware],
      });
    }
  }
  return out;
}

/* ══════════════════ 25 + 25 固定型号 ══════════════════ */

function amp25Defaults(h: Tone25HeadSpec): Record<string, number> {
  const regs = h.baseRegs;
  const out: Record<string, number> = {};
  for (const k of TONE25_AMP_KNOBS) {
    if (k === 'GAIN') out[k] = clamp01((regs[64] ?? 0) / (h.gainLimit * 2));
    else if (k === 'VOLUME') out[k] = clamp01(((regs[66] ?? 216) - 166) / 122);
    else if (k === 'MASTER') out[k] = clamp01(((regs[239] ?? 500) - 100) / 400);
    else out[k] = 0.5;
  }
  return out;
}

function buildAmp25(): ToneRow[] {
  return TONE25_HEADS.map((h) => ({
    key: h.key,
    family: 'amp-head' as const,
    mode: h.category,
    title: h.display,
    hardware: h.display,
    group: '',
    knobs: [...TONE25_AMP_KNOBS],
    defaults: amp25Defaults(h),
    baseRegs: { ...h.baseRegs },
    art: 'amp' as const,
    photo: h.image,
    primaryCabKey: h.primaryCabKey,
    knobImage: h.knobImage,
    ampLimit: h.gainLimit,
    desc: { zh: h.descZh, en: h.descEn },
    aliases: [h.key, h.code, h.display, h.sourceTag],
    /* ★ 2026-11-16：PRE EQ 隐藏段 = N1(59–62) + N5(74–77) */
    preEqKind: 'amp' as const,
    preEqBase: pickPreEqWords(h.baseRegs, AMP_PRE_ADDRS),
  }));
}

function buildCab25Base(h: (typeof TONE25_CABS)[number]): Record<number, number> {
  const out: Record<number, number> = { 107: 0, 253: 0 };
  for (let i = 0; i < Math.min(35, h.bands.length); i++) out[108 + i] = h.bands[i];
  out[254] = 47;
  out[255] = 1;
  out[256] = 150;
  out[257] = 40;
  out[258] = 12;
  out[259] = 0;
  return out;
}

function buildCab25(): ToneRow[] {
  return TONE25_CABS.map((h) => ({
    key: h.key,
    family: 'cabinet' as const,
    mode: h.category,
    title: h.sub,
    hardware: h.top,
    group: '',
    knobs: [],
    defaults: {},
    baseRegs: buildCab25Base(h),
    art: 'cab' as const,
    photo: h.image,
    desc: { zh: h.descZh, en: h.descEn },
    aliases: [h.key, h.code, h.top, h.sub, h.sourceTag],
  }));
}

export const CHORUS_FIXED_KNOBS = ['RATE 1', 'RATE 2', 'DEPTH 1', 'DEPTH 2', 'LEVEL'] as const;
export const REVERB_FIXED_KNOBS = ['PRE-DLY', 'TIME', 'HPF', 'LPF', 'MIX'] as const;
export const DELAY_FIXED_KNOBS = ['TIME', 'REPEAT'] as const;

/* 固定合唱：不再按型号切换。RATE 限 0…19、DEPTH 限 0…5，沿用旧 APK 限制。 */
function buildChorusFixed(): ToneRow {
  const base: Record<number, number> = { 215: 0, 216: 20, 217: 4, 218: 5, 219: 2, 220: 2 };
  const defaults: Record<string, number> = {
    'RATE 1': 4 / 19, 'RATE 2': 5 / 19, 'DEPTH 1': 2 / 5, 'DEPTH 2': 2 / 5, LEVEL: 1,
  };
  return {
    key: 'chorus-fixed', family: 'chorus', mode: 'guitar', title: 'CHORUS', hardware: 'CHORUS',
    group: '', knobs: [...CHORUS_FIXED_KNOBS], defaults, baseRegs: base, art: 'pedal',
    aliases: ['chorus-fixed', 'CHORUS'],
  };
}

/* 固定混响：五个寄存器全部开放；不再按型号切换。 */
function buildReverbFixed(): ToneRow {
  const base: Record<number, number> = { 224: 0, 225: 20, 226: 20, 227: 80, 228: 90, 229: 30 };
  const defaults: Record<string, number> = {
    'PRE-DLY': 20 / 200, TIME: 20 / 80, HPF: 80 / 205, LPF: 90 / 158, MIX: 30 / 100,
  };
  return {
    key: 'reverb-fixed', family: 'reverb', mode: 'guitar', title: 'REVERB', hardware: 'REVERB',
    group: '', knobs: [...REVERB_FIXED_KNOBS], defaults, baseRegs: base, art: 'pedal',
    aliases: ['reverb-fixed', 'REVERB'],
  };
}

function buildDelayFixed(): ToneRow {
  const base: Record<number, number> = { 221: 0, 222: 33, 223: 230 };
  const defaults: Record<string, number> = { TIME: 230 / 500, REPEAT: 33 / 75 };
  return {
    key: 'delay-fixed', family: 'delay', mode: 'guitar', title: 'DELAY', hardware: 'DELAY',
    group: '', knobs: [...DELAY_FIXED_KNOBS], defaults, baseRegs: base, art: 'pedal',
    aliases: ['delay-fixed', 'DELAY'],
  };
}

function buildFx(family: 'chorus' | 'delay' | 'reverb'): ToneRow[] {
  if (family === 'chorus') return [buildChorusFixed()];
  if (family === 'reverb') return [buildReverbFixed()];
  return [buildDelayFixed()];
}

export const COMP_MODELS = buildCompressor();
export const OD_MODELS = buildOd10();
export const DIST_MODELS = buildOverdrive('dist');
export const AMP_MODELS = buildAmp25();
export const CAB_MODELS = buildCab25();
export const CHORUS_MODELS = buildFx('chorus');
export const DELAY_MODELS = buildFx('delay');
export const REVERB_MODELS = buildFx('reverb');

export const FX_MODELS: Record<'chorus' | 'delay' | 'reverb', ToneRow[]> = {
  chorus: CHORUS_MODELS,
  delay: DELAY_MODELS,
  reverb: REVERB_MODELS,
};

export const FAMILY_ROWS: Record<ToneFamily, ToneRow[]> = {
  compressor: COMP_MODELS,
  overdrive: OD_MODELS,
  'amp-head': AMP_MODELS,
  cabinet: CAB_MODELS,
  chorus: CHORUS_MODELS,
  delay: DELAY_MODELS,
  reverb: REVERB_MODELS,
  dist: DIST_MODELS,
};

/** 首页所有可选行（不含独立的失真模块） */
export const HOME_ROWS: ToneRow[] = [
  ...COMP_MODELS,
  ...OD_MODELS,
  ...AMP_MODELS,
  ...CAB_MODELS,
  ...CHORUS_MODELS,
  ...DELAY_MODELS,
  ...REVERB_MODELS,
];

export const HOME_ROW_COUNT = HOME_ROWS.length;

/* ══════════════════ ★ 2026-11-16：PRE EQ 变体（-1）动态行 ══════════════════
 *
 * 型号表是模块加载时算好的常量，而"保存 -1"发生在运行中。这里把基座数量记下来，
 * 每次保存后只重建尾巴上的变体行（基座下标绝不偏移，避免影响别的索引）。
 */
const AMP_BASE_COUNT = AMP_MODELS.length;
const OD_BASE_COUNT = OD_MODELS.length;

function buildVariantRow(base: ToneRow, v: ReturnType<typeof loadVariants>[number]): ToneRow {
  const regs: Record<number, number> = { ...base.baseRegs };
  for (const [a, w] of Object.entries(v.words)) regs[Number(a)] = w >>> 0;
  return {
    ...base,
    key: v.id,
    title: v.name,
    hardware: v.name,
    aliases: [v.id, v.baseKey, base.key, base.hardware, v.name],
    baseRegs: regs,
    /* ±12 的中心永远是**基座原值**，变体保存后再调也不会漂移 */
    preEqBase: base.preEqBase,
    variantOf: v.baseKey,
  };
}

/** 重建变体行（保存 / 删除后调用；TonePage 负责触发一次重渲染） */
export function refreshVariantRows(): void {
  AMP_MODELS.length = AMP_BASE_COUNT;
  OD_MODELS.length = OD_BASE_COUNT;
  const list = loadVariants();
  for (const v of list) {
    const family: ToneFamily = v.kind === 'amp' ? 'amp-head' : 'overdrive';
    const pool = family === 'amp-head' ? AMP_MODELS : OD_MODELS;
    const base = pool.find((r) => r.key === v.baseKey);
    if (!base) continue;
    pool.push(buildVariantRow(base, v));
  }
}

/* 冷启动：先把已保存的 -1 塞进型号表，重启后仍能选中 / 还原 */
refreshVariantRows();


export function findRow(family: ToneFamily, key: string | undefined | null): ToneRow | undefined {
  if (!key) return undefined;
  const rows = FAMILY_ROWS[family] ?? [];
  const hit = rows.find((r) => r.key === key)
    ?? rows.find((r) => r.aliases.includes(key))
    ?? rows.find((r) => r.title === key);
  if (hit) return hit;
  /* ★ 2026-11-16：变体被删除 / 换机 / 导入他人音色 → **回落到原型号**，
     而不是让调用方掉到列表第一项（那会变成完全不同的音色）。 */
  if (key.startsWith(VARIANT_PREFIX)) {
    return findRow(family, key.slice(VARIANT_PREFIX.length));
  }
  return undefined;
}

export function defaultRow(family: ToneFamily, key?: string): ToneRow {
  return findRow(family, key) ?? FAMILY_ROWS[family][0];
}

/** 25 型号主搭配：箱头 → 默认箱体 */
export function primaryCabOfAmp(ampKey?: string | null): ToneRow | undefined {
  if (!ampKey) return undefined;
  const amp = findRow('amp-head', ampKey);
  return amp?.primaryCabKey ? findRow('cabinet', amp.primaryCabKey) : undefined;
}

/** 箱体 → 主箱头；优先保留当前箱头（同一个箱体可能被多个箱头共用） */
export function primaryAmpOfCab(cabKey?: string | null, preferredAmpKey?: string | null): ToneRow | undefined {
  if (!cabKey) return undefined;
  const preferred = preferredAmpKey ? findRow('amp-head', preferredAmpKey) : undefined;
  if (preferred?.primaryCabKey === cabKey) return preferred;
  const spec = TONE25_HEADS.find((h) => h.primaryCabKey === cabKey);
  return spec ? findRow('amp-head', spec.key) : undefined;
}

/** 切换型号 / 开关时实际下发的寄存器（含目标开关态） */
export function buildSelectRegs(row: ToneRow, on: boolean): Record<number, number> {
  const regs: Record<number, number> = { ...row.baseRegs };
  const bypass = (addr: number) => { regs[addr] = on ? 0 : 1; };
  switch (row.family) {
    case 'compressor': bypass(7); break;
    case 'overdrive': bypass(42); break;
    case 'amp-head': bypass(57); bypass(72); break;
    case 'cabinet': bypass(107); break;
    case 'chorus': bypass(215); break;
    case 'delay': bypass(221); break;
    case 'reverb': bypass(224); break;
    default: break;
  }
  return regs;
}

/** 同型号捕获的显示后缀 */
export function captureTag(row: ToneRow): string {
  if (!row.capture) return '';
  return `#${(row.captureIndex ?? 0) + 1}`;
}

export function siblingRows(row: ToneRow): ToneRow[] {
  /* 新箱体是「一型号一 IR」，左右翻页应跨同模式全部箱体，而不是空列表。 */
  if (row.family === 'cabinet' && !row.capture) {
    return FAMILY_ROWS.cabinet.filter((r) => r.mode === row.mode);
  }
  if (!row.capture) return [row];
  return FAMILY_ROWS[row.family].filter((r) => r.hardware === row.hardware && r.mode === row.mode);
}

export function splitKey(key: string): { hardware: string; pos?: string } {
  return splitSubModelName(key);
}

export const TONE_ASSETS = {
  cab: CAB_PHOTO,
  grille: '/assets/tone/grille.jpg',
  stomp: '/assets/tone/stomp.png',
};
