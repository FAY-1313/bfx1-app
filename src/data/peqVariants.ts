/**
 * BFX1 · PRE EQ 隐藏参数变体（★ 2026-11-16 用户拍板）
 *
 * 需求来源：
 *   过载 / 箱头卡片左下角加一个翻转图标，翻到背面露出 PRE EQ 隐藏段，
 *   调好后「保存」生成一个新模块 `<原名>-1`；再次保存覆盖同一条，不再生成 -2。
 *
 * 寄存器口径（逐个解码 25 台箱头 + 10 台过载得出）：
 *   · 过载 PRE EQ：44–47（44 恒为 1 阶 HPF，46 或 47 恒为 1 阶 LPF）
 *   · 箱头两组  ：N1 = 59–62（59 为 1 阶 HPF）
 *                 N5 = 74–77（77 为 1 阶 LPF）
 *   → 每台只有 2–6 段带"增益"，HPF/LPF 段只能调频率（用户已选方案 A）。
 *
 * 增益范围：硬件 PEQ 增益字段 = 0…180 → −24.0…+12.0 dB（0.2 dB/LSB）。
 *   "±12" 以**型号原值**为中心，超出硬件范围由 clamp 截断，
 *   旋钮位置按实际 dB 反算（原值已经 +8 dB 时，往上只能再 +4）。
 *
 * 存储：localStorage（本机），每台箱头 / 每个过载各一条，key 固定为
 *   `custom-peq-<baseKey>` —— 纯 ASCII、可被存档清洗器识别（custom- 前缀）。
 */
import {
  parsePEQData, buildPEQData, peqSetGain, peqGainToDb, dbToPeqGain,
  PEQ_FREQ_TABLE, freqToIndex,
} from './peqCodec';

export type PreEqKind = 'od' | 'amp';

/** 过载 PRE EQ 四段（PreOD） */
export const OD_PRE_ADDRS: readonly number[] = [44, 45, 46, 47];
/** 箱头两组：N1 59–62 + N5 74–77 */
export const AMP_PRE_ADDRS: readonly number[] = [59, 60, 61, 62, 74, 75, 76, 77];

/** 变体主键前缀（必须保留 `custom-`，存档清洗器靠它放行未注册型号） */
export const VARIANT_PREFIX = 'custom-peq-';

export interface PeqVariant {
  /** `custom-peq-<baseKey>` */
  id: string;
  kind: PreEqKind;
  baseKey: string;
  /** 显示名（原名 + "-1"） */
  name: string;
  /** 仅保存 PRE EQ 那几段（addr → uint32），其余参数仍跟随原型号 */
  words: Record<number, number>;
  createdAt: number;
  updatedAt: number;
}

const KEY = 'bfx_peq_variants_v1';

/* ══════════════════ 主键工具 ══════════════════ */

export function variantIdOf(baseKey: string): string {
  return `${VARIANT_PREFIX}${baseKey}`;
}

export function isVariantKey(key?: string | null): boolean {
  return !!key && key.startsWith(VARIANT_PREFIX);
}

/** 变体 → 原型号 key；普通型号原样返回 */
export function baseKeyOf(key?: string | null): string {
  if (!key) return '';
  return isVariantKey(key) ? key.slice(VARIANT_PREFIX.length) : key;
}

/* ══════════════════ 存储 ══════════════════ */

export function loadVariants(): PeqVariant[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter((v) => v && typeof v.baseKey === 'string' && typeof v.name === 'string'
      && (v.kind === 'od' || v.kind === 'amp') && v.words && typeof v.words === 'object');
  } catch {
    return [];
  }
}

function saveAll(list: PeqVariant[]): void {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* 配额满 → 静默 */ }
}

export function findVariant(kind: PreEqKind, baseKey: string): PeqVariant | undefined {
  const id = variantIdOf(baseKey);
  return loadVariants().find((v) => v.id === id && v.kind === kind);
}

/**
 * 新建 / 覆盖同一条变体。
 * ★ 用户要求「再点保存也覆盖 -1，不再生成新文件」→ id 只由 baseKey 决定。
 */
export function upsertVariant(
  kind: PreEqKind,
  baseKey: string,
  name: string,
  words: Record<number, number>,
): PeqVariant {
  const id = variantIdOf(baseKey);
  const list = loadVariants();
  const now = Date.now();
  const prev = list.find((v) => v.id === id);
  const next: PeqVariant = {
    id,
    kind,
    baseKey,
    name,
    words: { ...words },
    createdAt: prev?.createdAt ?? now,
    updatedAt: now,
  };
  saveAll(prev ? list.map((v) => (v.id === id ? next : v)) : [...list, next]);
  return next;
}

export function removeVariant(id: string): void {
  saveAll(loadVariants().filter((v) => v.id !== id));
}

/** 供 modelKey 反查：变体也参与 key 解析 */
export function variantRefs(kind: PreEqKind): Array<{ key: string; name: string }> {
  return loadVariants()
    .filter((v) => v.kind === kind)
    .map((v) => ({ key: v.id, name: v.name }));
}

