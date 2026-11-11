/**
 * 空态统一组件（G5 · 2026-10-17）
 *
 * 审查发现问题：空态有三套互不相同的写法 ——
 *   · 本地库：两行纯灰字（无图标、无行动指引）
 *   · 蓝牙：一行 11px 灰字（已改为图标 + 主/次文案）
 *   · 箱体二级：有图标
 * 现统一为一个组件：图标 + 主文案 + 次文案 +（可选）行动按钮，
 * 各面板按同一节奏摆放，用户在任何空列表中看到的是同一种语言。
 */
import type { ReactNode } from 'react';

export interface EmptyStateProps {
  /** 线性图标（lucide 组件实例） */
  icon?: ReactNode;
  /** 主文案（一句话说清"这里为什么是空的"） */
  title: string;
  /** 次文案（下一步该做什么） */
  hint?: string;
  /** 可选行动按钮文案 */
  actionLabel?: string;
  onAction?: () => void;
  /** 紧凑模式（面板内嵌的小空态用） */
  compact?: boolean;
}

export default function EmptyState({
  icon, title, hint, actionLabel, onAction, compact = false,
}: EmptyStateProps) {
  return (
    <div style={{
      textAlign: 'center',
      padding: compact ? '24px 16px' : '44px 24px',
      fontFamily: '"Barlow-Regular_2",sans-serif',
    }}>
      {icon && (
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12, opacity: 0.55 }}>
          {icon}
        </div>
      )}
      <div style={{ fontSize: 13, fontWeight: 700, color: '#c2c9d6', letterSpacing: '0.04em' }}>
        {title}
      </div>
      {hint && (
        <div style={{
          marginTop: 8, fontSize: 11, color: '#7C8494', lineHeight: 1.7,
          maxWidth: 260, marginLeft: 'auto', marginRight: 'auto',
        }}>
          {hint}
        </div>
      )}
      {actionLabel && onAction && (
        <button className="bfx-tap" onClick={onAction} style={{
          marginTop: 16, height: 40, padding: '0 18px', borderRadius: 999,
          background: 'rgba(240,180,41,0.14)', border: '1px solid #f0b429',
          color: '#f0b429', fontSize: 12, fontWeight: 800, letterSpacing: '0.08em',
          cursor: 'pointer', fontFamily: '"Barlow-Regular_2",sans-serif',
        }}>{actionLabel}</button>
      )}
    </div>
  );
}
