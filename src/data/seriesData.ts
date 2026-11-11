/**
 * 过载/失真系列注册表 (v27 型号化重构).
 *
 * 每个系列 = 若干具体硬件型号 (models[0] 为主型号, 其余为吸收并入的社区种子型号).
 * 系列 UI 显示英文系列名 (uiNameEn, 如 "TS Series"); Slot B 列出系列内具体型号.
 * 型号组合键由 seriesModelKey() 生成, 形如 "中频过载/TS808".
 *
 * 型号组合键物化进既有三张表 (OVERDRIVE_DEFAULTS / SUB_MODEL_FORMULAS / SUB_MODEL_PRE_EQ,
 * 见 presetData.ts / parameterMap.ts 顶层), 热路径 (generatePresetRegisters /
 * buildPreEqOverride / handleSubModelChange / sanitizeSubModelNames) 零改动.
 *
 * 注意: uiName / label 不得含 "/" (splitSubModelName 以末个 "/" 切分).
 */

export interface SeriesModel {
  /** 组合键后缀 (Slot B 显示名, 无品牌), 如 'TS808' */
  label: string;
  /** 真实硬件组合键 (寄存器数据源), 如 'B&F NAM Ibanez TS808/Ibanez TS808' */
  key: string;
}

export interface SeriesFamily {
  id: string;
  moduleId: 'overdrive' | 'dist';
  mode: 'guitar' | 'bass';
  /** 品牌无关数据名 (组合键前缀, 稳定不迁移), 如 '中频过载' */
  uiName: string;
  /** 英文系列 UI 名, 如 'TS Series' */
  uiNameEn: string;
  /** 模块内分组标签 (选择器表头) */
  group: string;
  /** 系列内具体硬件型号 (首个 = 主型号) */
  models: SeriesModel[];
}

