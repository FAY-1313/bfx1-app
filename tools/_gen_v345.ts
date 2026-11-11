/**
 * v3.45 one-shot: rewrite PEQ words for 20 v10 amp heads + 8 overdrive models.
 * Uses the project's real codec (buildPEQData / freqToIndex / PEQ_Q_TABLE).
 *
 * ---- Amp (box head) v4 plan, user decisions O1/O2 ----
 *   - 83 high-shelf NEVER touched (N1: 9 dB cap does not cover high shelf; N2: do not change)
 *   - Q designed per model (N4), hard ceiling Q 2.5 (O1 lowered the 3.0-3.6 group)
 *   - Twin 61 changed to -1.0 dB (O2)
 *   - 85 only touched on the 5 BASS heads (N5). CRUNCH / HIGH-GAIN 85 stay as-is.
 *   - 88 only touched on CLEAN (ac30/dr103/jc120) and the 5 HIGH-GAIN heads.
 *
 * ---- Overdrive v2 plan ----
 *   - 44 HPF 8-step ladder, 45/46 per-model character lift, 47 pre-clip LPF
 *   - POST: 260 Hz restore + softened 16.3k cap
 *   - TS-808: TONE knob moves to reg 54 as an LPF frequency sweep 700-8000 Hz,
 *     default 8000 (knob metadata handled separately in odDef.ts)
 *   - Level -> -1.0 dB (reg 51 = 284) for all 8
 */
import { buildPEQData, freqToIndex, PEQ_Q_TABLE, PEQ_FREQ_TABLE, PEQ_GAIN_MAX, PEQ_GAIN_MIN } from '../src/data/peqCodec';
import { readFileSync, writeFileSync } from 'node:fs';

const TY = { PEAK: 0, LSHELF: 1, HSHELF: 2, ALLPASS: 3, HPF: 4, LPF: 5, HPF1: 6, LPF1: 7 } as const;
const TYN = ['PEAK', 'LSHELF', 'HSHELF', 'ALLPASS', 'HPF', 'LPF', 'HPF1', 'LPF1'];

type Spec = { addr: number; type?: keyof typeof TY; hz?: number; gainDb?: number; q?: number; reg?: number };

const clampGain = (db: number) => {
  const i = Math.round((db + 24) / 0.2);
  if (i < PEQ_GAIN_MIN || i > PEQ_GAIN_MAX) throw new Error(`gain index out of range: ${db} dB -> ${i}`);
  return i;
};
const closestQ = (q: number) => {
  let best = 0, bd = 1e9;
  PEQ_Q_TABLE.forEach((v, i) => { const d = Math.abs(v - q); if (d < bd) { bd = d; best = i; } });
  return best;
};

function patchWord(from: number, p: Spec): number {
  const t = p.type !== undefined ? TY[p.type] : (from & 7);
  const fi = p.hz !== undefined ? freqToIndex(p.hz) : ((from >>> 3) & 0x1ff);
  const gi = p.gainDb !== undefined ? clampGain(p.gainDb) : ((from >>> 12) & 0xff);
  const qi = p.q !== undefined ? closestQ(p.q) : ((from >>> 20) & 0x7f);
  const si = (from >>> 27) & 0x1f;
  return buildPEQData(t, fi, gi, qi, si);
}

const dec = (v: number) =>
  `${TYN[v & 7]} @${PEQ_FREQ_TABLE[(v >>> 3) & 0x1ff]}Hz ${(-24 + ((v >>> 12) & 0xff) * 0.2).toFixed(1)}dB Q${PEQ_Q_TABLE[(v >>> 20) & 0x7f]}`;

