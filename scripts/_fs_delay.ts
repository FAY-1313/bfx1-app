/**
 * 踩钉处理延迟统计 (2026-09-26)
 *
 * 复刻 `Index.tsx` 的踩钉三条路径，统计「按下 → 最后一个寄存器写完」的真实耗时。
 *
 *   A. 踩下（关闭）          → 写 `PASSTHROUGH_REGS[模块]`，每寄存器 REG_WRITE_MS=20ms
 *   B. 再踩（开启·有复位前缓存）→ 回写快照（地址数 = 直通集），每寄存器 20ms
 *   C. 再踩（开启·无复位前缓存）→ `writeSubModelRegisters(id, key, true)` 载入子型号默认参数
 *                                 数据段 → 50ms settle → 旁路位 → PRE EQ，每寄存器 20ms
 *   C 是 A6(2026-09-23) 之后的【常态】：预设里模块本来就是直通档，没有复位前缓存。
 *
 * 口径来源：REG_WRITE_MS=20（Index.tsx L157）、settle 50ms（L1685）、
 *           白名单 isWritableAddr（passThrough.ts L144）、内部旁路位 48/63/78（L161）。
 */
import { writeFileSync } from 'fs';
import { MODULES, SubModel } from '../src/data/pedalData';
import { PASSTHROUGH_REGS, isWritableAddr, INTERNAL_BYPASS_ADDRS } from '../src/data/passThrough';
import {
  OVERDRIVE_DEFAULTS, AMP_HEAD_HIDDEN, AMP_HEAD_HIDDEN_DEFAULT, AMP_HEAD_KNOB_DEFAULTS,
} from '../src/data/presetData';
import { SUB_MODEL_FORMULAS, SUB_MODEL_PRE_EQ } from '../src/data/parameterMap';

const REG_WRITE_MS = 20;
const SETTLE_MS = 50;
/** writeSubModelRegisters 里【不写】的隐藏旁路位 (L1659) */
const HIDDEN_SKIP = [43, 48, 52, 58, 63, 67, 73, 78, 82];

const L: string[] = [];
const P = (s = '') => L.push(s);

/** 路径 A / B：直通集地址数 */
function passCount(mid: string): number {
  const pass = PASSTHROUGH_REGS[mid];
  return pass ? Object.keys(pass).length : 0;
}

interface Count { data: number; byp: number; peq: number }

/** 路径 C：OD / DIST 走【整图权威】allRegs（L1613-1628） */
function wholeCount(mid: 'overdrive' | 'dist', key: string): Count | null {
  const allRegs = (OVERDRIVE_DEFAULTS[key] as unknown as { allRegs?: Record<string, number> } | undefined)?.allRegs;
  if (!allRegs) return null;
  const lo = mid === 'overdrive' ? 42 : 57;
  const hi = mid === 'overdrive' ? 56 : 71;
  const seen = new Set<number>();
  let data = 0, byp = 0;
  for (const a of Object.keys(allRegs)) {
    const addr = Number(a);
    if (!isWritableAddr(addr)) continue;
    if (addr < lo || addr > hi) continue;
    if (seen.has(addr)) continue;
    seen.add(addr);
    if (INTERNAL_BYPASS_ADDRS.has(addr)) byp++; else data++;
  }
  return { data, byp, peq: 0 };
}

/** 路径 C：公式模块（amp-head）走 formulas + hidden + PRE EQ（L1631-1672 / L1715） */
function formulaCount(key: string): Count | null {
  const fm = SUB_MODEL_FORMULAS[key] as unknown as Record<string, unknown> | undefined;
  if (!fm) return null;
  const seen = new Set<number>();
  let data = 0, byp = 0;
  for (const defs of Object.values(fm)) {
    if (!Array.isArray(defs)) continue;
    for (const d of defs as Array<{ regAddr: number }>) {
      if (d.regAddr === -1) continue;
      if (seen.has(d.regAddr)) continue;
      seen.add(d.regAddr);
      if (INTERNAL_BYPASS_ADDRS.has(d.regAddr)) byp++; else data++;
    }
  }
  const hidden = (AMP_HEAD_HIDDEN[key] ?? AMP_HEAD_HIDDEN_DEFAULT) as Record<string, number> | undefined;
  for (const a of Object.keys(hidden ?? {})) {
    const addr = Number(a);
    if (seen.has(addr)) continue;
    if (HIDDEN_SKIP.includes(addr)) continue;
    seen.add(addr);
    data++;
  }
  const peq = SUB_MODEL_PRE_EQ[key];
  return { data, byp, peq: peq ? peq.regs.length : 0 };
}

/** 按下 → 最后一个寄存器写完 的毫秒数 */
function msA_B(n: number): number { return n * REG_WRITE_MS; }
function msC(c: Count): number { return (c.data + c.byp + c.peq) * REG_WRITE_MS + SETTLE_MS; }

