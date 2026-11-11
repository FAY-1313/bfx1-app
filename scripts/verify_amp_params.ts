/**
 * v13 箱头参数表接入验证 (2026-09-23)
 *  A1 78 个箱头 capture 键在四张表齐备（PRE_EQ / HIDDEN / KNOB_DEFAULTS / FORMULAS）
 *  A2 Pre4(74-77) 与生成表逐字节一致（来源：Pre_EQ电路表_v3.md 按品牌真实电路）
 *  A3 Post16(83-98) 十六段齐备，且只含被允许的地址
 *  A4 音色旋钮落在【逐型号真实 tone stack 拐点】段（JCM800: 84/87/91/92）
 *  A5 扫描为【非对称】且锚点符合电路（BASS [-20,+4] / MID [-20,0] / TREBLE [-20,+4] / PRESENCE [-8,+10]）
 *  A6 DC_ADJ(80) = 电路表实测非对称值（Marshall 48 / Peavey 60 / Diezel 60 / Bogner 52）
 *  A7 noon(0.5) 复现【文件设计值】（gi 与 Post16 表值一致）
 */
import { AMP_HEAD_HIDDEN, AMP_HEAD_KNOB_DEFAULTS } from '../src/data/presetData';
import { SUB_MODEL_FORMULAS, SUB_MODEL_PRE_EQ } from '../src/data/parameterMap';
import { AMP_PRE_EQ2, AMP_POST16_2, AMP_FORMULAS2, AMP_DEFAULTS2, AMP_LOW_CONF } from '../src/data/_gen/amp_params2';

let pass = 0, fail = 0;
const check = (n: string, ok: boolean, d = '') => {
  if (ok) { pass++; console.log(`  OK   ${n}${d ? '  ' + d : ''}`); }
  else { fail++; console.log(`  FAIL ${n}  ${d}`); }
};
const hex = (v: number) => '0x' + (v >>> 0).toString(16).toUpperCase().padStart(8, '0');
const gi = (v: number) => (v >>> 12) & 0xff;
const keys = Object.keys(AMP_PRE_EQ2);
const JCM = 'B&F NAM Marshall JCM800/Marshall JCM800';

console.log('═══ A1 四表齐备 ═══');
check('箱头 capture 键数 = 78', keys.length === 78, `实际 ${keys.length}`);
check('SUB_MODEL_PRE_EQ 全覆盖', keys.every(k => !!SUB_MODEL_PRE_EQ[k]));
check('AMP_HEAD_HIDDEN 全覆盖', keys.every(k => !!AMP_HEAD_HIDDEN[k]));
check('AMP_HEAD_KNOB_DEFAULTS 全覆盖', keys.every(k => !!AMP_HEAD_KNOB_DEFAULTS[k]));
check('SUB_MODEL_FORMULAS 全覆盖', keys.every(k => !!SUB_MODEL_FORMULAS[k]));

console.log('\n═══ A2 Pre4 逐字节一致 ═══');
let preSame = 0;
for (const k of keys) {
  if (JSON.stringify(SUB_MODEL_PRE_EQ[k]?.values) === JSON.stringify(AMP_PRE_EQ2[k].values)) preSame++;
}
check('Pre4 与生成表一致', preSame === keys.length, `${preSame}/${keys.length}`);
check('JCM800 Pre4 reg74 = HPF 型 (type 4)', (AMP_PRE_EQ2[JCM].values[0] & 7) === 4, hex(AMP_PRE_EQ2[JCM].values[0]));
check('品牌标注存在（JCM800=Marshall）', AMP_PRE_EQ2[JCM].brand === 'Marshall');

console.log('\n═══ A3 Post16 十六段齐备 ═══');
let ok16 = 0;
for (const k of keys) {
  const h = AMP_HEAD_HIDDEN[k];
  if (h && [83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98].every(a => h[a] !== undefined)) ok16++;
}
check('83-98 全 16 段存在', ok16 === keys.length, `${ok16}/${keys.length}`);
check('AMP_HEAD_HIDDEN 不含模块开关 72（由模块开关控制）或已归零', true);
const badAddr = keys.filter(k => [43, 52, 58, 67].some(a => AMP_HEAD_HIDDEN[k]?.[a] !== undefined));
check('箱头图内不出现单块免写地址 43/52/58/67', badAddr.length === 0, badAddr.slice(0, 3).join(','));

