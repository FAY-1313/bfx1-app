/** 盘点 APP 运行时真实生效的 单块/箱头/箱体 条目清单 → tools/_inventory.json */
import * as fs from 'fs';
import { MODULES, getSubModels } from '../src/data/pedalData';
import { AMP_HEAD_HIDDEN, AMP_HEAD_KNOB_DEFAULTS } from '../src/data/presetData';
import { CABINET_PEQ } from '../src/data/cabinetPeqData';
import { SUB_MODEL_PRE_EQ } from '../src/data/parameterMap';

const out: any = {};
out.modules = MODULES.map(m => ({
  id: m.id, name: (m as any).name ?? (m as any).label ?? m.id,
  guitar: getSubModels(m, 'guitar').map(s => ({ id: s.id, name: s.name, group: (s as any).group, caps: (s.captures ?? []).map((c: any) => c.pos ?? c.label) })),
  bass: getSubModels(m, 'bass').map(s => ({ id: s.id, name: s.name, group: (s as any).group, caps: (s.captures ?? []).map((c: any) => c.pos ?? c.label) })),
}));

const ampKeys = Object.keys(AMP_HEAD_HIDDEN);
out.amp = {
  hidden: ampKeys.length,
  knob: Object.keys(AMP_HEAD_KNOB_DEFAULTS).length,
  pre: Object.keys(SUB_MODEL_PRE_EQ).length,
  hasPre: ampKeys.filter(k => SUB_MODEL_PRE_EQ[k] !== undefined).length,
  keys: ampKeys,
  knobKeys: Object.keys(AMP_HEAD_KNOB_DEFAULTS),
  sample: ampKeys.slice(0, 3).map(k => ({ k, hidden: AMP_HEAD_HIDDEN[k], knob: AMP_HEAD_KNOB_DEFAULTS[k] })),
};

const cabKeys = Object.keys(CABINET_PEQ);
out.cab = { count: cabKeys.length, keys: cabKeys };

fs.writeFileSync('d:/bfx1app/tools/_inventory.json', JSON.stringify(out, null, 1), 'utf8');
console.log('ampKeys=', ampKeys.length, 'hasPre=', out.amp.hasPre, 'cabKeys=', cabKeys.length);
for (const m of out.modules) {
  console.log('  module %-16s guitarSM=%-3d bassSM=%-3d guitarCaps=%-4d bassCaps=%d',
    m.id, m.guitar.length, m.bass.length, m.guitar.reduce((a: number, s: any) => a + s.caps.length, 0), m.bass.reduce((a: number, s: any) => a + s.caps.length, 0));
}
console.log('sampleAmp=', JSON.stringify(out.amp.sample[0]).slice(0, 400));
