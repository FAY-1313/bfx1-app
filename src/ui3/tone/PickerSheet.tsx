import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Lang } from '../../i18n';
import type { ToneFamily, ToneRow } from './toneCatalog';
import ModelThumb from './ModelThumb';
import {
  groupLabel, modelsCountText, rowCaptureName, rowDesc, rowPrimary, rowSubtitle, t3,
} from './toneI18n';

type Mode = 'all' | 'guitar' | 'bass';

export interface PickerSheetProps {
  open: boolean;
  lang: Lang;
  family: ToneFamily;
  rows: ToneRow[];
  selectedKey?: string;
  title: string;
  onSelect: (row: ToneRow) => void;
  onClose: () => void;
}

export default function PickerSheet({
  open, lang, family, rows, selectedKey, title, onSelect, onClose,
}: PickerSheetProps) {
  const [mode, setMode] = useState<Mode>('all');
  const [group, setGroup] = useState('all');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    setMode('all');
    setGroup('all');
    const sel = rows.find((r) => r.key === selectedKey);
    setExpanded(new Set(sel ? [sel.hardware] : []));
  }, [open, family, selectedKey, rows]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const groups = useMemo(() => {
    const seen: string[] = [];
    for (const r of rows) {
      if (mode !== 'all' && r.mode !== mode) continue;
      if (r.group && !seen.includes(r.group)) seen.push(r.group);
    }
    return seen;
  }, [rows, mode]);

  useEffect(() => {
    if (group !== 'all' && !groups.includes(group)) setGroup('all');
  }, [groups, group]);

  const filtered = useMemo(() => rows.filter((r) => {
    if (mode !== 'all' && r.mode !== mode) return false;
    if (group !== 'all' && r.group !== group) return false;
    return true;
  }), [rows, mode, group]);

  const hardwareGroups = useMemo(() => {
    const map: { hardware: string; rows: ToneRow[] }[] = [];
    for (const r of filtered) {
      const g = map.find((x) => x.hardware === r.hardware);
      if (g) g.rows.push(r);
      else map.push({ hardware: r.hardware, rows: [r] });
    }
    return map;
  }, [filtered]);

  if (!open) return null;

  /* 25+25 与新 OD 每个型号只有一个固定音色，直接用平铺列表；仅保留旧 DIST 二级捕获。 */
  const twoLevel = family === 'dist';

  const toggleGroup = (hardware: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(hardware)) next.delete(hardware);
      else next.add(hardware);
      return next;
    });
  };

  return createPortal(
    <div className="t3sheet-backdrop" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section className="t3sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="t3sheet-grip" aria-hidden="true" />
        <header className="t3sheet-head">
          <div>
            <h2>{title}</h2>
            <p>{modelsCountText(lang, filtered.length, family)}</p>
          </div>
          <button type="button" className="t3sheet-close" onClick={onClose} aria-label={t3(lang, 'close')}>×</button>
        </header>

        <div className="t3sheet-tabs" role="tablist" aria-label={t3(lang, 'guitar') + ' / ' + t3(lang, 'bass')}>
          {(['all', 'guitar', 'bass'] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              className={mode === m ? 'on' : ''}
              onClick={() => setMode(m)}
            >
              {t3(lang, m)}
            </button>
          ))}
        </div>

        {groups.length > 1 && (
          <div className="t3sheet-groups" aria-label={t3(lang, 'groups')}>
            <button
              type="button"
              className={group === 'all' ? 'on' : ''}
              onClick={() => setGroup('all')}
            >
              {t3(lang, 'defaultGroup')}
            </button>
            {groups.map((g) => (
              <button
                key={g}
                type="button"
                className={group === g ? 'on' : ''}
                onClick={() => setGroup(g)}
              >
                {groupLabel(lang, family, g)}
              </button>
            ))}
          </div>
        )}

        <div className="t3sheet-list">
          {filtered.length === 0 && <div className="t3sheet-empty">{t3(lang, 'noResults')}</div>}

          {!twoLevel && filtered.map((row) => (
            <button
              key={row.key}
              type="button"
              className={`t3row${row.key === selectedKey ? ' on' : ''}`}
              onClick={() => onSelect(row)}
            >
              <ModelThumb row={row} size="sm" />
              <span className="t3row-main">
                <b>{rowPrimary(lang, row)}</b>
                {rowSubtitle(lang, row) && <em>{rowSubtitle(lang, row)}</em>}
                {rowDesc(lang, row) && <small className="t3row-desc">{rowDesc(lang, row)}</small>}
              </span>
              <span className="t3row-meta">{row.mode === 'bass' ? t3(lang, 'bass') : t3(lang, 'guitar')}</span>
              <span className="t3row-check" aria-hidden="true">{row.key === selectedKey ? '✓' : ''}</span>
            </button>
          ))}

          {twoLevel && hardwareGroups.map((hg) => {
            const first = hg.rows[0];
            const isOpen = expanded.has(hg.hardware);
            const hasSelected = hg.rows.some((r) => r.key === selectedKey);
            return (
              <div key={hg.hardware} className={`t3group${hasSelected ? ' has-sel' : ''}`}>
                <button
                  type="button"
                  className="t3group-head"
                  aria-expanded={isOpen}
                  onClick={() => toggleGroup(hg.hardware)}
                >
                  <ModelThumb row={first} size="sm" />
                  <span className="t3group-main">
                    <b>{hg.hardware}</b>
                    <em>
                      {hg.rows.length > 1
                        ? modelsCountText(lang, hg.rows.length)
                        : rowSubtitle(lang, first)}
                    </em>
                    {rowDesc(lang, first) && <small className="t3row-desc">{rowDesc(lang, first)}</small>}
                  </span>
                  {hasSelected && <span className="t3group-dot" aria-hidden="true" />}
                  <span className={`t3chev${isOpen ? ' up' : ''}`} aria-hidden="true" />
                </button>
                {isOpen && (
                  <div className="t3group-body">
                    {hg.rows.map((row) => (
                      <button
                        key={row.key}
                        type="button"
                        className={`t3cap${row.key === selectedKey ? ' on' : ''}`}
                        onClick={() => onSelect(row)}
                      >
                        <ModelThumb row={row} size="xs" />
                        <span className="t3cap-main">
                          <b>{rowCaptureName(lang, row)}</b>
                          <em>{row.capture ?? row.title}</em>
                        </span>
                        <span className="t3cap-count">{row.knobs.length || 'IR'}</span>
                        <span className="t3row-check" aria-hidden="true">{row.key === selectedKey ? '✓' : ''}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>,
    document.body,
  );
}
