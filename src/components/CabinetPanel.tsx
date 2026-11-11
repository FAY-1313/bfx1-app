interface CabinetPanelProps {
  name?: string;
  on?: boolean;
  accentColor?: string;
  onToggle?: () => void;
}

export default function CabinetPanel({
  name = 'Bug 1990',
  on = true,
  accentColor = 'rgb(204, 170, 68)',
  onToggle = () => {},
}: CabinetPanelProps) {
  // Determine speaker layout from cabinet name
  const is8x10 = name.includes('8×10');
  const is4x12 = name.includes('4×12') || name.includes('4x12');
  const is4x10 = name.includes('4×10') || name.includes('4x10');
  const is2x12 = name.includes('2×12') || name.includes('2x12');
  const is1x12 = name.includes('1×12') || name.includes('1x12');

  let cols = 2;
  let rows = 2;
  if (is8x10) { cols = 2; rows = 4; }
  else if (is4x12 || is4x10) { cols = 2; rows = 2; }
  else if (is2x12) { cols = 2; rows = 1; }
  else if (is1x12) { cols = 1; rows = 1; }

  const totalSpeakers = cols * rows;
  const speakerSize = cols === 1 ? 90 : cols === 2 && rows <= 2 ? 72 : 58;
  const speakers = Array.from({ length: totalSpeakers });

  // Parse accent color for usage
  const isRgb = accentColor.startsWith('rgb');
  const accentRgbRaw = isRgb
    ? accentColor.replace(/rgba?\(/, '').replace(')', '').split(',').map(s => s.trim())
    : ['204', '170', '68'];
  const accentRgb = accentRgbRaw.slice(0, 3);
  const accentHex = '#' + accentRgb.map(v => parseInt(v).toString(16).padStart(2, '0')).join('');

  return (
    <div
      data-cmp="CabinetPanel"
      style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}
    >
      {/* Cabinet body — skeuomorphic design */}
      <div
        style={{
          width: '100%',
          position: 'relative',
          borderRadius: 10,
          // Skeuomorphic layered background: dark wood/tolex texture
          background: `linear-gradient(180deg, rgb(28,22,16) 0%, rgb(20,16,10) 40%, rgb(24,18,12) 100%)`,
          border: `2px solid rgb(${on ? '80,60,30' : '45,35,20'})`,
          boxShadow: on
            ? `0 8px 32px rgba(0,0,0,0.85), 0 2px 0 rgba(255,255,255,0.06) inset, 0 -2px 0 rgba(0,0,0,0.5) inset, 2px 0 0 rgba(255,255,255,0.03) inset, -2px 0 0 rgba(0,0,0,0.4) inset`
            : `0 4px 16px rgba(0,0,0,0.7), 0 2px 0 rgba(255,255,255,0.03) inset`,
          opacity: on ? 1 : 0.7,
          transition: 'all 0.2s ease',
          overflow: 'hidden',
        }}
      >
        {/* Tolex texture overlay */}
        <div style={{
          position: 'absolute', inset: 0, borderRadius: 10,
          backgroundImage: `
            repeating-linear-gradient(
              45deg,
              transparent,
              transparent 2px,
              rgba(0,0,0,0.08) 2px,
              rgba(0,0,0,0.08) 4px
            )
          `,
          pointerEvents: 'none',
        }} />

        {/* Top edge highlight */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 3,
          background: `linear-gradient(90deg, rgba(255,255,255,0.04), rgba(255,255,255,0.1) 30%, rgba(255,255,255,0.1) 70%, rgba(255,255,255,0.04))`,
          borderRadius: '10px 10px 0 0',
          pointerEvents: 'none',
        }} />

        {/* Corner bolt screws */}
        {[
          { top: 8, left: 8 }, { top: 8, right: 8 },
          { bottom: 8, left: 8 }, { bottom: 8, right: 8 }
        ].map((pos, i) => (
          <div key={i} style={{
            position: 'absolute',
            width: 10, height: 10, borderRadius: '50%',
            background: `radial-gradient(circle at 35% 30%, rgb(140,130,100), rgb(60,50,30) 60%, rgb(30,25,15))`,
            border: '1px solid rgba(0,0,0,0.6)',
            boxShadow: '0 1px 2px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.15)',
            zIndex: 3,
            ...pos,
          }}>
            {/* Screw slot */}
            <div style={{
              position: 'absolute',
              top: '50%', left: '20%', right: '20%', height: 1,
              background: 'rgba(0,0,0,0.7)',
              transform: 'translateY(-50%) rotate(45deg)',
            }} />
          </div>
        ))}

        {/* Inner content */}
        <div style={{ position: 'relative', zIndex: 1, padding: '12px 12px 10px' }}>

          {/* Grille section */}
          <div style={{
            position: 'relative',
            borderRadius: 6,
            overflow: 'hidden',
            border: '2px solid rgba(0,0,0,0.6)',
            boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.7), inset 0 -1px 0 rgba(255,255,255,0.05)',
          }}>
            {/* Speaker grille cloth */}
            <div style={{
              position: 'absolute', inset: 0,
              background: `
                linear-gradient(160deg, rgba(20,14,8,0.9) 0%, rgba(10,8,4,0.95) 100%)
              `,
              backgroundImage: `
                repeating-linear-gradient(
                  0deg, transparent, transparent 3px,
                  rgba(0,0,0,0.2) 3px, rgba(0,0,0,0.2) 4px
                ),
                repeating-linear-gradient(
                  90deg, transparent, transparent 3px,
                  rgba(0,0,0,0.15) 3px, rgba(0,0,0,0.15) 4px
                )
              `,
              pointerEvents: 'none',
            }} />

            {/* Grille frame inner shadow */}
            <div style={{
              position: 'absolute', inset: 0,
              boxShadow: 'inset 0 0 20px rgba(0,0,0,0.8)',
              pointerEvents: 'none',
              zIndex: 2,
            }} />

            {/* Speakers grid */}
            <div style={{
              position: 'relative', zIndex: 1,
              display: 'flex',
              flexWrap: 'wrap',
              gap: 8,
              justifyContent: 'center',
              alignItems: 'center',
              padding: 10,
            }}>
              {speakers.map((_, i) => (
                <SpeakerCone
                  key={i}
                  size={speakerSize}
                  accentColor={accentColor}
                  accentHex={accentHex}
                  on={on}
                />
              ))}
            </div>
          </div>

          {/* Bottom panel — model name + power switch */}
          <div style={{
            marginTop: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingLeft: 4,
            paddingRight: 4,
          }}>
            {/* Brand / model label plate */}
            <div style={{
              background: `linear-gradient(135deg, rgb(${on ? `${accentRgb[0]},${accentRgb[1]},${accentRgb[2]}` : '60,50,30'}) 0%, rgb(${on ? `${Math.max(0,parseInt(accentRgb[0])-40)},${Math.max(0,parseInt(accentRgb[1])-30)},${Math.max(0,parseInt(accentRgb[2])-20)}` : '35,28,16'}) 100%)`,
              borderRadius: 3,
              padding: '2px 8px',
              border: `1px solid rgba(0,0,0,0.4)`,
              boxShadow: on
                ? `0 0 8px rgba(${accentRgb[0]},${accentRgb[1]},${accentRgb[2]},0.4), inset 0 1px 0 rgba(255,255,255,0.15)`
                : 'inset 0 1px 0 rgba(255,255,255,0.05)',
            }}>
              <span style={{
                fontSize: 10.5,
                fontWeight: 800,
                letterSpacing: '0.18em',
                fontFamily: '"Barlow-Regular_2", sans-serif',
                textTransform: 'uppercase',
                color: on ? 'rgb(10,8,4)' : 'rgba(60,50,30,0.6)',
                textShadow: on ? `0 1px 0 rgba(255,255,255,0.3)` : 'none',
              }}>
                {name}
              </span>
            </div>

            {/* Power toggle switch — skeuomorphic rocker */}
            <div
              onClick={onToggle}
              style={{
                position: 'relative',
                width: 44,
                height: 22,
                borderRadius: 3,
                background: `linear-gradient(180deg, rgb(18,14,8) 0%, rgb(30,24,14) 100%)`,
                border: '1.5px solid rgba(0,0,0,0.7)',
                boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.7), 0 1px 0 rgba(255,255,255,0.06)',
                cursor: 'pointer',
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              {/* Switch track */}
              <div style={{
                position: 'absolute',
                top: 3, bottom: 3,
                left: on ? 'calc(50% + 1px)' : 2,
                width: 'calc(50% - 3px)',
                borderRadius: 2,
                background: on
                  ? `linear-gradient(180deg, rgba(${accentRgb[0]},${accentRgb[1]},${accentRgb[2]},0.9) 0%, rgba(${Math.max(0,parseInt(accentRgb[0])-40)},${Math.max(0,parseInt(accentRgb[1])-30)},${Math.max(0,parseInt(accentRgb[2])-20)},0.9) 100%)`
                  : `linear-gradient(180deg, rgb(40,34,22) 0%, rgb(28,22,12) 100%)`,
                boxShadow: on
                  ? `0 0 6px rgba(${accentRgb[0]},${accentRgb[1]},${accentRgb[2]},0.6), inset 0 1px 0 rgba(255,255,255,0.2)`
                  : 'inset 0 1px 2px rgba(0,0,0,0.5)',
                transition: 'all 0.15s ease',
                border: on
                  ? `1px solid rgba(${accentRgb[0]},${accentRgb[1]},${accentRgb[2]},0.5)`
                  : '1px solid rgba(0,0,0,0.4)',
              }} />

              {/* ON / OFF text */}
              <div style={{
                position: 'absolute', inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: on ? 'flex-end' : 'flex-start',
                padding: '0 5px',
                pointerEvents: 'none',
              }}>
                <span style={{
                  fontSize: 10.5,
                  fontWeight: 800,
                  fontFamily: '"Barlow-Regular_2", sans-serif',
                  letterSpacing: '0.08em',
                  color: on ? 'rgba(10,8,4,0.8)' : 'rgba(80,65,40,0.5)',
                }}>
                  {on ? 'ON' : 'OFF'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Speaker Cone SVG Component ──────────────────────────────────────────────
export function SpeakerCone({
  size = 72,
  accentColor = 'rgb(204,170,68)',
  accentHex = '#ccaa44',
  on = true,
}: {
  size?: number;
  accentColor?: string;
  accentHex?: string;
  on?: boolean;
}) {
  const r = size / 2;
  const uid = `sp-${size}-${accentHex.replace('#', '')}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{ flexShrink: 0, display: 'block' }}
    >
      <defs>
        <radialGradient id={`${uid}-outer`} cx="42%" cy="35%" r="65%">
          <stop offset="0%" stopColor="rgb(45,45,50)" />
          <stop offset="60%" stopColor="rgb(22,22,26)" />
          <stop offset="100%" stopColor="rgb(10,10,12)" />
        </radialGradient>
        <radialGradient id={`${uid}-cone`} cx="40%" cy="35%" r="68%">
          <stop offset="0%" stopColor="rgb(52,52,58)" />
          <stop offset="45%" stopColor="rgb(24,24,28)" />
          <stop offset="100%" stopColor="rgb(8,8,10)" />
        </radialGradient>
        <radialGradient id={`${uid}-cap`} cx="38%" cy="32%" r="70%">
          <stop offset="0%" stopColor="rgb(60,60,65)" />
          <stop offset="100%" stopColor="rgb(18,18,22)" />
        </radialGradient>
        <filter id={`${uid}-glow`} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="1.5" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      <circle cx={r} cy={r} r={r - 1}
        fill={`url(#${uid}-outer)`}
        stroke="rgba(60,60,70,0.6)" strokeWidth="1"
      />
      {[0.88, 0.80, 0.72].map((f, i) => (
        <circle key={i} cx={r} cy={r} r={r * f} fill="none"
          stroke={i === 0 ? 'rgba(50,50,58,0.9)' : 'rgba(35,35,42,0.7)'}
          strokeWidth={i === 0 ? 1.5 : 1}
        />
      ))}
      <circle cx={r} cy={r} r={r * 0.65}
        fill={`url(#${uid}-cone)`}
        stroke="rgba(40,40,48,0.6)" strokeWidth="0.8"
      />
      {[0.58, 0.50, 0.42].map((f, i) => (
        <circle key={i} cx={r} cy={r} r={r * f} fill="none"
          stroke="rgba(30,30,36,0.8)" strokeWidth="0.7" />
      ))}
      <circle cx={r} cy={r} r={r * 0.30}
        fill="rgba(14,14,18,0.95)"
        stroke="rgba(50,50,60,0.6)" strokeWidth="1"
      />
      <circle cx={r} cy={r} r={r * 0.22}
        fill={`url(#${uid}-cap)`}
        stroke="rgba(60,60,70,0.5)" strokeWidth="0.7"
      />
      <ellipse
        cx={r - r * 0.08} cy={r - r * 0.09}
        rx={r * 0.10} ry={r * 0.07}
        fill="rgba(255,255,255,0.07)"
        transform={`rotate(-35 ${r - r * 0.08} ${r - r * 0.09})`}
      />
      <circle cx={r} cy={r} r={r * 0.055}
        fill="rgba(70,70,80,0.9)"
        stroke="rgba(90,90,100,0.4)" strokeWidth="0.5"
      />
      <line x1={r - r * 0.038} y1={r} x2={r + r * 0.038} y2={r}
        stroke="rgba(40,40,50,0.8)" strokeWidth="0.8" />
      <line x1={r} y1={r - r * 0.038} x2={r} y2={r + r * 0.038}
        stroke="rgba(40,40,50,0.8)" strokeWidth="0.8" />
      {[45, 135, 225, 315].map((angle, i) => {
        const rad = (angle * Math.PI) / 180;
        const bx = r + r * 0.80 * Math.cos(rad);
        const by = r + r * 0.80 * Math.sin(rad);
        return (
          <g key={i}>
            <circle cx={bx} cy={by} r={r * 0.052}
              style={{ fill: 'rgb(55,55,62)' }}
              stroke="rgba(80,80,90,0.5)" strokeWidth="0.5" />
            <line x1={bx - r * 0.025} y1={by} x2={bx + r * 0.025} y2={by}
              stroke="rgba(30,30,38,0.9)" strokeWidth="0.7" />
            <line x1={bx} y1={by - r * 0.025} x2={bx} y2={by + r * 0.025}
              stroke="rgba(30,30,38,0.9)" strokeWidth="0.7" />
          </g>
        );
      })}
      {on && (
        <circle cx={r} cy={r} r={r * 0.67} fill="none"
          stroke={accentHex} strokeWidth="0.8" opacity="0.22"
          filter={`url(#${uid}-glow)`}
        />
      )}
      <path
        d={`M ${r - r * 0.85} ${r} A ${r * 0.85} ${r * 0.85} 0 0 1 ${r} ${r - r * 0.85}`}
        fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="1"
      />
    </svg>
  );
}