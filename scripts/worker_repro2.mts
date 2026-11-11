import { buildPadded, stftFrames, istftAccumulate, finalizeFromAccumulator, nFramesFor, SPLEETER_NFFT, SPLEETER_HOP, SPLEETER_T, SPLEETER_F } from '../src/utils/stft.ts';
const sr = 44100, n = Math.floor(sr * 1.0);
const sig = new Float32Array(n);
for (let i = 0; i < n; i++) { const t = i / sr; sig[i] = 0.5*Math.sin(2*Math.PI*440*t); }

// MONO: single channel only
const totalFrames = nFramesFor(n, SPLEETER_NFFT, SPLEETER_HOP);
const paddedL = buildPadded(sig, SPLEETER_NFFT, SPLEETER_HOP);
const sampleTotal = paddedL.length;

const outs = [new Float32Array(sampleTotal)];
const normL = new Float32Array(sampleTotal);
for (let f0 = 0; f0 < totalFrames; f0 += SPLEETER_T) {
  const count = Math.min(SPLEETER_T, totalFrames - f0);
  const sL = stftFrames(paddedL, f0, count, SPLEETER_NFFT, SPLEETER_HOP);
  const bins = sL.bins;
  const size = 2*count*SPLEETER_F;
  const ratio = [new Float32Array(size).fill(0.25)];
  const reL = new Float32Array(count*bins), imL = new Float32Array(count*bins);
  const r = ratio[0];
  for (let f=0;f<count;f++){
    let avgL=0;
    for (let b=0;b<SPLEETER_F;b++){
      const rL=r[(0*count+f)*SPLEETER_F+b];
      reL[f*bins+b]=sL.re[f*bins+b]*rL; imL[f*bins+b]=sL.im[f*bins+b]*rL; avgL+=rL;
    }
    avgL/=SPLEETER_F;
    for (let b=SPLEETER_F;b<bins;b++){ reL[f*bins+b]=sL.re[f*bins+b]*avgL; imL[f*bins+b]=sL.im[f*bins+b]*avgL; }
  }
  istftAccumulate(outs[0], normL, reL, imL, count, f0, SPLEETER_NFFT, SPLEETER_HOP);
}
const a = finalizeFromAccumulator(outs[0], normL, n, SPLEETER_NFFT, SPLEETER_HOP);
let peakS=0; for (let i=0;i<n;i++) peakS=Math.max(peakS,Math.abs(a[i]));
console.log('MONO ratio-indexed stem peak', peakS.toFixed(4), '(expect 0.125)');