/** 展开某模块的全部组合键（型号/捕获） */
function keysOf(mid: string): { key: string; group: string }[] {
  const m = MODULES.find((x) => x.id === mid);
  if (!m?.subModels) return [];
  const out: { key: string; group: string }[] = [];
  for (const [mode, arr] of [['吉他', m.subModels.guitar ?? []], ['贝斯', m.subModels.bass ?? []]] as const) {
    for (const sm of arr as SubModel[]) {
      const caps = sm.captures?.length ? sm.captures : [{ pos: undefined as unknown as string }];
      for (const c of caps) {
        out.push({ key: c.pos ? `${sm.name}/${c.pos}` : sm.name, group: mode });
      }
    }
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════
P('═══ 踩钉处理延迟：按下 → 最后一个寄存器写完 ═══');
P();
P(`口径：REG_WRITE_MS = ${REG_WRITE_MS}ms（Index.tsx L157）· settle = ${SETTLE_MS}ms（L1685）`);
P('说明：不含 BLE 链路本身耗时（Android 无响应写约 1 个连接间隔，通常 <20ms，');
P('      因此实际体感 ≈ 下面数值，不会显著更长）。');
P();
P('三条路径（Index.tsx toggleModule L1385）：');
P('  A 踩下（关闭）            = 写直通集，N_pass × 20ms');
P('  B 再踩（开启·有复位前缓存）= 回写快照，N_pass × 20ms');
P('  C 再踩（开启·无缓存）      = 载入子型号默认参数，(数据+旁路+PRE EQ) × 20ms + 50ms');
P('     ← A6(2026-09-23) 之后的【常态】');
P();

for (const mid of ['overdrive', 'dist', 'amp-head', 'cabinet'] as const) {
  const np = passCount(mid);
  const m = MODULES.find((x) => x.id === mid);
  P(`━━━ ${m?.name ?? mid}（${mid}）━━━`);
  P(`  路径 A 踩下（关闭）        ：${np} 个寄存器 → ${msA_B(np)} ms`);
  P(`  路径 B 再踩（开启·有缓存） ：${np} 个寄存器 → ${msA_B(np)} ms`);

  if (mid === 'cabinet') {
    // writeCabPEQ：35 段 PEQ 逐个写（Index.tsx L1839）
    P(`  路径 C 再踩（开启·无缓存） ：35 个寄存器（35 段箱体 PEQ）→ ${35 * REG_WRITE_MS} ms`);
    P();
    continue;
  }

  const keys = keysOf(mid);
  const rows: { key: string; group: string; c: Count; ms: number }[] = [];
  for (const { key, group } of keys) {
    const c = mid === 'amp-head' ? formulaCount(key) : wholeCount(mid as 'overdrive' | 'dist', key);
    if (!c) continue;
    rows.push({ key, group, c, ms: msC(c) });
  }
  if (rows.length) {
    const msArr = rows.map((r) => r.ms);
    const lo = Math.min(...msArr), hi = Math.max(...msArr);
    P(`  路径 C 再踩（开启·无缓存） ：${lo === hi ? `${lo} ms（全部型号一致）` : `${lo} ~ ${hi} ms`}`);
    P();
    P('    逐型号明细：');
    P('      分组  寄存器(数据+旁路+PRE)   路径C    组合键');
    for (const r of rows) {
      P(`      ${r.group}  ${String(r.c.data).padStart(3)} + ${r.c.byp} + ${r.c.peq}  = ${String(r.c.data + r.c.byp + r.c.peq).padStart(3)}     ${String(r.ms).padStart(4)} ms   ${r.key}`);
    }
  } else {
    P('  路径 C 再踩（开启·无缓存） ：（无参数表 → 不会走 C）');
  }
  P();
}

P('━━━ 对比参考：其它模块 ━━━');
for (const mid of ['compressor', 'reverb']) {
  const np = passCount(mid);
  P(`  ${mid.padEnd(12)} 路径 A/B：${np} 个 → ${msA_B(np)} ms`);
}
const cab = passCount('cabinet');
P(`  cabinet      路径 A/B：${cab} 个 → ${msA_B(cab)} ms`);
P();
P('━━━ 关键结论 ━━━');
P(`  · 过载 / 失真【关闭】与【开启(有缓存)】都是 ${msA_B(passCount('overdrive'))} ms —— 9 个寄存器，最快。`);
P('  · 过载 / 失真【开启(无缓存)】= 路径 C，明显更长（见上表），因为它要把整个模块段重写一遍。');
P('  · 路径 C 的耗时随型号不同而变化：写出的寄存器数取决于该型号 allRegs 的白名单内地址数。');

writeFileSync('d:\\bfx1app\\tools\\_fs_delay.txt', L.join('\n'), 'utf8');
console.log('written d:\\bfx1app\\tools\\_fs_delay.txt  (' + L.length + ' lines)');
