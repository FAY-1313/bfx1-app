/**
 * BFX1 过载高低通框架补齐 · v64 数值生成器（一次性工具）
 *
 * 直接用工程真实的 peqCodec.ts 生成所有 32 位 PEQ 字，禁止手抄整数。
 * 运行前先做全量往返校验：把 odDef.ts + presetData.ts 里现有的每个 PEQ 字
 * 解回字段再重新编码，必须 100% 一致，否则中止。
 *
 * 用法：esbuild 打包后 node 运行（见 build_od_v64.ps1）
 */
import {
  buildPEQData, parsePEQData, freqToIndex, dbToPeqGain,
  PEQ_FREQ_TABLE, PEQ_TYPE, PEQ_GAIN_DEFAULT,
} from '../src/data/peqCodec';
import { OD_MODELS } from '../src/data/_def/odDef';

const T = PEQ_TYPE;
/** 输入高通 / 低通统一用 Q 表索引 10、S 表索引 0（与 NAM 捕获的 HPF/LPF 段一致） */
const Q_FILTER = 10;
const S_FILTER = 0;
/** 高/低架统一用 Q 16、S 10（与 NAM 捕获的 HSHELF 段一致） */
const Q_SHELF = 16;
const S_SHELF = 10;

function hpf(hz: number, first = true): number {
  return buildPEQData(first ? T.HPF_1ST : T.HPF, freqToIndex(hz), PEQ_GAIN_DEFAULT, Q_FILTER, S_FILTER);
}
function lpf(hz: number, first = true): number {
  return buildPEQData(first ? T.LPF_1ST : T.LPF, freqToIndex(hz), PEQ_GAIN_DEFAULT, Q_FILTER, S_FILTER);
}
function hshelf(hz: number, db: number): number {
  return buildPEQData(T.HIGH_SHELF, freqToIndex(hz), dbToPeqGain(db), Q_SHELF, S_SHELF);
}
function off(): number {
  return buildPEQData(T.LOW_SHELF, 0, PEQ_GAIN_DEFAULT, 16, 10);
}

/** 期望解码结果（人读） */
function show(word: number): string {
  const p = parsePEQData(word);
  const names: Record<number, string> = {
    0: 'PEAK', 1: 'LOW_SHELF', 2: 'HIGH_SHELF', 3: 'ALL_PASS',
    4: 'HPF', 5: 'LPF', 6: 'HPF_1ST', 7: 'LPF_1ST',
  };
  const db = -24 + p.gain * 0.2;
  return `${names[p.type] ?? p.type} @${PEQ_FREQ_TABLE[p.freq]}Hz ${db >= 0 ? '+' : ''}${db.toFixed(1)}dB`;
}

/* ════════════════ ① 全量往返校验 ════════════════ */
let checked = 0;
let bad = 0;
for (const m of OD_MODELS) {
  for (const a of [44, 45, 46, 47, 53, 54, 55, 56] as const) {
    const w = m.regs[a];
    if (w === undefined) continue;
    const p = parsePEQData(w);
    const rt = buildPEQData(p.type, p.freq, p.gain, p.q, p.s);
    checked++;
    if (rt !== w) { bad++; console.error(`ROUNDTRIP FAIL ${m.id} reg${a}: ${w} -> ${rt}`); }
  }
}
console.log(`roundtrip: ${checked} words checked, ${bad} failed`);
if (bad > 0) { console.error('ABORT'); process.exit(1); }

/* ════════════════ ② 目标值定义 ════════════════ */
interface Patch {
  /** reg -> 新字；同时打印改前改后 */
  words: Record<number, number>;
  note?: string;
}
const P: Record<string, Patch> = {
  timmy_g: {
    words: { 44: hpf(80.3), 47: lpf(8000), 56: hshelf(16300, -6), 51: 280 },
    note: '44 19.7->80.3 输入高通; 47 补削波前 LPF 8k; 56 补输出收顶 -6dB; Level 0->-2dB',
  },
  ts808_g: {
    words: { 46: hpf(49.6), 47: lpf(5040), 55: hshelf(16300, -8), 51: 280 },
    note: '44 保持 721(TS输入耦合); 46 补 49.6 次声高通; 47 补削波前 LPF 5040; 55 补收顶 -8dB; Level 0->-2dB',
  },
  ocd_g: {
    words: { 44: hpf(120), 47: lpf(5990), 51: 280 },
    note: '44 19.7->120 输入高通; 47 补削波前 LPF 5990; 55 已 LPF1 3360 不动; Level -1->-2dB',
  },
  sd1: {
    words: { 47: lpf(5040), 54: hpf(49.6), 55: hshelf(16300, -8), 51: 280 },
    note: '44 保持 721; 47 LPF1 17000->5040; 54 补 49.6 次声高通; 55 补收顶 -8dB; Level 0->-2dB',
  },
  klon: {
    words: { 44: hpf(40.1), 47: lpf(5990), 55: hshelf(16300, -8), 50: 32, 51: 280 },
    note: '44 19.7->40.1 输入高通; 47 补削波前 LPF 5990; 55 补收顶 -8dB; DC 0->-0.18b; Level -1->-2dB',
  },
  rat: {
    words: { 47: lpf(4490), 56: hshelf(16300, -12), 51: 280 },
    note: '44 保持 94; 47 补削波前 LPF 4490; 56 补收顶 -12dB; Level -1->-2dB',
  },
  b3k: {
    words: { 44: hpf(30.1), 47: lpf(5040), 55: hshelf(16300, -12), 50: 53, 51: 280 },
    note: '44 19.7->30.1 输入高通; 47 补削波前 LPF 5040; 55 补收顶 -12dB; DC 0->+0.03b; Level 0->-2dB',
  },
  bd1: {
    words: { 44: hpf(40.1), 47: lpf(5040), 56: hshelf(16300, -8), 51: 280 },
    note: '44 19.7->40.1 输入高通; 47 补削波前 LPF 5040; 56 20600/-2.4->16300/-8; Level 0->-2dB',
  },
};

/* ════════════════ ③ 输出 ════════════════ */
console.log('\n===== PATCH PLAN =====');
for (const m of OD_MODELS) {
  const p = P[m.id];
  if (!p) { console.error(`NO PATCH for ${m.id}`); process.exit(1); }
  console.log(`\n### ${m.id}  (${m.name})`);
  console.log(`    note: ${p.note}`);
  const parts: string[] = [];
  for (const [as, w] of Object.entries(p.words)) {
    const a = Number(as);
    const before = m.regs[a];
    const isPeq = [44, 45, 46, 47, 53, 54, 55, 56].includes(a);
    console.log(`    reg ${a}: ${before} -> ${w}   [${isPeq ? show(before ?? 0) + '  =>  ' + show(w) : 'plain reg'}]`);
    parts.push(`${a}: ${w}`);
  }
  console.log(`    regs: {${parts.join(', ')}}`);
}
console.log('\nDONE');
