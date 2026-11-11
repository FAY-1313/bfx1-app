import { useState, useRef, useCallback, useEffect } from 'react';

export interface KnobDisplayMeta {
  /** Map normalized 0-1 value to display string */
  format: (norm: number) => string;
}

/** 不同实物效果器对应不同旋钮样式 (全部按 size×size 居中绘制, 切换不位移) */
export type KnobVariant = 'classic' | 'boss' | 'chickenhead' | 'mxr' | 'flat' | 'vintage';

interface KnobProps {
  label?: string;
  value?: number;
  size?: number;
  accentColor?: string;
  /** 实物旋钮样式 (默认 classic) */
  variant?: KnobVariant;
  onChange?: (v: number) => void;
  /** Called with formatted display text while dragging, null when drag ends */
  onDisplayValue?: (text: string | null) => void;
  /** If provided, formats the value into a display string while dragging */
  displayMeta?: KnobDisplayMeta;
  /** 双击回到中心 0.5 (tone/高中低音旋钮居中归零用) */
  centerOnDoubleClick?: boolean;
  /** 置灰禁用 (不可拖拽, 灰度显示, 如 CLEAN 通道时的箱头 GAIN/VOLUME) */
  disabled?: boolean;
}

// Full sweep: -140° → +140°
const SWEEP = 280;
const START_ANGLE = -140;

