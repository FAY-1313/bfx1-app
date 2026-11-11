/**
 * Preset Engine — maps preset configurations to full hardware register values
 *
 * When a preset is loaded, this engine generates ALL register writes needed
 * to reproduce the preset's sound on the UI002 hardware, including:
 *   - Module bypass (on/off) states
 *   - Drive/volume/gain knob positions
 *   - PEQ band configurations (pre/post EQ)
 *   - Modulation effects (chorus, delay, reverb) with defaults
 *   - System registers (input volume, output volume, noise gate)
 *   - Hidden "default" parameters for unexposed knobs
 *
 * Each register write enforces a 15ms gap for reliable transmission.
 */

import { MODULE_PARAM_MAP, MODULE_BYPASS_ADDR, buildPEQData, PEQ_TYPE, REG_INPUT_VOLUME, REG_OUTPUT_VOLUME, SUB_MODEL_PRE_EQ } from '../data/parameterMap';
import type { PlayMode } from '../data/pedalData';
import { AMP_PARAM_SOURCE, AMP_MODELS as AMP_MODELS_V8, AMP_MASTER_ADDR, AMP_MASTER_DEF } from '../data/ampParams';
import { COMPRESSOR_DEFAULTS, OVERDRIVE_DEFAULTS, CHORUS_DEFAULTS, AMP_HEAD_HIDDEN, AMP_HEAD_HIDDEN_DEFAULT, AMP_HEAD_KNOB_DEFAULTS } from '../data/presetData';
import type { PresetDefaults } from '../data/presetData';
import { SERIES_BY_COMPOSED } from '../data/seriesData';
import { getModuleOnRegs, getModuleOffRegs, isWritableAddr } from '../data/passThrough';
import { isNamModel } from '../data/overdriveBoost';

// ─── Preset Register Interface ────────────────────────────────────
export interface PresetRegister {
  regAddr: number;
  value: number;
  label: string;
}

export interface PresetProfile {
  id: string;
  name: string;
  registers: PresetRegister[];
}

// ─── Default knob positions per module ───────────────────────────
// These reflect "typical" settings for common tone types
// Values are normalized 0-1, converted to reg values at build time
interface KnobDefaults {
  [moduleId: string]: {
    [knobLabel: string]: number;  // normalized 0-1
  };
}

