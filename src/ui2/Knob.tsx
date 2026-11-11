/**
 * BFX1 新 UI · 旋钮组件（v3 · 两层结构 · 光源固定 + 完全平滑）
 *
 * ── 为什么改两层 ────────────────────────────────────────────────────
 *   原 24 帧切图是「固定指向性光源」渲染的：每帧光照都在【屏幕同一位置】。
 *   若把整张图旋转（残余角度补偿），会把光照一起转 → 高光绕着旋钮跑 → 看着不平滑。
 *   实测确认：24 帧之间【旋钮本体完全不动】（中心区域平均差 0.000~0.046），
 *             只有边缘的标记在移动。所以拆两层：
 *
 *     knob_base.webp   本体 —— 24 帧中位数，无标记，**永不旋转** → 光照天然固定
 *     knob_mark.webp   标记 —— 只含标记，摆在 12 点钟，**CSS 无级旋转** → 完全平滑
 *
 * ── 用户拍板（2026-10-03）──────────────────────────────────────────
 *   ① 顺时针  ② 270°  ③ 平滑
 *
 * ── 角度公式 ────────────────────────────────────────────────────────
 *   标记贴图方位 = 12 点钟
 *   min = 7:30 = 225°    max = 4:30 = 495°（= 225 + 270）
 *   markAngle = 225 + norm × 270        （CSS rotate：0=12点，正=顺时针）
 *
 * ── 保持不变 ────────────────────────────────────────────────────────
 *   拖动逻辑（上下拖 220px 满行程）/ 步进量化 / 标签 / 数值文字
 *
 * ── 2026-10-13 照片踏板扩展 ────────────────────────────────────────
 *   新增可选 props（默认行为完全不变，标准面板无感知）：
 *     d        显式直径 px（覆盖 SIZES 表）
 *     baseImg / markImg  自定义两层素材（照片踏板传入抠图 URL）
 *     chrome   false = 无铬模式：不渲染标签/数值行，拖动时显示数值气泡
 *   详见 PedalPhoto.tsx（TS-808 照片踏板）
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { RegSpec } from './registers';

export type KnobSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

const SIZES: Record<KnobSize, { d: number; nm: number; vl: number }> = {
  xs: { d: 38, nm: 7,   vl: 8.5 },
  sm: { d: 46, nm: 8,   vl: 9.5 },
  md: { d: 56, nm: 8.5, vl: 10 },
  lg: { d: 68, nm: 10,  vl: 12 },
  xl: { d: 84, nm: 11,  vl: 13.5 },
};

/* ══════════════ 两层素材 ══════════════ */
const BASE_IMG = '/knobs/knob_base.webp';
const MARK_IMG = '/knobs/knob_mark.webp';

/** ★ 用户拍板：顺时针 270°，起点 7:30（225°） */
const SWEEP_DEG   = 270;
const START_DEG   = 225;          // 7:30 位置
const CLOCKWISE   = true;

/** 素材预加载（一次） */
let assetsReady = false;
if (typeof window !== 'undefined') {
  let n = 0;
  const done = () => { if (++n >= 2) assetsReady = true; };
  const a = new Image(); a.onload = done; a.onerror = done; a.src = BASE_IMG;
  const b = new Image(); b.onload = done; b.onerror = done; b.src = MARK_IMG;
}

interface Props {
  label: string;
  spec: RegSpec;
  size?: KnobSize;
  locked?: boolean;
  onChange?: (regValue: number) => void;
  value?: number;
  /** ★ 显式直径（px 或 CSS 长度，如 clamp()）——覆盖 SIZES 表（照片踏板按百分比换算后传入） */
  d?: number | string;
  /** ★ 自定义两层素材（照片踏板；缺省用 /knobs/ 默认素材） */
  baseImg?: string;
  markImg?: string;
  /** ★ 无铬模式：不渲染标签/数值行，拖动时显示数值气泡（照片踏板用） */
  chrome?: boolean;
  /** ★ v5：只读展示（首页缩略旋钮）—— 不响应指针，也不变暗 */
  readOnly?: boolean;
  /** ★ v5：单击放大（sticky，再单击恢复；放大后拖动旋转） */
  enlargeable?: boolean;
  /** ★ v5：松手一次性提交 —— 拖动中只更新视觉（onPreview），pointerup 才调 onChange */
  releaseCommit?: boolean;
  /** ★ v5：横拖细调（系数 0.17，v4 实测值） */
  fineX?: boolean;
  /** ★ v5：拖动中的视觉预览（不走 BLE；HUD 用） */
  onPreview?: (v: number) => void;
}

/** 归一值 → CSS 旋转角（度，0=12点，正=顺时针） */
export function markAngleOf(n: number): number {
  const c = Math.max(0, Math.min(1, n));
  const sweep = CLOCKWISE ? c * SWEEP_DEG : -c * SWEEP_DEG;
  return START_DEG + sweep;
}

