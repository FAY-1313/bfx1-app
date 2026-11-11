/**
 * deviceGuide — 硬件按键教程的纯数据层（无 UI、无副作用）
 *
 * 坐标来自演示包在原图 1920×1350 上的像素实测，全部用百分比，
 * 因此任意屏宽缩放都不会与实物错位。
 *
 * 设计原则（2026-11-02 用户拍板）：
 *   · 用户想的是「我要下一个音色」，不是「按音色键+右键」——所以对外只暴露**功能**，
 *     每个功能背后是一串**按键动作**，界面负责把动作演出来。
 *   · 功能 = 动作序列 + 状态补丁，自动演示与手动点按共用同一份定义，不会两套逻辑。
 */

export type KeyId = 'left' | 'right' | 'tone' | 'power';
export type Gesture = 'hold' | 'tap' | 'double' | 'long';
export type GuideMode = 'idle' | 'battery' | 'volume' | 'channel';

export interface DemoState {
  mode: GuideMode;
  /** 音色组 / 无线频道，1–4（两者绑定） */
  ch: number;
  /** 音色 A–D，0–3 */
  tone: number;
  mute: boolean;
  /** 音量 1–8（每格两级） */
  vol: number;
  /** 电量格数 1–4 */
  bat: number;
}

export const initialDemoState: DemoState = {
  mode: 'idle', ch: 1, tone: 0, mute: false, vol: 6, bat: 3,
};

/** 按键实测坐标（相对原图百分比） */
export const KEY_POS: Record<KeyId, { x: number; y: number; label: string; sub: string }> = {
  left:  { x: 52.16, y: 26.4, label: '左键',   sub: '上排左' },
  right: { x: 64.19, y: 26.4, label: '右键',   sub: '上排右' },
  tone:  { x: 52.34, y: 74.4, label: '音色键', sub: '下排左' },
  power: { x: 64.38, y: 74.4, label: '开关键', sub: '下排右' },
};

/** LED 坐标：1 2 3 4（状态灯）与 A B C D（音色组灯） */
export const LED_POS = {
  ch: { y: 46.26, x: [47.60, 51.74, 55.96, 60.08] },
  tn: { y: 55.93, x: [47.66, 51.90, 55.96, 60.23] },
};

/** 灯色（RGB 三元组，便于 rgba 拼接） */
export const LED_RGB = {
  WHITE:  '240,242,245',
  GREEN:  '91,200,143',
  YELLOW: '226,192,68',
  BLUE:   '76,201,240',
  RED:    '240,80,80',
};

/** 组色：1 白 / 2 绿 / 3 黄 / 4 蓝 */
export const GROUP_RGB = [LED_RGB.WHITE, LED_RGB.GREEN, LED_RGB.YELLOW, LED_RGB.BLUE];
export const GROUP_NAME = ['白', '绿', '黄', '蓝'];
export const TONE_NAME = ['A', 'B', 'C', 'D'];
export const MODE_NAME: Record<GuideMode, string> = {
  idle: '待机', battery: '电量显示', volume: '音量调节', channel: '频道切换',
};

export interface KeyAct {
  key: KeyId;
  gesture: Gesture;
  /** 该动作完成后叠加的状态变化 */
  patch?: (s: DemoState) => Partial<DemoState>;
}

export interface GuideFeature {
  id: string;
  label: string;
  labelEn: string;
  /** 强调色（与首页模块色板同源） */
  accent: string;
  acts: KeyAct[];
  /** 按键组合的人话描述 */
  combo: string;
  /** 一句话规则 */
  caption: string;
  /** 补充说明（可为空） */
  note?: string;
}

const nextTone = (s: DemoState): Partial<DemoState> => ({ tone: (s.tone + 1) % 4 });
const prevTone = (s: DemoState): Partial<DemoState> => ({ tone: (s.tone + 3) % 4 });
const nextGroup = (s: DemoState): Partial<DemoState> => ({ ch: (s.ch % 4) + 1, tone: 0 });
const prevGroup = (s: DemoState): Partial<DemoState> => ({ ch: ((s.ch + 2) % 4) + 1, tone: 0 });

/**
 * 8 个功能。顺序 = 界面上按钮的排列顺序，也大致是「日常使用频率」。
 * 每个功能的 acts 既用于手动点按，也用于自动演示。
 */
