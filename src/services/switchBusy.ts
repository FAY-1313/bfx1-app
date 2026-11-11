/**
 * ★★ v3.58（2026-10-24）：切换 / 写入期间的全局忙碌锁
 *
 * 为什么放在模块级而不是组件 state：
 *   `handleSlotSelect` 在 PresetsPanel 里，`applyLoadedTone` 在 Index 里，
 *   而遮罩要渲染在 Index 顶层 —— 三者跨组件，用模块级单例最省事，
 *   也保证「同步可读」（`isBusy()` 不受 React 批处理影响，避免连点穿透）。
 *
 * 约定：
 *   · `isBusy() === true` 时，任何用户操作型写入口都必须直接返回
 *   · 遮罩文案由发起方给：切档给「切换中 · 档位名 · 帧数」，写入给「x / y」
 *   · 所有路径结束都必须 endBusy()，否则界面会卡住（放在 finally 里）
 */
export type BusyInfo = { label: string; sub?: string } | null;

let current: BusyInfo = null;
let timer: ReturnType<typeof setTimeout> | null = null;
const subs = new Set<(b: BusyInfo) => void>();

function emit() {
  for (const f of subs) { try { f(current); } catch { /* ignore */ } }
}

export function getBusy(): BusyInfo {
  return current;
}

export function isBusy(): boolean {
  return current !== null;
}

/** 进入忙碌（同步置位，立即生效） */
export function beginBusy(label: string, sub?: string): void {
  if (timer) { clearTimeout(timer); timer = null; }
  current = { label, sub };
  emit();
}

/** 只更新副标题（分批写入的进度用，不重建遮罩） */
export function updateBusySub(sub?: string): void {
  if (!current) return;
  current = { ...current, sub };
  emit();
}

export function endBusy(): void {
  if (timer) { clearTimeout(timer); timer = null; }
  if (current === null) return;
  current = null;
  emit();
}

/** 定时结束：切档这种「发完就交给硬件」的路径用（时长按目标频道条数估） */
export function endBusyAfter(ms: number): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    if (current !== null) { current = null; emit(); }
  }, ms);
}

export function subscribeBusy(fn: (b: BusyInfo) => void): () => void {
  subs.add(fn);
  return () => { subs.delete(fn); };
}
