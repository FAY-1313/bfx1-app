/**
 * NAM / IR 识别与寄存器参数映射引擎
 *
 * 功能:
 * 1. NAM (Neural Amp Modeler) 文件分析 — 识别放大器类型/特征
 * 2. IR (Impulse Response) 文件分析 — 识别箱体/麦克风特征
 * 3. 将识别结果映射到 UI002 硬件寄存器参数
 * 4. 提供推荐参数配置
 */

import { MODULE_PARAM_MAP, PEQ_TYPE, PEQ_FREQ_TABLE, normalizedToRegValue } from "../data/parameterMap";

// ─── 类型定义 ───────────────────────────────────────────────────────

export type NAMArchType = 'A1' | 'A2' | 'unknown';
export type NamedType = 'amp' | 'pedal' | 'preamp' | 'full-rig' | 'ir' | 'unknown-type';

export interface NAMFileInfo {
  filename: string;
  fileSize: number;
  archType: NAMArchType;
  modelName: string;
  confidence: number; // 0-1
}

export interface IRFileInfo {
  filename: string;
  fileSize: number;
  sampleRate: number;
  lengthMs: number;
  estimatedCabinet: string;
  estimatedMic: string;
  confidence: number;
}

export interface RegisterSuggestion {
  regAddr: number;
  value: number;
  label: string;
  moduleId: string;
  knobLabel: string;
}

export interface NAMIRResult {
  type: 'nam' | 'ir' | 'unknown';
  info: NAMFileInfo | IRFileInfo | null;
  registerSuggestions: RegisterSuggestion[];
  recommendedModule: string;
  recommendedSubModel: string;
  description: string;
  confidence: number;
}

// ─── 放大器特征数据库 ───────────────────────────────────────────────
// 用于 NAM 文件名模式匹配识别放大器类型和推荐参数
interface AmpProfile {
  keywords: string[];
  moduleId: string;
  subModelId: string;
  /** 推荐旋钮值 { knobLabel: normalizedValue (0-1) } */
  knobs: Record<string, number>;
  description: string;
}

