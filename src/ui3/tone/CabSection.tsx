import type { ToneRow } from './toneCatalog';
import ModelThumb from './ModelThumb';
import { rowPrimary, t3 } from './toneI18n';
import type { Lang } from '../../i18n';

export interface CabSectionProps {
  lang: Lang;
  row: ToneRow;
  on: boolean;
  expanded: boolean;
  index: number;
  count: number;
  hasPrev: boolean;
  hasNext: boolean;
  /** v4.29：回传按钮矩形，供浮层贴着按钮弹出 */
  onTogglePower: (rect?: DOMRect) => void;
  onToggleExpanded: () => void;
  onOpenPicker: () => void;
  onPrev: () => void;
  onNext: () => void;
}

export default function CabSection({
  lang, row, on, expanded, index, count, hasPrev, hasNext,
  onTogglePower, onToggleExpanded, onOpenPicker, onPrev, onNext,
}: CabSectionProps) {
  const primary = rowPrimary(lang, row);
  return (
    <section className={`t3cab${on ? ' on' : ''}${expanded ? ' expanded' : ''}`}>
      <div className="t3cab-head">
        <button type="button" className="t3cab-pick" onClick={onOpenPicker} aria-label={`${t3(lang, 'cabinet')} ${primary}`}>
          <ModelThumb row={row} size="sm" />
          <span className="t3cab-info">
            <b>{t3(lang, 'cabinet')}</b>
            <em>{primary}</em>
          </span>
        </button>
        <button
          type="button"
          className={`t3cab-led${on ? ' on' : ''}`}
          onClick={(e) => onTogglePower(e.currentTarget.getBoundingClientRect())}
          aria-pressed={on}
          aria-label={t3(lang, 'cabPower')}
        >
          <i aria-hidden="true" />
          <span>{on ? 'ON' : 'OFF'}</span>
        </button>
        <button
          type="button"
          className="t3cab-fold"
          onClick={onToggleExpanded}
          aria-expanded={expanded}
          aria-label={t3(lang, expanded ? 'closeCab' : 'openCab')}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9.5l6 6 6-6" /></svg>
        </button>
      </div>
      {expanded && (
        <div className="t3cab-stage">
          <img className="t3cab-photo" src={row.photo ?? '/assets/tone25/cabs/cab-01-us-combo.webp'} alt={primary} draggable={false} />
          <div className="t3cab-nav">
            <button type="button" onClick={onPrev} disabled={!hasPrev} aria-label={t3(lang, 'previous')}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 5.5L8 12l6.5 6.5" /></svg>
            </button>
            <span>{index + 1} / {count}</span>
            <button type="button" onClick={onNext} disabled={!hasNext} aria-label={t3(lang, 'next')}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 5.5L16 12l-6.5 6.5" /></svg>
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
