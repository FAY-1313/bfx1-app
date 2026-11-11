/**
 * ══════════════════════════════════════════════════════════════════════════
 * 通用弹窗卡片（2026-11-05 用户拍板「统一整改」）
 *
 * 解决两类现场问题：
 *   ① 卡片 `maxHeight:100%` + `overflow:hidden`，但中间内容区没有滚动 —— 小屏 /
 *      系统字体放大时内容被裁掉，用户看到"显示不全"（我的音色库、预设库都是这个结构）。
 *   ② Android 15+ 强制 edge-to-edge，弹窗贴边时被状态栏/导航栏压住。
 *
 * 约定：
 *   · ModalCard   —— 遮罩 + 卡片（限高、圆角裁切、纵向 flex）
 *   · ModalBody   —— **唯一**可滚动区（flex:1 + minHeight:0 + overflowY:auto）
 *   · ModalFooter —— 固定在卡片底部（flexShrink:0）
 * 任何新弹窗都按这三段拼，不允许再自绘"整块 overflow:hidden"的卡片。
 */
import type { CSSProperties, ReactNode } from 'react';

export interface ModalCardProps {
  children: ReactNode;
  /** 遮罩层 z-index（默认 60） */
  zIndex?: number;
  /** 卡片最大宽度（默认 520） */
  maxWidth?: number;
  background?: string;
  borderColor?: string;
  /** 遮罩额外样式（如自定义底色） */
  overlayStyle?: CSSProperties;
  /** 卡片额外样式 */
  cardStyle?: CSSProperties;
}

export function ModalCard({
  children,
  zIndex = 60,
  maxWidth = 520,
  background = '#0A0C10',
  borderColor = '#2E3440',
  overlayStyle,
  cardStyle,
}: ModalCardProps) {
  return (
    <div
      style={{
        position: 'absolute', inset: 0, zIndex,
        background: 'rgba(8,10,14,0.78)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        /* 安全区：即使 #root 已有 padding，浮层在极端机型上仍可能贴边 */
        paddingTop: 'max(10px, env(safe-area-inset-top))',
        paddingBottom: 'max(10px, env(safe-area-inset-bottom))',
        paddingLeft: 'max(10px, env(safe-area-inset-left))',
        paddingRight: 'max(10px, env(safe-area-inset-right))',
        ...overlayStyle,
      }}
    >
      <div
        style={{
          position: 'relative',
          width: '100%', maxWidth, maxHeight: '100%',
          borderRadius: 16, overflow: 'hidden',
          background, border: `1px solid ${borderColor}`,
          boxShadow: '0 18px 44px rgba(0,0,0,0.62)',
          display: 'flex', flexDirection: 'column',
          ...cardStyle,
        }}
      >
        {children}
      </div>
    </div>
  );
}

/** 卡片内唯一可滚动区：内容超长时在这里滚，绝不裁切 */
export function ModalBody({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      className="no-scrollbar"
      style={{
        flex: 1, minHeight: 0,
        overflowY: 'auto', overflowX: 'hidden',
        WebkitOverflowScrolling: 'touch',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** 卡片底部固定区（按钮永远可见） */
export function ModalFooter({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div style={{ flexShrink: 0, ...style }}>{children}</div>;
}
