/**
 * A5/A6/A7 自我验证 (2026-09-23)
 *  V1  buildBuiltinPresets() 返回 16 项, slot = 1..16
 *  V2  16 档快照均不含任何白名单外地址（7/42/57/72/107/224/253 + 43/52/58/67/73/82）
 *  V3  被取消地址零命中（出现 0 值也不允许）
 *  V4  16 档均含内部旁路位 48/63/78，且值 = 该档模块启用 ? 0 : 1
 *  V5  同组 4 档 registers 两两不全等 (参数可区分)
 *  V6  清音档(2/5/9/13): OD 与 DIST 段全直通且 drive=0
 *  V7  OD 关的档(2/5/7/9/11/13): reg49=0 且 OD PEQ 段全直通
 *  V8  D3 != D4 (槽15/16 至少 2 个寄存器不同)
 *  V9  每组 reg79 随 清音→主音 单调不减
 *  V10 getModulePassthrough 返回值不含任何被取消地址
 *  V11 保留位语义: chorus 全关→215=1; noise-gate 全开→0=0
 */
import { buildBuiltinPresets } from '../src/data/builtinPresets';
import {
  PASSTHROUGH_PEQ, PASSTHROUGH_MODULES, CANCELLED_ADDRS, isWritableAddr,
  INTERNAL_BYPASS_BY_MODULE, getModuleOffRegs,
} from '../src/data/passThrough';

type Regs = Record<number, number>;
let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => {
  if (ok) { pass++; console.log(`  OK  ${name}${detail ? '  ' + detail : ''}`); }
  else { fail++; console.log(`  FAIL ${name}  ${detail}`); }
};
const hex = (v: number | undefined) => v === undefined ? 'MISSING' : '0x' + (v >>> 0).toString(16).toUpperCase().padStart(8, '0');

const presets = buildBuiltinPresets();
const bySlot = new Map(presets.map(p => [p.slot, p]));
const R = (slot: number): Regs => (bySlot.get(slot)!.registers as unknown) as Regs;

console.log('═══ V1 预设数量与槽位 ═══');
check('16 项', presets.length === 16, `实际 ${presets.length}`);
check('slot = 1..16 连续', presets.map(p => p.slot).join(',') === Array.from({ length: 16 }, (_, i) => i + 1).join(','));

console.log('\n═══ V2 16 档不含白名单外地址 ═══');
for (const slot of Array.from({ length: 16 }, (_, i) => i + 1)) {
  const regs = R(slot);
  const leaked = Object.keys(regs).map(Number).filter(a => !isWritableAddr(a));
  check(`槽${slot} 全在白名单内`, leaked.length === 0, leaked.length ? `越界: ${leaked.join(',')}` : '');
}

console.log('\n═══ V3 被取消地址零命中（0 值也不允许）═══');
for (const slot of Array.from({ length: 16 }, (_, i) => i + 1)) {
  const regs = R(slot);
  const bad = CANCELLED_ADDRS.filter(a => regs[a] !== undefined);
  check(`槽${slot}`, bad.length === 0, bad.length ? `违规: ${bad.map(a => `${a}=${regs[a]}`).join(',')}` : '');
}

console.log('\n═══ V4 内部旁路位 48/63/78 = 模块开关 ═══');
for (const slot of Array.from({ length: 16 }, (_, i) => i + 1)) {
  const p = bySlot.get(slot)!;
  const regs = R(slot);
  const bad: string[] = [];
  for (const [mid, by] of Object.entries(INTERNAL_BYPASS_BY_MODULE)) {
    const want = (p.modules?.[mid] ?? false) ? 0 : 1;
    const got = regs[by];
    if (got !== want) bad.push(`${mid}:reg${by}=${got} 期望${want}`);
  }
  check(`槽${slot}`, bad.length === 0, bad.join(' '));
}

console.log('\n═══ V5 同组 4 档两两不全等 ═══');
const GROUPS: Record<string, number[]> = { A: [2, 3, 4], B: [5, 6, 7, 8], C: [9, 10, 11, 12], D: [13, 14, 15, 16] };
for (const [g, slots] of Object.entries(GROUPS)) {
  let pairs = 0, unequal = 0;
  for (let i = 0; i < slots.length; i++) {
    for (let j = i + 1; j < slots.length; j++) {
      pairs++;
      const a = R(slots[i]), b = R(slots[j]);
      const keys = new Set([...Object.keys(a), ...Object.keys(b)].map(Number));
      const diff = [...keys].filter(k => a[k] !== b[k]);
      if (diff.length > 0) unequal++;
      else console.log(`      槽${slots[i]} 与 槽${slots[j]} 完全相同`);
    }
  }
  check(`${g} 组 ${pairs} 对均不同`, unequal === pairs, `${unequal}/${pairs}`);
}

