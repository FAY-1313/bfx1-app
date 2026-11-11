import { AMP_KNOB_LUTS } from './ampKnobLuts';
import { SERIES_REGISTRY, seriesModelKey } from './seriesData';
// v12 单块参数表（自动生成，见 tools/gen_pedal_params2.py）：以 apk_model_params.md 的标注值重编码
import { PEDAL_PRE_EQ2, PEDAL_FORMULAS2 } from './_gen/pedal_params2';
// v13 箱头参数表（自动生成，见 tools/gen_amp_params.py）：Pre4 取电路表 / Post16 取文件真实拐点 / 非对称扫描
import { AMP_PRE_EQ2, AMP_FORMULAS2 } from './_gen/amp_params2';

/**
 * UI002 寄存器参数映射表
 *
 * 基于 UI002.TXT 硬件协议文档 v4.0
 * 将每个模块的旋钮标签映射到正确的寄存器地址和数值范围
 *
 * 寄存器地址空间（Guitar 路径）:
 *   Noise Gate:          0 – 1
 *   Compressor:          4 – 41   (3 种模式, 2 个压缩器)
 *   1st OverDrive:       42 – 56  (Pre 4PEQ + OD + Post 4PEQ)
 *   1st OD DIST:         57 – 71  (DIST 段: Pre 4PEQ + Clip + Post 4PEQ)
 *   2nd OverDrive:       72 – 104 (Pre 4PEQ + OD + Post 16PEQ)
 *   35-Band PEQ:         105 – 214
 *   Chorus:              215 – 220
 *   Feedback Delay:      221 – 223
 *   Reverb:              224 – 229
 *   M1 Out:              260 – 261
 *   Tuner:               264 – 266
 *   System:              0 – 3
 */

// ─── ★ 2026-10-15 收敛：PEQ 编解码统一到 peqCodec.ts（唯一权威实现）──────
//    本文件不再自持实现；下方所有同名符号由此处导入，并原样再导出，
//    保证既有 `from './parameterMap'` 的引用全部不破。
import {
  SFT_PEQ_TYPE, SFT_PEQ_FREQ, SFT_PEQ_GAIN, SFT_PEQ_Q, SFT_PEQ_S,
  MSK_PEQ_TYPE, MSK_PEQ_FREQ, MSK_PEQ_GAIN, MSK_PEQ_Q, MSK_PEQ_S,
  PEQ_TYPE, PEQ_FREQ_TABLE, PEQ_Q_TABLE, PEQ_S_TABLE,
  buildPEQData, parsePEQData, freqToIndex,
  PEQ_GAIN_MIN, PEQ_GAIN_MAX, PEQ_GAIN_DEFAULT, clampPEGgain,
  peqExtractGain, peqSetGain, peqGainToDb, dbToPeqGain, peqAdjustGain,
} from './peqCodec';
export * from './peqCodec';


/** 压缩器 Ratio 表 (索引 0~40) */
export const RATIO_TABLE: number[] = [
  1.0, 1.2, 1.4, 1.6, 1.8,
  2.0, 2.4, 2.8, 3.2, 3.6,
  4.0, 4.4, 4.8, 5.2, 5.6,
  6.0, 6.4, 6.8, 7.2, 7.6,
  8.0, 8.4, 9.0, 9.6, 10.2,
  10.8, 11.4, 12, 13, 14,
  15, 16, 17, 18, 19,
  20, 22, 24, 26, 30,
  100,
];


// ─── MT-2 重建: 实物旋钮档位 (LOW/HIGH/MID FREQ 吸附 PEQ 频点) ──────────
export const MT2_LOW_DETENTS = [20, 50, 100, 200];          // Hz (LOW→HPF 截频)
export const MT2_HIGH_DETENTS = [1000, 2000, 5000, 10000];  // Hz (HIGH→LPF 截频)
export const MT2_MIDFREQ_DETENTS = [200, 500, 1000, 2000];  // Hz (MID FREQ→扫频点)

/** 旋钮归一化值 → 档位频率 (N 档 4 刻度, idx = round(n*(N-1))) */
export function mt2DetentHz(n: number, detents: number[]): number {
  const idx = Math.min(detents.length - 1, Math.max(0, Math.round(n * (detents.length - 1))));
  return detents[idx];
}

/** 档位频率 → 旋钮归一化值 (就近吸附, 回读用) */
export function mt2DetentNorm(hz: number, detents: number[]): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < detents.length; i++) {
    const d = Math.abs(detents[i] - hz);
    if (d < bestD) { bestD = d; best = i; }
  }
  return best / (detents.length - 1);
}

// reg60 = MID 电平(增益位) + MID FREQ 扫频点(频率位) 合并的 PEAK; 中性默认 = PEAK@500 0dB
const MT2_REG60_NEUTRAL = buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), 120, 10, 10);
const mt2MidFreq = (n: number) => freqToIndex(mt2DetentHz(n, MT2_MIDFREQ_DETENTS));
const mt2LowFreq = (n: number) => freqToIndex(mt2DetentHz(n, MT2_LOW_DETENTS));
const mt2HighFreq = (n: number) => freqToIndex(mt2DetentHz(n, MT2_HIGH_DETENTS));
/** MID 电平: ±12dB → gainIdx 120±N*5, 保留 reg60 现有 freq/q/s */
const mt2MidCompute = (n: number, cur?: number) => {
  const p = parsePEQData(cur ?? MT2_REG60_NEUTRAL);
  return buildPEQData(PEQ_TYPE.PEAK, p.freq, clampPEGgain(120 + Math.round((n - 0.5) * 120)), p.q, p.s);
};
/** MID FREQ: 档位扫频点 → freq 位, 保留 reg60 现有 gain/q/s */
const mt2MidFreqCompute = (n: number, cur?: number) => {
  const p = parsePEQData(cur ?? MT2_REG60_NEUTRAL);
  return buildPEQData(PEQ_TYPE.PEAK, mt2MidFreq(n), p.gain, p.q, p.s);
};

// ─── 参数定义接口 ────────────────────────────────────────────────────
export interface ParamDef {
  regAddr: number;
  min: number;
  max: number;
  isPEQ?: boolean;
  peqType?: number;
  fixedQ?: number;
  fixedS?: number;
}

// ─── 系统寄存器 ──────────────────────────────────────────────────────
export const REG_INPUT_VOLUME   = 3;    // Guitar_Volume (0~50, -49~0dB, 1dB step)
export const REG_OUTPUT_VOLUME  = 261;  // M1OutVolume (0~50, -Inf~0dB, 1dB step)
export const REG_MUTE           = 2;    // Guitar_Mute (0=UnMute, 1=Mute)
export const REG_TUNER_SWITCH   = 264;  // GuitarTuner_Switcch (0=Off, 1=On)
export const REG_TUNER_GAIN     = 265;  // GuitarTuner_GuitarInputGain (0~20, 0~20dB)
export const REG_NOISE_GATE_BYPASS = 0;
export const REG_TUNER_FREQ     = 266;  // IEEE754 float (30.0~500.0Hz)

// ─── PEQ 增益范围 (文档 v4.0: 0~180, -24.0~+12.0dB, step 0.2dB) ────

// ─── 模块旁路地址 ─────────────────────────────────────────────────────
// ★ 2026-10-15：权威口径已统一到 passThrough.ts 的 MODULE_BYPASS（含 on/off/是否踩钉）。
//   此处只再导出地址映射，保持既有 `from './parameterMap'` 的引用不破。
//   变更：dist 已并入箱头（删除）；amp-head 由 72 改为 57；peq35 / 105 已废弃。
export { MODULE_BYPASS_ADDR } from './passThrough';

// ─── 模块参数映射表 ───────────────────────────────────────────────────
// 每个模块: knobLabel → { regAddr, min, max, isPEQ?, peqType?, fixedQ?, fixedS? }
export const MODULE_PARAM_MAP: Record<string, Record<string, ParamDef>> = {

  // ── Noise Gate ────────────────────────────────────────────────────
  "noise-gate": {
    /* ★ 2026-10-20：寄存器量纲是 0…100（UI 显示 0…10、步进 10）。
       原来写 max:10 → 反解出的归一值是实际值的 10 倍，载入预设后门旋钮必顶满。 */
    THRESHOLD: { regAddr: 1, min: 0, max: 100 },
  },

  // ── Compressor ────────────────────────────────────────────────────
  // 文档 v4.0: reg4=Bypass, reg5=Mode(0~2), reg7=Mode1 Bypass
  // Mode1: reg8(Threshold), reg9(Attack), reg10(Release), reg11(Ratio), reg12(Knee), reg13(Gain)
  // Mode2/Mode3 寄存器见 BACKGROUND_REG_MAP
  "compressor": {
    // Mode 选择
    MODE:         { regAddr: 5, min: 0, max: 2 },
    // Level/Output/Gain -> Mode1Compressor1Gain (reg13, 0~12dB)
    OUTPUT:       { regAddr: 13, min: 0, max: 12 },
    LEVEL:        { regAddr: 13, min: 0, max: 12 },
    VOLUME:       { regAddr: 13, min: 0, max: 12 },
    // Sensitivity/Threshold -> Mode1CompressorThreshold (reg8, -50~0dBFS)
    SENSITIVITY:  { regAddr: 8, min: 0, max: 50 },
    COMP:         { regAddr: 8, min: 0, max: 50 },
    COMPRESSION:  { regAddr: 8, min: 0, max: 50 },
    SUSTAIN:      { regAddr: 8, min: 0, max: 50 },
    INPUT:        { regAddr: 8, min: 0, max: 50 },
    THRESHOLD:    { regAddr: 8, min: 0, max: 50 },
    // Time knobs
    ATTACK:       { regAddr: 9, min: 0, max: 999 },
    RELEASE:      { regAddr: 10, min: 0, max: 1999 },
    // Ratio -> reg11 (0~40 索引)
    RATIO:        { regAddr: 11, min: 0, max: 40 },
    // SLOPE: dual-register (Ratio+Knee), use reg11 + reg12
    SLOPE:        { regAddr: 11, min: 0, max: 100 },
    // Knee Depth -> reg12 (0~12dB)
    KNEE:         { regAddr: 12, min: 0, max: 12 },
    DEPTH:        { regAddr: 12, min: 0, max: 12 },
  },

  // ── OverDrive (1st OverDrive) ────────────────────────────────────
  // PreOD PEQ1-4 (reg44-47), OD Drive (reg49), DC Offset (reg50), Volume (reg51)
  "overdrive": {
    DRIVE:    { regAddr: 49, min: 0, max: 92 },
    GAIN:     { regAddr: 49, min: 0, max: 92 },
    SUSTAIN:  { regAddr: 49, min: 0, max: 92 },
    LEVEL:    { regAddr: 51, min: 248, max: 288 },
    VOLUME:   { regAddr: 51, min: 248, max: 288 },
    OUTPUT:   { regAddr: 51, min: 248, max: 288 },
    // Tone 旋钮 → PostOD PEQ reg55 (避免被 PRE EQ v3 曲线覆盖成死旋钮)
    TONE:     { regAddr: 55, min: 0, max: 361, isPEQ: true, peqType: PEQ_TYPE.HIGH_SHELF, fixedQ: 16, fixedS: 10 },
    TREBLE:   { regAddr: 55, min: 0, max: 361, isPEQ: true, peqType: PEQ_TYPE.HIGH_SHELF, fixedQ: 16, fixedS: 10 },
    BASS:     { regAddr: 45, min: 0, max: 361, isPEQ: true, peqType: PEQ_TYPE.LOW_SHELF, fixedQ: 16, fixedS: 10 },
    PRESENCE: { regAddr: 47, min: 0, max: 361, isPEQ: true, peqType: PEQ_TYPE.HIGH_SHELF, fixedQ: 16, fixedS: 10 },
    MID:      { regAddr: 46, min: 0, max: 361, isPEQ: true, peqType: PEQ_TYPE.PEAK, fixedQ: 16, fixedS: 10 },
    BLEND:    { regAddr: 50, min: 0, max: 100 },
  },

  // ── Distortion (DIST 段 57-71, 共享 OD 前端 42) ────────────────
  "dist": {
    DISTORTION: { regAddr: 64, min: 0, max: 92 },
    GAIN:       { regAddr: 64, min: 0, max: 92 },
    LEVEL:      { regAddr: 66, min: 248, max: 288 },
    VOLUME:     { regAddr: 66, min: 248, max: 288 },
    OUTPUT:     { regAddr: 66, min: 248, max: 288 },
    // PEQ 旋钮 (PrePEQ 59-62 / PostPEQ 68-71, 具体按子型号公式)
    TONE:     { regAddr: 70, min: 0, max: 0xFFFFFFFF, isPEQ: true, peqType: PEQ_TYPE.PEAK, fixedQ: 16, fixedS: 10 },
    FILTER:   { regAddr: 71, min: 0, max: 0xFFFFFFFF, isPEQ: true, peqType: PEQ_TYPE.LPF_1ST, fixedQ: 16, fixedS: 10 },
    BASS:     { regAddr: 59, min: 0, max: 0xFFFFFFFF, isPEQ: true, peqType: PEQ_TYPE.LOW_SHELF, fixedQ: 16, fixedS: 10 },
    LOW:      { regAddr: 69, min: 0, max: 0xFFFFFFFF, isPEQ: true, peqType: PEQ_TYPE.PEAK, fixedQ: 16, fixedS: 10 },
    MID:      { regAddr: 60, min: 0, max: 0xFFFFFFFF, isPEQ: true, peqType: PEQ_TYPE.PEAK, fixedQ: 16, fixedS: 10 },
    HIGH:     { regAddr: 61, min: 0, max: 0xFFFFFFFF, isPEQ: true, peqType: PEQ_TYPE.PEAK, fixedQ: 16, fixedS: 10 },
    CONTOUR:  { regAddr: 60, min: 0, max: 0xFFFFFFFF, isPEQ: true, peqType: PEQ_TYPE.PEAK, fixedQ: 16, fixedS: 10 },
  },

  // ── Amp Head ─────────────────────────────────────────────────────
  // GAIN/MASTER/VOLUME 由子型号公式处理 (GAIN→Reg79, VOLUME→Reg81, MASTER→Reg239 0.1dB步进)
  // 音色旋钮 → PostOD PEQ (reg83-86, 避免被 PRE EQ v3 曲线覆盖成死旋钮)
  "amp-head": {
    BASS:     { regAddr: 83, min: 0, max: 361, isPEQ: true, peqType: PEQ_TYPE.LOW_SHELF, fixedQ: 16, fixedS: 10 },
    MIDDLE:   { regAddr: 84, min: 0, max: 361, isPEQ: true, peqType: PEQ_TYPE.PEAK, fixedQ: 16, fixedS: 10 },
    MID:      { regAddr: 84, min: 0, max: 361, isPEQ: true, peqType: PEQ_TYPE.PEAK, fixedQ: 16, fixedS: 10 },
    MIDRANGE: { regAddr: 84, min: 0, max: 361, isPEQ: true, peqType: PEQ_TYPE.PEAK, fixedQ: 16, fixedS: 10 },
    "LO-MID": { regAddr: 84, min: 0, max: 361, isPEQ: true, peqType: PEQ_TYPE.PEAK, fixedQ: 16, fixedS: 10 },
    "HI-MID":  { regAddr: 84, min: 0, max: 361, isPEQ: true, peqType: PEQ_TYPE.PEAK, fixedQ: 16, fixedS: 10 },
    "MID-LOW": { regAddr: 84, min: 0, max: 361, isPEQ: true, peqType: PEQ_TYPE.PEAK, fixedQ: 16, fixedS: 10 },
    "MID-HIGH":{ regAddr: 84, min: 0, max: 361, isPEQ: true, peqType: PEQ_TYPE.PEAK, fixedQ: 16, fixedS: 10 },
    TREBLE:   { regAddr: 85, min: 0, max: 361, isPEQ: true, peqType: PEQ_TYPE.HIGH_SHELF, fixedQ: 16, fixedS: 10 },
    PRESENCE: { regAddr: 86, min: 0, max: 361, isPEQ: true, peqType: PEQ_TYPE.HIGH_SHELF, fixedQ: 16, fixedS: 10 },
    TONE:     { regAddr: 85, min: 0, max: 361, isPEQ: true, peqType: PEQ_TYPE.HIGH_SHELF, fixedQ: 16, fixedS: 10 },
    CUT:      { regAddr: 86, min: 0, max: 361, isPEQ: true, peqType: PEQ_TYPE.HIGH_SHELF, fixedQ: 16, fixedS: 10 },
    DEEP:     { regAddr: 86, min: 0, max: 361, isPEQ: true, peqType: PEQ_TYPE.HIGH_SHELF, fixedQ: 16, fixedS: 10 },
    DEPTH:    { regAddr: 86, min: 0, max: 361, isPEQ: true, peqType: PEQ_TYPE.HIGH_SHELF, fixedQ: 16, fixedS: 10 },
    RESONANCE:{ regAddr: 86, min: 0, max: 361, isPEQ: true, peqType: PEQ_TYPE.HIGH_SHELF, fixedQ: 16, fixedS: 10 },
    CONTOUR:  { regAddr: 86, min: 0, max: 361, isPEQ: true, peqType: PEQ_TYPE.HIGH_SHELF, fixedQ: 16, fixedS: 10 },
    SHAPE:    { regAddr: 86, min: 0, max: 361, isPEQ: true, peqType: PEQ_TYPE.HIGH_SHELF, fixedQ: 16, fixedS: 10 },
    BRIGHT:   { regAddr: 85, min: 0, max: 361, isPEQ: true, peqType: PEQ_TYPE.HIGH_SHELF, fixedQ: 16, fixedS: 10 },
    // Mark V 5-Band GEQ -> PostOD PEQ3-7 Gain (reg85-89)
    "80HZ":   { regAddr: 85, min: 0, max: 361, isPEQ: true, peqType: PEQ_TYPE.PEAK, fixedQ: 16, fixedS: 10 },
    "240HZ":  { regAddr: 86, min: 0, max: 361, isPEQ: true, peqType: PEQ_TYPE.PEAK, fixedQ: 16, fixedS: 10 },
    "750HZ":  { regAddr: 87, min: 0, max: 361, isPEQ: true, peqType: PEQ_TYPE.PEAK, fixedQ: 16, fixedS: 10 },
    "2200HZ": { regAddr: 88, min: 0, max: 361, isPEQ: true, peqType: PEQ_TYPE.PEAK, fixedQ: 16, fixedS: 10 },
    "6600HZ": { regAddr: 89, min: 0, max: 361, isPEQ: true, peqType: PEQ_TYPE.PEAK, fixedQ: 16, fixedS: 10 },
  },

  // ── Chorus ────────────────────────────────────────────────────────
  "chorus": {
    LEVEL: { regAddr: 216, min: 0, max: 20 },
    RATE:  { regAddr: 217, min: 0, max: 39 },
    DEPTH: { regAddr: 219, min: 0, max: 9 },
  },

  // ── Delay ─────────────────────────────────────────────────────────
  "delay": {
    FEEDBACK: { regAddr: 222, min: 0, max: 75 },
    REPEAT:   { regAddr: 222, min: 0, max: 75 },
    TIME:     { regAddr: 223, min: 0, max: 500 },
  },

  // ── Reverb ────────────────────────────────────────────────────────
  "reverb": {
    "PRE-DELAY": { regAddr: 225, min: 0, max: 200 },
    DECAY:       { regAddr: 226, min: 0, max: 80 },
    MIX:         { regAddr: 229, min: 0, max: 100 },
    "LOW CUT":   { regAddr: 227, min: 0, max: 205 },
    "HIGH CUT":  { regAddr: 228, min: 0, max: 158 },
  },
};

