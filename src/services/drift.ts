/**
 * ★★ v3.70（2026-10-24）：漂移补丁（drift patch）
 *
 * 预存的切换包有一个前提：**切换前的硬件状态 == 当前格的数据**。
 * 用户在首页手拧几个旋钮，这个前提就破了 —— 差异包里没有这几个地址，
 * 切走后它们会停在旋钮值上（例如上一格低频 +3，这一格低频 0，结果是 +3）。
 *
 * 做法极轻：`onParam` 写任何一个地址时记进本 Set；切换时把这些地址按
 * **目标格**取值追加到批次尾部；切完清空。正常情况集合为空，零开销。
 *
 * 边界（必须知道）：
 *   · 用户直接在硬件面板上拧旋钮，App 看不到 → 记不进 drift。
 *   · 所以保留两条硬兜底：连接后第一次切换、drift > 20 条时走全量包。
 */
const drift = new Set<number>();

/** 记录一个被 App 改过的地址（2 / 261 不在切换包范围内，不记） */
export function markDrift(addr: number): void {
  if (!Number.isFinite(addr) || addr === 2 || addr === 261) return;
  drift.add(addr);
}

/** 取出并清空（切换开始前调用） */
export function takeDrift(): number[] {
  const list = [...drift];
  drift.clear();
  return list;
}

export function clearDrift(): void {
  drift.clear();
}

/**
 * ★★ v3.75（H4）：把 `takeDrift()` 取走但**没写成功**的地址放回去。
 *
 * 原来失败分支只 `return`，drift 已被清空 → 下一次切换不会重写这些地址，
 * 手拧过的参数会永久残留（App 还误以为硬件 == 目标格）。
 */
export function restoreDrift(addrs: readonly number[]): void {
  for (const a of addrs) {
    if (!Number.isFinite(a) || a === 2 || a === 261) continue;
    drift.add(a);
  }
}