const AMP_PROFILES: AmpProfile[] = [
  // Fender
  { keywords: ['twin', 'reverb', 'fender'], moduleId: 'amp-head', subModelId: 'fender-twin', knobs: { VOLUME: 0.4, TREBLE: 0.5, MIDDLE: 0.5, BASS: 0.5, BRIGHT: 0.3 }, description: 'B&F Twin Reverb — Clean American amp' },
  { keywords: ['deluxe', 'tweed', 'fender'], moduleId: 'amp-head', subModelId: 'fender-deluxe', knobs: { 'VOLUME I': 0.5, 'VOLUME II': 0.5, TONE: 0.5 }, description: 'B&F Tweed Deluxe — Vintage warm tones' },
  { keywords: ['bassman', 'fender'], moduleId: 'amp-head', subModelId: 'fender-bassman', knobs: { VOLUME: 0.5, BASS: 0.5, TREBLE: 0.5, PRESENCE: 0.4 }, description: 'B&F Bassman — Deep clean headroom' },
  // Marshall
  { keywords: ['jcm800', 'marshall'], moduleId: 'amp-head', subModelId: 'marshall-jcm800', knobs: { PREAMP: 0.6, MASTER: 0.4, BASS: 0.5, MIDDLE: 0.6, TREBLE: 0.5, PRESENCE: 0.5 }, description: 'B&F JCM800 — Classic rock crunch' },
  { keywords: ['plexi', 'marshall', 'superlead'], moduleId: 'amp-head', subModelId: 'marshall-plexi', knobs: { 'VOLUME I': 0.7, 'VOLUME II': 0.3, BASS: 0.5, MIDDLE: 0.6, TREBLE: 0.5, PRESENCE: 0.4 }, description: 'B&F Plexi — Vintage hard rock' },
  { keywords: ['jvm', 'marshall'], moduleId: 'amp-head', subModelId: 'marshall-jvm', knobs: { GAIN: 0.6, 'CHANNEL VOL': 0.4, BASS: 0.5, MIDDLE: 0.5, TREBLE: 0.5, PRESENCE: 0.5, DEPTH: 0.4 }, description: 'B&F JVM — Modern high-gain' },
  // Mesa
  { keywords: ['rectifier', 'mesa', 'dual', 'triple'], moduleId: 'amp-head', subModelId: 'mesa-rectifier', knobs: { GAIN: 0.7, MASTER: 0.3, BASS: 0.6, MIDDLE: 0.3, TREBLE: 0.6, PRESENCE: 0.5 }, description: 'B&F Rectifier — Modern high-gain chug' },
  { keywords: ['mark', 'mesa', 'boogie'], moduleId: 'amp-head', subModelId: 'mesa-mark5', knobs: { GAIN: 0.6, MASTER: 0.4, BASS: 0.5, MIDDLE: 0.5, TREBLE: 0.5, PRESENCE: 0.5, '80HZ': 0.5, '240HZ': 0.5, '750HZ': 0.5, '2200HZ': 0.5, '6600HZ': 0.5 }, description: 'B&F Mark V — Versatile with 5-band GEQ' },
  // Vox
  { keywords: ['ac30', 'vox'], moduleId: 'amp-head', subModelId: 'vox-ac30', knobs: { VOLUME: 0.5, BASS: 0.5, TREBLE: 0.5, CUT: 0.3 }, description: 'B&F AC30 — Chimey British clean/crunch' },
  { keywords: ['ac15', 'vox'], moduleId: 'amp-head', subModelId: 'vox-ac15', knobs: { VOLUME: 0.5, BASS: 0.5, TREBLE: 0.5, CUT: 0.3 }, description: 'B&F AC15 — Compact British chime' },
  // Orange
  { keywords: ['rockerverb', 'orange'], moduleId: 'amp-head', subModelId: 'orange-rockerverb', knobs: { 'DIRTY GAIN': 0.6, 'DIRTY VOLUME': 0.4, BASS: 0.5, MIDDLE: 0.5, TREBLE: 0.5, PRESENCE: 0.4 }, description: 'B&F Rockerverb — Thick British gain' },
  { keywords: ['ad30', 'orange'], moduleId: 'amp-head', subModelId: 'orange-ad30', knobs: { GAIN: 0.6, MASTER: 0.4, BASS: 0.5, MIDDLE: 0.6, TREBLE: 0.5, PRESENCE: 0.4 }, description: 'B&F AD30 — Dual channel British' },
  // Peavey
  { keywords: ['5150', 'peavey', '6505'], moduleId: 'amp-head', subModelId: 'peavey-5150', knobs: { 'PRE GAIN': 0.7, 'POST GAIN': 0.3, BASS: 0.5, MIDDLE: 0.4, TREBLE: 0.5, PRESENCE: 0.5, RESONANCE: 0.4 }, description: 'B&F 5150/6505 — American high-gain' },
  // Diezel
  { keywords: ['vh4', 'diezel'], moduleId: 'amp-head', subModelId: 'diezel-vh4', knobs: { GAIN: 0.6, MASTER: 0.3, BASS: 0.5, MIDDLE: 0.5, TREBLE: 0.6, PRESENCE: 0.5, DEEP: 0.4 }, description: 'B&F VH4 — Precision high-gain' },
  // Friedman
  { keywords: ['be-100', 'friedman', 'be100'], moduleId: 'amp-head', subModelId: 'friedman-be100', knobs: { GAIN: 0.6, MASTER: 0.4, BASS: 0.5, MIDDLE: 0.6, TREBLE: 0.5, PRESENCE: 0.5 }, description: 'B&F BE-100 — Modern boutique rock' },
  // Soldano
  { keywords: ['slo', 'soldano'], moduleId: 'amp-head', subModelId: 'soldano-slo', knobs: { PREAMP: 0.6, MASTER: 0.3, BASS: 0.5, MIDDLE: 0.5, TREBLE: 0.6, PRESENCE: 0.5 }, description: 'B&F SLO-100 — American high-gain lead' },
  // Ampeg
  { keywords: ['svt', 'ampeg'], moduleId: 'amp-head', subModelId: 'ampeg-svt', knobs: { GAIN: 0.5, MASTER: 0.6, BASS: 0.6, MIDRANGE: 0.5, TREBLE: 0.4 }, description: 'B&F SVT — Classic bass amp' },
];

