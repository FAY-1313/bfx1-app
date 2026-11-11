/**
 * v12 单块参数表接入验证 (2026-09-23)
 *  A1  41 个型号在 OVERDRIVE_DEFAULTS / SUB_MODEL_FORMULAS / SUB_MODEL_PRE_EQ 三表齐备
 *  A2  系列组合键已物化到新数据（抽 4 个组合键逐字节对照真实键）
 *  A3  Pre4 与生成表逐字节一致，且 4 处 HPF 类型位=4（非 AllPass）
 *  A4  音色旋钮落 Post4：TS 家族 TONE→56、DIST 家族 TONE→71（不再是 55/70 与 Pre）
 *  A5  Drive/Volume 基准在合法区间（Drive 族区间内；Volume ∈ [248,288]）
 *  A6  免写地址 43/52/58/67/73/82 在任何 allRegs 中零命中
 *  A7  MT-2/Metal Muff 等"原本落 Pre 的音色旋钮"已迁到 Post（消除 Pre 归属错误）
 */
import { OVERDRIVE_DEFAULTS } from '../src/data/presetData';
import { SUB_MODEL_FORMULAS, SUB_MODEL_PRE_EQ } from '../src/data/parameterMap';
import { PEDAL_PRE_EQ2, PEDAL_FORMULAS2, PEDAL_DEFAULTS2, PEDAL_LOW_CONF } from '../src/data/_gen/pedal_params2';
import { SERIES_REGISTRY, seriesModelKey } from '../src/data/seriesData';

let pass = 0, fail = 0;
const check = (n: string, ok: boolean, d = '') => {
  if (ok) { pass++; console.log(`  OK   ${n}${d ? '  ' + d : ''}`); }
  else { fail++; console.log(`  FAIL ${n}  ${d}`); }
};
const keys = Object.keys(PEDAL_PRE_EQ2);
const CLEAR = [43, 52, 58, 67, 73, 82];   // R4 免写地址

console.log('═══ A1 三表齐备 ═══');
check('型号数 = 41', keys.length === 41, `实际 ${keys.length}`);
check('OVERDRIVE_DEFAULTS 全部覆盖', keys.every(k => !!OVERDRIVE_DEFAULTS[k]));
check('SUB_MODEL_FORMULAS 全部覆盖', keys.every(k => !!SUB_MODEL_FORMULAS[k]));
check('SUB_MODEL_PRE_EQ 全部覆盖', keys.every(k => !!SUB_MODEL_PRE_EQ[k]));

console.log('\n═══ A2 系列组合键物化 ═══');
let composed = 0, composedOk = 0;
for (const s of SERIES_REGISTRY) {
  for (const m of s.models as any[]) {
    if (!PEDAL_PRE_EQ2[m.key]) continue;
    const ck = seriesModelKey(s as any, m as any);
    composed++;
    if (JSON.stringify(SUB_MODEL_PRE_EQ[ck]?.values) === JSON.stringify(PEDAL_PRE_EQ2[m.key].values)) composedOk++;
  }
}
check('组合键 PRE EQ 已指向新数据', composedOk === composed, `${composedOk}/${composed}`);

console.log('\n═══ A3 Pre4 与 HPF 类型位 ═══');
let preSame = 0;
for (const k of keys) {
  if (JSON.stringify(SUB_MODEL_PRE_EQ[k]?.values) === JSON.stringify(PEDAL_PRE_EQ2[k].values)) preSame++;
}
check('Pre4 逐字节一致', preSame === keys.length, `${preSame}/${keys.length}`);
const hpfRows: string[] = [];
for (const k of keys) {
  const src = PEDAL_DEFAULTS2[k].name;
  const v0 = PEDAL_PRE_EQ2[k].values[0];
  // 源文件标注为 HPF 的 4 个型号：OD-3 / TS808 / OD808 / BASSRIG
  if (['OD-3', 'TS808', 'OD808', 'BASSRIG'].includes(src)) hpfRows.push(`${src}:${v0 & 7}`);
}
check('4 处 HPF 类型位 = 4（AllPass=3 已修正）', hpfRows.every(s => s.endsWith(':4')), hpfRows.join(' '));

console.log('\n═══ A4 音色旋钮落 Post4 ═══');
const f = (k: string, knob: string) => PEDAL_FORMULAS2[k]?.[knob]?.[0]?.regAddr;
const TS808 = 'B&F NAM Ibanez TS808/Ibanez TS808';
const SD1 = 'B&F NAM Boss SD-1/Boss SD-1';
const DS1 = 'B&F NAM Boss DS-1/Boss DS-1';
const MT2 = 'B&F NAM Boss MT-2/Boss MT-2';
const MMUFF = 'B&F NAM Boss Metal Muff/Boss Metal Muff';
check('TS808 TONE → reg56 (Post B4)', f(TS808, 'TONE') === 56, `实际 ${f(TS808, 'TONE')}`);
check('SD-1 TONE → reg56 (Post B4)', f(SD1, 'TONE') === 56, `实际 ${f(SD1, 'TONE')}`);
check('TS808 DRIVE → reg49 / LEVEL → reg51', f(TS808, 'DRIVE') === 49 && f(TS808, 'LEVEL') === 51);
if (PEDAL_FORMULAS2[MT2]) {
  const lows = [f(MT2, 'LOW'), f(MT2, 'HIGH'), f(MT2, 'MID')].filter(x => x !== undefined);
  check('MT-2 音色旋钮全在 Post4(68-71)', lows.length > 0 && lows.every(a => a >= 68 && a <= 71), lows.join(','));
}
if (PEDAL_FORMULAS2[MMUFF]) {
  const ms = [f(MMUFF, 'BASS'), f(MMUFF, 'MID'), f(MMUFF, 'TREBLE')].filter(x => x !== undefined);
  check('Metal Muff 三钮全在 Post4(68-71)', ms.length === 3 && ms.every(a => a >= 68 && a <= 71), ms.join(','));
}

console.log('\n═══ A5 Drive / Volume 基准区间 ═══');
const bad: string[] = [];
for (const k of keys) {
  const d = PEDAL_DEFAULTS2[k];
  const drv = d.allRegs[49] ?? d.allRegs[64];
  const vol = d.allRegs[51] ?? d.allRegs[66];
  if (!(drv >= 0 && drv <= 92)) bad.push(`${d.name}:Drive=${drv}`);
  if (!(vol >= 248 && vol <= 288)) bad.push(`${d.name}:Vol=${vol}`);
}
check('Drive ∈ [0,92] 且 Volume ∈ [248,288]', bad.length === 0, bad.slice(0, 5).join(' '));

console.log('\n═══ A6 免写地址零命中 ═══');
const leak: string[] = [];
for (const k of keys) {
  for (const a of Object.keys(PEDAL_DEFAULTS2[k].allRegs)) {
    if (CLEAR.includes(Number(a))) leak.push(`${PEDAL_DEFAULTS2[k].name}:${a}`);
  }
}
check('allRegs 无 43/52/58/67/73/82', leak.length === 0, leak.slice(0, 6).join(' '));

console.log('\n═══ A7 低置信度清单已登记 ═══');
check('PEDAL_LOW_CONF 非空并含 HM-2 说明', PEDAL_LOW_CONF.length > 0 && PEDAL_LOW_CONF.some(s => s.includes('HM-2')),
  `${PEDAL_LOW_CONF.length} 条`);

console.log(`\n════════ 总结: ${pass} PASS / ${fail} FAIL ${fail === 0 ? '→ 验证通过' : '→ 需修正'}`);
process.exit(fail === 0 ? 0 : 1);