/* ══════════ AMP HEADS ══════════ */
const AMP: Record<string, Spec[]> = {
  // ---------------- CLEAN ----------------
  twin: [
    { addr: 59, hz: 140 }, { addr: 60, hz: 16000 },
    { addr: 61, type: 'PEAK', hz: 642, gainDb: -1.0, q: 0.84 },
    { addr: 62, type: 'PEAK', hz: 3630, gainDb: 3.0, q: 2.00 },
  ],
  jtm45c: [
    { addr: 59, hz: 65 }, { addr: 60, hz: 14500 },
    { addr: 61, type: 'PEAK', hz: 164, gainDb: 4.4, q: 1.19 },
    { addr: 62, type: 'PEAK', hz: 1590, gainDb: 1.6, q: 1.30 },
    { addr: 84, gainDb: 9.0 },
  ],
  ac30tbc: [
    { addr: 59, hz: 88.4 }, { addr: 60, hz: 12700 },
    { addr: 61, type: 'PEAK', hz: 944, gainDb: 4.0, q: 2.10 },
    { addr: 62, type: 'PEAK', hz: 2200, gainDb: 3.6, q: 2.50 },
    { addr: 84, gainDb: 9.0 }, { addr: 88, hz: 18000 },
  ],
  dr103c: [
    { addr: 59, hz: 111 }, { addr: 60, hz: 17600 },
    { addr: 61, type: 'PEAK', hz: 340, gainDb: 0.4, q: 1.60 },
    { addr: 62, type: 'PEAK', hz: 2880, gainDb: 1.6, q: 1.70 },
    { addr: 88, hz: 17000 },
  ],
  jc120c: [
    { addr: 59, hz: 173 }, { addr: 60, hz: 19000 },
    { addr: 61, type: 'PEAK', hz: 520, gainDb: -1.6, q: 1.50 },
    { addr: 62, type: 'PEAK', hz: 5440, gainDb: 5.4, q: 2.40 },
    { addr: 88, hz: 18000 },
  ],
  // ---------------- CRUNCH ----------------
  dumble_ods: [
    { addr: 61, type: 'PEAK', hz: 779, gainDb: 4.4, q: 2.50 },
    { addr: 62, type: 'PEAK', hz: 2770, gainDb: 2.4, q: 2.00 },
  ],
  orange_ad30: [
    { addr: 61, type: 'PEAK', hz: 281, gainDb: 5.0, q: 1.12 },
    { addr: 62, type: 'PEAK', hz: 1560, gainDb: 2.0, q: 1.40 },
  ],
  supro_1696t: [
    { addr: 61, type: 'PEAK', hz: 618, gainDb: 3.0, q: 1.80 },
    { addr: 62, type: 'PEAK', hz: 1890, gainDb: 2.0, q: 2.10 },
  ],
  bogner_ecstasy: [
    { addr: 59, hz: 57.9 }, { addr: 60, hz: 13700 },
    { addr: 61, type: 'PEAK', hz: 191, gainDb: 4.4, q: 0.94 },
    { addr: 62, type: 'PEAK', hz: 2290, gainDb: 1.6, q: 1.50 },
    { addr: 84, gainDb: 9.0 },
  ],
  diezel_vh4: [
    { addr: 61, type: 'PEAK', hz: 1140, gainDb: 4.4, q: 2.20 },
    { addr: 62, type: 'PEAK', hz: 3170, gainDb: 3.0, q: 2.40 },
  ],
  // ---------------- HIGH-GAIN ----------------
  engl_savage: [
    { addr: 59, hz: 297 }, { addr: 60, hz: 5440 },
    { addr: 61, type: 'PEAK', hz: 321, gainDb: 2.4, q: 2.50 },
    { addr: 62, type: 'PEAK', hz: 1440, gainDb: 5.6, q: 2.20 },
    { addr: 84, gainDb: 9.0 }, { addr: 88, hz: 8160 },
  ],
  framus_cobra: [
    { addr: 59, hz: 173 }, { addr: 60, hz: 8810 },
    { addr: 61, type: 'PEAK', hz: 618, gainDb: -4.4, q: 1.40 },
    { addr: 62, type: 'PEAK', hz: 3430, gainDb: 5.8, q: 2.40 },
    { addr: 84, gainDb: 4.4 }, { addr: 88, hz: 11500 },
  ],
  krank_rev: [
    { addr: 59, hz: 206 }, { addr: 60, hz: 6230 },
    { addr: 61, type: 'PEAK', hz: 241, gainDb: 4.2, q: 1.19 },
    { addr: 62, type: 'PEAK', hz: 1890, gainDb: 4.4, q: 1.90 },
    { addr: 84, gainDb: 8.8 }, { addr: 88, hz: 9150 },
  ],
  vht_pittbull: [
    { addr: 59, hz: 140 }, { addr: 60, hz: 7410 },
    { addr: 61, type: 'PEAK', hz: 481, gainDb: 3.6, q: 1.60 },
    { addr: 62, type: 'PEAK', hz: 2330, gainDb: 3.0, q: 1.70 },
    { addr: 84, gainDb: 7.0 }, { addr: 88, hz: 10100 },
  ],
  rivera_knuckle: [
    { addr: 59, hz: 105 }, { addr: 60, hz: 10700 },
    { addr: 61, type: 'PEAK', hz: 825, gainDb: 2.0, q: 1.30 },
    { addr: 62, type: 'PEAK', hz: 2880, gainDb: 2.4, q: 1.26 },
    { addr: 84, gainDb: 3.0 }, { addr: 88, hz: 13200 },
  ],
  // ---------------- BASS ----------------
  svt: [
    { addr: 59, hz: 35.1 },
    { addr: 61, type: 'PEAK', hz: 198, gainDb: 5.6, q: 1.50 },
    { addr: 62, type: 'PEAK', hz: 908, gainDb: 4.4, q: 1.80 },
    { addr: 84, gainDb: 4.4 }, { addr: 85, gainDb: -3.0 },
  ],
  l4bass: [
    { addr: 61, type: 'PEAK', hz: 382, gainDb: -2.4, q: 0.89 },
    { addr: 62, type: 'PEAK', hz: 1560, gainDb: 1.0, q: 1.00 },
    { addr: 84, gainDb: -2.4 }, { addr: 85, gainDb: 3.0 },
  ],
  ac360: [
    { addr: 59, hz: 41.7 },
    { addr: 61, type: 'PEAK', hz: 161, gainDb: 5.8, q: 1.90 },
    { addr: 62, type: 'PEAK', hz: 618, gainDb: 1.6, q: 2.20 },
    { addr: 84, gainDb: 7.6 }, { addr: 85, gainDb: -5.0 },
  ],
  betabass: [
    { addr: 59, hz: 47.7 },
    { addr: 61, type: 'PEAK', hz: 454, gainDb: 3.6, q: 2.10 },
    { addr: 62, type: 'PEAK', hz: 1140, gainDb: 3.6, q: 2.50 },
    { addr: 84, gainDb: 2.0 }, { addr: 85, gainDb: -2.0 },
  ],
  ts50b: [
    { addr: 61, type: 'PEAK', hz: 260, gainDb: 0.4, q: 1.70 },
    { addr: 62, type: 'PEAK', hz: 2000, gainDb: 4.0, q: 2.40 },
    { addr: 84, gainDb: 0.0 }, { addr: 85, gainDb: 2.0 },
  ],
};

