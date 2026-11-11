/**
 * v3.44 one-shot: recompute PEQ words for 2 v10 amp heads + 2 overdrive models.
 * Uses the project's real codec (buildPEQData / freqToIndex) - no hand encoding.
 *
 * Amp rule from user:
 *   - dynamics lost in stages 1-3 must be restored in stage 4 (N8, regs 82-98)
 *   - DRIVE (reg 79) +5 dB  ->  VOL2 (reg 81) -1.5 dB as headroom buffer
 *
 * OD rule from user:
 *   - POST EQ must NOT attenuate hard
 *   - the cut made in PRE must be restored in POST
 *   - low cut depth decided per model
 *   - Level (reg 51) = -1 dB
 */
import { buildPEQData, freqToIndex, PEQ_Q_TABLE, PEQ_S_TABLE, PEQ_FREQ_TABLE } from '../src/data/peqCodec';

const TY = { PEAK: 0, LSHELF: 1, HSHELF: 2, ALLPASS: 3, HPF: 4, LPF: 5, HPF1: 6, LPF1: 7 };
const TYN = ['PEAK', 'LSHELF', 'HSHELF', 'ALLPASS', 'HPF', 'LPF', 'HPF1', 'LPF1'];

const dec = (v: number) => {
  const t = v & 7, fi = (v >>> 3) & 0x1ff, gi = (v >>> 12) & 0xff;
  return `${TYN[t]} @${PEQ_FREQ_TABLE[fi]}Hz ${(-24 + gi * 0.2).toFixed(1)}dB`;
};

type Patch = { addr: number; from: number; type?: keyof typeof TY; hz?: number; gainDb?: number };

/** rewrite a PEQ word: keep whatever is not specified (type / freq / gain / Q / S) */
function patchWord(from: number, p: Patch): number {
  const t = p.type !== undefined ? TY[p.type] : (from & 7);
  const fi = p.hz !== undefined ? freqToIndex(p.hz) : ((from >>> 3) & 0x1ff);
  const gi = p.gainDb !== undefined
    ? Math.max(0, Math.min(255, Math.round((p.gainDb + 24) / 0.2)))
    : ((from >>> 12) & 0xff);
  const qi = (from >>> 20) & 0x7f;
  const si = (from >>> 27) & 0x1f;
  return buildPEQData(t, fi, gi, qi, si);
}

const PATCHES: Record<string, Record<number, Patch[]>> = {
  // ---------------- v10 amp head #0 : Fender Twin ----------------
  twin: {
    59: [{ addr: 59, from: 1359446118, hz: 140 }],          // N1 pre-clip HPF 24.8 -> 140
    60: [{ addr: 60, from: 1359448895, hz: 16000 }],         // N4 LPF 19800 -> 16000 (less brittle)
    84: [{ addr: 84, from: 1627996833, gainDb: 7.5 }],       // N8 low shelf +5.6 -> +7.5 (restore body)
    85: [{ addr: 85, from: 1353995488, gainDb: -4.0 }],      // N8 scoop -10.2 -> -4.0
    88: [{ addr: 88, from: 1359448893, hz: 16000 }],         // N8 LPF 19800 -> 16000
    91: [{ addr: 91, from: 1353089808, gainDb: -0.5 }],      // N8 130Hz -3.2 -> -0.5
    92: [{ addr: 92, from: 1353085984, gainDb: 1.0 }],       // N8 250Hz -3.4 -> +1.0
  },
  // ---------------- v10 amp head #1 : Marshall JTM45 ----------------
  jtm45c: {
    59: [{ addr: 59, from: 1359446446, hz: 80 }],            // tighten slightly
    84: [{ addr: 84, from: 1628107465, gainDb: 10.0 }],      // +11.0 -> +10.0 (keep weight)
  },
  // ---------------- OD #1 : Ibanez TS-808 ----------------
  ts808_g: {
    46: [{ addr: 46, from: 10977670, type: 'LSHELF', hz: 19.7, gainDb: 0 }],   // 721Hz coupling already cuts lows -> drop the redundant 49.6 HPF
    55: [{ addr: 55, from: 1359284970, type: 'LSHELF', hz: 19.7, gainDb: 0 }], // -8dB shelf was redundant vs 721Hz LPF -> remove
    56: [{ addr: 56, from: 3232202753, type: 'PEAK', hz: 260, gainDb: 3.0 }],  // POST restore (+3 dB @260) for the pipeline loss
  },
  // ---------------- OD #2 : ProCo RAT ----------------
  // 44 / 54 / 56 均无旋钮（knob 只有 49 DISTORTION / 53 FILTER / 51 LEVEL）
  rat: {
    44: [{ addr: 44, from: 1346863758, hz: 140 }],                             // front HPF 94 -> 140 (tighten the clipper input)
    54: [{ addr: 54, from: 1346863334, type: 'PEAK', hz: 260, gainDb: 3.0 }],  // POST restore (+3 dB @260) for the pipeline loss
    56: [{ addr: 56, from: 1359203050, gainDb: -4.0 }],                        // -12 -> -4 (halve the post attenuation)
  },
};

/** plain (non-PEQ) register patches: DRIVE +5dB (0.5dB/LSB), VOL2 -1.5dB (0.25dB/LSB) */
const PLAIN: Record<string, Record<number, [number, number]>> = {
  twin: { 79: [8, 18], 81: [284, 278] },
  jtm45c: { 79: [10, 20], 81: [270, 264] },
  ts808_g: { 51: [280, 284] },   // Level -2.0 -> -1.0 dB
  rat: { 51: [280, 284] },
};

let n = 0, bad = 0;
for (const [model, addrs] of Object.entries(PATCHES)) {
  console.log(`\n### ${model}`);
  for (const [addr, list] of Object.entries(addrs)) {
    const p = list[0];
    const nw = patchWord(p.from, p);
    // round-trip check
    const back = dec(nw);
    const wantHz = p.hz ?? PEQ_FREQ_TABLE[(p.from >>> 3) & 0x1ff];
    const wantG = p.gainDb ?? (-24 + ((p.from >>> 12) & 0xff) * 0.2);
    const ok = Math.abs(PEQ_FREQ_TABLE[(nw >>> 3) & 0x1ff] - wantHz) / wantHz < 0.03
            && Math.abs((-24 + ((nw >>> 12) & 0xff) * 0.2) - wantG) < 0.25;
    n++; if (!ok) bad++;
    console.log(`  reg ${addr}: ${p.from} -> ${nw}   [${dec(p.from)}  =>  ${back}] ${ok ? '' : '  <<< MISMATCH'}`);
  }
  for (const [addr, [f, t]] of Object.entries(PLAIN[model])) {
    console.log(`  reg ${addr}: ${f} -> ${t}   [plain]`);
  }
}
console.log(`\nroundtrip: ${n} words checked, ${bad} failed`);
if (bad) process.exit(1);
console.log('DONE');
