/**
 * HM-2「切子型号」实际写入路径复现（只读诊断）
 * 复刻 src/pages/Index.tsx writeSubModelRegisters() 的 1b/1c/旁路/PRE 段逻辑，
 * 对比 PEDAL_DEFAULTS2.allRegs（文档重编码整图），定位调试面板值不一致的原因。
 */
import { OVERDRIVE_DEFAULTS } from '../src/data/presetData';
import { SUB_MODEL_FORMULAS, SUB_MODEL_PRE_EQ } from '../src/data/parameterMap';

const KEY = 'B&F NAM Boss HM-2/Boss HM-2';
const TYPES = ['Peak', 'LowShelf', 'HighShelf', 'AllPass', 'HPF', 'LPF', 'HPF-1st', 'LPF-1st'];
const FREQ = [19.7, 20.5, 21.3, 22.1, 23.0, 23.9, 24.8, 25.8, 26.8, 27.8, 28.9, 30.1, 31.3, 32.5, 33.8, 35.1, 36.5, 37.9, 39.4, 40.9, 42.5, 44.2, 45.9, 47.7, 49.6, 51.6, 53.6, 55.7, 57.9, 60.1, 62.5, 65.0, 67.5, 70.2, 72.9, 75.8, 78.7, 81.8, 85.0, 88.4, 91.9, 95.0, 99.0, 103, 107, 111, 114, 118, 123, 127, 132, 138, 143, 149, 154, 161, 167, 173, 180, 187, 195, 202, 210, 218, 227, 236, 245, 255, 265, 275, 286, 297, 309, 321, 334, 347, 360, 375, 389, 405, 420, 437, 454, 472, 490, 510, 530, 551, 572, 595, 618, 642, 667, 694, 721, 749, 779, 809, 841, 874, 908, 944, 981, 1020, 1060, 1100, 1140, 1190, 1240, 1280, 1330, 1390, 1440, 1500, 1560, 1620, 1680, 1750, 1820, 1890, 1960, 2040, 2120, 2200, 2290, 2380, 2470, 2570, 2670, 2770, 2880, 3000, 3110, 3240, 3360, 3500, 3630, 3780, 3920, 4080, 4240, 4400, 4580, 4760, 4940, 5140, 5340, 5550, 5770, 5990, 6230, 6470, 6730, 6990, 7270, 7550, 7850, 8160, 8480, 8810, 9150, 9510, 9890, 10300, 10700, 11100, 11500, 12000, 12500, 12900, 13500, 14000, 14500, 15100, 15700, 16300, 17000, 17600, 18300, 19000, 19800, 20600];
const Q = [0.40, 0.45, 0.50, 0.56, 0.63, 0.71, 0.79, 0.89, 1.00, 1.12, 1.26, 1.4, 1.6, 1.8, 2.0, 2.2, 2.5, 2.8, 3.2, 3.6, 4.0, 4.5, 5.0, 5.7, 6.3, 7.1, 8.0, 9.0, 10.1, 11.3, 12.7, 14, 16, 18, 20, 23, 25, 29, 32, 36, 40, 45, 51, 57, 64, 72, 81, 91, 102, 114, 128];
const S = [0.40, 0.45, 0.50, 0.56, 0.63, 0.71, 0.79, 0.89, 1.00, 1.12, 1.26, 1.4, 1.6, 1.8, 2.0];
const hex = (v: number) => '0x' + (v >>> 0).toString(16).toUpperCase().padStart(8, '0');
const dec = (v: number) => {
  const t = v & 7, fi = (v >> 3) & 0x1ff, g = (v >> 12) & 0xff, q = (v >> 20) & 0x7f;
  const db = -24 + g * 0.2;
  return `${TYPES[t]} ${FREQ[fi] ?? '?'}Hz ${db >= 0 ? '+' : ''}${db.toFixed(1)}dB Q${Q[q] ?? '?'}`;
};
const show = (v: number) => ([0, 1, 2, 3].includes(v & 7) ? dec(v) : String(v));

