/** 临时脚本 (用后删): 按实物电路特征生成差异化 PRE EQ, 写入 SUB_MODEL_PRE_EQ */
import * as fs from 'fs';
import { buildPEQData, freqToIndex, parsePEQData, PEQ_TYPE, PEQ_FREQ_TABLE, PEQ_Q_TABLE, PEQ_S_TABLE, SUB_MODEL_PRE_EQ } from './src/data/parameterMap';

// 设计表: 模型基名 → 4 段 [type, 目标频率Hz, 增益dB, Q, S]
// 电路依据: 同品牌同型号逐款定制; 中频特征点(段2)与存在感(段4)为主要差异化轴
type Band = [number, number, number, number, number];
const D: Record<string, Band[]> = {
  // ── 过载 (regs 44-47) ──
  'Boss BD-2': [
    [PEQ_TYPE.HPF, 50, 0, 0.71, 0.4],
    [PEQ_TYPE.PEAK, 490, 2.5, 0.84, 0.71],
    [PEQ_TYPE.PEAK, 2100, -0.5, 1.0, 0.71],
    [PEQ_TYPE.HIGH_SHELF, 4600, 1.0, 1.0, 0.71],
  ],
  'Boss OD-3': [
    [PEQ_TYPE.HPF, 45, 0, 0.71, 0.4],
    [PEQ_TYPE.PEAK, 400, 3.0, 0.79, 0.71],
    [PEQ_TYPE.PEAK, 1800, 0.5, 1.0, 0.71],
    [PEQ_TYPE.LPF, 6400, 0, 0.71, 0.4],
  ],
  'Boss SD-1': [
    [PEQ_TYPE.HPF, 55, 0, 0.71, 0.4],
    [PEQ_TYPE.PEAK, 1000, 5.0, 1.19, 0.71],
    [PEQ_TYPE.PEAK, 1900, -1.5, 1.0, 0.71],
    [PEQ_TYPE.LPF, 5300, 0, 0.71, 0.4],
  ],
  'Fulltone OCD': [
    [PEQ_TYPE.HPF, 45, 0, 0.71, 0.4],
    [PEQ_TYPE.PEAK, 350, 1.5, 0.71, 0.71],
    [PEQ_TYPE.PEAK, 1300, -1.0, 0.84, 0.71],
    [PEQ_TYPE.HIGH_SHELF, 5500, 1.5, 1.0, 0.71],
  ],
  'Horizon Precision Drive': [
    [PEQ_TYPE.HPF, 90, 0, 0.71, 0.4],
    [PEQ_TYPE.PEAK, 450, -1.5, 0.84, 0.71],
    [PEQ_TYPE.PEAK, 2500, 2.5, 1.0, 0.71],
    [PEQ_TYPE.HIGH_SHELF, 6000, 2.0, 1.0, 0.71],
  ],
  'Ibanez TS808': [
    [PEQ_TYPE.HPF, 65, 0, 0.71, 0.4],
    [PEQ_TYPE.PEAK, 721, 4.5, 0.94, 0.71],
    [PEQ_TYPE.PEAK, 1900, -1.5, 1.0, 0.71],
    [PEQ_TYPE.LPF, 5300, 0, 0.71, 0.4],
  ],
  'Ibanez TS9': [
    [PEQ_TYPE.HPF, 65, 0, 0.71, 0.4],
    [PEQ_TYPE.PEAK, 1000, 4.5, 1.0, 0.71],
    [PEQ_TYPE.PEAK, 2000, -1.0, 1.0, 0.71],
    [PEQ_TYPE.LPF, 5000, 0, 0.71, 0.4],
  ],
  'JHS Morning Glory': [
    [PEQ_TYPE.HPF, 55, 0, 0.71, 0.4],
    [PEQ_TYPE.PEAK, 350, 1.0, 0.71, 0.71],
    [PEQ_TYPE.PEAK, 1600, -0.5, 1.0, 0.71],
    [PEQ_TYPE.HIGH_SHELF, 6000, 1.5, 1.0, 0.71],
  ],
  'Klon Centaur': [
    [PEQ_TYPE.LOW_SHELF, 90, -0.5, 1.0, 0.71],
    [PEQ_TYPE.PEAK, 490, 1.5, 0.71, 0.71],
    [PEQ_TYPE.PEAK, 1600, -0.5, 1.0, 0.71],
    [PEQ_TYPE.HIGH_SHELF, 4000, -1.0, 1.0, 0.71],
  ],
  'ProCo RAT': [
    [PEQ_TYPE.HPF, 70, 0, 0.71, 0.4],
    [PEQ_TYPE.PEAK, 350, -2.0, 0.79, 0.71],
    [PEQ_TYPE.PEAK, 2800, 2.0, 1.0, 0.71],
    [PEQ_TYPE.HIGH_SHELF, 3400, 2.5, 1.0, 0.71],
  ],
  'Wampler Tumnus': [
    [PEQ_TYPE.HPF, 60, 0, 0.71, 0.4],
    [PEQ_TYPE.PEAK, 550, 1.5, 0.75, 0.71],
    [PEQ_TYPE.PEAK, 1500, 0, 1.0, 0.71],
    [PEQ_TYPE.HIGH_SHELF, 4500, 0, 1.0, 0.71],
  ],

  // ── 失真 (regs 59-62) ──
  'Boss DS-1': [
    [PEQ_TYPE.HPF, 55, 0, 0.71, 0.4],
    [PEQ_TYPE.PEAK, 600, 1.0, 0.84, 0.71],
    [PEQ_TYPE.PEAK, 2500, 3.0, 1.0, 0.71],
    [PEQ_TYPE.HIGH_SHELF, 5000, 3.0, 1.0, 0.71],
  ],
  'Boss DS-2': [
    [PEQ_TYPE.HPF, 50, 0, 0.71, 0.4],
    [PEQ_TYPE.PEAK, 550, 2.0, 0.79, 0.71],
    [PEQ_TYPE.PEAK, 1900, 1.5, 1.0, 0.71],
    [PEQ_TYPE.HIGH_SHELF, 4400, 1.0, 1.0, 0.71],
  ],
  'Boss HM-2': [
    [PEQ_TYPE.LOW_SHELF, 100, 4.0, 1.0, 0.71],
    [PEQ_TYPE.PEAK, 650, -2.0, 0.79, 0.71],
    [PEQ_TYPE.PEAK, 2400, 3.0, 1.0, 0.71],
    [PEQ_TYPE.HIGH_SHELF, 5200, 5.0, 1.0, 0.71],
  ],
  'Boss MT-2': [
    [PEQ_TYPE.LOW_SHELF, 70, 3.0, 1.0, 0.71],
    [PEQ_TYPE.PEAK, 500, -4.0, 0.79, 0.71],
    [PEQ_TYPE.PEAK, 1700, 2.0, 1.0, 0.71],
    [PEQ_TYPE.HIGH_SHELF, 4800, 3.5, 1.0, 0.71],
  ],
  'Boss OS-2': [
    [PEQ_TYPE.HPF, 60, 0, 0.71, 0.4],
    [PEQ_TYPE.PEAK, 800, 1.5, 0.84, 0.71],
    [PEQ_TYPE.PEAK, 2400, 2.0, 1.0, 0.71],
    [PEQ_TYPE.HIGH_SHELF, 4700, 1.5, 1.0, 0.71],
  ],
  'MXR Distortion+': [
    [PEQ_TYPE.HPF, 45, 0, 0.71, 0.4],
    [PEQ_TYPE.PEAK, 400, 2.5, 0.79, 0.71],
    [PEQ_TYPE.PEAK, 1700, 0.5, 1.0, 0.71],
    [PEQ_TYPE.LPF, 4800, 0, 0.71, 0.4],
  ],
  'EHX Big Muff': [
    [PEQ_TYPE.LOW_SHELF, 90, 4.0, 1.0, 0.71],
    [PEQ_TYPE.PEAK, 400, -5.0, 0.79, 0.71],
    [PEQ_TYPE.PEAK, 1400, -1.0, 1.0, 0.71],
    [PEQ_TYPE.LPF, 3200, 0, 0.71, 0.4],
  ],

  // ── 箱头 (regs 74-77) ──
  'Bogner Ecstasy': [
    [PEQ_TYPE.HPF, 50, 0, 0.71, 0.4],
    [PEQ_TYPE.PEAK, 700, 1.0, 0.84, 0.71],
    [PEQ_TYPE.PEAK, 1800, 0, 1.0, 0.71],
    [PEQ_TYPE.HIGH_SHELF, 5000, 3.0, 1.0, 0.71],
  ],
  'Bogner Uberschall': [
    [PEQ_TYPE.LOW_SHELF, 80, 3.0, 1.0, 0.71],
    [PEQ_TYPE.PEAK, 350, -3.0, 0.79, 0.71],
    [PEQ_TYPE.PEAK, 1700, -0.5, 1.0, 0.71],
    [PEQ_TYPE.HIGH_SHELF, 5200, 3.5, 1.0, 0.71],
  ],
  'Diezel Herbert': [
    [PEQ_TYPE.HPF, 60, 0, 0.71, 0.4],
    [PEQ_TYPE.PEAK, 500, -3.0, 0.79, 0.71],
    [PEQ_TYPE.PEAK, 1500, 0.5, 1.0, 0.71],
    [PEQ_TYPE.HIGH_SHELF, 5200, 3.0, 1.0, 0.71],
  ],
  'Diezel VH4': [
    [PEQ_TYPE.HPF, 50, 0, 0.71, 0.4],
    [PEQ_TYPE.PEAK, 650, -1.0, 0.84, 0.71],
    [PEQ_TYPE.PEAK, 2000, 1.0, 1.0, 0.71],
    [PEQ_TYPE.HIGH_SHELF, 5700, 3.5, 1.0, 0.71],
  ],
  'Dumble ODS': [
    [PEQ_TYPE.HPF, 40, 0, 0.71, 0.4],
    [PEQ_TYPE.PEAK, 600, 2.0, 0.79, 0.71],
    [PEQ_TYPE.PEAK, 1700, 0, 1.0, 0.71],
    [PEQ_TYPE.HIGH_SHELF, 5500, 2.0, 1.0, 0.71],
  ],
  'ENGL Fireball': [
    [PEQ_TYPE.HPF, 55, 0, 0.71, 0.4],
    [PEQ_TYPE.PEAK, 450, -3.0, 0.84, 0.71],
    [PEQ_TYPE.PEAK, 1600, 1.0, 1.0, 0.71],
    [PEQ_TYPE.HIGH_SHELF, 5500, 3.5, 1.0, 0.71],
  ],
  'ENGL Powerball': [
    [PEQ_TYPE.LOW_SHELF, 80, 3.0, 1.0, 0.71],
    [PEQ_TYPE.PEAK, 400, -4.0, 0.84, 0.71],
    [PEQ_TYPE.PEAK, 1500, 0, 1.0, 0.71],
    [PEQ_TYPE.HIGH_SHELF, 5200, 3.0, 1.0, 0.71],
  ],
  'ENGL Savage': [
    [PEQ_TYPE.HPF, 50, 0, 0.71, 0.4],
    [PEQ_TYPE.PEAK, 500, -2.0, 0.84, 0.71],
    [PEQ_TYPE.PEAK, 1800, 1.5, 1.0, 0.71],
    [PEQ_TYPE.HIGH_SHELF, 5100, 3.0, 1.0, 0.71],
  ],
  'EVH 5150III': [
    [PEQ_TYPE.LOW_SHELF, 80, 2.0, 1.0, 0.71],
    [PEQ_TYPE.PEAK, 500, -2.5, 0.84, 0.71],
    [PEQ_TYPE.PEAK, 1700, 0.5, 1.0, 0.71],
    [PEQ_TYPE.HIGH_SHELF, 5600, 3.5, 1.0, 0.71],
  ],
  'Fender Bassman': [
    [PEQ_TYPE.HPF, 45, 0, 0.71, 0.4],
    [PEQ_TYPE.PEAK, 600, 1.0, 0.84, 0.71],
    [PEQ_TYPE.PEAK, 1600, -0.5, 1.0, 0.71],
    [PEQ_TYPE.HIGH_SHELF, 4500, 1.5, 1.0, 0.71],
  ],
  'Fender Champ': [
    [PEQ_TYPE.HPF, 40, 0, 0.71, 0.4],
    [PEQ_TYPE.PEAK, 650, 2.0, 0.79, 0.71],
    [PEQ_TYPE.PEAK, 1500, 0.5, 1.0, 0.71],
    [PEQ_TYPE.LPF, 4000, 0, 0.71, 0.4],
  ],
  'Fender Deluxe Reverb': [
    [PEQ_TYPE.HPF, 45, 0, 0.71, 0.4],
    [PEQ_TYPE.PEAK, 450, -1.0, 0.84, 0.71],
    [PEQ_TYPE.PEAK, 1800, 0, 1.0, 0.71],
    [PEQ_TYPE.HIGH_SHELF, 5200, 2.0, 1.0, 0.71],
  ],
  'Fender Princeton': [
    [PEQ_TYPE.HPF, 40, 0, 0.71, 0.4],
    [PEQ_TYPE.PEAK, 550, -0.5, 0.84, 0.71],
    [PEQ_TYPE.PEAK, 1600, -0.5, 1.0, 0.71],
    [PEQ_TYPE.LPF, 4500, 0, 0.71, 0.4],
  ],
  'Fender Super Reverb': [
    [PEQ_TYPE.HPF, 50, 0, 0.71, 0.4],
    [PEQ_TYPE.PEAK, 350, -2.5, 0.84, 0.71],
    [PEQ_TYPE.PEAK, 1800, 0.5, 1.0, 0.71],
    [PEQ_TYPE.HIGH_SHELF, 5800, 3.0, 1.0, 0.71],
  ],
  'Fender Twin Reverb': [
    [PEQ_TYPE.HPF, 50, 0, 0.71, 0.4],
    [PEQ_TYPE.PEAK, 350, -2.0, 0.84, 0.71],
    [PEQ_TYPE.PEAK, 1600, -0.5, 1.0, 0.71],
    [PEQ_TYPE.HIGH_SHELF, 5500, 2.5, 1.0, 0.71],
  ],
  'Fender Hot Rod': [
    [PEQ_TYPE.HPF, 45, 0, 0.71, 0.4],
    [PEQ_TYPE.PEAK, 500, -0.5, 0.84, 0.71],
    [PEQ_TYPE.PEAK, 2000, 0, 1.0, 0.71],
    [PEQ_TYPE.HIGH_SHELF, 5500, 2.5, 1.0, 0.71],
  ],
  'Friedman BE': [
    [PEQ_TYPE.HPF, 50, 0, 0.71, 0.4],
    [PEQ_TYPE.PEAK, 650, 1.5, 0.84, 0.71],
    [PEQ_TYPE.PEAK, 1900, 0.5, 1.0, 0.71],
    [PEQ_TYPE.HIGH_SHELF, 5000, 3.0, 1.0, 0.71],
  ],
  'Marshall JTM45': [
    [PEQ_TYPE.HPF, 45, 0, 0.71, 0.4],
    [PEQ_TYPE.PEAK, 550, 2.0, 0.84, 0.71],
    [PEQ_TYPE.PEAK, 1500, 0, 1.0, 0.71],
    [PEQ_TYPE.HIGH_SHELF, 3800, 1.0, 1.0, 0.71],
  ],
  'Marshall Plexi': [
    [PEQ_TYPE.HPF, 50, 0, 0.71, 0.4],
    [PEQ_TYPE.PEAK, 650, 2.5, 0.84, 0.71],
    [PEQ_TYPE.PEAK, 1700, 0.5, 1.0, 0.71],
    [PEQ_TYPE.HIGH_SHELF, 4800, 2.5, 1.0, 0.71],
  ],
  'Marshall JCM800': [
    [PEQ_TYPE.HPF, 55, 0, 0.71, 0.4],
    [PEQ_TYPE.PEAK, 750, 1.5, 0.84, 0.71],
    [PEQ_TYPE.PEAK, 1900, 0.5, 1.0, 0.71],
    [PEQ_TYPE.HIGH_SHELF, 5200, 3.0, 1.0, 0.71],
  ],
  'Marshall JCM900': [
    [PEQ_TYPE.HPF, 55, 0, 0.71, 0.4],
    [PEQ_TYPE.PEAK, 600, 2.0, 0.84, 0.71],
    [PEQ_TYPE.PEAK, 1600, -0.5, 1.0, 0.71],
    [PEQ_TYPE.HIGH_SHELF, 4500, 2.0, 1.0, 0.71],
  ],
  'Mesa Dual Rectifier': [
    [PEQ_TYPE.LOW_SHELF, 80, 4.0, 1.0, 0.71],
    [PEQ_TYPE.PEAK, 350, -5.0, 0.79, 0.71],
    [PEQ_TYPE.PEAK, 1500, 0, 1.0, 0.71],
    [PEQ_TYPE.HIGH_SHELF, 5200, 2.5, 1.0, 0.71],
  ],
  'Mesa Mark': [
    [PEQ_TYPE.HPF, 45, 0, 0.71, 0.4],
    [PEQ_TYPE.PEAK, 550, -1.0, 0.84, 0.71],
    [PEQ_TYPE.PEAK, 1900, 1.0, 1.0, 0.71],
    [PEQ_TYPE.HIGH_SHELF, 5600, 3.0, 1.0, 0.71],
  ],
  'Peavey 5150': [
    [PEQ_TYPE.HPF, 55, 0, 0.71, 0.4],
    [PEQ_TYPE.PEAK, 500, -2.0, 0.84, 0.71],
    [PEQ_TYPE.PEAK, 1700, 1.0, 1.0, 0.71],
    [PEQ_TYPE.HIGH_SHELF, 5400, 3.5, 1.0, 0.71],
  ],
  'Peavey 6505': [
    [PEQ_TYPE.HPF, 55, 0, 0.71, 0.4],
    [PEQ_TYPE.PEAK, 600, -1.0, 0.84, 0.71],
    [PEQ_TYPE.PEAK, 1600, 0.5, 1.0, 0.71],
    [PEQ_TYPE.HIGH_SHELF, 5000, 2.5, 1.0, 0.71],
  ],
  'Vox AC15': [
    [PEQ_TYPE.LOW_SHELF, 90, 1.0, 1.0, 0.71],
    [PEQ_TYPE.PEAK, 500, 2.0, 0.79, 0.71],
    [PEQ_TYPE.PEAK, 1800, 0.5, 1.0, 0.71],
    [PEQ_TYPE.HIGH_SHELF, 6000, 3.0, 1.0, 0.71],
  ],
  'Vox AC30': [
    [PEQ_TYPE.LOW_SHELF, 100, 1.5, 1.0, 0.71],
    [PEQ_TYPE.PEAK, 400, 2.5, 0.79, 0.71],
    [PEQ_TYPE.PEAK, 1600, 0.5, 1.0, 0.71],
    [PEQ_TYPE.HIGH_SHELF, 5800, 2.5, 1.0, 0.71],
  ],
  'Hiwatt': [
    [PEQ_TYPE.HPF, 45, 0, 0.71, 0.4],
    [PEQ_TYPE.PEAK, 400, 0.5, 0.71, 0.71],
    [PEQ_TYPE.PEAK, 1500, 0, 1.0, 0.71],
    [PEQ_TYPE.HIGH_SHELF, 6000, 3.5, 1.0, 0.71],
  ],
  'Roland JC120': [
    [PEQ_TYPE.HPF, 50, 0, 0.71, 0.4],
    [PEQ_TYPE.PEAK, 450, 0, 0.71, 0.71],
    [PEQ_TYPE.PEAK, 1600, 0, 1.0, 0.71],
    [PEQ_TYPE.HIGH_SHELF, 5500, 1.5, 1.0, 0.71],
  ],
  'Soldano SLO': [
    [PEQ_TYPE.HPF, 50, 0, 0.71, 0.4],
    [PEQ_TYPE.PEAK, 700, 1.0, 0.84, 0.71],
    [PEQ_TYPE.PEAK, 1900, 0.5, 1.0, 0.71],
    [PEQ_TYPE.HIGH_SHELF, 5600, 3.0, 1.0, 0.71],
  ],
  'Orange Rockerverb': [
    [PEQ_TYPE.LOW_SHELF, 80, 2.0, 1.0, 0.71],
    [PEQ_TYPE.PEAK, 600, 2.0, 0.79, 0.71],
    [PEQ_TYPE.PEAK, 1600, 0, 1.0, 0.71],
    [PEQ_TYPE.HIGH_SHELF, 4500, 1.5, 1.0, 0.71],
  ],
  'PRS Archon': [
    [PEQ_TYPE.HPF, 55, 0, 0.71, 0.4],
    [PEQ_TYPE.PEAK, 500, -1.5, 0.84, 0.71],
    [PEQ_TYPE.PEAK, 1800, 1.0, 1.0, 0.71],
    [PEQ_TYPE.HIGH_SHELF, 5400, 3.0, 1.0, 0.71],
  ],
  'Xotic BB Preamp': [
    [PEQ_TYPE.HPF, 50, 0, 0.71, 0.4],
    [PEQ_TYPE.PEAK, 500, 2.0, 0.79, 0.71],
    [PEQ_TYPE.PEAK, 1700, 0, 1.0, 0.71],
    [PEQ_TYPE.HIGH_SHELF, 5500, 2.0, 1.0, 0.71],
  ],
};

