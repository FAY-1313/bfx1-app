/**
 * 一次性导出脚本: 生成 预设文件音色1-16.txt (参考 D:/预设文件音色1-8.txt 的 FORMAT 3 格式).
 *
 * 运行: npx esbuild tools/exportPresets.ts --bundle --platform=node --format=esm --outfile=tools/.export.mjs && node tools/.export.mjs
 *
 * 规则:
 *  - 每行 data_chunk_t = { 寄存器地址 LE32, 值 LE32 } 共 8 字节 (地址也写进花括号), 行尾 // REG addr = value;
 *  - 预设1 = 默认空音色: 只写 0,7,42,57,72,107,215,221,224,253 全部 = 1;
 *  - 预设2-16 = buildBuiltinPresets() 输出 (v28 固定搭配分组: A2-4/B5-8/C9-12/D13-16),
 *    按寄存器地址升序; 组内各档只覆盖 8 个 BYPASS 寄存器 (7,42,57,72,107,215,221,224);
 *  - 预设2-16 补 REG 260=0 尾帧 (与参考档一致, 预设1 除外);
 *  - 每个预设末尾单独一节 BOOST (PGA): ES8311 reg 0x14 regmap_write (device 0x30);
 *    值 = pgaLevelToValue(level) = 0x10 | level, level = round(boostNorm*10) (0-10, 3dB/档), 取各预设 boost 旋钮归一值.
 */
import { writeFileSync } from 'node:fs';
import { buildBuiltinPresets } from '../src/data/builtinPresets';

const OUT = 'C:/Users/FAY/AndroidStudioProjects/bfv30001/temp/预设文件音色1-16.txt';

/** little-endian 4 字节 C 数组元素字节 */
function le4(v: number): number[] {
  const n = v >>> 0;
  return [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];
}

function fmtReg(addr: number, value: number): string {
  // 每个 data_chunk_t = { 地址 LE32, 值 LE32 } (8 字节), 地址写进花括号内
  const ab = le4(addr);
  const vb = le4(value);
  const hex = [...ab, ...vb].map((x) => `0x${x.toString(16).padStart(2, '0')}`).join(', ');
  return `    { ${hex} }, // REG ${addr} = ${value}`;
}

function block(pairs: Array<[number, number]>): string {
  const sorted = [...pairs].sort((a, b) => a[0] - b[0]);
  return sorted.map(([a, v]) => fmtReg(a, v)).join('\n');
}

/** BOOST (PGA) 段: ES8311 reg 0x14 regmap_write. 值 = pgaLevelToValue(level) = 0x10 | level (0dB → 0x10) */
function boostSection(boostNorm: number): string {
  const level = Math.max(0, Math.min(10, Math.round(boostNorm * 10)));
  const val = 0x10 | (level & 0x0f);
  const hex = `0x${val.toString(16).padStart(2, '0')}`;
  return `═══ BOOST (PGA) — ES8311 reg 0x14 ═══
    regmap_write(Everest.regmap, ES8311_Reg0x14_DMICSEL_ADC_Input_PGAGain, ${hex});  // LEVEL ${level} = ${level * 3}dB (pgaLevelToValue)
`;
}

let out = '';
for (const p of buildBuiltinPresets()) {
  const map = new Map<number, number>();
  for (const [k, v] of Object.entries(p.registers)) map.set(Number(k), Number(v));
  // 尾帧 REG 260 = 0 (参考档惯例), 预设1 空音色除外
  if (p.slot !== 1 && !map.has(260)) map.set(260, 0);
  const boost = p.knobValues?.['boost']?.['BOOST'] ?? 0;

  const pad = p.slot < 10 ? `0${p.slot}` : `${p.slot}`;
  out += `${pad}-${p.name}\n\n`;
  out += '═══ FORMAT 3: C Array ═══\n';
  out += 'const data_chunk_t all_data[] = {\n';
  out += block([...map.entries()]);
  out += '\n};\n';
  out += `\n${boostSection(boost)}`;
  out += '\n';
}

writeFileSync(OUT, out, 'utf8');
console.log(`written: ${OUT} (${buildBuiltinPresets().length} presets)`);
