// ─── 端侧 Spleeter 分轨服务 ────────────────────────────────────────
// 单例 Web Worker: 跨"分轨 tab"开关保留已加载的 4 个 ONNX 模型 (76MB),
// 避免每次进入都重下. 暴露:
//   getStemWorker()         拿到 worker (首次创建)
//   onStemMessage()         订阅 worker 消息 (组件卸载时退订, worker 不终止)
//   ensureStemDeviceInit()  幂等发起模型加载, 返回 Promise<已加载模型数>
//                            (并发多次调用共享同一 Promise, 不会重复 post init)
//   isStemDeviceReady()     模型是否就绪 (跨挂载记忆)
//   disposeStemWorker()     终止 worker (释放内存)

let worker: Worker | null = null;
let listeners = new Set<(msg: any) => void>();
let readyCount = 0;
let initInFlight = false;
let readyResolvers: Array<(count: number) => void> = [];
let initTimeout: ReturnType<typeof setTimeout> | null = null;

const MODEL_BASE: string = (import.meta as any).env?.BASE_URL || '/';

export function getStemWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('../workers/stemWorker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent) => {
      const msg = e.data;
      if (msg?.type === 'ready') {
        readyCount = msg.count ?? 4;
        initInFlight = false;
        if (initTimeout) { clearTimeout(initTimeout); initTimeout = null; }
        const rs = readyResolvers; readyResolvers = [];
        for (const r of rs) r(readyCount);
      } else if (msg?.type === 'error') {
        initInFlight = false;
        readyCount = 0;
        if (initTimeout) { clearTimeout(initTimeout); initTimeout = null; }
        const rs = readyResolvers; readyResolvers = [];
        for (const r of rs) r(0);
      }
      for (const l of listeners) l(msg);
    };
  }
  return worker;
}

export function onStemMessage(l: (msg: any) => void): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

export function isStemDeviceReady(): boolean {
  return readyCount >= 4;
}

/** 发起(或复用)模型加载, 返回已加载模型数 (4=成功). 150s 超时按失败处理. */
export function ensureStemDeviceInit(): Promise<number> {
  const w = getStemWorker();
  if (isStemDeviceReady()) return Promise.resolve(4);
  if (!initInFlight) {
    initInFlight = true;
    w.postMessage({ type: 'init', modelBase: MODEL_BASE });
    initTimeout = setTimeout(() => {
      initInFlight = false;
      const rs = readyResolvers; readyResolvers = [];
      for (const r of rs) r(0);
    }, 150000);
  }
  return new Promise<number>(resolve => { readyResolvers.push(resolve); });
}

export function disposeStemWorker(): void {
  if (initTimeout) { clearTimeout(initTimeout); initTimeout = null; }
  worker?.terminate();
  worker = null;
  listeners.clear();
  readyCount = 0;
  initInFlight = false;
  readyResolvers = [];
}