// ─── 过载/失真单块特征数据库 ──────────────────────────────────────
const PEDAL_PROFILES: AmpProfile[] = [
  { keywords: ['ts9', 'tubescreamer', '808', 'ibanez'], moduleId: 'overdrive', subModelId: 'ts9', knobs: { DRIVE: 0.5, TONE: 0.5, LEVEL: 0.5 }, description: 'B&F TS9 — Classic mid-boost overdrive' },
  { keywords: ['ts808', 'ibanez'], moduleId: 'overdrive', subModelId: 'ts808', knobs: { DRIVE: 0.5, TONE: 0.5, LEVEL: 0.5 }, description: 'B&F TS808 — Vintage overdrive' },
  { keywords: ['klon', 'centaur'], moduleId: 'overdrive', subModelId: 'klon', knobs: { GAIN: 0.5, TREBLE: 0.5, OUTPUT: 0.5 }, description: 'B&F Centaur — Transparent overdrive' },
  { keywords: ['bd-2', 'blues driver', 'boss'], moduleId: 'overdrive', subModelId: 'bd2', knobs: { DRIVE: 0.5, TONE: 0.5, LEVEL: 0.5 }, description: 'B&F BD-2 — Warm overdrive' },
  { keywords: ['sd-1', 'super', 'overdrive', 'boss'], moduleId: 'overdrive', subModelId: 'sd1', knobs: { DRIVE: 0.5, TONE: 0.5, LEVEL: 0.5 }, description: 'B&F SD-1 — Tube-like crunch' },
  { keywords: ['ocd', 'fulltone'], moduleId: 'overdrive', subModelId: 'ocd', knobs: { DRIVE: 0.5, TONE: 0.5, LEVEL: 0.5 }, description: 'B&F OCD — Versatile overdrive' },
  { keywords: ['timmy', 'paul', 'cochrane'], moduleId: 'overdrive', subModelId: 'timmy', knobs: { DRIVE: 0.5, BASS: 0.5, TREBLE: 0.5, VOLUME: 0.5 }, description: 'B&F Timmy — Transparent OD with bass/treble' },
];

// ─── 箱体 IR 特征数据库 ────────────────────────────────────────────
interface IRProfile {
  keywords: string[];
  cabinetId: string;
  moduleId: string;
  description: string;
}

const CABINET_PROFILES: IRProfile[] = [
  { keywords: ['4x12', '1960', 'marshall', 'g12t'], cabinetId: 'marshall-1960ab', moduleId: 'cabinet', description: 'B&F 1960A/B 4x12 — G12T-75' },
  { keywords: ['v30', 'vintage', '30', 'mesa', 'rectifier'], cabinetId: 'mesa-rect-std-4x12', moduleId: 'cabinet', description: 'B&F Rectifier 4x12 — V30s' },
  { keywords: ['greenback', 'g12m', 'marshall'], cabinetId: 'marshall-1960ax', moduleId: 'cabinet', description: 'B&F 1960AX 4x12 — Greenbacks' },
  { keywords: ['twin', '2x12', 'fender', 'jensen'], cabinetId: 'fender-65-twin-2x12', moduleId: 'cabinet', description: 'B&F Twin 2x12 — C12K' },
  { keywords: ['ac30', '2x12', 'vox', 'alnico', 'blue'], cabinetId: 'vox-ac30-2x12', moduleId: 'cabinet', description: 'B&F AC30 2x12 — Alnico Blue' },
  { keywords: ['1x12', 'hot rod', 'fender'], cabinetId: 'fender-hotrod-1x12', moduleId: 'cabinet', description: 'B&F Hot Rod 1x12 — G12P-80' },
  { keywords: ['svt', '8x10', 'ampeg'], cabinetId: 'ampeg-svt-810e', moduleId: 'cabinet', description: 'B&F SVT-810E 8x10 — 10"' },
  { keywords: ['4x10', 'bassman', 'fender'], cabinetId: 'fender-bassman-410', moduleId: 'cabinet', description: 'B&F Bassman 410 4x10' },
  { keywords: ['orange', 'ppc412', '4x12'], cabinetId: 'orange-ppc412', moduleId: 'cabinet', description: 'B&F PPC412 4x12 — V30s' },
  { keywords: ['5150', 'evh', '4x12'], cabinetId: 'evh-5150iii-4x12', moduleId: 'cabinet', description: 'B&F 5150 III 4x12' },
];

