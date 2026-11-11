/**
 * BFX1 新 UI · 单块外壳
 *
 * 设计要点（2026-10-03 用户要求）：
 *   · ★ 外壳由内容撑开（padding + flex），旋钮绝不溢出
 *   · ★ 主体不放文字（只有 LED + 旋钮 + 踩钉）
 *   · 尺寸/配色按模块定义
 */
import type { ReactNode } from 'react';

export interface PedalTheme {
  c1: string;   // 渐变起
  c2: string;   // 渐变止
  ac: string;   // 强调色（LED / 指针）
}

interface Props {
  theme: PedalTheme;
  on: boolean;
  children: ReactNode;
  onFootswitch?: () => void;
  /** 顶部额外行（如箱头模式分段） */
  top?: ReactNode;
  /** 底部说明 */
  note?: ReactNode;
}

export default function PedalShell({ theme, on, children, onFootswitch, top, note }: Props) {
  return (
    <div style={{
      width: '100%', borderRadius: 15, padding: '11px 11px 9px',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
      background: `linear-gradient(165deg, ${theme.c1}, ${theme.c2})`,
      border: '1.5px solid rgba(0,0,0,0.55)',
      boxShadow: '0 9px 26px rgba(0,0,0,.65), inset 0 1px 0 rgba(255,255,255,.09)',
      boxSizing: 'border-box', flex: '0 0 auto',
    }}>
      {/* LED 行 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
        <div style={{
          width: 9, height: 9, borderRadius: '50%', flex: '0 0 auto',
          background: on ? theme.ac : '#333940',
          boxShadow: on ? `0 0 11px ${theme.ac}` : 'inset 0 1px 2px rgba(0,0,0,.6)',
        }} />
      </div>

      {top}

      {/* 旋钮区 */}
      <div style={{
        width: '100%', display: 'flex', flexDirection: 'column', gap: 9,
      }}>{children}</div>

      {/* 踩钉 */}
      {onFootswitch && (
        <button
          onClick={onFootswitch}
          style={{
            width: 62, height: 48, borderRadius: '50%', flex: '0 0 auto',
            cursor: 'pointer', marginTop: 2, padding: 0,
            background: 'linear-gradient(180deg,#c3ccd6,#747d88 55%,#4f565f)',
            border: '2.5px solid #1a1e24',
            boxShadow: '0 4px 10px rgba(0,0,0,.6), inset 0 2px 3px rgba(255,255,255,.45)',
          }}
        />
      )}

      {note && (
        <div style={{
          width: '100%', fontSize: 11, color: '#8b93a2', lineHeight: 1.5,
          textAlign: 'center', background: 'rgba(10,12,16,.45)',
          borderLeft: '2px solid #5bc8f5', borderRadius: '0 6px 6px 0',
          padding: '5px 8px', boxSizing: 'border-box',
        }}>{note}</div>
      )}
    </div>
  );
}
