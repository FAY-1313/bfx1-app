import { buildPadded, stftFrames, istftAccumulate, finalizeFromAccumulator, nFramesFor, SPLEETER_NFFT, SPLEETER_HOP, SPLEETER_F } from '../src/utils/stft.ts';

const sr = 44100, n = Math.floor(sr * 1.0);
const mix = new Float32Array(n);
for (let i = 0; i < n; i++) { const t = i / sr; mix[i] = 0.5 * Math.sin(2 * Math.PI * 440 * t) + 0.3 * Math.sin(2 * Math.PI * 990 * t + 1); }

const total = nFramesFor(n, SPLEETER_NFFT, SPLEETER_HOP);
const pad = buildPadded(mix, SPLEETER_NFFT, SPLEETER_HOP);
const bins = SPLEETER_NFFT/2 + 1;
const out = new Float32Array(pad.length);
const norm = new Float32Array(pad.length);
const T = 512;
for (let f0 = 0; f0 < total; f0 += T) {
  const count = Math.min(T, total - f0);
  const c = stftFrames(pad, f0, count, SPLEETER_NFFT, SPLEETER_HOP);
  // ratio = 0.25 everywhere (uniform mask), mirroring worker ratio application
  const reL = new Float32Array(count * bins);
  const imL = new Float32Array(count * bins);
  for (let f = 0; f < count; f++) {
    for (let b = 0; b < SPLEETER_F; b++) {
      reL[f*bins+b] = c.re[f*bins+b] * 0.25;
      imL[f*bins+b] = c.im[f*bins+b] * 0.25;
    }
    for (let b = SPLEETER_F; b < bins; b++) {
      reL[f*bins+b] = c.re[f*bins+b] * 0.25;
      imL[f*bins+b] = c.im[f*bins+b] * 0.25;
    }
  }
  istftAccumulate(out, norm, reL, imL, count, f0, SPLEETER_NFFT, SPLEETER_HOP);
}
const stem = finalizeFromAccumulator(out, norm, n, SPLEETER_NFFT, SPLEETER_HOP);
let peakStem=0, peakMix=0, maxErr=0;
for (let i=0;i<n;i++){ peakStem=Math.max(peakStem,Math.abs(stem[i])); peakMix=Math.max(peakMix,Math.abs(mix[i]*0.25)); maxErr=Math.max(maxErr, Math.abs(stem[i]-mix[i]*0.25)); }
console.log('stem peak', peakStem.toFixed(4), '0.25*mix peak', peakMix.toFixed(4), 'maxErr', maxErr.toExponential(2));
