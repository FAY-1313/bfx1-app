// Register address map for BFX-1
// All addresses are decimal, as defined in the spec v4.0.
//
// ★ 2026-10-15 重构（按《全参数与寄存器规范 v5》第 2、3 章）：
//   · 命名统一：原 OD2_*（第二过载）与失真段一并改为 AMP_*，箱头段 = 57–98
//   · 已取消地址移除：2（输入静音）/ 3（输入音量）/ 240（AUX）/ 251·252（扬声器输出）
//                     / 253（限幅旁路）
//   · 260 由「已取消」恢复为「静音开关」（C6 定案，0 = 正常 / 1 = 静音）
//   · PEQ 编解码不再自持实现，统一来自 peqCodec.ts（唯一权威）
import { buildPEQData, parsePEQData, peqExtractGain, peqSetGain, peqGainToDb, dbToPeqGain } from './peqCodec';

/** PEQ 编解码与增益换算：原样再导出，保证既有引用不破 */
export * from './peqCodec';

export const REG = {
  // ── Noise Gate (0-1) ──────────────────────────────────────────────
  NOISE_GATE_BYPASS: 0,
  NOISE_GATE_THRESHOLD: 1,

  // ── Compressor Mode1 (7-13) ───────────────────────────────────────
  MODE1_BYPASS: 7,
  MODE1_THRESHOLD: 8,
  MODE1_ATTACK: 9,
  MODE1_RELEASE: 10,
  MODE1_RATIO: 11,
  MODE1_KNEE: 12,
  MODE1_GAIN: 13,

  // ── 1st OverDrive OD1 (42-56) ─────────────────────────────────────
  OD1_BYPASS: 42,
  OD1_PRE_EQ_BYPASS: 43,
  OD1_PRE_PEQ1: 44,
  OD1_PRE_PEQ2: 45,
  OD1_PRE_PEQ3: 46,
  OD1_PRE_PEQ4: 47,
  OD1_CLIP_BYPASS: 48,
  OD1_DRIVE: 49,
  OD1_DC_OFFSET: 50,
  OD1_LEVEL: 51,
  OD1_POST_EQ_BYPASS: 52,
  OD1_POST_PEQ1: 53,
  OD1_POST_PEQ2: 54,
  OD1_POST_PEQ3: 55,
  OD1_POST_PEQ4: 56,

  // ── Amp Head AMP (57-98) ──────────────────────────────────────────
  //   第一级：57 块旁路 / 58 N1库 / 59-62 N1 4段 / 63 N2级 / 64 GAIN / 65 DC1 / 66 VOL1
  //   第二级：67 N4库 / 68-71 N4 4段 / 72 块旁路 / 73 N5库 / 74-77 N5 4段
  //           / 78 N6级 / 79 DRIVE / 80 DC2 / 81 VOL2
  //   音调段：82 N8库 / 83-98 N8 16段（前几段 = 型号旋钮，其余 = 补偿段）
  AMP_BYPASS_1: 57,
  AMP_N1_LIB_BYPASS: 58,
  AMP_N1_PEQ1: 59,
  AMP_N1_PEQ2: 60,
  AMP_N1_PEQ3: 61,
  AMP_N1_PEQ4: 62,
  AMP_N2_CLIP_BYPASS: 63,
  AMP_GAIN: 64,
  AMP_DC1: 65,
  AMP_VOL1: 66,
  AMP_N4_LIB_BYPASS: 67,
  AMP_N4_PEQ1: 68,
  AMP_N4_PEQ2: 69,
  AMP_N4_PEQ3: 70,
  AMP_N4_PEQ4: 71,
  AMP_BYPASS_2: 72,
  AMP_N5_LIB_BYPASS: 73,
  AMP_N5_PEQ1: 74,
  AMP_N5_PEQ2: 75,
  AMP_N5_PEQ3: 76,
  AMP_N5_PEQ4: 77,
  AMP_N6_CLIP_BYPASS: 78,
  AMP_DRIVE: 79,
  AMP_DC2: 80,
  AMP_VOL2: 81,
  AMP_N8_LIB_BYPASS: 82,
  AMP_N8_PEQ1: 83,
  AMP_N8_PEQ2: 84,
  AMP_N8_PEQ3: 85,
  AMP_N8_PEQ4: 86,
  AMP_N8_PEQ5: 87,
  AMP_N8_PEQ6: 88,
  AMP_N8_PEQ7: 89,
  AMP_N8_PEQ8: 90,
  AMP_N8_PEQ9: 91,
  AMP_N8_PEQ10: 92,
  AMP_N8_PEQ11: 93,
  AMP_N8_PEQ12: 94,
  AMP_N8_PEQ13: 95,
  AMP_N8_PEQ14: 96,
  AMP_N8_PEQ15: 97,
  AMP_N8_PEQ16: 98,

  // ── Cabinet 35-band PEQ (107-142) ─────────────────────────────────
  CAB_BYPASS: 107,
  CAB_PEQ_START: 108,
  CAB_PEQ_END: 142,

  // ── Chorus (215-220) ──────────────────────────────────────────────
  CHORUS_BYPASS: 215,
  CHORUS_LEVEL: 216,
  CHORUS_RATE1: 217,
  CHORUS_RATE2: 218,
  CHORUS_DEPTH1: 219,
  CHORUS_DEPTH2: 220,

  // ── Feedback Delay (221-223) ──────────────────────────────────────
  DELAY_BYPASS: 221,
  DELAY_REPEAT: 222,
  DELAY_TIME: 223,

  // ── Reverb (224-229) ──────────────────────────────────────────────
  REVERB_BYPASS: 224,
  REVERB_PRE_DELAY: 225,
  REVERB_TIME: 226,
  REVERB_HPF: 227,
  REVERB_LPF: 228,
  REVERB_MIX: 229,

  // ── Amp Head MASTER / PreMixer (239) ──────────────────────────────
  //   ⚠ 只作电平旋钮，不再兼作静音（静音改用 260）
  AMP_MASTER: 239,

  // ── Mx Limiter (254-259) · 固定参数，仅调试模式可调 ─────────────────
  //   253（旁路位）已取消
  LIMITER_THRESHOLD: 254,
  LIMITER_ATTACK: 255,
  LIMITER_RELEASE: 256,
  LIMITER_RATIO: 257,
  LIMITER_KNEE: 258,
  LIMITER_GAIN: 259,

  // ── M1 Master Output (260-261) ────────────────────────────────────
  M1_OUT_MUTE: 260,     // ★ C6：0 = 正常 / 1 = 静音
  M1_OUT_VOLUME: 261,   // 首页总音量

  // ── Tuner (264-266) ───────────────────────────────────────────────
  TUNER_SWITCH: 264,
  TUNER_GAIN: 265,
  TUNER_FREQ: 266,
} as const;