export default function Knob({ label, spec, size = 'sm', locked, onChange, value,
                               d, baseImg, markImg, chrome = true,
                               readOnly, enlargeable, releaseCommit, fineX, onPreview }: Props) {
  const [inner, setInner] = useState(spec.def);
  const v = value !== undefined ? value : inner;
  const drag = useRef<{ y0: number; x0: number; v0: number; moved: boolean } | null>(null);
  const sz = SIZES[size];
  const [dragging, setDragging] = useState(false);
  /** ★ v5：拖动中的视觉值（releaseCommit 时按住手前的显示值） */
  const [dragV, setDragV] = useState<number | null>(null);
  /** ★ v5：单击放大（sticky） */
  const [big, setBig] = useState(false);
  const showV = dragV !== null ? dragV : v;

  /* ★ 自定义素材（照片踏板）：本地预加载，就绪前用 CSS 圆兜底 */
  const baseSrc = baseImg ?? BASE_IMG;
  const markSrc = markImg ?? MARK_IMG;
  const custom = !!(baseImg || markImg);
  const [ready, setReady] = useState(() => assetsReady && !custom);

  /* 等素材（避免首帧空白）——默认素材走模块级预加载，自定义素材走本地预加载 */
  useEffect(() => {
    if (ready) return;
    if (!custom) {
      const t = setInterval(() => { if (assetsReady) { setReady(true); clearInterval(t); } }, 60);
      const to = setTimeout(() => clearInterval(t), 4000);
      return () => { clearInterval(t); clearTimeout(to); };
    }
    let n = 0;
    const done = () => { if (++n >= 2) setReady(true); };
    for (const src of [baseSrc, markSrc]) {
      const im = new Image(); im.onload = done; im.onerror = done; im.src = src;
    }
    const to = setTimeout(() => setReady(true), 2500);   // 兜底：2.5s 后无论如何放行
    return () => clearTimeout(to);
  }, [ready, custom, baseSrc, markSrc]);

  const norm = (val: number) => (val - spec.min) / Math.max(1, spec.max - spec.min);
  const markAngle = markAngleOf(norm(showV));
  const baseD = d ?? sz.d;
  const dia = big && typeof baseD === 'number' ? baseD * 2.1 : baseD;
  const diaNum = typeof baseD === 'number' ? baseD : sz.d;   // 兜底指针尺寸计算用

  const down = useCallback((e: React.PointerEvent) => {
    if (locked || readOnly) return;
    drag.current = { y0: e.clientY, x0: e.clientX, v0: showV, moved: false };
    setDragging(true);
    (e.target as Element).setPointerCapture?.(e.pointerId);
    e.preventDefault();
  }, [locked, readOnly, showV]);

  const move = useCallback((e: React.PointerEvent) => {
    if (!drag.current || locked || readOnly) return;
    const span = spec.max - spec.min;
    const dy = drag.current.y0 - e.clientY;
    const dx = e.clientX - drag.current.x0;
    if (Math.abs(dy) + Math.abs(dx) > 6) drag.current.moved = true;
    let nv = drag.current.v0 + (dy + (fineX ? dx * 0.17 : 0)) * (span / 220);
    nv = Math.round(nv / spec.step) * spec.step;          // ★ 按步进量化
    nv = Math.max(spec.min, Math.min(spec.max, nv));
    if (nv !== showV) {
      if (releaseCommit) {
        /* ★ v5：拖动中只更新视觉 + 预览回调，BLE 零写入 */
        setDragV(nv);
        onPreview?.(nv);
      } else {
        if (value === undefined) setInner(nv);
        onChange?.(nv);
      }
    }
  }, [locked, readOnly, spec, showV, value, onChange, releaseCommit, fineX, onPreview]);

  const up = useCallback(() => {
    const wasTap = drag.current ? !drag.current.moved : false;
    /* ★ v5：松手一次性提交（拖动全程 0 帧 BLE） */
    if (releaseCommit && drag.current?.moved && dragV !== null) {
      onChange?.(dragV);
      if (value === undefined) setInner(dragV);
    }
    /* ★ v5：单击（未拖动）→ 放大 / 恢复 */
    if (wasTap && enlargeable && !locked && !readOnly) setBig((b) => !b);
    drag.current = null;
    setDragV(null);
    setDragging(false);
  }, [releaseCommit, dragV, onChange, value, enlargeable, locked, readOnly]);

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
      opacity: locked ? 0.26 : 1, pointerEvents: locked ? 'none' : 'auto',
      userSelect: 'none', touchAction: 'none', flex: '0 0 auto',
    }}>
      <div
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
        style={{
          width: dia, height: dia, position: 'relative', cursor: 'grab',
          // ★ 投影：深色旋钮落在深色面板上会糊在一起
          filter: ready
            ? 'drop-shadow(0 2px 3px rgba(0,0,0,.85)) drop-shadow(0 0 1px rgba(255,255,255,.16))'
            : undefined,
        }}
      >
        {/* ── 底层：旋钮本体，永不旋转 → 光照固定 ── */}
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: ready ? `url(${baseSrc})` : undefined,
          backgroundSize: '100% 100%',
          backgroundRepeat: 'no-repeat',
          borderRadius: ready ? 0 : '50%',
          backgroundColor: ready ? 'transparent' : '#2b3037',
        }} />
        {/* ── 顶层：标记，无级旋转 → 完全平滑（GPU 合成）── */}
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: ready ? `url(${markSrc})` : undefined,
          backgroundSize: '100% 100%',
          backgroundRepeat: 'no-repeat',
          transform: `translateZ(0) rotate(${markAngle}deg)`,
          transformOrigin: '50% 50%',
          willChange: 'transform',
          backfaceVisibility: 'hidden',
          // 素材未就绪时用 CSS 指针兜底
          ...(ready ? {} : {
            backgroundImage: `linear-gradient(#e8b860, #e8b860)`,
            backgroundSize: `${Math.max(2, diaNum * 0.045)}px ${diaNum * 0.24}px`,
            backgroundPosition: '50% ' + (diaNum * 0.10) + 'px',
            backgroundRepeat: 'no-repeat',
          }),
        }} />
        {/* ★ 无铬模式：拖动时的数值气泡 */}
        {!chrome && dragging && (
          <div style={{
            position: 'absolute', left: '50%', top: -20, transform: 'translateX(-50%)',
            padding: '2px 7px', borderRadius: 5, whiteSpace: 'nowrap', pointerEvents: 'none',
            background: 'rgba(8,10,14,.92)', border: '1px solid rgba(232,184,96,.5)',
            fontSize: 11, fontWeight: 650, color: '#e8b860', lineHeight: 1.3,
            boxShadow: '0 2px 8px rgba(0,0,0,.6)',
          }}>{spec.fmt(showV)}</div>
        )}
      </div>
      {chrome && (
        <>
          <div style={{
            fontSize: sz.nm, color: '#8b93a2', lineHeight: 1.15, letterSpacing: 0.2,
            maxWidth: sz.d + 20, overflow: 'hidden', textOverflow: 'ellipsis',
            whiteSpace: 'nowrap', textAlign: 'center',
          }}>{label}</div>
          <div style={{
            fontSize: sz.vl, color: locked ? '#5a626d' : '#e8b860',
            fontWeight: 650, lineHeight: 1,
          }}>{locked ? '锁' : spec.fmt(showV)}</div>
        </>
      )}
    </div>
  );
}

