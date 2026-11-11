/**
 * 批次 3 自我验证 (2026-09-23) — A5 地址集策略 + A6 16 预设重设计 + A7 播种基线
 *
 * 背景：固件 R4 取消 13 个地址（7,42,43,52,57,58,67,72,73,82,107,224,253）
 *   其中 7 个是"模块总旁路位"（组内档位靠它们区分）→ 必须改为【参数区分】
 *   另 6 个是"模块内部分段旁路位"（3+3，APK 本就免写）→ 必须【完全不出现】
 *
 * 断言：
 *  V1  取消地址集策略（13 / 7 / 6 的划分）
 *  V2  getModuleOffRegs 正确性（全在白名单内、内部旁路位 48/63/78=1、PEQ 段为直通值）
 *  V3  16 出厂预设：白名单外地址零命中（7/42/57/72/107/224/253 + 43/52/58/67/73/82）
 *  V4  16 出厂预设：不启用模块的区间 = 该模块直通参数
 *  V5  组内 4 档寄存器图互不相同（A5+A6 的核心目的）
 *  V6  关键"角色差异"存在（清音档 OD 直通 / 失真档 DIST 直通 / SOLO 档 delay 开）
 *  V7  预设1 空音色 = 完整中性直通链（含系统寄存器与限幅器）
 *  V8  presetEngine 输出同样满足免写 6 地址零命中
 */
import {
  PASSTHROUGH_PEQ, PASSTHROUGH_REGS, PASSTHROUGH_MODULES, LEGACY_BYPASS_MODULES,
  PASSTHROUGH_RANGES, CANCELLED_ADDRS, CANCELLED_BYPASS_ADDRS, CANCELLED_CLEAR_ADDRS,
  isWritableAddr, INTERNAL_BYPASS_BY_MODULE, getModuleOffRegs, applyWhitelistPolicy, REVERB_ON_DEFAULTS,
} from '../src/data/passThrough';
import { buildBuiltinPresets, BYPASS_PRESET } from '../src/data/builtinPresets';
import { generatePresetRegisters } from '../src/services/presetEngine';
import { CABINET_PEQ } from '../src/data/cabinetPeqData';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => {
  if (ok) { pass++; console.log(`  OK   ${name}${detail ? '  ' + detail : ''}`); }
  else { fail++; console.log(`  FAIL ${name}  ${detail}`); }
};
const hex = (v: number) => '0x' + (v >>> 0).toString(16).toUpperCase().padStart(8, '0');

const R4_DOC = [7, 42, 43, 52, 57, 58, 67, 72, 73, 82, 107, 224, 253];
const CLEAR_ADDRS = [43, 52, 58, 67, 73, 82];               // 免写（模块内部分段旁路位）
const BYPASS_ADDRS = [7, 42, 57, 72, 107, 224, 253];        // 模块总旁路位 → 2026-09-25 起一律不写入

const presets = buildBuiltinPresets();
const bySlot = new Map(presets.map(p => [p.slot, p]));
const addrsOf = (p: { registers: Record<number, number> }) => Object.keys(p.registers).map(Number);

console.log('═══ V1 取消地址集策略 ═══');
check('CANCELLED_ADDRS = R4 文档 13 个', JSON.stringify([...CANCELLED_ADDRS].sort((a, b) => a - b)) === JSON.stringify([...R4_DOC].sort((a, b) => a - b)), `实际 ${CANCELLED_ADDRS.length} 个`);
check('CANCELLED_BYPASS_ADDRS = 7 个总旁路位', JSON.stringify([...CANCELLED_BYPASS_ADDRS].sort((a, b) => a - b)) === JSON.stringify([...BYPASS_ADDRS].sort((a, b) => a - b)), `实际 ${CANCELLED_BYPASS_ADDRS.join(',')}`);
check('13 = 7(总旁路位) + 6(免写)', CANCELLED_ADDRS.length === CANCELLED_BYPASS_ADDRS.length + CLEAR_ADDRS.length);
check('免写 6 个不在总旁路位集内', CLEAR_ADDRS.every(a => !(CANCELLED_BYPASS_ADDRS as readonly number[]).includes(a)));

