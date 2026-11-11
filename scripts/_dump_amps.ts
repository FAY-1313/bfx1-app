/** 临时：导出 APP 侧箱头真实键名（AMP_HEAD_HIDDEN / AMP_HEAD_KNOB_DEFAULTS）与系列/capture 清单 */
import * as fs from 'fs';
import { AMP_HEAD_HIDDEN, AMP_HEAD_KNOB_DEFAULTS } from '../src/data/presetData';
import { MODULES } from '../src/data/pedalData';

const out: any = { keys: Object.keys(AMP_HEAD_HIDDEN), knobKeys: Object.keys(AMP_HEAD_KNOB_DEFAULTS), series: [] };
const mod: any = MODULES.find((m) => m.id === 'amp-head');
for (const mode of ['guitar', 'bass']) {
  for (const s of (mod?.subModels?.[mode] ?? []) as any[]) {
    out.series.push({
      mode,
      id: s.id,
      name: s.name,
      display: s.display,
      knobs: s.knobs,
      captures: (s.captures ?? []).map((c: any) => ({ pos: c.pos, label: c.label })),
    });
  }
}
const dest = process.argv[2] || 'D:/bfx1app/tools/_amps.json';
fs.writeFileSync(dest, JSON.stringify(out), 'utf8');
console.log(`wrote ${dest}: keys=${out.keys.length} series=${out.series.length}`);
