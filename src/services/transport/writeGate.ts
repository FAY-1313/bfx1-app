/**
 * BLE 写节奏闸门（★ 2026-11-24：从 services/bleService.ts 的 _acquireWriteSlot 原样抽出，逻辑未改）。
 *
 *  ① FIFO 串行：每个写请求接到锁尾，同一时刻只有一个写在飞；
 *  ② 最小间隔：距上一次写**结束**不足 gapMs 时先补足（EA 20ms / EB 5ms，由调用方传入）；
 *  ③ 排队硬上限：前一个持有者 slotTimeoutMs 内仍不 release（插件 promise 永不 settle），
 *     重建锁让本次直接拿到时隙 —— 宁可和失联的上一次写重叠一次，也不能整条写链路死锁。
 */
export class WriteGate {
  /** 上一次 BLE 写【结束】的时间戳(ms)。闸门据此补足最小间隔。 */
  private _lastEndAt = 0;
  /** 串行化锁尾: 每个写请求接到链尾, 保证 FIFO 且同一时刻只有一个写在飞。 */
  private _lock: Promise<void> = Promise.resolve();

  /** 会话级重置（新连接 / 断线） */
  reset(): void {
    this._lock = Promise.resolve();
    this._lastEndAt = 0;
  }

  /** 排队拿写时隙；返回的 release 必须在写完后调用（重复调用无害） */
  async acquire(gapMs: number, slotTimeoutMs: number): Promise<() => void> {
    let release!: () => void;
    const mine = new Promise<void>((res) => { release = res; });
    const prev = this._lock;
    this._lock = prev.then(() => mine);

    /* ★★ v3.75（H5）：排队等待加**硬上限**。
       若上一个持有者因插件 promise 永不 settle 而没 release，这里原本会永远挂着 →
       整条写链路死锁（连 duckOff 都发不出去）。超时后重建锁，让本次直接拿到时隙，
       代价是可能和"失联的上一次写"重叠一次，比永久静音好得多。 */
    const stuck = await new Promise<boolean>((res) => {
      const t = setTimeout(() => res(true), slotTimeoutMs);
      prev.then(() => { clearTimeout(t); res(false); });
    });
    if (stuck) {
      console.warn(`[BLE] 写时隙等待超时 ${slotTimeoutMs / 1000}s —— 重建锁继续（上一次写已失联）`);
      this._lock = mine;
    }

    const wait = this._lastEndAt + gapMs - Date.now();
    if (wait > 0) await new Promise((res) => setTimeout(res, wait)); // ② 补足最小间隔
    let done = false;
    return () => {
      if (done) return;                            // 防重复 release
      done = true;
      this._lastEndAt = Date.now();
      release();
    };
  }
}