// ─── 后台寄存器映射表 ──────────────────────────────────────────────
// 记录所有未直接映射到旋钮的寄存器地址，供预设引擎和后续扩展使用
// 基于 寄存器文档1.docx (开发文档 v4.0)
export const BACKGROUND_REG_MAP: Record<string, { regAddr: number; range: string; desc: string }> = {

  // ── Compressor Mode2 (regs 14-20) ──
  'comp-mode2-1-bypass':    { regAddr: 14, range: '0~1', desc: 'Mode2 Comp1 Bypass' },
  'comp-mode2-1-threshold': { regAddr: 15, range: '0~50', desc: 'Mode2 Comp1 Threshold (-50~0dBFS)' },
  'comp-mode2-1-attack':    { regAddr: 16, range: '0~999', desc: 'Mode2 Comp1 Attack (0.1~100ms)' },
  'comp-mode2-1-release':   { regAddr: 17, range: '0~1999', desc: 'Mode2 Comp1 Release (1~2000ms)' },
  'comp-mode2-1-ratio':     { regAddr: 18, range: '0~40', desc: 'Mode2 Comp1 Ratio (1.0~100)' },
  'comp-mode2-1-knee':      { regAddr: 19, range: '0~12', desc: 'Mode2 Comp1 Knee (0~12dB)' },
  'comp-mode2-1-gain':      { regAddr: 20, range: '0~12', desc: 'Mode2 Comp1 Gain (0~12dB)' },
  'comp-mode2-2-bypass':    { regAddr: 21, range: '0~1', desc: 'Mode2 Comp2 Bypass' },
  'comp-mode2-2-threshold': { regAddr: 22, range: '0~50', desc: 'Mode2 Comp2 Threshold (-50~0dBFS)' },
  'comp-mode2-2-attack':    { regAddr: 23, range: '0~999', desc: 'Mode2 Comp2 Attack (0.1~100ms)' },
  'comp-mode2-2-release':   { regAddr: 24, range: '0~1999', desc: 'Mode2 Comp2 Release (1~2000ms)' },
  'comp-mode2-2-ratio':     { regAddr: 25, range: '0~40', desc: 'Mode2 Comp2 Ratio (1.0~100)' },
  'comp-mode2-2-knee':      { regAddr: 26, range: '0~12', desc: 'Mode2 Comp2 Knee (0~12dB)' },
  'comp-mode2-2-gain':      { regAddr: 27, range: '0~12', desc: 'Mode2 Comp2 Gain (0~12dB)' },

  // ── Compressor Mode3 (regs 28-41) ──
  'comp-mode3-1-bypass':    { regAddr: 28, range: '0~1', desc: 'Mode3 Comp1 Bypass' },
  'comp-mode3-1-threshold': { regAddr: 29, range: '0~50', desc: 'Mode3 Comp1 Threshold (-50~0dBFS)' },
  'comp-mode3-1-attack':    { regAddr: 30, range: '0~999', desc: 'Mode3 Comp1 Attack (0.1~100ms)' },
  'comp-mode3-1-release':   { regAddr: 31, range: '0~1999', desc: 'Mode3 Comp1 Release (1~2000ms)' },
  'comp-mode3-1-ratio':     { regAddr: 32, range: '0~40', desc: 'Mode3 Comp1 Ratio (1.0~100)' },
  'comp-mode3-1-knee':      { regAddr: 33, range: '0~12', desc: 'Mode3 Comp1 Knee (0~12dB)' },
  'comp-mode3-1-gain':      { regAddr: 34, range: '0~12', desc: 'Mode3 Comp1 Gain (0~12dB)' },
  'comp-mode3-2-bypass':    { regAddr: 35, range: '0~1', desc: 'Mode3 Comp2 Bypass' },
  'comp-mode3-2-threshold': { regAddr: 36, range: '0~50', desc: 'Mode3 Comp2 Threshold (-50~0dBFS)' },
  'comp-mode3-2-attack':    { regAddr: 37, range: '0~999', desc: 'Mode3 Comp2 Attack (0.1~100ms)' },
  'comp-mode3-2-release':   { regAddr: 38, range: '0~1999', desc: 'Mode3 Comp2 Release (1~2000ms)' },
  'comp-mode3-2-ratio':     { regAddr: 39, range: '0~40', desc: 'Mode3 Comp2 Ratio (1.0~100)' },
  'comp-mode3-2-knee':      { regAddr: 40, range: '0~12', desc: 'Mode3 Comp2 Knee (0~12dB)' },
  'comp-mode3-2-gain':      { regAddr: 41, range: '0~12', desc: 'Mode3 Comp2 Gain (0~12dB)' },

  // ── 1st OverDrive 内部寄存器 ──
  'od-prepeq-bypass':  { regAddr: 43, range: '0~1', desc: 'PreOD 4-Band PEQ Bypass' },
  'od-od-bypass':      { regAddr: 48, range: '0~1', desc: 'OD Bypass (separate from module bypass)' },
  'od-postpeq-bypass': { regAddr: 52, range: '0~1', desc: 'PostOD 4-Band PEQ Bypass' },

  // ── 1st OD DIST 内部寄存器 ──
  'dist-prepeq-bypass':  { regAddr: 58, range: '0~1', desc: 'PreDist 4-Band PEQ Bypass' },
  'dist-dist-bypass':    { regAddr: 63, range: '0~1', desc: 'Dist Bypass (separate from module bypass)' },
  'dist-postpeq-bypass': { regAddr: 67, range: '0~1', desc: 'PostDist 4-Band PEQ Bypass' },

  // ── 2nd OverDrive (regs 72-104) ──
  'od2-bypass':           { regAddr: 72, range: '0~1', desc: '2nd OverDrive Bypass' },
  'od2-prepeq-bypass':    { regAddr: 73, range: '0~1', desc: '2nd OD Pre 4-Band PEQ Bypass' },
  'od2-prepeq1':          { regAddr: 74, range: 'uint32', desc: '2nd OD Pre PEQ1' },
  'od2-prepeq2':          { regAddr: 75, range: 'uint32', desc: '2nd OD Pre PEQ2' },
  'od2-prepeq3':          { regAddr: 76, range: 'uint32', desc: '2nd OD Pre PEQ3' },
  'od2-prepeq4':          { regAddr: 77, range: 'uint32', desc: '2nd OD Pre PEQ4' },
  'od2-od-bypass':        { regAddr: 78, range: '0~1', desc: '2nd OD Bypass' },
  'od2-drive':            { regAddr: 79, range: '0~92', desc: '2nd OD Drive (0~46dB)' },
  'od2-dcoffset':         { regAddr: 80, range: '0~100', desc: '2nd OD DC Offset (-0.50~+0.50)' },
  'od2-volume':           { regAddr: 81, range: '0~288', desc: '2nd OD Volume (-72~0dB)' },
  'od2-postpeq-bypass':   { regAddr: 82, range: '0~1', desc: 'PostOD 16-Band PEQ Bypass' },
  'od2-postpeq1':         { regAddr: 83, range: 'uint32', desc: '2nd OD Post PEQ1' },
  'od2-postpeq2':         { regAddr: 84, range: 'uint32', desc: '2nd OD Post PEQ2' },
  'od2-postpeq3':         { regAddr: 85, range: 'uint32', desc: '2nd OD Post PEQ3' },
  'od2-postpeq4':         { regAddr: 86, range: 'uint32', desc: '2nd OD Post PEQ4' },
  'od2-postpeq5':         { regAddr: 87, range: 'uint32', desc: '2nd OD Post PEQ5' },
  'od2-postpeq6':         { regAddr: 88, range: 'uint32', desc: '2nd OD Post PEQ6' },
  'od2-postpeq7':         { regAddr: 89, range: 'uint32', desc: '2nd OD Post PEQ7' },
  'od2-postpeq8':         { regAddr: 90, range: 'uint32', desc: '2nd OD Post PEQ8' },
  'od2-postpeq9':         { regAddr: 91, range: 'uint32', desc: '2nd OD Post PEQ9' },
  'od2-postpeq10':        { regAddr: 92, range: 'uint32', desc: '2nd OD Post PEQ10' },
  'od2-postpeq11':        { regAddr: 93, range: 'uint32', desc: '2nd OD Post PEQ11' },
  'od2-postpeq12':        { regAddr: 94, range: 'uint32', desc: '2nd OD Post PEQ12' },
  'od2-postpeq13':        { regAddr: 95, range: 'uint32', desc: '2nd OD Post PEQ13' },
  'od2-postpeq14':        { regAddr: 96, range: 'uint32', desc: '2nd OD Post PEQ14' },
  'od2-postpeq15':        { regAddr: 97, range: 'uint32', desc: '2nd OD Post PEQ15' },
  'od2-postpeq16':        { regAddr: 98, range: 'uint32', desc: '2nd OD Post PEQ16' },

  // ── 35-Band PEQ Mode 相关 (regs 105-107) ──
  'peq35-bypass':  { regAddr: 105, range: '0~1', desc: '35-Band PEQ Bypass' },
  'peq35-mode':    { regAddr: 106, range: '0~1', desc: '35-Band PEQ Mode (0=Mode1, 1=Mode2)' },
  'peq35-m1-byp':  { regAddr: 107, range: '0~1', desc: 'Mode1 PEQ Bypass' },

  // ── 35-Band PEQ Mode2 1st PEQ (regs 143-178) ──
  'peq35-m2-1st-byp': { regAddr: 143, range: '0~1', desc: 'Mode2 1st PEQ Bypass' },

  // ── 35-Band PEQ Mode2 2nd PEQ (regs 179-214) ──
  'peq35-m2-2nd-byp': { regAddr: 179, range: '0~1', desc: 'Mode2 2nd PEQ Bypass' },

  // ── Chorus 额外寄存器 ──
  'chorus-rate2':  { regAddr: 218, range: '0~39', desc: 'Chorus Rate2 (0.05~2.00Hz)' },
  'chorus-depth2': { regAddr: 220, range: '0~9', desc: 'Chorus Depth2 (1~10)' },
};

/** 归一化值 → 寄存器值 */
export function normalizedToRegValue(normalized: number, def: ParamDef): number {
  const range = def.max - def.min;
  return Math.round(normalized * range) + def.min;
}

/** 寄存器值 → 归一化值 */
export function regValueToNormalized(regValue: number, def: ParamDef): number {
  const range = def.max - def.min;
  if (range === 0) return 0;
  return Math.max(0, Math.min(1, (regValue - def.min) / range));
}

/** 查找参数定义 (大小写不敏感) */
// ─── 子型号公式引擎 (基于03完整文档) ───────────────────────────────
export interface LinkedParamDef {
  regAddr: number;
  min: number;
  max: number;
  compute?: (norm: number, cur?: number) => number;
  /** 寄存器值 → 旋钮归一化值 (0~1) 回读; 缺失时回退 invertKnob 二分反解 */
  decode?: (regVal: number) => number;
}

/**
 * 箱头旋钮 LUT 查找 (tone_knob_mapping.json) — 位置 0-10 离散 uint32，就近取整
 */
const knobLut = (amp: string, knob: string) => (n: number) => {
  const lut = AMP_KNOB_LUTS[amp]?.[knob];
  if (!lut) return 0;
  return lut.positions[Math.min(10, Math.max(0, Math.round(n * 10)))];
};