const qIdx = (q: number) => {
  let b = 0, bd = Infinity;
  for (let i = 0; i < PEQ_Q_TABLE.length; i++) { const d = Math.abs(PEQ_Q_TABLE[i] - q); if (d < bd) { bd = d; b = i; } }
  return b;
};
const sIdx = (s: number) => {
  let b = 0, bd = Infinity;
  for (let i = 0; i < PEQ_S_TABLE.length; i++) { const d = Math.abs(PEQ_S_TABLE[i] - s); if (d < bd) { bd = d; b = i; } }
  return b;
};
const enc = (band: Band) => buildPEQData(band[0], freqToIndex(band[1]), 120 + Math.round(band[2] * 5), qIdx(band[3]), sIdx(band[4]));

const T: Record<number, string> = { 0: 'PEAK', 1: 'LSH', 2: 'HSH', 3: 'AP', 4: 'HPF', 5: 'LPF', 6: 'HPF1', 7: 'LPF1' };
function dec(v: number): string {
  if (v === 0) return 'OFF';
  const p = parsePEQData(v);
  const g = ((p.gain - 120) * 0.2).toFixed(1);
  const f = p.freq < PEQ_FREQ_TABLE.length ? PEQ_FREQ_TABLE[p.freq] : p.freq;
  const q = p.q < PEQ_Q_TABLE.length ? PEQ_Q_TABLE[p.q] : p.q;
  return `${T[p.type] || p.type}@${f}Hz ${g}dB Q${q}`;
}

