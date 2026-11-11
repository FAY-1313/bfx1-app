/**
 * v3.46: two amp PEQ fixes requested by the user.
 *   1. Twin reg 85 (PEAK 397 Hz): -4.0 -> -10.2  (restore the 400 Hz notch he prefers)
 *   2. 6505 reg 96 (PEAK 4000 Hz): -3.4 -> -0.4   (net +3 dB at 4 kHz)
 * Uses the project codec, no hand encoding.
 */
import { buildPEQData, freqToIndex, PEQ_Q_TABLE, PEQ_FREQ_TABLE } from '../src/data/peqCodec';
import { readFileSync, writeFileSync } from 'node:fs';

const TY = { PEAK: 0, LSHELF: 1, HSHELF: 2, ALLPASS: 3, HPF: 4, LPF: 5, HPF1: 6, LPF1: 7 } as const;
const TYN = ['PEAK', 'LSHELF', 'HSHELF', 'ALLPASS', 'HPF', 'LPF', 'HPF1', 'LPF1'];
const SRC = 'src/data/_def/ampHeadDef.ts';

const qIdx = (q: number) => {
  let best = 0, bd = 1e9;
  PEQ_Q_TABLE.forEach((v, i) => { const d = Math.abs(v - q); if (d < bd) { bd = d; best = i; } });
  return best;
};
const dec = (v: number) =>
  `${TYN[v & 7]} @${PEQ_FREQ_TABLE[(v >>> 3) & 0x1ff]}Hz ${(-24 + ((v >>> 12) & 0xff) * 0.2).toFixed(1)}dB Q${PEQ_Q_TABLE[(v >>> 20) & 0x7f]}`;

const s = readFileSync(SRC, 'utf8');
const cur: Record<string, Record<number, number>> = {};
for (const m of s.matchAll(/id: "([a-z0-9_]+)"[\s\S]*?regs: \{([\s\S]*?)\}/g)) {
  if (cur[m[1]]) continue;
  const d: Record<number, number> = {};
  for (const mm of m[2].matchAll(/(\d+):\s*(\d+)/g)) d[+mm[1]] = +mm[2];
  cur[m[1]] = d;
}

// target words
const plan: Array<{ id: string; addr: number; gainDb: number }> = [
  { id: 'twin', addr: 85, gainDb: -10.2 },
  { id: 'krank_rev', addr: 96, gainDb: -0.4 },   // Peavey 6505
];

const out: Record<string, Record<number, number>> = {};
for (const p of plan) {
  const from = cur[p.id][p.addr];
  const t = from & 7, fi = (from >>> 3) & 0x1ff, qi = (from >>> 20) & 0x7f, si = (from >>> 27) & 0x1f;
  const gi = Math.round((p.gainDb + 24) / 0.2);
  if (gi < 0 || gi > 180) throw new Error(`gain out of range ${p.gainDb}`);
  const to = buildPEQData(t, fi, gi, qi, si);
  out[p.id] = out[p.id] || {};
  out[p.id][p.addr] = to;
  console.log(`${p.id} #${p.addr}\n   from ${from}  ${dec(from)}\n   to   ${to}  ${dec(to)}`);
  if (PEQ_FREQ_TABLE[(to >>> 3) & 0x1ff] !== PEQ_FREQ_TABLE[fi]) throw new Error('freq drift');
  if (Math.abs((-24 + (((to >>> 12) & 0xff)) * 0.2) - p.gainDb) > 1e-9) throw new Error('gain drift');
}

writeFileSync('tools/_v346_patch.json', JSON.stringify(out, null, 2), 'utf8');
console.log('OK -> tools/_v346_patch.json');
