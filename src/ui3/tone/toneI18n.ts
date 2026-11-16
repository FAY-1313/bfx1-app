import type { Lang } from '../../i18n';
import { formatKnobValue, type ToneFamily, type ToneRow } from './toneCatalog';

type Dict = Record<string, string>;

const en: Dict = {
  quick: 'QUICK',
  drive: 'DRIVE',
  fx: 'FX',
  gate: 'NOISE',
  boost: 'BOOST',
  master: 'MASTER',
  gateThreshold: 'THRESHOLD',
  boostLevel: 'LEVEL',
  outputLevel: 'OUTPUT',
  compressor: 'COMPRESSOR',
  overdrive: 'OVERDRIVE',
  amp: 'AMP HEAD',
  cabinet: 'CABINET',
  chorus: 'CHORUS',
  delay: 'DELAY',
  reverb: 'REVERB',

  mute: 'MUTE',
  unmute: 'UNMUTE',
  on: 'ON',
  off: 'OFF',
  selectComp: 'SELECT COMPRESSOR',
  selectOd: 'SELECT OVERDRIVE',
  selectAmp: 'SELECT AMP HEAD',
  selectCab: 'SELECT CABINET',
  selectChorus: 'SELECT CHORUS',
  selectDelay: 'SELECT DELAY',
  selectReverb: 'SELECT REVERB',
  extended: 'EXTENDED PARAMETERS',
  extendedHint: 'This amp exposes one extra parameter outside the seven front-panel slots.',
  search: 'Search model or capture…',
  all: 'ALL',
  guitar: 'GUITAR',
  bass: 'BASS',
  captures: 'CAPTURES',
  noResults: 'No matches',
  knobs: 'KNOBS',
  ir: 'IR',
  captureDefault: 'DEFAULT',
  captureAlt: 'CAPTURE',
  mic: 'MIC',
  previous: 'Previous',
  next: 'Next',
  close: 'CLOSE',
  notConnected: 'Not connected — nothing was sent',
  writeFailed: 'Write failed — check the device connection',
  loading: 'LOADING…',
  ampPower: 'Amp power',
  cabPower: 'Cabinet power',
  openCab: 'Show cabinet',
  closeCab: 'Hide cabinet',
  fpHint: 'Tap the amp image to browse 25 models',
  modelsCount: '{n} CAPTURES',
  groups: 'GROUPS',
  defaultGroup: 'ALL',
  ampGroupClean: 'CLEAN',
  ampGroupCrunch: 'CRUNCH',
  ampGroupHigh: 'HIGH GAIN',
  ampGroupBass: 'AMP HEADS',
  odGroupTs: 'TS SERIES',
  odGroupTransparent: 'TRANSPARENT',
  odGroupLight: 'LIGHT OD',
  odGroupHeavy: 'HEAVY OD',
  odGroupMid: 'MID BOOST',
  odGroupBassPre: 'BASS PRE',
  odGroupBassOd: 'BASS OD',
  odGroupBassRetro: 'BASS RETRO',
};

const zh: Dict = {
  quick: '快速调节',
  drive: '驱动',
  fx: '周边',
  gate: '噪声门',
  boost: '激励',
  master: '总音量',
  gateThreshold: '门限',
  boostLevel: '增益',
  outputLevel: '输出',
  compressor: '压缩器',
  overdrive: '过载',
  amp: '箱头',
  cabinet: '箱体',
  chorus: '合唱',
  delay: '延迟',
  reverb: '混响',

  mute: '静音',
  unmute: '取消静音',
  on: '开',
  off: '关',
  selectComp: '选择压缩器',
  selectOd: '选择过载',
  selectAmp: '选择箱头',
  selectCab: '选择箱体',
  selectChorus: '选择合唱',
  selectDelay: '选择延迟',
  selectReverb: '选择混响',
  extended: '扩展参数',
  extendedHint: '该箱头有一颗旋钮位于面板七槽之外。',
  search: '搜索型号或捕获…',
  all: '全部',
  guitar: '吉他',
  bass: '贝斯',
  captures: '捕获',
  noResults: '没有匹配项',
  knobs: '旋钮',
  ir: 'IR',
  captureDefault: '默认',
  captureAlt: '捕获',
  mic: '麦克风',
  previous: '上一个',
  next: '下一个',
  close: '关闭',
  notConnected: '未连接设备，无法下发',
  writeFailed: '写入失败，请检查设备连接',
  loading: '加载中…',
  ampPower: '箱头电源',
  cabPower: '箱体开关',
  openCab: '展开箱体',
  closeCab: '收起箱体',
  fpHint: '点箱头图片浏览 25 个型号',
  modelsCount: '{n} 个捕获',
  groups: '分组',
  defaultGroup: '全部',
  ampGroupClean: '清音',
  ampGroupCrunch: '过载',
  ampGroupHigh: '高增益',
  ampGroupBass: '箱头',
  odGroupTs: 'TS 系列',
  odGroupTransparent: '透明系',
  odGroupLight: '轻过载',
  odGroupHeavy: '重过载',
  odGroupMid: '中频激励',
  odGroupBassPre: '贝斯前级',
  odGroupBassOd: '贝斯过载',
  odGroupBassRetro: '贝斯复古',
};

const DICT: Record<Lang, Dict> = { en, zh };

