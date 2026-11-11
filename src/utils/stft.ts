// ─── Spleeter 端侧 STFT/iSTFT + Wiener 工具 (对齐 matthewbae 导出) ──
// 纯 JS radix-2 FFT (Float32Array), 供 Web Worker 里的 AI 分轨流水线使用.
// 契约必须与 Python 参考完全一致:
//   - 周期 Hann (periodic, 非对称): w[n]=0.5*(1-cos(2πn/N_FFT))
//   - 帧前补 PAD=N_FFT-HOP=3072 个零, 使真实样本覆盖 4 窗重叠
//   - n_frames = ceil((PAD + n) / HOP); 窗起点 = f*HOP
//   - iSTFT = 加权重叠相加 out=Σ w·frame / Σ w², 再切掉 [PAD, PAD+len)
// 频谱 frame-major: index = frame*bins + bin.

export const SPLEETER_SR = 44100;
export const SPLEETER_NFFT = 4096;
export const SPLEETER_HOP = 1024;
export const SPLEETER_BINS = SPLEETER_NFFT / 2 + 1; // 2049
export const SPLEETER_PAD = SPLEETER_NFFT - SPLEETER_HOP; // 3072
export const SPLEETER_T = 512;    // 模型固定时间帧数
export const SPLEETER_F = 1024;   // 模型覆盖的低频 bin 数

const twiddleCache = new Map<number, { cos: Float32Array; sin: Float32Array }>();

function twiddles(n: number): { cos: Float32Array; sin: Float32Array } {
  let t = twiddleCache.get(n);
  if (!t) {
    const cos = new Float32Array(n / 2);
    const sin = new Float32Array(n / 2);
    for (let i = 0; i < n / 2; i++) {
      const a = (-2 * Math.PI * i) / n;
      cos[i] = Math.cos(a);
      sin[i] = Math.sin(a);
    }
    t = { cos, sin };
    twiddleCache.set(n, t);
  }
  return t;
}

/** 原位 radix-2 复 FFT (长度 n 必须为 2 的幂). */
export function fftInPlace(re: Float32Array, im: Float32Array, n: number): void {
  if (n <= 1) return;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i]; re[i] = re[j]; re[j] = tr;
      const ti = im[i]; im[i] = im[j]; im[j] = ti;
    }
  }
  const { cos, sin } = twiddles(n);
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1;
    const step = n / len;
    for (let i = 0; i < n; i += len) {
      for (let j = i, k = 0; j < i + half; j++, k += step) {
        const cr = cos[k];
        const si = sin[k];
        const tre = re[j + half] * cr - im[j + half] * si;
        const tim = re[j + half] * si + im[j + half] * cr;
        re[j + half] = re[j] - tre;
        im[j + half] = im[j] - tim;
        re[j] += tre;
        im[j] += tim;
      }
    }
  }
}

/** 原位 radix-2 复 IFFT (缩放 1/n). */
export function ifftInPlace(re: Float32Array, im: Float32Array, n: number): void {
  for (let i = 0; i < n; i++) im[i] = -im[i];
  fftInPlace(re, im, n);
  const inv = 1 / n;
  for (let i = 0; i < n; i++) {
    re[i] *= inv;
    im[i] *= -inv;
  }
}

/** 周期 Hann 窗 (Spleeter 训练用). */
function periodicHann(n: number): Float32Array {
  const w = new Float32Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / n));
  return w;
}

const hannCache = new Map<number, Float32Array>();

function getHann(n: number): Float32Array {
  let w = hannCache.get(n);
  if (!w) { w = periodicHann(n); hannCache.set(n, w); }
  return w;
}

/** 帧数计算 (与 Python n_frames_for 一致). */
export function nFramesFor(sigLen: number, nFft = SPLEETER_NFFT, hop = SPLEETER_HOP): number {
  const pad = nFft - hop;
  return Math.max(1, Math.ceil((pad + sigLen) / hop));
}

/**
 * 前置 PAD 零后的整条 padded 信号 (供分块 STFT 复用).
 */
export function buildPadded(sig: Float32Array, nFft: number, hop: number): Float32Array {
  const pad = nFft - hop;
  const frames = nFramesFor(sig.length, nFft, hop);
  const total = (frames - 1) * hop + nFft;
  const padded = new Float32Array(total);
  padded.set(sig, pad);
  return padded;
}

/**
 * 从 padded 信号计算连续若干帧的复频谱 (frame-major [count*bins]).
 */
export function stftFrames(
  padded: Float32Array,
  f0: number,
  count: number,
  nFft: number,
  hop: number,
): { re: Float32Array; im: Float32Array; bins: number } {
  const win = getHann(nFft);
  const bins = nFft / 2 + 1;
  const re = new Float32Array(count * bins);
  const im = new Float32Array(count * bins);
  const r = new Float32Array(nFft);
  const m = new Float32Array(nFft);
  for (let k = 0; k < count; k++) {
    const f = f0 + k;
    const off = f * hop;
    for (let i = 0; i < nFft; i++) {
      r[i] = padded[off + i] * win[i];
      m[i] = 0;
    }
    fftInPlace(r, m, nFft);
    for (let b = 0; b < bins; b++) {
      re[k * bins + b] = r[b];
      im[k * bins + b] = m[b];
    }
  }
  return { re, im, bins };
}

/**
 * 整段重叠相加归一化因子: norm[p] = Σ_k w[p - k·hop]² (与帧内容无关, 可预先算好).
 */
export function computeNorm(totalFrames: number, nFft: number, hop: number): Float32Array {
  const win = getHann(nFft);
  const norm = new Float32Array((totalFrames - 1) * hop + nFft);
  for (let f = 0; f < totalFrames; f++) {
    const off = f * hop;
    for (let i = 0; i < nFft; i++) {
      const p = off + i;
      if (p >= norm.length) break;
      norm[p] += win[i] * win[i];
    }
  }
  return norm;
}

/**
 * 将一帧区间 [f0, f0+count) 的复频谱 iSTFT 叠加进 out (重叠相加).
 * 注意: 不累积 norm —— 归一化因子由 computeNorm 统一预计算, 避免跨轨重复累加.
 */
export function istftAccumulate(
  out: Float32Array,
  re: Float32Array,
  im: Float32Array,
  count: number,
  f0: number,
  nFft: number,
  hop: number,
): void {
  const win = getHann(nFft);
  const bins = nFft / 2 + 1;
  const r = new Float32Array(nFft);
  const m = new Float32Array(nFft);
  for (let k = 0; k < count; k++) {
    for (let b = 0; b < bins; b++) {
      r[b] = re[k * bins + b];
      m[b] = im[k * bins + b];
    }
    for (let b = bins; b < nFft; b++) {
      r[b] = re[k * bins + (nFft - b)];
      m[b] = -im[k * bins + (nFft - b)];
    }
    ifftInPlace(r, m, nFft);
    const off = (f0 + k) * hop;
    for (let i = 0; i < nFft; i++) {
      const p = off + i;
      if (p >= out.length) break;
      out[p] += r[i] * win[i];
    }
  }
}

/** 从累积器输出 outLen 样本的时域信号 (自动切掉前导 PAD). */
export function finalizeFromAccumulator(out: Float32Array, norm: Float32Array, outLen: number, nFft: number, hop: number): Float32Array {
  const pad = nFft - hop;
  const res = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const p = pad + i;
    res[i] = norm[p] > 1e-8 ? out[p] / norm[p] : 0;
  }
  return res;
}
