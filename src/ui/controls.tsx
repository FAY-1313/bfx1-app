// ─── 共享 UI 原语: 统一工作室各面板的控件外观 ─────────────────────
// 目标: 所有带外框的按钮/芯片/下拉/滑块/卡片用同一套 token,
// 激活态用主题色 (accent) 着色. 工作室 6 面板逐步替换内联样式.
// 支持 #rrggbb 与 rgb() 两种颜色写法 (alpha 后缀各自实现).
// 2026-09-02 (A2): 字号 token 化(+1px 可读性), 描边接全局语义色 var(--bfx-border).

import React from 'react';
import { createPortal } from 'react-dom';
import { ChevronDownIcon } from 'lucide-react';
import { theme } from '../theme';

const FONT = '"Barlow-Regular_2",sans-serif';
const BORDER = `1px solid var(--bfx-border, #3a3b40)`;
const BG = 'rgba(255,255,255,0.03)';

/** 给颜色加透明度 (支持 #rrggbb 与 rgb()). */
export function tint(color: string, a: number): string {
  if (color.startsWith('#')) return color + Math.round(a * 255).toString(16).padStart(2, '0');
  if (color.startsWith('rgb(')) return color.replace('rgb(', 'rgba(').replace(')', `,${a})`);
  return color;
}

/** 时间格式 mm:ss. */
export function fmtDur(s: number): string {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

/** 统一带外框面板. */
export function Card({ children, accent, style }: {
  children: React.ReactNode; accent?: string; style?: React.CSSProperties;
}) {
  return (
    <div style={{
      borderRadius: 8,
      border: accent ? `1px solid ${tint(accent, 0.2)}` : BORDER,
      background: accent ? tint(accent, 0.05) : BG,
      ...style,
    }}>{children}</div>
  );
}

/** 带外框文字项/开关 chip. on=true 用主题色激活. */
export function Chip({ label, on, onClick, accent = '#fff', small, disabled }: {
  label: string; on?: boolean; onClick?: () => void;
  accent?: string; small?: boolean; disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: small ? '3px 9px' : '5px 12px',
        borderRadius: 6,
        cursor: disabled ? 'not-allowed' : 'pointer',
        border: on ? `1px solid ${tint(accent, 0.55)}` : BORDER,
        background: on ? tint(accent, 0.14) : 'transparent',
        color: on ? accent : 'rgba(200,200,210,0.55)',
        fontSize: small ? theme.fontSize.sm : theme.fontSize.md,
        fontWeight: 700,
        letterSpacing: '0.1em',
        fontFamily: FONT,
        opacity: disabled ? 0.4 : 1,
        whiteSpace: 'nowrap',
      }}
    >{label}</button>
  );
}

/** 统一描边小图标钮. */
export function IconBtn({ onClick, children, accent, size = 26 }: {
  onClick: () => void; children: React.ReactNode; accent?: string; size?: number;
}) {
  return (
    <button onClick={onClick} style={{
      width: size, height: size, borderRadius: 5, cursor: 'pointer', flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'transparent',
      border: accent ? `1px solid ${tint(accent, 0.4)}` : BORDER,
      color: accent ? tint(accent, 0.8) : 'rgba(255,255,255,0.6)',
    }}>{children}</button>
  );
}

/** 统一 range slider. */
export function Slider({ value, onChange, accent = '#fff', min = 0, max = 1, step = 0.01 }: {
  value: number; onChange: (v: number) => void; accent?: string;
  min?: number; max?: number; step?: number;
}) {
  return (
    <input type="range" min={min} max={max} step={step} value={value}
      onChange={e => onChange(Number(e.target.value))}
      style={{ flex: 1, accentColor: accent, height: 3, minWidth: 0 }} />
  );
}

/** 统一深色下拉框. */
export function Select({ value, onChange, options, accent = 'rgba(255,255,255,0.75)' }: {
  value: string; onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
  accent?: string;
}) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} style={{
      background: '#1e1f23', color: accent,
      border: '1px solid rgba(255,255,255,0.14)', borderRadius: 6,
      padding: '5px 8px', fontSize: theme.fontSize.md, fontWeight: 700, letterSpacing: '0.08em',
      fontFamily: FONT, outline: 'none', maxWidth: '100%',
    }}>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