/** 供调试/自测 */
export const KNOB_CFG = {
  BASE_IMG, MARK_IMG, SWEEP_DEG, START_DEG, CLOCKWISE, markAngleOf,
};

/* ══════════════════════════════════════════════════════════════════
 * PEQ 增益子旋钮
 *
 * 有些 UI 旋钮对应的是【32 位 PEQ 字】的一个字段，不能当普通 dB 寄存器写：
 *   箱头 BASS/MID/PRES/TREBLE → reg 59/60/61/62（PreDist 4 段 PEQ）
 *   过载 TONE/BASS/TREBLE     → reg 56/53
 *
 * PEQ 位域（与 parameterMap.ts buildPEQData 完全一致）：
 *   bit  0..2   type   3bit     bit  3..11  freq   9bit → PEQ_FREQ_TABLE
 *   bit 12..19  gain   8bit → (idx − 120) × 0.2 dB（−24..+12）
 *   bit 20..26  q      7bit     bit 27..31  s      5bit
 * ══════════════════════════════════════════════════════════════════ */
const PEQ_GAIN_SHIFT = 12;
const PEQ_GAIN_MASK = 0xff;
const PEQ_GAIN_ZERO = 120;
const PEQ_GAIN_LSB = 0.2;

export const peqGainIdx = (word: number) => (word >> PEQ_GAIN_SHIFT) & PEQ_GAIN_MASK;
export const peqGainDb = (word: number) => (peqGainIdx(word) - PEQ_GAIN_ZERO) * PEQ_GAIN_LSB;
export const peqSetGainIdx = (word: number, idx: number) =>
  (((word & ~(PEQ_GAIN_MASK << PEQ_GAIN_SHIFT)) |
    ((Math.max(0, Math.min(PEQ_GAIN_MASK, Math.round(idx))) & PEQ_GAIN_MASK) << PEQ_GAIN_SHIFT)) >>> 0);
export const dbToPeqGainIdx = (db: number) =>
  Math.max(0, Math.min(PEQ_GAIN_MASK, Math.round(db / PEQ_GAIN_LSB) + PEQ_GAIN_ZERO));

