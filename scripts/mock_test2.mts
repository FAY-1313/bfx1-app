import { readFile } from 'node:fs/promises';
const msgs: any[] = [];
(globalThis as any).self = { postMessage: (m: any) => msgs.push(m) };
const { split, __setSessions } = await import('../src/workers/stemWorker.ts');

const MOCK_SIZE = 2 * 512 * 1024;
const mockData = new Float32Array(MOCK_SIZE).fill(0.0); // sigmoid=0.5 -> ratio 0.25
let ran = 0;
const sess: any = {};
for (const stem of ['vocals', 'drums', 'bass', 'other']) {
  sess[stem] = { run: async () => { ran++; return { y: { data: mockData, dims: [1, 2, 512, 1024] } }; } };
}
__setSessions(sess);

const sr = 44100, n = Math.floor(sr * 1.0);
const mix = new Float32Array(n * 2);
for (let i = 0; i < n; i++) { const t = i / sr; mix[i*2] = 0.5 * Math.sin(2*Math.PI*440*t); mix[i*2+1] = 0.5 * Math.sin(2*Math.PI*440*t); }
await split(mix, 2, sr, n);
const result = msgs.find(m => m.type === 'result');
const stem0 = result.stems.find(s => s.id === 'vocals').data;
let ratio = 0;
for (let i = 100; i < n - 100; i++) { const base = Math.abs(mix[i*2]); if (base > 0.1) ratio += stem0[i*2] / base; }
ratio /= (n - 200);
console.log('model runs:', ran, 'effective ratio (should be 0.25):', ratio.toFixed(4));
