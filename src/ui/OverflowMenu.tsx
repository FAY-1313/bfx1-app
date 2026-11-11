/**
 * OverflowMenu — 卡片/行上的「⋯」溢出菜单 (E1/E2 统一收口次要操作).
 *
 * - 自管 open/close; 点击外部或 Esc 关闭;
 * - danger 项二次确认: 首次点变「⚠ 确认删除?」样式, 3s 内再点才执行 (防误删, 与全局危险操作一致);
 * - 菜单右对齐锚点下方弹出, 供列表/网格卡片使用; 所有点击 stopPropagation 避免穿透到卡片主操作.
 */
import React, { useState, useEffect, useRef } from 'react';

export interface OverflowAction {
  key: string;
  /** 已翻译的显示文案 */
  label: string;
  color?: string;
  /** 危险操作 → 二次确认 */
  danger?: boolean;
  /** 二次确认文案 (缺省用 label) */
  confirmLabel?: string;
  onClick: () => void;
}

export default function OverflowMenu({
  actions,
  /** 弹出方向: down=锚点下方 (默认) / up=锚点上方 (Batch G #7: 底部 dock 无下方空间) */
  direction = 'down',
}: {
  actions: OverflowAction[];
  direction?: 'down' | 'up';
}) {
  const [open, setOpen] = useState(false);
  const [armedKey, setArmedKey] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const armedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDocDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDocDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const clearArmed = () => {
    if (armedTimer.current) clearTimeout(armedTimer.current);
    armedTimer.current = null;
    setArmedKey(null);
  };

  const handleAction = (a: OverflowAction) => {
    if (a.danger) {
      if (armedKey !== a.key) {
        setArmedKey(a.key);
        if (armedTimer.current) clearTimeout(armedTimer.current);
        armedTimer.current = setTimeout(() => setArmedKey(null), 3000);
        return; // 保持菜单打开, 等待二次点击确认
      }
      clearArmed();
    }
    setOpen(false);
    a.onClick();
  };

  return (
    <div ref={rootRef} style={{ position: 'relative', flexShrink: 0, zIndex: 30 }}>
      <button
        aria-label="more-actions"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        style={{
          width: 26, height: 26, borderRadius: 7, padding: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: open ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.04)',
          border: open ? '1px solid rgba(255,255,255,0.3)' : '1px solid rgba(255,255,255,0.14)',
          color: 'rgba(255,255,255,0.8)', fontSize: 13, lineHeight: 1,
          cursor: 'pointer', fontFamily: '"Barlow-Regular_2",sans-serif',
        }}
      >⋯</button>
      {open && (
        <div style={{
          position: 'absolute', right: 0, zIndex: 90,
          ...(direction === 'up' ? { bottom: 30 } : { top: 30 }),
          minWidth: 138, maxWidth: 200,
          background: '#26272c', border: '1px solid #41424a', borderRadius: 10, padding: 4,
          boxShadow: '0 12px 32px rgba(0,0,0,0.55)',
        }}>
          {actions.map((a) => {
            const armed = armedKey === a.key && a.danger;
            return (
              <button
                key={a.key}
                onClick={(e) => { e.stopPropagation(); handleAction(a); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, width: '100%',
                  textAlign: 'left', padding: '8px 10px', borderRadius: 7, border: 'none',
                  cursor: 'pointer', whiteSpace: 'nowrap',
                  background: armed ? 'rgba(255,80,80,0.18)' : 'transparent',
                  color: a.danger && !armed
                    ? (a.color ?? 'rgb(255,112,112)')
                    : armed ? '#ffc0c0' : (a.color ?? 'rgba(255,255,255,0.84)'),
                  fontSize: 11, fontWeight: 700, letterSpacing: '0.04em',
                  fontFamily: '"Barlow-Regular_2",sans-serif',
                }}
              >
                {armed ? `⚠ ${a.confirmLabel ?? a.label}` : a.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