/** 箱头块级旁路位 —— A1 全旁路时**必须成对写**；常开时恒 0 */
export const AMP_BLOCK_BYPASS: readonly number[] = [57, 72];
/** 箱头库旁路位 —— A1 写 1；常开恒 0（固件上电默认 1） */
export const AMP_LIB_BYPASS: readonly number[] = [58, 67, 73, 82];
/** 箱头分支级旁路位 —— 由型号数据决定，**不作为开关使用**（C4 定案不写） */
export const AMP_BRANCH_BYPASS: readonly number[] = [63, 78];

// Module-level register ranges for sub-model knob indexing
// ★ 2026-10-15：dist 已并入箱头（删除）；cabinet 段起点由 90 修正为 107；
//   箱头段起点由 72 修正为 57（含原失真段）。
export const MODULE_REG_BASE: Record<string, number> = {
  'noise-gate': 0,
  compressor: 7,
  overdrive: 42,
  'amp-head': 57,
  cabinet: 107,
  chorus: 215,
  delay: 221,
  reverb: 224,
};

// Convert normalized 0-1 knob value to register value for a given range
export function normToReg(
  norm: number,
  min: number,
  max: number,
  step: number = 1
): number {
  const raw = min + norm * (max - min);
  const snapped = Math.round(raw / step) * step;
  return Math.max(min, Math.min(max, snapped));
}

// Convert register value back to normalized 0-1
export function regToNorm(
  regValue: number,
  min: number,
  max: number
): number {
  if (max <= min) return 0.5;
  return Math.max(0, Math.min(1, (regValue - min) / (max - min)));
}

// ─── PEQ 0.5dB UI step alternation ─────────────────────────────────────
// Register step = 0.2dB, UI step = 0.5dB.
// Alternate +2 (+0.4dB) and +3 (+0.6dB) register increments to average 0.5dB.
// Each register address gets its own toggle state; resets on crossing neutral (120=0dB).
//
// ⚠ 这一段属【展示层步进逻辑】，不下沉到 peqCodec（位域与换算的唯一权威在那里）。

