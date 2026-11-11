// 系列 PRE EQ 烘焙脚本 (task #127): 把每系列 4 段 PRE EQ 编码成 uint32, 写入 src/data/seriesPreEq.ts
// 设计: 原味 = base 硬件电路 PRE EQ (已有); 明亮/肥厚 = 在 base 上做性格 delta.
//   band4 (高切): 明亮 → LPF 频率上移 / HIGH_SHELF +1.5dB (更开); 肥厚 → LPF 频率下移 / SHELF -1.0dB (更暗)
//   band2 (性格点): 明亮 → -0.5dB; 肥厚 → +1.0dB (低中频体量)
//   band1 (低切):  肥厚 → HPF 频率下移保留更多低频 / LOW_SHELF +2.0dB; 明亮 → 保持
// 运行: npx esbuild tools/_series_gen.ts --bundle --platform=node --format=esm --outfile=tools/.out.mjs && node tools/.out.mjs
import * as fs from 'fs';
import {
  buildPEQData, freqToIndex, parsePEQData, PEQ_TYPE,
  PEQ_FREQ_TABLE, PEQ_Q_TABLE, PEQ_S_TABLE, SUB_MODEL_PRE_EQ,
} from '../src/data/parameterMap';
import { SERIES_REGISTRY, seriesComposedKey } from '../src/data/seriesData';

type Band = [number, number, number, number, number]; // [type, freqHz, gainDb, Q, S]

const qIdx = (q: number): number => {
  let b = 0, bd = Infinity;
  for (let i = 0; i < PEQ_Q_TABLE.length; i++) { const d = Math.abs(PEQ_Q_TABLE[i] - q); if (d < bd) { bd = d; b = i; } }
  return b;
};
const sIdx = (s: number): number => {
  let b = 0, bd = Infinity;
  for (let i = 0; i < PEQ_S_TABLE.length; i++) { const d = Math.abs(PEQ_S_TABLE[i] - s); if (d < bd) { bd = d; b = i; } }
  return b;
};
const enc = (band: Band): number => buildPEQData(band[0], freqToIndex(band[1]), 120 + Math.round(band[2] * 5), qIdx(band[3]), sIdx(band[4]));
const gainDbOf = (v: number): number => ((((v >> 12) & 0xff) - 120) * 0.2);

/** 解析既有 uint32 段 → 人类可读设计 [type, freqHz, gainDb, Q, S] */
function decodeBand(v: number): Band {
  const p = parsePEQData(v);
  return [p.type, PEQ_FREQ_TABLE[p.freq] ?? p.freq, gainDbOf(v), PEQ_Q_TABLE[p.q] ?? p.q, PEQ_S_TABLE[p.s] ?? p.s];
}

const T: Record<number, string> = { 0: 'PEAK', 1: 'LSH', 2: 'HSH', 3: 'AP', 4: 'HPF', 5: 'LPF', 6: 'HPF1', 7: 'LPF1' };
const show = (bands: Band[]): string => bands.map((b) => `${T[b[0]]}@${b[1]}Hz ${b[2] >= 0 ? '+' : ''}${b[2]}dB Q${b[3]}`).join(' | ');

/** base 4 段 → 性格子选项 delta (只改段 1/2/4, 段 3 保留) */
function flavorValues(base: number[], flavor: 'bright' | 'thick'): number[] {
  const bands = base.map(decodeBand);
  return bands.map((b, i) => {
    if (i === 3) { // band4 高切: 明亮更开 / 肥厚更暗 (用户要求差异加大)
      if (flavor === 'bright') {
        if (b[0] === PEQ_TYPE.LPF) return [PEQ_TYPE.LPF, b[1] * 1.4, 0, 0.71, 0.4];
        if (b[0] === PEQ_TYPE.HIGH_SHELF) return [PEQ_TYPE.HIGH_SHELF, b[1], b[2] + 2.5, 1.0, 0.71];
        return [b[0], b[1], b[2] + 2.5, b[3], b[4]]; // PEAK
      }
      if (flavor === 'thick') {
        if (b[0] === PEQ_TYPE.LPF) return [PEQ_TYPE.LPF, b[1] * 0.72, 0, 0.71, 0.4];
        if (b[0] === PEQ_TYPE.HIGH_SHELF) return [PEQ_TYPE.HIGH_SHELF, b[1], b[2] - 1.5, 1.0, 0.71];
        return [b[0], b[1], b[2] - 1.5, b[3], b[4]];
      }
    }
    if (i === 1) { // band2 性格点: 明亮收中频 / 肥厚增体量 (用户要求差异加大)
      return [b[0], b[1], b[2] + (flavor === 'bright' ? -1.5 : 2.0), b[3], b[4]];
    }
    if (i === 0) { // band1 低切: 肥厚保留更多低频 (用户要求差异加大)
      if (flavor === 'thick') {
        if (b[0] === PEQ_TYPE.HPF) return [PEQ_TYPE.HPF, b[1] * 0.6, 0, 0.71, 0.4];
        if (b[0] === PEQ_TYPE.LOW_SHELF) return [PEQ_TYPE.LOW_SHELF, b[1], b[2] + 3.0, 1.0, 0.71];
      }
      return b;
    }
    return b;
  }).map(enc as any) as number[];
}

