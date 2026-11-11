import { buildPadded, stftFrames, istftAccumulate, finalizeFromAccumulator, nFramesFor, SPLEETER_NFFT, SPLEETER_HOP, SPLEETER_T, SPLEETER_F } from '../src/utils/stft.ts';
const STEM_IDS = ['vocals','drums','bass','other'];

const sr = 44100, n = Math.floor(sr * 1.0);
const mix = new Float32Array(n * 2);
for (let i = 0; i < n; i++) { const t = i / sr; mix[i*2] = 0.5*Math.sin(2*Math.PI*440*t); mix[i*2+1] = 0.5*Math.sin(2*Math.PI*440*t); }
const sigL = new Float32Array(n), sigR = new Float32Array(n);
for (let i=0;i<n;i++){ sigL[i]=mix[i*2]; sigR[i]=mix[i*2+1]; }

const totalFrames = nFramesFor(n, SPLEETER_NFFT, SPLEETER_HOP);
const splits = Math.ceil(totalFrames / SPLEETER_T);
const paddedL = buildPadded(sigL, SPLEETER_NFFT, SPLEETER_HOP);
const paddedR = buildPadded(sigR, SPLEETER_NFFT, SPLEETER_HOP);
const sampleTotal = paddedL.length;
console.log('totalFrames', totalFrames, 'splits', splits, 'sampleTotal', sampleTotal);

const outs = STEM_IDS.map(() => [new Float32Array(sampleTotal), new Float32Array(sampleTotal)]);
const normL = new Float32Array(sampleTotal), normR = new Float32Array(sampleTotal);
const input = new Float32Array(2*SPLEETER_T*SPLEETER_F);

for (let s = 0; s < splits; s++) {
  const f0 = s*SPLEETER_T;
  const count = Math.min(SPLEETER_T, totalFrames - f0);
  const sL = stftFrames(paddedL, f0, count, SPLEETER_NFFT, SPLEETER_HOP);
  const sR = stftFrames(paddedR, f0, count, SPLEETER_NFFT, SPLEETER_HOP);
  const bins = sL.bins;
  // sigmoid+wiener with constant logits 0
  const size = 2*count*SPLEETER_F;
  const ratio = STEM_IDS.map(() => new Float32Array(size).fill(0.25));
  const reL = new Float32Array(count*bins), imL = new Float32Array(count*bins), reR = new Float32Array(count*bins), imR = new Float32Array(count*bins);
  for (let k=0;k<STEM_IDS.length;k++){
    for (let f=0;f<count;f++){
      let avgL=0,avgR=0;
      for (let b=0;b<SPLEETER_F;b++){
        const rL=ratio[k][(0*count+f)*SPLEETER_F+b];
        const rR=ratio[k][(1*count+f)*SPLEETER_F+b];
        reL[f*bins+b]=sL.re[f*bins+b]*rL; imL[f*bins+b]=sL.im[f*bins+b]*rL;
        reR[f*bins+b]=sR.re[f*bins+b]*rR; imR[f*bins+b]=sR.im[f*bins+b]*rR;
        avgL+=rL; avgR+=rR;
      }
      avgL/=SPLEETER_F; avgR/=SPLEETER_F;
      for (let b=SPLEETER_F;b<bins;b++){
        reL[f*bins+b]=sL.re[f*bins+b]*avgL; imL[f*bins+b]=sL.im[f*bins+b]*avgL;
        reR[f*bins+b]=sR.re[f*bins+b]*avgR; imR[f*bins+b]=sR.im[f*bins+b]*avgR;
      }
    }
    istftAccumulate(outs[k][0], normL, reL, imL, count, f0, SPLEETER_NFFT, SPLEETER_HOP);
    istftAccumulate(outs[k][1], normR, reR, imR, count, f0, SPLEETER_NFFT, SPLEETER_HOP);
  }
}
const a = finalizeFromAccumulator(outs[0][0], normL, n, SPLEETER_NFFT, SPLEETER_HOP);
let ratioV = 0, peakS = 0, peakM = 0;
for (let i=100;i<n-100;i++){ const base=Math.abs(mix[i*2]); if(base>0.1) ratioV += a[i]/base; peakS=Math.max(peakS,Math.abs(a[i])); peakM=Math.max(peakM,Math.abs(mix[i*2]*0.25)); }
console.log('ratio', (ratioV/(n-200)).toFixed(4), 'stem peak', peakS.toFixed(4), '0.25*mix peak', peakM.toFixed(4));
