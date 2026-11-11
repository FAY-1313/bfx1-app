/**
 * 箱头 PRE EQ 体检 (2026-09-26)
 *  A1 子型号组合键 → AMP_HEAD_HIDDEN / SUB_MODEL_PRE_EQ / AMP_HEAD_KNOB_DEFAULTS 覆盖
 *  A2 真实引擎跑 JCM800(吉他) 与 Ampeg(贝斯) → 打印最终 reg72-98 与 PRE EQ 解码
 */
import { MODULES, getDefaultSubModelName } from '../src/data/pedalData';
import { AMP_HEAD_HIDDEN, AMP_HEAD_HIDDEN_DEFAULT, AMP_HEAD_KNOB_DEFAULTS } from '../src/data/presetData';
import { SUB_MODEL_PRE_EQ, PEQ_FREQ_TABLE } from '../src/data/parameterMap';
import { generatePresetRegisters } from '../src/services/presetEngine';

const TYPES = ['Peak', 'LowShelf', 'HighShelf', 'AllPass', 'HPF', 'LPF', 'HPF-1st', 'LPF-1st'];
const hex = (v: number) => '0x' + (v >>> 0).toString(16).toUpperCase().padStart(8, '0');
const dec = (v: number) => {
  const t = v & 7, f = (v >>> 3) & 0x1ff, g = (v >>> 12) & 0xff, q = (v >>> 20) & 0x7f, s = (v >>> 27) & 0x1f;
  return `${TYPES[t]} ${PEQ_FREQ_TABLE[f] ?? '?'}Hz ${(-24 + g * 0.2).toFixed(1)}dB q=${q} s=${s}`;
};

const amp = MODULES.find((m) => m.id === 'amp-head')!;
const keys: { group: string; key: string }[] = [];
for (const [grp, list] of Object.entries(amp.subModels ?? {})) {
  for (const sm of list ?? []) for (const c of sm.captures ?? []) keys.push({ group: grp, key: `${sm.name}/${c.pos}` });
}
console.log(`═══ A1 箱头子型号组合键共 ${keys.length} 个 (guitar=${keys.filter(k=>k.group==='guitar').length} bass=${keys.filter(k=>k.group==='bass').length}) ═══`);

const missH: string[] = [], missP: string[] = [], missK: string[] = [];
for (const { key } of keys) {
  if (!Object.prototype.hasOwnProperty.call(AMP_HEAD_HIDDEN, key)) missH.push(key);
  if (!SUB_MODEL_PRE_EQ[key]) missP.push(key);
  if (!AMP_HEAD_KNOB_DEFAULTS[key]) missK.push(key);
}
console.log(`  AMP_HEAD_HIDDEN 缺失 ${missH.length}`);
missH.slice(0, 6).forEach((k) => console.log('     - ' + k));
console.log(`  SUB_MODEL_PRE_EQ(PRE EQ 数据源) 缺失 ${missP.length}`);
missP.slice(0, 10).forEach((k) => console.log('     - ' + k));
console.log(`  AMP_HEAD_KNOB_DEFAULTS 缺失 ${missK.length}`);
missK.slice(0, 6).forEach((k) => console.log('     - ' + k));

console.log(`\n  AMP_HEAD_HIDDEN 表内键数 = ${Object.keys(AMP_HEAD_HIDDEN).length}`);
console.log(`  SUB_MODEL_PRE_EQ 内 'B&F NAM' 键数 = ${Object.keys(SUB_MODEL_PRE_EQ).filter(k=>k.startsWith('B&F NAM')).length}`);

const mods = (sub: string): Record<string, boolean | string> => ({
  'noise-gate': false, compressor: false, overdrive: false, dist: false,
  'amp-head': true, ampHeadSubModel: sub, cabinet: false,
  chorus: false, 'analog-delay': false, reverb: false,
});

function dump(title: string, sub: string, mode: 'guitar' | 'bass') {
  console.log(`\n═══ A2 ${title} ═══\n  key = ${sub}`);
  const regs = new Map<number, number>();
  for (const r of generatePresetRegisters('1', 'Test', mode, mods(sub))) regs.set(r.regAddr, r.value);
  const g = (a: number) => `${String(a).padStart(3)} = ${hex(regs.get(a) ?? 0)}${regs.has(a) ? '' : '  (未写)'}`;
  console.log('  bypass/驱动: 73=' + hex(regs.get(73) ?? -1) + '  78=' + hex(regs.get(78) ?? -1) + '  79=' + (regs.get(79) ?? -1) + '  80=' + (regs.get(80) ?? -1) + '  81=' + (regs.get(81) ?? -1));
  console.log('  PRE EQ:');
  for (const a of [74, 75, 76, 77]) {
    const v = regs.get(a);
    console.log(`    ${g(a)}  ${v !== undefined ? dec(v) : ''}`);
  }
  console.log('  POST EQ(83-98):');
  console.log('    ' + [83, 84, 85, 86, 87, 88, 89, 90].map(g).join(' | '));
  console.log('    ' + [91, 92, 93, 94, 95, 96, 97, 98].map(g).join(' | '));
}

dump('吉他 JCM800', 'B&F NAM Marshall JCM800/Marshall JCM800', 'guitar');
dump('吉他 Mesa Mark', 'B&F NAM Mesa Mark/Mesa Mark', 'guitar');
dump('贝斯 Ampeg B-18N', 'B&F NAM Ampeg B-18N/Ampeg B-18N', 'bass');
console.log('\n  (参考) AMP_HEAD_HIDDEN_DEFAULT 74-77: ' + [74, 75, 76, 77].map((a) => dec(AMP_HEAD_HIDDEN_DEFAULT[a])).join(' | '));
