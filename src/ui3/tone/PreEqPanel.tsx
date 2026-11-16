/**
 * ★ 2026-11-16（用户拍板）：箱头 / 过载卡片的**背面** —— PRE EQ 隐藏参数。
 *
 * 交互口径（2026-11-16 第二次修版）：
 *   · 过载：4 个旋钮排一行 + 右下角小保存键，**翻面不改变卡片尺寸**，不放任何说明文字
 *   · 箱头：8 个旋钮分两行（N1/N5 不写组标题），左上角只写「隐藏参数」，右下角小保存键
 *   · 标签一律白色、与箱头旋钮同一字号；PEAK 段显示当前频点（如 PEAK 694）
 *   · 「保存」= 生成 `<原名>-1`；再次保存覆盖同一条（不生成 -2）
 */
import type { CSSProperties } from 'react';
import type { ToneRow } from './toneCatalog';
import ToneKnob from './ToneKnob';
import { preEqKnobs, preEqNorm, preEqText, applyPreEqNorm } from '../../data/peqVariants';
import type { Lang } from '../../i18n';

export interface PreEqPanelProps {
  lang: Lang;
  row: ToneRow;
  /** 当前正在编辑的字（addr → uint32） */
  words: Record<number, number>;
  /** 本次保存会写入的名字（原名 + "-1"） */
  saveName: string;
  /** 当前型号本身就是一个 -1（再保存 = 覆盖） */
  isVariant: boolean;
  saving: boolean;
  /** 未连接蓝牙时的提示（仅离线显示） */
  offlineHint?: string;
  onKnobChange: (addr: number, norm: number) => void;
  onKnobCommit: (addr: number, norm: number) => void;
  onSave: () => void;
}

export default function PreEqPanel({
  lang, row, words, saveName, isVariant, saving, offlineHint,
  onKnobChange, onKnobCommit, onSave,
}: PreEqPanelProps) {
  const addrs = row.preEqKind === 'amp'
    ? [59, 60, 61, 62, 74, 75, 76, 77]
    : [44, 45, 46, 47];
  const base = row.preEqBase ?? {};
  const knobs = preEqKnobs(addrs, { ...base, ...words });
  const isAmp = row.family === 'amp-head';
  const accent = isAmp ? '#d7b884' : '#7ee787';

  const cell = (k: (typeof knobs)[number]) => {
    const cur = words[k.addr] ?? base[k.addr] ?? 0;
    const curBase = base[k.addr] ?? 0;
    return (
      <div className="t3pre-cell" key={k.addr}>
        <ToneKnob
          label={k.label}
          value={preEqNorm(k.addr, cur, curBase)}
          defaultValue={0.5}
          size={isAmp ? 26 : 32}
          accent={accent}
          amp={isAmp}
          image={isAmp ? row.knobImage : undefined}
          showValue={false}
          formatValue={(n) => preEqText(applyPreEqNorm(k.addr, cur, curBase, n), k.mode)}
          onChange={(n) => onKnobChange(k.addr, n)}
          onCommit={(n) => onKnobCommit(k.addr, n)}
        />
      </div>
    );
  };

  return (
    <div className="t3pre" data-family={isAmp ? 'amp' : 'od'}>
      {isAmp && (
        <div className="t3pre-head">
          <span>{lang === 'en' ? 'HIDDEN' : '隐藏参数'}</span>
        </div>
      )}

      <div className="t3pre-body">
        {isAmp ? (
          <>
            <div className="t3pre-row" style={{ '--t3pre-cols': 4 } as CSSProperties}>
              {knobs.slice(0, 4).map(cell)}
            </div>
            <div className="t3pre-row" style={{ '--t3pre-cols': 4 } as CSSProperties}>
              {knobs.slice(4).map(cell)}
            </div>
          </>
        ) : (
          <div className="t3pre-row" style={{ '--t3pre-cols': 4 } as CSSProperties}>
            {knobs.map(cell)}
          </div>
        )}
      </div>

      <div className="t3pre-foot">
        {offlineHint && <span className="t3pre-hint">{offlineHint}</span>}
        <button
          type="button"
          className="t3pre-save"
          onClick={onSave}
          disabled={saving}
          aria-label={saveName}
        >
          {saving
            ? (lang === 'en' ? 'SAVING…' : '保存中…')
            : (lang === 'en'
              ? `${isVariant ? 'OVERWRITE' : 'SAVE'} ${saveName}`
              : `${isVariant ? '覆盖' : '保存'} ${saveName}`)}
        </button>
      </div>
    </div>
  );
}
