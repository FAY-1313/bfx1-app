/**
 * 音色风格枚举（v3.66，2026-10-24 用户拍板 F「先用这 8 个」）。
 *
 * ★ 口径：
 *  - 风格是**封闭枚举**，发布时单选；标签是**用户自写**（≤5 个），两者分开存。
 *  - 加风格只能在这里追加，并在文档同步给固件/运营，不允许 App 单方面新增（避免社区出现
 *    只有一端认识的分类）。
 *  - 空串 = 未标注，列表里归到「全部」。
 */

export const TONE_STYLES = [
  '清音',
  '布鲁斯',
  '摇滚',
  '金属',
  '失真',
  '原声',
  '贝斯',
  '氛围',
] as const;

export type ToneStyle = typeof TONE_STYLES[number];

/** 英文展示（UI 英文模式下显示，云端仍存中文，保证跨端一致） */
export const TONE_STYLE_EN: Record<string, string> = {
  清音: 'CLEAN',
  布鲁斯: 'BLUES',
  摇滚: 'ROCK',
  金属: 'METAL',
  失真: 'DIST',
  原声: 'ACOUSTIC',
  贝斯: 'BASS',
  氛围: 'AMBIENT',
};

/** 后端可能收到任意字符串（旧数据 / 手工写入）→ 归一为枚举内值或空串 */
export function normalizeStyle(s?: string): string {
  if (!s) return '';
  const hit = TONE_STYLES.find((x) => x === s);
  return hit || '';
}

/** 标签上限（用户拍板：≤5 个，单个 ≤10 字） */
export const MAX_TAGS = 5;
export const MAX_TAG_LEN = 10;

/**
 * 旧数据/内置官方音色没有 style 字段 → 按标签猜一个，避免风格筛选把它们全部漏掉。
 * 只做只读展示用途，不回写云端。
 */
export function guessStyle(tags: string[] | undefined, category?: string): string {
  const list = (tags || []).join(' ');
  if (category === 'bass') return '贝斯';
  if (/清音|clean|甜清/i.test(list)) return '清音';
  if (/布鲁斯|blues/i.test(list)) return '布鲁斯';
  if (/金属|metal|高增益|5150|recto/i.test(list)) return '金属';
  if (/失真|dist|法兹|fuzz|过载|overdrive|drive/i.test(list)) return '失真';
  if (/原声|acoustic/i.test(list)) return '原声';
  if (/氛围|ambient|pad|空间/i.test(list)) return '氛围';
  if (/摇滚|rock|plex|marshall/i.test(list)) return '摇滚';
  return '';
}
