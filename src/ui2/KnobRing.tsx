/**
 * BFX1 新 UI · 刻度旋钮（v5.1 · 2026-10-14）
 *
 * 设计来源：home_ui/index.html（v4 交互稿 knobSVG）—— 用户指定对齐：
 *   · 外圈 11 格刻度（已走过=品牌橙 #F06F21，未走=石灰 #3d424c，每 5 格加长）
 *   · 进度弧 + 旋钮本体（垂直渐变 + 24 握纹）+ 橙色指针
 * 几何：固定 100×100 viewBox，视觉尺寸由 CSS（width/height）决定 → 支持 clamp() 自适应。
 * 交互（v5.2）：
 *   · mode='full'  拖动调节（竖拖 220 / 横拖 0.17）+ 松手一次性提交 + 长按 450ms 浮动面板
 *   · mode='press' 只响应长按（首页缩略旋钮：点/拖都不改参数）
 *   · mode='display' 纯展示（默认）
 *   · 长按抖动阈值 10px（v5.2 由 6px 放宽，避免手指微抖导致长按不触发）
 * 兼容：旧调用 interactive={true/false} 等价于 mode='full'/'display'
 */
import { useCallback, useEffect, useId, useRef, useState } from 'react';

/**
 * ★ v6.2 全局旋钮互斥锁
 * 握持手机时拇指 + 掌根常同时触屏（Android WebView 默认多点触控），
 * 若无互斥会让两个旋钮同时放大并各自写入寄存器 —— 参数被未知改动。这里保证同一时刻只有一个旋钮可操作。
 */
let ACTIVE_KNOB: object | null = null;

/** 短震（WebView 未必支持；失败静默）——WO-04 长按/手势反馈 */
export function buzz(ms = 15): void {
  try { navigator.vibrate?.(ms); } catch { /* ignore */ }
}

import { KNOB, BRAND } from './tokens';

/** 品牌橙（= tokens.BRAND，保持既有导出名） */
export const RING_ORANGE = BRAND;
const TICK_OFF = KNOB.tickOff;
const TRACK = KNOB.track;

const VB = 100;                    // viewBox 边长（几何单位）
const A0 = -140, A1 = 140, SPAN = A1 - A0;
const rad = (d: number) => (d - 90) * Math.PI / 180;

interface Props {
  /** 归一值 0..1 */
  norm: number;
  /** 直径：数字 px 或 CSS 长度（clamp()） */
  size: number | string;
  /** 显示格式：静态字符串，或 (归一值)→文本（拖动气泡实时取值） */
  fmt?: string | ((n: number) => string);
  /** ★ v5.2 交互模式：display 纯展示 / press 仅长按（不拖动）/ full 拖动+长按 */
  mode?: 'display' | 'press' | 'full';
  /** @deprecated 兼容旧调用：等价于 mode = interactive ? 'full' : 'display' */
  interactive?: boolean;
  /** 拖动预览（不走 BLE） */
  onDrag?: (n: number) => void;
  /** 松手提交（写 BLE） */
  onCommit?: (n: number) => void;
  /** 长按 450ms */
  onLongPress?: () => void;
  /** 拖动时显示数值气泡 */
  bubble?: boolean;
  /** 高亮光标（浮动面板选中态） */
  cursor?: boolean;
  opacity?: number;
  /** 长按门槛（ms，默认 450；箱头等主界面直操旋钮可调高） */
  pressMs?: number;
  /** ★ WO-03 首次可发现提示：呼吸高亮一次 */
  hintPulse?: boolean;
  /** 无障碍标签（WO-20） */
  ariaLabel?: string;
  /** ★ v6.1 按住放大倍数（>1 时按下即放大，便于小旋钮精确操作） */
  /** 归一化吸附步长（如噪声门 11 档 = 0.1）—— 拖动即吸附，松手不再跳位置 */
  snap?: number;
  zoom?: number;
  /** ★ 2026-10-19：扩大触摸热区（px）——首页 FX 卡只有 18–20px 的旋钮，
   *  手指几乎点不中；这里在旋钮外围铺一层透明热区，视觉尺寸不变。 */
  hit?: number;
  /** ★★ 2026-10-26：双击复位（dB 类旋钮回到 0 dB）。
   *  触屏上 `onDoubleClick` 不可靠 —— 同元素 `pointerdown` 里的 preventDefault +
   *  setPointerCapture 会抑制 WebView 合成的 click/dblclick。
   *  这里改用 pointerdown 时间戳自己做双击判定（≤320ms、位移 ≤24px）。 */
  onReset?: () => void;
}

