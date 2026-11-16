import type { LocalPreset } from '../services/localPresets';
import { TONE25_CABS, TONE25_HEADS } from './_def/tone25';
import { OD10_MODELS } from './_def/od10';
import { COMP_MODELS } from './_def/compressorDef';
import { CHORUS_PRESETS, DELAY_PRESETS, REVERB_PRESETS } from './_def/fxPresets';

/**
 * 我的音色库 · 2026-11-16 four-platform bank
 *
 * Four groups, four snapshots each.  A group keeps the same head/cab so group
 * switching is a parameter/FX switch, not a full amp re-model.
 *
 * ★ 2026-11-16（用户拍板，第二版）：
 *   1 组 = **线材直通四档**，寄存器逐条取自固件出厂 1a–1d（firmwareBank.ts），
 *          与"现在固件的参数"完全同源；箱头/箱体/效果器全部旁路。
 *   2 组 = US CLEAN 85（美式 2x12 清音平台）
 *   3 组 = BRIT PLEXI 100 + BRIT TALL 4x12（马歇尔箱头/箱体）
 *   4 组 = US BASS 300（贝斯 8x10）
 *   · 2/3 组都是 CLEAN / CHORUS / RHYTHM / LEAD 四档，箱头两级 DRIVE
 *     （reg 64 增益级、reg 79 驱动级）与两级 VOLUME（reg 66 / reg 81）都按档位
 *     显式设置，落在 NAM 拟合的 clip 工作点附近，不做无意义的满量程堆叠。
 *   · 4 组贝斯四档，后两档允许过载踏板，但 DRIVE ≤ 5 dB。
 *
 * Every snapshot contains the chorus/delay/reverb parameter registers even
 * while that module is bypassed.  The switch-packs layer can therefore preload
 * them behind bypass and the next current channel only has to change the
 * bypass bit.
 */

interface LocalTone {
  name: string;
  gainDb: number;
  volDb: number;
  masterDb: number;
  gate: number;
  /** 箱头第二级 DRIVE（reg 79）相对型号原值的增量（"两级"= +4） */
  driveSteps?: number;
  /** 箱头 VOL2（reg 81），dB；288 = 0 dB */
  vol2Db?: number;
  /** 激励器 PGA 档位，归一值 0…1；UI 档位 = round(v×10) = 0…10，3 dB/档 */
  boost?: number;
  od?: string;
  /** 过载踏板 DRIVE（dB） */
  odDriveDb?: number;
  odLevelDb?: number;
  comp?: string;
  chorus?: string;
  delay?: string;
  reverb?: string;
  reverbMix?: number;
}

interface LocalGroup {
  headKey: string;
  cabKey: string;
  tones: LocalTone[];
}

/* ══════════════════════════════════════════════════════════════════
 * 第 1 组：线材直通（A 组四档）
 *
 * ★★ 2026-11-16 第三次修版（以用户提供的固件文档为准）
 *   来源：`BFX1_频道1_A组_四档开机下发参数.docx`
 *        对应固件 tone_channels_v1.c 的 chf_A1 ~ chf_A4（2026-11-13 构建）。
 *
 *   与旧实现的差别（旧版是错的，用户听到「加载不对」就是这里）：
 *     · A 组开机只下发 **23 帧**（位图选中的 24 个地址，260 被固件跳过），
 *       不是整张 117 条表；箱体段 108–142 不在关键帧内，**不要写**。
 *     · A1 才是全旁路（42=1）；**A2–A4 的 1ST OD 是启用的（42=0）**，
 *       靠 45/46/49/56 四个值区分线材/DI/线缆听感。
 *     · 四档 PGA 激励都是 0 dB（0x10，走 I2C，不在寄存器表里）。
 *     · 253（限幅旁路）：**1 组固定 = 1**，其余组 = 0（换组时必须写）。
 * ══════════════════════════════════════════════════════════════════ */
const A_GROUP_COMMON: Record<number, number> = {
  0: 0x1,        // 噪声门旁路
  1: 0x3,        // 噪声门/输入
  7: 0x1,        // 输入链路旁路位
  44: 0x50A781D6,
  47: 0x50A78AE7,
  50: 0x32,
  51: 0x114,
  53: 0x50A781D6,
  54: 0xC1384430,
  55: 0x50A78A6F,
  57: 0x1,       // DIST（箱头）旁路
  72: 0x1,       // 2ND OD（箱头）旁路
  107: 0x1,      // 箱体开关（关）
  215: 0x1,      // 合唱旁路
  221: 0x1,      // 延迟旁路
  224: 0x1,      // 混响旁路
  239: 0x1F4,    // 总音量 500（固件出厂值）
  253: 0x1,      // ★ 1 组固定：限幅旁路 = 1
  261: 0x32,     // M1 输出 50
};

