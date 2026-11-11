import { buildPadded, stftFrames, istftAccumulate, finalizeFromAccumulator, nFramesFor, SPLEETER_NFFT, SPLEETER_HOP, SPLEETER_T, SPLEETER_F } from '../src/utils/stft.ts';
const sr = 44100, n = Math.floor(sr * 1.0);
const sig = new Float32Array(n);
for (let i = 0; i < n; i++) { const t = i / sr; sig[i] = 0.5*Math.sin(2*Math.PI*440*t); }
const totalFrames = nFramesFor(n, SPLEETER_NFFT, SPLEETER_HOP);
const paddedL = buildPadded(sig, SPLEETER_NFFT, SPLEETER_HOP);
const sampleTotal = paddedL.length;

function run() {
  const out = new Float32Array(sampleTotal), norm = new Float32Array(sampleTotal);
  for (let f0 = 0; f0 < totalFrames; f0 += SPLEETER_T) {
    const count = Math.min(SPLEETER_T, totalFrames - f0);
    const c = stftFrames(paddedL, f0, count, SPLEETER_NFFT, SPLEETER_HOP);
    const bins = c.bins;
    const reL = new Float32Array(count*bins), imL = new Float32Array(count*bins);
    for (let f=0;f<count;f++){
      for (let b=0;b<SPLEETER_F;b++){ reL[f*bins+b]=c.re[f*bins+b]*0.25; imL[f*bins+b]=c.im[f*bins+b]*0.25; }
      for (let b=SPLEETER_F;b<bins;b++){ reL[f*bins+b]=c.re[f*bins+b]*0.25; imL[f*bins+b]=c.im[f*bins+b]*0.25; }
    }
    istftAccumulate(out, norm, reL, imL, count, f0, SPLEETER_NFFT, SPLEETER_HOP);
  }
  const z = finalizeFromAccumulator(out, norm, n, SPLEETER_NFFT, SPLEETER_HOP);
  let peak=0; for (let i=0;i<n;i++) peak=Math.max(peak, Math.abs(z[i]));
  console.log('  stem peak', peak.toFixed(4), '(expect', (0.25*0.5).toFixed(4), ')');
  console.log('  sample 44100 (1.0s) z=', z[44100].toFixed(5), '0.25*sig=', (0.25*sig[44100]).toFixed(5));
}
run();