// ─── 核心引擎 ───────────────────────────────────────────────────────

/** 从文件名中提取关键词 */
function extractKeywords(filename: string): string[] {
  const name = filename.replace(/\.(nam|ir|wav|aiff|flac|zip)$/i, '');
  const parts = name.split(/[-_\.\s,()]+/);
  return parts
    .map(p => p.toLowerCase())
    .filter(p => p.length > 0 && !/^\d+$/.test(p));
}

/** 计算匹配分数 */
function matchScore(keywords: string[], profile: string[]): number {
  let score = 0;
  for (const pk of profile) {
    for (const k of keywords) {
      if (k === pk) score += 3;
      else if (k.includes(pk) || pk.includes(k)) score += 1;
    }
  }
  return score;
}

/** 识别 NAM 文件 */
export function identifyNAMFile(filename: string, fileSize: number): NAMIRResult {
  const keywords = extractKeywords(filename);
  const isNam = /\.nam$/i.test(filename);
  const isAida = /aida-x/i.test(filename);
  const archType: NAMArchType = /a1/i.test(filename) ? 'A1' : /a2/i.test(filename) ? 'A2' : 'unknown';

  // 优先匹配放大器
  let bestAmp: { profile: AmpProfile; score: number } | null = null;
  for (const profile of AMP_PROFILES) {
    const score = matchScore(keywords, profile.keywords);
    if (score > (bestAmp?.score ?? 0)) {
      bestAmp = { profile, score };
    }
  }

  // 匹配单块
  let bestPedal: { profile: AmpProfile; score: number } | null = null;
  for (const profile of PEDAL_PROFILES) {
    const score = matchScore(keywords, profile.keywords);
    if (score > (bestPedal?.score ?? 0)) {
      bestPedal = { profile, score };
    }
  }

  const bestMatch = bestAmp && bestPedal
    ? (bestAmp.score >= bestPedal.score ? bestAmp : bestPedal)
    : (bestAmp ?? bestPedal);

  const info: NAMFileInfo = {
    filename,
    fileSize,
    archType,
    modelName: bestMatch?.profile.description ?? filename.replace(/\.\w+$/, ''),
    confidence: bestMatch ? Math.min(1, bestMatch.score / 5) : 0,
  };

  const registerSuggestions: RegisterSuggestion[] = [];
  let recommendedModule = bestMatch?.profile.moduleId ?? 'amp-head';
  let recommendedSubModel = bestMatch?.profile.subModelId ?? 'fender-twin';
  let description = bestMatch?.profile.description ?? `NAM Model: ${filename}`;

  if (bestMatch) {
    // 生成寄存器建议
    const moduleMap = MODULE_PARAM_MAP[bestMatch.profile.moduleId];
    if (moduleMap) {
      for (const [knob, normVal] of Object.entries(bestMatch.profile.knobs)) {
        const def = moduleMap[knob];
        if (def) {
          registerSuggestions.push({
            regAddr: def.regAddr,
            value: normalizedToRegValue(normVal, def),
            label: knob,
            moduleId: bestMatch.profile.moduleId,
            knobLabel: knob,
          });
        }
      }
    }
  }

  // 如果是单块，添加旁路(bypass)建议 — 开启所有相关模块
  if (bestPedal && bestAmp && bestPedal.score >= bestAmp.score) {
    registerSuggestions.push({
      regAddr: MODULE_PARAM_MAP[bestPedal.profile.moduleId]?.[Object.keys(bestPedal.profile.knobs)[0]]?.regAddr ?? 42,
      value: 0,
      label: `${bestPedal.profile.moduleId} ON`,
      moduleId: bestPedal.profile.moduleId,
      knobLabel: 'BYPASS',
    });
  }

  return {
    type: 'nam',
    info,
    registerSuggestions,
    recommendedModule,
    recommendedSubModel,
    description,
    confidence: info.confidence,
  };
}