/* ══════════ OVERDRIVE ══════════ */
const ODD: Record<string, Spec[]> = {
  timmy_g: [
    { addr: 44, type: 'HPF1', hz: 120 },
    { addr: 46, type: 'PEAK', hz: 500, gainDb: 2.0, q: 1.60 },
    { addr: 47, type: 'LPF1', hz: 8000 },
    { addr: 54, type: 'PEAK', hz: 260, gainDb: 2.4, q: 1.19 },
    { addr: 56, gainDb: -2.0 },
    { addr: 51, reg: 284 },
  ],
  ts808_g: [
    { addr: 45, type: 'PEAK', hz: 1190, gainDb: 3.0, q: 1.80 },
    { addr: 47, type: 'LPF1', hz: 5040 },
    { addr: 54, type: 'LPF1', hz: 8000 },   // TONE knob default (700-8000 sweep)
    { addr: 56, type: 'PEAK', hz: 260, gainDb: 3.0, q: 1.19 },
    { addr: 51, reg: 284 },
  ],
  ocd_g: [
    { addr: 44, type: 'HPF1', hz: 260 },
    { addr: 45, type: 'PEAK', hz: 694, gainDb: 3.0, q: 1.60 },
    { addr: 46, type: 'PEAK', hz: 3000, gainDb: 2.0, q: 1.40 },
    { addr: 47, type: 'LPF1', hz: 5990 },
    { addr: 53, type: 'PEAK', hz: 260, gainDb: 3.0, q: 1.19 },
    { addr: 51, reg: 284 },
  ],
  sd1: [
    { addr: 44, type: 'HPF1', hz: 857 },
    { addr: 47, type: 'LPF1', hz: 5040 },
    { addr: 54, type: 'PEAK', hz: 260, gainDb: 3.0, q: 1.19 },
    { addr: 55, gainDb: -3.0 },
    { addr: 51, reg: 284 },
  ],
  klon: [
    { addr: 44, type: 'HPF1', hz: 49.6 },
    { addr: 46, type: 'PEAK', hz: 1500, gainDb: 2.4, q: 1.80 },
    { addr: 47, type: 'LPF1', hz: 6470 },
    { addr: 54, type: 'PEAK', hz: 260, gainDb: 3.0, q: 1.19 },
    { addr: 55, gainDb: -3.0 },
    { addr: 51, reg: 284 },
  ],
  rat: [
    { addr: 44, type: 'HPF1', hz: 420 },
    { addr: 46, type: 'PEAK', hz: 908, gainDb: 4.0, q: 1.60 },
    { addr: 47, type: 'LPF1', hz: 4490 },
    { addr: 51, reg: 284 },
  ],
  b3k: [
    { addr: 44, type: 'HPF1', hz: 45.1 },
    { addr: 45, type: 'PEAK', hz: 794, gainDb: 2.0, q: 1.60 },
    { addr: 47, type: 'LPF1', hz: 5040 },
    { addr: 54, type: 'PEAK', hz: 260, gainDb: 3.0, q: 1.19 },
    { addr: 55, gainDb: -4.0 },
    { addr: 51, reg: 284 },
  ],
  bd1: [
    { addr: 44, type: 'HPF1', hz: 180 },
    { addr: 45, type: 'PEAK', hz: 1000, gainDb: 2.0, q: 1.60 },
    { addr: 47, type: 'LPF1', hz: 5040 },
    { addr: 55, type: 'PEAK', hz: 260, gainDb: 3.0, q: 1.19 },
    { addr: 56, gainDb: -3.0 },
    { addr: 51, reg: 284 },
  ],
};