// ── 1. 打印新旧对比 ──
console.log('== 差异化 PRE EQ 设计预览 (旧 → 新) ==');
const missing: string[] = [];
for (const [key, cfg] of Object.entries(SUB_MODEL_PRE_EQ)) {
  const base = key.split('/')[1];
  if (base.endsWith('_2')) continue;
  const model = key.split('/')[0].replace('B&F NAM ', '');
  const design = D[model];
  if (!design) { if (key.includes('B&F NAM')) missing.push(key); continue; }
  const newVals = design.map(enc);
  const tag = cfg.regs[0] === 44 ? 'OD ' : cfg.regs[0] === 59 ? 'DIST' : 'AMP';
  console.log(`\n[${tag}] ${model}`);
  console.log(`  旧: ${cfg.values.map(dec).join(' | ')}`);
  console.log(`  新: ${newVals.map(dec).join(' | ')}`);
}
if (missing.length) console.log(`\n!! 未设计(保持原值): ${missing.length}`);
else console.log(`\n全部吉他模型已覆盖设计`);

// ── 2. 写入 parameterMap.ts ──
const FILE = 'src/data/parameterMap.ts';
let text = fs.readFileSync(FILE, 'utf8');
let applied = 0;
for (const [key, cfg] of Object.entries(SUB_MODEL_PRE_EQ)) {
  const model = key.split('/')[0].replace('B&F NAM ', '');
  const design = D[model];
  if (!design) continue;
  const newVals = design.map(enc).map(v => '0x' + v.toString(16).toUpperCase().padStart(8, '0'));
  const re = new RegExp('("' + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '".*values: \\[)[^\\]]+(\\])');
  if (!re.test(text)) { console.log(`!! 未匹配: ${key}`); continue; }
  text = text.replace(re, `$1${newVals.join(', ')}$2`);
  applied++;
}
fs.writeFileSync(FILE, text, 'utf8');
console.log(`\n已写入 ${applied} 条 (主+_2 同值)`);
