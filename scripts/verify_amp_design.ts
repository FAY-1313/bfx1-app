/**
 * P1 箱头参数移植 —— 数据级回归验证
 * 校验 amp_params2.ts 四张表的结构完整性 + C1/C2/C5/C6/C8/C9 口径落地情况。
 * 用法:
 *   node ./node_modules/esbuild/bin/esbuild scripts/verify_amp_design.ts --bundle --platform=node --format=cjs --outfile=scripts/_va.cjs
 *   node ./scripts/_va.cjs
 */
import { AMP_PRE_EQ2, AMP_POST16_2, AMP_FORMULAS2, AMP_DEFAULTS2 } from '../src/data/_gen/amp_params2';
import { getLegacyLinkedDefs, PEQ_FREQ_TABLE, PEQ_Q_TABLE, PEQ_S_TABLE } from '../src/data/parameterMap';

let pass = 0;
const fails: string[] = [];
const ok = (c: boolean, m: string) => { if (c) pass++; else fails.push(m); };
const fail = (m: string) => { fails.push(m); };

const dec = (v: number) => ({
  t: v & 7,
  fi: (v >>> 3) & 0x1FF,
  gi: (v >>> 12) & 0xFF,
  qi: (v >>> 20) & 0x7F,
  si: (v >>> 27) & 0x1F,
});
const dbOf = (gi: number) => gi * 0.2 - 24;
const qIdx = (q: number) => PEQ_Q_TABLE.reduce((b, x, i) => (Math.abs(x - q) < Math.abs(PEQ_Q_TABLE[b] - q) ? i : b), 0);
const sIdx = (s: number) => PEQ_S_TABLE.reduce((b, x, i) => (Math.abs(x - s) < Math.abs(PEQ_S_TABLE[b] - s) ? i : b), 0);
const SHELF = [1, 2];
const POST_REGS = Array.from({ length: 16 }, (_, i) => 83 + i);

const keys = Object.keys(AMP_DEFAULTS2);
console.log(`键数: ${keys.length}`);

// ── V1 四表键集一致 ─────────────────────────────────────────────
ok(keys.length === 78, `V1 键数应为 78, 实际 ${keys.length}`);
for (const t of [AMP_PRE_EQ2, AMP_POST16_2, AMP_FORMULAS2]) {
  const k2 = Object.keys(t);
  ok(k2.length === keys.length && k2.every((k) => keys.includes(k)),
    `V1 ${'表'} 键集不一致 (${k2.length})`);
}

