import { buildPadded, stftFrames, istftAccumulate, finalizeFromAccumulator, nFramesFor, SPLEETER_NFFT, SPLEETER_HOP, SPLEETER_T, SPLEETER_F } from '../src/utils/stft.ts';
const sr = 44100, n = Math.floor(sr * 1.0);
const sig = new Float32Array(n);
for (let i = 0; i < n; i++) { const t = i / sr; sig[i] = 0.5*Math.sin(2*Math.PI*440*t); }
const totalFrames = nFramesFor(n, SPLEETER_NFFT, SPLEETER_HOP);
const paddedL = buildPadded(sig, SPLEETER_NFFT, SPLEETER_HOP);
const sampleTotal = paddedL.length;

function run(useAvg: boolean) {
  const out = new Float32Array(sampleTotal), norm = new Float32Array(sampleTotal);
  for (let f0 = 0; f0 < totalFrames; f0 += SPLEETER_T) {
    const count = Math.min(SPLEETER_T, totalFrames - f0);
    const c = stftFrames(paddedL, f0, count, SPLEETER_NFFT, SPLEETER_HOP);
    const bins = c.bins;
    const reL = new Float32Array(count*bins), imL = new Float32Array(count*bins);
    for (let f=0;f<count;f++){
      let avg=0;
      for (let b=0;b<SPLEETER_F;b++){ const v = useAvg ? 0.25 : 0.25; reL[f*bins+b]=c.re[f*bins+b]*v; imL[f*bins+b]=c.im[f*bins+b]*v; avg+=v; }
      avg/=SPLEETER_F;
      for (let b=SPLEETER_F;b<bins;b++){ const v = useAvg ? avg : 0.25; reL[f*bins+b]=c.re[f*bins+b]*v; imL[f*bins+b]=c.im[f*bins+b]*v; }
    }
    istftAccumulate(out, norm, reL, imL, count, f0, SPLEETER_NFFT, SPLEETER_HOP);
  }
  const z = finalizeFromAccumulator(out, norm, n, SPLEETER_NFFT, SPLEETER_HOP);
  let peak=0, ratio=0, cnt=0;
  for (let i=100;i<n-100;i++){ peak=Math.max(peak,Math.abs(z[i])); if(Math.abs(sig[i])>0.1){ ratio+=z[i]/sig[i]; cnt++; } }
  console.log(`  useAvg=${useAvg} peak=${peak.toFixed(4)} ratio=${(ratio/cnt).toFixed(4)} (expect peak=0.1250 ratio=0.25)`);
}
run(false); run(true);
