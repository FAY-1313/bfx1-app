/**
 * UI 层精简清单 —— 只减少下拉列表里的显示项，不改任何数据、参数、引擎。
 *
 * 背景：箱头/箱体条目过多（吉他合计 361 条），调试时翻找困难。此处按
 * 「去掉近似款、保留经典款」的口径做渲染层过滤；`pedalData.ts` 里的型号、
 * 捕获、参数表（AMP_HEAD_HIDDEN / AMP_PRE_EQ2 / CABINET_PEQ）一律原样保留，
 * 因此历史预设、官方音色、已保存频道的参数都不受影响。
 *
 * 恢复全量：把 UI_TRIM_ON 置为 false 即可，无需改动其它文件。
 *
 * 依赖核查（2026-09-26，tools/_trim_impact.py，错误数 0）：
 *   - builtinPresets.ts（内置 16 预设）：0 冲突，引用项全部落在保留清单内
 *   - officialTones.ts（官方音色库）：4 处引用被精简 —— 箱体 Orange 2x12 V30、
 *     中频过载/OD808、中频过载/Precision Drive、经典失真/DS-2。这些由下方
 *     applyUiTrim 的 pinned 兜底处理：加载对应音色时型号/捕获会被临时补回列表，
 *     UI 显示与正在生效的参数保持一致。
 *
 * 方案文档：04_开发文档/A_UI与功能方案/UI精简方案_B档_只改UI层_20260926.md
 */
import { ModuleConfig, SubModel, splitSubModelName } from './pedalData';

/** 总开关：false = 完全不过滤（行为与改造前一致） */
export const UI_TRIM_ON = true;

/** 型号名 -> 保留的捕获 pos 清单；型号未出现在表中 = 该型号从 UI 隐藏 */
type KeepSpec = Record<string, string[]>;

/** 模块 id -> 保留清单。未列出的模块 = 不精简（Compressor / Chorus / Delay / Reverb 等） */
const KEEP: Record<string, KeepSpec> = {};

// ─── 箱头（吉他 37 → 19，贝斯 19 → 9）──────────────────────────────────
// 口径：CLEAN / CRUNCH / HIGH GAIN 每个风格留经典代表；同机不同名（Peavey 6505 与
// 5150 是同一台机器）只留一款，其余型号随捕获列表精简掉。
//
// 2026-09-26 v15 测试轮：吉他型号保留「第 1 档 + _2 档」两档。
//   第 1 档（pos 无数字后缀）= v14 电路推导值；
//   _2 档（pos 带 _N 后缀）  = 未被 v14 覆盖的原 NAM 捕获，标注 "· NAM" 便于对比试听。
//   Revv Generator 保留全部 5 档（5 个捕获互不相同，是不同通道/增益档）。
//   贝斯型号未动（其 _N 档同为 NAM 值，与本次电路/NAM 对比无关）。
KEEP['amp-head'] = {
  // ── CLEAN 清音 ──
  'B&F NAM Dumble ODS': ['Dumble ODS', 'Dumble ODS_2'],
  'B&F NAM Fender Bassman': ['Fender Bassman', 'Fender Bassman_2'],
  'B&F NAM Fender Twin Reverb': ['Fender Twin Reverb', 'Fender Twin Reverb_2'],
  'B&F NAM Hiwatt': ['Hiwatt', 'Hiwatt_2'],
  'B&F NAM Roland JC120': ['Roland JC120'],
  // ── CRUNCH 过载 ──
  'B&F NAM Vox AC30': ['Vox AC30', 'Vox AC30_2'],
  'B&F NAM Friedman BE': ['Friedman BE', 'Friedman BE_2'],
  'B&F NAM Marshall JCM800': ['Marshall JCM800', 'Marshall JCM800_2'],
  'B&F NAM Marshall Plexi': ['Marshall Plexi', 'Marshall Plexi_2'],
  'B&F NAM Orange Rockerverb': ['Orange Rockerverb', 'Orange Rockerverb_2'],
  // ── HIGH GAIN 高增益 ──
  'B&F NAM Bogner Ecstasy': ['Bogner Ecstasy', 'Bogner Ecstasy_2'],
  'B&F NAM Diezel VH4': ['Diezel VH4', 'Diezel VH4_2'],
  'B&F NAM ENGL Savage': ['ENGL Savage', 'ENGL Savage_2'],
  'B&F NAM Mesa Dual Rectifier': ['Mesa Dual Rectifier', 'Mesa Dual Rectifier_2'],
  'B&F NAM Mesa Mark': ['Mesa Mark', 'Mesa Mark_2'],
  'B&F NAM Peavey 5150': ['Peavey 5150', 'Peavey 5150_2'],
  'B&F NAM EVH 5150III': ['EVH 5150III', 'EVH 5150III_2'],
  'B&F NAM Revv Generator': ['Revv Generator', 'Revv Generator_2', 'Revv Generator_3', 'Revv Generator_4', 'Revv Generator_5'],
  'B&F NAM Soldano SLO': ['Soldano SLO', 'Soldano SLO_2'],
  // ── 贝斯箱头 ──
  'B&F NAM Ampeg SVT-CL': ['Ampeg SVT-CL'],
  'B&F NAM Ampeg B15': ['Ampeg B15'],
  'B&F NAM Ampeg SVT-4': ['Ampeg SVT-4'],
  'B&F NAM Gallien-Krueger': ['Gallien-Krueger'],
  'B&F NAM Hartke': ['Hartke'],
  'B&F NAM Markbass Little Mark': ['Markbass Little Mark'],
  'B&F NAM Darkglass Microtubes 900': ['Darkglass Microtubes 900'],
  'B&F NAM Fender Rumble': ['Fender Rumble'],
  'B&F NAM Mesa Subway D800': ['Mesa Subway D800'],
};

