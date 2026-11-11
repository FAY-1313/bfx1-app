/**
 * BFX1 箱头旋钮排布（v10 · 2026-10-19 用户拍板「统一 UI 旋钮」）
 *
 * 规则（按型号类别，从左边开始依次排列）：
 *   CLEAN      · GAIN(64) → VOL1(66)                        两枚（唯一单级）
 *   BASS       · GAIN(64) → VOL1(66) → DRIVE(79) → VOL2(81) 四枚
 *   CRUNCH     · 同 BASS                                    四枚
 *   HIGH-GAIN  · 同 BASS                                    四枚
 *   之后 = 型号自己的四个音色旋钮（N4 68–71，TREBLE / BASS / MID / PRESENCE）
 *   最右 = MASTER(239)，箱头前级电平（**不是**首页 ④ 区的总音量 reg 261）
 *
 * 命名口径（用户原话）：
 *   drive1 做 GAIN、drive2 标 DRIVE；volume1 / volume2 跟各自的驱动级成对。
 *   增益上限按类别：CLEAN 20 / CRUNCH 25 / HIGH-GAIN 40 / BASS 20 dB
 *   （上限在 ampHeadDef.limit，由 registers.ampGainSpec / ampDriveSpec 生成量程）。
 *
 * ⚠️ v10 之前这里按「真机面板旋钮清单 realKnobs」逐台推导显隐；v9 数据起
 *    realKnobs 只是统一占位，逐台推导会让 20 台全部丢 GAIN/MASTER，故改为按类别固定。
 */

import type { AmpModel } from '../data/_def/ampHeadDef';
import { shortLabel } from './knobLabels';

export type AmpBaseKey = 'GAIN' | 'DRIVE' | 'VOL1' | 'VOL2' | 'MASTER';

export interface AmpBaseKnob {
  key: AmpBaseKey;
  reg: number;
  /** 主界面单排缩写（≤5 字符） */
  short: string;
  /** 完整名（HUD / 放大面板用） */
  full: string;
}

/** 哪些类别有两级驱动（★ 2026-10-19 用户确认：只有 CLEAN 单级，BASS 也要两级） */
export const ampHasTwoStages = (m: AmpModel): boolean =>
  m.cls === 'CRUNCH' || m.cls === 'HIGH-GAIN' || m.cls === 'BASS';

/**
 * 推导某箱头型号应显示的基座旋钮（不含四个音色段）。
 * 返回顺序即 UI 从左到右的顺序；MASTER 在数组末尾，由 ampKnobs() 挪到整排最右。
 */
export function ampBaseKnobs(m: AmpModel): AmpBaseKnob[] {
  const out: AmpBaseKnob[] = [
    { key: 'GAIN', reg: 64, short: shortLabel('GAIN'), full: 'GAIN' },
    { key: 'VOL1', reg: 66, short: shortLabel('VOL1'), full: 'VOLUME 1' },
  ];
  /* ★ v3.79（用户 2026-10-26）：自定义箱头由导出的固定音色生成，
     不能再按 cls 推（CUSTOM 不属于任何一类 → 只剩 3 个旋钮）。
     型号自带 baseKnobs 时以它为准 —— 自定义箱头固定四枚：
     GAIN / DRIVE / VOL1 / MASTER。 */
  const want = (m as { baseKnobs?: string[] }).baseKnobs;
  if (want && want.length) {
    /* ★★★ 2026-10-30：**这个数组的顺序就是 UI 从左到右的顺序**，必须与内置箱头一致：
     *     GAIN(增益) → VOL1(音量1) → DRIVE(驱动) → VOL2(音量2) → MASTER(总音量)
     *
     *   旧代码把 DRIVE 写在 VOL1 **前面**（GAIN, DRIVE, VOL1, VOL2, MASTER），
     *   而自定义箱头的 baseKnobs 是 ['GAIN','DRIVE','VOL1'] —— 于是在首页上排成
     *   「增益 → 驱动 → 音量1」，和内置箱头的「增益 → 音量1 → 驱动」**顺序相反**。
     *   音量 1 是驱动级的**输入**音量、音量 2 是输出音量，两者必须各自紧挨自己的驱动级，
     *   顺序错了用户会以为旋钮接反了。
     *   ⚠ 这是"按 key 过滤"的映射表，所以顺序完全由这里决定，和 want 数组的书写顺序无关
     *     （want 里写 ['GAIN','VOL1','DRIVE'] 也会被这里重排成 GAIN, DRIVE, VOL1）。 */
    const all: AmpBaseKnob[] = [
      { key: 'GAIN', reg: 64, short: shortLabel('GAIN'), full: 'GAIN' },
      { key: 'VOL1', reg: 66, short: shortLabel('VOL1'), full: 'VOLUME 1' },
      { key: 'DRIVE', reg: 79, short: shortLabel('DRIVE'), full: 'DRIVE' },
      { key: 'VOL2', reg: 81, short: shortLabel('VOL2'), full: 'VOLUME 2' },
      { key: 'MASTER', reg: 239, short: '总音量', full: '总音量' },
    ];
    return want
      .map((k) => all.find((x) => x.key === k))
      .filter((x): x is AmpBaseKnob => !!x);
  }
  if (ampHasTwoStages(m)) {
    out.push({ key: 'DRIVE', reg: 79, short: shortLabel('DRIVE'), full: 'DRIVE' });
    out.push({ key: 'VOL2', reg: 81, short: shortLabel('VOL2'), full: 'VOLUME 2' });
  }
  /* ★★ v3.85（用户拍板）：箱头 MASTER 的显示名统一为 **中文「总音量」/ 英文缩写「MAS」**。
     原来是中英都写 MASTER —— 中文界面看不出这是音量，英文界面又占了 6 个字符，
     9 钮机型（Twin / SVT）标签直接顶到格子外。 */
  out.push({ key: 'MASTER', reg: 239, short: '总音量', full: '总音量' });
  return out;
}

/** 某型号主界面单排旋钮总数（基座 + 音色段） */
export function ampKnobCount(m: AmpModel): number {
  return ampBaseKnobs(m).length + (m.knobs?.length ?? 0);
}

/** 音色段缩写（≤5 字符，单排标签用） */
export function n8Short(name: string): string {
  /* 统一走中文短标签表（BASS→低频 / MID→中频 / TREBLE→高频 / CUT→削减 …） */
  return shortLabel(name);
}
