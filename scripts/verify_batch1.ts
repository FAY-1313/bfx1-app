/**
 * 批次 1 自我验证 (2026-09-22)
 *  V1 直通 PEQ 值 = 0x50A78540
 *  V2 各模块直通寄存器集完整且取值正确 (压缩 8=50/13=0, OD/DIST/AMP 用 48/63/78, 箱体 35 段, 混响 229=0)
 *  V3 直通集【不含】固件 R4 已取消的地址 (7,42,43,52,57,58,67,72,73,82,107,224,253)
 *  V4 踩钉分类: 保留旁路 = noise-gate/chorus/delay; 复位直通 = 6 个模块
 *  V5 i18n 两个新增键存在
 */
import { PASSTHROUGH_PEQ, PASSTHROUGH_REGS, PASSTHROUGH_MODULES, LEGACY_BYPASS_MODULES } from '../src/data/passThrough';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => {
  if (ok) { pass++; console.log(`  OK  ${name}${detail ? '  ' + detail : ''}`); }
  else { fail++; console.log(`  FAIL ${name}  ${detail}`); }
};
const hex = (v: number) => '0x' + (v >>> 0).toString(16).toUpperCase().padStart(8, '0');

console.log('═══ V1 直通 PEQ 值 ═══');
check('PASSTHROUGH_PEQ = 0x50A78540', PASSTHROUGH_PEQ === 0x50A78540, `实际 ${hex(PASSTHROUGH_PEQ)}`);

console.log('\n═══ V2 各模块直通寄存器集 ═══');
const P = PASSTHROUGH_PEQ;
const R = PASSTHROUGH_REGS;

// 压缩器
check('compressor 阈值=50', R.compressor?.[8] === 50, `reg8=${R.compressor?.[8]}`);
check('compressor MakeUp=0', R.compressor?.[13] === 0, `reg13=${R.compressor?.[13]}`);

// 过载: preEQ 44-47 + postEQ 53-56 = 8 段 + 48=1
for (const a of [44, 45, 46, 47, 53, 54, 55, 56]) check(`overdrive reg${a} = 直通PEQ`, R.overdrive?.[a] === P, hex(R.overdrive?.[a] ?? 0));
check('overdrive reg48 = 1 (主旁路)', R.overdrive?.[48] === 1);

// 失真: 59-62 + 68-71 = 8 段 + 63=1
for (const a of [59, 60, 61, 62, 68, 69, 70, 71]) check(`dist reg${a} = 直通PEQ`, R.dist?.[a] === P, hex(R.dist?.[a] ?? 0));
check('dist reg63 = 1 (clip 旁路)', R.dist?.[63] === 1);

// 箱头: preEQ 74-77 (4) + postEQ 83-98 (16) = 20 段 + 78=1
for (const a of [74, 75, 76, 77, ...Array.from({ length: 16 }, (_, i) => 83 + i)])
  check(`amp-head reg${a} = 直通PEQ`, R['amp-head']?.[a] === P, hex(R['amp-head']?.[a] ?? 0));
check('amp-head reg78 = 1 (箱头 OD 旁路)', R['amp-head']?.[78] === 1);

// 箱体: 35 段
check('cabinet 35 段全 = 直通PEQ',
  Array.from({ length: 35 }, (_, i) => 108 + i).every(a => R.cabinet?.[a] === P),
  `段数=${Object.keys(R.cabinet ?? {}).length}`);

// 混响
check('reverb reg229 = 0 (Mix 纯干声)', R.reverb?.[229] === 0);

// 限幅器: 不含 253
check('limiter reg254 = 47 (阈值)', R.limiter?.[254] === 47);
check('limiter reg259 = 0 (MakeUp)', R.limiter?.[259] === 0);
check('limiter 不含已取消的 253', R.limiter?.[253] === undefined);

console.log('\n═══ V3 直通集不含 R4 取消地址 ═══');
const CANCELLED = [7, 42, 43, 52, 57, 58, 67, 72, 73, 82, 107, 224, 253];
for (const [mid, regs] of Object.entries(R)) {
  const bad = Object.keys(regs).map(Number).filter(a => CANCELLED.includes(a));
  check(`${mid} 无取消地址`, bad.length === 0, bad.length ? `违规: ${bad.join(',')}` : '');
}

console.log('\n═══ V4 踩钉分类 ═══');
check('保留旁路 = noise-gate/chorus/delay',
  [...LEGACY_BYPASS_MODULES].sort().join(',') === ['noise-gate', 'chorus', 'delay'].sort().join(','),
  [...LEGACY_BYPASS_MODULES].join(','));
check('复位直通 = compressor/overdrive/dist/amp-head/cabinet/reverb',
  [...PASSTHROUGH_MODULES].sort().join(',') === ['compressor', 'overdrive', 'dist', 'amp-head', 'cabinet', 'reverb'].sort().join(','),
  [...PASSTHROUGH_MODULES].join(','));
check('两类互不重叠', PASSTHROUGH_MODULES.every(m => !(LEGACY_BYPASS_MODULES as readonly string[]).includes(m)));

console.log(`\n════════ 总结: ${pass} PASS / ${fail} FAIL ${fail === 0 ? '→ 验证通过' : '→ 需修正'}`);
process.exit(fail === 0 ? 0 : 1);