/** 分段选择器 (ORIGINAL/STEMS, bars/led, GRID...). C22: 支持单选项 disabled. */
export function SegRow({ value, onChange, options, accent = '#fff' }: {
  value: string; onChange: (v: string) => void;
  options: Array<{ value: string; label: string; disabled?: boolean }>;
  accent?: string;
}) {
  return (
    <div style={{
      display: 'flex', gap: 3, background: '#1e1f23', borderRadius: 6, padding: 3,
      border: '1px solid rgba(255,255,255,0.1)',
    }}>
      {options.map(o => {
        const on = o.value === value;
        return (
          <button key={o.value} disabled={o.disabled} title={o.disabled ? o.label : undefined}
            onClick={() => onChange(o.value)} style={{
            height: 26, borderRadius: 5, border: 'none', cursor: o.disabled ? 'not-allowed' : 'pointer',
            padding: '0 12px', opacity: o.disabled ? 0.4 : 1,
            background: on ? tint(accent, 0.16) : 'transparent',
            color: on ? accent : 'rgba(160,160,170,0.5)',
            fontSize: theme.fontSize.md, fontWeight: 700, letterSpacing: '0.1em', fontFamily: FONT,
          }}>{o.label}</button>
        );
      })}
    </div>
  );
}

/** 可拖动 seek 进度条. */
export function ProgressBar({ pos, dur, onSeek, accent = '#fff' }: {
  pos: number; dur: number; onSeek: (s: number) => void; accent?: string;
}) {
  return (
    <input type="range" min={0} max={Math.max(0.01, dur)} step={0.1} value={Math.min(pos, dur)}
      onChange={e => onSeek(Number(e.target.value))}
      style={{ flex: 1, accentColor: accent, height: 4, minWidth: 0 }} />
  );
}

// ─── F 批 (2026-09-03): DropMenu 分组下拉 + TransportDock 底部传输容器 ──

export interface DropOption {
  value: string;
  label: string;
  /** 分组标题 (已翻译); 连续同组只显示一次 */
  group?: string;
  /** 前导色块 */
  dot?: string;
  disabled?: boolean;
  /** 右侧辅助小字 (如空槽「空」) */
  hint?: string;
  /** 副行小字 (两行式: 主行 label + 副行 sub, 如节奏型「英文主行 / 中文副行」); 缺省单行 */
  sub?: string;
}

/**
 * 深色分组下拉 (F 批 #2/#3 共用; 视觉对齐 KitBar/SubModelSelector):
 * - 触发头显示当前项 label + chevron 旋转; fixed 定位弹层 (仿 KitBar computePosition)
 * - 分组标题 + 选中态 accent 左边条/高亮; 遮罩点击 / Esc 关闭
 */
