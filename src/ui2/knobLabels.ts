/**
 * BFX1 新 UI · 旋钮短标签表（v6.2 · 2026-10-14）
 *
 * 背景：v6.1 之前短标签直接用 `name.slice(0, 4)`，产生 THRE / ATTA / RELE / DEPT 这类
 * 截断缩写 —— 用户看不懂（"有的缩写无法理解"）。这里改为**中文 2 字**短标签：
 *   · 2 个中文 ≈ 20px，正好塞进多旋钮卡的最小列宽（20px），不会再撑宽卡片
 *   · 拖动时卡片第二行会显示「短标签 + 数值 + 单位」，浮窗内也保留英文全称对照
 *
 * 无依赖模块 —— 可被 ampKnobMap / moduleKnobs 共同引用，避免循环依赖。
 */

/**
 * ★ 2026-10-17（用户要求「压缩器所有文字都要双语」）：
 *   英文短标签表 —— 与中文表一一对应，统一 ≤5 字符（窄卡片放得下）。
 *   没有对应项时回退到「取首词前 4 字符」，不会显示空标签。
 */
export const KNOB_LABEL_EN: Record<string, string> = {
  /* 动态类 */
  THRESHOLD: 'THR', ATTACK: 'ATK', RELEASE: 'REL', RATIO: 'RAT', KNEE: 'KNEE',
  GAIN: 'GAIN', DRIVE: 'DRV', SUSTAIN: 'SUS', OUTPUT: 'OUT', BOOST: 'BST',
  /* 音色类 */
  TONE: 'TONE', BASS: 'BASS', MIDDLE: 'MID', MID: 'MID', TREBLE: 'TRB',
  'TREBLE/CUT': 'TRB', CUT: 'CUT', PRESENCE: 'PRES', RESONANCE: 'RES',
  BRILLIANCE: 'BRIL', BRIGHT: 'BRT',
  /* ★ 2026-10-20：v19 新箱头的第 4 旋钮（SVT 的 ULTRA HI / Lab L4 的 DEEP） */
  'ULTRA HI': 'UHI', DEEP: 'DEEP',
  /* 音量类 */
  /* ★ v3.85（用户要求）：箱头 / 总音量的英文一律用缩写 **MAS**（原 MST / MASTER 混用） */
  LEVEL: 'LVL', DISTORTION: 'DIST', VOLUME: 'VOL', VOL1: 'VOL1', VOL2: 'VOL2', MASTER: 'MAS',
  POSTGAIN: 'POST', RHYTHM: 'RHY', LEAD: 'LEAD',
  /* FX 类 */
  TIME: 'TIME', REPEAT: 'RPT', 'PRE-DLY': 'PRE', HPF: 'HPF', LPF: 'LPF', MIX: 'MIX',
  'RATE 1': 'RATE1', 'RATE 2': 'RATE2', 'DEPTH 1': 'DPTH1', 'DEPTH 2': 'DPTH2',
  RATE: 'RATE', DEPTH: 'DPTH', FEEDBACK: 'FB',
  /* PEQ / 滤波 */
  FREQ: 'FREQ', Q: 'Q', FILTER: 'FLT',
};

/** 参数名 → 中文短标签（统一大写键） */
export const KNOB_LABEL: Record<string, string> = {
  /* 动态类 */
  THRESHOLD: '门限', ATTACK: '起音', RELEASE: '释放', RATIO: '比率', KNEE: '拐点',
  GAIN: '增益', DRIVE: '驱动', SUSTAIN: '延音', OUTPUT: '输出', BOOST: '激励',
  /* 音色类 */
  TONE: '音色', BASS: '低频', MIDDLE: '中频', MID: '中频', TREBLE: '高频',
  'TREBLE/CUT': '高频', CUT: '削减', PRESENCE: '临场', RESONANCE: '谐振',
  BRILLIANCE: '亮度', BRIGHT: '明亮',
  /* ★ 2026-10-20：v19 新箱头的第 4 旋钮 */
  'ULTRA HI': '超高频', DEEP: '深潜',
  /* 音量类 */
  LEVEL: '电平', DISTORTION: '失真', VOLUME: '音量', VOL1: '音量1', VOL2: '音量2', MASTER: '总音量',
  POSTGAIN: '后级', RHYTHM: '节奏', LEAD: '主音',
  /* FX 类 */
  TIME: '时间', REPEAT: '反馈', 'PRE-DLY': '预延', HPF: '低切', LPF: '高切', MIX: '混合',
  'RATE 1': '速率1', 'RATE 2': '速率2', 'DEPTH 1': '深度1', 'DEPTH 2': '深度2',
  RATE: '速率', DEPTH: '深度', FEEDBACK: '反馈',
  /* PEQ / 滤波（箱体三轴） */
  FREQ: '频率', Q: 'Q值', FILTER: '滤波',
};

/**
 * 名称 → 短标签
 * 优先整名查表 → 再按首个词查表 → 兜底取首词前 4 字符
 */
export function shortLabel(name: string, lang: 'zh' | 'en' = 'zh'): string {
  const k = (name ?? '').trim().toUpperCase();
  if (!k) return '';
  const table = lang === 'en' ? KNOB_LABEL_EN : KNOB_LABEL;
  if (table[k]) return table[k];
  const first = k.split(/[\s/]+/)[0];
  if (table[first]) return table[first];
  return first.slice(0, lang === 'en' ? 5 : 4);
}
