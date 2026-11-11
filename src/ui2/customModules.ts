/**
 * BFX1 · 自定义模块（导出的固定音色模块）
 *
 * 设计口径（2026-10-19 用户确认）：
 *   · 从调试页导出：过载页 → 自定义过载；箱头页 → 自定义箱头
 *   · 归入独立的「自定义」组，与内置过载 / 箱头并列
 *   · 模块**固定音色**：内部所有 EQ 段与增益全部固化，不可再进调试编辑
 *   · 面板只保留 GAIN / VOLUME 两个旋钮（可调）
 *   · 每类上限 5 个
 *
 * 存储：localStorage（本机，不上云、不占硬件 16 档）
 */

export type CustomKind = 'od' | 'amp';

export interface CustomModule {
  /** ★ v3.78：不可变主键（纯 ASCII，`u-xxxx`）—— 存档 / 云端只认它 */
  id: string;
  kind: CustomKind;
  /** ★ 任意语言显示名（中文 / 日文 / 阿拉伯文 / 俄文 / emoji 均可），可随时改 */
  name: string;
  /** 固化下来的寄存器快照（过载 42–56 / 箱头 57–98 + 239） */
  regs: Record<number, number>;
  createdAt: number;
}

const KEY = 'bfx_custom_modules_v1';
export const CUSTOM_LIMIT = 5;

export function loadCustomModules(): CustomModule[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter((m) => m && (m.kind === 'od' || m.kind === 'amp') && typeof m.name === 'string');
  } catch {
    return [];
  }
}

function saveAll(list: CustomModule[]) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* 配额满 → 静默 */ }
}

/** ★ v3.78：按**字素簇**计长（emoji 算 1、天城文/藏文组合符不会算 3） */
export function graphemeLen(s: string): number {
  try {
    const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    let n = 0;
    for (const _ of seg.segment(s)) n++;
    return n;
  } catch {
    return [...s].length;
  }
}

export const CUSTOM_NAME_MAX = 40;

/**
 * ★ v3.78 名称净化（**任意语言**支持的关键）
 *  · NFKC：全角→半角、兼容字符归一（"ＡＢＣ" 与 "ABC" 视为同形，避免看起来一样却匹配不上）
 *  · 去掉控制字符与零宽字符（防「看不见的重名」）
 *  · 连续空白折叠为单个空格、去首尾
 *  · 超长按字素截断（不切断 emoji / 组合符）
 * 返回值可能为空串 → 调用方必须拒绝提交，不得再静默塌成「自定义过载」。
 */
export function sanitizeCustomName(raw: string): string {
  let s = (raw ?? '').normalize('NFKC')
    .replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (graphemeLen(s) > CUSTOM_NAME_MAX) {
    const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    let out = '';
    let n = 0;
    for (const { segment } of seg.segment(s)) {
      if (n++ >= CUSTOM_NAME_MAX) break;
      out += segment;
    }
    s = out.trim();
  }
  return s;
}

/** 新增一个自定义模块；名称为空或超过 5 个同类时返回 null（由调用方提示） */
export function addCustomModule(
  kind: CustomKind, rawName: string, regs: Record<number, number>,
): CustomModule | null {
  const list = loadCustomModules();
  if (list.filter((m) => m.kind === kind).length >= CUSTOM_LIMIT) return null;
  const name = sanitizeCustomName(rawName);
  if (!name) return null;                       // ★ 空名禁止提交
  const buf = new Uint8Array(6);
  (globalThis.crypto ?? ({ getRandomValues: (a: Uint8Array) => a.map(() => Math.floor(Math.random() * 256)) } as any))
    .getRandomValues(buf);
  const rid = Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
  const mod: CustomModule = {
    id: `u-${rid}`,                             // ★ 纯 ASCII 不可变主键，与显示名彻底解耦
    kind, name,
    regs: { ...regs },
    createdAt: Date.now(),
  };
  saveAll([...list, mod]);
  return mod;
}

export function removeCustomModule(id: string) {
  saveAll(loadCustomModules().filter((m) => m.id !== id));
}

export function renameCustomModule(id: string, rawName: string): boolean {
  const name = sanitizeCustomName(rawName);
  if (!name) return false;
  saveAll(loadCustomModules().map((m) => (m.id === id ? { ...m, name } : m)));
  return true;
}