/** 子型号公式表：subModelName → knobLabel → LinkedParamDef[] */
const SUB_MODEL_FORMULAS: Record<string, Record<string, LinkedParamDef[]>> = {
  // ═══ 独立 boost (PGA) 模块 ═════════════════════════════════════════
  // PGA 为 I2C 模拟增益 (非寄存器): regAddr=-1 哨兵 → writeModuleParam 路由到 writePGA
  boost: {
    BOOST: [{ regAddr: -1, min: 0, max: 10, compute: (n) => Math.round(n * 10) }],
  },
  // ═══ 过载 (所有 NAM 过载共用, 1st OD PostPEQ reg55) ═════════════
  // TONE 旋钮 → PostOD PEQ reg55, 避免被 PRE EQ v3 曲线覆盖成死旋钮.
  // gainIndex 60~180 对应 -12~+12dB (120=0dB), 中心 0dB 中性.
  "overdrive": {
    TONE:   [{ regAddr: 55, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.round(60 + n * 120), 16, 10) }],
    TREBLE: [{ regAddr: 55, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.round(60 + n * 120), 16, 10) }],
  },
  // ═══ 箱头 (所有 NAM 箱头共用, 2nd OD PostPEQ) ═════════════
  // 箱头本体是 2nd OD (bypass reg72 / drive reg79 / volume reg81), 音色 EQ 走其
  // PostOD PEQ reg83-86 (避免被 PRE EQ v3 曲线覆盖成死旋钮):
  //   BASS  →reg83 (LOW_SHELF)
  //   MIDDLE→reg84 (PEAK)
  //   TREBLE→reg85 (HIGH_SHELF)
  //   PRESENCE→reg86 (HIGH_SHELF)
  // gainIndex 60~180 对应 -12~+12dB (120=0dB), 中心 0dB 中性, 不改变整体曲线.
  // 组合键 "B&F NAM 硬件/位置" 无 BASS/MIDDLE/TREBLE 键,
  // 写入时经 getLegacyLinkedDefs('amp-head') 命中这里.
  "amp-head": {
    // CLEAN: 开 → 只 BYPASS OD(reg78); PrePEQ(reg73) 保持不旁路, 以便套用设计稿 Pre4 段(C5-1). 关 → 写 0 恢复.
    CLEAN: [{ regAddr: 78, min: 0, max: 1, compute: (n) => Math.round(n) }],
    // ★ 2026-10-16 v3 寄存器布局修正（旧值 GAIN→79 / VOLUME→81 会把 GAIN 旋钮写成 DRIVE）：
    //   GAIN=64 · DRIVE=79 · VOL1=66 · VOL2=81 · MASTER=239（权威见 data/_def/ampHeadDef.ts
    //   与 ui2/ampKnobMap.ts）。逐型号的写入请走 data/ampKnobResolve.ts。
    GAIN:   [{ regAddr: 64, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
    DRIVE:  [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
    // ★ 2026-10-26 v3.80：量程统一到唯一权威 VOL_MIN_REG/VOL_MAX_REG（data/ampKnobResolve.ts）
    //   166…288（−30.5…0 dB，0.25 dB/LSB）。旧值 166…286 上限只有 −0.5 dB，
    //   会让「组合键/旧回落路径」永远推不到 0 dB，与 N8 旋钮差 2 LSB。
    VOLUME: [{ regAddr: 66, min: 166, max: 288, compute: (n) => Math.round(166 + n * 122) }],
    VOL1:   [{ regAddr: 66, min: 166, max: 288, compute: (n) => Math.round(166 + n * 122) }],
    VOL2:   [{ regAddr: 81, min: 166, max: 288, compute: (n) => Math.round(166 + n * 122) }],
    MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
    BASS:   [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.round(60 + n * 120), 16, 10) }],
    MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(2000), Math.round(60 + n * 120), 16, 10) }],
    TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.round(60 + n * 120), 16, 10) }],
    TONE:   [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.round(60 + n * 120), 16, 10) }],
    PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.round(60 + n * 120), 16, 10) }],
  },
  // ═══ 压缩器 ═══════════════════════════════════════════════════════
  // G1
  'B&F Dyna Comp': {
    SUSTAIN: [
      { regAddr: 8, min: 0, max: 50, compute: (n) => Math.round(50 - (n * 10) * 4) },
      { regAddr: 11, min: 0, max: 40, compute: (n) => Math.round(5 + (n * 10) * 2) },
    ],
    OUTPUT: [{ regAddr: 13, min: 0, max: 12, compute: (n) => Math.round(n * 12) }],
  },
  // G2
  'B&F CS-2': {
    SUSTAIN: [
      { regAddr: 8, min: 0, max: 50, compute: (n) => Math.round(35 - (n * 10) * 2) },
      { regAddr: 11, min: 0, max: 40, compute: (n) => Math.round(5 + (n * 10) * 2) },
    ],
    LEVEL: [{ regAddr: 13, min: 0, max: 12, compute: (n) => Math.round(n * 12) }],
    ATTACK: [{ regAddr: 9, min: 0, max: 999, compute: (n) => { const ms = 0.1 + n * 49.9; return Math.round((ms - 0.1) / 0.1); } }],
  },
  // G3
  'B&F LA-2A': {
    'PEAK REDUCTION': [
      { regAddr: 8, min: 0, max: 50, compute: (n) => Math.round(50 - (n * 10) * 4) },
      { regAddr: 11, min: 0, max: 40, compute: (n) => Math.round(5 + (n * 10)) },
    ],
    GAIN: [{ regAddr: 13, min: 0, max: 12, compute: (n) => Math.round(n * 12) }],
  },
  // G4
  'B&F 1176 Rev A': {
    INPUT: [{ regAddr: 8, min: 0, max: 50, compute: (n) => Math.round(50 - (n * 10) * 4) }],
    OUTPUT: [{ regAddr: 13, min: 0, max: 12, compute: (n) => Math.round(n * 12) }],
    ATTACK: [{ regAddr: 9, min: 0, max: 999, compute: (n) => { const ms = 0.1 + n * 9.9; return Math.round((ms - 0.1) / 0.1); } }],
    RELEASE: [{ regAddr: 10, min: 0, max: 1999, compute: (n) => { const ms = 50 + n * 1050; return Math.round(ms - 1); } }],
    RATIO: [{ regAddr: 11, min: 0, max: 40, compute: (n) => { const ratios = [4,8,12,20]; const r = ratios[Math.round(n*(ratios.length-1))]; return ratioToIndex(r); } }],
  },
  // G5
  'B&F LA-3A': {
    'PEAK REDUCTION': [
      { regAddr: 8, min: 0, max: 50, compute: (n) => Math.round(50 - (n * 10) * 4) },
      { regAddr: 11, min: 0, max: 40, compute: (n) => Math.round(5 + (n * 10)) },
    ],
    GAIN: [{ regAddr: 13, min: 0, max: 12, compute: (n) => Math.round(n * 12) }],
  },
  // G6
  'B&F 160': {
    COMPRESSION: [
      { regAddr: 8, min: 0, max: 50, compute: (n) => Math.round(50 - (n * 10) * 4) },
      { regAddr: 11, min: 0, max: 40, compute: (n) => Math.round(10 + (n * 10) * 3) },
    ],
    GAIN: [{ regAddr: 13, min: 0, max: 12, compute: (n) => Math.round(n * 12) }],
  },
  // G7
  'B&F Comp': {
    COMP: [
      { regAddr: 8, min: 0, max: 50, compute: (n) => Math.round(50 - (n * 10) * 4) },
      { regAddr: 11, min: 0, max: 40, compute: (n) => Math.round(5 + (n * 10) * 2) },
    ],
    LEVEL: [{ regAddr: 13, min: 0, max: 12, compute: (n) => Math.round(n * 12) }],
    RESPONSE: [
      { regAddr: 9, min: 0, max: 999, compute: (n) => Math.round((n * 10) * 50) },
      { regAddr: 10, min: 0, max: 1999, compute: (n) => Math.round((n * 10) * 40) },
    ],
  },
  // G8
  'B&F 33609': {
    THRESHOLD: [{ regAddr: 8, min: 0, max: 50, compute: (n) => Math.round(50 - (n * 10) * 4) }],
    ATTACK: [{ regAddr: 9, min: 0, max: 999, compute: (n) => { const ms = 0.1 + n * 49.9; return Math.round((ms - 0.1) / 0.1); } }],
    RECOVERY: [{ regAddr: 10, min: 0, max: 1999, compute: (n) => { const ms = 50 + n * 1950; return Math.round(ms - 1); } }],
    RATIO: [{ regAddr: 11, min: 0, max: 40, compute: (n) => { const ratios = [2,3,4,6,10,20]; const r = ratios[Math.round(n*(ratios.length-1))]; return ratioToIndex(r); } }],
    MAKEUP: [{ regAddr: 13, min: 0, max: 12, compute: (n) => Math.round(n * 12) }],
  },
  // G9
  'B&F Distressor': {
    INPUT: [{ regAddr: 8, min: 0, max: 50, compute: (n) => Math.round(50 - (n * 10) * 4) }],
    OUTPUT: [{ regAddr: 13, min: 0, max: 12, compute: (n) => Math.round(n * 12) }],
    ATTACK: [{ regAddr: 9, min: 0, max: 999, compute: (n) => { const ms = 0.1 + n * 29.9; return Math.round((ms - 0.1) / 0.1); } }],
    RELEASE: [{ regAddr: 10, min: 0, max: 1999, compute: (n) => { const ms = 50 + n * 1950; return Math.round(ms - 1); } }],
    RATIO: [{ regAddr: 11, min: 0, max: 40, compute: (n) => { const ratios = [2,3,4,6,10,20]; const r = ratios[Math.round(n*(ratios.length-1))]; return ratioToIndex(r); } }],
  },
  // G10
  'B&F 3630': {
    THRESHOLD: [{ regAddr: 8, min: 0, max: 50, compute: (n) => Math.round(n * 50) }],
    OUTPUT: [{ regAddr: 13, min: 0, max: 12, compute: (n) => Math.round(n * 12) }],
    ATTACK: [{ regAddr: 9, min: 0, max: 999, compute: (n) => { const ms = 0.1 + n * 199.9; return Math.round((ms - 0.1) / 0.1); } }],
    RELEASE: [{ regAddr: 10, min: 0, max: 1999, compute: (n) => { const ms = 50 + n * 1950; return Math.round(ms - 1); } }],
    RATIO: [{ regAddr: 11, min: 0, max: 40, compute: (n) => ratioToIndex(1 + n * 99) }],
  },
  // B1
  'B&F 163': {
    COMPRESSION: [
      { regAddr: 8, min: 0, max: 50, compute: (n) => Math.round(50 - (n * 10) * 4) },
      { regAddr: 11, min: 0, max: 40, compute: (n) => Math.round(10 + (n * 10) * 3) },
    ],
    GAIN: [{ regAddr: 13, min: 0, max: 12, compute: (n) => Math.round(n * 12) }],
  },
  // B2
  'B&F TLA-50': {
    THRESHOLD: [{ regAddr: 8, min: 0, max: 50, compute: (n) => Math.round(50 - (n * 10) * 4) }],
    ATTACK: [{ regAddr: 9, min: 0, max: 999, compute: (n) => { const ms = 0.1 + n * 49.9; return Math.round((ms - 0.1) / 0.1); } }],
    RELEASE: [{ regAddr: 10, min: 0, max: 1999, compute: (n) => { const ms = 50 + n * 1950; return Math.round(ms - 1); } }],
    RATIO: [{ regAddr: 11, min: 0, max: 40, compute: (n) => ratioToIndex(2 + n * 18) }],
    GAIN: [{ regAddr: 13, min: 0, max: 12, compute: (n) => Math.round(n * 12) }],
  },
  // B3
  'B&F Bassist': {
    THRESHOLD: [{ regAddr: 8, min: 0, max: 50, compute: (n) => Math.round(50 - (n * 10) * 4) }],
    RATIO: [{ regAddr: 11, min: 0, max: 40, compute: (n) => ratioToIndex(1 + n * 99) }],
    GAIN: [{ regAddr: 13, min: 0, max: 12, compute: (n) => Math.round(n * 12) }],
  },
  // B4
  'B&F Vari-Mu': {
    THRESHOLD: [{ regAddr: 8, min: 0, max: 50, compute: (n) => Math.round(50 - (n * 10) * 4) }],
    ATTACK: [{ regAddr: 9, min: 0, max: 999, compute: (n) => { const ms = 0.1 + n * 49.9; return Math.round((ms - 0.1) / 0.1); } }],
    RELEASE: [{ regAddr: 10, min: 0, max: 1999, compute: (n) => { const ms = 50 + n * 1950; return Math.round(ms - 1); } }],
    RATIO: [{ regAddr: 11, min: 0, max: 40, compute: (n) => { const ratios = [1.5,4,10,20]; const r = ratios[Math.round(n*(ratios.length-1))]; return ratioToIndex(r); } }],
    GAIN: [{ regAddr: 13, min: 0, max: 12, compute: (n) => Math.round(n * 12) }],
  },
  // B5
  'B&F Multicomp': {
    THRESHOLD: [{ regAddr: 8, min: 0, max: 50, compute: (n) => Math.round(50 - (n * 10) * 4) }],
    RATIO: [{ regAddr: 11, min: 0, max: 40, compute: (n) => { const ratios = [1,2,3,5]; const r = ratios[Math.round(n*(ratios.length-1))]; return ratioToIndex(r); } }],
    GAIN: [{ regAddr: 13, min: 0, max: 12, compute: (n) => Math.round(n * 12) }],
  },
  'B&F Deluxe Reverb': {
    GAIN: [{ regAddr: 79, min: 0, max: 5, compute: (n) => Math.round(n * 5) }],
    VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
    BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: knobLut('B&F Deluxe Reverb', 'BASS') }],
    MID: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: knobLut('B&F Deluxe Reverb', 'MID') }],
    TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: knobLut('B&F Deluxe Reverb', 'TREBLE') }],
    PRESENCE: [{ regAddr: 91, min: 0, max: 0xFFFFFFFF, compute: knobLut('B&F Deluxe Reverb', 'PRESENCE') }],
    MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  },

  'B&F Twin Reverb': {
    GAIN: [{ regAddr: 79, min: 0, max: 5, compute: (n) => Math.round(n * 5) }],
    VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
    BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: knobLut('B&F Twin Reverb', 'BASS') }],
    MID: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: knobLut('B&F Twin Reverb', 'MID') }],
    TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: knobLut('B&F Twin Reverb', 'TREBLE') }],
    PRESENCE: [{ regAddr: 91, min: 0, max: 0xFFFFFFFF, compute: knobLut('B&F Twin Reverb', 'PRESENCE') }],
    MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  },

  'B&F Bassman 5F6-A': {
    GAIN: [{ regAddr: 79, min: 0, max: 5, compute: (n) => Math.round(n * 5) }],
    VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
    BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: knobLut('B&F Bassman 5F6-A', 'BASS') }],
    MID: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: knobLut('B&F Bassman 5F6-A', 'MID') }],
    TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: knobLut('B&F Bassman 5F6-A', 'TREBLE') }],
    PRESENCE: [{ regAddr: 91, min: 0, max: 0xFFFFFFFF, compute: knobLut('B&F Bassman 5F6-A', 'PRESENCE') }],
    MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  },

  'B&F 1959 SLP': {
    GAIN: [{ regAddr: 79, min: 0, max: 60, compute: (n) => Math.round(n * 60) }],
    VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
    BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: knobLut('B&F 1959 SLP', 'BASS') }],
    MID: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: knobLut('B&F 1959 SLP', 'MID') }],
    TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: knobLut('B&F 1959 SLP', 'TREBLE') }],
    PRESENCE: [{ regAddr: 91, min: 0, max: 0xFFFFFFFF, compute: knobLut('B&F 1959 SLP', 'PRESENCE') }],
    MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  },

  'B&F JCM800': {
    GAIN: [{ regAddr: 79, min: 0, max: 70, compute: (n) => Math.round(n * 70) }],
    VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
    BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: knobLut('B&F JCM800', 'BASS') }],
    MID: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: knobLut('B&F JCM800', 'MID') }],
    TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: knobLut('B&F JCM800', 'TREBLE') }],
    PRESENCE: [{ regAddr: 91, min: 0, max: 0xFFFFFFFF, compute: knobLut('B&F JCM800', 'PRESENCE') }],
    MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  },

  'B&F JCM900': {
    GAIN: [{ regAddr: 79, min: 0, max: 70, compute: (n) => Math.round(n * 70) }],
    VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
    BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: knobLut('B&F JCM900', 'BASS') }],
    MID: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: knobLut('B&F JCM900', 'MID') }],
    TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: knobLut('B&F JCM900', 'TREBLE') }],
    PRESENCE: [{ regAddr: 91, min: 0, max: 0xFFFFFFFF, compute: knobLut('B&F JCM900', 'PRESENCE') }],
    MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  },

  'B&F Jubilee': {
    GAIN: [{ regAddr: 79, min: 0, max: 70, compute: (n) => Math.round(n * 70) }],
    VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
    BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: knobLut('B&F Jubilee', 'BASS') }],
    MID: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: knobLut('B&F Jubilee', 'MID') }],
    TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: knobLut('B&F Jubilee', 'TREBLE') }],
    PRESENCE: [{ regAddr: 91, min: 0, max: 0xFFFFFFFF, compute: knobLut('B&F Jubilee', 'PRESENCE') }],
    MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  },

  'B&F Dual Rectifier': {
    GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
    VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
    BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: knobLut('B&F Dual Rectifier', 'BASS') }],
    MID: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: knobLut('B&F Dual Rectifier', 'MID') }],
    TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: knobLut('B&F Dual Rectifier', 'TREBLE') }],
    PRESENCE: [{ regAddr: 91, min: 0, max: 0xFFFFFFFF, compute: knobLut('B&F Dual Rectifier', 'PRESENCE') }],
    MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  },

  'B&F Mark V': {
    GAIN: [{ regAddr: 79, min: 0, max: 80, compute: (n) => Math.round(n * 80) }],
    VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
    BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: knobLut('B&F Mark V', 'BASS') }],
    MID: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: knobLut('B&F Mark V', 'MID') }],
    TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: knobLut('B&F Mark V', 'TREBLE') }],
    PRESENCE: [{ regAddr: 91, min: 0, max: 0xFFFFFFFF, compute: knobLut('B&F Mark V', 'PRESENCE') }],
    MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  },

  'B&F AC30 Top Boost': {
    GAIN: [{ regAddr: 79, min: 0, max: 50, compute: (n) => Math.round(n * 50) }],
    VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
    BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: knobLut('B&F AC30 Top Boost', 'BASS') }],
    TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: knobLut('B&F AC30 Top Boost', 'TREBLE') }],
    MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  },

  'B&F AC15 Top Boost': {
    GAIN: [{ regAddr: 79, min: 0, max: 50, compute: (n) => Math.round(n * 50) }],
    VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
    BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: knobLut('B&F AC15 Top Boost', 'BASS') }],
    TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: knobLut('B&F AC15 Top Boost', 'TREBLE') }],
    MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  },

  'B&F SVT-CL': {
    GAIN: [{ regAddr: 79, min: 0, max: 35, compute: (n) => Math.round(n * 35) }],
    VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
    BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: knobLut('B&F SVT-CL', 'BASS') }],
    MID: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: knobLut('B&F SVT-CL', 'MID') }],
    TREBLE: [{ regAddr: 92, min: 0, max: 0xFFFFFFFF, compute: knobLut('B&F SVT-CL', 'TREBLE') }],
    MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  },

  'B&F V-4B': {
    GAIN: [{ regAddr: 79, min: 0, max: 35, compute: (n) => Math.round(n * 35) }],
    VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
    BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: knobLut('B&F V-4B', 'BASS') }],
    MID: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: knobLut('B&F V-4B', 'MID') }],
    TREBLE: [{ regAddr: 92, min: 0, max: 0xFFFFFFFF, compute: knobLut('B&F V-4B', 'TREBLE') }],
    MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  },

  'B&F 800RB': {
    GAIN: [{ regAddr: 79, min: 0, max: 16, compute: (n) => Math.round(n * 16) }],
    VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
    BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: knobLut('B&F 800RB', 'BASS') }],
    'LO-MID': [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: knobLut('B&F 800RB', 'LO-MID') }],
    'HI-MID': [{ regAddr: 87, min: 0, max: 0xFFFFFFFF, compute: knobLut('B&F 800RB', 'HI-MID') }],
    TREBLE: [{ regAddr: 92, min: 0, max: 0xFFFFFFFF, compute: knobLut('B&F 800RB', 'TREBLE') }],
    MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  },

  'B&F Bass Strategy 400+': {
    GAIN: [{ regAddr: 79, min: 0, max: 35, compute: (n) => Math.round(n * 35) }],
    VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
    BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: knobLut('B&F Bass Strategy 400+', 'BASS') }],
    MID: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: knobLut('B&F Bass Strategy 400+', 'MID') }],
    TREBLE: [{ regAddr: 92, min: 0, max: 0xFFFFFFFF, compute: knobLut('B&F Bass Strategy 400+', 'TREBLE') }],
    PRESENCE: [{ regAddr: 91, min: 0, max: 0xFFFFFFFF, compute: knobLut('B&F Bass Strategy 400+', 'PRESENCE') }],
    MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  },

  'B&F CTM-300': {
    GAIN: [{ regAddr: 79, min: 0, max: 35, compute: (n) => Math.round(n * 35) }],
    VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
    BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: knobLut('B&F CTM-300', 'BASS') }],
    MID: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: knobLut('B&F CTM-300', 'MID') }],
    TREBLE: [{ regAddr: 92, min: 0, max: 0xFFFFFFFF, compute: knobLut('B&F CTM-300', 'TREBLE') }],
    PRESENCE: [{ regAddr: 91, min: 0, max: 0xFFFFFFFF, compute: knobLut('B&F CTM-300', 'PRESENCE') }],
    MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  },

  'B&F MC275': {
    GAIN: [{ regAddr: 79, min: 0, max: 12, compute: (n) => Math.round(n * 12) }],
    VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
    MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  },

  'B&F VT60': {
    GAIN: [{ regAddr: 79, min: 0, max: 12, compute: (n) => Math.round(n * 12) }],
    VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
    MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  },

  'B&F 1567A': {
    GAIN: [{ regAddr: 79, min: 0, max: 20, compute: (n) => Math.round(n * 20) }],
    VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
    BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: knobLut('B&F 1567A', 'BASS') }],
    TREBLE: [{ regAddr: 92, min: 0, max: 0xFFFFFFFF, compute: knobLut('B&F 1567A', 'TREBLE') }],
    MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  },

  'B&F CAD-300SE': {
    GAIN: [{ regAddr: 79, min: 0, max: 15, compute: (n) => Math.round(n * 15) }],
    VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
    MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  },

  // ═══ 合唱 (regs 215-220) ═══════════════════════════════════════════
  // 每个旋钮只写主寄存器 (217 Rate1 / 219 Depth1), 消除镜像双写瞬态爆音;
  // 镜像寄存器 (218 Rate2 / 220 Depth2) 由 CHORUS_DEFAULTS.hidden 在型号切换时写固定值
  'CE-2 Standard': {
    RATE: [{ regAddr: 217, min: 0, max: 39, compute: (n) => Math.round(n * 39) }],
    DEPTH: [{ regAddr: 219, min: 0, max: 9, compute: (n) => Math.round(n * 9) }],
    LEVEL: [{ regAddr: 216, min: 0, max: 20, compute: (n) => Math.round(n * 20) }],
  },
  'CE-1 Vintage': {
    RATE: [{ regAddr: 217, min: 0, max: 39, compute: (n) => Math.round(n * 39) }],
    DEPTH: [{ regAddr: 219, min: 0, max: 9, compute: (n) => Math.round(n * 9) }],
    LEVEL: [{ regAddr: 216, min: 0, max: 20, compute: (n) => Math.round(n * 20) }],
  },
  Dimension: {
    RATE: [{ regAddr: 217, min: 0, max: 39, compute: (n) => Math.round(n * 39) }],
    WIDTH: [{ regAddr: 218, min: 0, max: 39, compute: (n) => Math.round(n * 39) }],
    DEPTH: [{ regAddr: 219, min: 0, max: 9, compute: (n) => Math.round(n * 9) }],
    LEVEL: [{ regAddr: 216, min: 0, max: 20, compute: (n) => Math.round(n * 20) }],
  },
  Vibrato: {
    RATE: [{ regAddr: 217, min: 0, max: 39, compute: (n) => Math.round(n * 39) }],
    DEPTH: [{ regAddr: 219, min: 0, max: 9, compute: (n) => Math.round(n * 9) }],
    LEVEL: [{ regAddr: 216, min: 0, max: 20, compute: (n) => Math.round(n * 20) }],
  },
  'Leslie Sim': {
    SPEED: [{ regAddr: 217, min: 0, max: 39, compute: (n) => Math.round(n * 39) }],
    DEPTH: [{ regAddr: 219, min: 0, max: 9, compute: (n) => Math.round(n * 9) }],
    LEVEL: [{ regAddr: 216, min: 0, max: 20, compute: (n) => Math.round(n * 20) }],
  },
  'Subtle Warmth': {
    RATE: [{ regAddr: 217, min: 0, max: 39, compute: (n) => Math.round(n * 39) }],
    DEPTH: [{ regAddr: 219, min: 0, max: 9, compute: (n) => Math.round(n * 9) }],
    LEVEL: [{ regAddr: 216, min: 0, max: 20, compute: (n) => Math.round(n * 20) }],
  },
  'Bass Chorus': {
    RATE: [{ regAddr: 217, min: 0, max: 39, compute: (n) => Math.round(n * 39) }],
    DEPTH: [{ regAddr: 219, min: 0, max: 9, compute: (n) => Math.round(n * 9) }],
    LEVEL: [{ regAddr: 216, min: 0, max: 20, compute: (n) => Math.round(n * 20) }],
  },
  'Bass Vibrato': {
    RATE: [{ regAddr: 217, min: 0, max: 39, compute: (n) => Math.round(n * 39) }],
    DEPTH: [{ regAddr: 219, min: 0, max: 9, compute: (n) => Math.round(n * 9) }],
    LEVEL: [{ regAddr: 216, min: 0, max: 20, compute: (n) => Math.round(n * 20) }],
  },
  // ═══ 混响 (regs 224-229) ═══════════════════════════════════════════
  Spring: {
    DWELL: [{ regAddr: 226, min: 0, max: 80, compute: (n) => Math.round(n * 80) }],
    MIX: [{ regAddr: 229, min: 0, max: 100, compute: (n) => Math.round(n * 100) }],
  },
  Hall: {
    DECAY: [{ regAddr: 226, min: 0, max: 80, compute: (n) => Math.round(n * 80) }],
    MIX: [{ regAddr: 229, min: 0, max: 100, compute: (n) => Math.round(n * 100) }],
    PRE: [{ regAddr: 225, min: 0, max: 200, compute: (n) => Math.round(n * 200) }],
    TONE: [{ regAddr: 228, min: 0, max: 158, compute: (n) => Math.round(n * 158) }],
  },
  Plate: {
    DECAY: [{ regAddr: 226, min: 0, max: 80, compute: (n) => Math.round(n * 80) }],
    MIX: [{ regAddr: 229, min: 0, max: 100, compute: (n) => Math.round(n * 100) }],
    TONE: [{ regAddr: 228, min: 0, max: 158, compute: (n) => Math.round(n * 158) }],
  },
  Room: {
    SIZE: [{ regAddr: 226, min: 0, max: 80, compute: (n) => Math.round(n * 80) }],
    MIX: [{ regAddr: 229, min: 0, max: 100, compute: (n) => Math.round(n * 100) }],
  },
  Ambient: {
    DECAY: [{ regAddr: 226, min: 0, max: 80, compute: (n) => Math.round(n * 80) }],
    MIX: [{ regAddr: 229, min: 0, max: 100, compute: (n) => Math.round(n * 100) }],
    SPREAD: [{ regAddr: 225, min: 0, max: 200, compute: (n) => Math.round(n * 200) }],
  },
  Cathedral: {
    DECAY: [{ regAddr: 226, min: 0, max: 80, compute: (n) => Math.round(n * 80) }],
    MIX: [{ regAddr: 229, min: 0, max: 100, compute: (n) => Math.round(n * 100) }],
    PRE: [{ regAddr: 225, min: 0, max: 200, compute: (n) => Math.round(n * 200) }],
  },
  'Bass Room': {
    SIZE: [{ regAddr: 226, min: 0, max: 80, compute: (n) => Math.round(n * 80) }],
    MIX: [{ regAddr: 229, min: 0, max: 100, compute: (n) => Math.round(n * 100) }],
  },
  'Bass Hall': {
    DECAY: [{ regAddr: 226, min: 0, max: 80, compute: (n) => Math.round(n * 80) }],
    MIX: [{ regAddr: 229, min: 0, max: 100, compute: (n) => Math.round(n * 100) }],
    PRE: [{ regAddr: 225, min: 0, max: 200, compute: (n) => Math.round(n * 200) }],
    TONE: [{ regAddr: 228, min: 0, max: 158, compute: (n) => Math.round(n * 158) }],
  },

  // ─── B&F NAM V4 精选合集 (OD+DIST+箱头+箱体) 两级公式 ────────────────

