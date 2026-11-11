/**
 * 新寄存器白名单影响面统计（OD/DIST 47 个 UI 组合键）
 * 白名单（用户 2026-09-25 给定）：
 *   0-3, 8-13, 44-51, 53-56, 59-66, 68-71, 74-81, 83-98, 108-142, 215-223, 225-229, 239, 254-261
 *
 * P1 = 现状 writeSubModelRegisters() 实际写入集合
 * P3 = 方案 B（整图 allRegs ∩ 白名单 ∩ 模块段）写入集合
 */
import { SERIES_REGISTRY } from '../src/data/seriesData';
import { SUB_MODEL_FORMULAS, SUB_MODEL_PRE_EQ } from '../src/data/parameterMap';
import { OVERDRIVE_DEFAULTS } from '../src/data/presetData';

const WL: Array<[number, number]> = [
  [0, 3], [8, 13], [44, 51], [53, 56], [59, 66], [68, 71],
  [74, 81], [83, 98], [108, 142], [215, 223], [225, 229], [239, 239], [254, 261],
];
const inWL = (a: number) => WL.some(([lo, hi]) => a >= lo && a <= hi);

const NO_WRITE = [43, 48, 52, 58, 63, 67, 73, 78, 82]; // 现状代码的免写表
const F: any = SUB_MODEL_FORMULAS, P: any = SUB_MODEL_PRE_EQ, D: any = OVERDRIVE_DEFAULTS;
const hex = (v: number) => '0x' + (v >>> 0).toString(16).toUpperCase().padStart(8, '0');

function p1(key: string, isDist: boolean): Record<number, number> {
  const def = D[key], fm = F[key];
  const kd = (l: string) => def.knobs?.[l] ?? 0.5;
  const writes: Record<number, number> = {};
  const seen = new Set<number>();
  for (const [kl, defs] of Object.entries<any>(fm)) {
    if (!Array.isArray(defs)) continue;
    for (const d of defs) {
      if (d.regAddr <= 0 || seen.has(d.regAddr)) continue;
      seen.add(d.regAddr);
      writes[d.regAddr] = typeof d.compute === 'function' ? d.compute(kd(kl)) : 0;
    }
  }
  for (const [a, v] of Object.entries(def.hidden ?? {})) {
    const ai = Number(a);
    if (NO_WRITE.includes(ai)) continue;
    if (!isDist && (ai === 42 || (ai >= 57 && ai <= 71))) continue;
    if (isDist && (ai === 57 || (ai >= 42 && ai <= 56))) continue;
    if (seen.has(ai)) continue;
    seen.add(ai); writes[ai] = v as number;
  }
  writes[isDist ? 57 : 42] = 0;
  if (P[key]) P[key].regs.forEach((a: number, i: number) => { writes[a] = P[key].values[i]; });
  return writes;
}

const addFreq: Record<number, number> = {}, delFreq: Record<number, number> = {};
let nValChange = 0, nAdd = 0, nDel = 0, nModels = 0;
const detail: string[] = [];

for (const s of SERIES_REGISTRY) {
  const isDist = s.moduleId === 'dist';
  const seg: Array<[number, number]> = isDist ? [[59, 71]] : [[42, 56]];
  for (const m of s.models) {
    const key = `${s.uiName}/${m.label}`;
    if (!D[key] || !F[key]) continue;
    nModels++;
    const allRegs: Record<number, number> = D[key].allRegs ?? {};
    const w1 = p1(key, isDist);
    const w3: Record<number, number> = {};
    for (const [a, v] of Object.entries(allRegs)) {
      const ai = Number(a);
      if (!inWL(ai)) continue;
      if (!seg.some(([lo, hi]) => ai >= lo && ai <= hi)) continue;
      w3[ai] = v as number;
    }
    const added: number[] = [], removed: number[] = [], changed: Array<[number, number, number]> = [];
    for (const a of Object.keys(w3).map(Number)) if (w1[a] === undefined) added.push(a);
    for (const a of Object.keys(w1).map(Number)) if (w3[a] === undefined && inWL(a)) removed.push(a);
    for (const a of Object.keys(w3).map(Number)) if (w1[a] !== undefined && w1[a] !== w3[a]) changed.push([a, w1[a], w3[a]]);
    added.sort((x, y) => x - y); removed.sort((x, y) => x - y);
    nAdd += added.length; nDel += removed.length; nValChange += changed.length;
    for (const a of added) addFreq[a] = (addFreq[a] ?? 0) + 1;
    for (const a of removed) delFreq[a] = (delFreq[a] ?? 0) + 1;
    if (added.length || removed.length || changed.length) {
      detail.push(`${isDist ? 'DIST' : 'OD  '} ${key}`);
      if (added.length) detail.push(`    + 多写: ${added.join(',')}`);
      if (removed.length) detail.push(`    - 少写(白名单外): ${removed.join(',')}`);
      if (changed.length) detail.push(`    ~ 改值: ${changed.map(([a, x, y]) => `reg${a} ${x}→${y}`).join(' | ')}`);
    }
  }
}

console.log(detail.join('\n'));
console.log(`\n════ 汇总（${nModels} 个 UI 组合键）════`);
console.log(`多写合计 ${nAdd} 处 | 少写合计 ${nDel} 处 | 改值合计 ${nValChange} 处`);
console.log('\n【多写地址频次】(地址×型号数)');
console.log(Object.entries(addFreq).sort((a, b) => b[1] - a[1]).map(([a, c]) => `reg${a}×${c}`).join('  '));
console.log('\n【少写地址频次】');
console.log(Object.entries(delFreq).sort((a, b) => b[1] - a[1]).map(([a, c]) => `reg${a}×${c}`).join('  ') || '(无)');

console.log('\n════ HM-2（锯条失真/HM-2）B 方案写入集 ════');
const nb: Record<number, number> = {};
for (const [a, v] of Object.entries(OVERDRIVE_DEFAULTS['锯条失真/HM-2'].allRegs ?? {})) {
  const ai = Number(a);
  const tag = inWL(ai) ? (ai >= 59 && ai <= 71 ? 'WRITE' : '白名单内但非本模块段') : '白名单外→不写';
  nb[ai] = v as number;
  console.log(`  reg${String(ai).padStart(3)} = ${(v as number) > 4096 ? hex(v as number) : v}   ${tag}`);
}
