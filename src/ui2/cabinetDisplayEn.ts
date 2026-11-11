/**
 * 箱体 / 麦克风 / 位置 的英文显示名（★ 2026-10-17 用户要求）
 *
 * 背景：`data/_def/cabinetDef.ts` 是**自动生成的**，里面的型号名混着中文
 * （`Fender Deluxe 1x12 开背`、`V4 单只`、`IR 拟合`、`位置 A`、`设计版`…）。
 * 用户要求「所有子型号 / 预设 / 型号名称不要出现中文，全用英文」，以免歧义。
 *
 * 做法：**不改生成文件**（下次重新生成会被覆盖），只在这里做「中文 → 英文」显示映射。
 * 查不到的条目原样返回 —— 保证不会出现空字符串。
 */

const CAB_EN: Record<string, string> = {
  'Fender Deluxe 1x12 开背': 'Fender Deluxe 1x12 Open Back',
  'Marshall 1960 4x12 英式': 'Marshall 1960 4x12 British',
  'Mesa Rectifier 4x12': 'Mesa Rectifier 4x12',
  'V30 单只': 'V30 Single',
  '贝斯混合集': 'Bass Mixed Set',
};

const MIC_EN: Record<string, string> = {
  'IR 拟合': 'IR Match',
  '未标注': 'Unlabeled',
};

const POS_EN: Record<string, string> = {
  '默认': 'Default',
  '设计版': 'Design',
  '位置 A': 'Pos A',
  '位置 B': 'Pos B',
  '位置 C': 'Pos C',
  '位置 D': 'Pos D',
  '位置 E': 'Pos E',
  '位1': 'Pos 1',
  '位2': 'Pos 2',
  '位3': 'Pos 3',
  '位4': 'Pos 4',
  '位5': 'Pos 5',
  '位6': 'Pos 6',
  '位7': 'Pos 7',
  '位8': 'Pos 8',
  '位9': 'Pos 9',
};

/** 箱体名 → 英文（未知条目原样返回） */
export function cabNameEn(name: string | undefined | null): string {
  if (!name) return '';
  return CAB_EN[name] ?? name;
}

/** 麦克风名 → 英文（未知条目原样返回） */
export function micNameEn(name: string | undefined | null): string {
  if (!name) return '';
  return MIC_EN[name] ?? name;
}

/** 麦克风位置 → 英文（未知条目原样返回） */
export function micPosEn(pos: string | undefined | null): string {
  if (!pos) return '';
  return POS_EN[pos] ?? pos;
}

/** 「麦克风 · 位置」组合（位置为「默认」时不显示） */
export function micPosLabel(mic: string | undefined | null, pos: string | undefined | null): string {
  const m = micNameEn(mic);
  const p = pos && pos !== '默认' ? micPosEn(pos) : '';
  return p ? `${m} · ${p}` : m;
}