/** 识别 IR 文件 */
export function identifyIRFile(filename: string, fileSize: number, sampleRate?: number): NAMIRResult {
  const keywords = extractKeywords(filename);

  let bestCab: { profile: IRProfile; score: number } | null = null;
  for (const profile of CABINET_PROFILES) {
    const score = matchScore(keywords, profile.keywords);
    if (score > (bestCab?.score ?? 0)) {
      bestCab = { profile, score };
    }
  }

  // 估计 IR 时长 (基于文件名或默认)
  const lengthMs = sampleRate ? Math.round(fileSize / (sampleRate * 4) * 1000) : 200;

  // 估计麦克风
  const micKeywords = ['sm57', 'sm58', 'md421', 'u87', 'c414', 'e906', 'md409', 'i5', 'sm7b', 'nt1', 'km184'];
  const estimatedMic = micKeywords.find(m => keywords.some(k => k.includes(m) || m.includes(k))) || 'SM57 (默认)';

  const info: IRFileInfo = {
    filename,
    fileSize,
    sampleRate: sampleRate ?? 48000,
    lengthMs,
    estimatedCabinet: bestCab?.profile.description ?? 'Generic Cabinet',
    estimatedMic,
    confidence: bestCab ? Math.min(1, bestCab.score / 3) : 0.1,
  };

  const registerSuggestions: RegisterSuggestion[] = [];
  let recommendedModule = 'cabinet';
  let recommendedSubModel = bestCab?.profile.cabinetId ?? 'marshall-1960ab';
  let description = bestCab?.profile.description ?? `IR: ${filename}`;

  // IR 主要通过箱体选择和 speaker out 控制
  registerSuggestions.push({
    regAddr: 260, // M1OutMute
    value: 0,     // UnMute
    label: 'M1 Output UnMute',
    moduleId: 'cabinet',
    knobLabel: 'MUTE',
  });

  return {
    type: 'ir',
    info,
    registerSuggestions,
    recommendedModule,
    recommendedSubModel,
    description,
    confidence: info.confidence,
  };
}

/** 通用文件识别入口 */
export function identifyFile(filename: string, fileSize: number, sampleRate?: number): NAMIRResult {
  const ext = filename.split('.').pop()?.toLowerCase();

  if (ext === 'nam' || ext === 'aida-x') {
    return identifyNAMFile(filename, fileSize);
  }
  if (ext === 'ir' || ext === 'wav' || ext === 'aiff' || ext === 'flac') {
    return identifyIRFile(filename, fileSize, sampleRate);
  }

  // 尝试从文件名推断
  if (/\.nam|aida|amp|drive|dist/i.test(filename)) {
    return identifyNAMFile(filename, fileSize);
  }
  if (/ir|cab|mic|speaker|4x12|2x12|1x12|8x10/i.test(filename)) {
    return identifyIRFile(filename, fileSize, sampleRate);
  }

  return {
    type: 'unknown',
    info: null,
    registerSuggestions: [],
    recommendedModule: 'amp-head',
    recommendedSubModel: 'fender-twin',
    description: `Unknown file: ${filename}`,
    confidence: 0,
  };
}

/** 根据 NAM/IR 结果生成完整模块建议 */
export function applyNAMToModules(result: NAMIRResult): Record<string, Record<string, number>> {
  const moduleSettings: Record<string, Record<string, number>> = {};

  // 应用推荐子模型
  moduleSettings['_subModel'] = {
    [result.recommendedModule]: result.recommendedSubModel as any,
  };

  // 分组寄存器建议
  for (const suggestion of result.registerSuggestions) {
    if (!moduleSettings[suggestion.moduleId]) {
      moduleSettings[suggestion.moduleId] = {};
    }
    moduleSettings[suggestion.moduleId][suggestion.knobLabel] = suggestion.value;
  }

  return moduleSettings;
}
