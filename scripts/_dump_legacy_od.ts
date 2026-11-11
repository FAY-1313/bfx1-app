/** 临时：导出 v12 未覆盖的 4 个 OD 型号在 APP 内的实际数据（旧数据来源） */
import * as fs from 'fs';
import { SUB_MODEL_PRE_EQ, SUB_MODEL_FORMULAS } from '../src/data/parameterMap';
import { OVERDRIVE_DEFAULTS } from '../src/data/presetData';

const T = [
  ['B&F NAM Ibanez TS9/Ibanez TS9', '中频过载/TS9'],
  ['B&F NAM Boss BD-2/Boss BD-2', '透明过载/BD-2'],
  ['B&F NAM Klon Centaur/Klon Centaur', '轻过载/Klon Centaur'],
  ['B&F NAM ProCo RAT/ProCo RAT', '失真态过载/RAT'],
];
const out: any = {};
for (const [key, comp] of T) {
  const od: any = (OVERDRIVE_DEFAULTS as any)[comp];
  out[key] = {
    composed: comp,
    hasPreEqKey: key in (SUB_MODEL_PRE_EQ as any),
    pre: (SUB_MODEL_PRE_EQ as any)[key] ?? null,
    hasFormula: key in (SUB_MODEL_FORMULAS as any),
    formulas: (SUB_MODEL_FORMULAS as any)[key] ?? null,
    odKeyFound: !!od,
    knobs: od?.knobs ?? null,
    hidden: od?.hidden ?? null,
    allRegs: od?.allRegs ?? null,
  };
}
fs.writeFileSync('D:/bfx1app/tools/_legacy_od.json', JSON.stringify(out, null, 1), 'utf8');
console.log('wrote _legacy_od.json:', Object.keys(out).map(k => `${k} pre=${!!out[k].pre} od=${out[k].odKeyFound}`).join(' | '));