// ── 预览: 中频过载 (TS808 base) 三性格 ──
const sample = SERIES_REGISTRY.find((s) => s.uiName === '中频过载')!;
const baseVals = SUB_MODEL_PRE_EQ[sample.baseKey]!.values;
console.log(`[${sample.uiName}] base = ${sample.baseKey}`);
console.log(`  原味: ${show(baseVals.map(decodeBand))}`);
for (const so of sample.subOptions) {
  if (so.id === 'origin') continue;
  const v = flavorValues(baseVals, so.id as 'bright' | 'thick');
  console.log(`  ${so.label}: ${show(v.map(decodeBand))}`);
}

// ── 全 15 系性格 delta 校验 (确保 transform 不产生异常段) ──
let miss = 0;
for (const s of SERIES_REGISTRY) {
  const pre = SUB_MODEL_PRE_EQ[s.baseKey];
  if (!pre) { console.log(`!! 无 PRE EQ: ${s.baseKey}`); miss++; continue; }
  for (const so of s.subOptions) {
    if (so.id === 'origin') continue;
    const v = flavorValues(pre.values, so.id as 'bright' | 'thick');
    if (v.length !== 4 || v.some((x) => !(x >= 0 && x <= 0xFFFFFFFF))) {
      console.log(`!! 异常段: ${s.uiName}/${so.label}`); miss++;
    }
  }
}
console.log(miss ? `${miss} 校验失败` : '15 系性格 delta 校验通过');
// ── 烘焙: 15 系 × 明亮/肥厚 → src/data/seriesPreEq.ts (原味 = base, 不烘焙) ──
const baked: Record<string, number[]> = {};
for (const s of SERIES_REGISTRY) {
  const pre = SUB_MODEL_PRE_EQ[s.baseKey];
  if (!pre) continue;
  for (const so of s.subOptions) {
    if (so.id === 'origin') continue;
    baked[seriesComposedKey(s, so)] = flavorValues(pre.values, so.id as 'bright' | 'thick');
  }
}
const lines = Object.entries(baked)
  .sort(([a], [b]) => a.localeCompare(b, 'zh'))
  .map(([k, v]) => `  ${JSON.stringify(k)}: [${v.map((x) => '0x' + x.toString(16).toUpperCase().padStart(8, '0')).join(', ')}],`);
const out = `/**
 * 系列 PRE EQ 烘焙结果 (task #127, 生成: tools/_series_gen.ts).
 * 键 = 系列组合键 "uiName/label"; 值 = 4 段 PRE EQ uint32 (regs 44-47 / 59-62).
 * 原味子选项不烘焙 → 回落 base 电路 PRE EQ; 明亮/肥厚在 base 上做性格 delta.
 */
export const SERIES_PRE_EQ: Record<string, number[]> = {
${lines.join('\n')}
};
`;
fs.writeFileSync('src/data/seriesPreEq.ts', out, 'utf8');
console.log(`\n已烘焙 ${Object.keys(baked).length} 组 → src/data/seriesPreEq.ts`);

// ── 抽查多样 base: 透明(HSH band4) / 现代金属(LSH band1) / 锯条(LSH band1) / 法兹(LSH band1)
for (const ui of ['透明过载', '现代金属', '锯条失真', '法兹', '贝斯复古']) {
  const s = SERIES_REGISTRY.find((x) => x.uiName === ui)!;
  const bv = SUB_MODEL_PRE_EQ[s.baseKey]!.values;
  const b = bv.map(decodeBand);
  const bl = flavorValues(bv, 'bright').map(decodeBand);
  const tk = flavorValues(bv, 'thick').map(decodeBand);
  console.log(`\n[${ui}] base ${s.baseKey}`);
  console.log(`  原味: ${show(b)}`);
  console.log(`  明亮: ${show(bl)}`);
  console.log(`  肥厚: ${show(tk)}`);
}