/** 从寄存器表里取出该族要暴露的 PRE EQ 段 */
export function pickPreEqWords(regs: Record<number, number>, addrs: readonly number[]): Record<number, number> {
  const out: Record<number, number> = {};
  for (const a of addrs) {
    const v = regs[a];
    if (typeof v === 'number') out[a] = v >>> 0;
  }
  return out;
}

/* ══════════════════ 旋钮口径 ══════════════════ */

export type PreEqMode = 'gain' | 'freq';

export interface PreEqKnob {
  addr: number;
  mode: PreEqMode;
  /** 旋钮下方的短标签（P1 / LOW / HPF …） */
  label: string;
}

/** 带增益的 PEQ 类型：PEAK / LOW_SHELF / HIGH_SHELF / ALL_PASS */
const GAIN_TYPES = new Set([0, 1, 2, 3]);
const HPF_TYPES = new Set([4, 6]);
const LPF_TYPES = new Set([5, 7]);

const TYPE_LABEL: Record<number, string> = {
  0: 'PEAK', 1: 'LOW', 2: 'HIGH', 3: 'PHASE', 4: 'HPF', 5: 'LPF', 6: 'HPF', 7: 'LPF',
};

/**
 * 生成背面旋钮描述。
 * 段类型来自**该段真实字**（不是型号写死），所以同一台过载换型号也不会错。
 * PEAK 段直接带当前频点（用户要求：PEAK 类显示频点值），
 * 其余段用滤波器类型（LOW / HIGH / HPF / LPF）。
 */
export function preEqKnobs(addrs: readonly number[], words: Record<number, number>): PreEqKnob[] {
  return addrs.map((addr) => {
    const p = parsePEQData(words[addr] ?? 0);
    if (GAIN_TYPES.has(p.type)) {
      if (p.type === 0) {
        const hz = PEQ_FREQ_TABLE[p.freq] ?? 0;
        return { addr, mode: 'gain' as const, label: `PEAK ${hz >= 1000 ? `${(hz / 1000).toFixed(1)}k` : Math.round(hz)}` };
      }
      return { addr, mode: 'gain' as const, label: TYPE_LABEL[p.type] ?? 'GAIN' };
    }
    return { addr, mode: 'freq' as const, label: TYPE_LABEL[p.type] ?? 'FREQ' };
  });
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/** 频率型段的可调范围（Hz）；原值在范围外时自动把范围扩到包含原值 */
function freqRange(type: number, baseHz: number): [number, number] {
  const lo0 = HPF_TYPES.has(type) ? 20 : 3000;
  const hi0 = HPF_TYPES.has(type) ? 1000 : 16000;
  return [Math.min(lo0, baseHz), Math.max(hi0, baseHz)];
}

/** 当前字 → 旋钮归一值（0…1），中心 0.5 = 型号原值 */
export function preEqNorm(addr: number, word: number, baseWord: number): number {
  const w = parsePEQData(word ?? 0);
  const b = parsePEQData(baseWord ?? 0);
  if (GAIN_TYPES.has(w.type)) {
    const cur = peqGainToDb(w.gain);
    const base = peqGainToDb(b.gain);
    return clamp01(0.5 + (cur - base) / 24);
  }
  const hz = PEQ_FREQ_TABLE[w.freq] ?? 0;
  const baseHz = PEQ_FREQ_TABLE[b.freq] ?? (HPF_TYPES.has(w.type) ? 100 : 8000);
  const [lo, hi] = freqRange(w.type, baseHz);
  return clamp01((hz - lo) / Math.max(1, hi - lo));
}

/** 旋钮归一值 → 新字（只改增益 / 频点，类型 Q S 原样保留） */
export function applyPreEqNorm(
  addr: number, word: number, baseWord: number, norm: number,
): number {
  const n = clamp01(norm);
  const w = parsePEQData(word ?? 0);
  if (GAIN_TYPES.has(w.type)) {
    const base = peqGainToDb(parsePEQData(baseWord ?? 0).gain);
    const dB = Math.max(-24, Math.min(12, base + (n - 0.5) * 24));
    return peqSetGain(word >>> 0, dbToPeqGain(dB)) >>> 0;
  }
  const baseHz = PEQ_FREQ_TABLE[parsePEQData(baseWord ?? 0).freq] ?? 0;
  const [lo, hi] = freqRange(w.type, baseHz);
  const hz = lo + n * (hi - lo);
  return buildPEQData(w.type, freqToIndex(hz), w.gain, w.q, w.s) >>> 0;
}

/** 旋钮读数（拖拽时显示） */
export function preEqText(word: number, mode: PreEqMode): string {
  const p = parsePEQData(word ?? 0);
  if (mode === 'gain') {
    const db = peqGainToDb(p.gain);
    return `${db > 0 ? '+' : ''}${db.toFixed(1)} dB`;
  }
  const hz = PEQ_FREQ_TABLE[p.freq] ?? 0;
  return hz >= 1000 ? `${(hz / 1000).toFixed(2)} kHz` : `${Math.round(hz)} Hz`;
}
