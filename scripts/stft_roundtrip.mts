import { buildPadded, stftFrames, istftAccumulate, finalizeFromAccumulator, nFramesFor, SPLEETER_NFFT, SPLEETER_HOP } from '../src/utils/stft.ts';

function rand(n: number, seed = 7) {
  const a = new Float32Array(n);
  let s = seed;
  for (let i = 0; i < n; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; a[i] = (s / 0x7fffffff) * 2 - 1; }
  return a;
}

for (const len of [44100, 44100 * 3 + 137, 5000, 1, 1024, 99999]) {
  const x = rand(len);
  const total = nFramesFor(len, SPLEETER_NFFT, SPLEETER_HOP);
  const pad = buildPadded(x, SPLEETER_NFFT, SPLEETER_HOP);
  const out = new Float32Array(pad.length);
  const norm = new Float32Array(pad.length);
  const T = 512;
  for (let f0 = 0; f0 < total; f0 += T) {
    const count = Math.min(T, total - f0);
    const c = stftFrames(pad, f0, count, SPLEETER_NFFT, SPLEETER_HOP);
    istftAccumulate(out, norm, c.re, c.im, count, f0, SPLEETER_NFFT, SPLEETER_HOP);
  }
  const z = finalizeFromAccumulator(out, norm, len, SPLEETER_NFFT, SPLEETER_HOP);
  let e = 0, maxA = 0;
  for (let i = 0; i < len; i++) { const d = Math.abs(x[i] - z[i]); if (d > e) e = d; if (Math.abs(x[i]) > maxA) maxA = Math.abs(x[i]); }
  console.log(`len=${len}  max_err=${e.toExponential(2)}  (peak=${maxA.toFixed(3)})`);
}
