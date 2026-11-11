// ─── 真实峰值波形 (canvas) ─────────────────────────────────────────
// 从 Float32Array 逐桶算 min/max 画竖线, 实时数据靠 refresh 触发重绘.

import { useEffect, useRef } from 'react';

interface WaveformProps {
  data: Float32Array | null;
  color: string;
  height: number;
  /** 数据原地更新时递增, 触发重绘 */
  refresh?: number;
}

export default function Waveform({ data, color, height, refresh = 0 }: WaveformProps) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    const w = cv.clientWidth;
    const h = height;
    cv.width = Math.max(1, w * dpr);
    cv.height = Math.max(1, h * dpr);
    const g = cv.getContext('2d');
    if (!g) return;
    g.scale(dpr, dpr);
    g.clearRect(0, 0, w, h);

    if (!data || data.length === 0) {
      g.fillStyle = 'rgba(255,255,255,0.1)';
      g.fillRect(0, h / 2, w, 1);
      return;
    }

    const buckets = Math.max(1, Math.floor(w));
    g.fillStyle = color;
    g.beginPath();
    for (let i = 0; i < buckets; i++) {
      const start = Math.floor((i * data.length) / buckets);
      const end = Math.max(start + 1, Math.floor(((i + 1) * data.length) / buckets));
      let min = 0, max = 0;
      for (let j = start; j < end; j++) {
        const v = data[j];
        if (v < min) min = v;
        if (v > max) max = v;
      }
      const yTop = (h / 2) * (1 - max);
      const yBot = (h / 2) * (1 - min);
      g.fillRect(i, Math.max(0, yTop), 1, Math.min(h, Math.max(0.5, yBot - yTop)));
    }
  }, [data, color, height, refresh]);

  return <canvas ref={ref} style={{ width: '100%', height }} />;
}