/* ══════════ read current values from source ══════════ */
const AMP_SRC = 'src/data/_def/ampHeadDef.ts';
const OD_SRC = 'src/data/_def/odDef.ts';

function readBlocks(path: string): Record<string, Record<number, number>> {
  const s = readFileSync(path, 'utf8');
  const out: Record<string, Record<number, number>> = {};
  const re = /id: "([a-z0-9_]+)"[\s\S]*?regs: \{([\s\S]*?)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    const d: Record<number, number> = {};
    for (const mm of m[2].matchAll(/(\d+):\s*(\d+)/g)) d[+mm[1]] = +mm[2];
    // keep first occurrence only (v19 file has its own ids, not imported here)
    if (!out[m[1]]) out[m[1]] = d;
  }
  return out;
}

const ampCur = readBlocks(AMP_SRC);
const odCur = readBlocks(OD_SRC);

const result: { amp: Record<string, Record<number, number>>; od: Record<string, Record<number, number>> } = { amp: {}, od: {} };
let changed = 0, skipped = 0, verified = 0;
const problems: string[] = [];

function apply(tag: string, cur: Record<number, Record<number, number>>, plan: Record<string, Spec[]>, out: Record<string, Record<number, number>>) {
  for (const [id, specs] of Object.entries(plan)) {
    if (!cur[id]) { problems.push(`[${tag}] id not found: ${id}`); continue; }
    out[id] = {};
    for (const sp of specs) {
      const from = cur[id][sp.addr];
      if (from === undefined) { problems.push(`[${tag}] ${id} reg ${sp.addr} missing`); continue; }
      const to = sp.reg !== undefined ? sp.reg : patchWord(from, sp);
      if (to === from) { skipped++; continue; }
      // round-trip verify against the intent
      if (sp.reg === undefined) {
        const t = to & 7, fi = (to >>> 3) & 0x1ff, gi = (to >>> 12) & 0xff, qi = (to >>> 20) & 0x7f;
        if (sp.type !== undefined && TY[sp.type] !== t) problems.push(`[${tag}] ${id}#${sp.addr} type ${TYN[t]} != ${sp.type}`);
        if (sp.hz !== undefined && PEQ_FREQ_TABLE[fi] !== PEQ_FREQ_TABLE[freqToIndex(sp.hz)]) problems.push(`[${tag}] ${id}#${sp.addr} hz ${PEQ_FREQ_TABLE[fi]}`);
        if (sp.gainDb !== undefined && Math.abs((-24 + gi * 0.2) - sp.gainDb) > 0.001) problems.push(`[${tag}] ${id}#${sp.addr} gain ${-24 + gi * 0.2} != ${sp.gainDb}`);
        if (sp.q !== undefined && PEQ_Q_TABLE[qi] !== PEQ_Q_TABLE[closestQ(sp.q)]) problems.push(`[${tag}] ${id}#${sp.addr} Q ${PEQ_Q_TABLE[qi]} != ${sp.q}`);
        verified++;
      } else {
        if (to !== sp.reg) problems.push(`[${tag}] ${id}#${sp.addr} reg ${to} != ${sp.reg}`);
        verified++;
      }
      if (sp.gainDb !== undefined && (sp.gainDb > 9.0001) && sp.addr !== 83) {
        problems.push(`[${tag}] ${id}#${sp.addr} gain ${sp.gainDb} > 9 dB design cap`);
      }
      out[id][sp.addr] = to;
    }
  }
}

