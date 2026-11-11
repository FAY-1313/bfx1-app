/**
 * 探测运行时三张表的最终键集：
 *   · 哪些键来自 v12/v14 电路套（PEDAL_DEFAULTS2 / AMP_DEFAULTS2）
 *   · 哪些键是 NAM 旧套（含 presetData 主字面量里的历史键）
 * 输出：d:/bfx1app/tools/_key_probe.txt
 */
import { OVERDRIVE_DEFAULTS, AMP_HEAD_HIDDEN } from '../src/data/presetData';
import { PEDAL_DEFAULTS2 } from '../src/data/_gen/pedal_params2';
import { AMP_DEFAULTS2 } from '../src/data/_gen/amp_params2';
import * as fs from 'fs';

const newOd = new Set(Object.keys(PEDAL_DEFAULTS2));
const newAmp = new Set(Object.keys(AMP_DEFAULTS2));

const out: string[] = [];
const NAM = 'B&F NAM ';

function selfNameKey(k: string): boolean {
  // 形如 "B&F NAM XXX/XXX" —— 硬件系列名与捕获名相同（= UI 规范型号键）
  if (!k.startsWith(NAM)) return false;
  const rest = k.slice(NAM.length);
  const i = rest.indexOf('/');
  if (i < 0) return false;
  return rest.slice(i + 1) === rest.slice(0, i) || /^.+_\d+$/.test(rest.slice(i + 1)) && rest.slice(i + 1).replace(/_\d+$/, '') === rest.slice(0, i);
}

function dump(title: string, keys: string[], newSet: Set<string>): void {
  const hw = keys.filter((k) => k.startsWith(NAM));
  const ser = keys.filter((k) => !k.startsWith(NAM));
  const namKeys = hw.filter((k) => !newSet.has(k));
  const cirKeys = hw.filter((k) => newSet.has(k));
  out.push(`=== ${title} ===`);
  out.push(`  总 ${keys.length} 键 = 硬件键 ${hw.length} + 系列物化键 ${ser.length}`);
  out.push(`  其中 电路套 ${cirKeys.length} / NAM 套 ${namKeys.length}`);
  out.push('');
  out.push(`  ── NAM 套里的「自名键」(形如 B&F NAM X/X，可能与 UI 型号同名) ──`);
  const self = namKeys.filter(selfNameKey);
  out.push(`  数量 ${self.length}`);
  for (const k of self) out.push(`    ${k}`);
  out.push('');
  out.push(`  ── NAM 套全部硬件键（按系列分组） ──`);
  const g = new Map<string, string[]>();
  for (const k of namKeys) {
    const rest = k.slice(NAM.length);
    const i = rest.indexOf('/');
    const s = i < 0 ? rest : rest.slice(0, i);
    const c = i < 0 ? '' : rest.slice(i + 1);
    if (!g.has(s)) g.set(s, []);
    g.get(s)!.push(c);
  }
  for (const s of [...g.keys()].sort()) {
    out.push(`  # ${s}  (${g.get(s)!.length})`);
    for (const c of g.get(s)!.sort()) out.push(`      - ${c}`);
  }
  out.push('');
}

dump('OVERDRIVE_DEFAULTS 运行时', Object.keys(OVERDRIVE_DEFAULTS), newOd);
dump('AMP_HEAD_HIDDEN 运行时', Object.keys(AMP_HEAD_HIDDEN), newAmp);

fs.writeFileSync('d:/bfx1app/tools/_key_probe.txt', out.join('\n'), 'utf8');
console.log('ok lines=' + out.length);
