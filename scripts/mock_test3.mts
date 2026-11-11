import { readFile } from 'node:fs/promises';
const msgs: any[] = [];
(globalThis as any).self = { postMessage: (m: any) => msgs.push(m) };
const { split, __setSessions } = await import('../src/workers/stemWorker.ts');
const mockData = new Float32Array(2*512*1024).fill(0.0);
const sess: any = {};
for (const stem of ['vocals','drums','bass','other']) sess[stem] = { run: async () => ({ y: { data: mockData, dims: [1,2,512,1024] } }) };
__setSessions(sess);
const sr = 44100, n = Math.floor(sr * 1.0);
const mix = new Float32Array(n * 2);
for (let i = 0; i < n; i++) { const t = i / sr; mix[i*2] = 0.5 * Math.sin(2*Math.PI*440*t); mix[i*2+1] = 0.5 * Math.sin(2*Math.PI*440*t); }
await split(mix, 2, sr, n);
const result = msgs.find(m => m.type === 'result');
const stem0 = result.stems.find(s => s.id === 'vocals').data;
let peak=0, sample=0;
for (let i=1000;i<n-1000;i++) peak=Math.max(peak, Math.abs(stem0[i*2]));
sample = stem0[22050*2];
console.log('vocals peak', peak.toFixed(5), 'expect 0.125; sample@0.5s', sample.toFixed(5), 'expect', (0.25*mix[22050*2]).toFixed(5));