apply('AMP', ampCur, AMP, result.amp);
apply('OD', odCur, ODD, result.od);

writeFileSync('tools/_v345_patch.json', JSON.stringify(result, null, 2), 'utf8');

console.log(`changed=${changed} skipped(already target)=${skipped} verified=${verified}`);
console.log(`amps written=${Object.keys(result.amp).length}  ods written=${Object.keys(result.od).length}`);
console.log(problems.length ? 'PROBLEMS:\n  ' + problems.join('\n  ') : 'NO PROBLEMS');

// human-readable diff
for (const [id, regs] of Object.entries(result.amp)) {
  const lines = Object.entries(regs).map(([a, v]) => `    ${a}: ${String(ampCur[id][+a]).padStart(10)} -> ${String(v).padStart(10)}  ${dec(v)}`);
  if (lines.length) console.log(`  AMP ${id}\n${lines.join('\n')}`);
}
for (const [id, regs] of Object.entries(result.od)) {
  const lines = Object.entries(regs).map(([a, v]) => +a >= 42 && +a <= 56 && [44,45,46,47,53,54,55,56].includes(+a)
    ? `    ${a}: ${String(odCur[id][+a]).padStart(10)} -> ${String(v).padStart(10)}  ${dec(v)}`
    : `    ${a}: ${String(odCur[id][+a]).padStart(10)} -> ${String(v).padStart(10)}`);
  if (lines.length) console.log(`  OD ${id}\n${lines.join('\n')}`);
}
