/**
 * ══════════════════════════════════════════════════════════════════════════
 * 上传闸门（2026-11-03 用户拍板）
 *
 * 规则（三条，缺一不可）：
 *   ① **只允许整组上传** —— 单频道上传会让目标组内 4 格型号不一致，
 *      固件切档时要重建箱头 + 35 段箱体（9 个旁路位 × 500ms），快切彻底失效。
 *   ② **组内 4 格必须是同一箱头 + 同一箱体** —— 参数（GAIN/EQ/效果器）可以不同，
 *      型号不能不同。判据用 `subModels` 归一化后的 **key**（与 switchPacks 的
 *      muteFor 同一口径），不用显示名，避免中英/别名导致误判。
 *   ③ **4 格都不能是空槽** —— 旧逻辑"空格跳过"会让目标格保留上一个音色，
 *      结果同样是组内型号混杂。
 *
 * 为什么型号缺失也算不合格：无法证明"同型号"就不能上传。
 * 宁可让用户重存一次那一格，也不要把一个混合组写进硬件。
 */

import { normalizeSubModels } from '../data/subModelNames';
import type { BankItem } from './localPresets';

export interface GroupModelRow {
  slot: number;
  name: string;
  /** 归一化后的型号 key（拿不到就是空串） */
  amp: string;
  cab: string;
  /** 显示用（原始 subModels 值，可能是中文名/别名），仅供 UI 展示 */
  ampLabel: string;
  cabLabel: string;
  /** 该格有音色 */
  filled: boolean;
  /** 箱头一致（含"自身型号缺失" → false） */
  ampOk: boolean;
  cabOk: boolean;
}

export interface GroupModelCheck {
  /** 三条规则全部满足才为 true */
  ok: boolean;
  /** 本组第 1 格（1/5/9/13） */
  first: number;
  rows: GroupModelRow[];
  /** 空槽编号 */
  empty: number[];
  /** 有音色但缺箱头/箱体型号的格 */
  missing: number[];
  /** 箱头与本组基准不一致的格 */
  ampBad: number[];
  /** 箱体与本组基准不一致的格 */
  cabBad: number[];
  baseAmp: string;
  baseCab: string;
}

/** 取一格的型号 key（归一化：中文名 / 旧 id / 别名都会收敛成 key） */
export function modelKeyOf(item?: BankItem | null): { amp: string; cab: string } {
  const sm = normalizeSubModels(
    (item?.data?.subModels ?? undefined) as Record<string, string> | undefined,
  ) ?? {};
  return {
    amp: String(sm['amp-head'] ?? '').trim(),
    cab: String(sm['cabinet'] ?? '').trim(),
  };
}

/**
 * 校验一组（4 格）能否整组上传。
 * @param items    该组 4 格的 BankItem（可含 null / undefined）
 * @param firstSlot 组内第 1 格的编号（1 / 5 / 9 / 13）
 */
export function checkGroupModels(
  items: Array<BankItem | null | undefined>,
  firstSlot: number,
): GroupModelCheck {
  const rows: GroupModelRow[] = [];
  const empty: number[] = [];
  const missing: number[] = [];
  const ampBad: number[] = [];
  const cabBad: number[] = [];

  for (let k = 0; k < 4; k++) {
    const slot = firstSlot + k;
    const item = items[k] ?? null;
    const filled = !!item?.data;
    const { amp, cab } = filled ? modelKeyOf(item) : { amp: '', cab: '' };
    const raw = (item?.data?.subModels ?? {}) as Record<string, string>;
    rows.push({
      slot,
      name: item?.name ?? '',
      amp,
      cab,
      ampLabel: filled ? String(raw['amp-head'] ?? amp ?? '') : '',
      cabLabel: filled ? String(raw['cabinet'] ?? cab ?? '') : '',
      filled,
      ampOk: false,      // 下面按基准重算
      cabOk: false,
    });
    if (!filled) empty.push(slot);
    else if (!amp || !cab) missing.push(slot);
  }

  /* 基准 = 第一个"有音色且型号完整"的格；一格都没有时基准为空 */
  const baseRow = rows.find((r) => r.filled && r.amp && r.cab);
  const baseAmp = baseRow?.amp ?? '';
  const baseCab = baseRow?.cab ?? '';

  if (baseRow) {
    for (const r of rows) {
      if (!r.filled) continue;
      if (r.amp && r.amp === baseAmp) r.ampOk = true;
      else if (r.amp) ampBad.push(r.slot);
      if (r.cab && r.cab === baseCab) r.cabOk = true;
      else if (r.cab) cabBad.push(r.slot);
    }
  }

  const ok = empty.length === 0
    && missing.length === 0
    && ampBad.length === 0
    && cabBad.length === 0
    && rows.length === 4;

  return { ok, first: firstSlot, rows, empty, missing, ampBad, cabBad, baseAmp, baseCab };
}

/** 把不合格的原因拼成一句给用户看的话（中/英） */
export function groupCheckReason(c: GroupModelCheck, en = false): string {
  if (c.ok) return '';
  const label = (s: number) => `${Math.floor((s - 1) / 4) + 1}${['a', 'b', 'c', 'd'][(s - 1) % 4]}`;

  if (c.empty.length) {
    return en
      ? `${c.empty.map(label).join(', ')} empty — fill all 4 slots before uploading a group.`
      : `${c.empty.map(label).join('、')} 是空槽 —— 整组上传要求 4 格都有音色。`;
  }
  if (c.missing.length) {
    return en
      ? `${c.missing.map(label).join(', ')} has no amp/cab model — re-save that slot first.`
      : `${c.missing.map(label).join('、')} 缺少箱头/箱体型号 —— 请重新保存该格。`;
  }
  if (c.ampBad.length) {
    return en
      ? `Amp model differs at ${c.ampBad.map(label).join(', ')} — a group must share one amp.`
      : `${c.ampBad.map(label).join('、')} 的箱头型号与本组不一致 —— 一组只能有一个箱头型号。`;
  }
  if (c.cabBad.length) {
    return en
      ? `Cabinet model differs at ${c.cabBad.map(label).join(', ')} — a group must share one cabinet.`
      : `${c.cabBad.map(label).join('、')} 的箱体型号与本组不一致 —— 一组只能有一个箱体型号。`;
  }
  return en ? 'Group is not ready to upload.' : '本组不满足整组上传条件。';
}