export const SERIES_REGISTRY: SeriesFamily[] = [
  // ═══ 吉他 OD (模块 overdrive, 6 系) ═════════════════════════════
  {
    id: 'mid-boost-od', moduleId: 'overdrive', mode: 'guitar', uiName: '中频过载', uiNameEn: 'TS Series', group: '中频峰',
    models: [
      { label: 'TS808', key: 'B&F NAM Ibanez TS808/Ibanez TS808' },
      { label: 'TS9', key: 'B&F NAM Ibanez TS9/Ibanez TS9' },
      { label: 'SD-1', key: 'B&F NAM Boss SD-1/Boss SD-1' },
      { label: 'Precision Drive', key: 'B&F NAM Horizon Precision Drive/Horizon Precision Drive' },
      { label: 'OD808', key: 'B&F NAM Maxon OD808/Maxon OD808' },
    ],
  },
  {
    id: 'transparent-od', moduleId: 'overdrive', mode: 'guitar', uiName: '透明过载', uiNameEn: 'BD Series', group: '透明系',
    models: [
      { label: 'BD-2', key: 'B&F NAM Boss BD-2/Boss BD-2' },
      { label: 'OD-3', key: 'B&F NAM Boss OD-3/Boss OD-3' },
    ],
  },
  {
    id: 'light-od', moduleId: 'overdrive', mode: 'guitar', uiName: '轻过载', uiNameEn: 'Klon Series', group: '轻过载',
    models: [
      { label: 'Klon Centaur', key: 'B&F NAM Klon Centaur/Klon Centaur' },
      { label: 'Tumnus', key: 'B&F NAM Wampler Tumnus/Wampler Tumnus' },
    ],
  },
  {
    id: 'rat-od', moduleId: 'overdrive', mode: 'guitar', uiName: '失真态过载', uiNameEn: 'RAT Series', group: '重过载',
    models: [
      { label: 'RAT', key: 'B&F NAM ProCo RAT/ProCo RAT' },
      { label: 'Turbo RAT', key: 'B&F NAM ProCo Turbo RAT/ProCo Turbo RAT' },
    ],
  },
  {
    id: 'mosfet-od', moduleId: 'overdrive', mode: 'guitar', uiName: 'MOSFET 过载', uiNameEn: 'OCD Series', group: '重过载',
    models: [
      { label: 'OCD', key: 'B&F NAM Fulltone OCD/Fulltone OCD' },
    ],
  },
  {
    id: 'marshall-od', moduleId: 'overdrive', mode: 'guitar', uiName: 'Marshall 透明', uiNameEn: 'MG Series', group: '透明系',
    models: [
      { label: 'Morning Glory', key: 'B&F NAM JHS Morning Glory/JHS Morning Glory' },
    ],
  },

  { id: "zw44-od", moduleId: "overdrive", mode: "guitar", uiName: "轰鸣过载", uiNameEn: "ZW Series", group: "重过载",
    models: [{ label: 'ZW44', key: 'B&F NAM MXR ZW44 Wylde Overdrive/MXR ZW44 Wylde Overdrive' }],
  },
  { id: "805-od", moduleId: "overdrive", mode: "guitar", uiName: "高解析过载", uiNameEn: "805 Series", group: "透明系",
    models: [{ label: '805', key: 'B&F NAM Seymour Duncan 805/Seymour Duncan 805' }],
  },
  { id: "dirtytree-od", moduleId: "overdrive", mode: "guitar", uiName: "紧致过载", uiNameEn: "DT Series", group: "重过载",
    models: [{ label: 'Dirty Tree', key: 'B&F NAM Fortin Dirty Tree/Fortin Dirty Tree' }],
  },
  { id: "mxr77-od", moduleId: "overdrive", mode: "guitar", uiName: "英式过载", uiNameEn: "MGX Series", group: "透明系",
    models: [{ label: 'M77', key: 'B&F NAM MXR M77/MXR M77' }],
  },
  { id: "gladio-od", moduleId: "overdrive", mode: "guitar", uiName: "双级过载", uiNameEn: "4K Series", group: "轻过载",
    models: [{ label: 'Gladio', key: 'B&F NAM Ly Pedals Gladio/Ly Pedals Gladio' }, { label: 'Protein', key: 'B&F NAM Browne Protein/Browne Protein' }, { label: 'King of Tone', key: 'B&F NAM King of Tone/King of Tone' }],
  },
  { id: "plumes-od", moduleId: "overdrive", mode: "guitar", uiName: "双模过载", uiNameEn: "Plumes Series", group: "中频峰",
    models: [{ label: 'Plumes', key: 'B&F NAM EarthQuaker Plumes/EarthQuaker Plumes' }],
  },

  // ═══ 吉他 DIST (模块 dist, 5 系) ══════════════════════════════
  {
    id: 'classic-dist', moduleId: 'dist', mode: 'guitar', uiName: '经典失真', uiNameEn: 'DS Series', group: '经典失真',
    models: [
      { label: 'DS-1', key: 'B&F NAM Boss DS-1/Boss DS-1' },
      { label: 'DS-2', key: 'B&F NAM Boss DS-2/Boss DS-2' },
      { label: 'OS-2', key: 'B&F NAM Boss OS-2/Boss OS-2' },
    ],
  },
  {
    id: 'metal-dist', moduleId: 'dist', mode: 'guitar', uiName: '现代金属', uiNameEn: 'MT Series', group: '金属',
    models: [
      { label: 'MT-2', key: 'B&F NAM Boss MT-2/Boss MT-2' },
    ],
  },
  {
    id: 'saw-dist', moduleId: 'dist', mode: 'guitar', uiName: '锯条失真', uiNameEn: 'HM Series', group: '金属',
    models: [
      { label: 'HM-2', key: 'B&F NAM Boss HM-2/Boss HM-2' },
    ],
  },
  {
    id: 'fuzz-dist', moduleId: 'dist', mode: 'guitar', uiName: '法兹', uiNameEn: 'Muff Series', group: '法兹',
    models: [
      { label: 'Big Muff', key: 'B&F NAM EHX Big Muff/EHX Big Muff' },
    ],
  },
  {
    id: 'retro-dist', moduleId: 'dist', mode: 'guitar', uiName: '复古失真', uiNameEn: 'D+ Series', group: '复古失真',
    models: [
      { label: 'Distortion+', key: 'B&F NAM MXR Distortion+/MXR Distortion+' },
    ],
  },

  { id: "fortin-dist", moduleId: "dist", mode: "guitar", uiName: "Fortin 金属", uiNameEn: "Fortin Series", group: "金属",
    models: [{ label: 'Grind', key: 'B&F NAM Fortin Grind/Fortin Grind' }, { label: 'Meshuggah', key: 'B&F NAM Fortin Meshuggah/Fortin Meshuggah' }],
  },
  { id: "g3-dist", moduleId: "dist", mode: "guitar", uiName: "高增益金属", uiNameEn: "G3 Series", group: "金属",
    models: [{ label: 'G3', key: 'B&F NAM Revv G3/Revv G3' }],
  },
  { id: "am-dist", moduleId: "dist", mode: "guitar", uiName: "美式金属", uiNameEn: "AM Series", group: "金属",
    models: [{ label: 'FX56', key: 'B&F NAM DOD FX56 American Metal/DOD FX56 American Metal' }, { label: 'Rockman X100', key: 'B&F NAM MXR Rockman X100/MXR Rockman X100' }],
  },
  { id: "mm-dist", moduleId: "dist", mode: "guitar", uiName: "重型金属", uiNameEn: "MM Series", group: "金属",
    models: [{ label: 'Metal Muff', key: 'B&F NAM Boss Metal Muff/Boss Metal Muff' }],
  },

  // ═══ 贝斯 (overdrive 3 系 + dist 1 系) ═════════════════════════
  {
    id: 'bass-di', moduleId: 'overdrive', mode: 'bass', uiName: '前级 DI', uiNameEn: 'TH Series', group: '前级',
    models: [
      { label: 'Tone Hammer', key: 'B&F NAM Aguilar Tone Hammer/Aguilar Tone Hammer' },
      { label: 'SansAmp', key: 'B&F NAM Tech21 SansAmp/Tech21 SansAmp' },
      { label: 'BASSRIG', key: 'B&F NAM Origin BASSRIG/Origin BASSRIG' },
    ],
  },
  {
    id: 'bass-drive', moduleId: 'overdrive', mode: 'bass', uiName: '贝斯过载', uiNameEn: 'B3K Series', group: '贝斯过载',
    models: [
      { label: 'B3K', key: 'B&F NAM Darkglass B3K/Darkglass B3K' },
      { label: 'Bass Soul Food', key: 'B&F NAM EHX Bass Soul Food/EHX Bass Soul Food' },
      { label: 'Pork & Pickle', key: 'B&F NAM Way Huge Pork & Pickle/Way Huge Pork & Pickle' },
    ],
  },
  {
    id: 'bass-retro', moduleId: 'overdrive', mode: 'bass', uiName: '贝斯复古', uiNameEn: 'M80 Series', group: '贝斯复古',
    models: [
      { label: 'M80', key: 'B&F NAM MXR M80/MXR M80' },
      { label: 'Brassmaster', key: 'B&F NAM Behringer Brassmaster/Behringer Brassmaster' },
    ],
  },
  {
    id: 'bass-fuzz', moduleId: 'dist', mode: 'bass', uiName: '贝斯失真法兹', uiNameEn: 'X7 Series', group: '贝斯法兹',
    models: [
      { label: 'X7', key: 'B&F NAM Darkglass X7/Darkglass X7' },
      { label: 'Bass Big Muff', key: 'B&F NAM EHX Bass Big Muff/EHX Bass Big Muff' },
      { label: 'Mastotron', key: 'B&F NAM ZVEX Mastotron/ZVEX Mastotron' },
    ],
  },
  { id: "dg-dist", moduleId: "dist", mode: "bass", uiName: "贝斯 DG", uiNameEn: "DG Series", group: "贝斯失真",
    models: [{ label: 'B7K Ultra', key: 'B&F NAM Darkglass B7K Ultra/Darkglass B7K Ultra' }, { label: 'Ultra V Bass', key: 'B&F NAM Darkglass Ultra V Bass/Darkglass Ultra V Bass' }],
  },
];

/** 型号组合键 = "uiName/label", 如 "中频过载/TS808" */
export function seriesModelKey(s: SeriesFamily, m: SeriesModel): string {
  return `${s.uiName}/${m.label}`;
}

/** 所有型号组合键 → { baseKey, moduleId } (isNamModel / sanitize / 物化共用) */
export const SERIES_BY_COMPOSED: Record<string, { baseKey: string; moduleId: 'overdrive' | 'dist' }> = {};
for (const s of SERIES_REGISTRY) {
  for (const m of s.models) {
    SERIES_BY_COMPOSED[seriesModelKey(s, m)] = { baseKey: s.models[0].key, moduleId: s.moduleId };
  }
}