// Default knob values for each module type and each preset style
const KNOB_DEFAULTS = {
  // ── Guitar presets ──
  guitar: {
    'Clean Rhythm': {
      'noise-gate':   { THRESHOLD: 0.3 },
      compressor:     { SENSITIVITY: 0.4, OUTPUT: 0.5, ATTACK: 0.2, RELEASE: 0.3, RATIO: 0.15 },
      overdrive:      { DRIVE: 0.05, VOLUME: 0.5, TONE: 0.4, BASS: 0.5, MID: 0.5, PRESENCE: 0.4 },
      'amp-head':     { GAIN: 0.2, MASTER: 0.5, BASS: 0.5, MID: 0.6, TREBLE: 0.5, PRESENCE: 0.4 },
      chorus:         { RATE: 0.3, DEPTH: 0.3, LEVEL: 0.3 },
      'analog-delay': { TIME: 0.2, FEEDBACK: 0.15 },
      reverb:         { 'PRE-DELAY': 0.15, DECAY: 0.2, MIX: 0.2, 'LOW CUT': 0.1, 'HIGH CUT': 0.8 },
    },
    'Classic Rock': {
      'noise-gate':   { THRESHOLD: 0.4 },
      compressor:     { SENSITIVITY: 0.5, OUTPUT: 0.6, ATTACK: 0.15, RELEASE: 0.3, RATIO: 0.2 },
      overdrive:      { DRIVE: 0.55, VOLUME: 0.5, TONE: 0.6, BASS: 0.55, MID: 0.7, PRESENCE: 0.6 },
      'amp-head':     { GAIN: 0.5, MASTER: 0.5, BASS: 0.6, MID: 0.7, TREBLE: 0.55, PRESENCE: 0.5 },
      chorus:         { RATE: 0.2, DEPTH: 0.2, LEVEL: 0.2 },
      'analog-delay': { TIME: 0.15, FEEDBACK: 0.1 },
      reverb:         { 'PRE-DELAY': 0.1, DECAY: 0.15, MIX: 0.15 },
    },
    'Heavy Crunch': {
      'noise-gate':   { THRESHOLD: 0.6 },
      compressor:     { SENSITIVITY: 0.6, OUTPUT: 0.5, ATTACK: 0.1, RELEASE: 0.25, RATIO: 0.25 },
      'amp-head':     { GAIN: 0.7, MASTER: 0.45, BASS: 0.6, MID: 0.5, TREBLE: 0.6, PRESENCE: 0.6, CONTOUR: 0.4 },
      chorus:         { RATE: 0.1, DEPTH: 0.1, LEVEL: 0.1 },
      reverb:         { 'PRE-DELAY': 0.05, DECAY: 0.1, MIX: 0.1 },
    },
    'Lead Delay': {
      'noise-gate':   { THRESHOLD: 0.5 },
      compressor:     { SENSITIVITY: 0.3, OUTPUT: 0.6, ATTACK: 0.15, RELEASE: 0.3, RATIO: 0.15 },
      overdrive:      { DRIVE: 0.5, VOLUME: 0.55, TONE: 0.6, BASS: 0.4, MID: 0.7, PRESENCE: 0.6 },
      'amp-head':     { GAIN: 0.55, MASTER: 0.5, BASS: 0.5, MID: 0.65, TREBLE: 0.6, PRESENCE: 0.55 },
      'analog-delay': { TIME: 0.5, FEEDBACK: 0.35 },
      reverb:         { 'PRE-DELAY': 0.2, DECAY: 0.4, MIX: 0.3 },
    },
  },
  // ── Bass presets ──
  bass: {
    'Clean Tone': {
      'noise-gate':   { THRESHOLD: 0.3 },
      compressor:     { SENSITIVITY: 0.4, OUTPUT: 0.5, ATTACK: 0.3, RELEASE: 0.4, RATIO: 0.2 },
      overdrive:      { DRIVE: 0.05, VOLUME: 0.45, BASS: 0.7, MID: 0.4, TONE: 0.4 },
      'amp-head':     { GAIN: 0.2, MASTER: 0.5, BASS: 0.7, MID: 0.4, TREBLE: 0.35, PRESENCE: 0.3 },
      chorus:         { RATE: 0.2, DEPTH: 0.2, LEVEL: 0.2 },
    },
    'Growl Bass': {
      'noise-gate':   { THRESHOLD: 0.4 },
      compressor:     { SENSITIVITY: 0.5, OUTPUT: 0.55, ATTACK: 0.2, RELEASE: 0.3, RATIO: 0.2 },
      overdrive:      { DRIVE: 0.5, VOLUME: 0.5, BASS: 0.7, MID: 0.55, TONE: 0.4, PRESENCE: 0.3 },
      'amp-head':     { GAIN: 0.45, MASTER: 0.5, BASS: 0.7, MID: 0.5, TREBLE: 0.4, PRESENCE: 0.35 },
    },
    'Slap Funk': {
      'noise-gate':   { THRESHOLD: 0.2 },
      compressor:     { SENSITIVITY: 0.6, OUTPUT: 0.6, ATTACK: 0.05, RELEASE: 0.2, RATIO: 0.3 },
      'amp-head':     { GAIN: 0.3, MASTER: 0.55, BASS: 0.5, MID: 0.6, TREBLE: 0.7, PRESENCE: 0.65 },
      chorus:         { RATE: 0.3, DEPTH: 0.25, LEVEL: 0.25 },
    },
    'Deep Dub': {
      'noise-gate':   { THRESHOLD: 0.3 },
      compressor:     { SENSITIVITY: 0.4, OUTPUT: 0.5, ATTACK: 0.3, RELEASE: 0.5, RATIO: 0.2 },
      'amp-head':     { GAIN: 0.25, MASTER: 0.5, BASS: 0.8, MID: 0.3, TREBLE: 0.3, PRESENCE: 0.2 },
      'analog-delay': { TIME: 0.45, FEEDBACK: 0.3 },
      reverb:         { 'PRE-DELAY': 0.3, DECAY: 0.6, MIX: 0.4, 'LOW CUT': 0.05, 'HIGH CUT': 0.6 },
    },
  },
};

