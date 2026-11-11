// 多 chunk (splits>1) + mono 路径回归: sum(stems) ≈ mix.
import * as ort from 'onnxruntime-web';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const msgs: any[] = [];
(globalThis as any).self = { postMessage: (m: any) => msgs.push(m) };
const { split, __setSessions } = await import('../src/workers/stemWorker.ts');
const STEMS = ['vocals', 'drums', 'bass', 'other'];

const sess: any = {};
for (const stem of STEMS) {
  const buf = await readFile(path.join(process.cwd(), 'public/assets/models', `spleeter-5stem-${stem}-mask.onnx`));
  sess[stem] = await ort.InferenceSession.create(buf, { executionProviders: ['wasm'] });
}
__setSessions(sess);

async function run(stereo: boolean) {
  const sr = 44100, n = Math.floor(sr * 13.0); // > 512 frames → 多 chunk
  const mix = new Float32Array(n * (stereo ? 2 : 1));
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const v = 0.4 * Math.sin(2 * Math.PI * 440 * t) + 0.3 * Math.sin(2 * Math.PI * 110 * t) + 0.2 * Math.sin(2 * Math.PI * 990 * t + 1);
    if (stereo) { mix[i * 2] = v; mix[i * 2 + 1] = 0.4 * Math.sin(2 * Math.PI * 523 * t) + 0.3 * Math.sin(2 * Math.PI * 82 * t); }
    else mix[i] = v;
  }
  const t0 = Date.now();
  msgs.length = 0;
  await split(mix, stereo ? 2 : 1, sr, n);
  const result = msgs.find(m => m.type === 'result');
  if (!result) { console.log(`  NO RESULT ${JSON.stringify(msgs)}`); return; }
  const sum = new Float32Array(mix.length);
  for (const stem of result.stems) { const d = stem.data; for (let i = 0; i < mix.length; i++) sum[i] += d[i]; }
  let num = 0, den = 0;
  for (let i = 0; i < mix.length; i++) { const diff = sum[i] - mix[i]; num += diff * diff; den += mix[i] * mix[i]; }
  const rms = 10 * Math.log10(num / den + 1e-20);
  const prog = msgs.filter(m => m.type === 'progress').map(m => m.pct);
  console.log(`${stereo ? 'stereo' : 'mono  '} 13s: residual=${rms.toFixed(1)} dB  progress=${prog[0]}..${prog[prog.length - 1]} (${prog.length} msgs)  wall=${Date.now() - t0}ms`);
}

await run(true);
await run(false);
