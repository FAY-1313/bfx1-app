/**
 * BFX1 箱头参数来源 · 可切换模块
 *
 * ════════════════════════════════════════════════════════════════════
 *  ★★ 换一行就能在新旧参数之间切换 ★★
 * ════════════════════════════════════════════════════════════════════
 *
 *   'v8'     —— 新参数（2026-10-06 定稿）
 *              22 型号 · 单模式 · regs 57–98 一整条链（N1→N4→N5→N8）
 *              数据源：_def/ampHeadDef.ts（双重校验通过）
 *              特点：GAIN=64 · DRIVE=79 · VOL1=66 · VOL2=81 · MASTER=239
 *                    每型号 N8 音调旋钮 1~5 个
 *
 *   'legacy' —— 旧参数（2026-09-25 v14 · 备份于 04_开发文档/备份_箱头参数_旧参数_20261007/）
 *              37 个短名 / 312 个 capture 键 · regs 72–98（N5→N8）
 *              57–71（N1→N4）由独立的 dist 模块提供
 *              数据源：_gen/amp_params2.ts + _gen/amp_hidden.ts
 *              特点：79=GAIN · 81=Volume · 无 DC/无 N4
 *
 * ⚠️ 两者【型号阵容不同】—— 旧 37 个（含 Bogner/Diezel/Dumble/ENGL/EVH/Friedman/Orange/
 *    PRS/Randall/Revv/Roland/Xotic 等），新 22 个（Fender/Marshall/Vox/Mesa/Peavey/Soldano/
 *    Hiwatt + 5 个贝斯）。交集约 13 个，见 KEY_MAP。
 */
import { AMP_MODELS, type AmpModel, type AmpKnob } from '../_def/ampHeadDef';
import { AMP_HEAD_HIDDEN, AMP_HEAD_KNOB_DEFAULTS } from '../presetData';

/** ★★★ 箱头参数来源开关 —— 改这里 ★★★ */
export const AMP_PARAM_SOURCE: 'v8' | 'legacy' = 'v8';

/** MASTER（reg 239）· 全局参数，非型号参数 */
export const AMP_MASTER_ADDR = 239;
/** UI 只给 40 dB：reg 100…500 = −40.0…0.0 dB，步进 0.1 */
export const AMP_MASTER_MIN = 100;
export const AMP_MASTER_MAX = 500;
export const AMP_MASTER_DEF = 500;   // ★ 2026-10-20：默认拉满 0 dB（原 375 = −12.5 dB）

/* ══════════════════════════════════════════════════════════════════
 * 新旧型号对照（同型号才有；用于 A/B 对比与 legacy 键 → v8 索引）
 * ══════════════════════════════════════════════════════════════════ */
export const KEY_MAP: Record<string, string> = {
  // v8 id            → legacy 短名（AMP_DEFAULTS2 键的 `/` 后半段，去 _N）
  'twin':       'Fender Twin Reverb',
  'bassman':    'Fender Bassman',
  'ac30tb':     'Vox AC30',
  'jcm800':     'Marshall JCM800',
  'dualrect':   'Mesa Dual Rectifier',
  '5150':       'Peavey 5150',
  'slo100':     'Soldano SLO',
  'plexy':      'Marshall Plexi',
  'jtm45':      'Marshall JTM45',
  'dr103':      'Hiwatt',
  'champ':      'Fender Champ',
  'princeton':  'Fender Princeton',
  'deluxe':     'Fender Deluxe Reverb',
  'superrev':   'Fender Super Reverb',
  // v8 独有（legacy 无对应）：twinsf / twin5c8 / bandmaster / ac360 / svt / betabass / l4bass / ts50b
  // legacy 独有（v8 无对应）：Bogner/Diezel/Dumble/ENGL/EVH/Friedman/Orange/PRS/Randall/
  //                          Revv/Roland JC120/Xotic BB/Mesa Mark/Fender Hot Rod/JCM900/JVM/DSL/6505
};

/* ══════════════════════════════════════════════════════════════════
 * 统一接口
 * ══════════════════════════════════════════════════════════════════ */
