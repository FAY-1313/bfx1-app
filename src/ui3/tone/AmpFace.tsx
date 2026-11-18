import type { ToneRow } from './toneCatalog';
import ToneKnob from './ToneKnob';
import { knobValueText, rowPrimary, t3 } from './toneI18n';
import type { Lang } from '../../i18n';

export interface AmpFaceProps {
  lang: Lang;
  row: ToneRow;
  values: Record<string, number>;
  on: boolean;
  /** v4.29：回传按钮矩形，供浮层贴着按钮弹出 */
  onToggle: (rect?: DOMRect) => void;
  onOpenPicker: () => void;
  onKnobChange: (label: string, v: number) => void;
  onKnobCommit: (label: string, v: number, prev: number) => void;
  onExtended?: () => void;
  linked: boolean;
  onToggleLink: () => void;
}

/**
 * 25 型号箱头 · Layout A（无底部控制条）
 * 图片面板上的 7 个旋钮就是功能旋钮；位置/尺寸全部按图片比例。
 */
export default function AmpFace({
  lang, row, values, on, onToggle, onOpenPicker,
  onKnobChange, onKnobCommit, linked, onToggleLink,
}: AmpFaceProps) {
  const primary = rowPrimary(lang, row);

  return (
    <section className={`t3amp25${on ? ' on' : ''}`}>
      <div className="t3amp25-pic">
        <img src={row.photo ?? '/assets/tone25/amps/amp-01-us-tight.webp'} alt={primary} draggable={false} />
        <button
          type="button"
          className="t3amp25-open"
          onClick={onOpenPicker}
          aria-label={`${primary} · ${t3(lang, 'selectAmp')}`}
        />
        <button
          type="button"
          className={`t3amp25-link${linked ? ' on' : ''}`}
          onClick={onToggleLink}
          aria-pressed={linked}
          aria-label={linked ? '取消箱头箱体关联' : '关联箱头箱体'}
          title={linked ? '箱头/箱体已关联 · 点击取消' : '箱头/箱体未关联 · 点击关联'}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1" />
            <path d="M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1" />
          </svg>
        </button>
      </div>

      <div className="t3amp25-bar">
        <div className="t3amp25-knobs">
          {Array.from({ length: 7 }, (_, i) => {
            const label = row.knobs[i];
            return label ? (
              <ToneKnob
                key={label}
                label={label}
                value={values[label] ?? row.defaults[label] ?? 0.5}
                defaultValue={row.defaults[label] ?? 0.5}
                size={28}
                accent="#d7b884"
                amp
                image={row.knobImage}
                showValue={false}
                formatValue={(v) => knobValueText(row, label, v)}
                onChange={(v) => onKnobChange(label, v)}
                onCommit={(v, prev) => onKnobCommit(label, v, prev)}
              />
            ) : (
              <div key={`blank-${i}`} className="t3amp25-blank" aria-hidden="true" />
            );
          })}
        </div>
        <button
          type="button"
          className="t3amp25-power"
          onClick={(e) => onToggle(e.currentTarget.getBoundingClientRect())}
          aria-pressed={on}
          aria-label={t3(lang, 'ampPower')}
        >
          <i aria-hidden="true"><b /></i>
          <span>{on ? 'ON' : 'OFF'}</span>
        </button>
      </div>
    </section>
  );
}