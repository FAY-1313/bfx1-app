// ─── AI 分轨 Web Worker (A 端侧) ───────────────────────────────────
// onnxruntime-web (wasm) 运行 4 个 Spleeter 掩码模型, 分块处理整曲:
//   STFT(周期Hann, n_fft=4096, hop=1024) → 幅度谱截前 1024 bin →
//   每 512 帧一 chunk 喂模型 → softmax(4 轨 logits) 掩码 → 乘混合复频谱 →
//   iSTFT 重叠相加. 输出 4 轨 (vocals/drums/bass/other) 时域浮点.
// 单线程 (numThreads=1) 避免 WebView 无 SharedArrayBuffer 时线程构建失败.

import * as ort from 'onnxruntime-web';
import {
  SPLEETER_NFFT, SPLEETER_HOP, SPLEETER_T, SPLEETER_F,
  nFramesFor, buildPadded, computeNorm, stftFrames, istftAccumulate, finalizeFromAccumulator,
} from '../utils/stft';

const STEM_IDS = ['vocals', 'drums', 'bass', 'other'] as const;
type StemId = typeof STEM_IDS[number];

let sessions: Partial<Record<StemId, ort.InferenceSession>> = {};

const post = (msg: unknown, transfer?: Transferable[]) => {
  (self as any).postMessage(msg, transfer ? { transfer } : undefined);
};

/** 测试注入用: 直接设置已加载的 session. */
export function __setSessions(s: Partial<Record<StemId, ort.InferenceSession>>): void {
  sessions = s;
}

/** 加载 4 个模型 (幂等). */
export async function init(modelBase: string): Promise<void> {
  const base = modelBase.endsWith('/') ? modelBase : modelBase + '/';
  if (Object.keys(sessions).length === STEM_IDS.length) return;
  ort.env.wasm.wasmPaths = `${base}onnx/`;
  ort.env.wasm.numThreads = 1;
  let loaded = 0;
  for (const stem of STEM_IDS) {
    const url = `${base}assets/models/spleeter-5stem-${stem}-mask.onnx`;
    try {
      sessions[stem] = await ort.InferenceSession.create(url, {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'basic',
      });
    } catch (e) {
      console.error(`[stemWorker] load ${stem} failed:`, e);
    }
    loaded++;
    post({ type: 'progress', stage: 'model', pct: Math.round((loaded / STEM_IDS.length) * 100), stem });
  }
}

