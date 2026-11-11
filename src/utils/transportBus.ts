// ─── 传输互斥总线: Drum / Looper / Rec / Stem 全局唯一播放 ─────────
// 2026-09-03 (#70): 六问题审查确认互斥语义 = 全局唯一播放 — 同一时刻只允许
// 一个发声面板的传输在唱歌 (Looper/Drum/Rec/Stem 不可叠放).
//
// 背景: StudioPanel 6 面板全部常驻挂载 (切 Tab 只 display:none), 若各自为政,
// 切 Tab 后旧面板的循环/序列仍在发声 → 两段音乐叠成噪音. 旧实现无任何互斥.
//
// 总线以「claim 声明占用」工作, 与各面板自身的 stop 实现解耦:
//   - 开始发声前  claimTransport(scope, stopSelf) — 若已被其他 scope 占用,
//     立刻回调其 stopSelf 使其停止; 然后本 scope 成为唯一占用者.
//     重复 claim 同一 scope 仅刷新 stopSelf (幂等, 不会误停自己).
//   - 自然停止 / 失活 / 卸载时 releaseTransport(scope) — 清占用.
// 约定: stopSelf 必须幂等 (重复调用安全), 且内部应调用 releaseTransport 自清.
// 只处理「持续发声的传输」; 麦克风采集 (Rec 录音 / Looper 首录) 与节拍器不算发声,
// 不占用总线 → 保留「跟着鼓点录第一轨」的经典工作流.

export type TransportScope = 'drum' | 'looper' | 'rec' | 'stem';

let activeScope: TransportScope | null = null;
const stopFns = new Map<TransportScope, () => void>();

/** 开始发声前声明占用; 若他 scope 在唱 → 先停掉它, 再成为唯一占用者. */
export function claimTransport(scope: TransportScope, stopSelf: () => void): void {
  if (activeScope && activeScope !== scope) {
    const fn = stopFns.get(activeScope);
    if (fn) {
      try { fn(); } catch (e) { console.error('[transportBus] stop failed:', activeScope, e); }
    }
  }
  activeScope = scope;
  stopFns.set(scope, stopSelf);
}

/** 该 scope 已停止/失活/卸载 → 清除占用, 避免陈旧 stopSelf 残留被误调. */
export function releaseTransport(scope: TransportScope): void {
  if (activeScope === scope) {
    activeScope = null;
    stopFns.delete(scope);
  }
}

/** 当前占用总线的传输 (调试/断言用). */
export function getActiveTransportScope(): TransportScope | null {
  return activeScope;
}
