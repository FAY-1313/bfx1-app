/* ══════════════════════════════════════════════════════════════════════════
 * 频道切换成本表 —— **由 _verify/channels_v1.json 自动生成，勿手改**
 *
 * 含义：固件三表引擎里，每个目标频道的前切表 / 后切表有多少帧、其中多少帧是
 *       旁路（重建类）帧。角标耗时由 data/switchCost.ts 的模型算出。
 *
 * 方向定义（与固件 tone_slot.c 一致，最容易写反）：
 *   PRESET_QUICK[to][0] = PREV[to] = 从 prev(to) 切进 to   ← 后退（往小号走）
 *   PRESET_NEXT[to][1] = NEXT[to] = 从 next(to) 切进 to   ← 前进（往大号走）
 *
 * ★ 2026-10-30：固件 quick_rebuild 会给每个方向**强制补 7 条**
 *   「合唱/延迟参数预置帧」（216–220 / 222 / 223），即使和邻格同值也会写 ——
 *   目的是让切档只翻开关、不在算法运行中改参数。本表已把这 7 条算进帧数。
 * ══════════════════════════════════════════════════════════════════════════ */

/** [frames, bypassFrames] —— 下标 0 = 频道 1（占位），1..16 有效 */
export const PRESET_QUICK: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [11, 1],   //  1 A1: 前切 11 帧 / bypass 1
  [10, 1],   //  2 A2: 前切 10 帧 / bypass 1
  [ 9, 0],   //  3 A3: 前切 9 帧 / bypass 0
  [ 9, 0],   //  4 A4: 前切 9 帧 / bypass 0
  [36, 4],   //  5 B1: 前切 36 帧 / bypass 4
  [22, 2],   //  6 B2: 前切 22 帧 / bypass 2
  [29, 1],   //  7 B3: 前切 29 帧 / bypass 1
  [33, 1],   //  8 B4: 前切 33 帧 / bypass 1
  [36, 2],   //  9 C1: 前切 36 帧 / bypass 2
  [18, 1],   // 10 C2: 前切 18 帧 / bypass 1
  [39, 0],   // 11 C3: 前切 39 帧 / bypass 0
  [28, 1],   // 12 C4: 前切 28 帧 / bypass 1
  [24, 2],   // 13 D1: 前切 24 帧 / bypass 2
  [19, 1],   // 14 D2: 前切 19 帧 / bypass 1
  [30, 1],   // 15 D3: 前切 30 帧 / bypass 1
  [30, 2],   // 16 D4: 前切 30 帧 / bypass 2
];
/** 同上的「后切」表（与此表同构，分开存便于读方向） */
export const PRESET_NEXT: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [10, 1],   //  1 A1: 后切 10 帧 / bypass 1
  [ 9, 0],   //  2 A2: 后切 9 帧 / bypass 0
  [ 9, 0],   //  3 A3: 后切 9 帧 / bypass 0
  [11, 1],   //  4 A4: 后切 11 帧 / bypass 1
  [22, 2],   //  5 B1: 后切 22 帧 / bypass 2
  [29, 1],   //  6 B2: 后切 29 帧 / bypass 1
  [33, 1],   //  7 B3: 后切 33 帧 / bypass 1
  [36, 4],   //  8 B4: 后切 36 帧 / bypass 4
  [18, 1],   //  9 C1: 后切 18 帧 / bypass 1
  [39, 0],   // 10 C2: 后切 39 帧 / bypass 0
  [28, 1],   // 11 C3: 后切 28 帧 / bypass 1
  [36, 2],   // 12 C4: 后切 36 帧 / bypass 2
  [19, 1],   // 13 D1: 后切 19 帧 / bypass 1
  [30, 1],   // 14 D2: 后切 30 帧 / bypass 1
  [30, 2],   // 15 D3: 后切 30 帧 / bypass 2
  [24, 2],   // 16 D4: 后切 24 帧 / bypass 2
];
/** 跨组 / 开机：16 格全量 117 参数帧 + 9 个旁路帧（253 由固件另加，不计） */
export const PRESET_FULL: readonly [number, number] = [117, 9];

/**
 * 查某条边的成本。
 * @param from 起始频道 1..16
 * @param to   目标频道 1..16
 * @returns [frames, bypass] —— 组内返回快切表，跨组 / 原地返回全量；无效返回 null
 */
export function presetEdgeCost(from: number, to: number): [number, number] | null {
  if (from < 1 || from > 16 || to < 1 || to > 16) return null;
  const gFrom = Math.floor((from - 1) / 4);
  const gTo = Math.floor((to - 1) / 4);
  if (gFrom !== gTo) {
    /* 跨 A 组边界时固件要额外写一条 253（限幅旁路）：
     *   进 A 组 → 253=1（真直通）；离开 A 组 → 253=0（否则限幅永久关，污染后面的音色）
     * 253 也在 dsp_rebuild_addrs 里，所以是 +1 帧、+1 个 300ms 窗口。
     * A↔A 不跨组；B→C / C→D 两边都不是 A，253 不变，不写。 */
    const fromA = from <= 4;
    const toA = to <= 4;
    if (fromA !== toA) return [PRESET_FULL[0] + 1, PRESET_FULL[1] + 1];
    return [PRESET_FULL[0], PRESET_FULL[1]];
  }
  const iFrom = (from - 1) % 4;
  const iTo = (to - 1) % 4;
  if (iFrom === iTo) return [0, 0];
  /* 前进一格 → 用目标的 NEXT；后退一格 → 用目标的 PREV
   * 组首尾也算相邻：A1 的上一格是 A4、A4 的下一格是 A1 */
  const forward = (iFrom + 1) % 4 === iTo;
  const row = forward ? PRESET_NEXT[to] : PRESET_QUICK[to];
  return row ? [row[0], row[1]] : null;
}
