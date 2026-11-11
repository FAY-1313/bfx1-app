import { readFile } from 'node:fs/promises';
const msgs: any[] = [];
(globalThis as any).self = { postMessage: (m: any) => msgs.push(m) };
const { split, __setSessions } = await import('../src/workers/stemWorker.ts');

// 伪 session: 恒定输出 0.0 (sigmoid=0.5), 使 4 轨 Wiener 比例相等 0.25 → 每轨 = mix/4
const MOCK_SIZE = 2 * 512 * 1024;
const mockData = new Float32Array(MOCK_SIZE).fill(0.0);
const sess: any = {};
for (const stem of ['vocals', 'drums', 'bass', 'other']) {
  sess[stem] = {
    run: async () => ({ y: { data: mockData, dims: [1, 2, 512, 1024] } }),
  };
}
__setSessions(sess);

const sr = 44100, n = Math.floor(sr * 1.0);
const mix = new Float32Array(n * 2);
for (let i = 0; i < n; i++) {
  const t = i / sr;
  mix[i * 2] = 0.4 * Math.sin(2 * Math.PI * 440 * t) + 0.2 * Math.sin(2 * Math.PI * 990 * t + 1);
  mix[i * 2 + 1] = 0.4 * Math.sin(2 * Math.PI * 523 * t) + 0.2 * Math.sin(2 * Math.PI * 1046 * t + 2);
}
await split(mix, 2, sr, n);
const result = msgs.find(m => m.type === 'result');
const sum = new Float32Array(n * 2);
for (const stem of result.stems) {
  const d = stem.data;
  let peak = 0;
  for (let i = 0; i < n * 2; i++) { sum[i] += d[i]; peak = Math.max(peak, Math.abs(d[i])); }
  console.log(stem.id, 'peak', peak.toFixed(4), 'expected ~0.5');
}
let maxErr = 0, rmsNum = 0, rmsDen = 0;
for (let i = 0; i < n * 2; i++) {
  const diff = sum[i] - mix[i];
  rmsNum += diff * diff; rmsDen += mix[i] * mix[i];
  maxErr = Math.max(maxErr, Math.abs(diff));
}
console.log('sum-vs-mix maxErr', maxErr.toExponential(2), 'residual', (10*Math.log10(rmsNum/rmsDen+1e-20)).toFixed(1), 'dB');