interface PeqGainProps {
  label: string;
  word: number;
  onWord?: (newWord: number) => void;
  size?: KnobSize;
  locked?: boolean;
  /** v5 透传（首页单排 / 大旋钮面板） */
  chrome?: boolean;
  d?: number | string;
  readOnly?: boolean;
  releaseCommit?: boolean;
  fineX?: boolean;
  enlargeable?: boolean;
  onPreview?: (db: number) => void;
}

/** 只读写 PEQ 字里 gain 字段的旋钮 */
export function PeqGainKnob({ label, word, onWord, size = 'sm', locked,
                              chrome, d, readOnly, releaseCommit, fineX, enlargeable, onPreview }: PeqGainProps) {
  const db = peqGainDb(word);
  const spec: RegSpec = {
    reg: -1, min: -24, max: 12, step: 0.2, def: 0,
    fmt: (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)} dB`,
  };
  return (
    <Knob
      label={label} spec={spec} size={size} locked={locked}
      value={Math.max(-24, Math.min(12, db))}
      chrome={chrome} d={d} readOnly={readOnly}
      releaseCommit={releaseCommit} fineX={fineX} enlargeable={enlargeable}
      onChange={(nv) => onWord?.(peqSetGainIdx(word, dbToPeqGainIdx(nv)))}
      onPreview={onPreview} />
  );
}

export const PEQ_DEBUG = { peqGainIdx, peqGainDb, peqSetGainIdx, dbToPeqGainIdx };

/* ══════════════════════════════════════════════════════════════════
 * PEQ 频点子旋钮
 *
 * 极少数旋钮改的是 PEQ 字的【频点】而不是增益：
 *   ProCo RAT 的 FILTER（reg 53）—— 电路是可变低通，478 … 934.7 Hz
 *
 * PEQ 位域：bit 3..11 = freq（9bit）→ PEQ_FREQ_TABLE（362 档，19.7 … 20600 Hz）
 * ⚠️ 频点表由调用方从 parameterMap.ts 传入（不在此复制整张表）
 * ══════════════════════════════════════════════════════════════════ */
const PEQ_FREQ_SHIFT = 3;
const PEQ_FREQ_MASK = 0x1ff;

export const peqFreqIdx = (word: number) => (word >> PEQ_FREQ_SHIFT) & PEQ_FREQ_MASK;

/** 只改 PEQ 字里 freq 字段（保留 type/gain/Q/S） */
export const peqSetFreqIdx = (word: number, idx: number) =>
  (((word & ~(PEQ_FREQ_MASK << PEQ_FREQ_SHIFT)) |
    ((Math.max(0, Math.min(PEQ_FREQ_MASK, Math.round(idx))) & PEQ_FREQ_MASK)
      << PEQ_FREQ_SHIFT)) >>> 0);

interface PeqFreqProps {
  label: string;
  /** 当前 PEQ 字 */
  word: number;
  /** 值变化：回传新的整个 PEQ 字 */
  onWord?: (newWord: number) => void;
  size?: KnobSize;
  locked?: boolean;
  /** 允许的档位区间（含） */
  loIdx: number;
  hiIdx: number;
  /** 档位 → Hz 的频点表（从 parameterMap.ts 的 PEQ_FREQ_TABLE 传） */
  freqTable: number[];
  /** v5 透传 */
  chrome?: boolean;
  d?: number | string;
  releaseCommit?: boolean;
  fineX?: boolean;
  enlargeable?: boolean;
  onPreview?: (idx: number) => void;
}

/** 只读写 PEQ 字里 freq 字段的旋钮（如 RAT 的 FILTER） */
export function PeqFreqKnob({ label, word, onWord, size = 'sm', locked,
                              loIdx, hiIdx, freqTable,
                              chrome, d, releaseCommit, fineX, enlargeable, onPreview }: PeqFreqProps) {
  const idx = Math.max(loIdx, Math.min(hiIdx, peqFreqIdx(word)));
  const spec: RegSpec = {
    reg: -1, min: loIdx, max: hiIdx, step: 1, def: idx,
    fmt: (v: number) => {
      const i = Math.max(0, Math.min(freqTable.length - 1, Math.round(v)));
      const hz = freqTable[i] ?? 0;
      return hz >= 1000 ? `${(hz / 1000).toFixed(2)} kHz` : `${hz.toFixed(0)} Hz`;
    },
  };
  return (
    <Knob
      label={label} spec={spec} size={size} locked={locked}
      value={idx} chrome={chrome} d={d}
      releaseCommit={releaseCommit} fineX={fineX} enlargeable={enlargeable}
      onChange={(nv) => onWord?.(peqSetFreqIdx(word, nv))}
      onPreview={onPreview} />
  );
}

export const PEQ_FREQ_DEBUG = { peqFreqIdx, peqSetFreqIdx };
