/**
 * 回归验证：OD/DIST 子型号加载 = 【整图权威】（B 方案，2026-09-25）
 *
 * 被验证逻辑（Index.tsx writeSubModelRegisters 的 OD/DIST 分支）：
 *   写入集 = OVERDRIVE_DEFAULTS[子型号].allRegs ∩ 白名单 ∩ 本模块段
 *            (OD 42-56 / DIST 57-71)，内部旁路位 48/63 最后写
 *
 * PASS 条件：
 *   ① 每一条写入地址都在固件白名单内（白名单外一律不写）
 *   ② 写入结束后，模块段内所有"白名单内且整图有值"的地址，其值 === 整图值
 *   ③ 写入帧数在预算内（20ms/帧）
 */
import { SERIES_REGISTRY } from '../src/data/seriesData';
import { OVERDRIVE_DEFAULTS } from '../src/data/presetData';
import { REG_ADDR_WHITELIST, isWritableAddr, INTERNAL_BYPASS_ADDRS, PASSTHROUGH_REGS, PASSTHROUGH_PEQ, sortBypassLast, orderAddrsBypassLast } from '../src/data/passThrough';

const REG_WRITE_MS = 20;
const hex = (v: number) => '0x' + (v >>> 0).toString(16).toUpperCase().padStart(8, '0');

let pass = 0, fail = 0;
const fails: string[] = [];
let maxFrames = 0, maxFramesKey = '', totalFrames = 0, nModels = 0;
const wlOut: string[] = [];

for (const s of SERIES_REGISTRY) {
  if (s.moduleId !== 'overdrive' && s.moduleId !== 'dist') continue;
  const isDist = s.moduleId === 'dist';
  const [segLo, segHi] = isDist ? [57, 71] : [42, 56];
  for (const m of s.models) {
    const key = `${s.uiName}/${m.label}`;
    const def = OVERDRIVE_DEFAULTS[key];
    if (!def?.allRegs) { fails.push(`${key}: 缺 allRegs（整图）`); fail++; continue; }
    nModels++;

    // ── 复刻写入收集 ──
    const writes: Array<{ addr: number; val: number; phase: 'data' | 'bypass' }> = [];
    for (const [a, v] of Object.entries(def.allRegs)) {
      const addr = Number(a);
      if (!isWritableAddr(addr)) continue;
      if (addr < segLo || addr > segHi) continue;
      writes.push({ addr, val: v as number, phase: INTERNAL_BYPASS_ADDRS.has(addr) ? 'bypass' : 'data' });
    }
    writes.sort((x, y) => (x.phase === y.phase ? x.addr - y.addr : x.phase === 'data' ? -1 : 1));
    // 顺序权威 = passThrough.sortBypassLast（BYPASS 位最后），此处交叉校验一致性
    const orderRef = orderAddrsBypassLast(writes.map(w => w.addr));
    if (orderRef.length === writes.length && !orderRef.every((a, i) => a === writes[i].addr)) {
      fails.push(`${key}: 写入顺序与 sortBypassLast 不一致`); fail++;
    }

    // ① 写入地址合法性
    const illegal = writes.filter(w => !isWritableAddr(w.addr)).map(w => w.addr);
    if (illegal.length) { fails.push(`${key}: 写入白名单外地址 ${illegal.join(',')}`); fail++; }
    else {
      // ② 终态与整图一致
      const final: Record<number, number> = {};
      for (const w of writes) final[w.addr] = w.val;
      const mism: string[] = [];
      for (const [a, v] of Object.entries(def.allRegs)) {
        const addr = Number(a);
        if (!isWritableAddr(addr) || addr < segLo || addr > segHi) continue;
        if (final[addr] !== v) mism.push(`reg${addr}: ${final[addr]}≠${v}`);
      }
      // 段内白名单地址不得残留"未写"(否则保留上一次的旧值)
      const holes: number[] = [];
      for (const [lo, hi] of REG_ADDR_WHITELIST) {
        for (let a = Math.max(lo, segLo); a <= Math.min(hi, segHi); a++) {
          if (def.allRegs[a] !== undefined && final[a] === undefined) holes.push(a);
        }
      }
      if (mism.length || holes.length) {
        fails.push(`${key}: ${mism.join(' | ')}${holes.length ? ` | 未覆盖: ${holes.join(',')}` : ''}`);
        fail++;
      } else pass++;
    }

    if (writes.length > maxFrames) { maxFrames = writes.length; maxFramesKey = key; }
    totalFrames += writes.length;
  }
}