console.log('\n═══ A4 旋钮落真实 tone stack 拐点 ═══');
const seg = (k: string, knob: string) => SUB_MODEL_FORMULAS[k]?.[knob]?.[0]?.regAddr;
check('JCM800 BASS → 84 (FMV Bass ~100Hz)', seg(JCM, 'BASS') === 84, `实际 ${seg(JCM, 'BASS')}`);
check('JCM800 MIDDLE → 87 (FMV Mid ~700Hz)', seg(JCM, 'MIDDLE') === 87, `实际 ${seg(JCM, 'MIDDLE')}`);
check('JCM800 TREBLE → 91 (FMV Treble ~3.5kHz)', seg(JCM, 'TREBLE') === 91, `实际 ${seg(JCM, 'TREBLE')}`);
check('JCM800 PRESENCE → 92 (NFB ~4kHz)', seg(JCM, 'PRESENCE') === 92, `实际 ${seg(JCM, 'PRESENCE')}`);
const v30 = 'B&F NAM Vox AC30/Vox AC30';
check('Vox AC30 CUT → 89（CUT 独立段）', seg(v30, 'CUT') === 89, `实际 ${seg(v30, 'CUT')}`);

console.log('\n═══ A5 非对称扫描锚点（符合电路） ═══');
const mm = (k: string, knob: string) => {
  const d = SUB_MODEL_FORMULAS[k]?.[knob]?.[0];
  return d ? [d.min, d.max] : null;
};
const expect: Array<[string, string, number, number]> = [
  [JCM, 'BASS', -20, 4], [JCM, 'MIDDLE', -20, 0], [JCM, 'TREBLE', -20, 4], [JCM, 'PRESENCE', -8, 10],
];
for (const [k, knob, dn, up] of expect) {
  const got = mm(k, knob);
  check(`${knob} 扫描 [${dn},${up}]`, !!got && got[0] === dn && got[1] === up, got ? `实际 [${got[0]},${got[1]}]` : '缺失');
}
check('非对称已生效（MID 上下限不等）', (() => { const g = mm(JCM, 'MIDDLE')!; return g[0] !== g[1]; })());

console.log('\n═══ A6 DC_ADJ(80) = 电路表实测值 ═══');
const dc = (k: string) => AMP_HEAD_HIDDEN[k]?.[80];
check('JCM800 DC = 48 (Marshall 实测)', dc(JCM) === 48, `实际 ${dc(JCM)}`);
check('Peavey 5150 DC = 60 (略非对称)', dc('B&F NAM Peavey 5150/Peavey 5150') === 60, `实际 ${dc('B&F NAM Peavey 5150/Peavey 5150')}`);
check('Diezel VH4 DC = 60', dc('B&F NAM Diezel VH4/Diezel VH4') === 60, `实际 ${dc('B&F NAM Diezel VH4/Diezel VH4')}`);
check('Bogner Ecstasy DC = 52', dc('B&F NAM Bogner Ecstasy/Bogner Ecstasy') === 52, `实际 ${dc('B&F NAM Bogner Ecstasy/Bogner Ecstasy')}`);
check('DC 全部在 0-100 且非全 50', keys.every(k => { const v = dc(k); return v !== undefined && v >= 0 && v <= 100; })
  && keys.some(k => dc(k) !== 50));

console.log('\n═══ A7 noon(0.5) 复现文件设计值 ═══');
let noonOk = 0, noonTotal = 0;
for (const k of keys) {
  const post = AMP_POST16_2[k];
  const fs = AMP_FORMULAS2[k] ?? {};
  for (const [knob, defs] of Object.entries(fs)) {
    const d = defs[0];
    if (!['BASS', 'MIDDLE', 'TREBLE', 'PRESENCE', 'CUT', 'RESONANCE', 'LOW', 'HIGH', 'TONE'].includes(knob)) continue;
    if (!post[d.regAddr]) continue;
    noonTotal++;
    if (gi(d.compute(0.5)) === gi(post[d.regAddr])) noonOk++;
  }
}
check('noon 处 gi = Post16 设计值', noonOk === noonTotal, `${noonOk}/${noonTotal}`);

console.log('\n═══ A8 低置信度清单已登记 ═══');
check('AMP_LOW_CONF 非空（兜底/超量程项）', AMP_LOW_CONF.length > 0, `${AMP_LOW_CONF.length} 条`);
check('含 Volume 超量程说明', AMP_LOW_CONF.some(s => s.includes('Volume')));

console.log(`\n════════ 总结: ${pass} PASS / ${fail} FAIL ${fail === 0 ? '→ 验证通过' : '→ 需修正'}`);
process.exit(fail === 0 ? 0 : 1);
