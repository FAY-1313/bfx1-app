/**
 * 核对：箱头参数表 (amp_params2.ts) 是否与 APK 自家「转换工具」一致
 *
 * 基准（APK 内，权威）:
 *   · buildPEQData(type, freqIdx, gainIdx, qIdx, sIdx)    —— parameterMap.ts
 *   · freqToIndex(hz)  最近邻
 *   · dbToPeqGain(db) = clamp(round((db+24)/0.2), 0, 180) —— registerMap.ts  ⚠️ 上限 180
 *   · peqGainToDb(idx) = -24 + idx*0.2
 *
 * 输入：tools/_amp_declared.json（文档声明值，由 tools/gen_amp_design.py 导出）
 * 比对：重算值 === amp_params2.ts 里的写出值
 *       并把每个写出值「解码回 dB」与文档声明 dB 相核
 */
import { buildPEQData, freqToIndex, PEQ_Q_TABLE, PEQ_S_TABLE } from '../src/data/parameterMap';
import { dbToPeqGain, peqGainToDb } from '../src/data/registerMap';
import { AMP_PRE_EQ2, AMP_POST16_2, AMP_FORMULAS2 } from '../src/data/_gen/amp_params2';
const DECL = require('../../tools/_amp_declared.json');

const TYPE: Record<string, number> = {
  Peak: 0, LowShelf: 1, HighShelf: 2, AllPass: 3, HPF: 4, LPF: 5, HPF_1st: 6, LPF_1st: 7,
};
const nearest = (tab: number[], x: number) =>
  tab.reduce((b, v, i) => (Math.abs(v - x) < Math.abs(tab[b] - x) ? i : b), 0);

/** Q 索引策略（与生成器一致）：shelf/filter 固定，其余按声明 Q 最近邻 */
function qIndex(t: string, q: number | null): number {
  if (t === 'LowShelf' || t === 'HighShelf') return nearest(PEQ_Q_TABLE, 1.0);
  if (t === 'HPF' || t === 'LPF' || t === 'HPF_1st' || t === 'LPF_1st') return nearest(PEQ_Q_TABLE, 0.71);
  return nearest(PEQ_Q_TABLE, q ?? 1.0);
}

let pass = 0, fail = 0, clampHi = 0, clampLo = 0, dq = 0;
const bad: string[] = [];
const clamped: string[] = [];
const freqErr: string[] = [];

for (const key of Object.keys(DECL)) {
  const d = DECL[key];
  const pre = AMP_PRE_EQ2[key];
  const post16 = AMP_POST16_2[key];
  if (!pre || !post16) { bad.push(`[缺表] ${key}`); fail++; continue; }

  for (const sect of ['pre', 'post'] as const) {
    const regs = sect === 'pre' ? [74, 75, 76, 77] : Array.from({ length: 16 }, (_, i) => 83 + i);
    for (const r of regs) {
      const row = d[sect][String(r)];
      const gen = sect === 'pre' ? pre.values[regs.indexOf(r)] : (post16 as any)[r];
      if (!row) {  // 生成器缺段 → 应写直通/中性
        continue;
      }
      const t = TYPE[row.t];
      const fi = freqToIndex(row.hz);
      const giRaw = Math.round((row.db + 24) / 0.2);
      const gIdx = dbToPeqGain(row.db);          // ← APK 权威（含 0~180 钳位）
      const q = qIndex(row.t, row.q);
      const s = nearest(PEQ_S_TABLE, row.s ?? 0.71);
      const want = buildPEQData(t, fi, gIdx, q, s);

      if (giRaw !== gIdx) {
        (giRaw > 180 ? clamped : clamped).push(
          `${key} reg${r} 声明 ${row.db}dB → 原始 ${giRaw} 被钳到 ${gIdx} (${peqGainToDb(gIdx).toFixed(1)}dB)`);
        if (giRaw > 180) clampHi++; else clampLo++;
      }
      // 声明频点 vs 表内最近频点（量化误差）
      const q_hz = [91, 94, 97, 100];
      if (Math.abs(gen >>> 3 & 0x1ff) !== fi) {
        freqErr.push(`${key} reg${r} freqIdx gen=${gen >>> 3 & 0x1ff} want=${fi}`);
      }
      if (gen !== want) {
        fail++;
        bad.push(`${key} reg${r} gen=0x${gen.toString(16).toUpperCase()} want=0x${want.toString(16).toUpperCase()}` +
                 ` (${row.t} ${row.hz}Hz ${row.db}dB gIdx ${(gen >>> 12) & 0xff}->${gIdx})`);
      } else pass++;
      // 反向解码核对 dB
      const backDb = peqGainToDb((gen >>> 12) & 0xff);
      if (Math.abs(backDb - Math.min(12, row.db)) > 0.15) {
        dq++;
        bad.push(`${key} reg${r} 解码 dB 偏差: 声明 ${row.db} → 解码 ${backDb.toFixed(1)}`);
      }
    }
  }
}

console.log('═══ 箱头 PEQ 编码核对（基准 = APK buildPEQData + dbToPeqGain）═══');
console.log(`  一致 ${pass} / 不一致 ${fail}`);
console.log(`  增益超量程被钳(声明 >+12dB): ${clampHi} 处`);
console.log(`  频点索引不符: ${freqErr.length} 处`);
console.log(`  解码 dB 偏差 >0.15: ${dq} 处`);
if (clamped.length) {
  console.log('— 钳位明细（前 12）—');
  clamped.slice(0, 12).forEach(s => console.log('   ' + s));
}
if (freqErr.length) {
  console.log('— 频点不符（前 8）—');
  freqErr.slice(0, 8).forEach(s => console.log('   ' + s));
}
if (bad.length) {
  console.log('— 不一致明细（前 20）—');
  bad.slice(0, 20).forEach(s => console.log('   ' + s));
}
console.log(fail === 0 && freqErr.length === 0 && dq === 0
  ? '\nALL PASS — 产物与 APK 工具一致'
  : `\nNOT MATCH — 需修正 (fail=${fail}, freq=${freqErr.length}, db=${dq})`);

// 旋钮公式段：核对 min/max 是否落在 APK 量程内
let knobBad = 0;
for (const key of Object.keys(AMP_FORMULAS2)) {
  for (const [label, arr] of Object.entries(AMP_FORMULAS2[key])) {
    for (const f of arr as any[]) {
      if (f.regAddr >= 83 && f.regAddr <= 98) {
        const lo = f.compute(0), hi = f.compute(1), mid = f.compute(0.5);
        for (const [n, v] of [['n=0', lo], ['n=0.5', mid], ['n=1', hi]] as [string, number][]) {
          const g = (v >>> 12) & 0xff;
          if (g < 0 || g > 180) { knobBad++; bad.push(`旋钮越界 ${key}.${label} ${n} g=${g}`); }
        }
      }
    }
  }
}
console.log(`旋钮公式量程越界: ${knobBad} 处`);
