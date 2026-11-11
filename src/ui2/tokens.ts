/**
 * BFX1 设计令牌（v6 · 2026-10-14）
 *
 * 由 UI 设计系统审查收敛而来：颜色 62 → 18、字号 20 → 6、圆角 15 → 4、间距对齐 4/8 网格。
 * 约定：
 *   · 品牌橙只用于「当前操作焦点」（选中态 / 数值读数），不承担状态语义
 *   · 状态色三支独立：success / warn / error
 *   · 模块色（gate/comp/od/amp/cab/fx）只用于描边、图标与模块名，不做大面积填充
 *   · 所有可点元素热区 ≥ 44×44（视觉可小），并具备 active 压感与 focus-visible 焦点环
 */

/** 品牌主色（唯一焦点色） */
export const BRAND = '#F06F21';
/** 品牌弱底（选中态底色） */
export const BRAND_WEAK = 'rgba(240,111,33,0.10)';
/** 特权金（官方 / 过千热度）——只做特权色，不做动作色 */
export const GOLD = '#DFA43C';

/**
 * ★★ v3.83（P3-6 / 7.3「色板双轨合并」）：
 * 本文件原是一套**理想值**（`#0A0C10` / `#14171D` / `#F2F4F8`），
 * 与全仓实际在用的 `#0B0D11` / `#15181E` / `#F0F2F5` 差了 1–2 个色阶，
 * 结果两套色板并行：改 tokens 不改全局视觉，改全局又不敢信 tokens。
 * **现取值统一为「实际在用值」** —— tokens 从此描述现状，不再是另一份提案。
 * 社区那套 `components/community/parts.tsx` 的 `C` 已改为从本文件派生。
 */
export const SURF = {
  /** 页面底 */
  bg: '#0B0D11',
  /** 面板 / 浮窗 */
  panel: '#15181E',
  /** 面板内二级底（卡片 / 选中行） */
  panel2: '#1B1F26',
  /** 顶栏 / 底栏 */
  bar: '#1F2024',
  /** 输入框 / 选择框 */
  field: '#13161C',
} as const;

/** 描边 2 级 */
export const LINE = {
  base: '#2E3440',
  strong: '#454D5C',
} as const;

/** 文字 4 级（weak 仅用于 ≥11px） */
export const TXT = {
  main: '#F0F2F5',
  sub: '#9BA3B2',
  weak: '#7C8494',
} as const;

/** 状态三支 */
export const STATE = {
  success: '#3DDC84',
  warn: '#F0B429',
  error: '#F2565B',
  errorSoft: '#FFAFB3',
} as const;

/**
 * 字号 7 档 —— ★ v3.83：`micro` 是**全 App 字号下限 10.5**。
 * 审查（7.2）实测原分布里 361/558 处 <11px（6px×5、7.5px×24、8px×64…），
 * 在 375dp 屏上不可读；现已全量抬到 `micro` 以上。
 */
export const TYPE = {
  micro: 10.5,
  label: 11,
  small: 12,
  body: 13,
  title: 15,
  head: 20,
  display: 28,
} as const;

/** 间距（4/8 网格） */
export const SPACE = [4, 8, 12, 16, 24] as const;

/** 圆角 4 档 */
export const RADIUS = { sm: 8, md: 12, lg: 16, pill: 999 } as const;

/** 阴影 2 级 */
export const ELEV = {
  e1: '0 1px 2px rgba(0,0,0,0.06)',
  e2: '0 8px 24px rgba(0,0,0,0.18)',
} as const;

/** 动效时长 + 缓动 */
export const MOTION = {
  micro: 150,
  standard: 250,
  panel: 350,
  spring: 'cubic-bezier(.22,.9,.26,1.06)',
  standardEase: 'cubic-bezier(.2,0,0,1)',
} as const;

/** 旋钮组件专用色（金属渐变 + 刻度）——组件级 token，仅 KnobRing 使用 */
export const KNOB = {
  /** 外圈高光 */
  hi: '#4A5361',
  /** 本体中间调 */
  mid: '#2E3440',
  /** 本体暗部 */
  low: '#22262F',
  /** 握纹 / 圆心 */
  grip: '#0E1014',
  /** 未走过刻度 */
  tickOff: '#454D5C',
  /** 进度弧底 */
  track: '#2E3440',
} as const;