console.log('\n═══ V2 getModuleOffRegs 正确性（2026-09-25 统一口径）═══');
const P = PASSTHROUGH_PEQ;
for (const mid of PASSTHROUGH_MODULES) {
  const pt = getModuleOffRegs(mid);
  const bad = Object.keys(pt).map(Number).filter(a => !isWritableAddr(a));
  check(`${mid} 直通参数全在白名单内`, bad.length === 0, bad.length ? `违规: ${bad.join(',')}` : `${Object.keys(pt).length} 条`);
  const by = INTERNAL_BYPASS_BY_MODULE[mid];
  check(`${mid} 内部旁路位${by ?? ''}=1（真旁路该级）`, by === undefined ? true : pt[by] === 1,
    by === undefined ? '(该模块无内部旁路位, 参数化直通)' : `reg${by}=${pt[by]}`);
}
check('overdrive 8 段 PEQ = 直通值', [44, 45, 46, 47, 53, 54, 55, 56].every(a => getModuleOffRegs('overdrive')[a] === P));
check('dist 8 段 PEQ = 直通值', [59, 60, 61, 62, 68, 69, 70, 71].every(a => getModuleOffRegs('dist')[a] === P));
check('amp-head 20 段 PEQ = 直通值', [...[74, 75, 76, 77], ...Array.from({ length: 16 }, (_, i) => 83 + i)].every(a => getModuleOffRegs('amp-head')[a] === P));
check('cabinet 35 段 = 直通值', Array.from({ length: 35 }, (_, i) => 108 + i).every(a => getModuleOffRegs('cabinet')[a] === P));
check('compressor 阈值 max / MakeUp min', getModuleOffRegs('compressor')[8] === 50 && getModuleOffRegs('compressor')[13] === 0);
check('reverb Mix = 0', getModuleOffRegs('reverb')[229] === 0);
check('关闭态不写 Drive/DC/Volume（四=A：只写 PEQ 复位 + 旁路位）',
  getModuleOffRegs('overdrive')[49] === undefined && getModuleOffRegs('dist')[64] === undefined && getModuleOffRegs('amp-head')[79] === undefined);
check('getModuleOffRegs ≡ PASSTHROUGH_REGS（预设/快照/踩钉三路同口径）',
  PASSTHROUGH_MODULES.every(mid => JSON.stringify(getModuleOffRegs(mid)) === JSON.stringify(PASSTHROUGH_REGS[mid] ?? {})));

console.log('\n═══ V3 出厂预设：白名单外地址零命中 ═══');
const leakedAll = presets.flatMap(p => addrsOf(p).filter(a => !isWritableAddr(a)).map(a => `槽${p.slot}:reg${a}`));
check('16 档均无白名单外地址', leakedAll.length === 0, leakedAll.join(' '));
for (const p of presets) {
  const as = addrsOf(p);
  const leaked = as.filter(a => CLEAR_ADDRS.includes(a));
  check(`槽${p.slot} ${p.name} 无免写地址`, leaked.length === 0, leaked.length ? `违规: ${leaked.join(',')}` : '');
}

console.log('\n═══ V4 不启用模块的区间 = 该模块直通参数 ═══');
for (const p of presets) {
  const dev: string[] = [];
  for (const mid of PASSTHROUGH_MODULES) {
    if (p.modules?.[mid]) continue;                    // 该档启用本模块 → 不检查
    const pt = getModuleOffRegs(mid);
    const [lo, hi] = PASSTHROUGH_RANGES[mid];
    for (const [aStr, v] of Object.entries(pt)) {
      const a = Number(aStr);
      if (a < lo || a > hi) continue;
      if (p.registers[a] !== v) dev.push(`${mid}:reg${a} 期望${v} 实际${p.registers[a]}`);
    }
  }
  check(`槽${p.slot} ${p.name} 关闭模块 = 直通参数`, dev.length === 0, dev.slice(0, 4).join(' '));
}

console.log('\n═══ V5 组内 4 档寄存器图互不相同（A5+A6 核心目的）═══');
const GROUPS: Record<string, number[]> = { A: [2, 3, 4], B: [5, 6, 7, 8], C: [9, 10, 11, 12], D: [13, 14, 15, 16] };
for (const [label, slots] of Object.entries(GROUPS)) {
  const maps = slots.map(s => bySlot.get(s)!);
  for (let i = 0; i < maps.length; i++) {
    for (let j = i + 1; j < maps.length; j++) {
      const a = maps[i], b = maps[j];
      const all = new Set([...addrsOf(a), ...addrsOf(b)]);
      const diff = [...all].filter(k => a.registers[k] !== b.registers[k]);
      check(`${label}组 槽${a.slot}↔槽${b.slot} 存在参数差异`, diff.length > 0,
        diff.length ? `${diff.length} 个地址: ${diff.join(',')}` : '寄存器图完全相同 → 会塌成同一音色');
    }
  }
}

console.log('\n═══ V6 角色差异（清音/过载/失真/SOLO）═══');
const peqEq = (p: { registers: Record<number, number> }, as: number[]) => as.every(a => p.registers[a] === P);
const odOff = (s: number) => peqEq(bySlot.get(s)!, [44, 45, 46, 47, 53, 54, 55, 56]);
const distOff = (s: number) => peqEq(bySlot.get(s)!, [59, 60, 61, 62, 68, 69, 70, 71]);
check('A2 清音：过载段直通 + 失真段直通', odOff(2) && distOff(2));
check('A3 过载：过载段非直通 + 失真段直通', !odOff(3) && distOff(3));
check('A4 SOLO：过载段非直通 + 失真段非直通', !odOff(4) && !distOff(4));
check('B/C 组清音档（B1/C1）双段直通', odOff(5) && distOff(5) && odOff(9) && distOff(9));
check('B/C 组过载档（B2/C2）过载非直通 + 失真直通', !odOff(6) && distOff(6) && !odOff(10) && distOff(10));
check('D 组（贝斯）无失真：D2/D3/D4 失真段直通', distOff(14) && distOff(15) && distOff(16));
check('D1 清音：过载段直通', odOff(13));
check('B4/C4 SOLO：延迟开（221=0）、B1 清音延迟关（221=1）',
  bySlot.get(8)!.registers[221] === 0 && bySlot.get(12)!.registers[221] === 0 && bySlot.get(5)!.registers[221] === 1);

