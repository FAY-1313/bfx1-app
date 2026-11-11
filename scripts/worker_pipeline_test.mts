// Node 端全流水线测试: 用真实模型跑 worker.split, 断言 sum(stems) ≈ mix.
import * as ort from 'onnxruntime-web';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const msgs: any[] = [];
(globalThis as any).self = {
  postMessage: (m: any) => msgs.push(m),
};

const { split, __setSessions } = await import('../src/workers/stemWorker.ts');
const STEMS = ['vocals', 'drums', 'bass', 'other'];

// 从 buffer 加载 4 个真实模型
const sess: any = {};
for (const stem of STEMS) {
  const p = path.join(process.cwd(), 'public/assets/models', `spleeter-5stem-${stem}-mask.onnx`);
  const buf = await readFile(p);
  sess[stem] = await ort.InferenceSession.create(buf, { executionProviders: ['wasm'] });
}
__setSessions(sess);

// 合成 2.5s 双声道混音
const sr = 44100, n = Math.floor(sr * 2.5);
const mix = new Float32Array(n * 2);
for (let i = 0; i < n; i++) {
  const t = i / sr;
  mix[i * 2] = 0.4 * Math.sin(2 * Math.PI * 440 * t) + 0.3 * Math.sin(2 * Math.PI * 110 * t) + 0.2 * Math.sin(2 * Math.PI * 990 * t + 1);
  mix[i * 2 + 1] = 0.4 * Math.sin(2 * Math.PI * 523 * t) + 0.3 * Math.sin(2 * Math.PI * 82 * t) + 0.2 * Math.sin(2 * Math.PI * 1046 * t + 2);
}

const t0 = Date.now();
await split(mix, 2, sr, n);
console.log('wall ms:', Date.now() - t0);

const result = msgs.find(m => m.type === 'result');
if (!result) { console.log('NO RESULT', JSON.stringify(msgs)); process.exit(1); }
const sum = new Float32Array(n * 2);
let maxErr = 0, rmsNum = 0, rmsDen = 0;
for (const stem of result.stems) {
  const d = stem.data;
  for (let i = 0; i < n * 2; i++) {
    sum[i] += d[i];
    const e = Math.abs(d[i]);
    if (e > maxErr) maxErr = e;
  }
}
for (let i = 0; i < n * 2; i++) {
  const diff = sum[i] - mix[i];
  rmsNum += diff * diff;
  rmsDen += mix[i] * mix[i];
}
const rms = 10 * Math.log10(rmsNum / rmsDen + 1e-20);
console.log(`stems peak=${maxErr.toFixed(3)}  sum-vs-mix residual=${rms.toFixed(1)} dB`);
console.log('progress msgs:', msgs.filter(m => m.type === 'progress').map(m => m.pct).join(','));