const def: any = (OVERDRIVE_DEFAULTS as any)[KEY];
const allRegs: Record<number, number> = def.allRegs;
const formulaMap: any = (SUB_MODEL_FORMULAS as any)[KEY];
const peq: any = (SUB_MODEL_PRE_EQ as any)[KEY];

// ── 复刻 writeSubModelRegisters('dist', KEY) 的写入集合（dist 开启） ──
const writes: Record<number, number> = {};
const knobDefault = (label: string) => def.knobs?.[label] ?? 0.5;
console.log('════ 1. 公式循环顺序（决定 regAddr 谁先占位） ════');
const seen = new Set<number>();
for (const [knobLabel, defs] of Object.entries(formulaMap)) {
  if (!Array.isArray(defs)) continue;
  const nd = knobDefault(knobLabel);
  for (const d of defs as any[]) {
    if (d.regAddr === -1) continue;
    const val = typeof d.compute === 'function' ? d.compute(nd) : 0;
    if (seen.has(d.regAddr)) {
      console.log(`  ${knobLabel.padEnd(11)} knob=${nd.toFixed(4)} → reg${d.regAddr} 跳过(已占位, 应为 ${val})`);
      continue;
    }
    seen.add(d.regAddr);
    writes[d.regAddr] = val;
    console.log(`  ${knobLabel.padEnd(11)} knob=${nd.toFixed(4)} → reg${d.regAddr} ${hex(val)} ${show(val)}  [先占位]`);
  }
}
console.log('\n════ 2. hidden / 主旁路 / PRE EQ 追加 ════');
for (const [a, v] of Object.entries(def.hidden)) {
  const ai = Number(a);
  if ([43, 48, 52, 58, 63, 67, 73, 78, 82].includes(ai)) { console.log(`  hidden ${ai} 跳过(免写)`); continue; }
  if (ai === 57 || (ai >= 42 && ai <= 56)) { console.log(`  hidden ${ai} 跳过(非 DIST)`); continue; }
  if (seen.has(ai)) { console.log(`  hidden ${ai} 跳过(已占位)`); continue; }
  seen.add(ai); writes[ai] = v as number;
  console.log(`  hidden ${ai} = ${v}`);
}
writes[57] = 0; console.log('  主旁路 57 = 0 (dist 开)');
peq.regs.forEach((a: number, i: number) => { writes[a] = peq.values[i]; });
console.log(`  PRE EQ 覆盖 ${peq.regs.join(',')}`);

console.log('\n════ 3. 切子型号实际写入 vs allRegs(文档重编码) ════');
console.log('reg | 切子型号写入           | allRegs/文档整图        | 判定');
for (let a = 57; a <= 71; a++) {
  const w = writes[a];
  const g = allRegs[a];
  if (w === undefined && g === undefined) continue;
  const ws = w === undefined ? '(未写)' : `${hex(w)} ${show(w)}`;
  const gs = g === undefined ? '(无)' : `${hex(g)} ${show(g)}`;
  let verdict = '';
  if (w !== undefined && g !== undefined) verdict = w === g ? 'OK' : '★ 不一致';
  else verdict = w === undefined ? '★ 未写入(保留旧值)' : '';
  console.log(`${String(a).padStart(3)} | ${ws.padEnd(38)} | ${gs.padEnd(38)} | ${verdict}`);
}

console.log('\n════ 4. 文档 hex 直读对照（整理版 HM-2 章节） ════');
const DOC: Record<number, string> = { 59: '0x51078269', 60: '0x51064410', 61: '0x5178C530', 62: '0x51078670', 68: '0x51091269', 69: '0x50E788F8', 70: '0x50A7D9C2', 71: '0x51391670', 64: '0x00000050(80)', 65: '0x00000041(65)', 66: '0x00000096(150)' };
for (const [a, h] of Object.entries(DOC)) {
  const w = writes[Number(a)];
  const ws = w === undefined ? '(未写)' : hex(w);
  console.log(`  reg${a.padStart(2)}: 切子型号=${ws.padEnd(12)} 文档=${h}`);
}
