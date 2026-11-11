/**
 * BFX1 · 箱体分组（纯函数，可被 _verify 脚本直接跑）
 *
 * ★★ 2026-10-26 抽出的原因：
 *   v3.79 的映射表写在 HomePanel 的 popupItems 里，键还是 v3.78 之前的**中文组名**
 *   （'清音箱体' / '英式 4x12' …），而 `CabSet.group` 英文化后是
 *   Clean / Crunch / High Gain / UK 4x12 / US Open Back / Bass …
 *   → 全部命中 `?? fallback` → 28 个箱体只剩 CLEAN / BASS 两个页签，
 *     CRUNCH 与 HI-GAIN 永远是空的（v3.79 回归）。
 *
 *   现在把「组名 → 四类」放在这里单独一份，HomePanel 只负责渲染，
 *   `_verify/check_v380.ts` 可以直接断言「每个页签都不为空」。
 *
 * 用户口径（2026-10-26）：「箱体只有 20 多个，不要分组太多」→ 固定四类，
 *   与箱头共用同一套命名，2×12 / 4×12 不再拆开。
 */

/** 数据里的 `CabSet.group` 真实取值 → 四类 */
export const CAB_GROUP_MAP: Record<string, string> = {
  /* ① 小尺寸 / 开背 / 清音系 */
  Clean: 'CLEAN',
  'US Open Back': 'CLEAN',
  'US 1x12': 'CLEAN',
  'US 4x10': 'CLEAN',
  Single: 'CLEAN',
  /* ② 英式 / 摇滚系 */
  Crunch: 'CRUNCH',
  'UK 2x12': 'CRUNCH',
  'UK 4x12': 'CRUNCH',
  /* ③ 现代 / 高增益 */
  'High Gain': 'HI-GAIN',
  'US High Gain': 'HI-GAIN',
  /* ④ 贝斯 */
  Bass: 'BASS',
};

/** 分组显示名（中文界面用；英文界面直接用键） */
export const CAB_GROUP_LABEL: Record<string, string> = {
  CLEAN: 'CLEAN · 清音',
  CRUNCH: 'CRUNCH · 摇滚',
  'HI-GAIN': 'HI-GAIN · 高增益',
  BASS: 'BASS · 贝斯',
};

/** 页签固定顺序（即使某组暂时为空也不打乱位置） */
export const CAB_GROUP_ORDER = ['CLEAN', 'CRUNCH', 'HI-GAIN', 'BASS'] as const;

/**
 * 一组同名箱体（同型号不同麦克风）→ 归属四类之一。
 * 兜底顺序：已知 group → category==='bass' → CRUNCH（绝不默认 CLEAN，
 *   否则任何没登记的组都会悄悄堆进第一页，看不出漏配）。
 */
export function cabGroupOf(sets: { group?: string; category?: string }[]): string {
  const first = sets[0];
  const g = CAB_GROUP_MAP[first?.group ?? ''];
  if (g) return g;
  if (first?.category === 'bass') return 'BASS';
  return 'CRUNCH';
}
