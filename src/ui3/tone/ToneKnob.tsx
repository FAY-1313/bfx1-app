import { useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';

const START = 135;
const SWEEP = 270;
const R = 41;

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function polar(r: number, deg: number): [number, number] {
  const a = (deg * Math.PI) / 180;
  return [50 + r * Math.cos(a), 50 + r * Math.sin(a)];
}

export interface ToneKnobProps {
  label: string;
  value: number;
  defaultValue?: number;
  size?: number;
  accent?: string;
  amp?: boolean;
  /** 新型号旋钮母版（透明 WebP）；有图时隐藏 CSS 刻度/指针，只旋转图片本体 */
  image?: string;
  showValue?: boolean;
  hideLabel?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
  formatValue?: (v: number) => string;
  onChange?: (v: number) => void;
  onCommit?: (v: number, prev: number) => void;
}

export default function ToneKnob({
  label,
  value,
  defaultValue = 0.5,
  size = 44,
  accent = '#ffa53a',
  amp = false,
  image,
  showValue = true,
  hideLabel = false,
  disabled = false,
  ariaLabel,
  formatValue,
  onChange,
  onCommit,
}: ToneKnobProps) {
  const [dragging, setDragging] = useState(false);
  /* ★★★ v4.28：数值浮动框改为「锚定旋钮的浮层」。
     旧实现是 `.t3k-bubble { position: fixed; left: 50%; top: 7px }` ——
     即永远画在**视口顶部正中**，再被祖先的 transform / filter / backdrop-filter
     改变包含块位置，或落进 sticky 的 quick 条（z-index:30）的层里被卡片盖住。
     结果就是：只有箱头 / 过载那两张卡能看见，其余旋钮（quick 条、合唱/延迟/混响、
     PRE EQ）在 iOS 上完全看不到数值框。
     现在用 portal 挂到 body + 按旋钮实测坐标定位（顶部空间不足就翻到旋钮下方），
     与所有祖先的 overflow / transform / 层叠上下文彻底无关。 */
  const hitRef = useRef<HTMLDivElement | null>(null);
  const [bubbleAt, setBubbleAt] = useState<{ x: number; y: number; below: boolean } | null>(null);
  const startRef = useRef<{ y: number; v: number; moved: boolean } | null>(null);
  const latestRef = useRef(value);
  const lastYRef = useRef(0);
  const fineRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const lastTapRef = useRef(0);

  latestRef.current = value;

  const norm = clamp01(value);
  const angle = START + SWEEP * norm;
  const [x0, y0] = polar(R, START);
  const [x1, y1] = polar(R, angle);
  const [ix0, iy0] = polar(47, START);
  const [ix1, iy1] = polar(47, angle);
  const large = SWEEP * norm > 180 ? 1 : 0;

  const ticks = Array.from({ length: 21 }, (_, i) => {
    const t = i / 20;
    const a = START + SWEEP * t;
    const active = t <= norm + 0.001;
    const [ax, ay] = polar(45, a);
    const [bx, by] = polar(i % 5 === 0 ? 49.4 : 48, a);
    return (
      <line
        key={i}
        x1={ax} y1={ay} x2={bx} y2={by}
        stroke={active ? accent : 'rgba(255,255,255,.18)'}
        strokeWidth={i % 5 === 0 ? 1.4 : 0.9}
        strokeLinecap="round"
      />
    );
  });

  const display = (v: number) => (formatValue ? formatValue(v) : `${Math.round(v * 100)}%`);
  const labelText = ariaLabel ?? label;

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const commit = (v: number, prev: number) => {
    onCommit?.(clamp01(v), prev);
  };

  /** 浮层定位：旋钮正上方；顶部放不下（顶栏/安全区）就翻到旋钮下方；水平夹进视口 */
  const placeBubble = () => {
    const el = hitRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const half = 46;                                    // 浮层半宽（max-width 80 + padding）
    const cx = r.left + r.width / 2;
    const x = Math.max(half + 6, Math.min(window.innerWidth - half - 6, cx));
    const below = r.top < 78;                           // 上方空间不够 → 放下面
    setBubbleAt({ x, y: below ? r.bottom + 6 : r.top - 6, below });
  };

  const down = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    lastYRef.current = e.clientY;
    startRef.current = { y: e.clientY, v: norm, moved: false };
    setDragging(true);
    placeBubble();
    clearTimer();
    timerRef.current = window.setTimeout(() => {
      fineRef.current = true;
      const s = startRef.current;
      if (s) {
        s.y = lastYRef.current;
        s.v = latestRef.current;
      }
    }, 320);
  };

  const move = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = startRef.current;
    if (!s || disabled) return;
    lastYRef.current = e.clientY;
    const dy = s.y - e.clientY;
    if (Math.abs(dy) > 2) s.moved = true;
    const scale = fineRef.current ? 0.32 : 1;
    const next = clamp01(s.v + (dy / 200) * scale);
    latestRef.current = next;
    onChange?.(next);
  };

  const up = () => {
    const s = startRef.current;
    if (!s) return;
    clearTimer();
    fineRef.current = false;
    setDragging(false);
    setBubbleAt(null);
    const current = latestRef.current;
    startRef.current = null;
    if (!s.moved) {
      const now = performance.now();
      if (now - lastTapRef.current < 320) {
        lastTapRef.current = 0;
        latestRef.current = clamp01(defaultValue);
        onChange?.(clamp01(defaultValue));
        commit(defaultValue, current);
      } else {
        lastTapRef.current = now;
      }
      return;
    }
    lastTapRef.current = 0;
    commit(current, s.v);
  };

  const cancel = () => {
    clearTimer();
    fineRef.current = false;
    setDragging(false);
    setBubbleAt(null);
    startRef.current = null;
  };

  const key = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const step = e.shiftKey ? 0.1 : 0.01;
    let next: number | null = null;
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') next = clamp01(norm + step);
    else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') next = clamp01(norm - step);
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = 1;
    else if (e.key === 'Enter' || e.key === ' ') next = clamp01(defaultValue);
    if (next === null) return;
    e.preventDefault();
    latestRef.current = next;
    onChange?.(next);
    commit(next, norm);
  };

  const style = {
    '--t3k-size': `${size}px`,
    '--t3k-accent': accent,
  } as CSSProperties;

  return (
    <div
      className={`t3k${amp ? ' is-amp' : ''}${image ? ' has-img' : ''}${dragging ? ' is-drag' : ''}${disabled ? ' is-off' : ''}`}
      style={style}
    >
      <div
        ref={hitRef}
        className="t3k-hit"
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={labelText}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(norm * 100)}
        aria-valuetext={`${labelText} ${display(norm)}`}
        aria-disabled={disabled || undefined}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={cancel}
        onKeyDown={key}
      >
        <div className="t3k-ring">
          {image ? (
            <>
              <img
                className="t3k-img"
                src={image}
                alt=""
                draggable={false}
                style={{ transform: `rotate(${angle - 270}deg)` }}
              />
              <svg className="t3k-img-arc" viewBox="0 0 100 100" aria-hidden="true">
                <circle cx="50" cy="50" r="47" fill="none" stroke="rgba(255,255,255,.14)" strokeWidth="1.8" />
                {norm > 0.005 && (
                  <path
                    d={`M ${ix0} ${iy0} A 47 47 0 ${large} 1 ${ix1} ${iy1}`}
                    fill="none" stroke={accent} strokeWidth="2.2" strokeLinecap="round" opacity=".95"
                  />
                )}
              </svg>
            </>
          ) : (
            <>
              <svg viewBox="0 0 100 100" aria-hidden="true">
                <circle cx="50" cy="50" r={R} fill="none" stroke="rgba(0,0,0,.55)" strokeWidth="2.4" />
                {norm > 0.005 && (
                  <path
                    d={`M ${x0} ${y0} A ${R} ${R} 0 ${large} 1 ${x1} ${y1}`}
                    fill="none" stroke={accent} strokeWidth="2.6" strokeLinecap="round" opacity=".95"
                  />
                )}
                {ticks}
              </svg>
              <div className="t3k-cap">
                <div className="t3k-ptr" style={{ transform: `rotate(${angle + 90}deg)` }} />
              </div>
            </>
          )}
        </div>
        {dragging && bubbleAt && createPortal(
          <div
            className={`t3k-bubble${bubbleAt.below ? ' is-below' : ''}`}
            aria-hidden="true"
            style={{
              left: bubbleAt.x,
              top: bubbleAt.y,
              '--t3k-accent': accent,
            } as CSSProperties}
          >
            <span>{labelText}</span>
            <b>{display(norm)}</b>
          </div>,
          document.body,
        )}
      </div>
      {!hideLabel && <div className="t3k-lab">{label}</div>}
      {showValue && <div className="t3k-val">{display(norm)}</div>}
    </div>
  );
}
