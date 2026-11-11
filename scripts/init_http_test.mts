// 验证 worker.init(httpBase) 的 URL 加载路径 (wasmPaths + 4 模型), 与 WebView 一致.
const msgs: any[] = [];
(globalThis as any).self = { postMessage: (m: any) => msgs.push(m) };
const { init, __setSessions } = await import('../src/workers/stemWorker.ts');

const base = 'http://localhost:8867/public/';
const t0 = Date.now();
try {
  await init(base);
  console.log('init ok, ready msgs:', JSON.stringify(msgs.filter(m => m.type === 'ready')));
  console.log('model progress:', msgs.filter(m => m.stage === 'model').map(m => `${m.stem}=${m.pct}%`).join(' '));
  console.log('wall ms:', Date.now() - t0);
} catch (e) {
  console.log('init FAILED:', e);
  process.exit(1);
}