export function DropMenu({ value, onChange, options, accent = 'rgba(255,255,255,0.8)', placeholder = '', disabled }: {
  value: string;
  onChange: (v: string) => void;
  options: DropOption[];
  accent?: string;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const barRef = React.useRef<HTMLDivElement>(null);
  const ddRef = React.useRef<HTMLDivElement>(null);
  // 弹层是否可显示: 打开后先 hidden 占位, 等坐标稳定 (双 rAF 后) 才置可见,
  // 消除“首开错位闪现后跳正”(#1 修 2026-09-03; TunerPanel 首开时宿主刚
  // display:flex, getBoundingClientRect 首帧取到合成过渡中间值 → 错位帧先渲染).
  // 滚动/窗口变化时按当前可见态重定位 (仅状态真值, 无需触发 React 渲染)
  const shownRef = React.useRef(false);
  const [ddStyle, setDdStyle] = React.useState<React.CSSProperties>({});

  const cur = options.find(o => o.value === value);

  const placeMenu = React.useCallback((s: boolean) => {
    if (!barRef.current) return;
    const r = barRef.current.getBoundingClientRect();
    setDdStyle({
      position: 'fixed', top: r.bottom + 4, left: r.left, width: Math.max(180, r.width), zIndex: 9999,
      maxHeight: Math.max(160, Math.min(360, window.innerHeight - r.bottom - 24)),
      overflowY: 'auto',
      background: '#2a2b30', border: '1px solid #3f4045',
      borderRadius: 10, boxShadow: '0 12px 40px rgba(0,0,0,0.6)', padding: 4,
      // 独立合成层 + 隔离, 降低 Android WebView 首开/重绘时的残影与重影
      transform: 'translateZ(0)', backfaceVisibility: 'hidden', willChange: 'transform',
      // 坐标稳定前隐藏, 稳定后才显示 → 无错位帧闪现
      visibility: s ? 'visible' : 'hidden',
    });
  }, []);

  // 滚动/窗口变化时按当前可见态重定位 (稳定 handler, 供 add/remove 配对)
  const onViewportChange = React.useCallback(() => placeMenu(shownRef.current), [placeMenu]);

  React.useEffect(() => {
    if (!open) return;
    shownRef.current = false;
    placeMenu(false);
    // 双 rAF 后坐标稳定 → 一次性置可见 (无错位帧闪现)
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => {
      shownRef.current = true;
      placeMenu(true);
    }));
    const t1 = setTimeout(() => { shownRef.current = true; placeMenu(true); }, 140);
    const t2 = setTimeout(() => placeMenu(true), 420);
    window.addEventListener('resize', onViewportChange);
    window.addEventListener('scroll', onViewportChange, true);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t1); clearTimeout(t2);
      shownRef.current = false;
      window.removeEventListener('resize', onViewportChange);
      window.removeEventListener('scroll', onViewportChange, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const onDocDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (barRef.current && !barRef.current.contains(t) && !ddRef.current?.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDocDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  let lastGroup: string | null = null;

  return (
    <>
      <div ref={barRef} data-cmp="DropMenu" style={{
        position: 'relative', flexShrink: 0, minWidth: 0, opacity: disabled ? 0.45 : 1,
        borderRadius: 7, border: `1px solid ${open ? `${accent}88` : 'rgba(255,255,255,0.16)'}`,
        background: '#1e1f23', transition: 'border-color 0.15s ease', pointerEvents: disabled ? 'none' : 'auto',
      }}>
        <div onClick={() => setOpen(o => !o)} style={{
          display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
          padding: cur?.sub ? '4px 8px 4px 10px' : '0 8px 0 10px', minHeight: cur?.sub ? 38 : 30,
        }}>
          {cur?.dot && <span style={{ width: 10, height: 10, borderRadius: 3, flexShrink: 0, background: cur.dot, border: '1px solid rgba(255,255,255,0.25)' }} />}
          {cur?.sub ? (
            <span style={{ flex: 1, minWidth: 0, textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 1 }}>
              <span style={{
                fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', color: accent,
                fontFamily: FONT, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.1,
              }}>{cur.label}</span>
              <span style={{
                fontSize: 10.5, fontWeight: 500, color: 'rgba(200,200,210,0.55)', fontFamily: FONT,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.1,
              }}>{cur.sub}</span>
            </span>
          ) : (
            <span style={{
              flex: 1, minWidth: 0, textAlign: 'left', fontSize: 11, fontWeight: 700,
              letterSpacing: '0.04em', color: cur ? accent : 'rgba(160,160,170,0.45)',
              fontFamily: FONT, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {cur ? cur.label : placeholder}
            </span>
          )}
          <ChevronDownIcon size={13} color="rgba(255,255,255,0.4)" style={{ flexShrink: 0, transition: 'transform 0.15s', transform: open ? 'rotate(180deg)' : 'none' }} />
        </div>
      </div>

      {/* 全屏遮罩: 拦截背景点击/滚动 —— ★ v3.83（P3-4）portal 到 body，
          不再受任何祖先包含块（will-change / transform / filter）影响 */}
      {open && createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 9998 }} onTouchMove={e => e.preventDefault()} onClick={() => setOpen(false)} />,
        document.body)}

      {open && createPortal(
        <div ref={ddRef} style={ddStyle} onTouchMove={e => e.stopPropagation()}>
          {options.map(o => {
            const showGrp = o.group && o.group !== lastGroup;
            lastGroup = o.group ?? null;
            const on = o.value === value;
            return (
              <div key={o.value}>
                {showGrp && (
                  <div style={{
                    padding: '7px 10px 3px', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.12em',
                    color: '#9aa0a6', fontFamily: FONT, whiteSpace: 'nowrap',
                  }}>{o.group}</div>
                )}
                <button
                  disabled={o.disabled}
                  onClick={(e) => { e.stopPropagation(); if (o.disabled) return; setOpen(false); onChange(o.value); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 7, width: '100%', textAlign: 'left',
                    padding: '8px 10px', borderRadius: 6, border: 'none', cursor: o.disabled ? 'not-allowed' : 'pointer',
                    background: on ? `${accent}16` : 'transparent',
                    borderLeft: on ? `2px solid ${accent}` : '2px solid transparent',
                    color: on ? accent : (o.disabled ? 'rgba(160,160,170,0.35)' : '#d8d8dc'),
                    fontSize: 11, fontWeight: on ? 800 : 500, letterSpacing: '0.03em', fontFamily: FONT,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                  {o.dot && <span style={{ width: 11, height: 11, borderRadius: 3, flexShrink: 0, background: o.dot, border: '1px solid rgba(255,255,255,0.22)' }} />}
                  {o.sub ? (
                    <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                      <span style={{ fontSize: 11, fontWeight: on ? 800 : 600, letterSpacing: '0.03em', color: on ? accent : '#e4e4e8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.15 }}>{o.label}</span>
                      <span style={{ fontSize: 10.5, fontWeight: 400, color: on ? accent : 'rgba(180,180,188,0.6)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.15 }}>{o.sub}</span>
                    </span>
                  ) : (
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.label}</span>
                  )}
                  {o.hint && <span style={{ fontSize: 10.5, color: 'rgba(160,160,170,0.5)', fontFamily: FONT, flexShrink: 0 }}>{o.hint}</span>}
                </button>
              </div>
            );
          })}
        </div>,
        document.body
      )}
    </>
  );
}

/** 底部固定传输 Dock (F 批 #4/#5 共用; 视觉对齐 Stem 浮动传输条). 内容由面板注入行 1/行 2. */
// (Batch G 2026-09-03): dock 行加 minHeight, MASTER 等滑条并入后对齐更稳.
export function TransportDock({ accent, children }: { accent: string; children: React.ReactNode }) {
  return (
    <div style={{
      flexShrink: 0, borderTop: `1px solid ${tint(accent, 0.38)}`,
      background: 'rgba(24,23,29,0.97)', padding: '8px 12px 10px',
      display: 'flex', flexDirection: 'column', gap: 6,
      boxShadow: '0 -6px 18px rgba(0,0,0,0.25)',
      // Batch G: 阻止面板内部滚动穿透导致 dock 内容被顶起
      overscrollBehavior: 'none',
    }}>{children}</div>
  );
}

/** Dock 主传输钮 (#72 语义: 播放态警示红 ■, 停止态 accent ▶). */
export function DockPlayBtn({ playing, onClick, accent, disabled, label }: {
  playing: boolean;
  onClick: () => void;
  accent: string;
  disabled?: boolean;
  label?: string;
}) {
  const active = playing ? 'rgb(255,110,90)' : accent;
  return (
    <button onClick={onClick} disabled={disabled} style={{
      height: 30, borderRadius: 7, cursor: disabled ? 'not-allowed' : 'pointer', flexShrink: 0,
      padding: '0 14px', display: 'flex', alignItems: 'center', gap: 5,
      background: playing ? 'rgba(255,90,70,0.14)' : `${active}14`,
      border: `1px solid ${playing ? 'rgba(255,110,90,0.6)' : `${active}55`}`,
      color: playing ? 'rgb(255,120,100)' : active,
      fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', fontFamily: FONT,
      opacity: disabled ? 0.4 : 1,
      boxShadow: playing ? '0 0 10px rgba(255,90,70,0.25)' : 'none',
    }}>
      <span style={{ fontSize: 11, lineHeight: 1 }}>{playing ? '■' : '▶'}</span>
      {label && <span>{label}</span>}
    </button>
  );
}
