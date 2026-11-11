/**
 * BFX1 型号主键解析 · 单一真相源（★ v3.78 新增，2026-10-26）
 *
 * ══════════════════════════════════════════════════════════════════════
 *  为什么需要这一层
 * ══════════════════════════════════════════════════════════════════════
 *  v3.77 及之前，`subModels` 存的是**显示名**（`Fender Twin Reverb AB763`、
 *  `Fender Deluxe 1x12 开背`、`CE-2 标准`）。显示名会改、会翻译、会带全角
 *  括号 → 存档、云端、预设三方永远对不齐，云端 45 条音色因此全部失效。
 *
 *  v3.78 起：**存档 / 云端 / 预设只存 key**（纯 ASCII、不可变）；
 *  显示名随便改、随便翻译，不影响任何存档。
 *
 *  ⚠️ key 一旦发布永不变更。要换显示名 → 只改 name；要换 key → 必须写迁移器。
 *
 *  反查链（前三段命中即停）：
 *    1. key 精确匹配
 *    2. aliases 匹配（旧中文名 / 旧 id / 旧全名 / v19 名 / 第三方写法）
 *    3. 归一化名匹配（NFKC + 转小写 + 折叠空格 + 去首尾）
 *  全部失败 → 返回 null，调用方必须明确提示「型号未识别」，不得静默保留上一个。
 */

import { AMP_MODELS } from './_def/ampHeadDef';
import { OD_MODELS } from './_def/odDef';
import { COMP_MODELS } from './_def/compressorDef';
import { CHORUS_PRESETS, DELAY_PRESETS, REVERB_PRESETS } from './_def/fxPresets';
import { CAB_SETS } from './_def/cabinetDef';

export interface ModelRef {
  key: string;
  name: string;
  aliases?: string[];
  /** 内部 id（也参与反查，但绝不作为输出） */
  id?: string;
}

/** 归一化：全角→半角、去首尾、折叠连续空格、转小写 */
export function normName(v: string): string {
  return v
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * 各模块的型号索引。`cabinet` 按 key 去重 —— 同一箱体有多套 IR（不同麦克风），
 * 型号级只有一个 key。
 */
export const MODEL_REFS: Record<string, ModelRef[]> = {
  'amp-head': AMP_MODELS.map((m) => ({ key: m.key, name: m.name, aliases: m.aliases, id: m.id })),
  overdrive: OD_MODELS.map((m) => ({ key: m.key, name: m.name, aliases: m.aliases, id: m.id })),
  compressor: COMP_MODELS.map((m) => ({ key: m.key, name: m.name, aliases: m.aliases, id: m.id })),
  chorus: CHORUS_PRESETS.map((p) => ({ key: p.key, name: p.name, aliases: p.aliases })),
  delay: DELAY_PRESETS.map((p) => ({ key: p.key, name: p.name, aliases: p.aliases })),
  reverb: REVERB_PRESETS.map((p) => ({ key: p.key, name: p.name, aliases: p.aliases })),
  cabinet: dedupeCab(),
};

function dedupeCab(): ModelRef[] {
  const seen = new Set<string>();
  const out: ModelRef[] = [];
  for (const s of CAB_SETS) {
    if (seen.has(s.key)) continue;
    seen.add(s.key);
    out.push({ key: s.key, name: s.cab, aliases: s.cabOld ? [s.cabOld, s.id] : [s.id], id: s.id });
  }
  return out;
}

/** 该模块是否参与 key 体系（dist 已合并进 overdrive，不在此表） */
export function hasKeyRegistry(moduleId: string): boolean {
  return moduleId in MODEL_REFS;
}

/**
 * 任意写法 → key。命中不了返回 null。
 * `extra` 允许临时注入（用户自定义模块 / 影子注册）。
 */
export function resolveModelKey(
  moduleId: string,
  value: string | undefined | null,
  extra?: ModelRef[],
): string | null {
  if (!value) return null;
  const list = extra?.length ? [...extra, ...(MODEL_REFS[moduleId] ?? [])] : (MODEL_REFS[moduleId] ?? []);
  if (!list.length) return null;

  // 1. key 精确
  const byKey = list.find((r) => r.key === value);
  if (byKey) return byKey.key;

  // 2. aliases / id 精确（含大小写不敏感）
  const vn = normName(value);
  for (const r of list) {
    if (r.id && r.id === value) return r.key;
    for (const a of r.aliases ?? []) {
      if (a === value || normName(a) === vn) return r.key;
    }
  }

  // 3. 归一化显示名
  for (const r of list) {
    if (normName(r.name) === vn) return r.key;
  }

  return null;
}

/** key → 当前语言的显示名（找不到返回 key 本身，保证不出现空串） */
export function displayNameOf(moduleId: string, key: string | undefined | null): string {
  if (!key) return '';
  const r = (MODEL_REFS[moduleId] ?? []).find((x) => x.key === key);
  return r?.name ?? key;
}

/** key → 下拉框下标（找不到 −1） */
export function indexOfKey(moduleId: string, key: string | undefined | null): number {
  if (!key) return -1;
  const list = MODEL_REFS[moduleId] ?? [];
  return list.findIndex((r) => r.key === key);
}

/**
 * 把任意来源的 subModels（可能是新 key / 旧中文名 / 旧 id）统一成 key 表。
 * 解析不出来的 **保留原值**，由调用方决定是否提示 —— 绝不静默丢弃。
 */
export function toKeySubModels(
  sm?: Record<string, string> | null,
  extraOf?: (moduleId: string) => ModelRef[] | undefined,
): Record<string, string> | undefined {
  if (!sm) return undefined;
  const out: Record<string, string> = { ...sm };
  for (const moduleId of Object.keys(out)) {
    if (!hasKeyRegistry(moduleId)) continue;
    const k = resolveModelKey(moduleId, out[moduleId], extraOf?.(moduleId));
    if (k) out[moduleId] = k;
  }
  return out;
}

/** 存档写入用：key 表 + 显示名表（display 表只供排查，不参与任何匹配） */
export function withDisplayNames(sm: Record<string, string>): {
  subModels: Record<string, string>;
  subModelNames: Record<string, string>;
} {
  const keys = toKeySubModels(sm) ?? {};
  const names: Record<string, string> = {};
  for (const [moduleId, v] of Object.entries(keys)) {
    if (hasKeyRegistry(moduleId)) names[moduleId] = displayNameOf(moduleId, v);
  }
  return { subModels: keys, subModelNames: names };
}

/** 解析失败清单（上传前闸门 / 载入提示用） */
export function unresolvedModules(
  sm?: Record<string, string> | null,
  extraOf?: (moduleId: string) => ModelRef[] | undefined,
): Array<{ moduleId: string; value: string }> {
  if (!sm) return [];
  const bad: Array<{ moduleId: string; value: string }> = [];
  for (const [moduleId, v] of Object.entries(sm)) {
    if (!hasKeyRegistry(moduleId)) continue;
    if (!resolveModelKey(moduleId, v, extraOf?.(moduleId))) bad.push({ moduleId, value: v });
  }
  return bad;
}