export interface AmpParams {
  /** 型号显示名 */
  name: string;
  /** 类别（决定 GAIN/DRIVE 上限） */
  /** ★ 2026-10-19：含 CUSTOM（用户导出的固定音色箱头，不进 v8 解析路径） */
  cls: 'CLEAN' | 'CRUNCH' | 'HIGH-GAIN' | 'BASS' | 'CUSTOM';
  /** GAIN / DRIVE 上限 dB */
  limit: number;
  /** ★ 该型号的寄存器全图（v8: 57–98；legacy: 72–98，57–71 由 dist 提供） */
  regs: Record<number, number>;
  /** N8 音调旋钮（仅 v8 有；legacy 为空数组） */
  knobs: AmpKnob[];
  /** 数据来源 */
  source: 'v8' | 'legacy';
}

/* ── v8 ── */
export function listV8(): { id: string; name: string; cls: string; limit: number }[] {
  return AMP_MODELS.map((m) => ({ id: m.id, name: m.name, cls: m.cls, limit: m.limit }));
}
export function getV8ById(id: string): AmpModel | null {
  return AMP_MODELS.find((m) => m.id === id) ?? null;
}
export function getV8ByIndex(i: number): AmpModel | null {
  return AMP_MODELS[i] ?? null;
}

/* ── legacy ── */
/** legacy 短名 → 该型号的全部 capture 键 */
export function listLegacyShortNames(): string[] {
  const s = new Set<string>();
  for (const k of Object.keys(AMP_HEAD_HIDDEN)) {
    const base = k.split('/').pop() ?? k;
    s.add(base.replace(/_\d+$/, ''));
  }
  return [...s].sort();
}
/** 取 legacy 参数（按完整 capture 键或短名，取第一个匹配） */
export function getLegacy(keyOrShort: string): AmpParams | null {
  let full: string | undefined = AMP_HEAD_HIDDEN[keyOrShort] ? keyOrShort
    : Object.keys(AMP_HEAD_HIDDEN).find((k) => (k.split('/').pop() ?? k).replace(/_\d+$/, '') === keyOrShort);
  if (!full) return null;
  const regs = { ...(AMP_HEAD_HIDDEN[full] ?? {}) };
  regs[AMP_MASTER_ADDR] = AMP_MASTER_DEF;   // 239 不在旧表里，补默认
  const kd = AMP_HEAD_KNOB_DEFAULTS[full] ?? {};
  // 旧表没有类别信息 → 按 GAIN 甜点粗判（仅用于上限）
  const g = kd.GAIN ?? 0.5;
  const cls: AmpParams['cls'] = g >= 0.65 ? 'HIGH-GAIN' : g >= 0.4 ? 'CRUNCH' : 'CLEAN';
  const limit = cls === 'HIGH-GAIN' ? 40 : cls === 'CRUNCH' ? 30 : 20;
  return { name: full, cls, limit, regs, knobs: [], source: 'legacy' };
}

/* ── 统一入口 ── */
/**
 * 按当前 `AMP_PARAM_SOURCE` 解析一个箱头。
 * @param v8Index  v8 型号索引（新 UI 用）
 * @param legacyKey legacy capture 键或短名（旧 UI 用）
 */
export function resolveAmp(v8Index: number, legacyKey?: string): AmpParams | null {
  if (AMP_PARAM_SOURCE === 'v8') {
    const m = getV8ByIndex(v8Index);
    if (!m) return null;
    return { name: m.name, cls: m.cls, limit: m.limit,
             regs: { ...m.regs }, knobs: m.knobs, source: 'v8' };
  }
  if (!legacyKey) return null;
  return getLegacy(legacyKey);
}

/** 当前来源下的型号清单（给弹窗用） */
export function listAmps(): { key: string; name: string; sub: string }[] {
  if (AMP_PARAM_SOURCE === 'v8') {
    return AMP_MODELS.map((m, i) => ({
      key: String(i), name: m.name,
      sub: `${m.cls}（≤${m.limit} dB）· ${m.knobs.length} 音调旋钮`,
    }));
  }
  return listLegacyShortNames().map((s) => {
    const n = Object.keys(AMP_HEAD_HIDDEN).filter(
      (k) => (k.split('/').pop() ?? k).replace(/_\d+$/, '') === s).length;
    return { key: s, name: s, sub: `${n} 个 capture` };
  });
}

export { AMP_MODELS };
export type { AmpModel, AmpKnob };
