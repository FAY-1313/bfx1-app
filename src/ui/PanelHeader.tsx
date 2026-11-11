import type { ReactNode } from 'react';
import { theme } from '../theme';

/**
 * B2 统一 overlay 面板顶栏。
 * 语义 (theme.ts A3): 面板 chrome 一律中性 — 标题白字 + 4px 模块色条;
 * 高度 44 (theme.h.header), 关闭钮统一 30×30 圆角, 间距/描边走 token.
 * 站点: Index.tsx (Presets/Nam/Manuals/User/Auth) + Studio/Bluetooth/ToneLibrary/Favorites/ToneCommunity.
 */
export function PanelHeader({
  title,
  accent,
  left,
  right,
  onClose,
}: {
  /** 主标题(可为富节点, 如内联 badge); 不传/空则不渲染标题区 */
  title?: ReactNode;
  /** 模块强调色 — 仅渲染为标题左侧 4×16 圆角色条, 不给标题本身染色 */
  accent?: string;
  /** 标题组前方插槽: BACK 按钮 / 蓝牙连接状态点等 */
  left?: ReactNode;
  /** 右侧插槽(关闭钮之前): 账户/登录区等 */
  right?: ReactNode;
  /** 渲染右侧 × 关闭钮 */
  onClose?: () => void;
}) {
  const hasTitle = title !== undefined && title !== null && title !== '';
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: theme.space[8],
      height: theme.h.header, padding: `0 ${theme.space[12]}px`,
      borderBottom: `1px solid ${theme.color.border}`,
      background: theme.color.panel, flexShrink: 0,
    }}>
      {left}
      {accent && hasTitle && (
        <span style={{ width: 4, height: 16, borderRadius: 2, background: accent, flexShrink: 0 }} />
      )}
      {hasTitle && (
        <span style={{
          fontSize: theme.fontSize.title, fontWeight: 700,
          color: theme.color.text, letterSpacing: '0.02em',
          fontFamily: '"Barlow-Regular_2",sans-serif',
          display: 'flex', alignItems: 'center', gap: theme.space[6],
          whiteSpace: 'nowrap', minWidth: 0,
        }}>{title}</span>
      )}
      <div style={{ flex: 1 }} />
      {right}
      {onClose && (
        <button onClick={onClose} aria-label="close" style={{
          width: 30, height: 30, borderRadius: theme.radius.control,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(236,236,236,0.25)',
          color: 'rgba(236,236,236,0.8)', fontSize: 20, lineHeight: 1,
          cursor: 'pointer', padding: 0,
        }}>×</button>
      )}
    </div>
  );
}