// ─── PRE EQ 电路特征覆盖 ───────────────────────────────────────
// 返回当前活跃模块 (OD/DIST/箱头) 的 PRE EQ 寄存器写入。
// OD/DIST/箱头三段独立写入: 只在子型号存在且模块开启时写, 不再互斥; 单独 PRE EQ 旁路 (43/58/73) 不再写入。
export function buildPreEqOverride(
  odSub: string,
  distSub: string,
  ampSub: string,
): PresetRegister[] {
  const writes: PresetRegister[] = [];
  const targets: Array<{ key: string; tag: string }> = [];
  if (odSub) targets.push({ key: odSub, tag: 'OD' });
  if (distSub) targets.push({ key: distSub, tag: 'DIST' });
  if (ampSub) targets.push({ key: ampSub, tag: 'AMP' });
  for (const { key, tag } of targets) {
    const cfg = SUB_MODEL_PRE_EQ[key];
    if (!cfg) continue;
    cfg.regs.forEach((addr, i) => {
      writes.push({ regAddr: addr, value: cfg.values[i], label: `${tag} PRE EQ${i + 1}` });
    });
  }
  return writes;
}

// ─── Generate all registers for a preset ─────────────────────────
export function generatePresetRegisters(
  presetId: string,
  presetName: string,
  mode: PlayMode,
  modules: Record<string, boolean | string | number>,
  cabPeq?: number[],
): PresetRegister[] {
  const regs: PresetRegister[] = [];
  const dflts = getPresetDefaults(mode, presetName);

  // 1. System registers
  regs.push({ regAddr: 2, value: 0, label: 'Mute Off' });                     // Guitar_Mute = 0 (unmuted)
  regs.push({ regAddr: REG_INPUT_VOLUME, value: 50, label: 'Input Vol' });     // Input volume 0dB (max)
  regs.push({ regAddr: REG_OUTPUT_VOLUME, value: 50, label: 'Output Vol' });   // Output volume 0dB (max)

  // 2. Noise Gate
  const ngOn = modules['noise-gate'] ?? true;
  regs.push({ regAddr: 0, value: ngOn ? 0 : 1, label: 'Noise Gate' });        // Bypass addr: 0=on, 1=bypass
  const ngThreshold = dflts['noise-gate']?.THRESHOLD ?? 0.3;
  regs.push({ regAddr: 1, value: Math.round(ngThreshold * 10), label: 'Gate Threshold' });

  // 3. Compressor (regs 4-13 per 压缩器032.docx) — reg4=Enable/reg5=Mode 硬件默认 0 (MODE1) 不写入, 脚踏=reg7
  const compOn = modules.compressor ?? true;
  // Look up document defaults by sub-model name; fall back to first preset for mode
  const compPresetName = (modules as any).compressorSubModel || '';
  const compPreset = COMPRESSOR_DEFAULTS[compPresetName]
    || (mode === 'bass' ? COMPRESSOR_DEFAULTS['B&F 163'] : COMPRESSOR_DEFAULTS['B&F Dyna Comp']);
  if (!compOn) {
    // 压缩器关闭: 本段不写 —— 由末尾统一收尾写入 PASSTHROUGH_REGS.compressor (阈值 max + MakeUp min)
    //   (白名单内没有压缩器旁路位, 关闭只能用参数化直通表达)
  } else if (compPreset) {
    // Write all registers from document preset (including hidden Attack/Release/Knee)
    for (const [addrStr, value] of Object.entries(compPreset.allRegs)) {
      const addr = parseInt(addrStr);
      if (addr === 7) continue;   // 7 白名单外(已取消) → 不写
      regs.push({ regAddr: addr, value, label: `Comp Reg${addr}` });
    }
    // Also write hidden registers to registerStore for future SAVE
    for (const [addr, value] of Object.entries(compPreset.hidden)) {
      regs.push({ regAddr: parseInt(String(addr)), value, label: `Comp Hidden${addr}` });
    }
  } else {
    // Fallback: generic defaults (7 白名单外, 不再写入)
    const compSens = dflts.compressor?.SENSITIVITY ?? 0.5;
    const compOut = dflts.compressor?.OUTPUT ?? 0.5;
    const compAtt = dflts.compressor?.ATTACK ?? 0.2;
    const compRel = dflts.compressor?.RELEASE ?? 0.3;
    const compRat = dflts.compressor?.RATIO ?? 0.2;
    regs.push({ regAddr: 8, value: Math.round(compSens * 50), label: 'Comp Threshold' });
    regs.push({ regAddr: 9, value: Math.round(compAtt * 999), label: 'Comp Attack' });
    regs.push({ regAddr: 10, value: Math.round(compRel * 1999), label: 'Comp Release' });
    regs.push({ regAddr: 11, value: Math.round(compRat * 40), label: 'Comp Ratio' });
    regs.push({ regAddr: 12, value: 0, label: 'Comp Knee' });
    regs.push({ regAddr: 13, value: Math.round(compOut * 12), label: 'Comp Gain' });
  }

  // 4. Overdrive (1st OD) — regs 42-56 per 过载032.docx
  const odOn = modules.overdrive ?? false;
  const distOn = modules.dist ?? false;
  // 2026-09-25 白名单: 42/57/72/107/224/7/253 已不可写 → 模块开关一律由【内部旁路位 48/63/78】
  // + 关闭时的 PASSTHROUGH_REGS 覆盖承担（见本函数末尾第 12 步统一收尾）
  const odPresetName = (modules as any).overdriveSubModel || '';
  const distPresetName = (modules as any).distSubModel || '';
  // 修复 (2026-09-22): 系列键回退同 DIST; 旧代码系列键查不到时静默回落 BD-2,
  // 导致所有系列型号的 OD POST EQ(reg53-56) 都写成 BD-2 曲线 (OVERDRIVE_DEFAULTS
  // 现已在 presetData.ts 末尾物化系列键, 此回退仅为未知键兜底).
  const resolveOdDistPresetTop = (name: string): PresetDefaults | undefined =>
    OVERDRIVE_DEFAULTS[name]
    || (SERIES_BY_COMPOSED[name] ? OVERDRIVE_DEFAULTS[SERIES_BY_COMPOSED[name].baseKey] : undefined);
  const odPreset = resolveOdDistPresetTop(odPresetName)
    || OVERDRIVE_DEFAULTS['B&F NAM Boss BD-2/Boss BD-2'];
  if (!odOn) {
    // 过载关闭: 本段一个参数都不写 —— 由末尾统一收尾写入 PASSTHROUGH_REGS.overdrive
    //   (8 段 PEQ 复位 + 48=1 真正旁路该级), 与模块页/踩钉关闭完全同一口径
  } else if (isNamModel(odPresetName) && odPreset?.allRegs) {
    // NAM 拟合: 只写 OD 块 44-56, 跳过 DIST 块 57-71 (过载/失真完全独立) 与白名单外的 42/43/52
    //   48 = 内部旁路位, 由末尾收尾唯一决定
    for (const [addrStr, value] of Object.entries(odPreset.allRegs)) {
      const addr = parseInt(addrStr);
      if (addr > 56 || addr === 42 || addr === 43 || addr === 48 || addr === 52) continue;
      regs.push({ regAddr: addr, value, label: `OD NAM${addr}` });
    }
  } else if (odPreset) {
    // Write ALL OD block registers from document preset including pre-programmed PEQ uint32 values
    for (const [addrStr, value] of Object.entries(odPreset.allRegs)) {
      const addr = parseInt(addrStr);
      // 只写 OD 块 44-56; 白名单外的 42/43/52 不写 (48 由末尾收尾压平为 0=启用)
      const odDbgOnly = addr > 56;
      const odUnwritable = addr === 42 || addr === 43 || addr === 48 || addr === 52;
      if (odDbgOnly || odUnwritable) continue;
      regs.push({ regAddr: addr, value, label: `OD Reg${addr}` });
    }
    // Also ensure hidden registers (bypasses + PEQ) are in the write list
    for (const [addr, value] of Object.entries(odPreset.hidden)) {
      const addrNum = parseInt(String(addr));
      // Only add if not already covered by allRegs, and only within OD block 44-56
      if (addrNum > 56) continue;
      if (addrNum === 42 || addrNum === 43 || addrNum === 48 || addrNum === 52) continue; // 白名单外/收尾决定
      if (!(addrNum in odPreset.allRegs)) {
        regs.push({ regAddr: addrNum, value, label: `OD Hidden${addrNum}` });
      }
    }
  } else {
    // Fallback: dynamic knob values (42/43/48/52 不在本段写入: 前两者白名单外, 48 由收尾决定)
    const odDrive = dflts.overdrive?.DRIVE ?? dflts.overdrive?.GAIN ?? 0.3;
    const odVol  = dflts.overdrive?.VOLUME ?? dflts.overdrive?.LEVEL ?? 0.5;
    const odTone = dflts.overdrive?.TONE ?? dflts.overdrive?.TREBLE ?? 0.5;
    const odBass = dflts.overdrive?.BASS ?? 0.5;
    const odMid  = dflts.overdrive?.MID ?? 0.5;
    const odPres = dflts.overdrive?.PRESENCE ?? 0.5;
    regs.push({ regAddr: 49, value: Math.round(odDrive * 92), label: 'OD Drive' });
    regs.push({ regAddr: 51, value: 248 + Math.round(odVol * 40), label: 'OD Volume' });
    regs.push({ regAddr: 50, value: 50, label: 'OD DC Offset' });
    regs.push({ regAddr: 44, value: buildPEQData(PEQ_TYPE.HIGH_SHELF, Math.round(odTone * 361), 120, 16, 10), label: 'OD Tone PEQ' });
    regs.push({ regAddr: 45, value: buildPEQData(PEQ_TYPE.LOW_SHELF, Math.round(odBass * 361), 120, 16, 10), label: 'OD Bass PEQ' });
    regs.push({ regAddr: 46, value: buildPEQData(PEQ_TYPE.PEAK, Math.round(odMid * 361), 120, 16, 10), label: 'OD Mid PEQ' });
    regs.push({ regAddr: 47, value: buildPEQData(PEQ_TYPE.HIGH_SHELF, Math.round(odPres * 361), 120, 16, 10), label: 'OD Pres PEQ' });
    regs.push({ regAddr: 53, value: buildPEQData(PEQ_TYPE.PEAK, 180, 120, 16, 10), label: 'OD Post1' });
    regs.push({ regAddr: 54, value: buildPEQData(PEQ_TYPE.PEAK, 300, 120, 16, 10), label: 'OD Post2' });
    regs.push({ regAddr: 55, value: buildPEQData(PEQ_TYPE.PEAK, 500, 120, 16, 10), label: 'OD Post3' });
    regs.push({ regAddr: 56, value: buildPEQData(PEQ_TYPE.PEAK, 800, 120, 16, 10), label: 'OD Post4' });
  }

  // 5. DIST section (regs 57-71) — 独立 DIST 模块; 57 总旁路由失真开关控制, 单独旁路不再写入
  // 修复 (2026-09-22): 旧兜底键 'B&F NAM DS-1 Mid/BOSS DISTORTION DS-1 All 12 o Clock' 在
  // OVERDRIVE_DEFAULTS 中不存在 → distPreset=undefined → else 分支只写 57=1, DIST 的
  // Drive/DCOffset/Volume/POST EQ(64-66,68-71) 全部缺失 (仅 PRE EQ 覆盖救回 59-62).
  // 现改为真实存在的键, 并加系列键回退 (SERIES_BY_COMPOSED) 双保险.
  const resolveOdDistPreset = (name: string): PresetDefaults | undefined =>
    OVERDRIVE_DEFAULTS[name]
    || (SERIES_BY_COMPOSED[name] ? OVERDRIVE_DEFAULTS[SERIES_BY_COMPOSED[name].baseKey] : undefined);
  const distPreset = resolveOdDistPreset(distPresetName)
    || OVERDRIVE_DEFAULTS['B&F NAM Boss DS-1/Boss DS-1'];
  if (!distOn) {
    // 失真关闭: 本段一个参数都不写 —— 由末尾统一收尾写入 PASSTHROUGH_REGS.dist
    //   (8 段 PEQ 复位 + 63=1 真正旁路该级)
  } else if (distPreset) {
    if (isNamModel(distPresetName) && distPreset.allRegs) {
      // NAM 拟合: 只写 DIST 块 59-71, 跳过 OD 块 42-56 (过载/失真完全独立) 与白名单外的 57/58/67
      //   63 = 内部旁路位, 由末尾收尾唯一决定
      for (const [addrStr, value] of Object.entries(distPreset.allRegs)) {
        const addr = parseInt(addrStr);
        // ★ 2026-10-03: 57/58/67 已进白名单（必须写 0，见下方强制写入），此处只跳过 63
        if (addr < 57 || addr === 63) continue;
        regs.push({ regAddr: addr, value, label: `DIST NAM${addr}` });
      }
    } else {
      // 经典失真单块: DIST 主引擎 64/65/66 + PEQ 59-62/68-71 (57/58/63/67 不写: 前两者白名单外, 63 由收尾决定)
      regs.push({ regAddr: 59, value: distPreset.allRegs?.[59] ?? 0, label: 'DIST PrePEQ1' });
      regs.push({ regAddr: 60, value: distPreset.allRegs?.[60] ?? 0, label: 'DIST PrePEQ2' });
      regs.push({ regAddr: 61, value: distPreset.allRegs?.[61] ?? 0, label: 'DIST PrePEQ3' });
      regs.push({ regAddr: 62, value: distPreset.allRegs?.[62] ?? 0, label: 'DIST PrePEQ4' });
      regs.push({ regAddr: 64, value: distPreset.allRegs?.[64] ?? 0, label: 'DIST Drive' });
      regs.push({ regAddr: 65, value: distPreset.allRegs?.[65] ?? 50, label: 'DIST Offset' });
      regs.push({ regAddr: 66, value: distPreset.allRegs?.[66] ?? 288, label: 'DIST Volume' });
      regs.push({ regAddr: 68, value: distPreset.allRegs?.[68] ?? 0, label: 'DIST PostPEQ1' });
      regs.push({ regAddr: 69, value: distPreset.allRegs?.[69] ?? 0, label: 'DIST PostPEQ2' });
      regs.push({ regAddr: 70, value: distPreset.allRegs?.[70] ?? 0, label: 'DIST PostPEQ3' });
      regs.push({ regAddr: 71, value: distPreset.allRegs?.[71] ?? 0, label: 'DIST PostPEQ4' });
    }
  } else {
    // 无 DIST 子型号: 本段不写参数(收尾按模块开关决定 63=0/1 与 PEQ 复位)
  }

  // ══════════════════════════════════════════════════════════════════
  // 6. 箱头（regs 57-98 + 239）
  // ★ v8：箱头 = 跨 57-98 一整条链（N1→N4→N5→N8），57-71 不再属独立 dist 模块
  //        GAIN=64 · DRIVE=79 · VOL1=66 · VOL2=81 · MASTER=239
  // ★ legacy：72-98 由 AMP_HEAD_HIDDEN 提供（79=GAIN 81=Volume），57-71 由 DIST 段
  // ══════════════════════════════════════════════════════════════════
  const ampOn = modules['amp-head'] ?? true;
  const ampSub = (modules as any).ampHeadSubModel || '';

  if (AMP_PARAM_SOURCE === 'v8') {
    const ampIdx = (modules as any).ampHeadV8Index ?? 0;
    const ampV8 = AMP_MODELS_V8[ampIdx] ?? AMP_MODELS_V8[0];
    if (ampOn) {
      for (const [r, v] of Object.entries(ampV8.regs)) {
        regs.push({ regAddr: parseInt(r, 10), value: v, label: `Amp ${ampV8.id}#${r}` });
      }
      regs.push({ regAddr: AMP_MASTER_ADDR, value: AMP_MASTER_DEF, label: 'Amp MASTER' });
    }
  } else {
    // ── legacy 路径（原样保留）──
    const ampHidden = AMP_HEAD_HIDDEN[ampSub] || AMP_HEAD_HIDDEN_DEFAULT;
    if (ampOn) {
      for (const [addrStr, value] of Object.entries(ampHidden)) {
        const addr = parseInt(addrStr);
        // ★ 2026-10-03: 72/73/82 已进白名单并由下方强制写 0；此处只跳过 78/79/81
        if (addr === 78 || addr === 79 || addr === 81) continue;
        regs.push({ regAddr: addr, value, label: `Amp Hidden${addr}` });
      }
      const ampKnobD = AMP_HEAD_KNOB_DEFAULTS[ampSub];
      regs.push({ regAddr: 79, value: Math.round((ampKnobD?.GAIN ?? 0.5) * 92), label: 'Amp GAIN 甜点' });
      regs.push({ regAddr: 81, value: 248 + Math.round((ampKnobD?.VOLUME ?? 0.5) * 40), label: 'Amp VOLUME 甜点' });
      regs.push({ regAddr: 239, value: Math.round((ampKnobD?.MASTER ?? 0.5) * 500), label: 'Amp MASTER 甜点' });
    }
  }
  // 箱头两块级使能位（★ 2026-10-20 用户拍板）：只写 57 / 72 两个"块旁路"。
  //   库旁路 58/67/73/82 与级旁路 63/78 一律不写 —— 固件默认就是 0（启用），
  //   写它们只会让每次切档多跑 4 帧（每条预设白写 4–6 个寄存器）。
  if (ampOn) {
    for (const a of [57, 72]) {
      regs.push({ regAddr: a, value: 0, label: `Amp BlockEnable${a}=0` });
    }
  }

  // 6b. PRE EQ 电路特征覆盖 (后写覆盖先写, 干净接管 OD/DIST 两段; 模块关闭时传空串不写该段 PRE EQ)
  // ★ 2026-10-16 v3：箱头段不再走这里。v3 的 N5(74-77) 已由 AMP_MODELS[ampIdx].regs 完整给出，
  //   而 SUB_MODEL_PRE_EQ 的箱头键还是 v13 那批值，会盖掉 v3 设计曲线 → 第三参恒传空串。
  regs.push(...buildPreEqOverride(odOn ? odPresetName : '', distOn ? distPresetName : '', ''));

  // 7. Cabinet — 白名单口径: 107 已取消不可写; 开关改由 35 段 PEQ 是否复位表达 (关 = 全段 0dB)
  const cabOn = modules.cabinet ?? true;

  // 8. Chorus — regs 215-220
  const chorusOn = modules.chorus ?? false;
  regs.push({ regAddr: 215, value: chorusOn ? 0 : 1, label: 'Chorus Bypass' });
  const chRate = dflts.chorus?.RATE ?? 0.3;
  const chDepth = dflts.chorus?.DEPTH ?? 0.3;
  const chLevel = dflts.chorus?.LEVEL ?? 0.3;
  regs.push({ regAddr: 216, value: Math.round(chLevel * 20), label: 'Chorus Level' });
  regs.push({ regAddr: 217, value: Math.round(chRate * 39), label: 'Chorus Rate' });
  regs.push({ regAddr: 219, value: Math.round(chDepth * 9), label: 'Chorus Depth' });
  // 镜像/固定寄存器 (218 Rate2/Width, 220 Depth2): 型号切换时写固定值, 预设加载时补齐
  const chorusSub = (modules as any).chorusSubModel || '';
  const chDef = CHORUS_DEFAULTS[chorusSub];
  if (chDef) {
    regs.push({ regAddr: 218, value: chDef.knobs.WIDTH !== undefined ? Math.round(chDef.knobs.WIDTH * 39) : (chDef.hidden[218] ?? 0), label: 'Chorus Rate2/Width' });
    regs.push({ regAddr: 220, value: chDef.hidden[220] ?? 0, label: 'Chorus Depth2' });
  } else {
    regs.push({ regAddr: 218, value: 0, label: 'Chorus Rate2/Width' });
    regs.push({ regAddr: 220, value: 0, label: 'Chorus Depth2' });
  }

  // 9. Analog Delay — regs 221-223
  const delayOn = modules['analog-delay'] ?? false;
  regs.push({ regAddr: 221, value: delayOn ? 0 : 1, label: 'Delay Bypass' });
  const dTime = dflts['analog-delay']?.TIME ?? 0.3;
  const dFb   = dflts['analog-delay']?.FEEDBACK ?? 0.2;
  regs.push({ regAddr: 222, value: Math.round(dFb * 75), label: 'Delay Feedback' });
  regs.push({ regAddr: 223, value: Math.round(dTime * 500), label: 'Delay Time' });

  // 10. Reverb — regs 224-229 (224 已取消不可写; 关闭 = Mix 0 纯干声, 由末尾收尾写入)
  const revOn = modules.reverb ?? false;
  const rvPred = dflts.reverb?.['PRE-DELAY'] ?? 0.15;
  const rvDecay = dflts.reverb?.DECAY ?? 0.3;
  const rvMix   = dflts.reverb?.MIX ?? 0.25;
  const rvLoCut = dflts.reverb?.['LOW CUT'] ?? 0.1;
  const rvHiCut = dflts.reverb?.['HIGH CUT'] ?? 0.7;
  if (revOn) {
    regs.push({ regAddr: 225, value: Math.round(rvPred * 200), label: 'Reverb Pre-Delay' });
    regs.push({ regAddr: 226, value: Math.round(rvDecay * 80), label: 'Reverb Decay' });
    regs.push({ regAddr: 227, value: Math.round(rvLoCut * 205), label: 'Reverb LoCut' });
    regs.push({ regAddr: 228, value: Math.round(rvHiCut * 158), label: 'Reverb HiCut' });
    regs.push({ regAddr: 229, value: Math.round(rvMix * 100), label: 'Reverb Mix' });
  } else {
    // 混响关闭: 本段不写 —— 由末尾统一收尾写入 PASSTHROUGH_REGS.reverb (Mix=0)
  }

  // 11. 35-band PEQ bands (108-142). reg105/106 default 0 no write; 107 已取消不可写
  //     有 cabPeq (当前选中箱体捕获曲线) 时写捕获甜点, 否则平坦中性兜底
  if (cabOn) {
    for (let i = 0; i < 35; i++) {
      regs.push({
        regAddr: 108 + i,
        value: cabPeq && cabPeq[i] !== undefined
          ? cabPeq[i]
          : buildPEQData(PEQ_TYPE.PEAK, Math.round(i * 10.3), 120, 16, 10),
        label: `PEQ Band ${i + 1}`,
      });
    }
    // 箱体甜点: SPEAKER dynamics 复位到 Off (与 writeCabPEQ resetDynamics=true 一致)
    if (cabPeq) {
      const offLim: Array<[number, number]> = [[254,47],[255,1],[256,150],[257,40],[258,12],[259,0]];
      for (const [addr, value] of offLim) {
        regs.push({ regAddr: addr, value, label: `Cab Dynamics Off` });
      }
    }
  } else {
    // 箱体关闭: 本段不写 —— 由末尾统一收尾写入 PASSTHROUGH_REGS.cabinet (35 段全平直)
  }

  // 12. 【统一收尾】模块开/关的唯一权威表达（2026-09-25 用户决定 · 方案①）
  //   ① 关闭的模块 → PASSTHROUGH_REGS：PEQ 全段复位，OD/DIST/箱头 另加内部旁路位=1
  //   ② 开启的 OD/DIST/箱头 → 内部旁路位(48/63/78) 显式写 0(启用该级)
  //   放在末尾 → 后写覆盖前面任何来源(preset/hidden/甜点)对同地址的写法，
  //   且保证白名单内的开关状态在"整图权威"下每次都由预设明确决定。
  // 注意: modules 的开关字段类型是 string|boolean(宽类型), 此处 Boolean() 归一化 ——
  // 与原 `if (x)` 的 truthy 判定完全等价, 不改变开/关行为。
  const moduleOnOff: Array<[string, boolean]> = [
    ['compressor', Boolean(compOn)], ['overdrive', Boolean(odOn)],
    ['amp-head', Boolean(ampOn)], ['cabinet', Boolean(cabOn)], ['reverb', Boolean(revOn)],
  ];
  for (const [mid, on] of moduleOnOff) {
    const set = on ? getModuleOnRegs(mid) : getModuleOffRegs(mid);
    for (const [a, v] of Object.entries(set)) {
      regs.push({ regAddr: Number(a), value: v, label: `${mid} 旁路位${a}=${v}` });
    }
  }

  return normalizeCancelledBypass(regs);
}