const cleanKeys: string[] = [];
for (const key of keys) {
  const pre = AMP_PRE_EQ2[key], post = AMP_POST16_2[key], form = AMP_FORMULAS2[key], def = AMP_DEFAULTS2[key];

  // ── V2 Pre4 4 段 + Post16 16 段 ───────────────────────────────
  ok(pre && pre.regs.length === 4 && pre.values.length === 4, `V2 ${key} Pre4 段数异常`);
  ok(Object.keys(post).length === 16, `V2 ${key} Post16 段数=${Object.keys(post).length}`);

  // ── V3 编码可解 + 量程 ───────────────────────────────────────
  for (const [tag, arr] of [['Pre4', pre.values], ['Post16', POST_REGS.map((r) => post[r])]] as const) {
    for (const v of arr as number[]) {
      ok(Number.isInteger(v) && v >= 0 && v <= 0xFFFFFFFF, `V3 ${key} ${tag} 越界 uint32: ${v}`);
      const d = dec(v);
      ok(d.t <= 7, `V3 ${key} ${tag} 类型码非法 ${d.t}`);
      ok(d.fi < PEQ_FREQ_TABLE.length, `V3 ${key} ${tag} 频点索引越界 ${d.fi}`);
      ok(d.qi < PEQ_Q_TABLE.length && d.si < PEQ_S_TABLE.length, `V3 ${key} ${tag} Q/S 索引越界`);
      ok(Math.abs(dbOf(d.gi)) <= 10.001, `V3 ${key} ${tag} 增益越 ±10dB: ${dbOf(d.gi).toFixed(1)}`);
    }
  }

  // ── V4 shelf Q=1.0 / S=0.71 ; REG77 = LPF_1st (C8/C2) ────────
  for (const r of POST_REGS) {
    const d = dec(post[r]);
    if (SHELF.includes(d.t)) {
      ok(d.qi === qIdx(1.0), `V4 ${key} reg${r} shelf 段 Q≠1.0 (idx ${d.qi})`);
      ok(d.si === sIdx(0.71), `V4 ${key} reg${r} shelf 段 S≠0.71 (idx ${d.si})`);
    }
    ok(d.t !== 6, `V4 ${key} reg${r} 不应出现 HPF_1st`);
  }
  ok(dec(pre.values[3]).t === 7, `V4 ${key} Pre4 REG77 应为 LPF_1st(7), 实际 ${dec(pre.values[3]).t}`);
  ok(dec(pre.values[3]).gi === 120, `V4 ${key} Pre4 REG77 增益应为 0dB`);

  // ── V5 旋钮 noon 与寄存器一致 (C9) ───────────────────────────
  for (const [label, list] of Object.entries(form)) {
    for (const f of list) {
      ok(f.min <= f.max, `V9 ${key} ${label} min>max`);
      const n0 = def.knobs[label];
      const at = f.compute(n0);
      const expect = def.allRegs[f.regAddr];
      ok(at === expect, `V5 ${key} ${label} compute(初值 ${n0}) = ${at} ≠ allRegs[${f.regAddr}](${expect})`);
      if (f.regAddr >= 83 && f.regAddr <= 98) {
        ok(f.compute(0.5) === expect, `V5 ${key} ${label} 音色旋钮 noon ≠ allRegs[${f.regAddr}]`);
      }
      ok(f.compute(0) === f.compute(0) && f.compute(1) === f.compute(1), `V5 ${key} ${label} compute NaN`);
      const lo = <number>f.compute(0), hi = <number>f.compute(1);
      if (f.regAddr >= 83 && f.regAddr <= 98) {
        ok(lo <= hi, `V5 ${key} ${label} compute(0) > compute(1)`);
        // APK 权威 (registerMap.normToPeqGain / dbToPeqGain): noon=设计值, ±12dB, gainIndex 钳 0~180
        const gLo = dec(lo).gi, gHi = dec(hi).gi;
        ok(gLo >= 0 && gLo <= 180 && gHi >= 0 && gHi <= 180,
          `V5 ${key} ${label} 端点 gainIndex 越 0~180 (${gLo}, ${gHi})`);
        const noonDb = dbOf(dec(f.compute(0.5)).gi);
        if (noonDb < 12) {   // noon 未顶到上钳位时才可反推设计值
          const wantLo = Math.max(-24, noonDb - 12), wantHi = Math.min(12, noonDb + 12);
          ok(Math.abs(dbOf(gLo) - wantLo) < 1e-9 && Math.abs(dbOf(gHi) - wantHi) < 1e-9,
            `V5 ${key} ${label} 端点 ≠ 设计±12dB (${dbOf(gLo).toFixed(1)}, ${dbOf(gHi).toFixed(1)}) 期望 (${wantLo}, ${wantHi})`);
        }
      }
    }
    // 旋钮 regAddr 合法域
    for (const f of list) {
      ok(f.regAddr === 79 || f.regAddr === 81 || f.regAddr === 239 || (f.regAddr >= 83 && f.regAddr <= 98),
        `V7 ${key} ${label} regAddr ${f.regAddr} 越界`);
    }
    // 旋钮初值 = noon
    const n = def.knobs[label];
    ok(n !== undefined && n >= 0 && n <= 1, `V7 ${key} ${label} 初值缺/越界`);
    ok(Math.abs(n! - 0.5) < 1e-9 || list[0].regAddr === 79 || list[0].regAddr === 81,
      `V9 ${key} ${label} 音色旋钮初值应 0.5, 实际 ${n}`);
  }

  // ── V6 CLEAN 语义 (C5-1) ─────────────────────────────────────
  const isClean = def.allRegs[78] === 1;
  if (isClean) {
    cleanKeys.push(key);
    ok(def.allRegs[79] === 0, `V6 ${key} CLEAN 头 GAIN 寄存器应为 0, 实际 ${def.allRegs[79]}`);
    ok(def.knobs['GAIN'] === 0, `V6 ${key} CLEAN 头 GAIN 旋钮应为 0, 实际 ${def.knobs['GAIN']}`);
  } else {
    ok(def.allRegs[79] >= 0 && def.allRegs[79] <= 92, `V6 ${key} Drive 越 0-92: ${def.allRegs[79]}`);
  }
  ok(def.allRegs[73] === 0, `V6 ${key} reg73 应为 0 (PrePEQ 不旁路)`);

  // ── V8 allRegs / hidden 完整性 (C6) ──────────────────────────
  for (let r = 72; r <= 98; r++) ok(def.allRegs[r] !== undefined, `V8 ${key} allRegs 缺 reg${r}`);
  ok(def.allRegs[239] === 250, `V8 ${key} MASTER reg239 应 250`);
  ok(def.hidden[80] === def.allRegs[80], `V8 ${key} hidden[80] ≠ allRegs[80] (DC_ADJ)`);
  ok(def.hidden[239] === 250, `V8 ${key} hidden[239] 应 250`);
  ok(def.allRegs[81] >= 248 && def.allRegs[81] <= 288, `V8 ${key} Volume 越 APK 量程 248-288: ${def.allRegs[81]}`);
  ok(def.brand.length > 0, `V8 ${key} brand 空`);
}

// ── V10 CLEAN 开关只写 reg78 (C5-1) ────────────────────────────
const cleanDefs = (getLegacyLinkedDefs('amp-head', 'CLEAN') ?? []) as Array<{ regAddr: number }>;
ok(cleanDefs.length === 1 && cleanDefs[0].regAddr === 78,
  `V10 amp-head CLEAN 应只指向 reg78, 实际 [${cleanDefs.map((d) => d.regAddr).join(',')}]`);

console.log(`CLEAN 头键数: ${cleanKeys.length}`);
console.log(`\n${fails.length === 0 ? 'ALL PASS' : 'FAIL'} — pass ${pass} / fail ${fails.length}`);
for (const f of fails.slice(0, 40)) console.log('  ✗ ' + f);
if (fails.length > 40) console.log(`  ... 另有 ${fails.length - 40} 条`);
if (fails.length) process.exitCode = 1;