const peqStepToggle = new Map<number, boolean>();

/** Reset alternation toggle for a specific register address */
export function peqStepReset(regAddr: number): void {
  peqStepToggle.delete(regAddr);
}

/** Get current alternation toggle state for a register, defaults to false (2-step) */
function peqGetToggle(regAddr: number): boolean {
  return peqStepToggle.get(regAddr) ?? false;
}

/** Flip and return the new toggle state */
function peqFlipToggle(regAddr: number): boolean {
  const next = !peqGetToggle(regAddr);
  peqStepToggle.set(regAddr, next);
  return next;
}

/**
 * Apply one UI step (0.5dB) to a PEQ gain index in the given direction.
 * Alternates between +2 and +3 register steps to average +0.5dB.
 */
export function peqStepGain(
  currentGainIndex: number,
  regAddr: number,
  direction: 1 | -1,
): number {
  const useThree = peqFlipToggle(regAddr);
  const delta = (useThree ? 3 : 2) * direction;
  return Math.max(0, Math.min(180, currentGainIndex + delta));
}

/**
 * Convert a normalized knob value (0-1, neutral at 0.5) to PEQ gain index
 * using the 0.5dB UI step alternation strategy.
 * Maps 0.0→−12dB, 0.5→0dB, 1.0→+12dB with 0.5dB steps.
 */
export function normToPeqGain(
  norm: number,
  baseGainIndex: number,
  regAddr: number,
): number {
  peqStepToggle.delete(regAddr);
  const uiStepsFromCenter = Math.round((norm - 0.5) * 48); // -24 to +24
  if (uiStepsFromCenter === 0) return baseGainIndex;
  const direction: 1 | -1 = uiStepsFromCenter > 0 ? 1 : -1;
  let gainIndex = baseGainIndex;
  for (let i = 0; i < Math.abs(uiStepsFromCenter); i++) {
    gainIndex = peqStepGain(gainIndex, regAddr, direction);
  }
  return gainIndex;
}

// ─── Master Volume helpers (Reg261, M1OutVolume) ────────────────────
// Protocol v2.0: Reg261 range 0-50, 0=-Inf dB, 1-50=-49~0dB, step 1dB

export const MASTER_VOL_MIN = 0;   // -Inf dB
export const MASTER_VOL_MAX = 50;  // 0dB

/** Convert Reg261 value to display dB */
export function masterVolToDisplayDb(regValue: number): number {
  if (regValue <= 0) return -Infinity;
  return Math.max(0, Math.min(50, regValue)) - 50;
}

/** Convert normalized UI knob (0-1) to Reg261 value (0-50) */
export function normToMasterVol(norm: number): number {
  return Math.round(norm * MASTER_VOL_MAX);
}

/** Convert Reg261 value to normalized UI knob (0-1) */
export function masterVolToNorm(regValue: number): number {
  return Math.max(0, Math.min(1, regValue / MASTER_VOL_MAX));
}

// ─── PreMixer Volume helpers (Reg239, PreMixerGuitarLevel) ──────────
// Range 0-500, 0=-Inf dB, 1-500=-49.9~0.0dB, step 0.1dB

export const PREMIXER_VOL_MIN = 0;   // -Inf dB
export const PREMIXER_VOL_MAX = 500; // 0.0dB

/** Convert PreMixer register value (0-500) to display dB */
export function premixVolToDisplayDb(regValue: number): number {
  if (regValue <= 0) return -Infinity;
  return (Math.max(1, Math.min(PREMIXER_VOL_MAX, regValue)) - PREMIXER_VOL_MAX) / 10;
}

/** Convert normalized UI knob (0-1) to PreMixer register value (0-500) */
export function normToPremixVol(norm: number): number {
  return Math.round(norm * PREMIXER_VOL_MAX);
}

/** Convert PreMixer register value to normalized UI knob (0-1) */
export function premixVolToNorm(regValue: number): number {
  return Math.max(0, Math.min(1, regValue / PREMIXER_VOL_MAX));
}

// 局部引用，避免 tree-shaking 误删（本文件对外承诺导出这些 PEQ 辅助函数）
void buildPEQData; void parsePEQData; void peqExtractGain; void peqSetGain;
void peqGainToDb; void dbToPeqGain;
