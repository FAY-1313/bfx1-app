import { createPortal } from 'react-dom';
import type { FxPreset } from '../../data/_def/fxPresets';
import { t3 } from './toneI18n';
import type { Lang } from '../../i18n';

export interface FxPresetSheetProps {
  open: boolean;
  lang: Lang;
  title: string;
  presets: FxPreset[];
  selected: number;
  onSelect: (index: number) => void;
  onClose: () => void;
}

/** 时间类效果器的预设弹层：与型号弹层同一套底部 sheet，不显示搜索框。 */
export default function FxPresetSheet({
  open, lang, title, presets, selected, onSelect, onClose,
}: FxPresetSheetProps) {
  if (!open) return null;
  return createPortal(
    <div className="t3sheet-backdrop" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section className="t3sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="t3sheet-grip" aria-hidden="true" />
        <header className="t3sheet-head">
          <div>
            <h2>{title}</h2>
            <p>{presets.length} PRESETS</p>
          </div>
          <button type="button" className="t3sheet-close" onClick={onClose} aria-label={t3(lang, 'close')}>×</button>
        </header>
        <div className="t3sheet-list">
          {presets.map((preset, i) => (
            <button
              key={preset.key}
              type="button"
              className={`t3row${i === selected ? ' on' : ''}`}
              onClick={() => onSelect(i)}
            >
              <span className="t3row-main">
                <b>{preset.name}</b>
                <em>{preset.desc}</em>
              </span>
              <span className="t3row-check" aria-hidden="true">{i === selected ? '✓' : ''}</span>
            </button>
          ))}
        </div>
      </section>
    </div>,
    document.body,
  );
}