console.log('\n═══ V7 预设1 空音色 = 完整中性直通链 ═══');
const s1 = bySlot.get(1)!;
const s1addrs = addrsOf(s1);
check('槽1 存在', !!s1);
check('槽1 六个直通类模块 = 直通参数', PASSTHROUGH_MODULES.every(mid => {
  const pt = getModuleOffRegs(mid);
  return Object.entries(pt).every(([a, v]) => s1.registers[Number(a)] === v);
}));
check('槽1 有效旁路位 0/215/221 = 1', s1.registers[0] === 1 && s1.registers[215] === 1 && s1.registers[221] === 1);
check('槽1 含系统寄存器 2/3/261', s1addrs.includes(2) && s1addrs.includes(3) && s1addrs.includes(261), `实际 ${s1addrs.length} 个地址`);
check('槽1 含限幅器 Off 档 254-259', [254, 255, 256, 257, 258, 259].every(a => s1addrs.includes(a)));
// 239(箱头 MASTER/PreMixer) 属箱头模块参数 → 槽1 箱头关闭, 一律不写（2026-09-25 用户口径）
check('槽1 不含箱头 MASTER(239)（箱头关闭即不写）', !s1addrs.includes(239));
check('槽1 无白名单外地址', s1addrs.every(a => isWritableAddr(a)));
check('槽1 三个内部旁路位 = 1（全模块关闭）', [48, 63, 78].every(a => s1.registers[a] === 1));
check('BYPASS_PRESET 与槽1 同源', BYPASS_PRESET.slot === 1 && addrsOf(BYPASS_PRESET).length === s1addrs.length);

console.log('\n═══ V8 presetEngine 输出地址集策略 ═══');
const eng = generatePresetRegisters('t', 't', 'guitar', {
  'noise-gate': true, compressor: true, overdrive: true, dist: true, 'amp-head': true,
  cabinet: true, chorus: false, delay: true, reverb: true,
  compressorSubModel: 'B&F Dyna Comp', overdriveSubModel: '中频过载/TS808',
  distSubModel: '经典失真/DS-1', ampHeadSubModel: 'B&F NAM Fender Twin Reverb/Fender Twin Reverb',
});
const engAddrs = eng.map(r => r.regAddr);
check('engine 输出无免写 6 地址', engAddrs.filter(a => CLEAR_ADDRS.includes(a)).length === 0,
  engAddrs.filter(a => CLEAR_ADDRS.includes(a)).join(','));
check('engine 输出全在白名单内', engAddrs.every(a => isWritableAddr(a)),
  engAddrs.filter(a => !isWritableAddr(a)).join(','));
check('engine 输出内部旁路位唯一且 = 0（该档三模块均启用）',
  [48, 63, 78].every(a => { const hit = eng.filter(r => r.regAddr === a); return hit.length === 1 && hit[0].value === 0; }));

console.log('\n═══ V9 A5 策略入口 + 踩钉开启的数据源 ═══');
const probe: Record<number, number> = {
  7: 1, 42: 1, 43: 0, 52: 0, 57: 1, 58: 0, 67: 0, 72: 1, 73: 0, 82: 0, 107: 1, 224: 1, 253: 0,
  48: 0, 63: 0, 78: 0, 44: 123456,
};
applyWhitelistPolicy(probe);
check('applyWhitelistPolicy 删除全部白名单外地址',
  [...CANCELLED_ADDRS].every(a => !(a in probe)), [...CANCELLED_ADDRS].filter(a => a in probe).join(','));
check('applyWhitelistPolicy 不动 48/63/78 与普通参数',
  probe[48] === 0 && probe[63] === 0 && probe[78] === 0 && probe[44] === 123456);
check('CANCELLED_CLEAR_ADDRS = 43/52/58/67/73/82',
  JSON.stringify([...CANCELLED_CLEAR_ADDRS]) === JSON.stringify(CLEAR_ADDRS), CANCELLED_CLEAR_ADDRS.join(','));
check('REVERB_ON_DEFAULTS 为可听参数（229>0, 5 段）',
  REVERB_ON_DEFAULTS[229] > 0 && Object.keys(REVERB_ON_DEFAULTS).length === 5,
  `229=${REVERB_ON_DEFAULTS[229]}`);
check('箱体捕获数据源非空（踩钉开启箱体可恢复曲线）', Object.keys(CABINET_PEQ).length > 0, `${Object.keys(CABINET_PEQ).length} 条`);
check('踩钉"开启"恢复覆盖全部 6 个直通类模块',
  PASSTHROUGH_MODULES.every(mid => ['compressor', 'overdrive', 'dist', 'amp-head', 'cabinet', 'reverb'].includes(mid)));

console.log(`\n════════ 总结: ${pass} PASS / ${fail} FAIL ${fail === 0 ? '→ 验证通过' : '→ 需修正'}`);
process.exit(fail === 0 ? 0 : 1);
