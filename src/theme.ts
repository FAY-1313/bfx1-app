/**
 * 全局 UI 设计 Token (task #133 尺寸体系 + 2026-09-02 色彩语义化, UI 优化批次 A1/A3).
 * 风格不变, 统一字号/间距/圆角/控件高度/旋钮/开关/颜色语义.
 * 后续硬编码样式逐步迁移到此 token, 保证各类控件比例一致.
 *
 * 颜色语义约定 (A3):
 *  - primary 品牌橙 #F06F21 = 硬件页/全局激活主色
 *  - 模块强调色 (chart-2..5 / studio 各面板色) 只用于「激活态控件 + 进度/录音等状态」,
 *    面板 chrome/边框/文字一律用中性石墨 (panel/raised/border/text/dim)
 *  - danger 用于删除/清空等破坏性操作; 与 emerald 状态色区分
 */
export const theme = {
  fontSize: {
    xs: 8, sm: 9, md: 10, lg: 11, xl: 12, title: 13, h: 14, display: 16,
    // 可读性基准 (后续批次逐步替换): 面板正文 ≥10, 主按钮 ≥11, 大数值 14–16
  },
  space: { 4: 4, 6: 6, 8: 8, 10: 10, 12: 12, 16: 16, 20: 20 },
  radius: { control: 6, card: 8, panel: 10, modal: 14, pill: 999 },
  h: { mini: 30, primary: 36, header: 44, tab: 54 },
  knob: { sm: 46, md: 56, lg: 72 },
  toggle: { w: 46, h: 24 },
  color: {
    bg: '#1a1b1f',       // 页面底
    panel: '#232428',    // 卡片/面板面
    raised: '#2a2b30',   // 悬浮/输入面
    border: '#3a3b40',   // 描边
    text: '#ececec',     // 主文字
    dim: '#9aa0a6',      // 次要文字
    faint: '#5c6166',    // 弱提示文字
    primary: '#F06F21',  // 品牌橙 — 激活/主操作
    ok: '#3ddc84',       // 成功/已连接
    info: '#4cc9f0',     // 信息/播放
    warn: '#e2c044',     // 警示/收藏
    danger: '#e5484d',   // 危险/删除
  },
} as const;