/** A1–A4 各自不同的 5 条（42/45/46/49/56） */
const A_GROUP_VARIANTS: Array<{ name: string; regs: Record<number, number>; odOn: boolean }> = [
  { name: 'DIRECT',            regs: { 42: 0x1, 45: 0x50A78A6F, 46: 0xC1882540, 49: 0x8, 56: 0x5106EAEA }, odOn: false },
  { name: 'DI-PASSIVE',        regs: { 42: 0x0, 45: 0x50A78A6F, 46: 0x5188C540, 49: 0x4, 56: 0x5106EAEA }, odOn: true },
  { name: 'CABLE-20FT',        regs: { 42: 0x0, 45: 0x50A787AF, 46: 0xC1882540, 49: 0xC, 56: 0x5106EAEA }, odOn: true },
  { name: 'CABLE-10FT-SILVER', regs: { 42: 0x0, 45: 0x50A78A6F, 46: 0xC1882540, 49: 0x8, 56: 0x50A78AEA }, odOn: true },
];

function makePassthroughPreset(fwIndex: number, slot: number): LocalPreset {
  const v = A_GROUP_VARIANTS[fwIndex];
  const registers: Record<number, number> = { ...A_GROUP_COMMON, ...v.regs };
  return {
    slot,
    name: v.name,
    nameEn: v.name,
    playMode: 'guitar',
    modules: {
      'noise-gate': false,
      boost: false,          // PGA = 0x10（0 dB）
      compressor: false,
      overdrive: v.odOn,     // A2–A4 的 1ST OD 参与链路
      'amp-head': false,
      cabinet: false,
      chorus: false,
      delay: false,
      reverb: false,
    },
    /* 直通档没有型号：subModels / knobValues 留空 */
    subModels: {},
    knobValues: {},
    registers,
    savedAt: Date.now() - (slot - 1),
  };
}

const GROUPS: LocalGroup[] = [
  /* ── 第 2 组：US CLEAN 85 + US CLEAN 2x12 ──
     ★ 2026-11-16 第四次修版（用户：后两档失真度不够，提升两级 drive）：
       RHYTHM / LEAD 的箱头驱动级 reg 79 各 +4（型号原值 0 → 4），
       过载踏板 DRIVE 同步 +4 dB（14→18 / 20→24），GAIN +2，
       VOL2 相应下压 1 dB 抵消。 */
  {
    headKey: 'g06-us-clean',
    cabKey: 'gc08-us-clean',
    tones: [
      { name: 'US CLEAN', gainDb: 3, volDb: -3, masterDb: -6, vol2Db: -1, boost: 0.1, gate: 0.20, comp: 'la2a', reverb: 'reverb-room', reverbMix: 10 },
      { name: 'US CHORUS', gainDb: 3, volDb: -3, masterDb: -6, vol2Db: -1, boost: 0.1, gate: 0.20, comp: 'la2a', chorus: 'chorus-ce2', reverb: 'reverb-room', reverbMix: 12 },
      { name: 'US RHYTHM', gainDb: 10, volDb: -4, masterDb: -7.5, vol2Db: -2, driveSteps: 4, boost: 0.35, gate: 0.24, comp: 'cs2', od: 'od10-g-od-05', odDriveDb: 18, odLevelDb: -3, reverb: 'reverb-room', reverbMix: 10 },
      { name: 'US LEAD', gainDb: 12, volDb: -5, masterDb: -9, vol2Db: -3, driveSteps: 4, boost: 0.45, gate: 0.28, comp: 'cs2', od: 'od10-g-od-07', odDriveDb: 24, odLevelDb: -3, delay: 'delay-analog', reverb: 'reverb-hall', reverbMix: 14 },
    ],
  },
  /* ── 第 3 组：BRIT PLEXI 100 + BRIT TALL 4x12（马歇尔箱头/箱体）──
     四档同为 CLEAN/CHORUS/RHYTHM/LEAD；Plexi 原值 79=12，RHYTHM +4、LEAD +6，
     对齐 NAM 的 clip 工作点（gain 8 / drive 6，vol1 -4、vol2 -1）。 */
  {
    headKey: 'g20-brit-plexi',
    cabKey: 'gc06-brit-tall',
    tones: [
      { name: 'PLEXI CLEAN', gainDb: 2, volDb: -3, masterDb: -6, vol2Db: -1, boost: 0.1, gate: 0.20, comp: 'la2a', reverb: 'reverb-room', reverbMix: 10 },
      { name: 'PLEXI CHORUS', gainDb: 2, volDb: -3, masterDb: -6, vol2Db: -1, boost: 0.1, gate: 0.20, comp: 'la2a', chorus: 'chorus-ce2', reverb: 'reverb-room', reverbMix: 12 },
      { name: 'PLEXI RHYTHM', gainDb: 8, volDb: -4, masterDb: -8, vol2Db: -2, driveSteps: 4, boost: 0.35, gate: 0.24, comp: 'cs2', od: 'od10-g-od-06', odDriveDb: 16, odLevelDb: -3, reverb: 'reverb-room', reverbMix: 10 },
      { name: 'PLEXI LEAD', gainDb: 12, volDb: -5, masterDb: -10, vol2Db: -3, driveSteps: 6, boost: 0.45, gate: 0.28, comp: 'cs2', od: 'od10-g-od-01', odDriveDb: 22, odLevelDb: -3, delay: 'delay-digital', reverb: 'reverb-hall', reverbMix: 14 },
    ],
  },
  /* ── 第 4 组：US BASS 300 + US BASS 8x10 ──
     ★ 2026-11-16 第三次修版（用户）：前两档保持 CLEAN，后两档可以加过载踏板，
       但 **DRIVE 不超过 5 dB** —— BRIGHT 3 dB（SANSAMP），DRIVE 5 dB（B7K）。 */
  {
    headKey: 'b01-us-bass',
    cabKey: 'bc01-us-bass',
    tones: [
      { name: 'BASS CLEAN', gainDb: 2, volDb: -3, masterDb: -6, vol2Db: -1, boost: 0.1, gate: 0.20, comp: 'bassist' },
      { name: 'BASS ROUND', gainDb: 4, volDb: -3, masterDb: -7.5, vol2Db: -1, boost: 0.15, gate: 0.22, comp: 'bassist' },
      { name: 'BASS BRIGHT', gainDb: 6, volDb: -4, masterDb: -9, vol2Db: -2, boost: 0.2, gate: 0.26, comp: 'bassist', od: 'od10-b-od-01', odDriveDb: 3, odLevelDb: -2, reverb: 'reverb-room', reverbMix: 6 },
      { name: 'BASS DRIVE', gainDb: 8, volDb: -5, masterDb: -9, vol2Db: -2, boost: 0.25, gate: 0.30, comp: 'bassist', od: 'od10-b-od-02', odDriveDb: 5, odLevelDb: -2, reverb: 'reverb-room', reverbMix: 6 },
    ],
  },
];

