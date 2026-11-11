/**
 * 统计：箱头音色旋钮在 APK 权威换算 (registerMap.dbToPeqGain / 0~180 钳位) 下的
 *       量程完整性与「+12dB 顶死」情况。
 * 基准：旋钮公式由生成器写为 dbToPeqGain(设计值 + (n-0.5)*24)，min/max = 设计值 ±12 (未钳)
 *       ⇒ 设计值 = (min + max) / 2
 */
import { dbToPeqGain, peqGainToDb } from '../src/data/registerMap';
import { AMP_FORMULAS2, AMP_DEFAULTS2, AMP_POST16_2, AMP_PRE_EQ2 } from '../src/data/_gen/amp_params2';

const keys = Object.keys(AMP_FORMULAS2);
const seen = new Set<string>();
const byLabel: Record<string, { total: number; clamped: number }> = {};
const buckets: Record<string, number> = { '≤0 (不钳)': 0, '(0,3]': 0, '(3,6]': 0, '(6,9]': 0, '(9,12]': 0, '>12 (noon 已顶死)': 0 };
const detail: string[] = [];
let clampUp = 0, clampDown = 0, knobTotal = 0, mismatch = 0;

for (const key of keys) {
  for (const [label, list] of Object.entries(AMP_FORMULAS2[key] as Record<string, any[]>)) {
    for (const f of list) {
      if (f.regAddr < 83 || f.regAddr > 98) continue;      // 仅音色 PEQ 旋钮
      const id = `${key}|${label}|${f.regAddr}`;
      if (seen.has(id)) continue;
      seen.add(id);
      knobTotal++;
      const design = (f.min + f.max) / 2;
      byLabel[label] = byLabel[label] || { total: 0, clamped: 0 };
      byLabel[label].total++;

      const g0 = (f.compute(0) as number) >>> 12 & 0xff;
      const g1 = (f.compute(1) as number) >>> 12 & 0xff;
      if (g0 !== dbToPeqGain(design - 12) || g1 !== dbToPeqGain(design + 12)) {
        mismatch++;
        detail.push(`MISMATCH ${key}.${label} reg${f.regAddr} g0=${g0}/${dbToPeqGain(design - 12)} g1=${g1}/${dbToPeqGain(design + 12)}`);
      }
      if (design > 1e-9) {
        clampUp++; byLabel[label].clamped++;
        const frac = design / 24;                          // 上端被钳的行程比例
        detail.push(`CLAMP_UP ${key}.${label} 设计 ${design.toFixed(1)}dB → 顶端 ${peqGainToDb(dbToPeqGain(design + 12)).toFixed(1)}dB, 行程 ${(frac * 100).toFixed(1)}% 顶死`);
      } else if (design < -12 - 1e-9) clampDown++;
      const d = design;
      buckets[d <= 0 ? '≤0 (不钳)' : d <= 3 ? '(0,3]' : d <= 6 ? '(3,6]' : d <= 9 ? '(6,9]' : d <= 12 ? '(9,12]' : '>12 (noon 已顶死)']++;
    }
  }
}

console.log('═══ 箱头参数移植 · 量程统计 ═══');
console.log(`键数 ${keys.length}  音色旋钮实例 ${knobTotal}(去重)`);
console.log(`完整覆盖检查: Pre4 ${Object.keys(AMP_PRE_EQ2).length} 键 / Post16 ${Object.keys(AMP_POST16_2).length} 键 / 默认值 ${Object.keys(AMP_DEFAULTS2).length} 键`);
console.log(`旋钮公式与 dbToPeqGain 不符: ${mismatch}`);
console.log(`上端会顶在 +12dB 的旋钮: ${clampUp} / ${knobTotal}  = ${(clampUp / knobTotal * 100).toFixed(1)}%`);
console.log(`下端会顶在 -24dB 的旋钮: ${clampDown}`);
console.log('设计值分布:', JSON.stringify(buckets, null, 0));
console.log('按旋钮名分布:');
for (const [k, v] of Object.entries(byLabel)) {
  console.log(`  ${k.padEnd(10)} 共 ${v.total}  顶死 ${v.clamped}`);
}
const worst = detail.filter(s => s.startsWith('CLAMP_UP'))
  .map(s => [s, parseFloat(s.match(/设计 (-?[\d.]+)dB/)![1])] as [string, number])
  .sort((a, b) => b[1] - a[1]).slice(0, 8);
console.log('— 顶死最多的 8 个 —');
worst.forEach(([s]) => console.log('  ' + s));
