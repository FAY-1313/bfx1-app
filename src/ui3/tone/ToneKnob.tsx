import { useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';

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

  const down = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    lastYRef.current = e.clientY;
    startRef.current = { y: e.clientY, v: norm, moved: false };
    setDragging(true);
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
        {dragging && (
          <div className="t3k-bubble">
            <span>{labelText}</span>
            <b>{display(norm)}</b>
          </div>
        )}
      </div>
      {!hideLabel && <div className="t3k-lab">{label}</div>}
      {showValue && <div className="t3k-val">{display(norm)}</div>}
    </div>
  );
}
