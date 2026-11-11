/**
 * 箱头(amp-head)「子型号加载路径」vs v14 设计整图 一致性审计（只读）
 *
 * P1 = writeSubModelRegisters() 对 amp-head 的实际写入终态
 *      （复刻 Index.tsx 1566-1725: 公式占坑 → hidden 补 → PRE_EQ 二次覆盖）
 * P2 = AMP_DEFAULTS2[key].allRegs（v14 设计整图, 72-98 + 239）
 *
 * 分类：① 终态值 ≠ 整图值（标出被谁覆盖）② 整图有值但终态未写(hole)
 *       ③ 写入了白名单外地址 ④ 公式接线与 AMP_FORMULAS2(设计) 地址不一致
 */
import { AMP_DEFAULTS2, AMP_FORMULAS2 } from '../src/data/_gen/amp_params2';
import { SUB_MODEL_FORMULAS, SUB_MODEL_PRE_EQ } from '../src/data/parameterMap';
import { AMP_HEAD_HIDDEN, AMP_HEAD_HIDDEN_DEFAULT, AMP_HEAD_KNOB_DEFAULTS } from '../src/data/presetData';
import { isWritableAddr } from '../src/data/passThrough';

const hex = (v: number) => '0x' + (v >>> 0).toString(16).toUpperCase().padStart(8, '0');
const dec = (v: number) => ({
  t: v & 7, fi: (v >>> 3) & 0x1FF, gi: (v >>> 12) & 0xFF, qi: (v >>> 20) & 0x7F, si: (v >>> 27) & 0x1F,
});
const desc = (v: number) => {
  const d = dec(v);
  return `t${d.t}/gi${d.gi}(${+(d.gi * 0.2 - 24).toFixed(1)}dB)/fi${d.fi}/q${d.qi}/s${d.si}`;
};
const HIDDEN_SKIP = [43, 48, 52, 58, 63, 67, 73, 78, 82];

let nKey = 0;
let nValueMismatch = 0, nHole = 0, nIllegal = 0, nWiringMismatch = 0, nClean = 0;
const srcTally: Record<string, number> = {};
const detail: string[] = [];
const wiringDetail: string[] = [];

for (const [key, def] of Object.entries(AMP_DEFAULTS2)) {
  nKey++;
  const fm: any = (SUB_MODEL_FORMULAS as any)[key];
  const kd: any = AMP_HEAD_KNOB_DEFAULTS[key] ?? {};
  const seen = new Set<number>();
  const final: Record<number, number> = {};
  const src: Record<number, string> = {};

  // ── 1b 公式占坑（Index.tsx 1629-1645）──
  for (const [label, defs] of Object.entries<any>(fm ?? {})) {
    if (!Array.isArray(defs)) continue;
    const nd = kd[label] ?? 0.5;
    for (const d of defs as any[]) {
      if (d.regAddr === -1) continue;
      if (seen.has(d.regAddr)) continue;
      seen.add(d.regAddr);
      final[d.regAddr] = typeof d.compute === 'function' ? d.compute(nd) : 0;
      src[d.regAddr] = 'formula:' + label;
    }
  }
  if (!fm) detail.push(`[无公式] ${key}`);

  // ── 1c hidden 补（Index.tsx 1647-1672，跳过 43/48/52/58/63/67/73/78/82）──
  const hid = AMP_HEAD_HIDDEN[key] ?? AMP_HEAD_HIDDEN_DEFAULT;
  for (const [a, v] of Object.entries<any>(hid)) {
    const addr = Number(a);
    if (seen.has(addr)) continue;
    if (HIDDEN_SKIP.includes(addr)) continue;
    seen.add(addr);
    final[addr] = v;
    src[addr] = 'hidden';
  }

  // ── PRE_EQ 二次覆盖（Index.tsx 1711-1722，最后写）──
  const peq: any = (SUB_MODEL_PRE_EQ as any)[key];
  if (peq) for (let i = 0; i < peq.regs.length; i++) { final[peq.regs[i]] = peq.values[i]; src[peq.regs[i]] = 'PRE_EQ'; }

  // ── 比对整图 ──
  const mism: string[] = [];
  const holes: number[] = [];
  for (const [a, v] of Object.entries<any>(def.allRegs)) {
    const addr = Number(a);
    if (final[addr] === undefined) { holes.push(addr); continue; }
    if (final[addr] !== v) {
      mism.push(`reg${addr} 终态=${hex(final[addr])}(${desc(final[addr])})[${src[addr]}] ≠ 整图=${hex(v)}(${desc(v)})`);
      srcTally[src[addr]] = (srcTally[src[addr]] ?? 0) + 1;
    }
  }
  const illegal = Object.keys(final).map(Number).filter((a) => !isWritableAddr(a));

  // ── 公式接线 vs 设计 AMP_FORMULAS2 ──
  const designFm: any = (AMP_FORMULAS2 as any)[key];
  if (designFm) {
    for (const [label, defs] of Object.entries<any>(designFm)) {
      const cur = fm?.[label];
      const curAddr = Array.isArray(cur) ? cur.map((d: any) => d.regAddr).join(',') : '(缺)';
      const desAddr = (defs as any[]).map((d) => d.regAddr).join(',');
      if (curAddr !== desAddr) {
        nWiringMismatch++;
        wiringDetail.push(`${key} · ${label}: 现=${curAddr} 设计=${desAddr}`);
      }
    }
  }

  nValueMismatch += mism.length;
  nHole += holes.length;
  nIllegal += illegal.length;
  if (!mism.length && !holes.length && !illegal.length) nClean++;
  if (mism.length || holes.length || illegal.length) {
    detail.push([
      `${key}`,
      mism.length ? `  值差 ${mism.length}: ${mism.slice(0, 4).join(' ; ')}${mism.length > 4 ? ` ...+${mism.length - 4}` : ''}` : '',
      holes.length ? `  未写(hole): ${holes.join(',')}` : '',
      illegal.length ? `  白名单外: ${illegal.join(',')}` : '',
    ].filter(Boolean).join('\n'));
  }
}

console.log('箱头键数:', nKey);
console.log('完全一致:', nClean, '/', nKey);
console.log('值差寄存器总处数:', nValueMismatch, ' 未写(hole)总处数:', nHole, ' 白名单外写入处数:', nIllegal);
console.log('值差来源分布:', JSON.stringify(srcTally));
console.log('公式接线不一致(键·旋钮项):', nWiringMismatch);
console.log('\n── 公式接线不一致明细(前 12) ──');
console.log(wiringDetail.slice(0, 12).join('\n') || '(无)');
console.log('\n── 差异明细(前 6 键) ──');
console.log(detail.slice(0, 6).join('\n') || '(无)');