/**
 * 白名单归一化（2026-09-25 口径，取代 A5 的"取消位恒写 0"）：
 *
 *   · 白名单外地址一律【不写入】→ 直接删除
 *     （7/42/57/72/107/224/253 模块总旁路位 + 43/52/58/67/73/82 内部分段旁路位）
 *   · 模块"开/关"改由【白名单内】承担：内部旁路位 48/63/78（INTERNAL_BYPASS_BY_MODULE）
 *     + 关闭时的 PASSTHROUGH_REGS 参数复位（见本函数调用处第 12 步）
 *   · 同一地址多次出现 → 保留【最后一次】的值（"后写覆盖先写"语义，保证 Map 化结果确定）
 *
 * 迁移期曾用名 A5 normalize（删取消位 + 追加恒写 0）已废弃。
 */
export function normalizeCancelledBypass(regs: PresetRegister[]): PresetRegister[] {
  const writable = regs.filter(r => isWritableAddr(r.regAddr));
  const lastIdx = new Map<number, number>();
  writable.forEach((r, i) => lastIdx.set(r.regAddr, i));
  return writable.filter((r, i) => lastIdx.get(r.regAddr) === i);
}

/**
 * Get knob defaults for a specific preset
 */
function getPresetDefaults(mode: PlayMode, presetName: string): Record<string, Record<string, number>> {
  const modeDefaults = KNOB_DEFAULTS[mode];
  if (!modeDefaults) return {};

  // Find closest matching preset name
  const exact = modeDefaults[presetName];
  if (exact) return exact;

  // Fallback: try partial match
  for (const [key, val] of Object.entries(modeDefaults)) {
    if (presetName.toLowerCase().includes(key.toLowerCase().split(' ')[0])) {
      return val;
    }
  }

  // Last fallback: first preset's defaults
  return Object.values(modeDefaults)[0] ?? {};
}

// D7 (2026-09-22) 死代码清理: applyPresetToHardware 已删除 (全工程无调用者;
// 切台解耦后写硬件统一走 Index.tsx 的「上传」(EB) 与踩钉/调试(EA) 路径)
