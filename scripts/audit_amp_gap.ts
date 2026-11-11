/**
 * 箱头「缺 v14 设计数据」的 47 个位置 —— 逐项定性（只读）
 * 判定：加载这些位置时，三张表分别能提供什么，是否落到 DEFAULT 兜底。
 */
import { MODULES, getMergedSubModels } from '../src/data/pedalData';
import { AMP_HEAD_HIDDEN, AMP_HEAD_HIDDEN_DEFAULT, AMP_HEAD_KNOB_DEFAULTS } from '../src/data/presetData';
import { SUB_MODEL_FORMULAS, SUB_MODEL_PRE_EQ } from '../src/data/parameterMap';
import { AMP_DEFAULTS2 } from '../src/data/_gen/amp_params2';

const amp = MODULES.find((m: any) => m.id === 'amp-head')!;
const defHid = JSON.stringify(AMP_HEAD_HIDDEN_DEFAULT ?? {});
const deffm = (SUB_MODEL_FORMULAS as any)['__default__'];

const rows: string[] = [];
let nGap = 0, nGuitar = 0, nBass = 0, nNoFormula = 0, nNoPre = 0, nFallback = 0;

for (const mode of ['guitar', 'bass'] as const) {
  const subs: any[] = (amp as any).subModels?.[mode] ?? [];
  for (const sm of subs) {
    for (const cap of (sm.captures ?? [])) {
      const key = `${sm.name}/${cap.pos}`;
      if (AMP_DEFAULTS2[key]) continue; // 有 v14 数据
      nGap++;
      if (mode === 'guitar') nGuitar++; else nBass++;
      const hid = (AMP_HEAD_HIDDEN as any)[key];
      const isDef = hid === undefined || JSON.stringify(hid) === defHid;
      const hasFm = !!(SUB_MODEL_FORMULAS as any)[key];
      const hasPre = !!(SUB_MODEL_PRE_EQ as any)[key];
      const knobs = (AMP_HEAD_KNOB_DEFAULTS as any)[key];
      if (!hasFm) nNoFormula++;
      if (!hasPre) nNoPre++;
      if (isDef) nFallback++;
      rows.push(
        `${mode === 'guitar' ? 'G' : 'B'} ${key}\n` +
        `      hidden=${hid ? '有(旧)' : '无'}${isDef ? '=DEFAULT兜底' : ''} 公式=${hasFm ? '有' : '缺'} PRE_EQ=${hasPre ? '有' : '缺'} knobs=${knobs ? '有' : '缺'}`,
      );
    }
  }
}

console.log(`箱头位置缺 v14 数据: ${nGap}  (吉他 ${nGuitar} / 贝斯 ${nBass})`);
console.log(`其中: 无公式 ${nNoFormula} | 无 PRE_EQ ${nNoPre} | hidden 落 DEFAULT 兜底 ${nFallback}`);
console.log(`AMP_HEAD_HIDDEN_DEFAULT = ${defHid}`);
console.log(`SUB_MODEL_FORMULAS 默认兜底项 = ${deffm ? '有' : '无'}`);
console.log('\n── 明细 ──');
console.log(rows.join('\n'));