export default function KnobRing({
  norm, size, fmt, interactive = false, mode, onDrag, onCommit, onLongPress, bubble = true, cursor = false, opacity,
  pressMs = 450, hintPulse = false, ariaLabel, snap, zoom = 1, hit = 0, onReset,
}: Props) {
  /** 实际交互模式（mode 优先，interactive 兼容） */
  const md: 'display' | 'press' | 'full' = mode ?? (interactive ? 'full' : 'display');
  const canDrag = md === 'full';
  const canPress = md !== 'display';
  const uid = useId().replace(/:/g, '');
  /** ★ v6.2 本旋钮的互斥 token */
  const selfToken = useRef<object>({});
  const t = Math.max(0, Math.min(1, norm));
  const ang = A0 + SPAN * t;
  const cx = VB / 2, cy = VB / 2, tr = VB / 2 - 5.5;
  const P = (d: number, r: number) => [cx + r * Math.cos(rad(d)), cy + r * Math.sin(rad(d))] as const;
  const arc = (d1: number, d2: number, r: number) => {
    const a = P(d1, r), b = P(d2, r);
    const lg = Math.abs(d2 - d1) > 180 ? 1 : 0, sw = d2 > d1 ? 1 : 0;
    return `M ${a[0].toFixed(2)} ${a[1].toFixed(2)} A ${r} ${r} 0 ${lg} ${sw} ${b[0].toFixed(2)} ${b[1].toFixed(2)}`;
  };

  /* ── 拖动 / 长按 ── */
  const drag = useRef<{ y0: number; x0: number; n0: number; moved: boolean } | null>(null);
  /** ★ 2026-10-26：当前生效的 pointerId —— 同一旋钮上的第二根手指一律忽略 */
  const pid = useRef<number | null>(null);
  const lpTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lpFired = useRef(false);
  const [dragging, setDragging] = useState(false);
  const [showV, setShowV] = useState<number | null>(null);

  /** 按下进度环开关（WO-04） */
  const [pressing, setPressing] = useState(false);
  /** ★ v6.1 按住中（用于放大显示） */
  const [active, setActive] = useState(false);

  /** ★ 2026-10-26：双击复位的判定状态（时间戳 + 落点） */
  const lastTap = useRef<{ t: number; x: number; y: number } | null>(null);

  const down = useCallback((e: React.PointerEvent) => {
    if (!canPress) return;
    /* ★★ 2026-10-26：双击复位（触屏可靠版）。
       第一下只是按下（未移动 → 不会 commit）；320ms 内同一位置再按下 = 双击。
       判为双击后**不进入拖动**，也不抢互斥锁，直接把值归零。 */
    if (onReset) {
      const now = Date.now();
      const lt = lastTap.current;
      if (lt && now - lt.t <= 320 && Math.abs(e.clientY - lt.y) <= 24 && Math.abs(e.clientX - lt.x) <= 24) {
        lastTap.current = null;
        e.preventDefault();
        buzz(10);
        onReset();
        return;
      }
      lastTap.current = { t: now, x: e.clientX, y: e.clientY };
    }
    /* ★ v6.2 互斥：已有别的旋钮在被操作 → 忽略这次按下（防多指同时改两个参数） */
    if (ACTIVE_KNOB && ACTIVE_KNOB !== selfToken.current) return;
    ACTIVE_KNOB = selfToken.current;
    /* ★ 2026-10-17：起点先对齐吸附网格，否则第一格会出现「半格跳」 */
    const n0 = snap && snap > 0 ? Math.min(1, Math.round(t / snap) * snap) : t;
    drag.current = { y0: e.clientY, x0: e.clientX, n0, moved: false };
    pid.current = e.pointerId;
    lpFired.current = false;
    if (canDrag) setDragging(true);
    setActive(true);
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    if (onLongPress) {
      setPressing(true);
      buzz(12);                                   // ★ WO-04：按下即反馈
      lpTimer.current = setTimeout(() => {
        lpFired.current = true; setPressing(false); buzz(24);
        onLongPress();
      }, pressMs);
    }
    e.preventDefault();
  }, [canPress, canDrag, t, onLongPress, pressMs, onReset]);

  const move = useCallback((e: React.PointerEvent) => {
    if (!drag.current || !canPress) return;
    /* ★ 2026-10-26：只认按下时那根手指 —— 双指落在同一旋钮上会把基准重置 → 数值瞬跳 */
    if (pid.current !== null && e.pointerId !== pid.current) return;
    const dy = drag.current.y0 - e.clientY;
    const dx = e.clientX - drag.current.x0;
    /* ★ WO-05：移动 >4px 立即锁定为「拖动」，取消长按（避免精细调节被打断） */
    if (!drag.current.moved && Math.abs(dy) + Math.abs(dx) > 4) {
      drag.current.moved = true;
      if (lpTimer.current) {
        clearTimeout(lpTimer.current); lpTimer.current = null;
        if (onLongPress) buzz(8);                 // ★ WO-04：手势被判为拖动 → 轻震告知
      }
      setPressing(false);
    }
    if (lpFired.current) return;                 // 长按已触发 → 不再当拖动
    if (!canDrag) return;                        // press 模式：不调节
    const raw = Math.max(0, Math.min(1, drag.current.n0 + (dy + dx * 0.17) / 220));
    /* ★ 2026-10-17（用户反馈「字符消失后旋钮会跳动」）：
       原来拖动用未量化的 raw 驱动角度，松手后 showV 清空、角度改用 props.norm（已量化），
       两者相差最多半格 → 视觉上旋钮"跳"一下。现在拖动阶段就吸附到同一网格，
       松手前后完全对齐，位置不再变化。 */
    const nv = snap && snap > 0 ? Math.min(1, Math.round(raw / snap) * snap) : raw;
    setShowV(nv);
    onDrag?.(nv);
  }, [canPress, canDrag, onDrag, onLongPress, snap]);

  const up = useCallback((e?: React.PointerEvent) => {
    if (e && pid.current !== null && e.pointerId !== pid.current) return;   // 非本指抬起 → 忽略
    if (ACTIVE_KNOB === selfToken.current) ACTIVE_KNOB = null;   // ★ v6.2 释放互斥
    if (lpTimer.current) { clearTimeout(lpTimer.current); lpTimer.current = null; }
    pid.current = null;
    setPressing(false);
    setActive(false);
    if (canDrag && drag.current?.moved && !lpFired.current && showV !== null) onCommit?.(showV);
    drag.current = null;
    setDragging(false);
    setShowV(null);
  }, [canDrag, onCommit, showV]);

  /**
   * ★★ 2026-10-26（P0 修复）互斥锁的两道兜底。
   *
   * 旧实现只在 `up()` 里释放 `ACTIVE_KNOB`。但下面这些情况**永远不会有 pointerup**：
   *   · 按住旋钮的同时另一指点底栏切页 → 本组件卸载；
   *   · 下拉通知栏 / 来电 / 掌根误触 → 浏览器派发 pointercancel 或丢捕获；
   *   · WebView 切后台。
   * 一旦漏掉，`ACTIVE_KNOB` 就被一个已卸载组件的旧 token 永久占住 ——
   * 之后首页每个旋钮的 `down` 都在 113 行被拒，**33 个旋钮全哑**，只能杀进程。
   * 保险 ①：卸载时释放；保险 ②：丢失捕获时只清理状态、不做提交。
   */
  useEffect(() => () => {
    if (ACTIVE_KNOB === selfToken.current) ACTIVE_KNOB = null;
  }, []);

  const release = useCallback(() => {
    if (ACTIVE_KNOB === selfToken.current) ACTIVE_KNOB = null;
    if (lpTimer.current) { clearTimeout(lpTimer.current); lpTimer.current = null; }
    pid.current = null;
    drag.current = null;
    setPressing(false);
    setActive(false);
    setDragging(false);
    setShowV(null);
  }, []);

  /* ★ WO-20：键盘可达（方向键上下/左右微调 5%） */
  const onKey = useCallback((e: React.KeyboardEvent) => {
    if (!onCommit) return;
    const k = e.key;
    if (k === 'ArrowUp' || k === 'ArrowRight') { e.preventDefault(); onCommit(Math.max(0, Math.min(1, t + 0.05))); }
    else if (k === 'ArrowDown' || k === 'ArrowLeft') { e.preventDefault(); onCommit(Math.max(0, Math.min(1, t - 0.05))); }
  }, [onCommit, t]);

  const showNorm = showV !== null ? showV : t;
  const showAng = A0 + SPAN * showNorm;

  /* ── 刻度（11 格） ── */
  const ticks: React.ReactNode[] = [];
  for (let i = 0; i <= 10; i++) {
    const d = A0 + SPAN * i / 10, big = i % 5 === 0;
    const p1 = P(d, tr + 4.5), p2 = P(d, tr + 4.5 + (big ? 5 : 3));
    ticks.push(
      <line key={i} x1={p1[0]} y1={p1[1]} x2={p2[0]} y2={p2[1]}
        stroke={i / 10 <= t ? RING_ORANGE : TICK_OFF}
        strokeWidth={big ? 1.25 : 1} strokeLinecap="round" opacity={big ? 0.95 : 0.6} />,
    );
  }
  /* ── 握纹（24 条） ── */
  const grips: React.ReactNode[] = [];
  for (let k = 0; k < 24; k++) {
    const ka = (k * Math.PI * 2) / 24;
    grips.push(
      <line key={k}
        x1={cx + (tr - 2) * Math.cos(ka)} y1={cy + (tr - 2) * Math.sin(ka)}
        x2={cx + (tr - 7) * Math.cos(ka)} y2={cy + (tr - 7) * Math.sin(ka)}
        stroke={KNOB.grip} strokeWidth="1" opacity=".5" />,
    );
  }

  return (
    <div
      role={canPress ? 'slider' : undefined}
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(t * 100)}
      aria-disabled={!canPress}
      tabIndex={canPress ? 0 : -1}
      onKeyDown={onKey}
      style={{
      position: 'relative', width: size, height: size, flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      opacity: opacity ?? 1, userSelect: 'none', touchAction: 'none',
      cursor: canDrag ? 'grab' : canPress ? 'pointer' : 'default',
      filter: cursor ? `drop-shadow(0 0 7px ${RING_ORANGE})` : 'drop-shadow(0 2px 3px rgba(0,0,0,.85))',
      /* ★ v6.1：按住放大（首页缩略旋钮也能精确操作），并提升层级 */
      transform: active && zoom > 1 ? `scale(${zoom})` : 'scale(1)',
      zIndex: active && zoom > 1 ? 40 : undefined,
      willChange: 'transform',
      transition: 'transform 110ms cubic-bezier(.2,0,0,1), filter .15s',
    }}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
      onLostPointerCapture={release}
      onContextMenu={(e) => e.preventDefault()}
    >
      {hit > 0 && (
        <span aria-hidden style={{
          position: 'absolute', inset: -hit, borderRadius: '50%', zIndex: 0,
        }} />
      )}
      <svg width={size} height={size} viewBox={`0 0 ${VB} ${VB}`} style={{ display: 'block', position: 'relative', zIndex: 1, transition: 'transform .16s cubic-bezier(.34,1.56,.64,1)' }}>
        <defs>
          <linearGradient id={`${uid}b`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#454c58" /><stop offset=".48" stopColor="#2b3039" /><stop offset="1" stopColor="#2E3440" />
          </linearGradient>
          <linearGradient id={`${uid}s`} x1="0" y1="0" x2=".85" y2="1">
            <stop offset="0" stopColor={KNOB.hi} /><stop offset="1" stopColor={KNOB.low} />
          </linearGradient>
        </defs>
        {ticks}
        <path d={arc(A0, A1, tr - 1)} fill="none" stroke={TRACK} strokeWidth="2.5" strokeLinecap="round" />
        <path d={arc(A0, showAng, tr - 1)} fill="none" stroke={RING_ORANGE} strokeWidth="2.5" strokeLinecap="round" />
        <circle cx={cx} cy={cy} r={tr} fill={`url(#${uid}b)`} stroke={KNOB.grip} strokeWidth="1" />
        {grips}
        <circle cx={cx} cy={cy} r={tr - 7} fill={`url(#${uid}s)`} />
        {/* ★ 2026-10-15：指针光标放大加粗（原 长度 7.5 / 线宽 2.0 太细，不够醒目） */}
        <line
          x1={cx + Math.cos(rad(showAng)) * (tr - 17)} y1={cy + Math.sin(rad(showAng)) * (tr - 17)}
          x2={cx + Math.cos(rad(showAng)) * (tr - 6)} y2={cy + Math.sin(rad(showAng)) * (tr - 6)}
          stroke={RING_ORANGE} strokeWidth="3.4" strokeLinecap="round" />
        <circle cx={cx} cy={cy} r={2.2} fill={KNOB.grip} opacity=".75" />
      </svg>
      {/* ★ WO-04：长按进度环（走完即触发） */}
      {pressing && onLongPress && (
        <svg width={size} height={size} viewBox={`0 0 ${VB} ${VB}`}
          style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          <circle cx={cx} cy={cy} r={tr + 4.5} fill="none" stroke={RING_ORANGE} strokeWidth="2.4"
            strokeLinecap="round" strokeDasharray="289" strokeDashoffset="289"
            style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%',
                     animation: `knobLp ${pressMs}ms linear forwards` }} />
        </svg>
      )}
      {/* ★ WO-03：首次可发现提示（呼吸高亮，一次性） */}
      {hintPulse && (
        <span style={{
          position: 'absolute', inset: -3, borderRadius: '50%',
          border: `1.6px solid ${RING_ORANGE}`, pointerEvents: 'none',
          animation: 'knobHint 1.1s ease-in-out 3',
        }} />
      )}
      {/* 拖动数值气泡 */}
      {bubble && dragging && fmt && (
        <div style={{
          position: 'absolute', left: '50%', top: -16, transform: 'translateX(-50%)',
          padding: '4px 8px', borderRadius: 8, whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 5,
          background: 'rgba(8,10,14,.92)', border: `1px solid ${RING_ORANGE}88`,
          fontSize: 11, fontWeight: 650, color: RING_ORANGE, lineHeight: 1.3,
          boxShadow: '0 2px 8px rgba(0,0,0,.6)',
        }}>{typeof fmt === 'function' ? fmt(showNorm) : fmt}</div>
      )}
    </div>
  );
}
