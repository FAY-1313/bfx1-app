/**
 * HM-2 全寄存器核对报告（只读，不修改任何数据）
 * 左：APK 现行数据（PEDAL_DEFAULTS2 覆盖后实际写入值 + legacy 键）
 * 右：整理版文档《单块效果器参数总表_整理版.md》HM-2 章节参数
 */
import { PEDAL_DEFAULTS2, PEDAL_PRE_EQ2, PEDAL_POST_FIXED2, PEDAL_FORMULAS2 } from '../src/data/_gen/pedal_params2';
import { OVERDRIVE_DEFAULTS } from '../src/data/presetData';
import { PEQ_FREQ_TABLE, PEQ_Q_TABLE, PEQ_S_TABLE } from '../src/data/parameterMap';

const KEY = 'B&F NAM Boss HM-2/Boss HM-2';
const KEY2 = KEY + '_2';
const TYPES = ['Peak', 'LowShelf', 'HighShelf', 'AllPass', 'HPF', 'LPF', 'HPF-1st', 'LPF-1st'];
const hex = (v: any) => (v === undefined ? '—' : '0x' + (v >>> 0).toString(16).toUpperCase().padStart(8, '0'));

function dec(v: number | undefined) {
  if (v === undefined) return '—';
  const t = v & 7, fi = (v >> 3) & 0x1ff, g = (v >> 12) & 0xff, q = (v >> 20) & 0x7f, s = (v >>> 27) & 0x1f;
  const db = -24 + g * 0.2;
  return `${TYPES[t]} ${PEQ_FREQ_TABLE[fi] ?? '?'}Hz ${db >= 0 ? '+' : ''}${db.toFixed(1)}dB Q${PEQ_Q_TABLE[q] ?? '?'} S${PEQ_S_TABLE[s] ?? '?'}`;
}

// ── 文档 HM-2 章节（人读参数，hex 列按要求忽略） ──────────────────────
const DOC: Record<number, string> = {
  59: 'LowShelf 86Hz +0.0dB Q1.00 S0.71',
  60: 'Peak 240Hz -4.0dB Q1.00 S0.71',
  61: 'Peak 480Hz +4.0dB Q1.50 S0.71',
  62: 'Peak 1050Hz +0.0dB Q1.00 S0.71',
  68: 'LowShelf 86Hz +5.0dB Q1.00 S0.71',
  69: 'Peak 5000Hz +0.0dB Q0.90 S0.71',
  70: 'HighShelf 8000Hz +1.0dB Q0.70 S0.71',
  71: 'Peak 1050Hz +5.0dB Q1.20 S0.71',
};
const DOC_DRIVE = { drive: '80 (0x50)', dc: '65 (0x41)', vol: '150 (0x96)' };

const D = PEDAL_DEFAULTS2[KEY];
const PRE = PEDAL_PRE_EQ2[KEY];
const POSTFIX = PEDAL_POST_FIXED2[KEY];
const F = PEDAL_FORMULAS2[KEY];
const LEGACY: any = (OVERDRIVE_DEFAULTS as any)[KEY];
const LEGACY2: any = (OVERDRIVE_DEFAULTS as any)[KEY2];

console.log('══════════ 1. HM-2 主键寄存器（APK 生效值） ══════════');
console.log('key:', KEY, '| module:', D.module, '| knobs:', JSON.stringify(D.knobs), '| hidden:', JSON.stringify(D.hidden));
console.log('地址 | APK 值     | 解码参数                          | 文档参数                        | 一致');
for (let a = 57; a <= 71; a++) {
  const v = (D.allRegs as any)[a];
  const isPeq = [59, 60, 61, 62, 68, 69, 70, 71].includes(a);
  const d = isPeq ? dec(v) : String(v ?? '—');
  const doc = DOC[a] ?? '';
  const same = isPeq && DOC[a] ? (d === DOC[a] ? 'OK' : '差异') : '';
  console.log(`reg${a} | ${hex(v)} | ${d.padEnd(33)} | ${doc.padEnd(31)} | ${same}`);
}

console.log('\n══════════ 2. PEQ 生效链路（引擎实际写入值） ══════════');
console.log('PRE  59-62 ← PEDAL_PRE_EQ2：' + PRE.values.map((v, i) => `\n   reg${PRE.regs[i]} ${hex(v)}  ${dec(v)}`).join(''));
console.log('POST 固定段  ← PEDAL_POST_FIXED2：' + Object.entries(POSTFIX).map(([a, v]) => `\n   reg${a} ${hex(v)}  ${dec(v as number)}`).join(''));
console.log('POST 旋钮接管段 ← PEDAL_FORMULAS2：');
for (const kn of ['LOW', 'HIGH']) {
  const f = F[kn][0];
  const n = (D.knobs as any)[kn];
  const val = f.compute(n);
  console.log(`   ${kn} = ${n} → reg${f.regAddr} 范围[${f.min}..${f.max}] = ${hex(val)}  ${dec(val)}`);
}
console.log('Drive/Volume 基准：');
for (const kn of ['_drive', '_vol', 'DISTORTION', 'LEVEL']) {
  const f = F[kn];
  if (!f) continue;
  const n = kn.startsWith('_') ? (kn === '_drive' ? (D.knobs as any).DISTORTION : (D.knobs as any).LEVEL) : (D.knobs as any)[kn];
  console.log(`   ${kn} = ${n} → reg${f[0].regAddr} 范围[${f[0].min}..${f[0].max}] = ${f[0].compute(n)}`);
}
console.log(`   文档建议: Drive ${DOC_DRIVE.drive} / DC_ADJ ${DOC_DRIVE.dc} / Volume ${DOC_DRIVE.vol}`);

console.log('\n══════════ 3. legacy 键 ' + KEY2 + ' ══════════');
if (LEGACY2) {
  console.log('knobs:', JSON.stringify(LEGACY2.knobs));
  for (let a = 57; a <= 71; a++) {
    const v = (LEGACY2.allRegs as any)[a];
    const isPeq = [59, 60, 61, 62, 68, 69, 70, 71].includes(a);
    const d = isPeq ? dec(v) : String(v ?? '—');
    const doc = DOC[a] ?? '';
    console.log(`reg${a} | ${hex(v)} | ${d.padEnd(33)} | ${doc.padEnd(31)} | ${isPeq && DOC[a] ? (d === DOC[a] ? 'OK' : '差异') : ''}`);
  }
} else console.log('（无该键）');

console.log('\n══════════ 4. presetData 里同名主键条目（已被 PEDAL_DEFAULTS2 覆盖，不生效） ══════════');
if (LEGACY) {
  console.log('allRegs 57-71: ', [57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71].map(a => `${a}:${hex((LEGACY.allRegs as any)[a])}`).join(' '));
}