export async function split(audio: Float32Array, channels: number, sampleRate: number, outLen: number): Promise<void> {
  const missing = STEM_IDS.filter(s => !sessions[s]);
  if (missing.length > 0) throw new Error(`models not ready: ${missing.join(',')}`);
  const ch = Math.min(2, Math.max(1, channels));
  const mono = ch === 1;

  const sigL = new Float32Array(outLen);
  const sigR = mono ? sigL : new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    sigL[i] = audio[i * ch];
    if (!mono) sigR[i] = audio[i * ch + 1];
  }

  const totalFrames = nFramesFor(outLen, SPLEETER_NFFT, SPLEETER_HOP);
  const splits = Math.ceil(totalFrames / SPLEETER_T);
  const paddedL = buildPadded(sigL, SPLEETER_NFFT, SPLEETER_HOP);
  const paddedR = buildPadded(sigR, SPLEETER_NFFT, SPLEETER_HOP);
  const sampleTotal = paddedL.length;

  // 累积器: out[stem][ch][sampleTotal] (mono 时仅用 ch0)
  const outs: (Float32Array | null)[][] = STEM_IDS.map(() => [
    new Float32Array(sampleTotal),
    mono ? null : new Float32Array(sampleTotal),
  ]);
  // 归一化因子与内容无关, 预计算一次 (跨轨共享, 避免重复累加)
  const normL = computeNorm(totalFrames, SPLEETER_NFFT, SPLEETER_HOP);
  const normR = mono ? normL : computeNorm(totalFrames, SPLEETER_NFFT, SPLEETER_HOP);

  const input = new Float32Array(2 * SPLEETER_T * SPLEETER_F);

  for (let s = 0; s < splits; s++) {
    const f0 = s * SPLEETER_T;
    const count = Math.min(SPLEETER_T, totalFrames - f0);

    // STFT 当前 chunk (双声道)
    const sL = stftFrames(paddedL, f0, count, SPLEETER_NFFT, SPLEETER_HOP);
    const sR = stftFrames(paddedR, f0, count, SPLEETER_NFFT, SPLEETER_HOP);
    const bins = sL.bins;

    // 模型输入 [1,2,T,F]: idx = (c*T + f)*F + b (尾部帧补零)
    input.fill(0);
    for (let c = 0; c < 2; c++) {
      const spec = c === 0 ? sL : sR;
      for (let f = 0; f < count; f++) {
        for (let b = 0; b < SPLEETER_F; b++) {
          const re = spec.re[f * bins + b];
          const im = spec.im[f * bins + b];
          input[(c * SPLEETER_T + f) * SPLEETER_F + b] = Math.sqrt(re * re + im * im);
        }
      }
    }

    // 4 模型推理
    const feeds = { x: new ort.Tensor('float32', input, [1, 2, SPLEETER_T, SPLEETER_F]) };
    const modelOut = new Map<StemId, Float32Array>();
    for (const stem of STEM_IDS) {
      const sess = sessions[stem];
      if (!sess) continue;
      const out = await sess.run(feeds);
      modelOut.set(stem, (out.y as ort.Tensor).data as Float32Array);
    }

    // 掩码: softmax(4 轨 logits) (max 减位稳定). 每 bin Σratio = 1 → sum(stems) ≈ 原混音.
    // 注意: 不能用 sigmoid + 固定 eps 归一 —— 全负 logits 的 bin 会被 eps 吞掉 (Σratio ≪ 1).
    const size = 2 * count * SPLEETER_F;
    const ratio = new Map<StemId, Float32Array>();
    for (const stem of STEM_IDS) ratio.set(stem, new Float32Array(size));
    const z = new Array<number>(STEM_IDS.length);
    const ez = new Array<number>(STEM_IDS.length);
    for (let c = 0; c < 2; c++) {
      for (let f = 0; f < count; f++) {
        for (let b = 0; b < SPLEETER_F; b++) {
          const idxM = (c * count + f) * SPLEETER_F + b;
          const idxO = (c * SPLEETER_T + f) * SPLEETER_F + b;
          let zmax = -Infinity;
          for (let k = 0; k < STEM_IDS.length; k++) {
            const lg = modelOut.get(STEM_IDS[k]);
            const v = lg ? lg[idxO] : 0;
            z[k] = v;
            if (v > zmax) zmax = v;
          }
          let sum = 0;
          for (let k = 0; k < STEM_IDS.length; k++) {
            ez[k] = Math.exp(z[k] - zmax);
            sum += ez[k];
          }
          const inv = sum > 0 ? 1 / sum : 1 / STEM_IDS.length;
          for (let k = 0; k < STEM_IDS.length; k++) ratio.get(STEM_IDS[k])![idxM] = ez[k] * inv;
        }
      }
    }

    // 应用 ratio → 复频谱 → iSTFT 累积 (高频 bin 用该帧均值扩展)
    const reL = new Float32Array(count * bins);
    const imL = new Float32Array(count * bins);
    const reR = new Float32Array(count * bins);
    const imR = new Float32Array(count * bins);
    for (let k = 0; k < STEM_IDS.length; k++) {
      const stem = STEM_IDS[k];
      const r = ratio.get(stem)!;
      for (let f = 0; f < count; f++) {
        let avgL = 0, avgR = 0;
        for (let b = 0; b < SPLEETER_F; b++) {
          const rL = r[(0 * count + f) * SPLEETER_F + b];
          const rR = r[(1 * count + f) * SPLEETER_F + b];
          reL[f * bins + b] = sL.re[f * bins + b] * rL;
          imL[f * bins + b] = sL.im[f * bins + b] * rL;
          reR[f * bins + b] = sR.re[f * bins + b] * rR;
          imR[f * bins + b] = sR.im[f * bins + b] * rR;
          avgL += rL;
          avgR += rR;
        }
        avgL /= SPLEETER_F;
        avgR /= SPLEETER_F;
        for (let b = SPLEETER_F; b < bins; b++) {
          reL[f * bins + b] = sL.re[f * bins + b] * avgL;
          imL[f * bins + b] = sL.im[f * bins + b] * avgL;
          reR[f * bins + b] = sR.re[f * bins + b] * avgR;
          imR[f * bins + b] = sR.im[f * bins + b] * avgR;
        }
      }
      istftAccumulate(outs[k][0]!, reL, imL, count, f0, SPLEETER_NFFT, SPLEETER_HOP);
      if (!mono) istftAccumulate(outs[k][1]!, reR, imR, count, f0, SPLEETER_NFFT, SPLEETER_HOP);
    }

    post({ type: 'progress', stage: 'separate', pct: Math.round(((s + 1) / splits) * 100) });
  }

  const stems: { id: StemId; data: Float32Array }[] = [];
  for (let k = 0; k < STEM_IDS.length; k++) {
    const a = finalizeFromAccumulator(outs[k][0], normL, outLen, SPLEETER_NFFT, SPLEETER_HOP);
    if (mono) {
      stems.push({ id: STEM_IDS[k], data: a });
    } else {
      const b = finalizeFromAccumulator(outs[k][1], normR, outLen, SPLEETER_NFFT, SPLEETER_HOP);
      const data = new Float32Array(outLen * 2);
      for (let i = 0; i < outLen; i++) {
        data[i * 2] = a[i];
        data[i * 2 + 1] = b[i];
      }
      stems.push({ id: STEM_IDS[k], data });
    }
  }
  post({ type: 'result', stems, sampleRate, channels: mono ? 1 : 2, outLen }, stems.map(s => s.data.buffer));
}

self.onmessage = async (e: MessageEvent) => {
  const msg = e.data;
  if (!msg || typeof msg.type !== 'string') return;
  try {
    if (msg.type === 'init') {
      await init(msg.modelBase);
      post({ type: 'ready', count: Object.keys(sessions).length });
    } else if (msg.type === 'split') {
      await split(msg.audio, msg.channels, msg.sampleRate, msg.outLen);
    }
  } catch (err) {
    console.error('[stemWorker]', err);
    post({ type: 'error', message: String((err && (err as Error).message) || err) });
  }
};
