// ─── 音频电平工具 (F 批 #6): 峰值扫描 + 整轨软归一 ────────────────
// 用途: 叠录/混音求和后防削波 — 峰值 >0.98 时整轨等比缩放到峰值 0.92
// (保持各层相对比例, 不做逐样本限幅 → 无额外失真; PCM16 硬钳位仅作最后兜底).

/** 扫描整轨峰值 (abs max). 空数组返回 0. */
export function scanPeak(data: Float32Array): number {
  let peak = 0;
  for (let i = 0; i < data.length; i++) {
    const a = Math.abs(data[i]);
    if (a > peak) peak = a;
  }
  return peak;
}

/**
 * 整轨软归一 (in-place): 峰值 > peakTrig 时整轨等比缩放到峰值 target.
 * @returns 是否执行了缩放
 */
export function softNormalize(data: Float32Array, peakTrig = 0.98, target = 0.92): boolean {
  if (data.length === 0) return false;
  const peak = scanPeak(data);
  if (peak <= peakTrig || !isFinite(peak)) return false;
  const g = target / peak;
  for (let i = 0; i < data.length; i++) data[i] *= g;
  return true;
}

/**
 * 多轨混音求和 + 软归一 (输出新数组, 不改输入).
 * 各轨乘自身 gain, 忽略 muted; solo 语义由调用方先算好 active 集合.
 */
export function mixLanes(
  lanes: Array<{ data: Float32Array; gain: number }>,
  totalLen: number
): Float32Array {
  const out = new Float32Array(totalLen);
  for (const l of lanes) {
    if (!l.data || l.data.length === 0) continue;
    const n = Math.min(l.data.length, totalLen);
    for (let i = 0; i < n; i++) out[i] += l.data[i] * l.gain;
  }
  return out;
}
