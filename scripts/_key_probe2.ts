/** dump parameterMap.ts 各导出表的键，标记电路套(v12/v14) 与 NAM 套 */
import * as PM from '../src/data/parameterMap';
import { PEDAL_DEFAULTS2, PEDAL_FORMULAS2, PEDAL_PRE_EQ2 } from '../src/data/_gen/pedal_params2';
import { AMP_DEFAULTS2, AMP_FORMULAS2, AMP_PRE_EQ2 } from '../src/data/_gen/amp_params2';
import * as fs from 'fs';

const NEW = new Set<string>();
for (const t of [PEDAL_DEFAULTS2, PEDAL_FORMULAS2, PEDAL_PRE_EQ2, AMP_DEFAULTS2, AMP_FORMULAS2, AMP_PRE_EQ2]) {
  for (const k of Object.keys(t as object)) NEW.add(k);
}

const L: string[] = [];
for (const [name, v] of Object.entries(PM)) {
  if (!v || typeof v !== 'object') continue;
  const keys = Object.keys(v as object);
  if (keys.length === 0) continue;
  const hw = keys.filter((k) => k.startsWith('B&F NAM '));
  if (hw.length === 0) {
    L.push(`=== ${name}: ${keys.length} 键 (无 B&F NAM 前缀，跳过)`);
    continue;
  }
  const cir = hw.filter((k) => NEW.has(k));
  const nam = hw.filter((k) => !NEW.has(k));
  L.push(`=== ${name}: 总 ${keys.length} / 硬件 ${hw.length} = 电路 ${cir.length} + NAM ${nam.length}`);
  L.push(`  --- NAM 键 (${nam.length}) ---`);
  for (const k of nam.sort()) L.push('    ' + k);
  L.push('');
}
fs.writeFileSync('d:/bfx1app/tools/_pm_exports.txt', L.join('\n'), 'utf8');
console.log('ok lines=' + L.length);
