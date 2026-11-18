import type { CSSProperties, ReactNode } from 'react';
import type { ToneRow } from './toneCatalog';
import ToneKnob from './ToneKnob';
import {
  knobValueText, rowPrimary, t3,
} from './toneI18n';
import type { Lang } from '../../i18n';

function colsFor(count: number): number {
  if (count >= 5) return 3;
  if (count === 4 || count === 2) return 2;
  return Math.max(1, count);
}

function pedalKnobSize(count: number): number {
  if (count >= 5) return 33;
  if (count === 4) return 36;
  if (count === 3) return 42;
  if (count === 2) return 44;
  return 46;
}

function fxKnobSize(count: number): number {
  if (count >= 5) return 29;
  if (count === 4) return 32;
  if (count === 3) return 28;
  if (count === 2) return 36;
  return 40;
}

function knobColsStyle(count: number): CSSProperties {
  return { '--t3k-cols': colsFor(count) } as CSSProperties;
}

function PowerSwitch({ on, onToggle, label, lang }: {
  on: boolean; onToggle: () => void; label: string; lang: Lang;
}) {
  return (
    <button
      type="button"
      className={`t3sw${on ? ' on' : ''}`}
      onClick={onToggle}
      aria-pressed={on}
      aria-label={`${label} ${t3(lang, on ? 'on' : 'off')}`}
      title={`${label} ${on ? t3(lang, 'on') : t3(lang, 'off')}`}
    >
      <i aria-hidden="true" />
    </button>
  );
}

function knobsOf(
  lang: Lang,
  row: ToneRow,
  values: Record<string, number>,
  onKnobChange: (label: string, v: number) => void,
  onKnobCommit: (label: string, v: number, prev: number) => void,
  size: number,
  accent: string,
) {
  return row.knobs.map((label) => (
    <ToneKnob
      key={label}
      label={label}
      value={values[label] ?? row.defaults[label] ?? 0.5}
      defaultValue={row.defaults[label] ?? 0.5}
      size={size}
      accent={accent}
      showValue={false}
      formatValue={(v) => knobValueText(row, label, v)}
      onChange={(v) => onKnobChange(label, v)}
      onCommit={(v, prev) => onKnobCommit(label, v, prev)}
    />
  ));
}

/* ══════════ QUICK 单旋钮卡 ══════════ */

export interface QuickCardProps {
  lang: Lang;
  title: string;
  staticLabel?: string;
  variant: string;
  accent: string;
  on?: boolean;
  /** v4.29：回传电源按钮的矩形，供浮层贴到按钮上方 */
  onToggle?: (rect?: DOMRect) => void;
  toggleAria?: string;
  knobLabel: string;
  hideKnobLabel?: boolean;
  value: number;
  defaultValue: number;
  formatValue?: (v: number) => string;
  onChange: (v: number) => void;
  onCommit: (v: number, prev: number) => void;
  muted?: boolean;
  onMuteToggle?: () => void;
  extra?: ReactNode;
}

export function QuickCard({
  lang, title, staticLabel, variant, accent, on, onToggle, toggleAria,
  knobLabel, hideKnobLabel, value, defaultValue, formatValue, onChange, onCommit,
  muted, onMuteToggle,
}: QuickCardProps) {
  const muteHead = !!onMuteToggle;
  const head = (
    <>
      {typeof on === 'boolean' && <i className="t3led" aria-hidden="true" />}
      {muteHead ? (
        <button
          type="button"
          className={`t3mute-title${muted ? ' is-muted' : ''}`}
          onClick={onMuteToggle}
          aria-pressed={muted}
          aria-label={`${title} ${t3(lang, muted ? 'unmute' : 'mute')}`}
          title={`${title} · ${t3(lang, muted ? 'unmute' : 'mute')}`}
        >
          <b>{title}</b>
        </button>
      ) : <b>{title}</b>}
      {staticLabel && staticLabel !== title && (
        <span className={`t3static${muteHead && muted ? ' is-muted' : ''}`}>
          {muteHead && muted ? t3(lang, 'mute') : staticLabel}
        </span>
      )}
    </>
  );
  return (
    <section className={`t3card t3quick ${variant}${on ? ' on' : ''}${muteHead && muted ? ' is-muted' : ''}`}>
      {onToggle ? (
        <button
          type="button"
          className="t3card-head t3power-head"
          aria-pressed={on}
          aria-label={toggleAria ?? title}
          onClick={(e) => onToggle(e.currentTarget.getBoundingClientRect())}
        >
          {head}
        </button>
      ) : (
        <div className="t3card-head">{head}</div>
      )}
      <div className="t3quick-knobs">
        <ToneKnob
          label={knobLabel}
          hideLabel={hideKnobLabel}
          value={value}
          defaultValue={defaultValue}
          size={40}
          accent={accent}
          showValue={false}
          formatValue={formatValue}
          onChange={onChange}
          onCommit={onCommit}
        />
      </div>
    </section>
  );
}

