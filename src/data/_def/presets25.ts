/**
 * BFX1 25+25 预设骨架（2026-11-15）
 *
 * 说明：这是给新 APK 的过渡预设，只引用新 amp/cab key，不再出现旧型号名。
 * 用户提供的新预设文件可以直接替换本表；槽位 1–4 仍是线材直通档。
 *
 * ★ 2026-11-16：加回每档的「箱头总音量 239」和「激励器 PGA」：
 *   - masterDb：箱头 MASTER（reg 239）目标，CLEAN −6 / DRIVE −9 / LEAD −12；
 *     中间档（CRUNCH/RHYTHM）按 1.5 dB 步进插值。
 *   - boost：PGA 档位归一值 0…1；UI 档位 = round(v×10)，3 dB/档。
 *     CLEAN 4 / CRUNCH 5 / DRIVE 6 / RHYTHM 7 / LEAD 8，高增益组再高 1 档。
 *   这两个字段以前在 25+25 骨架里完全没有：预设载入时 239 仍是型号 baseRegs 的
 *   0 dB、boost 模块关闭（PGA 写 0 dB）。
 */
import type { PlayMode } from '../pedalData';

export interface Preset25Spec {
  slot: number;
  name: string;
  ampKey: string;
  cabKey: string;
  mode: PlayMode;
  /** 箱头总音量 reg 239，dB（0…−40）。 */
  masterDb?: number;
  /** 激励器 PGA 归一值 0…1（0…10 档，3 dB/档）。 */
  boost?: number;
}

export const PRESETS25: Preset25Spec[] = [
  { slot: 5, name: 'TIGHT BLUE', ampKey: 'g01-us-tight', cabKey: 'gc02-us-oversize', mode: 'guitar', masterDb: -9, boost: 0.6 },
  { slot: 6, name: 'TIGHT RED', ampKey: 'g01-us-tight', cabKey: 'gc02-us-oversize', mode: 'guitar', masterDb: -12, boost: 0.8 },
  { slot: 7, name: 'TIGHT RHYTHM', ampKey: 'g01-us-tight', cabKey: 'gc02-us-oversize', mode: 'guitar', masterDb: -10.5, boost: 0.7 },
  { slot: 8, name: 'TIGHT SOLO', ampKey: 'g01-us-tight', cabKey: 'gc02-us-oversize', mode: 'guitar', masterDb: -12, boost: 0.8 },
  { slot: 9, name: 'PLEXI CLEAN', ampKey: 'g20-brit-plexi', cabKey: 'gc06-brit-tall', mode: 'guitar', masterDb: -6, boost: 0.4 },
  { slot: 10, name: 'PLEXI CRUNCH', ampKey: 'g20-brit-plexi', cabKey: 'gc06-brit-tall', mode: 'guitar', masterDb: -7.5, boost: 0.5 },
  { slot: 11, name: 'PLEXI RHYTHM', ampKey: 'g20-brit-plexi', cabKey: 'gc06-brit-tall', mode: 'guitar', masterDb: -10.5, boost: 0.6 },
  { slot: 12, name: 'PLEXI LEAD', ampKey: 'g20-brit-plexi', cabKey: 'gc06-brit-tall', mode: 'guitar', masterDb: -12, boost: 0.7 },
  { slot: 13, name: 'BASS FINGER', ampKey: 'b01-us-bass', cabKey: 'bc01-us-bass', mode: 'bass', masterDb: -6, boost: 0.4 },
  { slot: 14, name: 'BASS PICK', ampKey: 'b01-us-bass', cabKey: 'bc01-us-bass', mode: 'bass', masterDb: -7.5, boost: 0.5 },
  { slot: 15, name: 'BASS DRIVE', ampKey: 'b01-us-bass', cabKey: 'bc01-us-bass', mode: 'bass', masterDb: -9, boost: 0.6 },
  { slot: 16, name: 'BASS SOLO', ampKey: 'b01-us-bass', cabKey: 'bc01-us-bass', mode: 'bass', masterDb: -12, boost: 0.7 },
];