"B&F NAM Boss BD-2/Boss BD-2": {
  GAIN: [{ regAddr: 49, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 55, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(2080), Math.max(0, Math.min(180, 133 + Math.round((n - 0.5) * 120))), 4, 10) }],
  LEVEL: [{ regAddr: 51, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
},
"B&F NAM Boss BD-2/Boss BD-2_2": {
  GAIN: [{ regAddr: 49, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 55, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(2080), Math.max(0, Math.min(180, 118 + Math.round((n - 0.5) * 120))), 4, 10) }],
  LEVEL: [{ regAddr: 51, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
},
"B&F NAM Boss OD-3/Boss OD-3": {
  GAIN: [{ regAddr: 49, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 55, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(2080), Math.max(0, Math.min(180, 118 + Math.round((n - 0.5) * 120))), 4, 10) }],
  LEVEL: [{ regAddr: 51, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
},
"B&F NAM Boss SD-1/Boss SD-1": {
  DRIVE: [{ regAddr: 49, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 55, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(2080), Math.max(0, Math.min(180, 122 + Math.round((n - 0.5) * 120))), 28, 10) }],
  LEVEL: [{ regAddr: 51, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
},
"B&F NAM Boss SD-1/Boss SD-1_2": {
  DRIVE: [{ regAddr: 49, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 55, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(2080), Math.max(0, Math.min(180, 123 + Math.round((n - 0.5) * 120))), 19, 10) }],
  LEVEL: [{ regAddr: 51, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
},
"B&F NAM Fulltone OCD/Fulltone OCD": {
  DRIVE: [{ regAddr: 49, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 55, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(2080), Math.max(0, Math.min(180, 122 + Math.round((n - 0.5) * 120))), 28, 10) }],
  VOLUME: [{ regAddr: 51, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
},
"B&F NAM Fulltone OCD/Fulltone OCD_2": {
  DRIVE: [{ regAddr: 49, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 55, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(2080), Math.max(0, Math.min(180, 99 + Math.round((n - 0.5) * 120))), 4, 10) }],
  VOLUME: [{ regAddr: 51, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
},
"B&F NAM Horizon Precision Drive/Horizon Precision Drive": {
  DRIVE: [{ regAddr: 49, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TREBLE: [{ regAddr: 55, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(2080), Math.max(0, Math.min(180, 135 + Math.round((n - 0.5) * 120))), 4, 10) }],
  VOLUME: [{ regAddr: 51, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
},
"B&F NAM Horizon Precision Drive/Horizon Precision Drive_2": {
  DRIVE: [{ regAddr: 49, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TREBLE: [{ regAddr: 55, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(2080), Math.max(0, Math.min(180, 114 + Math.round((n - 0.5) * 120))), 4, 10) }],
  VOLUME: [{ regAddr: 51, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
},
"B&F NAM Ibanez TS808/Ibanez TS808": {
  DRIVE: [{ regAddr: 49, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 55, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(2080), Math.max(0, Math.min(180, 130 + Math.round((n - 0.5) * 120))), 4, 10) }],
  LEVEL: [{ regAddr: 51, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
},
"B&F NAM Ibanez TS808/Ibanez TS808_2": {
  DRIVE: [{ regAddr: 49, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 55, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(2080), Math.max(0, Math.min(180, 122 + Math.round((n - 0.5) * 120))), 37, 10) }],
  LEVEL: [{ regAddr: 51, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
},
"B&F NAM Ibanez TS9/Ibanez TS9": {
  DRIVE: [{ regAddr: 49, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 55, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(2080), Math.max(0, Math.min(180, 106 + Math.round((n - 0.5) * 120))), 4, 10) }],
  LEVEL: [{ regAddr: 51, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
},
"B&F NAM Ibanez TS9/Ibanez TS9_2": {
  DRIVE: [{ regAddr: 49, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 55, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(2080), Math.max(0, Math.min(180, 143 + Math.round((n - 0.5) * 120))), 4, 10) }],
  LEVEL: [{ regAddr: 51, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
},
"B&F NAM JHS Morning Glory/JHS Morning Glory": {
  VOLUME: [{ regAddr: 51, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  DRIVE: [{ regAddr: 49, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 55, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(2080), Math.max(0, Math.min(180, 113 + Math.round((n - 0.5) * 120))), 4, 10) }],
},
"B&F NAM JHS Morning Glory/JHS Morning Glory_2": {
  VOLUME: [{ regAddr: 51, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  DRIVE: [{ regAddr: 49, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 55, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(2080), Math.max(0, Math.min(180, 101 + Math.round((n - 0.5) * 120))), 4, 10) }],
},
"B&F NAM Klon Centaur/Klon Centaur": {
  GAIN: [{ regAddr: 49, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TREBLE: [{ regAddr: 55, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(2080), Math.max(0, Math.min(180, 123 + Math.round((n - 0.5) * 120))), 19, 10) }],
  OUTPUT: [{ regAddr: 51, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
},
"B&F NAM Klon Centaur/Klon Centaur_2": {
  GAIN: [{ regAddr: 49, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TREBLE: [{ regAddr: 55, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(2080), Math.max(0, Math.min(180, 83 + Math.round((n - 0.5) * 120))), 4, 10) }],
  OUTPUT: [{ regAddr: 51, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
},
"B&F NAM ProCo RAT/ProCo RAT": {
  DISTORTION: [{ regAddr: 49, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  FILTER: [{ regAddr: 55, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(2080), Math.max(0, Math.min(180, 115 + Math.round((0.5 - n) * 120))), 4, 10) }],
  VOLUME: [{ regAddr: 51, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
},
"B&F NAM ProCo RAT/ProCo RAT_2": {
  DISTORTION: [{ regAddr: 49, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  FILTER: [{ regAddr: 55, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(2080), Math.max(0, Math.min(180, 135 + Math.round((0.5 - n) * 120))), 4, 10) }],
  VOLUME: [{ regAddr: 51, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
},
"B&F NAM Wampler Tumnus/Wampler Tumnus": {
  GAIN: [{ regAddr: 49, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  LEVEL: [{ regAddr: 51, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  TREBLE: [{ regAddr: 55, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(2080), Math.max(0, Math.min(180, 96 + Math.round((n - 0.5) * 120))), 4, 10) }],
},
"B&F NAM Aguilar Tone Hammer/Aguilar Tone Hammer": {
  DRIVE: [{ regAddr: 49, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  BASS: [{ regAddr: 54, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(260), Math.max(0, Math.min(180, 140 + Math.round((n - 0.5) * 120))), 4, 10) }],
  TREBLE: [{ regAddr: 55, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(2080), Math.max(0, Math.min(180, 103 + Math.round((n - 0.5) * 120))), 4, 10) }],
  LEVEL: [{ regAddr: 51, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
},
"B&F NAM Aguilar Tone Hammer/Aguilar Tone Hammer_2": {
  DRIVE: [{ regAddr: 49, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  BASS: [{ regAddr: 54, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(260), Math.max(0, Math.min(180, 136 + Math.round((n - 0.5) * 120))), 4, 10) }],
  TREBLE: [{ regAddr: 55, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(2080), Math.max(0, Math.min(180, 136 + Math.round((n - 0.5) * 120))), 19, 10) }],
  LEVEL: [{ regAddr: 51, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
},
"B&F NAM Darkglass B3K/Darkglass B3K": {
  DRIVE: [{ regAddr: 49, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  LEVEL: [{ regAddr: 51, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  TREBLE: [{ regAddr: 55, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(2080), Math.max(0, Math.min(180, 137 + Math.round((n - 0.5) * 120))), 28, 10) }],
  BASS: [{ regAddr: 54, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(260), Math.max(0, Math.min(180, 155 + Math.round((n - 0.5) * 120))), 12, 10) }],
},
"B&F NAM EHX Bass Soul Food/EHX Bass Soul Food": {
  VOLUME: [{ regAddr: 51, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  TREBLE: [{ regAddr: 55, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(2080), Math.max(0, Math.min(180, 152 + Math.round((n - 0.5) * 120))), 4, 10) }],
  DRIVE: [{ regAddr: 49, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
},
"B&F NAM MXR M80/MXR M80": {
  DRIVE: [{ regAddr: 49, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  LOW: [{ regAddr: 54, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(260), Math.max(0, Math.min(180, 150 + Math.round((n - 0.5) * 120))), 4, 10) }],
  HIGH: [{ regAddr: 55, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(2080), Math.max(0, Math.min(180, 106 + Math.round((n - 0.5) * 120))), 4, 10) }],
  LEVEL: [{ regAddr: 51, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
},
"B&F NAM MXR M80/MXR M80_2": {
  DRIVE: [{ regAddr: 49, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  LOW: [{ regAddr: 54, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(260), Math.max(0, Math.min(180, 144 + Math.round((n - 0.5) * 120))), 4, 10) }],
  HIGH: [{ regAddr: 55, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(2080), Math.max(0, Math.min(180, 135 + Math.round((n - 0.5) * 120))), 4, 10) }],
  LEVEL: [{ regAddr: 51, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
},
"B&F NAM Origin BASSRIG/Origin BASSRIG": {
  DRIVE: [{ regAddr: 49, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  BASS: [{ regAddr: 54, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(260), Math.max(0, Math.min(180, 115 + Math.round((n - 0.5) * 120))), 12, 10) }],
  TREBLE: [{ regAddr: 55, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(2080), Math.max(0, Math.min(180, 122 + Math.round((n - 0.5) * 120))), 4, 10) }],
  MASTER: [{ regAddr: 51, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
},
"B&F NAM Tech21 SansAmp/Tech21 SansAmp": {
  DRIVE: [{ regAddr: 49, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  PRESENCE: [{ regAddr: 55, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(2080), Math.max(0, Math.min(180, 166 + Math.round((n - 0.5) * 120))), 28, 10) }],
  DEEP: [{ regAddr: 54, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(260), Math.max(0, Math.min(180, 100 + Math.round((n - 0.5) * 120))), 4, 10) }],
  LEVEL: [{ regAddr: 51, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
},
"B&F NAM Tech21 SansAmp/Tech21 SansAmp_2": {
  DRIVE: [{ regAddr: 49, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  PRESENCE: [{ regAddr: 55, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(2080), Math.max(0, Math.min(180, 131 + Math.round((n - 0.5) * 120))), 28, 10) }],
  DEEP: [{ regAddr: 54, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(260), Math.max(0, Math.min(180, 112 + Math.round((n - 0.5) * 120))), 12, 10) }],
  LEVEL: [{ regAddr: 51, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
},
"B&F NAM Boss DS-1/Boss DS-1_2": {
  DISTORTION: [{ regAddr: 64, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 70, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(2080), Math.max(0, Math.min(180, 113 + Math.round((n - 0.5) * 120))), 4, 10) }],
  LEVEL: [{ regAddr: 66, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
},
"B&F NAM Boss DS-1/Boss DS-1": {
  DISTORTION: [{ regAddr: 64, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 70, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(2080), Math.max(0, Math.min(180, 152 + Math.round((n - 0.5) * 120))), 4, 10) }],
  LEVEL: [{ regAddr: 66, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
},
"B&F NAM Boss DS-2/Boss DS-2": {
  DISTORTION: [{ regAddr: 64, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 70, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(2080), Math.max(0, Math.min(180, 117 + Math.round((n - 0.5) * 120))), 4, 10) }],
  LEVEL: [{ regAddr: 66, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
},
"B&F NAM Boss HM-2/Boss HM-2_2": {
  DISTORTION: [{ regAddr: 64, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  HIGH: [{ regAddr: 70, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(2080), Math.max(0, Math.min(180, 163 + Math.round((n - 0.5) * 120))), 4, 10) }],
  LOW: [{ regAddr: 68, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(33.1), Math.max(0, Math.min(180, 60 + Math.round((n - 0.5) * 120))), 4, 10) }],
  LEVEL: [{ regAddr: 66, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
},
"B&F NAM Boss HM-2/Boss HM-2": {
  DISTORTION: [{ regAddr: 64, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  HIGH: [{ regAddr: 70, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(2080), Math.max(0, Math.min(180, 160 + Math.round((n - 0.5) * 120))), 4, 10) }],
  LOW: [{ regAddr: 68, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(33.1), Math.max(0, Math.min(180, 49 + Math.round((n - 0.5) * 120))), 16, 10) }],
  LEVEL: [{ regAddr: 66, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
},
"B&F NAM Boss MT-2/Boss MT-2_2": {
  DISTORTION: [{ regAddr: 64, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  LOW: [{ regAddr: 59, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HPF_1ST, mt2LowFreq(n), 120, 10, 0), decode: (v) => mt2DetentNorm(PEQ_FREQ_TABLE[parsePEQData(v).freq] ?? 0, MT2_LOW_DETENTS) }],
  HIGH: [{ regAddr: 62, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LPF_1ST, mt2HighFreq(n), 120, 10, 0), decode: (v) => mt2DetentNorm(PEQ_FREQ_TABLE[parsePEQData(v).freq] ?? 0, MT2_HIGH_DETENTS) }],
  MID: [{ regAddr: 60, min: 0, max: 0xFFFFFFFF, compute: mt2MidCompute, decode: (v) => { const g = parsePEQData(v).gain; return Math.min(1, Math.max(0, (g - 120) / 120 + 0.5)); } }],
  'MID FREQ': [{ regAddr: 60, min: 0, max: 0xFFFFFFFF, compute: mt2MidFreqCompute, decode: (v) => mt2DetentNorm(PEQ_FREQ_TABLE[parsePEQData(v).freq] ?? 0, MT2_MIDFREQ_DETENTS) }],
  LEVEL: [{ regAddr: 66, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
},
"B&F NAM Boss MT-2/Boss MT-2": {
  DISTORTION: [{ regAddr: 64, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  LOW: [{ regAddr: 59, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HPF_1ST, mt2LowFreq(n), 120, 10, 0), decode: (v) => mt2DetentNorm(PEQ_FREQ_TABLE[parsePEQData(v).freq] ?? 0, MT2_LOW_DETENTS) }],
  HIGH: [{ regAddr: 62, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LPF_1ST, mt2HighFreq(n), 120, 10, 0), decode: (v) => mt2DetentNorm(PEQ_FREQ_TABLE[parsePEQData(v).freq] ?? 0, MT2_HIGH_DETENTS) }],
  MID: [{ regAddr: 60, min: 0, max: 0xFFFFFFFF, compute: mt2MidCompute, decode: (v) => { const g = parsePEQData(v).gain; return Math.min(1, Math.max(0, (g - 120) / 120 + 0.5)); } }],
  'MID FREQ': [{ regAddr: 60, min: 0, max: 0xFFFFFFFF, compute: mt2MidFreqCompute, decode: (v) => mt2DetentNorm(PEQ_FREQ_TABLE[parsePEQData(v).freq] ?? 0, MT2_MIDFREQ_DETENTS) }],
  LEVEL: [{ regAddr: 66, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
},
"B&F NAM Boss OS-2/Boss OS-2": {
  DISTORTION: [{ regAddr: 64, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 70, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(2080), Math.max(0, Math.min(180, 145 + Math.round((n - 0.5) * 120))), 4, 10) }],
  LEVEL: [{ regAddr: 66, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
},
"B&F NAM MXR Distortion+/MXR Distortion+_2": {
  DISTORTION: [{ regAddr: 64, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 66, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
},
"B&F NAM MXR Distortion+/MXR Distortion+": {
  DISTORTION: [{ regAddr: 64, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 66, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
},
"B&F NAM EHX Big Muff/EHX Big Muff_2": {
  DISTORTION: [{ regAddr: 64, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  SCOOP: [{ regAddr: 69, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(260), Math.max(0, Math.min(180, 113 + Math.round((n - 0.5) * 120))), 37, 10) }],
  LEVEL: [{ regAddr: 66, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
},
"B&F NAM EHX Big Muff/EHX Big Muff": {
  DISTORTION: [{ regAddr: 64, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  SCOOP: [{ regAddr: 69, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(260), Math.max(0, Math.min(180, 146 + Math.round((n - 0.5) * 120))), 12, 10) }],
  LEVEL: [{ regAddr: 66, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
},
"B&F NAM Behringer Brassmaster/Behringer Brassmaster": {
  DISTORTION: [{ regAddr: 64, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 70, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(2080), Math.max(0, Math.min(180, 122 + Math.round((n - 0.5) * 120))), 4, 10) }],
  LEVEL: [{ regAddr: 66, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
},
"B&F NAM Darkglass X7/Darkglass X7_2": {
  DISTORTION: [{ regAddr: 64, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 70, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(2080), Math.max(0, Math.min(180, 46 + Math.round((n - 0.5) * 120))), 4, 10) }],
  LEVEL: [{ regAddr: 66, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
},
"B&F NAM Darkglass X7/Darkglass X7": {
  DISTORTION: [{ regAddr: 64, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 70, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(2080), Math.max(0, Math.min(180, 112 + Math.round((n - 0.5) * 120))), 4, 10) }],
  LEVEL: [{ regAddr: 66, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
},
"B&F NAM EHX Bass Big Muff/EHX Bass Big Muff_2": {
  DISTORTION: [{ regAddr: 64, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  SCOOP: [{ regAddr: 69, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(260), Math.max(0, Math.min(180, 141 + Math.round((n - 0.5) * 120))), 4, 10) }],
  LEVEL: [{ regAddr: 66, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
},
"B&F NAM EHX Bass Big Muff/EHX Bass Big Muff": {
  DISTORTION: [{ regAddr: 64, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  SCOOP: [{ regAddr: 69, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(260), Math.max(0, Math.min(180, 126 + Math.round((n - 0.5) * 120))), 12, 10) }],
  LEVEL: [{ regAddr: 66, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
},
"B&F NAM Way Huge Pork & Pickle/Way Huge Pork & Pickle_2": {
  DISTORTION: [{ regAddr: 64, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 70, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(2080), Math.max(0, Math.min(180, 130 + Math.round((n - 0.5) * 120))), 4, 10) }],
  LEVEL: [{ regAddr: 66, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
},
"B&F NAM Way Huge Pork & Pickle/Way Huge Pork & Pickle": {
  DISTORTION: [{ regAddr: 64, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 70, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(2080), Math.max(0, Math.min(180, 100 + Math.round((n - 0.5) * 120))), 4, 10) }],
  LEVEL: [{ regAddr: 66, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
},
"B&F NAM ZVEX Mastotron/ZVEX Mastotron": {
  DISTORTION: [{ regAddr: 64, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 70, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(2080), Math.max(0, Math.min(180, 88 + Math.round((n - 0.5) * 120))), 4, 10) }],
  LEVEL: [{ regAddr: 66, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
},
"B&F NAM Ampeg B-18N/Ampeg B-18N": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 113 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 114 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 145 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 124 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM Ampeg SVT-4/Ampeg SVT-4": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 133 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 81 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 131 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 102 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM Ampeg SVT-CL/Ampeg SVT-CL": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 115 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 65 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 115 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 29 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM Ampeg V2/Ampeg V2": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 86 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 122 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 130 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 135 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM Ampeg V4B/Ampeg V4B": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 96 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 70 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 104 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 120 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM Bogner Ecstasy/Bogner Ecstasy_2": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 121 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 110 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 125 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 122 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM Bogner Ecstasy/Bogner Ecstasy": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 100 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 108 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 128 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 113 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM Bogner Uberschall/Bogner Uberschall_2": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 123 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 107 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 130 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 146 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM Bogner Uberschall/Bogner Uberschall": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 76 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 65 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 159 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 126 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM Diezel Herbert/Diezel Herbert": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 133 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 61 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 128 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 131 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM Diezel VH4/Diezel VH4_2": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 129 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 85 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 134 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 112 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM Diezel VH4/Diezel VH4": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 101 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 88 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 111 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 65 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM Dumble ODS/Dumble ODS_2": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 27 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 113 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 128 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 133 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM Dumble ODS/Dumble ODS": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 77 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 122 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 133 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 133 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM ENGL Fireball/ENGL Fireball_2": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 133 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 62 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 137 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 79 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM ENGL Fireball/ENGL Fireball": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 129 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 101 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 140 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 67 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM ENGL Powerball/ENGL Powerball_2": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 121 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 68 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 123 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 127 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM ENGL Powerball/ENGL Powerball": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 136 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 80 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 115 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 126 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM ENGL Savage/ENGL Savage_2": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 115 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 87 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 109 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 102 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM ENGL Savage/ENGL Savage": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 58 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 104 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 127 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 133 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM EVH 5150III/EVH 5150III_2": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 133 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 113 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 116 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 20 + Math.round((n - 0.5) * 120))), 16, 10) }],
  RESONANCE: [{ regAddr: 87, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(80.3), Math.max(0, Math.min(180, 134 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM EVH 5150III/EVH 5150III": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 138 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 79 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 120 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 124 + Math.round((n - 0.5) * 120))), 16, 10) }],
  RESONANCE: [{ regAddr: 87, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(80.3), Math.max(0, Math.min(180, 136 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM Fender Bassman/Fender Bassman_2": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 120 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 113 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 127 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 121 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM Fender Bassman/Fender Bassman": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 113 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 119 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 128 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 111 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM Fender Champ/Fender Champ": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 87 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 122 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 137 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 137 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM Fender Deluxe Reverb/Fender Deluxe Reverb_2": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 125 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 108 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 124 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 90 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM Fender Deluxe Reverb/Fender Deluxe Reverb": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 23 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 89 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 160 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 148 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM Fender Princeton/Fender Princeton_2": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 118 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 107 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 137 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 140 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM Fender Princeton/Fender Princeton": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 110 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 116 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 126 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 127 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM Fender Super Reverb/Fender Super Reverb_2": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 108 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 116 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 129 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 131 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM Fender Super Reverb/Fender Super Reverb": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 108 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 115 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 127 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 129 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM Fender Twin Reverb/Fender Twin Reverb_2": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 114 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 40 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 148 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 134 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM Fender Twin Reverb/Fender Twin Reverb": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 118 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 109 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 127 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 123 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM Friedman BE/Friedman BE_2": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 117 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 115 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 122 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 118 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM Friedman BE/Friedman BE": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 112 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 95 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 141 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 142 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM Marshall JCM800/Marshall JCM800_2": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 108 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 35 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 160 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 157 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM Marshall JCM800/Marshall JCM800": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 108 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 117 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 129 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 131 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM Marshall JCM900/Marshall JCM900_2": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 108 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 122 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 121 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 79 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM Marshall JCM900/Marshall JCM900": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 124 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 99 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 124 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 115 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM Marshall JTM45/Marshall JTM45_2": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 105 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 78 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 141 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 159 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM Marshall JTM45/Marshall JTM45": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 109 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 119 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 131 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 130 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM Marshall Plexi/Marshall Plexi_2": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 120 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 82 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 126 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 125 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM Marshall Plexi/Marshall Plexi": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 116 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 121 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 121 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 123 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM Mesa Dual Rectifier/Mesa Dual Rectifier_2": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 121 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 103 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 125 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 119 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM Mesa Dual Rectifier/Mesa Dual Rectifier": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 136 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 73 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 121 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 126 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM Mesa Mark/Mesa Mark_2": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 34 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 118 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 73 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 126 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM Mesa Mark/Mesa Mark": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 94 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 123 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 120 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 95 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM Soldano SLO/Soldano SLO_2": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 120 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 98 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 124 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 130 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM Soldano SLO/Soldano SLO": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 104 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 106 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 141 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 111 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM Orange Rockerverb/Orange Rockerverb_2": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 105 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 91 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 141 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 103 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM Orange Rockerverb/Orange Rockerverb": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 122 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 88 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 133 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 96 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM Hiwatt/Hiwatt_2": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 108 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 114 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 133 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 132 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM Hiwatt/Hiwatt": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 118 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 115 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 125 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 122 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM Roland JC120/Roland JC120": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 51 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 81 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 133 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 120 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM Eden/Eden": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 128 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 117 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 89 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 132 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM Gallien-Krueger/Gallien-Krueger_2": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 159 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 119 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 107 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 52 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM Gallien-Krueger/Gallien-Krueger": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 117 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 116 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 120 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 101 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM Hartke/Hartke_2": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 120 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 120 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 120 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 114 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM Hartke/Hartke": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 71 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 84 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 129 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 136 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM Markbass Little Mark/Markbass Little Mark_2": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 138 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 3 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 152 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 127 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM Markbass Little Mark/Markbass Little Mark": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 123 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 103 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 125 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 131 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM PRS Archon/PRS Archon_2": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 134 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 98 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 121 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 116 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM PRS Archon/PRS Archon": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 111 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 111 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 128 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 125 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM Peavey 5150/Peavey 5150_2": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 151 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 81 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 128 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 89 + Math.round((n - 0.5) * 120))), 16, 10) }],
  RESONANCE: [{ regAddr: 87, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(80.3), Math.max(0, Math.min(180, 129 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM Peavey 5150/Peavey 5150": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 110 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 113 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 129 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 125 + Math.round((n - 0.5) * 120))), 16, 10) }],
  RESONANCE: [{ regAddr: 87, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(80.3), Math.max(0, Math.min(180, 126 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM Peavey 6505/Peavey 6505_2": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 86 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 93 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 156 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 149 + Math.round((n - 0.5) * 120))), 16, 10) }],
  RESONANCE: [{ regAddr: 87, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(80.3), Math.max(0, Math.min(180, 134 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM Peavey 6505/Peavey 6505": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 3 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 110 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 147 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 154 + Math.round((n - 0.5) * 120))), 16, 10) }],
  RESONANCE: [{ regAddr: 87, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(80.3), Math.max(0, Math.min(180, 141 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM Fender Hot Rod/Fender Hot Rod_2": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 100 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 109 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 138 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 127 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM Fender Hot Rod/Fender Hot Rod": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 120 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 86 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 140 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 127 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM Vox AC15/Vox AC15_2": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 104 + Math.round((n - 0.5) * 120))), 16, 10) }],
  TREBLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 133 + Math.round((n - 0.5) * 120))), 10, 10) }],
  CUT: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(8000), Math.max(0, Math.min(180, 120 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM Vox AC15/Vox AC15": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 106 + Math.round((n - 0.5) * 120))), 16, 10) }],
  TREBLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 146 + Math.round((n - 0.5) * 120))), 10, 10) }],
  CUT: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(8000), Math.max(0, Math.min(180, 120 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM Vox AC30/Vox AC30_2": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 45 + Math.round((n - 0.5) * 120))), 16, 10) }],
  TREBLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 154 + Math.round((n - 0.5) * 120))), 10, 10) }],
  CUT: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(8000), Math.max(0, Math.min(180, 120 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM Vox AC30/Vox AC30": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 117 + Math.round((n - 0.5) * 120))), 16, 10) }],
  TREBLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 115 + Math.round((n - 0.5) * 120))), 10, 10) }],
  CUT: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(8000), Math.max(0, Math.min(180, 124 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM Xotic BB Preamp/Xotic BB Preamp": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
},
"Analog Delay": {
  TIME:   [{ regAddr: 223, min: 0, max: 250 }],
  REPEAT: [{ regAddr: 222, min: 0, max: 37 }],
},
"Digital Delay": {
  TIME:   [{ regAddr: 223, min: 0, max: 500 }],
  REPEAT: [{ regAddr: 222, min: 0, max: 75 }],
},
"B&F NAM Marshall JVM/Marshall JVM": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 128 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 80 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 125 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 130 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM Marshall JVM/Marshall JVM_2": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 128 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 80 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 125 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 130 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM Marshall JVM/Marshall JVM_3": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 128 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 80 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 125 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 130 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM Marshall JVM/Marshall JVM_4": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 128 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 80 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 125 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 130 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM Marshall JVM/Marshall JVM_5": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 128 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 80 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 125 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 130 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM Marshall JCM2000 DSL/Marshall JCM2000 DSL": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 110 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 118 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 130 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 130 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM Marshall JCM2000 DSL/Marshall JCM2000 DSL_2": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 110 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 118 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 130 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 130 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM Marshall JCM2000 DSL/Marshall JCM2000 DSL_3": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 110 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 118 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 130 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 130 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM Revv Generator/Revv Generator": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 100 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 88 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 126 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 134 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM Revv Generator/Revv Generator_2": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 100 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 88 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 126 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 134 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM Revv Generator/Revv Generator_3": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 100 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 88 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 126 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 134 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM Revv Generator/Revv Generator_4": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 100 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 88 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 126 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 134 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM Revv Generator/Revv Generator_5": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 100 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 88 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 126 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 134 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM Randall Diavlo/Randall Diavlo": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 122 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 72 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 124 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 132 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM Randall Diavlo/Randall Diavlo_2": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 122 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 72 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 124 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 132 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM Randall Diavlo/Randall Diavlo_3": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 122 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 72 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 124 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 132 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM Mesa Triple Rectifier/Mesa Triple Rectifier": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 136 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 68 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 122 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 128 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM Mesa Triple Rectifier/Mesa Triple Rectifier_2": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 136 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 68 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 122 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 128 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM Mesa Triple Rectifier/Mesa Triple Rectifier_3": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 136 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 68 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 122 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 128 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM Mesa Triple Rectifier/Mesa Triple Rectifier_4": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 136 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 68 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 122 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 128 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM Mesa Triple Rectifier/Mesa Triple Rectifier_5": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 136 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 68 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 122 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 128 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM Ampeg V4/Ampeg V4": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 120 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 120 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 118 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 105 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM Ampeg V4/Ampeg V4_2": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 120 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 120 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 118 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 105 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM Ampeg V4/Ampeg V4_3": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 120 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 120 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 118 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 105 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM Ampeg V4/Ampeg V4_4": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 120 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 120 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 118 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 105 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM Ampeg V4/Ampeg V4_5": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 120 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 120 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 118 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 105 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM Ampeg B15/Ampeg B15": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 124 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 116 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 110 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 98 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM Ampeg B15/Ampeg B15_2": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 124 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 116 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 110 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 98 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM Ampeg B15/Ampeg B15_3": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 124 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 116 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 110 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 98 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM Ampeg B15/Ampeg B15_4": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 124 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 116 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 110 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 98 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM Ampeg SVT/Ampeg SVT": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 118 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 128 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 122 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 110 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM Ampeg SVT/Ampeg SVT_2": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 118 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 128 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 122 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 110 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM Ampeg SVT/Ampeg SVT_3": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 118 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 128 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 122 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 110 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM Ampeg SVT/Ampeg SVT_4": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 118 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 128 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 122 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 110 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM Fender Rumble/Fender Rumble": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 116 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 114 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 120 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 120 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM Fender Rumble/Fender Rumble_2": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 116 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 114 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 120 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 120 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM Fender Rumble/Fender Rumble_3": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 116 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 114 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 120 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 120 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM Gallien-Krueger MB150/Gallien-Krueger MB150": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 116 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 118 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 124 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 122 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM Gallien-Krueger MB150/Gallien-Krueger MB150_2": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 116 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 118 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 124 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 122 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM Orange Terror Bass/Orange Terror Bass": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 122 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 122 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 118 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 112 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM Darkglass Microtubes 900/Darkglass Microtubes 900": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 120 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 118 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 122 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 118 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM Mesa Bass 800D/Mesa Bass 800D": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 120 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 116 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 120 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 116 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM Mesa Bass 800D/Mesa Bass 800D_2": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 120 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 116 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 120 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 116 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM Mesa Bass 800D/Mesa Bass 800D_3": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 120 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 116 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 120 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 116 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM Mesa Bass 800D/Mesa Bass 800D_4": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 120 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 116 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 120 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 116 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM Mesa Bass 800D/Mesa Bass 800D_5": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 120 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 116 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 120 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 116 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM Mesa Subway D800/Mesa Subway D800": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 114 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 114 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 122 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 120 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM Mesa Subway D800/Mesa Subway D800_2": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 114 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 114 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 122 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 120 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM Mesa Subway D800/Mesa Subway D800_3": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 114 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 114 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 122 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 120 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM Mesa Subway D800/Mesa Subway D800_4": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 114 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 114 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 122 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 120 + Math.round((n - 0.5) * 120))), 16, 10) }],
},
"B&F NAM Mesa Subway D800/Mesa Subway D800_5": {
  GAIN: [{ regAddr: 79, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  VOLUME: [{ regAddr: 81, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
  MASTER: [{ regAddr: 239, min: 0, max: 500, compute: (n) => Math.round(n * 500) }],
  BASS: [{ regAddr: 83, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(120), Math.max(0, Math.min(180, 114 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MIDDLE: [{ regAddr: 84, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), Math.max(0, Math.min(180, 114 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 85, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(3000), Math.max(0, Math.min(180, 122 + Math.round((n - 0.5) * 120))), 10, 10) }],
  PRESENCE: [{ regAddr: 86, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(5990), Math.max(0, Math.min(180, 120 + Math.round((n - 0.5) * 120))), 16, 10) }],
},"B&F NAM MXR ZW44 Wylde Overdrive/MXR ZW44 Wylde Overdrive": {
  DISTORTION: [{ regAddr: 49, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 55, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(2080), Math.max(0, Math.min(180, 128 + Math.round((n - 0.5) * 120))), 4, 10) }],
  LEVEL: [{ regAddr: 51, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
},
"B&F NAM Seymour Duncan 805/Seymour Duncan 805": {
  DRIVE: [{ regAddr: 49, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 55, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(2080), Math.max(0, Math.min(180, 105 + Math.round((n - 0.5) * 120))), 19, 10) }],
  LEVEL: [{ regAddr: 51, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
},
"B&F NAM Maxon OD808/Maxon OD808": {
  DRIVE: [{ regAddr: 49, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 55, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(2080), Math.max(0, Math.min(180, 118 + Math.round((n - 0.5) * 120))), 4, 10) }],
  LEVEL: [{ regAddr: 51, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
},
"B&F NAM Fortin Dirty Tree/Fortin Dirty Tree": {
  DRIVE: [{ regAddr: 49, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 55, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(2080), Math.max(0, Math.min(180, 95 + Math.round((n - 0.5) * 120))), 28, 10) }],
  LEVEL: [{ regAddr: 51, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
},
"B&F NAM MXR M77/MXR M77": {
  GAIN: [{ regAddr: 49, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 55, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(2080), Math.max(0, Math.min(180, 122 + Math.round((n - 0.5) * 120))), 4, 10) }],
  LEVEL: [{ regAddr: 51, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
},
"B&F NAM Ly Pedals Gladio/Ly Pedals Gladio": {
  DRIVE: [{ regAddr: 49, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 55, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(2080), Math.max(0, Math.min(180, 110 + Math.round((n - 0.5) * 120))), 16, 10) }],
  LEVEL: [{ regAddr: 51, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
},
"B&F NAM Browne Protein/Browne Protein": {
  DRIVE: [{ regAddr: 49, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 55, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(2080), Math.max(0, Math.min(180, 100 + Math.round((n - 0.5) * 120))), 12, 10) }],
  LEVEL: [{ regAddr: 51, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
},
"B&F NAM King of Tone/King of Tone": {
  DRIVE: [{ regAddr: 49, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 55, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(2080), Math.max(0, Math.min(180, 98 + Math.round((n - 0.5) * 120))), 19, 10) }],
  LEVEL: [{ regAddr: 51, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
},
"B&F NAM EarthQuaker Plumes/EarthQuaker Plumes": {
  DRIVE: [{ regAddr: 49, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 55, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(2080), Math.max(0, Math.min(180, 130 + Math.round((n - 0.5) * 120))), 4, 10) }],
  LEVEL: [{ regAddr: 51, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
},
"B&F NAM ProCo Turbo RAT/ProCo Turbo RAT": {
  DISTORTION: [{ regAddr: 49, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  FILTER: [{ regAddr: 55, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(2080), Math.max(0, Math.min(180, 125 + Math.round((0.5 - n) * 120))), 4, 10) }],
  VOLUME: [{ regAddr: 51, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
},
"B&F NAM Fortin Grind/Fortin Grind": {
  DISTORTION: [{ regAddr: 64, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 70, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(2080), Math.max(0, Math.min(180, 115 + Math.round((n - 0.5) * 120))), 16, 10) }],
  LEVEL: [{ regAddr: 66, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
},
"B&F NAM Fortin Meshuggah/Fortin Meshuggah": {
  DISTORTION: [{ regAddr: 64, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 70, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(2080), Math.max(0, Math.min(180, 105 + Math.round((n - 0.5) * 120))), 28, 10) }],
  LEVEL: [{ regAddr: 66, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
},
"B&F NAM Revv G3/Revv G3": {
  DISTORTION: [{ regAddr: 64, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 70, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(2080), Math.max(0, Math.min(180, 125 + Math.round((n - 0.5) * 120))), 4, 10) }],
  LEVEL: [{ regAddr: 66, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
},
"B&F NAM DOD FX56 American Metal/DOD FX56 American Metal": {
  DISTORTION: [{ regAddr: 64, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 70, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(2080), Math.max(0, Math.min(180, 132 + Math.round((n - 0.5) * 120))), 12, 10) }],
  LEVEL: [{ regAddr: 66, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
},
"B&F NAM MXR Rockman X100/MXR Rockman X100": {
  DISTORTION: [{ regAddr: 64, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  TONE: [{ regAddr: 70, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(2080), Math.max(0, Math.min(180, 140 + Math.round((n - 0.5) * 120))), 4, 10) }],
  LEVEL: [{ regAddr: 66, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
},
"B&F NAM Boss Metal Muff/Boss Metal Muff": {
  DISTORTION: [{ regAddr: 64, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  BASS: [{ regAddr: 68, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.LOW_SHELF, freqToIndex(100), Math.max(0, Math.min(180, 115 + Math.round((n - 0.5) * 120))), 16, 10) }],
  MID: [{ regAddr: 69, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(800), Math.max(0, Math.min(180, 110 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 70, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.HIGH_SHELF, freqToIndex(3000), Math.max(0, Math.min(180, 125 + Math.round((n - 0.5) * 120))), 16, 10) }],
  LEVEL: [{ regAddr: 66, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
},
"B&F NAM Darkglass B7K Ultra/Darkglass B7K Ultra": {
  DISTORTION: [{ regAddr: 64, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  BASS: [{ regAddr: 68, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(250), Math.max(0, Math.min(180, 118 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 70, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(2080), Math.max(0, Math.min(180, 125 + Math.round((n - 0.5) * 120))), 10, 10) }],
  LEVEL: [{ regAddr: 66, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
},
"B&F NAM Darkglass Ultra V Bass/Darkglass Ultra V Bass": {
  DISTORTION: [{ regAddr: 64, min: 0, max: 92, compute: (n) => Math.round(n * 92) }],
  BASS: [{ regAddr: 68, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(220), Math.max(0, Math.min(180, 122 + Math.round((n - 0.5) * 120))), 10, 10) }],
  TREBLE: [{ regAddr: 70, min: 0, max: 0xFFFFFFFF, compute: (n) => buildPEQData(PEQ_TYPE.PEAK, freqToIndex(2080), Math.max(0, Math.min(180, 130 + Math.round((n - 0.5) * 120))), 10, 10) }],
  LEVEL: [{ regAddr: 66, min: 0, max: 288, compute: (n) => 248 + Math.round(n * 40) }],
},};

/** PRE EQ 电路特征寄存器 — 恒写入 (regs=PEQ频段, bypass=PRE EQ旁通, values=编码值) */
const SUB_MODEL_PRE_EQ: Record<string, { regs: number[]; bypass: number; values: number[] }> = {
"B&F NAM Boss BD-2/Boss BD-2": { regs: [44, 45, 46, 47], bypass: 43, values: [0x00A78184, 0x50D85538, 0x51076790, 0x5107D8DA] },
"B&F NAM Boss BD-2/Boss BD-2_2": { regs: [44, 45, 46, 47], bypass: 43, values: [0x00A78184, 0x50D85538, 0x51076790, 0x5107D8DA] },
"B&F NAM Boss OD-3/Boss OD-3": { regs: [44, 45, 46, 47], bypass: 43, values: [0x00A7815C, 0x50C874E0, 0x5107B750, 0x00A78965] },
"B&F NAM Boss SD-1/Boss SD-1": { regs: [44, 45, 46, 47], bypass: 43, values: [0x00A781AC, 0x51391660, 0x51071768, 0x00A7891D] },
"B&F NAM Boss SD-1/Boss SD-1_2": { regs: [44, 45, 46, 47], bypass: 43, values: [0x00A781AC, 0x51391660, 0x51071768, 0x00A7891D] },
"B&F NAM Fulltone OCD/Fulltone OCD": { regs: [44, 45, 46, 47], bypass: 43, values: [0x00A7815C, 0x50A804A8, 0x50D736D0, 0x5108092A] },
"B&F NAM Fulltone OCD/Fulltone OCD_2": { regs: [44, 45, 46, 47], bypass: 43, values: [0x00A7815C, 0x50A804A8, 0x50D736D0, 0x5108092A] },
"B&F NAM Horizon Precision Drive/Horizon Precision Drive": { regs: [44, 45, 46, 47], bypass: 43, values: [0x00A7827C, 0x50D71518, 0x510857E0, 0x5108294A] },
"B&F NAM Horizon Precision Drive/Horizon Precision Drive_2": { regs: [44, 45, 46, 47], bypass: 43, values: [0x00A7827C, 0x50D71518, 0x510857E0, 0x5108294A] },
"B&F NAM Ibanez TS808/Ibanez TS808": { regs: [44, 45, 46, 47], bypass: 43, values: [0x00A781F4, 0x50F8F5D8, 0x51071768, 0x00A7891D] },
"B&F NAM Ibanez TS808/Ibanez TS808_2": { regs: [44, 45, 46, 47], bypass: 43, values: [0x00A781F4, 0x50F8F5D8, 0x51071768, 0x00A7891D] },
"B&F NAM Ibanez TS9/Ibanez TS9": { regs: [44, 45, 46, 47], bypass: 43, values: [0x00A781F4, 0x5108F660, 0x51073780, 0x00A78905] },
"B&F NAM Ibanez TS9/Ibanez TS9_2": { regs: [44, 45, 46, 47], bypass: 43, values: [0x00A781F4, 0x5108F660, 0x51073780, 0x00A78905] },
"B&F NAM JHS Morning Glory/JHS Morning Glory": { regs: [44, 45, 46, 47], bypass: 43, values: [0x00A781AC, 0x50A7D4A8, 0x51076720, 0x5108094A] },
"B&F NAM JHS Morning Glory/JHS Morning Glory_2": { regs: [44, 45, 46, 47], bypass: 43, values: [0x00A781AC, 0x50A7D4A8, 0x51076720, 0x5108094A] },
"B&F NAM Klon Centaur/Klon Centaur": { regs: [44, 45, 46, 47], bypass: 43, values: [0x51076279, 0x50A80538, 0x51076720, 0x510738A2] },
"B&F NAM Klon Centaur/Klon Centaur_2": { regs: [44, 45, 46, 47], bypass: 43, values: [0x51076279, 0x50A80538, 0x51076720, 0x510738A2] },
"B&F NAM ProCo RAT/ProCo RAT": { regs: [44, 45, 46, 47], bypass: 43, values: [0x00A78214, 0x50C6E4A8, 0x51082808, 0x51085862] },
"B&F NAM ProCo RAT/ProCo RAT_2": { regs: [44, 45, 46, 47], bypass: 43, values: [0x00A78214, 0x50C6E4A8, 0x51082808, 0x51085862] },
"B&F NAM Wampler Tumnus/Wampler Tumnus": { regs: [44, 45, 46, 47], bypass: 43, values: [0x00A781D4, 0x50B80568, 0x51078708, 0x510788D2] },
"B&F NAM Aguilar Tone Hammer/Aguilar Tone Hammer": { regs: [44, 45, 46, 47], bypass: 43, values: [0x510730B1, 0x50A7D4E0, 0x50A78780, 0x51073902] },
"B&F NAM Aguilar Tone Hammer/Aguilar Tone Hammer_2": { regs: [44, 45, 46, 47], bypass: 43, values: [0x510730B1, 0x50A7D4E0, 0x50A78780, 0x51073902] },
"B&F NAM Darkglass B3K/Darkglass B3K": { regs: [44, 45, 46, 47], bypass: 43, values: [0x510730B1, 0x50A7D540, 0x50A7D780, 0x51073902] },
"B&F NAM EHX Bass Soul Food/EHX Bass Soul Food": { regs: [44, 45, 46, 47], bypass: 43, values: [0x510730B1, 0x50A7D588, 0x50A78780, 0x51073902] },
"B&F NAM MXR M80/MXR M80": { regs: [44, 45, 46, 47], bypass: 43, values: [0x510730B1, 0x50A7D540, 0x50A78780, 0x51073902] },
"B&F NAM MXR M80/MXR M80_2": { regs: [44, 45, 46, 47], bypass: 43, values: [0x510730B1, 0x50A7D540, 0x50A78780, 0x51073902] },
"B&F NAM Origin BASSRIG/Origin BASSRIG": { regs: [44, 45, 46, 47], bypass: 43, values: [0x510730B1, 0x50A7D4E0, 0x50A78780, 0x51078902] },
"B&F NAM Tech21 SansAmp/Tech21 SansAmp": { regs: [44, 45, 46, 47], bypass: 43, values: [0x510730B1, 0x50A7D4E0, 0x50A78780, 0x51078902] },
"B&F NAM Tech21 SansAmp/Tech21 SansAmp_2": { regs: [44, 45, 46, 47], bypass: 43, values: [0x510730B1, 0x50A7D4E0, 0x50A78780, 0x51078902] },
"B&F NAM Boss DS-1/Boss DS-1_2": { regs: [59, 60, 61, 62], bypass: 58, values: [0x00A781AC, 0x50D7D588, 0x510877E0, 0x51087902] },
"B&F NAM Boss DS-1/Boss DS-1": { regs: [59, 60, 61, 62], bypass: 58, values: [0x00A781AC, 0x50D7D588, 0x510877E0, 0x51087902] },
"B&F NAM Boss DS-2/Boss DS-2": { regs: [59, 60, 61, 62], bypass: 58, values: [0x00A78184, 0x50C82568, 0x51080768, 0x5107D8CA] },
"B&F NAM Boss HM-2/Boss HM-2_2": { regs: [59, 60, 61, 62], bypass: 58, values: [0x5108C2A1, 0x50C6E5B0, 0x510877C8, 0x51091912] },
"B&F NAM Boss HM-2/Boss HM-2": { regs: [59, 60, 61, 62], bypass: 58, values: [0x5108C2A1, 0x50C6E5B0, 0x510877C8, 0x51091912] },
"B&F NAM Boss MT-2/Boss MT-2_2": { regs: [59, 60, 61, 62], bypass: 58, values: [0x51087211, 0x50C64540, 0x51082740, 0x5108A8EA] },
"B&F NAM Boss MT-2/Boss MT-2": { regs: [59, 60, 61, 62], bypass: 58, values: [0x51087211, 0x50C64540, 0x51082740, 0x5108A8EA] },
"B&F NAM Boss OS-2/Boss OS-2": { regs: [59, 60, 61, 62], bypass: 58, values: [0x00A781D4, 0x50D80600, 0x510827C8, 0x510808E2] },
"B&F NAM MXR Distortion+/MXR Distortion+_2": { regs: [59, 60, 61, 62], bypass: 58, values: [0x00A7815C, 0x50C854E0, 0x5107B740, 0x00A788ED] },
"B&F NAM MXR Distortion+/MXR Distortion+": { regs: [59, 60, 61, 62], bypass: 58, values: [0x00A7815C, 0x50C854E0, 0x5107B740, 0x00A788ED] },
"B&F NAM EHX Big Muff/EHX Big Muff_2": { regs: [59, 60, 61, 62], bypass: 58, values: [0x5108C279, 0x50C5F4E0, 0x510736E8, 0x00A78845] },
"B&F NAM EHX Big Muff/EHX Big Muff": { regs: [59, 60, 61, 62], bypass: 58, values: [0x5108C279, 0x50C5F4E0, 0x510736E8, 0x00A78845] },
"B&F NAM Behringer Brassmaster/Behringer Brassmaster": { regs: [59, 60, 61, 62], bypass: 58, values: [0x510730B1, 0x50A784E0, 0x50A78780, 0x51073902] },
"B&F NAM Darkglass X7/Darkglass X7_2": { regs: [59, 60, 61, 62], bypass: 58, values: [0x510730B1, 0x50A7D540, 0x50A7D780, 0x51073902] },
"B&F NAM Darkglass X7/Darkglass X7": { regs: [59, 60, 61, 62], bypass: 58, values: [0x510730B1, 0x50A7D540, 0x50A7D780, 0x51073902] },
"B&F NAM EHX Bass Big Muff/EHX Bass Big Muff_2": { regs: [59, 60, 61, 62], bypass: 58, values: [0x5106E0B1, 0x50A784E0, 0x50A78780, 0x5106E902] },
"B&F NAM EHX Bass Big Muff/EHX Bass Big Muff": { regs: [59, 60, 61, 62], bypass: 58, values: [0x5106E0B1, 0x50A784E0, 0x50A78780, 0x5106E902] },
"B&F NAM Way Huge Pork & Pickle/Way Huge Pork & Pickle_2": { regs: [59, 60, 61, 62], bypass: 58, values: [0x510730B1, 0x50A784E0, 0x50A78780, 0x51073902] },
"B&F NAM Way Huge Pork & Pickle/Way Huge Pork & Pickle": { regs: [59, 60, 61, 62], bypass: 58, values: [0x510730B1, 0x50A784E0, 0x50A78780, 0x51073902] },
"B&F NAM ZVEX Mastotron/ZVEX Mastotron": { regs: [59, 60, 61, 62], bypass: 58, values: [0x510730B1, 0x50A784E0, 0x50A78780, 0x51073902] },
"B&F NAM Ampeg B-18N/Ampeg B-18N": { regs: [74, 75, 76, 77], bypass: 73, values: [0x510730B1, 0x50A7D4E0, 0x50A78780, 0x51078902] },
"B&F NAM Ampeg SVT-4/Ampeg SVT-4": { regs: [74, 75, 76, 77], bypass: 73, values: [0x510730B1, 0x50A7D4E0, 0x50A78780, 0x51078902] },
"B&F NAM Ampeg SVT-CL/Ampeg SVT-CL": { regs: [74, 75, 76, 77], bypass: 73, values: [0x510730B1, 0x50A7D4E0, 0x50A78780, 0x51078902] },
"B&F NAM Ampeg V2/Ampeg V2": { regs: [74, 75, 76, 77], bypass: 73, values: [0x510730B1, 0x50A7D4E0, 0x50A78780, 0x51078902] },
"B&F NAM Ampeg V4B/Ampeg V4B": { regs: [74, 75, 76, 77], bypass: 73, values: [0x510730B1, 0x50A7D4E0, 0x50A78780, 0x51078902] },
"B&F NAM Bogner Ecstasy/Bogner Ecstasy_2": { regs: [74, 75, 76, 77], bypass: 73, values: [0x00A78184, 0x50D7D5C8, 0x51078750, 0x51087902] },
"B&F NAM Bogner Ecstasy/Bogner Ecstasy": { regs: [74, 75, 76, 77], bypass: 73, values: [0x00A78184, 0x50D7D5C8, 0x51078750, 0x51087902] },
"B&F NAM Bogner Uberschall/Bogner Uberschall_2": { regs: [74, 75, 76, 77], bypass: 73, values: [0x51087249, 0x50C694A8, 0x51076740, 0x5108A912] },
"B&F NAM Bogner Uberschall/Bogner Uberschall": { regs: [74, 75, 76, 77], bypass: 73, values: [0x51087249, 0x50C694A8, 0x51076740, 0x5108A912] },
"B&F NAM Diezel Herbert/Diezel Herbert": { regs: [74, 75, 76, 77], bypass: 73, values: [0x00A781D4, 0x50C69540, 0x5107B708, 0x51087912] },
"B&F NAM Diezel VH4/Diezel VH4_2": { regs: [74, 75, 76, 77], bypass: 73, values: [0x00A78184, 0x50D735B0, 0x5107D780, 0x5108A932] },
"B&F NAM Diezel VH4/Diezel VH4": { regs: [74, 75, 76, 77], bypass: 73, values: [0x00A78184, 0x50D735B0, 0x5107D780, 0x5108A932] },
"B&F NAM Dumble ODS/Dumble ODS_2": { regs: [74, 75, 76, 77], bypass: 73, values: [0x00A7812C, 0x50C82588, 0x51078740, 0x5108292A] },
"B&F NAM Dumble ODS/Dumble ODS": { regs: [74, 75, 76, 77], bypass: 73, values: [0x00A7812C, 0x50C82588, 0x51078740, 0x5108292A] },
"B&F NAM ENGL Fireball/ENGL Fireball_2": { regs: [74, 75, 76, 77], bypass: 73, values: [0x00A781AC, 0x50D69518, 0x5107D720, 0x5108A92A] },
"B&F NAM ENGL Fireball/ENGL Fireball": { regs: [74, 75, 76, 77], bypass: 73, values: [0x00A781AC, 0x50D69518, 0x5107D720, 0x5108A92A] },
"B&F NAM ENGL Powerball/ENGL Powerball_2": { regs: [74, 75, 76, 77], bypass: 73, values: [0x51087249, 0x50D644E0, 0x51078708, 0x51087912] },
"B&F NAM ENGL Powerball/ENGL Powerball": { regs: [74, 75, 76, 77], bypass: 73, values: [0x51087249, 0x50D644E0, 0x51078708, 0x51087912] },
"B&F NAM ENGL Savage/ENGL Savage_2": { regs: [74, 75, 76, 77], bypass: 73, values: [0x00A78184, 0x50D6E540, 0x51080750, 0x5108790A] },
"B&F NAM ENGL Savage/ENGL Savage": { regs: [74, 75, 76, 77], bypass: 73, values: [0x00A78184, 0x50D6E540, 0x51080750, 0x5108790A] },
"B&F NAM EVH 5150III/EVH 5150III_2": { regs: [74, 75, 76, 77], bypass: 73, values: [0x51082249, 0x50D6C540, 0x5107B740, 0x5108A92A] },
"B&F NAM EVH 5150III/EVH 5150III": { regs: [74, 75, 76, 77], bypass: 73, values: [0x51082249, 0x50D6C540, 0x5107B740, 0x5108A92A] },
"B&F NAM Fender Bassman/Fender Bassman_2": { regs: [74, 75, 76, 77], bypass: 73, values: [0x00A7815C, 0x50D7D588, 0x51076720, 0x510808D2] },
"B&F NAM Fender Bassman/Fender Bassman": { regs: [74, 75, 76, 77], bypass: 73, values: [0x00A7815C, 0x50D7D588, 0x51076720, 0x510808D2] },
"B&F NAM Fender Champ/Fender Champ": { regs: [74, 75, 76, 77], bypass: 73, values: [0x00A7812C, 0x50C825B0, 0x5107B708, 0x00A788A5] },
"B&F NAM Fender Deluxe Reverb/Fender Deluxe Reverb_2": { regs: [74, 75, 76, 77], bypass: 73, values: [0x00A7815C, 0x50D73518, 0x51078750, 0x51082912] },
"B&F NAM Fender Deluxe Reverb/Fender Deluxe Reverb": { regs: [74, 75, 76, 77], bypass: 73, values: [0x00A7815C, 0x50D73518, 0x51078750, 0x51082912] },
"B&F NAM Fender Princeton/Fender Princeton_2": { regs: [74, 75, 76, 77], bypass: 73, values: [0x00A7812C, 0x50D76568, 0x51076720, 0x00A788D5] },
"B&F NAM Fender Princeton/Fender Princeton": { regs: [74, 75, 76, 77], bypass: 73, values: [0x00A7812C, 0x50D76568, 0x51076720, 0x00A788D5] },
"B&F NAM Fender Super Reverb/Fender Super Reverb_2": { regs: [74, 75, 76, 77], bypass: 73, values: [0x00A78184, 0x50D6C4A8, 0x5107B750, 0x5108793A] },
"B&F NAM Fender Super Reverb/Fender Super Reverb": { regs: [74, 75, 76, 77], bypass: 73, values: [0x00A78184, 0x50D6C4A8, 0x5107B750, 0x5108793A] },
"B&F NAM Fender Twin Reverb/Fender Twin Reverb_2": { regs: [74, 75, 76, 77], bypass: 73, values: [0x00A78184, 0x50D6E4A8, 0x51076720, 0x5108592A] },
"B&F NAM Fender Twin Reverb/Fender Twin Reverb": { regs: [74, 75, 76, 77], bypass: 73, values: [0x00A78184, 0x50D6E4A8, 0x51076720, 0x5108592A] },
"B&F NAM Friedman BE/Friedman BE_2": { regs: [74, 75, 76, 77], bypass: 73, values: [0x00A78184, 0x50D805B0, 0x5107B768, 0x51087902] },
"B&F NAM Friedman BE/Friedman BE": { regs: [74, 75, 76, 77], bypass: 73, values: [0x00A78184, 0x50D805B0, 0x5107B768, 0x51087902] },
"B&F NAM Marshall JCM800/Marshall JCM800_2": { regs: [74, 75, 76, 77], bypass: 73, values: [0x00A781AC, 0x50D805E8, 0x5107B768, 0x51087912] },
"B&F NAM Marshall JCM800/Marshall JCM800": { regs: [74, 75, 76, 77], bypass: 73, values: [0x00A781AC, 0x50D805E8, 0x5107B768, 0x51087912] },
"B&F NAM Marshall JCM900/Marshall JCM900_2": { regs: [74, 75, 76, 77], bypass: 73, values: [0x00A781AC, 0x50D82588, 0x51076720, 0x510828D2] },
"B&F NAM Marshall JCM900/Marshall JCM900": { regs: [74, 75, 76, 77], bypass: 73, values: [0x00A781AC, 0x50D82588, 0x51076720, 0x510828D2] },
"B&F NAM Marshall JTM45/Marshall JTM45_2": { regs: [74, 75, 76, 77], bypass: 73, values: [0x00A7815C, 0x50D82568, 0x51078708, 0x5107D88A] },
"B&F NAM Marshall JTM45/Marshall JTM45": { regs: [74, 75, 76, 77], bypass: 73, values: [0x00A7815C, 0x50D82568, 0x51078708, 0x5107D88A] },
"B&F NAM Marshall Plexi/Marshall Plexi_2": { regs: [74, 75, 76, 77], bypass: 73, values: [0x00A78184, 0x50D855B0, 0x5107B740, 0x510858EA] },
"B&F NAM Marshall Plexi/Marshall Plexi": { regs: [74, 75, 76, 77], bypass: 73, values: [0x00A78184, 0x50D855B0, 0x5107B740, 0x510858EA] },
"B&F NAM Mesa Dual Rectifier/Mesa Dual Rectifier_2": { regs: [74, 75, 76, 77], bypass: 73, values: [0x5108C249, 0x50C5F4A8, 0x51078708, 0x51085912] },
"B&F NAM Mesa Dual Rectifier/Mesa Dual Rectifier": { regs: [74, 75, 76, 77], bypass: 73, values: [0x5108C249, 0x50C5F4A8, 0x51078708, 0x51085912] },
"B&F NAM Mesa Mark/Mesa Mark_2": { regs: [74, 75, 76, 77], bypass: 73, values: [0x00A7815C, 0x50D73568, 0x5107D768, 0x5108792A] },
"B&F NAM Mesa Mark/Mesa Mark": { regs: [74, 75, 76, 77], bypass: 73, values: [0x00A7815C, 0x50D73568, 0x5107D768, 0x5108792A] },
"B&F NAM Soldano SLO/Soldano SLO_2": { regs: [74, 75, 76, 77], bypass: 73, values: [0x00A78184, 0x50D7D5C8, 0x5107B768, 0x5108792A] },
"B&F NAM Soldano SLO/Soldano SLO": { regs: [74, 75, 76, 77], bypass: 73, values: [0x00A78184, 0x50D7D5C8, 0x5107B768, 0x5108792A] },
"B&F NAM Orange Rockerverb/Orange Rockerverb_2": { regs: [74, 75, 76, 77], bypass: 73, values: [0x51082249, 0x50C82588, 0x51078720, 0x510808D2] },
"B&F NAM Orange Rockerverb/Orange Rockerverb": { regs: [74, 75, 76, 77], bypass: 73, values: [0x51082249, 0x50C82588, 0x51078720, 0x510808D2] },
"B&F NAM Hiwatt/Hiwatt_2": { regs: [74, 75, 76, 77], bypass: 73, values: [0x00A7815C, 0x50A7B4E0, 0x51078708, 0x5108A94A] },
"B&F NAM Hiwatt/Hiwatt": { regs: [74, 75, 76, 77], bypass: 73, values: [0x00A7815C, 0x50A7B4E0, 0x51078708, 0x5108A94A] },
"B&F NAM Roland JC120/Roland JC120": { regs: [74, 75, 76, 77], bypass: 73, values: [0x00A78184, 0x50A78518, 0x51078720, 0x5108092A] },
"B&F NAM Eden/Eden": { regs: [74, 75, 76, 77], bypass: 73, values: [0x510730B1, 0x50A7D4E0, 0x50A78780, 0x5107D902] },
"B&F NAM Gallien-Krueger/Gallien-Krueger_2": { regs: [74, 75, 76, 77], bypass: 73, values: [0x510730B1, 0x50A7D540, 0x50A78780, 0x5107D902] },
"B&F NAM Gallien-Krueger/Gallien-Krueger": { regs: [74, 75, 76, 77], bypass: 73, values: [0x510730B1, 0x50A7D540, 0x50A78780, 0x5107D902] },
"B&F NAM Hartke/Hartke_2": { regs: [74, 75, 76, 77], bypass: 73, values: [0x510730B1, 0x50A784E0, 0x50A78780, 0x5107D902] },
"B&F NAM Hartke/Hartke": { regs: [74, 75, 76, 77], bypass: 73, values: [0x510730B1, 0x50A784E0, 0x50A78780, 0x5107D902] },
"B&F NAM Markbass Little Mark/Markbass Little Mark_2": { regs: [74, 75, 76, 77], bypass: 73, values: [0x510730B1, 0x50A7D4E0, 0x50A78780, 0x51078902] },
"B&F NAM Markbass Little Mark/Markbass Little Mark": { regs: [74, 75, 76, 77], bypass: 73, values: [0x510730B1, 0x50A7D4E0, 0x50A78780, 0x51078902] },
"B&F NAM PRS Archon/PRS Archon_2": { regs: [74, 75, 76, 77], bypass: 73, values: [0x00A781AC, 0x50D71540, 0x5107D750, 0x51087922] },
"B&F NAM PRS Archon/PRS Archon": { regs: [74, 75, 76, 77], bypass: 73, values: [0x00A781AC, 0x50D71540, 0x5107D750, 0x51087922] },
"B&F NAM Peavey 5150/Peavey 5150_2": { regs: [74, 75, 76, 77], bypass: 73, values: [0x00A781AC, 0x50D6E540, 0x5107D740, 0x5108A922] },
"B&F NAM Peavey 5150/Peavey 5150": { regs: [74, 75, 76, 77], bypass: 73, values: [0x00A781AC, 0x50D6E540, 0x5107D740, 0x5108A922] },
"B&F NAM Peavey 6505/Peavey 6505_2": { regs: [74, 75, 76, 77], bypass: 73, values: [0x00A781AC, 0x50D73588, 0x5107B720, 0x51085902] },
"B&F NAM Peavey 6505/Peavey 6505": { regs: [74, 75, 76, 77], bypass: 73, values: [0x00A781AC, 0x50D73588, 0x5107B720, 0x51085902] },
"B&F NAM Fender Hot Rod/Fender Hot Rod_2": { regs: [74, 75, 76, 77], bypass: 73, values: [0x00A7815C, 0x50D76540, 0x51078780, 0x5108592A] },
"B&F NAM Fender Hot Rod/Fender Hot Rod": { regs: [74, 75, 76, 77], bypass: 73, values: [0x00A7815C, 0x50D76540, 0x51078780, 0x5108592A] },
"B&F NAM Vox AC15/Vox AC15_2": { regs: [74, 75, 76, 77], bypass: 73, values: [0x5107D279, 0x50C82540, 0x5107B750, 0x5108794A] },
"B&F NAM Vox AC15/Vox AC15": { regs: [74, 75, 76, 77], bypass: 73, values: [0x5107D279, 0x50C82540, 0x5107B750, 0x5108794A] },
"B&F NAM Vox AC30/Vox AC30_2": { regs: [74, 75, 76, 77], bypass: 73, values: [0x510802A1, 0x50C854E0, 0x5107B720, 0x5108593A] },
"B&F NAM Vox AC30/Vox AC30": { regs: [74, 75, 76, 77], bypass: 73, values: [0x510802A1, 0x50C854E0, 0x5107B720, 0x5108593A] },
"B&F NAM Xotic BB Preamp/Xotic BB Preamp": { regs: [74, 75, 76, 77], bypass: 73, values: [0x00A78184, 0x50C82540, 0x51078740, 0x5108292A] },
"B&F NAM Marshall JVM/Marshall JVM": { regs: [74, 75, 76, 77], bypass: 73, values: [0x50A7D2F1, 0x50A6E588, 0x50A807E0, 0x50A8298A] },
"B&F NAM Marshall JVM/Marshall JVM_2": { regs: [74, 75, 76, 77], bypass: 73, values: [0x50A7D2F1, 0x50A6E588, 0x50A807E0, 0x50A8298A] },
"B&F NAM Marshall JVM/Marshall JVM_3": { regs: [74, 75, 76, 77], bypass: 73, values: [0x50A7D2F1, 0x50A6E588, 0x50A807E0, 0x50A8298A] },
"B&F NAM Marshall JVM/Marshall JVM_4": { regs: [74, 75, 76, 77], bypass: 73, values: [0x50A7D2F1, 0x50A6E588, 0x50A807E0, 0x50A8298A] },
"B&F NAM Marshall JVM/Marshall JVM_5": { regs: [74, 75, 76, 77], bypass: 73, values: [0x50A7D2F1, 0x50A6E588, 0x50A807E0, 0x50A8298A] },
"B&F NAM Marshall JCM2000 DSL/Marshall JCM2000 DSL": { regs: [74, 75, 76, 77], bypass: 73, values: [0x50A762A1, 0x50A80600, 0x50A7D780, 0x50A7D94A] },
"B&F NAM Marshall JCM2000 DSL/Marshall JCM2000 DSL_2": { regs: [74, 75, 76, 77], bypass: 73, values: [0x50A762A1, 0x50A80600, 0x50A7D780, 0x50A7D94A] },
"B&F NAM Marshall JCM2000 DSL/Marshall JCM2000 DSL_3": { regs: [74, 75, 76, 77], bypass: 73, values: [0x50A762A1, 0x50A80600, 0x50A7D780, 0x50A7D94A] },
"B&F NAM Revv Generator/Revv Generator": { regs: [74, 75, 76, 77], bypass: 73, values: [0x50A7822C, 0x50A70540, 0x50A7D828, 0x50A809C2] },
"B&F NAM Revv Generator/Revv Generator_2": { regs: [74, 75, 76, 77], bypass: 73, values: [0x50A7822C, 0x50A70540, 0x50A7D828, 0x50A809C2] },
"B&F NAM Revv Generator/Revv Generator_3": { regs: [74, 75, 76, 77], bypass: 73, values: [0x50A7822C, 0x50A70540, 0x50A7D828, 0x50A809C2] },
"B&F NAM Revv Generator/Revv Generator_4": { regs: [74, 75, 76, 77], bypass: 73, values: [0x50A7822C, 0x50A70540, 0x50A7D828, 0x50A809C2] },
"B&F NAM Revv Generator/Revv Generator_5": { regs: [74, 75, 76, 77], bypass: 73, values: [0x50A7822C, 0x50A70540, 0x50A7D828, 0x50A809C2] },
"B&F NAM Randall Diavlo/Randall Diavlo": { regs: [74, 75, 76, 77], bypass: 73, values: [0x50A7A279, 0x50A695C8, 0x50A7D7A8, 0x50A8096A] },
"B&F NAM Randall Diavlo/Randall Diavlo_2": { regs: [74, 75, 76, 77], bypass: 73, values: [0x50A7A279, 0x50A695C8, 0x50A7D7A8, 0x50A8096A] },
"B&F NAM Randall Diavlo/Randall Diavlo_3": { regs: [74, 75, 76, 77], bypass: 73, values: [0x50A7A279, 0x50A695C8, 0x50A7D7A8, 0x50A8096A] },
"B&F NAM Mesa Triple Rectifier/Mesa Triple Rectifier": { regs: [74, 75, 76, 77], bypass: 73, values: [0x50A84331, 0x50A66540, 0x50A7D750, 0x50A8096A] },
"B&F NAM Mesa Triple Rectifier/Mesa Triple Rectifier_2": { regs: [74, 75, 76, 77], bypass: 73, values: [0x50A84331, 0x50A66540, 0x50A7D750, 0x50A8096A] },
"B&F NAM Mesa Triple Rectifier/Mesa Triple Rectifier_3": { regs: [74, 75, 76, 77], bypass: 73, values: [0x50A84331, 0x50A66540, 0x50A7D750, 0x50A8096A] },
"B&F NAM Mesa Triple Rectifier/Mesa Triple Rectifier_4": { regs: [74, 75, 76, 77], bypass: 73, values: [0x50A84331, 0x50A66540, 0x50A7D750, 0x50A8096A] },
"B&F NAM Mesa Triple Rectifier/Mesa Triple Rectifier_5": { regs: [74, 75, 76, 77], bypass: 73, values: [0x50A84331, 0x50A66540, 0x50A7D750, 0x50A8096A] },
"B&F NAM Ampeg V4/Ampeg V4": { regs: [74, 75, 76, 77], bypass: 73, values: [0x50A82279, 0x50A805C8, 0x50A7A7E0, 0x50A7A9C2] },
"B&F NAM Ampeg V4/Ampeg V4_2": { regs: [74, 75, 76, 77], bypass: 73, values: [0x50A82279, 0x50A805C8, 0x50A7A7E0, 0x50A7A9C2] },
"B&F NAM Ampeg V4/Ampeg V4_3": { regs: [74, 75, 76, 77], bypass: 73, values: [0x50A82279, 0x50A805C8, 0x50A7A7E0, 0x50A7A9C2] },
"B&F NAM Ampeg V4/Ampeg V4_4": { regs: [74, 75, 76, 77], bypass: 73, values: [0x50A82279, 0x50A805C8, 0x50A7A7E0, 0x50A7A9C2] },
"B&F NAM Ampeg V4/Ampeg V4_5": { regs: [74, 75, 76, 77], bypass: 73, values: [0x50A82279, 0x50A805C8, 0x50A7A7E0, 0x50A7A9C2] },
"B&F NAM Ampeg B15/Ampeg B15": { regs: [74, 75, 76, 77], bypass: 73, values: [0x50A842C9, 0x50A7D588, 0x50A73780, 0x50A7094A] },
"B&F NAM Ampeg B15/Ampeg B15_2": { regs: [74, 75, 76, 77], bypass: 73, values: [0x50A842C9, 0x50A7D588, 0x50A73780, 0x50A7094A] },
"B&F NAM Ampeg B15/Ampeg B15_3": { regs: [74, 75, 76, 77], bypass: 73, values: [0x50A842C9, 0x50A7D588, 0x50A73780, 0x50A7094A] },
"B&F NAM Ampeg B15/Ampeg B15_4": { regs: [74, 75, 76, 77], bypass: 73, values: [0x50A842C9, 0x50A7D588, 0x50A73780, 0x50A7094A] },
"B&F NAM Ampeg SVT/Ampeg SVT": { regs: [74, 75, 76, 77], bypass: 73, values: [0x50A80249, 0x50A87638, 0x50A80828, 0x50A829F2] },
"B&F NAM Ampeg SVT/Ampeg SVT_2": { regs: [74, 75, 76, 77], bypass: 73, values: [0x50A80249, 0x50A87638, 0x50A80828, 0x50A829F2] },
"B&F NAM Ampeg SVT/Ampeg SVT_3": { regs: [74, 75, 76, 77], bypass: 73, values: [0x50A80249, 0x50A87638, 0x50A80828, 0x50A829F2] },
"B&F NAM Ampeg SVT/Ampeg SVT_4": { regs: [74, 75, 76, 77], bypass: 73, values: [0x50A80249, 0x50A87638, 0x50A80828, 0x50A829F2] },
"B&F NAM Fender Rumble/Fender Rumble": { regs: [74, 75, 76, 77], bypass: 73, values: [0x50A7D2A1, 0x50A7A540, 0x50A7A780, 0x50A8098A] },
"B&F NAM Fender Rumble/Fender Rumble_2": { regs: [74, 75, 76, 77], bypass: 73, values: [0x50A7D2A1, 0x50A7A540, 0x50A7A780, 0x50A8098A] },
"B&F NAM Fender Rumble/Fender Rumble_3": { regs: [74, 75, 76, 77], bypass: 73, values: [0x50A7D2A1, 0x50A7A540, 0x50A7A780, 0x50A8098A] },
"B&F NAM Gallien-Krueger MB150/Gallien-Krueger MB150": { regs: [74, 75, 76, 77], bypass: 73, values: [0x50A7D279, 0x50A80600, 0x50A82828, 0x50A849C2] },
"B&F NAM Gallien-Krueger MB150/Gallien-Krueger MB150_2": { regs: [74, 75, 76, 77], bypass: 73, values: [0x50A7D279, 0x50A80600, 0x50A82828, 0x50A849C2] },
"B&F NAM Orange Terror Bass/Orange Terror Bass": { regs: [74, 75, 76, 77], bypass: 73, values: [0x50A822F1, 0x50A825E8, 0x50A7D7E0, 0x50A7D98A] },
"B&F NAM Darkglass Microtubes 900/Darkglass Microtubes 900": { regs: [74, 75, 76, 77], bypass: 73, values: [0x50A80211, 0x50A7D660, 0x50A808A0, 0x50A82A22] },
"B&F NAM Mesa Bass 800D/Mesa Bass 800D": { regs: [74, 75, 76, 77], bypass: 73, values: [0x50A802A1, 0x50A7A5B0, 0x50A7A7E0, 0x50A7D9AA] },
"B&F NAM Mesa Bass 800D/Mesa Bass 800D_2": { regs: [74, 75, 76, 77], bypass: 73, values: [0x50A802A1, 0x50A7A5B0, 0x50A7A7E0, 0x50A7D9AA] },
"B&F NAM Mesa Bass 800D/Mesa Bass 800D_3": { regs: [74, 75, 76, 77], bypass: 73, values: [0x50A802A1, 0x50A7A5B0, 0x50A7A7E0, 0x50A7D9AA] },
"B&F NAM Mesa Bass 800D/Mesa Bass 800D_4": { regs: [74, 75, 76, 77], bypass: 73, values: [0x50A802A1, 0x50A7A5B0, 0x50A7A7E0, 0x50A7D9AA] },
"B&F NAM Mesa Bass 800D/Mesa Bass 800D_5": { regs: [74, 75, 76, 77], bypass: 73, values: [0x50A802A1, 0x50A7A5B0, 0x50A7A7E0, 0x50A7D9AA] },
"B&F NAM Mesa Subway D800/Mesa Subway D800": { regs: [74, 75, 76, 77], bypass: 73, values: [0x50A7A2F1, 0x50A76588, 0x50A80828, 0x50A829C2] },
"B&F NAM Mesa Subway D800/Mesa Subway D800_2": { regs: [74, 75, 76, 77], bypass: 73, values: [0x50A7A2F1, 0x50A76588, 0x50A80828, 0x50A829C2] },
"B&F NAM Mesa Subway D800/Mesa Subway D800_3": { regs: [74, 75, 76, 77], bypass: 73, values: [0x50A7A2F1, 0x50A76588, 0x50A80828, 0x50A829C2] },
"B&F NAM Mesa Subway D800/Mesa Subway D800_4": { regs: [74, 75, 76, 77], bypass: 73, values: [0x50A7A2F1, 0x50A76588, 0x50A80828, 0x50A829C2] },
"B&F NAM Mesa Subway D800/Mesa Subway D800_5": { regs: [74, 75, 76, 77], bypass: 73, values: [0x50A7A2F1, 0x50A76588, 0x50A80828, 0x50A829C2] },"B&F NAM MXR ZW44 Wylde Overdrive/MXR ZW44 Wylde Overdrive": { regs: [44, 45, 46, 47], bypass: 43, values: [0x51082331, 0x50A7D4E0, 0x50A82708, 0x510808B2] },
"B&F NAM Seymour Duncan 805/Seymour Duncan 805": { regs: [44, 45, 46, 47], bypass: 43, values: [0x5107C2F1, 0x50A76468, 0x50A7D6B8, 0x5107D86A] },
"B&F NAM Maxon OD808/Maxon OD808": { regs: [44, 45, 46, 47], bypass: 43, values: [0x00A781D4, 0x50A7A420, 0x50A80750, 0x5107D80A] },
"B&F NAM Fortin Dirty Tree/Fortin Dirty Tree": { regs: [44, 45, 46, 47], bypass: 43, values: [0x00A7815C, 0x50A7C3C0, 0x50A827A8, 0x00A789C5] },
"B&F NAM MXR M77/MXR M77": { regs: [44, 45, 46, 47], bypass: 43, values: [0x510802A1, 0x50A73540, 0x50A80780, 0x51081902] },
"B&F NAM Ly Pedals Gladio/Ly Pedals Gladio": { regs: [44, 45, 46, 47], bypass: 43, values: [0x5107B311, 0x50A7A4A8, 0x50A7C660, 0x5107B88A] },
"B&F NAM Browne Protein/Browne Protein": { regs: [44, 45, 46, 47], bypass: 43, values: [0x5107A2C9, 0x50A79450, 0x50A7B6E8, 0x5107A852] },
"B&F NAM King of Tone/King of Tone": { regs: [44, 45, 46, 47], bypass: 43, values: [0x5107A301, 0x50A77488, 0x50A7A698, 0x5107A87A] },
"B&F NAM EarthQuaker Plumes/EarthQuaker Plumes": { regs: [44, 45, 46, 47], bypass: 43, values: [0x00A781AC, 0x50A7C3E8, 0x50A7E730, 0x5107D8A2] },
"B&F NAM ProCo Turbo RAT/ProCo Turbo RAT": { regs: [44, 45, 46, 47], bypass: 43, values: [0x51081279, 0x50A7A518, 0x50A81768, 0x510828EA] },
"B&F NAM Fortin Grind/Fortin Grind": { regs: [59, 60, 61, 62], bypass: 58, values: [0x00A781AC, 0x50A82518, 0x50A7A708, 0x5107A842] },
"B&F NAM Fortin Meshuggah/Fortin Meshuggah": { regs: [59, 60, 61, 62], bypass: 58, values: [0x00A78184, 0x50A73540, 0x50A7D6B8, 0x51080912] },
"B&F NAM Revv G3/Revv G3": { regs: [59, 60, 61, 62], bypass: 58, values: [0x00A781F4, 0x50A794A8, 0x50A80780, 0x5107D8B2] },
"B&F NAM DOD FX56 American Metal/DOD FX56 American Metal": { regs: [59, 60, 61, 62], bypass: 58, values: [0x510802F1, 0x50A70588, 0x50A80740, 0x510828D2] },
"B&F NAM MXR Rockman X100/MXR Rockman X100": { regs: [59, 60, 61, 62], bypass: 58, values: [0x5107D331, 0x50A735C8, 0x50A827A8, 0x5108492A] },
"B&F NAM Boss Metal Muff/Boss Metal Muff": { regs: [59, 60, 61, 62], bypass: 58, values: [0x510872A1, 0x50A6E600, 0x50A7D720, 0x510848A2] },
"B&F NAM Darkglass B7K Ultra/Darkglass B7K Ultra": { regs: [59, 60, 61, 62], bypass: 58, values: [0x51080249, 0x50A764E0, 0x50A7D750, 0x5107E8B2] },
"B&F NAM Darkglass Ultra V Bass/Darkglass Ultra V Bass": { regs: [59, 60, 61, 62], bypass: 58, values: [0x51082229, 0x50A744A8, 0x50A7C708, 0x510808EA] },};

// ═══ v12 单块参数替换 (2026-09-23) ═══════════════════════════════════════════
// 用 apk_model_params.md 的【标注值】重编码结果覆盖 41 个单块型号的
//   SUB_MODEL_PRE_EQ  → Pre4（权威枚举重编码，已修正 4 处 HPF=4）
//   SUB_MODEL_FORMULAS→ 音色旋钮落 Post4（B1–B4）+ Drive/Volume 基准
// 数据源与校验：tools/gen_pedal_params2.py（闭环校验：324/328 行与源 hex 完全一致，
//   余 4 行仅差 HPF 类型位）。低置信度项见 PEDAL_LOW_CONF。
// 必须在下面的"系列化物化"之前执行，组合键才会拿到新数据。
Object.assign(SUB_MODEL_PRE_EQ, PEDAL_PRE_EQ2);
Object.assign(SUB_MODEL_FORMULAS, PEDAL_FORMULAS2);

// ═══ v13 箱头参数替换 (2026-09-23) ═══════════════════════════════════════════
// 覆盖 78 个箱头 capture 键（B&F NAM <系列>/<capture>）：
//   SUB_MODEL_PRE_EQ   → Pre4（74-77）取「Pre_EQ电路表_v3.md」按品牌的真实电路设计表
//                        （与 NAM 捕获实测交叉校核：结构一致、增益偏差 0.5–3.75dB）
//   SUB_MODEL_FORMULAS → 音色旋钮落【逐型号真实 tone stack 拐点】的 Post16 段，
//                        扫描为【非对称】(noon = 文件设计值；全开上限 / 全关下限按电路锚定)
// 数据源与锚点：tools/gen_amp_params.py（Rob Robinette TMB 分析 + Amperatubes 音调栈模拟器）
Object.assign(SUB_MODEL_PRE_EQ, AMP_PRE_EQ2);
Object.assign(SUB_MODEL_FORMULAS, AMP_FORMULAS2);

// ═══ 系列化物化: 过载/失真 型号组合键 → SUB_MODEL_FORMULAS / SUB_MODEL_PRE_EQ ═══
// 型号键 (形如 "中频过载/TS808") 物化进公式表与 PRE EQ 表, 热路径零改动.
// SUB_MODEL_FORMULAS: 复制该型号真实硬件键公式 (无则回落模块级共享公式 getLegacyLinkedDefs).
// SUB_MODEL_PRE_EQ: 复制该型号真实硬件键 4 段 PRE EQ.
for (const s of SERIES_REGISTRY) {
  for (const m of s.models) {
    const key = seriesModelKey(s, m);
    const formula = SUB_MODEL_FORMULAS[m.key];
    if (formula) SUB_MODEL_FORMULAS[key] = formula;
    const pre = SUB_MODEL_PRE_EQ[m.key];
    if (pre) SUB_MODEL_PRE_EQ[key] = pre;
  }
}

export { SUB_MODEL_FORMULAS, SUB_MODEL_PRE_EQ };

export function applyMicDistance(basePEQ: number[], level: number): number[] {
  // level: 0=Far(-2dB), 1=Mid(0dB, 标准曲线), 2=Near(+2dB) — 仅 Peak(type 0) 频段偏移
  const offsetDb = level === 0 ? -2.0 : level === 2 ? 2.0 : 0.0;
  const offsetGi = Math.round(offsetDb / 0.2);
  return basePEQ.map(v => {
    if ((v & MSK_PEQ_TYPE) !== PEQ_TYPE.PEAK) return v; // 非 Peak 频段(低架/高架/HPF/LPF)不动
    const gi = ((v >>> 12) & 0xFF) + offsetGi;
    const clamped = Math.max(0, Math.min(180, gi));
    return (v & ~(0xFF << 12)) | ((clamped & 0xFF) << 12);
  });
}
export function getLinkedParamDefs(subModelName: string, knobLabel: string): LinkedParamDef[] | null {
  const formulaMap = SUB_MODEL_FORMULAS[subModelName];
  if (!formulaMap) return null;
  return formulaMap[knobLabel] || null;
}
export function getParamDef(moduleId: string, knobLabel: string): ParamDef | undefined {
  const moduleMap = MODULE_PARAM_MAP[moduleId];
  if (!moduleMap) return undefined;
  let def = moduleMap[knobLabel];
  if (def) return def;
  const upper = knobLabel.toUpperCase();
  for (const [key, val] of Object.entries(moduleMap)) {
    if (key.toUpperCase() === upper) return val;
  }
  return undefined;
}

const RATIO_INDEX_TABLE: number[] = [1.0, 1.2, 1.4, 1.6, 1.8, 2.0, 2.4, 2.8, 3.2, 3.6, 4.0, 4.4, 4.8, 5.2, 5.6, 6.0, 6.4, 6.8, 7.2, 7.6, 8.0, 8.4, 9.0, 9.6, 10.2, 10.8, 11.4, 12, 13, 14, 15, 16, 17, 18, 19, 20, 22, 24, 26, 30, 100];
function ratioToIndex(target: number): number { let best=0,bestD=Infinity; for(let i=0;i<RATIO_INDEX_TABLE.length;i++){const d=Math.abs(RATIO_INDEX_TABLE[i]-target);if(d<bestD){bestD=d;best=i;}} return best; }
export function getLegacyLinkedDefs(moduleId: string, knobLabel: string): LinkedParamDef[] | null {
  const formulaMap = (SUB_MODEL_FORMULAS as any)[moduleId];
  if (!formulaMap) return null;
  return formulaMap[knobLabel] || null;
}