/** 取某一类的全部自定义模块（按创建时间正序，与槽位一致） */
export function customOf(kind: CustomKind): CustomModule[] {
  return loadCustomModules().filter((m) => m.kind === kind);
}

/**
 * ★★ 2026-10-26（用户要求「这四个旋钮对应的频段位置也要标注，要对应每一段」）：
 *   自定义箱头 N4 四段的**唯一真值**。
 *
 *   ⚠ 段位（seg）与显示顺序不一致，这正是要在 UI 上标出来的原因：
 *     显示顺序（moduleKnobs.TONE_RANK）= 低频 → 中频 → 高频 → 临场
 *     实际段位                          = 第2段 → 第3段 → 第1段 → 第4段
 *   地址与内置箱头完全一致（69=BASS 70=MID 68=TREBLE 71=PRESENCE），
 *   所以首页、工程模式、导出文件三处拿到的都是同一份。
 */
export const CUSTOM_AMP_TONE = [
  { name: 'BASS', addr: 69, seg: 2, typ: 'LowShelf', hz: 99, qs: 1, pfield: 'S' },
  { name: 'MID', addr: 70, seg: 3, typ: 'Peak', hz: 650, qs: 0.89, pfield: 'Q' },
  { name: 'TREBLE', addr: 68, seg: 1, typ: 'HighShelf', hz: 3170, qs: 1, pfield: 'S' },
  { name: 'PRESENCE', addr: 71, seg: 4, typ: 'Peak', hz: 4000, qs: 1, pfield: 'Q' },
] as const;

/** 四段的显示名（中文 / 英文），与首页旋钮标签同一口径 */
const TONE_LABEL: Record<string, string> = {
  BASS: '低频', MID: '中频', TREBLE: '高频', PRESENCE: '临场',
};

/** 自定义模块卡片上的旋钮描述 */
export interface CustomKnobDesc {
  key: string;
  addr: number;
  label: string;
  labelEn: string;
  /** 落在箱头 PEQ 的第几段（仅四个音色旋钮有） */
  seg?: number;
  /** 该段中心频率 Hz（仅四个音色旋钮有） */
  hz?: number;
}

/* ── 固定音色模块对外暴露的两个旋钮（只读展示用） ── */
export const CUSTOM_KNOB: Record<CustomKind, CustomKnobDesc[]> = {
  od: [
    { key: 'GAIN', addr: 49, label: 'GAIN', labelEn: 'GAIN' },
    { key: 'VOLUME', addr: 51, label: '音量', labelEn: 'VOLUME' },
  ],
  /* ★★ 2026-10-26（用户拍板）：自定义箱头 **去掉 MASTER**，DRIVE 保留，
     并把 N4 的四个音色旋钮也放开 —— 用户要求「全部可调」。
     顺序固定为 低频(69) → 中频(70) → 高频(68) → 临场(71)，与内置箱头同一口径。
     四个音色旋钮的 seg/hz 直接取自 CUSTOM_AMP_TONE，不另写一份。 */
  /* ★★★ 2026-10-30（用户要求「排列要正确、要符合现在的箱头设定模版」）：
   *   顺序与内置箱头**完全一致** —— 增益 → 音量1 → 驱动 → 音量2 → 总音量 → 四个音色段。
   *   旧版是「增益 → 驱动 → 音量」：音量 1（驱动级输入）跑到驱动后面，
   *   与内置箱头（GAIN → VOL1 → DRIVE → VOL2 → MASTER）相反，用户会以为旋钮接反。
   *   地址与内置一致：64 GAIN / 66 VOL1 / 79 DRIVE / 81 VOL2 / 239 MASTER。 */
  amp: [
    { key: 'GAIN', addr: 64, label: '增益', labelEn: 'GAIN' },
    { key: 'VOLUME', addr: 66, label: '音量1', labelEn: 'VOL1' },
    { key: 'DRIVE', addr: 79, label: '驱动', labelEn: 'DRIVE' },
    { key: 'VOLUME2', addr: 81, label: '音量2', labelEn: 'VOL2' },
    { key: 'MASTER', addr: 239, label: '总音量', labelEn: 'MAS' },
    ...CUSTOM_AMP_TONE.map((t) => ({
      key: t.name,
      addr: t.addr,
      label: TONE_LABEL[t.name] ?? t.name,
      labelEn: t.name,
      seg: t.seg,
      hz: t.hz,
    })),
  ],
};