console.log('\n═══ V6 清音档 OD/DIST 段全直通且 drive=0 ═══');
for (const slot of [2, 5, 9, 13]) {
  const regs = R(slot);
  const odPeq = [44, 45, 46, 47, 53, 54, 55, 56].every(a => regs[a] === PASSTHROUGH_PEQ);
  const distPeq = [59, 60, 61, 62, 68, 69, 70, 71].every(a => regs[a] === PASSTHROUGH_PEQ);
  check(`槽${slot} OD: PEQ 全直通`, odPeq, `reg44=${hex(regs[44])}`);
  check(`槽${slot} OD: drive=0`, (regs[49] ?? 0) === 0, `reg49=${regs[49]}`);
  check(`槽${slot} DIST: PEQ 全直通`, distPeq, `reg59=${hex(regs[59])}`);
  check(`槽${slot} DIST: drive=0`, (regs[64] ?? 0) === 0, `reg64=${regs[64]}`);
}

console.log('\n═══ V7 OD 关的档位 ═══');
for (const slot of [2, 5, 7, 9, 11, 13]) {
  const regs = R(slot);
  const peq = [44, 45, 46, 47, 53, 54, 55, 56].every(a => regs[a] === PASSTHROUGH_PEQ);
  check(`槽${slot} OD 关: reg49=0 且 PEQ 直通`, (regs[49] ?? 0) === 0 && peq, `reg49=${regs[49]} peq直通=${peq}`);
}

console.log('\n═══ V8 D3(15) != D4(16) ═══');
{
  const a = R(15), b = R(16);
  const keys = new Set([...Object.keys(a), ...Object.keys(b)].map(Number));
  const diff = [...keys].filter(k => a[k] !== b[k]);
  check('至少 2 个寄存器不同', diff.length >= 2, `不同 ${diff.length} 个: ${diff.slice(0, 8).join(',')}`);
  console.log(`      reg49: D3=${a[49]} D4=${b[49]};  reg79: D3=${a[79]} D4=${b[79]}`);
}

console.log('\n═══ V9 每组 reg79 单调不减 (清音→主音) ═══');
for (const [g, slots] of Object.entries(GROUPS)) {
  const v = slots.map(s => R(s)[79] ?? 0);
  const mono = v.every((x, i) => i === 0 || x >= v[i - 1]);
  check(`${g} 组 reg79: ${v.join(' → ')}`, mono);
}

console.log('\n═══ V10 getModuleOffRegs 白名单内 + 内部旁路位=1 ═══');
for (const mid of PASSTHROUGH_MODULES) {
  const pt = getModuleOffRegs(mid);
  const bad = Object.keys(pt).map(Number).filter(a => !isWritableAddr(a));
  check(`${mid} 全在白名单内`, bad.length === 0, bad.length ? `越界 ${bad.join(',')}` : `${Object.keys(pt).length} 个寄存器`);
  const by = INTERNAL_BYPASS_BY_MODULE[mid];
  check(`${mid} 内部旁路位=1`, by === undefined ? true : pt[by] === 1,
    by === undefined ? '(该模块无内部旁路位, 参数化直通)' : `reg${by}=${pt[by]}`);
}

console.log('\n═══ V11 保留位语义回归 (0/215/221) ═══');
{
  const chorusAllOff = [2, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16].every(s => R(s)[215] === 1);
  const gateAllOn = [2, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16].every(s => R(s)[0] === 0);
  check('chorus 全关 → 215=1', chorusAllOff);
  check('noise-gate 全开 → 0=0', gateAllOn);
  const d1Clean = R(13);
  check('槽13 贝斯清音: delay 关 → 221=1', d1Clean[221] === 1, `reg221=${d1Clean[221]}`);
  const a4Lead = R(4);
  check('槽4 主音: delay 开 → 221=0', a4Lead[221] === 0, `reg221=${a4Lead[221]}`);
  check('槽1 空音色: 0=1/215=1/221=1', R(1)[0] === 1 && R(1)[215] === 1 && R(1)[221] === 1);
}

console.log(`\n════════ 总结: ${pass} PASS / ${fail} FAIL ${fail === 0 ? '→ 验证通过' : '→ 需修正'}`);
process.exit(fail === 0 ? 0 : 1);