// ─── 箱体（吉他 63 → 14，贝斯 18 → 7）──────────────────────────────────
// 选择口径：不同品牌、不同喇叭各留一个代表；内置预设与官方音色库依赖项优先保留。
KEEP.cabinet = {
  // Fender 系（Jensen / Oxford / Tweed 15" / 4x10）
  'B&F NAM 1966 Bassman with Jensen C12N': ['Cone'],
  'B&F NAM 1971 Fender Twin Reverb 2x12 Oxford 12T6-10': ['Distant 24In'],
  "B&F NAM TF '56 TWEED PRO 1X15 C15N": ['Enhanced'],
  'B&F NAM BLFR LR 4x10': ['ST170 3.00in 3.0in'],
  // Marshall 系（G12T-75 / Greenback）
  'B&F NAM Marshall 1960': ['421'],
  'B&F NAM Marshall 1972 1960a 4x12 custom': ['Celestian Greenbacks -Airsong'],
  // 现代高增益 / 其他品牌
  'B&F NAM DB FRAMUS 4X12 G12M': ['(无话筒)'],
  'B&F NAM Mesa Boogie Rectifier OS 4x12 V30': ['R121/57'],
  'B&F NAM Carvin 4x12': ['Eminence Carvin British 100'],
  'B&F NAM Orange 4x12 V30 shure57 cn': ['(无话筒)'],
  'B&F NAM TJ3 66AC30 SLVR': ['121-545'],
  'B&F NAM EVH 5150 iii': ['Airsong'],
  'B&F NAM DR Z Maz 38 Sr 2x12': ['G12H anniversary + V30 UK -Airsong'],
  'B&F NAM Mesa Recto 212 Karnivore/V30': ['SM57 (vivahatex)'],
  // 贝斯箱体
  'B&F NAM Ampeg 8x10': ['4033 AH'],
  'B&F NAM Ampeg B15N': ['SM57 + R121'],
  'B&F NAM Ampeg SVT410HLF': ['MD421 + F47'],
  'B&F NAM Mesa Powerhouse 410': ['SM57 + MD421'],
  'B&F NAM Darkglass DG410C': ['Beta52 A8 + U87 B5'],
  'B&F NAM GK RBH 410': ['SM57 + MD421'],
  'B&F NAM SWR Goliath': ['SM57 + RE20'],
};

// ─── 过载 OD（吉他 12 → 6 型号 / 21 → 7 捕获；贝斯 3 → 3 型号 / 8 → 3 捕获）──
// 口径：同类只留经典型号 —— TS 系五代只留 TS808 与 SD-1（SD-1 是内置预设 C 的依赖），
// 贝斯去掉与主型号音色重叠的变体。
KEEP.overdrive = {
  // 吉他
  '中频过载': ['TS808', 'SD-1'],
  '透明过载': ['BD-2'],
  '轻过载': ['Klon Centaur'],
  '失真态过载': ['RAT'],
  'MOSFET 过载': ['OCD'],
  '双模过载': ['Plumes'],
  // 贝斯
  '前级 DI': ['SansAmp'],
  '贝斯过载': ['B3K'],
  '贝斯复古': ['M80'],
};

// ─── 失真 DIST（吉他 9 → 5 型号 / 13 → 5 捕获；贝斯 2 → 2 型号 / 5 → 2 捕获）──
KEEP.dist = {
  // 吉他
  '经典失真': ['DS-1'],
  '现代金属': ['MT-2'],
  '锯条失真': ['HM-2'],
  '法兹': ['Big Muff'],
  '复古失真': ['Distortion+'],
  // 贝斯
  '贝斯失真法兹': ['Bass Big Muff'],
  '贝斯 DG': ['B7K Ultra'],
};

