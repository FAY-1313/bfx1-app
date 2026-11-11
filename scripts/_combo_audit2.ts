/**
 * 汇总（剔除代码里的免写地址，避免虚高）+ HM-2 明细
 */
import { SERIES_REGISTRY } from '../src/data/seriesData';
import { SUB_MODEL_FORMULAS, SUB_MODEL_PRE_EQ } from '../src/data/parameterMap';
import { OVERDRIVE_DEFAULTS } from '../src/data/presetData';

const NO_WRITE = [43, 48, 52, 58, 63, 67, 73, 78, 82];
const F: any = SUB_MODEL_FORMULAS, P: any = SUB_MODEL_PRE_EQ, D: any = OVERDRIVE_DEFAULTS;
const hex = (v: number) => '0x' + (v >>> 0).toString(16).toUpperCase().padStart(8, '0');

function simulate(key: string, isDist: boolean) {
  const def = D[key], fm = F[key];
  const allRegs: Record<number, number> = def.allRegs ?? {};
  const kd = (l: string) => def.knobs?.[l] ?? 0.5;
  const writes: Record<number, number> = {};
  const owner: Record<number, string> = {};
  const seen = new Set<number>();
  for (const [kl, defs] of Object.entries<any>(fm)) {
    if (!Array.isArray(defs)) continue;
    for (const d of defs) {
      if (d.regAddr <= 0 || seen.has(d.regAddr)) continue;
      seen.add(d.regAddr);
      writes[d.regAddr] = typeof d.compute === 'function' ? d.compute(kd(kl)) : 0;
      owner[d.regAddr] = kl;
    }
  }
  let pseudo = 0;
  for (const [kl, defs] of Object.entries<any>(fm)) {
    if (!Array.isArray(defs)) continue;
    for (const d of defs) if (d.regAddr > 0 && owner[d.regAddr]?.startsWith('_') && !kl.startsWith('_')) pseudo++;
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
  const lo = isDist ? 57 : 42, hi = isDist ? 71 : 56;
  const gap: number[] = [], diff: Array<[number, number, number]> = [];
  for (let a = lo; a <= hi; a++) {
    const g = allRegs[a];
    if (g === undefined || NO_WRITE.includes(a)) continue;
    if (writes[a] === undefined) { gap.push(a); continue; }
    if (writes[a] !== g) diff.push([a, writes[a], g]);
  }
  return { def, writes, allRegs, gap, diff, pseudo };
}

const gapFreq: Record<number, number> = {};
let totalGap = 0, totalDiff = 0, totalPseudo = 0, clean = 0, n = 0;

for (const s of SERIES_REGISTRY) {
  const isDist = s.moduleId === 'dist';
  for (const m of s.models) {
    const key = `${s.uiName}/${m.label}`;
    if (!D[key] || !F[key]) continue;
    n++;
    const r = simulate(key, isDist);
    totalGap += r.gap.length; totalDiff += r.diff.length; totalPseudo += r.pseudo;
    for (const a of r.gap) gapFreq[a] = (gapFreq[a] ?? 0) + 1;
    if (!r.gap.length && !r.diff.length && !r.pseudo) clean++;
  }
}
console.log('════ 剔除免写地址后的真实缺口 ════');
console.log(`UI 组合键 ${n} 个：完全一致 ${clean} 个，有问题 ${n - clean} 个`);
console.log(`伪键占位(Drive/Volume 被写错) ${totalPseudo} 处 | 真缺段 ${totalGap} 处(涉及 ${Object.keys(gapFreq).length} 个地址) | 值差 ${totalDiff} 处`);
console.log('\n缺口地址频次（型号数）：');
console.log(Object.entries(gapFreq).sort((a, b) => b[1] - a[1]).map(([a, c]) => `reg${a}×${c}`).join('  '));

console.log('\n════ HM-2（锯条失真/HM-2）逐地址对照 ════');
const hm = simulate('锯条失真/HM-2', true);
console.log('reg | 模块页加载(现状)        | 整图/文档             | 判定');
for (let a = 57; a <= 71; a++) {
  const w = hm.writes[a], g = hm.allRegs[a];
  if (w === undefined && g === undefined) continue;
  const ws = w === undefined ? '(不写)' : (w > 4096 ? hex(w) : `${w}`) + (NO_WRITE.includes(a) ? ' [免写]' : '');
  const gs = g === undefined ? '(无)' : (g > 4096 ? hex(g) : `${g}`);
  let v = '';
  if (NO_WRITE.includes(a)) v = '按规范不写';
  else if (w === undefined) v = '★ 缺段';
  else if (w !== g) v = '★ 值差';
  else v = 'OK';
  console.log(`${String(a).padStart(3)} | ${ws.padEnd(24)} | ${gs.padEnd(22)} | ${v}`);
}
