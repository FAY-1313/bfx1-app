/** 导出箱头有效参数(供与硬件捕获比对) → tools/_amp_head_dump.json */
import * as fs from 'fs';
import { AMP_HEAD_HIDDEN, AMP_HEAD_KNOB_DEFAULTS } from '../src/data/presetData';
import { SUB_MODEL_PRE_EQ } from '../src/data/parameterMap';

const out: Record<string, any> = {};
for (const k of Object.keys(AMP_HEAD_HIDDEN)) {
  const hidden = { ...AMP_HEAD_HIDDEN[k] };
  // 引擎 buildPreEqOverride: SUB_MODEL_PRE_EQ 后写覆盖 74-77
  const pre = SUB_MODEL_PRE_EQ[k];
  const eff = { ...hidden };
  if (pre?.values?.length === 4) [74, 75, 76, 77].forEach((a, i) => (eff[a] = pre.values[i]));
  out[k] = { hidden, eff, pre: pre?.values ?? null, knobs: AMP_HEAD_KNOB_DEFAULTS[k] ?? null };
}
fs.writeFileSync('d:/bfx1app/tools/_amp_head_dump.json', JSON.stringify(out, null, 0), 'utf8');
console.log('dumped keys =', Object.keys(out).length);