export const GUIDE_FEATURES: GuideFeature[] = [
  {
    id: 'next-tone', label: '下一个音色', labelEn: 'NEXT TONE', accent: '#E2C044',
    acts: [{ key: 'tone', gesture: 'hold' }, { key: 'right', gesture: 'tap', patch: nextTone }],
    combo: '按住音色键 + 右键',
    caption: '组内音色 A → B → C → D 循环，松手立即加载。',
    note: '单独按左/右键不换音色；音色键单击只播报当前档位。',
  },
  {
    id: 'prev-tone', label: '上一个音色', labelEn: 'PREV TONE', accent: '#E2C044',
    acts: [{ key: 'tone', gesture: 'hold' }, { key: 'left', gesture: 'tap', patch: prevTone }],
    combo: '按住音色键 + 左键',
    caption: '组内音色 D → C → B → A 反向循环。',
  },
  {
    id: 'next-group', label: '下一组', labelEn: 'NEXT GROUP', accent: '#8A8F9A',
    acts: [{ key: 'right', gesture: 'double', patch: nextGroup }],
    combo: '双击右键',
    caption: '第 1→2→3→4→1 组循环，频道同步切换并加载该组的 A 音色。',
    note: '换组不会停在上一组选中的音色，一定回到 A。',
  },
  {
    id: 'prev-group', label: '上一组', labelEn: 'PREV GROUP', accent: '#8A8F9A',
    acts: [{ key: 'left', gesture: 'double', patch: prevGroup }],
    combo: '双击左键',
    caption: '反向换组 4→3→2→1，同样加载目标组的 A 音色。',
  },
  {
    id: 'battery', label: '看电量', labelEn: 'BATTERY', accent: '#5BC88F',
    acts: [{ key: 'power', gesture: 'tap', patch: () => ({ mode: 'battery' }) }],
    combo: '单击开关键',
    caption: '四个灯变绿显示电量，每格 25%，5 秒后自动熄灭。',
    note: '电量低于 10% 时四灯一起闪。',
  },
  {
    id: 'mute', label: '输入静音', labelEn: 'INPUT MUTE', accent: '#F05050',
    acts: [{ key: 'right', gesture: 'long', patch: (s) => ({ mute: !s.mute }) }],
    combo: '长按右键',
    caption: '当前频道灯变红 = 输入已静音，再长按一次恢复白色。',
    note: '静音是常驻状态，换组、看电量都不会解除它。',
  },
  {
    id: 'volume', label: '音量调节', labelEn: 'VOLUME', accent: '#4CC9F0',
    acts: [
      { key: 'left', gesture: 'long', patch: () => ({ mode: 'volume' }) },
      { key: 'right', gesture: 'tap', patch: (s) => ({ vol: Math.min(8, s.vol + 1) }) },
      { key: 'right', gesture: 'tap', patch: (s) => ({ vol: Math.min(8, s.vol + 1) }) },
    ],
    combo: '长按左键进入 → 右键加 / 左键减',
    caption: '四灯变蓝，每格两级、四格共八级；全亮最大，一格半亮最小。',
    note: '5 秒无操作自动退出音量模式。',
  },
  {
    id: 'channel', label: '频道切换', labelEn: 'CHANNEL', accent: '#8FA3B8',
    acts: [
      { key: 'power', gesture: 'double', patch: () => ({ mode: 'channel' }) },
      { key: 'right', gesture: 'tap', patch: (s) => ({ ch: (s.ch % 4) + 1, tone: 0 }) },
      { key: 'power', gesture: 'double', patch: () => ({ mode: 'idle' }) },
    ],
    combo: '双击开关键进入 → 左/右键选 → 再双击确认',
    caption: '四灯快速闪烁进入选频道，选定后确认回到待机。',
    note: '频道改变同样加载该频道的 A 音色。',
  },
];

export const FEATURE_MAP: Record<string, GuideFeature> = Object.fromEntries(
  GUIDE_FEATURES.map((f) => [f.id, f]),
);

/** 自动演示：16 步，与原演示包逐步一致。
 *  每步可自带 acts（覆盖 feature 的默认动作）—— 比如音量三步分别是
 *  「进入 / 加一级 / 减一级」，不能整段重播 feature。 */
export interface DemoStep {
  no: string;
  feat: string;
  caption: string;
  acts?: KeyAct[];
}

export const DEMO_STEPS: DemoStep[] = [
  { no: '①', feat: 'next-tone',  caption: '按住音色键 + 右键 · 加载音色 B' },
  { no: '②', feat: 'prev-tone',  caption: '按住音色键 + 左键 · 切回音色 A' },
  { no: '③', feat: 'next-group', caption: '双击右键 · 第 1 组 → 第 2 组（绿灯）' },
  { no: '④', feat: 'next-group', caption: '双击右键 · 第 2 组 → 第 3 组（黄灯）' },
  { no: '⑤', feat: 'next-group', caption: '双击右键 · 第 3 组 → 第 4 组（蓝灯）' },
  { no: '⑥', feat: 'next-group', caption: '双击右键 · 第 4 组 → 循环回第 1 组（白灯）' },
  { no: '⑦', feat: 'prev-group', caption: '双击左键 · 反向换组，回到第 4 组' },
  { no: '⑧', feat: 'battery',    caption: '单击开关键 · 显示电量，5 秒后自动熄灭' },
  { no: '⑨', feat: 'channel',    caption: '双击开关键 · 进入频道切换（四灯快速闪烁）',
    acts: [{ key: 'power', gesture: 'double', patch: () => ({ mode: 'channel' as GuideMode }) }] },
  { no: '⑩', feat: 'channel',    caption: '右键 · 选下一个频道',
    acts: [{ key: 'right', gesture: 'tap', patch: (s) => ({ ch: (s.ch % 4) + 1, tone: 0 }) }] },
  { no: '⑪', feat: 'channel',    caption: '双击开关键 · 确认频道，回到待机',
    acts: [{ key: 'power', gesture: 'double', patch: () => ({ mode: 'idle' as GuideMode }) }] },
  { no: '⑫', feat: 'mute',       caption: '长按右键 · 开启输入静音（频道灯变红）' },
  { no: '⑬', feat: 'mute',       caption: '再长按右键 · 解除静音（恢复白色）' },
  { no: '⑭', feat: 'volume',     caption: '长按左键 · 进入音量调节（四灯蓝色）',
    acts: [{ key: 'left', gesture: 'long', patch: () => ({ mode: 'volume' as GuideMode }) }] },
  { no: '⑮', feat: 'volume',     caption: '右键 · 音量加一级',
    acts: [{ key: 'right', gesture: 'tap', patch: (s) => ({ vol: Math.min(8, s.vol + 1) }) }] },
  { no: '⑯', feat: 'volume',     caption: '左键 · 音量减一级',
    acts: [{ key: 'left', gesture: 'tap', patch: (s) => ({ vol: Math.max(1, s.vol - 1) }) }] },
];

/** 对外可用的倍速档 */
export const DEMO_SPEEDS = [0.5, 0.75, 1, 1.5, 2] as const;