const CHORUS_SAFE: Record<number, number> = { 216: 20, 217: 4, 218: 5, 219: 2, 220: 2 };
const DELAY_SAFE: Record<number, number> = { 222: 33, 223: 230 };
const REVERB_SAFE: Record<number, number> = { 225: 5, 226: 12, 227: 70, 228: 95, 229: 0 };
const CAB_FIXED: Record<number, number> = { 253: 0, 254: 47, 255: 1, 256: 150, 257: 40, 258: 12, 259: 0 };

function cabRegs(cabKey: string): Record<number, number> {
  const cab = TONE25_CABS.find((c) => c.key === cabKey) ?? TONE25_CABS[0];
  const out: Record<number, number> = { 107: 0 };
  for (let i = 0; i < Math.min(35, cab.bands.length); i++) out[108 + i] = cab.bands[i];
  return { ...out, ...CAB_FIXED };
}

function makePreset(group: LocalGroup, tone: LocalTone, slot: number, savedAt: number): LocalPreset {
  const head = TONE25_HEADS.find((h) => h.key === group.headKey) ?? TONE25_HEADS[0];
  const od = tone.od ? OD10_MODELS.find((m) => m.key === tone.od) : undefined;
  const comp = tone.comp ? COMP_MODELS.find((m) => m.id === tone.comp) : undefined;
  const chorus = tone.chorus ? CHORUS_PRESETS.find((p) => p.key === tone.chorus) : undefined;
  const delay = tone.delay ? DELAY_PRESETS.find((p) => p.key === tone.delay) : undefined;
  const reverb = tone.reverb ? REVERB_PRESETS.find((p) => p.key === tone.reverb) : undefined;

  const registers: Record<number, number> = {
    ...head.baseRegs,
    ...cabRegs(group.cabKey),
    0: 0,
    1: Math.max(0, Math.min(100, Math.round(tone.gate * 10) * 10)),
    3: 50,
    261: 50,
    /* ★ 2026-11-16：253（限幅旁路）与组号绑定 —— 第 2/3/4 组必须写 0；
       第 1 组那四档在 makePassthroughPreset 里写 1。 */
    253: 0,
  };
  const lim = head.gainLimit;
  registers[64] = Math.max(0, Math.min(lim * 2, Math.round(tone.gainDb * 2)));
  registers[66] = Math.max(166, Math.min(288, Math.round(288 + tone.volDb * 4)));
  registers[239] = Math.max(100, Math.min(500, Math.round(500 + tone.masterDb * 10)));
  /* ★ 2026-11-16：箱头有**两级 DRIVE / 两级 VOLUME** —— DRIVE(79) 与 VOL2(81)
     以前一直沿用型号原值，导致"失真度不够 / 后级音量跟不上"。
     现在按档位显式设置：DRIVE 在型号原值上 +0/2/4/6，VOL2 直接给 dB。 */
  if (tone.driveSteps) {
    registers[79] = Math.max(0, Math.min(46, (head.baseRegs[79] ?? 0) + tone.driveSteps));
  }
  if (tone.vol2Db !== undefined) {
    registers[81] = Math.max(248, Math.min(288, Math.round(288 + tone.vol2Db * 4)));
  }

  if (od) {
    Object.assign(registers, od.baseRegs);
    registers[42] = 0;
    registers[49] = Math.max(0, Math.min(92, Math.round((tone.odDriveDb ?? (od.baseRegs[49] ?? 40) / 2) * 2)));
    registers[51] = Math.max(248, Math.min(288, Math.round(288 + (tone.odLevelDb ?? -3) * 4)));
  } else {
    registers[42] = 1;
  }

  if (comp) {
    Object.assign(registers, comp.regs);
    registers[7] = 0;
  } else {
    registers[7] = 1;
  }

  /* 即使模块关闭也带上参数：换组时 switchPacks 会在 bypass 状态下预加载，
     下次在当前频道开启效果时只翻 bypass 位。 */
  Object.assign(registers, CHORUS_SAFE, DELAY_SAFE, REVERB_SAFE);
  if (chorus) Object.assign(registers, chorus.regs);
  registers[215] = chorus ? 0 : 1;

  if (delay) Object.assign(registers, delay.regs);
  registers[221] = delay ? 0 : 1;

  if (reverb) Object.assign(registers, reverb.regs);
  registers[224] = reverb ? 0 : 1;
  if (tone.reverbMix !== undefined) registers[229] = Math.max(0, Math.min(100, Math.round(tone.reverbMix)));

  const modules: Record<string, boolean> = {
    'noise-gate': true,
    /* ★ 2026-11-16：激励器进入预设存储。boost 走 PGA I2C，没有寄存器；
       模块开关必须为 true，载入路径才会 writePGA(round(BOOST×10))，
       否则会按旧逻辑写 0 dB。 */
    boost: tone.boost !== undefined && tone.boost > 0,
    compressor: !!comp,
    overdrive: !!od,
    dist: false,
    'amp-head': true,
    cabinet: true,
    chorus: !!chorus,
    delay: !!delay,
    reverb: !!reverb,
  };

  const subModels: Record<string, string> = {
    'amp-head': head.key,
    cabinet: group.cabKey,
    compressor: comp?.id ?? '',
    overdrive: od?.key ?? '',
    chorus: chorus?.key ?? '',
    delay: delay?.key ?? '',
    reverb: reverb?.key ?? '',
  };

  return {
    slot,
    name: tone.name,
    nameEn: tone.name,
    playMode: head.category,
    modules,
    subModels,
    knobValues: {
      'noise-gate': { THRESHOLD: tone.gate },
      'amp-head': {
        GAIN: (registers[64] ?? 0) / (lim * 2),
        VOLUME: ((registers[66] ?? 216) - 166) / 122,
        MASTER: ((registers[239] ?? 500) - 100) / 400,
      },
      /* ★ 2026-11-16：激励器档位随预设保存（0…1 归一，UI 显示 0…10 档）。
         没有这一项时，载入会按「老音色无 boost」写 PGA 0 dB。 */
      ...(tone.boost !== undefined ? { boost: { BOOST: tone.boost } } : {}),
    },
    registers,
    savedAt,
  };
}

/** Build the 16 local-bank seeds: group 1 = firmware cable passthrough, then three amp groups. */
export function buildLocalBank2026Seeds(): LocalPreset[] {
  const out: LocalPreset[] = [];
  let slot = 1;
  /* 1 组（1–4）= 固件 1a–1d 线材直通 */
  for (let i = 0; i < 4; i++) {
    out.push(makePassthroughPreset(i, slot));
    slot++;
  }
  /* 2–4 组（5–16）= 三套箱头平台 × 四档 */
  for (const group of GROUPS) {
    for (const tone of group.tones) {
      out.push(makePreset(group, tone, slot, Date.now() - (slot - 1)));
      slot++;
    }
  }
  return out;
}