/* ══════════ DRIVE 踏板卡 ══════════ */

export interface PedalCardProps {
  lang: Lang;
  family: 'compressor' | 'overdrive';
  title: string;
  variant: string;
  accent: string;
  row: ToneRow;
  values: Record<string, number>;
  on: boolean;
  onToggle: (rect?: DOMRect) => void;
  onOpenPicker: () => void;
  onKnobChange: (label: string, v: number) => void;
  onKnobCommit: (label: string, v: number, prev: number) => void;
}

export function PedalCard({
  lang, title, variant, accent, row, values, on,
  onToggle, onOpenPicker, onKnobChange, onKnobCommit,
}: PedalCardProps) {
  return (
    <section className={`t3card t3pedal ${variant}${on ? ' on' : ''}`}>
      <div className="t3card-head">
        <button
          type="button"
          className="t3power-title"
          onClick={(e) => onToggle(e.currentTarget.getBoundingClientRect())}
          aria-pressed={on}
          aria-label={`${title} ${t3(lang, on ? 'on' : 'off')}`}
        >
          <i className="t3led" aria-hidden="true" />
          <b>{title}</b>
        </button>
        <button
          type="button"
          className="t3sel-pill"
          onClick={onOpenPicker}
          aria-label={`${title} ${rowPrimary(lang, row)}`}
          title={rowPrimary(lang, row)}
        >
          <span>{rowPrimary(lang, row)}</span>
          <i className="t3caret" aria-hidden="true" />
        </button>
      </div>
      <div className="t3knobs" style={knobColsStyle(row.knobs.length)}>
        {knobsOf(lang, row, values, onKnobChange, onKnobCommit, pedalKnobSize(row.knobs.length), accent)}
      </div>
    </section>
  );
}

/* ══════════ FX 踏板卡 ══════════ */

export interface FxCardProps {
  lang: Lang;
  family: 'chorus' | 'delay' | 'reverb';
  title: string;
  variant: string;
  accent: string;
  row: ToneRow;
  values: Record<string, number>;
  on: boolean;
  onToggle: (rect?: DOMRect) => void;
  onOpenPicker?: () => void;
  presetName?: string;
  onOpenPresets?: () => void;
  onKnobChange: (label: string, v: number) => void;
  onKnobCommit: (label: string, v: number, prev: number) => void;
}

export function FxCard({
  lang, title, variant, accent, row, values, on,
  onToggle, onOpenPicker, presetName, onOpenPresets,
  onKnobChange, onKnobCommit,
}: FxCardProps) {
  return (
    <section className={`t3card t3fx ${variant}${on ? ' on' : ''}`}>
      <div className="t3card-head">
        <button
          type="button"
          className="t3power-title"
          onClick={(e) => onToggle(e.currentTarget.getBoundingClientRect())}
          aria-pressed={on}
          aria-label={`${title} ${t3(lang, on ? 'on' : 'off')}`}
        >
          <i className="t3led" aria-hidden="true" />
          <b>{title}</b>
        </button>
        {onOpenPicker && (
          <button
            type="button"
            className="t3sel-pill"
            onClick={onOpenPicker}
            aria-label={`${title} ${row.title}`}
            title={row.title}
          >
            <span>{row.title}</span>
            <i className="t3caret" aria-hidden="true" />
          </button>
        )}
        {presetName && onOpenPresets && (
          <button
            type="button"
            className="t3sel-pill"
            onClick={onOpenPresets}
            aria-label={`${title} preset ${presetName}`}
            title={presetName}
          >
            <span>{presetName}</span>
            <i className="t3caret" aria-hidden="true" />
          </button>
        )}
      </div>
      <div className="t3knobs t3knobs-fx" style={knobColsStyle(row.knobs.length)}>
        {knobsOf(lang, row, values, onKnobChange, onKnobCommit, fxKnobSize(row.knobs.length), accent)}
      </div>
    </section>
  );
}
