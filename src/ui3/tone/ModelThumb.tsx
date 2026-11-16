import type { CSSProperties } from 'react';
import type { ToneRow } from './toneCatalog';
import { TONE_ASSETS } from './toneCatalog';

const AMP_SKIN: Record<string, string> = {
  '/assets/tone/amp-twin.jpg': 'tweed',
  '/assets/tone/amp-jcm.jpg': 'black',
  '/assets/tone/amp-plexi.jpg': 'gold',
  '/assets/tone/amp-rect.jpg': 'modern',
  '/assets/tone/amp-ac30.jpg': 'orange',
};

const PEDAL_COLOR: Record<string, string> = {
  compressor: 'linear-gradient(150deg,#4a2a24,#241310 62%,#0e0807)',
  overdrive: 'linear-gradient(150deg,#2f4a35,#17301e 62%,#071109)',
  chorus: 'linear-gradient(150deg,#1f4448,#112a2c 62%,#071314)',
  delay: 'linear-gradient(150deg,#4a3a1c,#2b2110 62%,#120d05)',
  reverb: 'linear-gradient(150deg,#2f3350,#1b1e30 62%,#0a0b13)',
  dist: 'linear-gradient(150deg,#4a2020,#2a1010 62%,#120707)',
};

function gridStyle(count: number): { cols: number; rows: number } {
  if (count <= 1) return { cols: 1, rows: 1 };
  if (count === 2) return { cols: 2, rows: 1 };
  if (count === 3) return { cols: 3, rows: 1 };
  if (count === 4) return { cols: 2, rows: 2 };
  if (count === 5) return { cols: 3, rows: 2 };
  return { cols: 3, rows: 2 };
}

export default function ModelThumb({ row, size = 'sm' }: { row: ToneRow; size?: 'xs' | 'sm' | 'md' }) {
  if (row.art === 'amp') {
    const is25 = row.photo?.includes('/tone25/');
    const skin = AMP_SKIN[row.photo ?? ''] ?? 'black';
    return (
      <span className={`t3thumb t3thumb-amp is-${size} skin-${skin}${is25 ? ' is-model25' : ''}`} aria-hidden="true">
        <img src={row.photo ?? '/assets/tone/amp-rect.jpg'} alt="" draggable={false} />
        {!is25 && <i className="t3thumb-ampface" />}
        {!is25 && <span className="t3thumb-badge">{row.knobs.length}</span>}
      </span>
    );
  }
  if (row.art === 'cab') {
    const is25 = row.photo?.includes('/tone25/');
    return (
      <span className={`t3thumb t3thumb-cab is-${size}${is25 ? ' is-model25' : ''}`} aria-hidden="true">
        <img src={row.photo ?? TONE_ASSETS.cab} alt="" draggable={false} />
        {!is25 && <span className="t3thumb-badge">IR</span>}
      </span>
    );
  }

  const count = row.knobs.length;
  const layout = count === 5 ? { cols: 6, rows: 2 } : gridStyle(count);
  return (
    <span
      className={`t3thumb t3thumb-pedal is-${size}`}
      style={{ '--t3thumb-body': PEDAL_COLOR[row.family] } as CSSProperties}
      title={`${count} knobs`}
      aria-hidden="true"
    >
      <span className="t3thumb-screw tl" />
      <span className="t3thumb-screw tr" />
      <span className="t3thumb-screw bl" />
      <span className="t3thumb-screw br" />
      <span
        className={`t3thumb-grid${count === 5 ? ' is-five' : ''}`}
        style={{ gridTemplateColumns: `repeat(${layout.cols},1fr)`, gridTemplateRows: `repeat(${layout.rows},1fr)` }}
      >
        {row.knobs.map((k) => <i key={k} className="t3thumb-knob" />)}
      </span>
      <span className="t3thumb-led" />
    </span>
  );
}

export function MicGlyph({ size = 18 }: { size?: number }) {
  return (
    <svg width={size * 0.66} height={size} viewBox="0 0 24 36" aria-hidden="true">
      <rect x="9.4" y="2" width="5.2" height="9" rx="2.4" fill="#b7bdc3" stroke="#1c1f22" strokeWidth=".8" />
      <path d="M10 5.4h4M10 7.4h4" stroke="#1c1f22" strokeWidth=".55" />
      <rect x="10.4" y="11" width="3.2" height="16" fill="#62686d" />
      <rect x="9.4" y="26.6" width="5.2" height="3" rx="1" fill="#e2e7ea" />
      <rect x="8.6" y="30" width="6.8" height="2.4" rx="1" fill="#2b2f33" />
    </svg>
  );
}
