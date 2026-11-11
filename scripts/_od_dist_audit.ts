/**
 * OD / DIST 全型号「参数加载」审计（只读）
 *   P1 = writeSubModelRegisters() 实际写入集（模块页添加子型号 / 踩钉恢复默认）
 *   P2 = OVERDRIVE_DEFAULTS[x].allRegs（文档重编码整图 / 出厂预设整图）
 * 差异分类：伪键占位 / 整图有但未写 / 值不一致 / 无公式（整段不写）
 */
import { OVERDRIVE_DEFAULTS, COMPRESSOR_DEFAULTS } from '../src/data/presetData';
import { SUB_MODEL_FORMULAS, SUB_MODEL_PRE_EQ } from '../src/data/parameterMap';

const NO_WRITE = [43, 48, 52, 58, 63, 67, 73, 78, 82];
const hex = (v: number) => '0x' + (v >>> 0).toString(16).toUpperCase().padStart(8, '0');

const table: any = OVERDRIVE_DEFAULTS as any;
let nPseudo = 0, nMissing = 0, nMismatch = 0, nOk = 0;
const bad: string[] = [];
const noFormula: string[] = [];

for (const [key, def] of Object.entries<any>(table)) {
  const fm = (SUB_MODEL_FORMULAS as any)[key];
  if (!fm) { noFormula.push(key); continue; }
  const addrs = Object.values<any>(fm).flat().filter((d: any) => d && d.regAddr > 0).map((d: any) => d.regAddr);
  const isDist = addrs.some((a: number) => a >= 57 && a <= 71);
  const module = isDist ? 'dist' : 'overdrive';
  const lo = isDist ? 57 : 42, hi = isDist ? 71 : 56;
  const allRegs: Record<number, number> = def.allRegs ?? {};
  const knobDefault = (label: string) => def.knobs?.[label] ?? 0.5;

  const writes: Record<number, number> = {};
  const owner: Record<number, string> = {};
  const seen = new Set<number>();
  for (const [knobLabel, defs] of Object.entries(fm)) {
    if (!Array.isArray(defs)) continue;
    const nd = knobDefault(knobLabel);
    for (const d of defs as any[]) {
      if (d.regAddr === -1) continue;
      if (seen.has(d.regAddr)) continue;
      seen.add(d.regAddr);
      writes[d.regAddr] = typeof d.compute === 'function' ? d.compute(nd) : 0;
      owner[d.regAddr] = knobLabel;
    }
  }
  // 伪键占位检测：占位者以 _ 开头，而同地址还有真实旋钮键
  const pseudo: string[] = [];
  for (const [knobLabel, defs] of Object.entries(fm)) {
    if (!Array.isArray(defs)) continue;
    for (const d of defs as any[]) {
      if (d.regAddr <= 0) continue;
      const o = owner[d.regAddr];
      if (o && o.startsWith('_') && !knobLabel.startsWith('_')) {
        const real = typeof d.compute === 'function' ? d.compute(knobDefault(knobLabel)) : 0;
        pseudo.push(`${o}=${writes[d.regAddr]} 抢占 reg${d.regAddr}, 真实旋钮 ${knobLabel}=${real}`);
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
  const peq = (SUB_MODEL_PRE_EQ as any)[key];
  if (peq) peq.regs.forEach((a: number, i: number) => { writes[a] = peq.values[i]; });

  const missing: number[] = [];
  const mismatch: Array<[number, number, number]> = [];
  for (let a = lo; a <= hi; a++) {
    const g = allRegs[a];
    if (g === undefined) continue;
    const w = writes[a];
    if (w === undefined) { missing.push(a); continue; }
    if (w !== g) mismatch.push([a, w, g]);
  }
  if (pseudo.length || missing.length || mismatch.length) {
    bad.push(`\n【${isDist ? 'DIST' : 'OD  '}】${key}`);
    for (const p of pseudo) { bad.push(`   ✗ 伪键占位: ${p}`); nPseudo++; }
    if (missing.length) { bad.push(`   ✗ 整图有 / 此路径未写: ${missing.join(',')}`); nMissing += missing.length; }
    for (const [a, w, g] of mismatch) { bad.push(`   ✗ 值不一致 reg${a}: 实际 ${w}(${hex(w)}) ≠ 整图 ${g}(${hex(g)})`); nMismatch++; }
  } else nOk++;
}

console.log(bad.join('\n'));
console.log(`\n════ 汇总（仅统计有公式的子型号键）════`);
console.log(`完全一致: ${nOk} 型号`);
console.log(`有问题: ${new Set(bad.filter(l => l.startsWith('\n【')).map(l => l)).size} 型号  |  伪键占位 ${nPseudo} 处  |  未写 ${nMissing} 地址  |  值不一致 ${nMismatch} 处`);
console.log(`\n无公式键（切到这些子型号时 writeSubModelRegisters 直接 return false，一个寄存器都不写）: ${noFormula.length} 个`);
console.log('  例: ' + noFormula.slice(0, 8).join(' | '));