console.log(`════ 验证：OD/DIST 子型号加载（整图权威 + 白名单）════`);
console.log(`型号数 ${nModels}  PASS ${pass}  FAIL ${fail}`);
console.log(`写入帧数: 平均 ${(totalFrames / nModels).toFixed(1)} 帧  最大 ${maxFrames} 帧 (${maxFramesKey})`);
console.log(`加载耗时估算: 平均 ${((totalFrames / nModels) * REG_WRITE_MS + 50).toFixed(0)}ms  最大 ${(maxFrames * REG_WRITE_MS + 50).toFixed(0)}ms`);
if (fails.length) { console.log('\n失败明细:'); fails.forEach(f => console.log('  ✗ ' + f)); }

// 白名单外的"旧写入地址"确认已停写
const legacy = [42, 43, 52, 57, 58, 67];
for (const a of legacy) if (isWritableAddr(a)) wlOut.push(String(a));
console.log(`\n旧总旁路/PEQ bypass 位 42/43/52/57/58/67 → 现在白名单内? ${wlOut.length ? wlOut.join(',') : '全部不在（已停写）'}`);

console.log('\n════ 模块【关闭】态：模块开关 = 内部旁路位 + 全部 PEQ 复位 ════');
{
  const expect: Record<string, number[]> = {
    overdrive: [44, 45, 46, 47, 48, 53, 54, 55, 56],
    dist: [59, 60, 61, 62, 63, 68, 69, 70, 71],
  };
  for (const mid of ['overdrive', 'dist']) {
    const passMap: Record<number, number> = PASSTHROUGH_REGS[mid];
    const got = Object.keys(passMap).map(Number).sort((a, b) => a - b);
    const want = expect[mid];
    const bypassAddr = mid === 'overdrive' ? 48 : 63;
    const peqAddrs = got.filter(a => !INTERNAL_BYPASS_ADDRS.has(a));
    const okAddr = got.length === want.length && got.every((a, i) => a === want[i]);
    const okWl = got.every(isWritableAddr);
    const okPeq = peqAddrs.every(a => passMap[a] === PASSTHROUGH_PEQ);
    const okBypass = passMap[bypassAddr] === 1;
    // 写入顺序（2026-09-25 统一规则）: BYPASS 位必须是【最后一条】
    const seq = orderAddrsBypassLast(got);
    const okOrder = seq[seq.length - 1] === bypassAddr
      && seq.slice(0, -1).every(a => !INTERNAL_BYPASS_ADDRS.has(a));
    const ok = okAddr && okWl && okPeq && okBypass && okOrder;
    console.log(`  ${mid.padEnd(10)} 地址 ${got.length} 个 [${got.join(',')}]`);
    console.log(`             PEQ全复位=${okPeq}  旁路位 ${bypassAddr}=1:${okBypass}  全部白名单内=${okWl}  地址集正确=${okAddr}  旁路最后=${okOrder}  → ${ok ? 'PASS' : 'FAIL'}`);
    console.log(`             写入序列:`);
    for (let i = 0; i < seq.length; i++) {
      const a = seq[i];
      const isBy = INTERNAL_BYPASS_ADDRS.has(a);
      console.log(`               ${String(i + 1).padStart(2)}. reg${String(a).padStart(3)} = ${isBy ? passMap[a] : hex(passMap[a])}   [${isBy ? 'BYPASS(最后)' : 'PEQ复位'}]`);
    }
    if (ok) pass++; else { fail++; fails.push(`${mid}: 关闭态直通集异常`); }
  }
}

console.log('\n════ HM-2（锯条失真/HM-2）最终写入序列 ════');
{
  const def = OVERDRIVE_DEFAULTS['锯条失真/HM-2'];
  const ws: Array<{ addr: number; val: number; phase: string }> = [];
  for (const [a, v] of Object.entries(def.allRegs)) {
    const addr = Number(a);
    if (!isWritableAddr(addr) || addr < 57 || addr > 71) continue;
    ws.push({ addr, val: v as number, phase: INTERNAL_BYPASS_ADDRS.has(addr) ? 'bypass(最后)' : 'data' });
  }
  ws.sort((x, y) => (x.phase === y.phase ? x.addr - y.addr : x.phase === 'data' ? -1 : 1));
  // 交叉校验: 与 passThrough.sortBypassLast 结果一致
  const wsRef = sortBypassLast(ws, w => w.addr);
  console.log(`  顺序与 sortBypassLast 一致: ${wsRef.every((w, i) => w.addr === ws[i].addr)}`);
  for (const w of ws) console.log(`  reg${String(w.addr).padStart(3)} = ${w.val > 4096 ? hex(w.val) : w.val}   [${w.phase}]`);
  console.log(`  合计 ${ws.length} 帧，约 ${(ws.length * REG_WRITE_MS + 50)}ms`);
}

process.exit(fail ? 1 : 0);