export interface TrimResult {
  /** 过滤后的合并列表（吉他区在前、贝斯区在后） */
  list: SubModel[];
  /** 吉他区条目数，供分组表头使用（过滤后的真实数量） */
  bassStart: number;
}

/**
 * 按精简清单过滤模块的子型号列表（仅渲染层使用）。
 *
 * 绝不修改 module.subModels 本身：只做浅拷贝，captures 亦是新数组，
 * 因此不会污染数据、也不会影响 useMemo 之外任何按 name 查表的逻辑。
 *
 * @param module     模块配置（pedalData 的 MODULES 成员）
 * @param pinnedKey  当前已加载的组合键 "型号/捕获"。若它落在精简范围外，会被
 *                   临时补回列表（型号补在其所属分区末尾、捕获补在该型号
 *                   captures 末尾），避免 findIndex 得到 -1 而回落到第 0 项
 *                   —— 那会让 UI 显示与实际下发参数不一致。
 * @returns          过滤后的合并列表 + 吉他区条目数
 */
export function applyUiTrim(module: ModuleConfig, pinnedKey?: string): TrimResult {
  const guitarSrc: SubModel[] = module.subModels?.guitar ?? [];
  const bassSrc: SubModel[] = module.subModels?.bass ?? [];
  const spec: KeepSpec | undefined = UI_TRIM_ON ? KEEP[module.id] : undefined;

  // 未指定精简清单 = 该模块保持全量
  if (!spec) return { list: [...guitarSrc, ...bassSrc], bassStart: guitarSrc.length };

  // 箱头 pos 以 _N 结尾 = 未被 v14 覆盖的原 NAM 捕获，UI 上标注 "· NAM" 便于对比试听。
  const isAmpHead = module.id === 'amp-head';
  const tagNam = (c: NonNullable<SubModel['captures']>[number]) =>
    isAmpHead && /_\d+$/.test(c.pos) ? { ...c, label: `${c.label} · NAM` } : c;

  const pick = (arr: SubModel[]): SubModel[] => {
    const out: SubModel[] = [];
    for (const m of arr) {
      const keep: string[] | undefined = spec[m.name];
      if (!keep) continue; // 型号被精简
      if (!m.captures?.length) { out.push(m); continue; }
      const caps = m.captures.filter((c) => keep.includes(c.pos)).map(tagNam);
      // 既没过滤掉、也没标注过任何一项时保持原引用，避免无谓浅拷贝
      const untouched = caps.length === m.captures.length && caps.every((c, i) => c === m.captures![i]);
      out.push(untouched ? m : { ...m, captures: caps });
    }
    return out;
  };

  let guitar = pick(guitarSrc);
  let bass = pick(bassSrc);

  // ── pinned 兜底 ──────────────────────────────────────────────────────
  if (pinnedKey) {
    const { hardware, pos } = splitSubModelName(pinnedKey);
    // 同名型号若吉他/贝斯都有，优先按吉他区处理（与列表分区顺序一致）
    const srcGuitar = guitarSrc.find((m) => m.name === hardware);
    const srcBass = srcGuitar ? undefined : bassSrc.find((m) => m.name === hardware);
    const src = srcGuitar ?? srcBass;

    if (src) {
      const inGuitar = !!srcGuitar;
      const holders = inGuitar ? guitar : bass;
      const idx = holders.findIndex((m) => m.name === hardware);

      if (idx < 0) {
        // 情况 1：型号整体被精简。原样补回（captures 全保留），
        // 这样 pinnedKey 里的 pos 一定能被 findIndex 找到并正确高亮。
        const item: SubModel = { ...src, captures: src.captures ? [...src.captures] : undefined };
        if (inGuitar) guitar = [...guitar, item];
        else bass = [...bass, item];
      } else if (pos && src.captures && !holders[idx].captures?.some((c) => c.pos === pos)) {
        // 情况 2：型号保留、但该捕获被精简。把该捕获补到其 captures 末尾。
        const cap = src.captures.find((c) => c.pos === pos);
        if (cap) {
          const patched: SubModel = { ...holders[idx], captures: [...(holders[idx].captures ?? []), cap] };
          if (inGuitar) guitar = guitar.map((m, i) => (i === idx ? patched : m));
          else bass = bass.map((m, i) => (i === idx ? patched : m));
        }
      }
    }
  }

  return { list: [...guitar, ...bass], bassStart: guitar.length };
}
