/** 临时：导出 APP 侧箱体真实结构（分组 / 型号 / captures）与 CABINET_PEQ 键 */
import * as fs from 'fs';
import { MODULES } from '../src/data/pedalData';
import { CABINET_PEQ } from '../src/data/cabinetPeqData';

const out: any = { keys: Object.keys(CABINET_PEQ), groups: {}, models: [] };
const mod: any = MODULES.find((m) => m.id === 'cabinet');
for (const mode of ['guitar', 'bass']) {
  for (const s of (mod?.subModels?.[mode] ?? []) as any[]) {
    out.groups[s.group] = (out.groups[s.group] ?? 0) + 1;
    out.models.push({
      mode,
      id: s.id,
      group: s.group,
      name: s.name,
      display: s.display,
      knobs: s.knobs,
      speakerLabel: s.speakerLabel ?? null,
      captures: (s.captures ?? []).map((c: any) => ({ pos: c.pos, label: c.label ?? null })),
    });
  }
}
const dest = process.argv[2] || 'D:/bfx1app/tools/_cabs.json';
fs.writeFileSync(dest, JSON.stringify(out), 'utf8');
console.log(`wrote ${dest}: keys=${out.keys.length} models=${out.models.length} groups=${Object.keys(out.groups).length}`);