/* ══════════════════════ 首页「自定义」分组用的虚拟型号 ══════════════════════
 * ★ 2026-10-19（用户选择方案 A）：导出的模块作为**追加项**并入内置型号列表，
 *   排在最后、单独一组「自定义」，现有下标完全不偏移。
 *   · 过载：只保留 GAIN(49) / VOLUME(51) 两个旋钮，PEQ 段不暴露
 *   · 箱头：realKnobs = ['GAIN','VOLUME'] → 基座只出 GAIN / VOL1，N8 音调段为空
 *   · 音色固定：regs 是导出时的整包快照，选它就是把这包参数写下去
 */

import type { OdModel } from '../data/_def/odDef';
import type { AmpModel } from '../data/_def/ampHeadDef';

const CUSTOM_OD_KNOBS: OdModel['knobs'] = [
  { name: 'GAIN', addr: 49, unit: 'reg', lo: 0, hi: 92, step: 1, found: true },
  { name: 'VOLUME', addr: 51, unit: 'reg', lo: 248, hi: 288, step: 1, found: true },
];

export function customOdModels(): OdModel[] {
  return customOf('od').map((m) => ({
    key: `custom-${m.id}`,
    id: `custom-${m.id}`,
    name: m.name,
    aliases: [m.id],
    sn: m.name,
    group: '自定义',
    groupEn: 'CUSTOM',
    circuit: '导出的固定音色 · 内部 EQ 已锁定',
    circuitEn: 'Exported fixed tone · internal EQ locked',
    category: 'guitar',
    knobs: CUSTOM_OD_KNOBS.map((k) => ({ ...k })),
    regs: { ...m.regs },
  }));
}

export function customAmpModels(): AmpModel[] {
  return customOf('amp').map((m) => ({
    key: `custom-${m.id}`,
    id: `custom-${m.id}`,
    name: m.name,
    aliases: [m.id],
    sn: m.name,
    cls: 'CUSTOM',
    limit: 40,
    family: '自定义箱头 · 全部可调',
    familyEn: 'Custom amp · all knobs live',
    /* ★★ 2026-10-26（用户拍板）：
       ① 去掉 MASTER —— 不再让用户绕过已固化的箱头输出级；
       ② DRIVE 保留，GAIN / DRIVE / VOL1 三枚全可调；
       ③ N4 四个音色旋钮一起放开（低频 / 中频 / 高频 / 临场），
          顺序由 moduleKnobs.ampToneKnobs 的语义档位保证。 */
    /* ★★★ 2026-10-30（用户要求「要有总音量…要符合现在的箱头设定模版」）：
     *   补全为与内置 BASS/CRUNCH/HIGH-GAIN 相同的 5 枚基座：
     *     增益(64) → 音量1(66) → 驱动(79) → 音量2(81) → 总音量(239)
     *   旧版只有 3 枚且**没有总音量** —— 自定义箱头调不了箱头输出电平，
     *   只能在首页 ④ 区用全局音量凑，与内置箱头的操作习惯不一致。
     *
     *   ⚠ 排列顺序由 ampKnobMap.ampBaseKnobs() 的 all[] 决定（按 key 映射），
     *     不是由这个数组的书写顺序决定；这里按可读顺序写，方便对照。 */
    baseKnobs: ['GAIN', 'VOL1', 'DRIVE', 'VOL2', 'MASTER'],
    realKnobs: ['GAIN', 'VOLUME'],
    clip: { GAIN: 0, DRIVE: 0, VOL1: 0, VOL2: 0, DC1: 0, DC2: 0 },
    /* N4 四段：唯一真值在 CUSTOM_AMP_TONE（首页 / 工程模式 / 导出共用），
       显示顺序由 TONE_RANK 决定，这里只是数据。 */
    knobs: CUSTOM_AMP_TONE.map((t) => ({ ...t })),
    regs: { ...m.regs },
  }));
}

/** 是否存在自定义模块（用于决定要不要刷新首页型号表） */
export function hasCustom(kind?: CustomKind): boolean {
  const list = loadCustomModules();
  return kind ? list.some((m) => m.kind === kind) : list.length > 0;
}