export function t3(lang: Lang, key: string, vars?: Record<string, string | number>): string {
  let s = DICT[lang][key] ?? DICT.en[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
  return s;
}

export function familyTitle(lang: Lang, family: ToneFamily): string {
  const key: Record<ToneFamily, string> = {
    compressor: 'compressor',
    overdrive: 'overdrive',
    'amp-head': 'amp',
    cabinet: 'cabinet',
    chorus: 'chorus',
    delay: 'delay',
    reverb: 'reverb',
    dist: 'overdrive',
  };
  return t3(lang, key[family]);
}

export function pickerTitle(lang: Lang, family: ToneFamily): string {
  const key: Record<ToneFamily, string> = {
    compressor: 'selectComp',
    overdrive: 'selectOd',
    'amp-head': 'selectAmp',
    cabinet: 'selectCab',
    chorus: 'selectChorus',
    delay: 'selectDelay',
    reverb: 'selectReverb',
    dist: 'selectOd',
  };
  return t3(lang, key[family]);
}

export function ampGroupLabel(lang: Lang, group: string): string {
  switch (group) {
    case 'CLEAN 清音': return t3(lang, 'ampGroupClean');
    case 'CRUNCH 过载': return t3(lang, 'ampGroupCrunch');
    case 'HIGH GAIN 高增益': return t3(lang, 'ampGroupHigh');
    case '箱头': return t3(lang, 'ampGroupBass');
    default: return group;
  }
}

export function odGroupLabel(lang: Lang, group: string): string {
  const map: Record<string, string> = {
    'TS SERIES': 'odGroupTs',
    TRANSPARENT: 'odGroupTransparent',
    'LIGHT OD': 'odGroupLight',
    'HEAVY OD': 'odGroupHeavy',
    'MID BOOST': 'odGroupMid',
    'BASS PRE': 'odGroupBassPre',
    'BASS OD': 'odGroupBassOd',
    'BASS RETRO': 'odGroupBassRetro',
  };
  const key = map[group];
  return key ? t3(lang, key) : group;
}

export function groupLabel(lang: Lang, family: ToneFamily, group: string): string {
  if (family === 'amp-head') return ampGroupLabel(lang, group);
  if (family === 'overdrive' || family === 'dist') return odGroupLabel(lang, group);
  return group;
}

/** 卡片 / 列表主标题：箱头用硬件名，箱体用「配置 / 音色」，其余用捕获 / 型号名 */
export function rowPrimary(lang: Lang, row: ToneRow): string {
  if (row.family === 'amp-head') {
    const idx = row.captureIndex ?? 0;
    return idx > 0 ? `${row.hardware} #${idx + 1}` : row.hardware;
  }
  if (row.family === 'cabinet' && !row.capture) {
    return `${row.hardware} / ${row.title}`;
  }
  return row.title;
}

/** 二级捕获行的名字：箱头默认捕获显示 DEFAULT */
export function rowCaptureName(lang: Lang, row: ToneRow): string {
  if (row.family === 'amp-head') {
    const idx = row.captureIndex ?? 0;
    if (idx === 0) return t3(lang, 'captureDefault');
    return `${t3(lang, 'captureAlt')} ${idx + 1}`;
  }
  return row.title;
}

/** 子型号选择器里型号下方的一句介绍 */
export function rowDesc(lang: Lang, row: ToneRow): string {
  if (!row.desc) return '';
  return lang === 'zh' ? row.desc.zh : row.desc.en;
}

export function rowSubtitle(lang: Lang, row: ToneRow): string {
  /* ★ 2026-11-16（用户要求）：子选框里不再显示「35-BAND」「N KNOBS」这类技术介绍，
     只保留型号所属分组 / 捕获名 —— 型号本身已经说明一切。 */
  if (row.family === 'cabinet') {
    if (!row.capture) return row.group ?? '';
    return `${row.capture ?? ''} · ${row.group}`;
  }
  if (row.family === 'amp-head') {
    return row.group ? ampGroupLabel(lang, row.group) : '';
  }
  if (row.family === 'overdrive' || row.family === 'dist') {
    const grp = row.group ? odGroupLabel(lang, row.group) : '';
    /* 「TS Series」+「TS 系列」这类同义组合只保留一个，避免出现 “TS Series · TS SERIES” */
    const norm = (s: string) => s.toLowerCase().replace(/\s*(series|系列)\s*$/, '').replace(/[^a-z0-9]/g, '');
    if (grp && norm(row.hardware) === norm(grp)) return grp;
    return [row.hardware, grp].filter(Boolean).join(' · ');
  }
  return '';
}

export function modelsCountText(lang: Lang, n: number, family?: ToneFamily): string {
  /* 新 OD 也是一型号一音色；旧的 DIST 仍然是 capture 列表。 */
  const models = family === 'amp-head' || family === 'cabinet' || family === 'overdrive';
  if (lang === 'en') return `${n} ${models ? (n === 1 ? 'MODEL' : 'MODELS') : (n === 1 ? 'CAPTURE' : 'CAPTURES')}`;
  return models ? `${n} 个型号` : `${n} 个捕获`;
}

export function knobValueText(row: ToneRow, label: string, norm: number): string {
  return formatKnobValue(row, label, norm);
}

/** 从箱体捕获名中提取麦克风（显示用） */
export function micOf(row: ToneRow): string {
  const label = row.capture ?? '';
  const m = label.match(/[A-Z]{1,3}\d{2,3}[A-Za-z]?/);
  return m ? m[0] : t3('en', 'ir');
}
