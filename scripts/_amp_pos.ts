/** dump 箱头模块每个型号的 captures pos 与 label，用于核对 uiTrim KEEP 清单 */
import { MODULES } from '../src/data/pedalData';

const amp = MODULES.find((m) => m.id === 'amp-head');
if (!amp) throw new Error('no amp-head');
const g = amp.subModels?.guitar ?? [];
const b = amp.subModels?.bass ?? [];
console.log('吉他型号 %d / 贝斯型号 %d', g.length, b.length);
for (const [tag, arr] of [['G', g], ['B', b]] as const) {
  for (const sm of arr) {
    const caps = (sm.captures ?? []).map((c) => `${c.pos}[${c.label}]`).join(' | ');
    console.log(`${tag} ${sm.name}  =>  ${caps}`);
  }
}
