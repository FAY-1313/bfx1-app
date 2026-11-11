import { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronDownIcon } from 'lucide-react';
import { useI18n } from '../i18n';

interface SubModelSelectorProps {
  models?: string[];
  /** 缩略图配色: 与 models 一一对应 (来自子型号 color 字段) */
  colors?: string[];
  /** 分组表头: 每组 { label, startIndex, count } 扁平索引到 models */
  groups?: Array<{ label: string; startIndex: number; count: number }>;
  /** 禁用的选项索引 (灰色不可选, 如贝斯过载/失真) */
  disabledIndexes?: number[];
  selectedIndex?: number;
  accentColor?: string;
  onSelect?: (index: number) => void;
  /** 模块关闭时下拉框不可用 */
  disabled?: boolean;
  /** 外部读取中 (如切换型号读取参数), 显示 LOADING 并禁止操作 */
  loading?: boolean;
  /** 开机教程定位标记: 非空时渲染到根元素 data-tour */
  tourId?: string;
}

export default function SubModelSelector({
  models = [], colors = [], groups, disabledIndexes = [], selectedIndex = 0, accentColor = '#F06F21',
  onSelect = () => {}, disabled = false, loading = false, tourId,
}: SubModelSelectorProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  // 选择后模拟读取的 LOADING 态: 读取期间禁止操作
  const [busy, setBusy] = useState(false);
  const busyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const ddRef = useRef<HTMLDivElement>(null);
  const [ddStyle, setDdStyle] = useState<React.CSSProperties>({});

  const computePosition = useCallback(() => {
    if (!barRef.current) return;
    const r = barRef.current.getBoundingClientRect();
    setDdStyle({
      position: 'fixed', top: r.bottom + 4, left: r.left, width: r.width, zIndex: 9999,
      // 上下拉幅度适配页面: 下拉不超出屏幕底部
      maxHeight: Math.max(140, Math.min(420, window.innerHeight - r.bottom - 24)),
      overflowY: 'auto',
      background: '#2a2b30', border: '1px solid #3f4045',
      borderRadius: 12, boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
    });
  }, []);

  useEffect(() => { if (open) computePosition(); }, [open, computePosition]);

  // Close on outside click via overlay; allow scrolling inside dropdown
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (barRef.current && !barRef.current.contains(target) && !ddRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [open]);

  const blockUi = busy || loading;             // 读取期间禁止整页操作
  const blocked = disabled || blockUi;          // 禁止打开下拉

  // 关闭时关闭下拉
  useEffect(() => { if (blocked) setOpen(false); }, [blocked]);

  // 卸载时清理 busy 定时器
  useEffect(() => () => { if (busyTimer.current) clearTimeout(busyTimer.current); }, []);

  const currentModelName = models[selectedIndex] ?? '---';
  const currentColor = colors[selectedIndex] ?? accentColor;

  // Localize section+group headers (数据层为中文, en 模式映射为英文, 不改数据文件)
  const catLabel = (cat: string): string =>
    cat === '过载' ? t('group.overdrive')
      : cat === '失真' ? t('group.dist')
      : cat === '法兹' ? t('group.fuzz')
      : cat;
  const groupLabel = (raw: string): string => {
    const m = raw.match(/^(吉他|贝斯)(?:\s*·\s*(.*))?$/);
    if (m) {
      const sec = m[1] === '吉他' ? t('menu.guitar') : t('menu.bass');
      return m[2] ? `${sec} · ${catLabel(m[2])}` : sec;
    }
    return catLabel(raw);
  };

  const handleToggle = () => {
    if (blocked) return;
    if (!open) computePosition();
    setOpen(!open);
  };

  const handleSelect = (i: number) => {
    if (disabledIndexes.includes(i)) return; // 灰色禁用选项不可选
    setOpen(false);
    if (busyTimer.current) clearTimeout(busyTimer.current);
    setBusy(true); // LOADING: 读取期间禁止操作
    busyTimer.current = setTimeout(() => {
      setBusy(false);
      onSelect(i);
    }, 380);
  };

  const spinner = (
    <div style={{
      width: 13, height: 13, borderRadius: '50%', flexShrink: 0,
      border: '2px solid rgba(255,255,255,0.18)', borderTopColor: accentColor,
      animation: 'bfxspin 0.8s linear infinite',
    }} />
  );

  return (
    <>
      <style>{`@keyframes bfxspin { to { transform: rotate(360deg); } }`}</style>
      <div ref={barRef} data-cmp="SubModelSelector" data-tour={tourId} style={{
        width: '100%', display: 'flex', flexDirection: 'column', borderRadius: 12, overflow: 'visible',
        border: `1px solid ${open ? 'rgba(240,111,33,0.5)' : '#3f4045'}`,
        background: '#232428',
        boxShadow: '0 1px 3px rgba(0,0,0,0.35)',
        opacity: blocked ? 0.6 : 1,
        transition: 'border-color 0.15s ease, opacity 0.2s ease',
      }}>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', height: 38, flexShrink: 0, cursor: blocked ? 'default' : 'pointer', padding: '0 10px', gap: 8 }}
          onClick={handleToggle}>
          {blockUi ? (
            <>
              {spinner}
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: accentColor, fontFamily: '"Barlow-Regular_2", sans-serif' }}>{t('sub.loading')}</span>
            </>
          ) : (
            <>
              {/* 缩略图色块 (切换型号显示对应实物底色) */}
              <div style={{ width: 20, height: 20, borderRadius: 5, flexShrink: 0, background: currentColor, border: '1px solid rgba(255,255,255,0.25)', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.4)' }} />
              <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: '#ececec', fontFamily: '"Barlow-Regular_2", sans-serif', textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {currentModelName}
              </span>
              <ChevronDownIcon size={16} color="#9aa0a6" style={{ flexShrink: 0, transition: 'transform 0.15s', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }} />
            </>
          )}
        </div>
      </div>

      {/* Full-screen overlay to block background scroll + interaction (含 LOADING 读取期间禁止操作) */}
      {(open || blockUi) && <div style={{ position: 'fixed', inset: 0, zIndex: 9998 }} onTouchMove={e => e.preventDefault()} onClick={() => { if (!blockUi) setOpen(false); }} />}

      {/* Fixed-position dropdown portal */}
      {open && !blockUi && (
        <div ref={ddRef} style={ddStyle} onTouchMove={e => e.stopPropagation()}>
          {models.map((name, i) => {
            const grp = groups?.find(g => g.startIndex === i);
            const c = colors[i] ?? accentColor;
            const isDisabled = disabledIndexes.includes(i);
            return (
              <div key={i}>
                {grp && (
                  <div style={{
                    padding: '7px 12px 3px', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
                    color: '#9aa0a6', fontFamily: '"Barlow-Regular_2", sans-serif',
                    borderTop: i > 0 ? '1px solid rgba(255,255,255,0.06)' : 'none',
                    background: 'rgba(255,255,255,0.03)',
                    textTransform: 'uppercase',
                  }}>
                    {groupLabel(grp.label)}
                  </div>
                )}
                <div
                  onClick={(e) => { e.stopPropagation(); handleSelect(i); }}
                  title={isDisabled ? t('sub.disabled') : undefined}
                  style={{ padding: '8px 14px', fontSize: 12, fontWeight: isDisabled ? 400 : (i === selectedIndex ? 700 : 400), color: isDisabled ? '#7a7d84' : (i === selectedIndex ? '#F06F21' : '#d8d8dc'), fontFamily: '"Barlow-Regular_2", sans-serif', letterSpacing: '0.02em', cursor: isDisabled ? 'not-allowed' : 'pointer', background: isDisabled ? 'rgba(255,255,255,0.02)' : (i === selectedIndex ? 'rgba(240,111,33,0.1)' : 'transparent'), borderLeft: i === selectedIndex ? `2px solid ${accentColor}` : '2px solid transparent', transition: 'all 0.1s', display: 'flex', alignItems: 'center', gap: 8, opacity: isDisabled ? 0.45 : 1 }}
                  onMouseEnter={(e) => { if (!isDisabled && i !== selectedIndex) (e.target as HTMLDivElement).style.background = 'rgba(255,255,255,0.05)'; }}
                  onMouseLeave={(e) => { if (!isDisabled && i !== selectedIndex) (e.target as HTMLDivElement).style.background = 'transparent'; }}
                >
                  <div style={{ width: 16, height: 16, borderRadius: 4, flexShrink: 0, background: c, border: '1px solid rgba(255,255,255,0.2)', filter: isDisabled ? 'grayscale(1)' : 'none' }} />
                  <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textDecoration: isDisabled ? 'line-through' : 'none' }}>{name}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