export default function Knob({
  label = 'KNOB',
  value = 0.5,
  size = 52,
  accentColor = '#F06F21',
  variant = 'classic',
  onChange = () => {},
  onDisplayValue = () => {},
  displayMeta,
  centerOnDoubleClick = false,
  disabled = false,
}: KnobProps) {
  const [val, setVal] = useState(value);
  const valRef = useRef(value);
  const dragging = useRef(false);
  const startY = useRef(0);
  const startVal = useRef(0);
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync external value changes (e.g. preset load) when not dragging
  useEffect(() => {
    if (!dragging.current) setVal(value);
  }, [value]);

  const angle = START_ANGLE + val * SWEEP;
  const r = size / 2;

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (disabled) return;
    dragging.current = true;
    startY.current = e.clientY;
    startVal.current = val;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();
    if (fadeTimerRef.current) { clearTimeout(fadeTimerRef.current); fadeTimerRef.current = null; }
    onDisplayValue(displayMeta ? displayMeta.format(val) : String(val));
  }, [val, displayMeta, onDisplayValue, disabled]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    const delta = (startY.current - e.clientY) / 120;
    const next = Math.max(0, Math.min(1, startVal.current + delta));
    setVal(next);
    valRef.current = next;
    onDisplayValue(displayMeta ? displayMeta.format(next) : String(next));
  }, [displayMeta, onDisplayValue]);

  const handlePointerUp = useCallback(() => {
    if (!dragging.current) return;
    dragging.current = false;
    onChange(valRef.current);
    if (displayMeta) {
      if (fadeTimerRef.current) { clearTimeout(fadeTimerRef.current); }
      fadeTimerRef.current = setTimeout(() => {
        onDisplayValue(null);
        fadeTimerRef.current = null;
      }, 1000);
    }
  }, [onChange, displayMeta, onDisplayValue]);

  // Geometry helpers (shared by all variants, all centered)
  const arcR = r - 5;
  const polarToXY = (deg: number, radius: number) => {
    const rad = ((deg - 90) * Math.PI) / 180;
    return { x: r + radius * Math.cos(rad), y: r + radius * Math.sin(rad) };
  };
  const arcStart = polarToXY(START_ANGLE, arcR);
  const arcEnd = polarToXY(angle, arcR);
  const trackEnd = polarToXY(START_ANGLE + SWEEP, arcR);
  const arcSpan = angle - START_ANGLE;
  const largeArc = arcSpan > 180 ? 1 : 0;

  // Pointer: from center outward, slightly shorter than knob radius
  const ptrR = r * 0.5;
  const ptrRad = ((angle - 90) * Math.PI) / 180;
  const ptrX = r + ptrR * Math.cos(ptrRad);
  const ptrY = r + ptrR * Math.sin(ptrRad);

  // Ticks: 5 major at even angles
  const ticks = [-140, -70, 0, 70, 140].map(a => {
    const rad = ((a - 90) * Math.PI) / 180;
    const outer = r - 1;
    const inner = r - 3.5;
    return {
      x1: r + outer * Math.cos(rad), y1: r + outer * Math.sin(rad),
      x2: r + inner * Math.cos(rad), y2: r + inner * Math.sin(rad),
      active: a <= angle,
    };
  });

  // gradient id 需含 variant, 避免不同样式同 label 时 defs 冲突
  const uid = `${variant}-${label.replace(/\W/g, '_')}`;

  // 外圈细密锯齿 (MXR 滚花)
  const knurl = Array.from({ length: 20 }).map((_, i) => {
    const a = (i / 20) * 360 - 90;
    const rad = (a * Math.PI) / 180;
    const x1 = r + (r * 0.66) * Math.cos(rad), y1 = r + (r * 0.66) * Math.sin(rad);
    const x2 = r + (r * 0.74) * Math.cos(rad), y2 = r + (r * 0.74) * Math.sin(rad);
    return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(255,255,255,0.18)" strokeWidth="1" />;
  });

  return (
    <div
      data-cmp="Knob"
      onDoubleClick={() => {
        if (disabled || !centerOnDoubleClick) return;
        setVal(0.5);
        valRef.current = 0.5;
        onChange(0.5);
      }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6,
        userSelect: 'none',
        minWidth: size,
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        style={{ touchAction: 'none', cursor: disabled ? 'default' : 'ns-resize', overflow: 'visible', filter: disabled ? 'grayscale(1) opacity(0.45)' : 'none', transition: 'filter 0.15s ease' }}
      >
        <defs>
          <radialGradient id={`kb-${uid}`} cx="38%" cy="30%" r="80%">
            <stop offset="0%" stopColor="#4a4d55" />
            <stop offset="45%" stopColor="#2c2e34" />
            <stop offset="100%" stopColor="#17181c" />
          </radialGradient>
          <radialGradient id={`kbcap-${uid}`} cx="40%" cy="32%" r="70%">
            <stop offset="0%" stopColor="#55575e" />
            <stop offset="100%" stopColor="#1c1d21" />
          </radialGradient>
          {variant === 'boss' && (
            <radialGradient id={`kbboss-${uid}`} cx="42%" cy="30%" r="78%">
              <stop offset="0%" stopColor="#2f3137" />
              <stop offset="55%" stopColor="#1a1b20" />
              <stop offset="100%" stopColor="#0d0e11" />
            </radialGradient>
          )}
          {(variant === 'mxr' || variant === 'flat') && (
            <radialGradient id={`kbflat-${uid}`} cx="42%" cy="30%" r="76%">
              <stop offset="0%" stopColor="#45474d" />
              <stop offset="100%" stopColor="#191a1e" />
            </radialGradient>
          )}
          {variant === 'vintage' && (
            <radialGradient id={`kbvin-${uid}`} cx="40%" cy="32%" r="76%">
              <stop offset="0%" stopColor="#4a4236" />
              <stop offset="60%" stopColor="#26221a" />
              <stop offset="100%" stopColor="#15120d" />
            </radialGradient>
          )}
        </defs>

        {variant === 'classic' && (
          <>
            {/* Track background */}
            <path
              d={`M ${arcStart.x} ${arcStart.y} A ${arcR} ${arcR} 0 1 1 ${trackEnd.x} ${trackEnd.y}`}
              fill="none" stroke="#3a3b40" strokeWidth="2" strokeLinecap="round"
            />
            {/* Active arc */}
            {arcSpan > 0 && (
              <path
                d={`M ${arcStart.x} ${arcStart.y} A ${arcR} ${arcR} 0 ${largeArc} 1 ${arcEnd.x} ${arcEnd.y}`}
                fill="none" stroke={accentColor} strokeWidth="2" strokeLinecap="round" opacity="0.85"
              />
            )}
            {/* Tick marks */}
            {ticks.map((t, i) => (
              <line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2}
                stroke={t.active ? '#e8e8ec' : '#6b6e76'} strokeWidth="1.2" strokeLinecap="round" />
            ))}
            {/* Knob body */}
            <circle cx={r} cy={r} r={r * 0.66} fill={`url(#kb-${uid})`} stroke="#0e0f12" strokeWidth="1" />
            {/* Inner ring */}
            <circle cx={r} cy={r} r={r * 0.52} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="0.7" />
            {/* Pointer line */}
            <line x1={r} y1={r} x2={ptrX} y2={ptrY} stroke={accentColor} strokeWidth="2.2" strokeLinecap="round" />
            {/* Pointer tip dot */}
            <circle cx={ptrX} cy={ptrY} r="2" fill={accentColor} />
            {/* Center cap */}
            <circle cx={r} cy={r} r={r * 0.20} fill={`url(#kbcap-${uid})`} stroke="#0e0f12" strokeWidth="0.8" />
            {/* Specular highlight */}
            <ellipse cx={r - r * 0.20} cy={r - r * 0.24} rx={r * 0.15} ry={r * 0.10}
              fill="rgba(255,255,255,0.09)" transform={`rotate(-30 ${r - r * 0.20} ${r - r * 0.24})`} />
          </>
        )}

        {variant === 'boss' && (
          <>
            {/* 橡胶大旋钮 (Boss) */}
            <circle cx={r} cy={r} r={r * 0.80} fill={`url(#kbboss-${uid})`} stroke="#0b0c0e" strokeWidth="1" />
            {/* 防滑胶圈 */}
            <circle cx={r} cy={r} r={r * 0.60} fill="none" stroke="rgba(0,0,0,0.38)" strokeWidth="1.5" strokeDasharray="2 2.5" />
            {/* 顶部白色指示条 (随角度转) */}
            <g transform={`rotate(${angle} ${r} ${r})`}>
              <rect x={r - r * 0.11} y={r * 0.10} width={r * 0.22} height={r * 0.40} rx={r * 0.05} fill="#e8e9ec" opacity="0.92" />
            </g>
            {/* 中心螺丝 */}
            <circle cx={r} cy={r} r={r * 0.17} fill={`url(#kbcap-${uid})`} stroke="#000" strokeWidth="0.8" />
            <line x1={r - r * 0.07} y1={r} x2={r + r * 0.07} y2={r} stroke="#000" strokeWidth="1.3" />
          </>
        )}

        {variant === 'chickenhead' && (
          <>
            {/* 小圆钮 + 鸡头指示翅 (Klon) */}
            <circle cx={r} cy={r} r={r * 0.44} fill={`url(#kb-${uid})`} stroke="#0e0f12" strokeWidth="1" />
            <circle cx={r} cy={r} r={r * 0.30} fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth="0.8" strokeDasharray="1.5 1.5" />
            <g transform={`rotate(${angle} ${r} ${r})`}>
              <rect x={r - r * 0.09} y={r * 0.06} width={r * 0.18} height={r * 0.74} rx={r * 0.045} fill="#d8d4c8" />
              <rect x={r - r * 0.09} y={r * 0.06} width={r * 0.06} height={r * 0.74} rx={r * 0.03} fill={accentColor} opacity="0.9" />
            </g>
            <circle cx={r} cy={r} r={r * 0.12} fill="#0b0c0e" />
          </>
        )}

        {variant === 'mxr' && (
          <>
            {/* 平头小旋钮 + 滚花边 (MXR/TS9) */}
            <circle cx={r} cy={r} r={r * 0.70} fill={`url(#kbflat-${uid})`} stroke="#0e0f12" strokeWidth="1" />
            {knurl}
            <g transform={`rotate(${angle} ${r} ${r})`}>
              <rect x={r - 1.5} y={r * 0.14} width={3} height={r * 0.48} rx={1.5} fill={accentColor} />
            </g>
            <circle cx={r} cy={r} r={r * 0.13} fill={`url(#kbcap-${uid})`} stroke="#000" strokeWidth="0.8" />
          </>
        )}

        {variant === 'flat' && (
          <>
            {/* 工作室平面旋钮 + 细指针 (1176/Distressor) */}
            <circle cx={r} cy={r} r={r * 0.72} fill={`url(#kbflat-${uid})`} stroke="#0e0f12" strokeWidth="1" />
            <line x1={r} y1={r} x2={ptrX} y2={ptrY} stroke="#e8e8ec" strokeWidth="1.8" strokeLinecap="round" />
            <circle cx={r} cy={r} r={r * 0.14} fill={`url(#kbcap-${uid})`} stroke="#000" strokeWidth="0.8" />
          </>
        )}

        {variant === 'vintage' && (
          <>
            {/* 复古大旋钮 (法兹) */}
            <circle cx={r} cy={r} r={r * 0.80} fill={`url(#kbvin-${uid})`} stroke="#0b0c0e" strokeWidth="1" />
            <circle cx={r} cy={r} r={r * 0.62} fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth="1" />
            <circle cx={r} cy={r} r={r * 0.44} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
            <g transform={`rotate(${angle} ${r} ${r})`}>
              <rect x={r - r * 0.17} y={r * 0.08} width={r * 0.34} height={r * 0.50} rx={r * 0.06} fill="#d8d0c0" opacity="0.95" />
              <rect x={r - r * 0.17} y={r * 0.08} width={r * 0.09} height={r * 0.50} rx={r * 0.03} fill={accentColor} opacity="0.8" />
            </g>
            <circle cx={r} cy={r} r={r * 0.15} fill="#141210" stroke="#000" strokeWidth="0.8" />
          </>
        )}
      </svg>

      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: disabled ? '#56595f' : '#b0b3bb',
          letterSpacing: '0.02em',
          fontFamily: '"Consolas", "Menlo", monospace',
          textAlign: 'center',
          lineHeight: 1,
          whiteSpace: 'nowrap',
          maxWidth: size + 8,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {label}
      </span>
    </div>
  );
}
