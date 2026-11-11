/**
 * 审计范围 = UI 真实可见的 47 个 OD/DIST 组合键（SERIES_REGISTRY）
 * P1 = writeSubModelRegisters() 实际写入（模块页「添加模块/切子型号」）
 * P2 = OVERDRIVE_DEFAULTS[组合键].allRegs（文档重编码整图）
 */
import { SERIES_REGISTRY } from '../src/data/seriesData';
import { SUB_MODEL_FORMULAS, SUB_MODEL_PRE_EQ } from '../src/data/parameterMap';
import { OVERDRIVE_DEFAULTS } from '../src/data/presetData';

const NO_WRITE = [43, 48, 52, 58, 63, 67, 73, 78, 82];
const F: any = SUB_MODEL_FORMULAS, P: any = SUB_MODEL_PRE_EQ, D: any = OVERDRIVE_DEFAULTS;
const hex = (v: number) => '0x' + (v >>> 0).toString(16).toUpperCase().padStart(8, '0');

let nPseudo = 0, nGap = 0, nDiff = 0, clean = 0;
const rows: string[] = [];

for (const s of SERIES_REGISTRY) {
  const isDist = s.moduleId === 'dist';
  const lo = isDist ? 57 : 42, hi = isDist ? 71 : 56;
  for (const m of s.models) {
    const key = `${s.uiName}/${m.label}`;
    const def = D[key];
    const fm = F[key];
    if (!def || !fm) continue;
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
    const pseudo: string[] = [];
    for (const [kl, defs] of Object.entries<any>(fm)) {
      if (!Array.isArray(defs)) continue;
      for (const d of defs) {
        if (d.regAddr <= 0) continue;
        if (owner[d.regAddr]?.startsWith('_') && !kl.startsWith('_')) {
          pseudo.push(`${owner[d.regAddr]} 抢占 reg${d.regAddr}=${writes[d.regAddr]}，真实 ${kl}=${typeof d.compute === 'function' ? d.compute(kd(kl)) : 0}`);
        }
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

    const gap: number[] = [];
    const diff: Array<[number, number, number]> = [];
    for (let a = lo; a <= hi; a++) {
      const g = allRegs[a];
      if (g === undefined) continue;
      if (writes[a] === undefined) { gap.push(a); continue; }
      if (writes[a] !== g) diff.push([a, writes[a], g]);
    }
    if (!pseudo.length && !gap.length && !diff.length) { clean++; continue; }
    const head = `【${isDist ? 'DIST' : 'OD  '}】${key}${pseudo.length ? '  [伪键]' : ''}${gap.length ? '  [缺段]' : ''}${diff.length ? '  [值差]' : ''}`;
    rows.push(head);
    for (const p of pseudo) { rows.push(`    ✗ 伪键占位: ${p}`); nPseudo++; }
    if (gap.length) { rows.push(`    ✗ 整图有、此路径不写: ${gap.join(',')}`); nGap += gap.length; }
    for (const [a, w, g] of diff) { rows.push(`    ✗ reg${a}: 实际 ${w}(${hex(w)}) ≠ 整图 ${g}(${hex(g)})`); nDiff++; }
  }
}
console.log(rows.join('\n'));
console.log(`\n════ 汇总（47 个 UI 组合键）════`);
console.log(`完全一致: ${clean}  有问题: ${47 - clean}  |  伪键占位 ${nPseudo} 处  |  缺段 ${nGap} 处  |  值差 ${nDiff} 处`);
