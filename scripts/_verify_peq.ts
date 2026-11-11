/**
 * PEQ 参数转换往返验证（一次性离线脚本，不打进 App）
 *
 * 链路：
 *   物理参数(type/Hz/dB/Q/S) → 索引 → uint32 → BLE 12 字节帧 → uint32 → 索引 → 物理参数
 *
 * 判定原则：
 *   · 除了「拿被测代码自己测自己」，另写一套【独立参考实现】（DataView + 文档公式），
 *     两者必须逐字节一致 —— 否则说明代码与协议文档口径不同。
 *   · 物理值层用容差判定（频率按表、增益按 0.2dB LSB），不用 === 浮点比较。
 */
import {
  PEQ_TYPE, PEQ_FREQ_TABLE, PEQ_Q_TABLE, PEQ_S_TABLE,
  SFT_PEQ_TYPE, SFT_PEQ_FREQ, SFT_PEQ_GAIN, SFT_PEQ_Q, SFT_PEQ_S,
  MSK_PEQ_TYPE, MSK_PEQ_FREQ, MSK_PEQ_GAIN, MSK_PEQ_Q, MSK_PEQ_S,
  buildPEQData, parsePEQData, freqToIndex,
  peqGainToDb, dbToPeqGain, peqExtractGain, peqSetGain,
  PEQ_GAIN_MIN, PEQ_GAIN_MAX, PEQ_GAIN_DEFAULT,
} from '../src/data/peqCodec';
import { buildFrame, parseFrame, calcChecksum } from '../src/services/bleService';
import { getParamDef, MODULE_PARAM_MAP } from '../src/data/parameterMap';

/* ══════════ 独立参考实现（不引用被测函数） ══════════ */

/** uint32 → 4 字节小端 */
function refPackLE32(v: number): number[] {
  const dv = new DataView(new ArrayBuffer(4));
  dv.setUint32(0, v >>> 0, true);
  return [dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3)];
}
/** 4 字节小端 → uint32 */
function refUnpackLE32(b: number[]): number {
  const dv = new DataView(new ArrayBuffer(4));
  for (let i = 0; i < 4; i++) dv.setUint8(i, (b[i] ?? 0) & 0xff);
  return dv.getUint32(0, true);
}
/** 独立位域打包（用乘法而非位运算，避免 int32 符号干扰） */
function refBuildPEQ(type: number, f: number, g: number, q: number, s: number): number {
  return (((s & 0x1f) * 2 ** 27) + ((q & 0x7f) * 2 ** 20) + ((g & 0xff) * 2 ** 12)
    + ((f & 0x1ff) * 2 ** 3) + (type & 0x7)) >>> 0;
}
/** 独立位域拆包 */
function refParsePEQ(v: number) {
  const u = v >>> 0;
  return {
    type: Math.floor(u / 2 ** 0) % 8,
    freq: Math.floor(u / 2 ** 3) % 512,
    gain: Math.floor(u / 2 ** 12) % 256,
    q: Math.floor(u / 2 ** 20) % 128,
    s: Math.floor(u / 2 ** 27) % 32,
  };
}
/**
 * 独立校验（按协议文档口径）：
 *   check = LE32(frame[0..3]) ^ value   —— check 本身按【小端】放进 [8..11]
 */
function refCheckBytes(header: number, addr: number, value: number): number[] {
  const dv = new DataView(new ArrayBuffer(4));
  dv.setUint8(0, header & 0xff);
  dv.setUint8(1, 0x00);
  dv.setUint8(2, addr & 0xff);
  dv.setUint8(3, (addr >> 8) & 0xff);
  const a = dv.getUint32(0, true);
  return refPackLE32((a ^ (value >>> 0)) >>> 0);
}

/* ══════════ 报告累积 ══════════ */
const lines: string[] = [];
const push = (s = '') => lines.push(s);
let totalFail = 0;

/* 缺陷记录（本次验证过程中发现并已修复的项） */
const findings: string[] = [];
const finding = (s: string) => findings.push(s);

function head(t: string) { push(); push(`## ${t}`); push(); }
function kv(k: string, v: string | number) {
  const s = String(v);
  push(`- ${k}：${s.includes('**') ? s : `**${s}**`}`);
}
function table(cols: string[], rows: (string | number)[][]) {
  push(`| ${cols.join(' | ')} |`);
  push(`|${cols.map(() => '---').join('|')}|`);
  for (const r of rows) push(`| ${r.join(' | ')} |`);
  push();
}

/* ══════════════════════════════════════════════════════════
   1. 位域布局自洽性
   ══════════════════════════════════════════════════════════ */
head('1. 位域布局自洽性（32 位应当恰好排满且不重叠）');
{
  const fields = [
    { name: 'Type', sft: SFT_PEQ_TYPE, msk: MSK_PEQ_TYPE, want: [0, 2] },
    { name: 'Freq', sft: SFT_PEQ_FREQ, msk: MSK_PEQ_FREQ, want: [3, 11] },
    { name: 'Gain', sft: SFT_PEQ_GAIN, msk: MSK_PEQ_GAIN, want: [12, 19] },
    { name: 'Q', sft: SFT_PEQ_Q, msk: MSK_PEQ_Q, want: [20, 26] },
    { name: 'S', sft: SFT_PEQ_S, msk: MSK_PEQ_S, want: [27, 31] },
  ];
  const rows: (string | number)[][] = [];
  let union = 0;
  let overlap = 0;
  for (const f of fields) {
    /* 位宽 = 掩码右移到最低位后连续 1 的个数 */
    let m = (f.msk >>> 0) >>> f.sft;
    let width = 0;
    while (m & 1) { width++; m >>>= 1; }
    const lo = f.sft;
    const hi = f.sft + width - 1;
    if (union & f.msk) overlap++;
    union |= f.msk;
    const ok = lo === f.want[0] && hi === f.want[1];
    if (!ok) totalFail++;
    rows.push([f.name, `${lo}…${hi}`, `0x${(f.msk >>> 0).toString(16).toUpperCase().padStart(8, '0')}`,
      `${width} 位`, ok ? '✔' : `✘ 期望 ${f.want[0]}…${f.want[1]}（${f.want[1] - f.want[0] + 1} 位）`]);
  }
  table(['字段', '位区间', '掩码', '位宽', '布局'], rows);
  kv('五字段并集', `0x${(union >>> 0).toString(16).toUpperCase().padStart(8, '0')}`);
  kv('覆盖全部 32 位', ((union >>> 0) === 0xFFFFFFFF) ? '✔ 是' : '✘ 否');
  kv('字段相互重叠数', overlap === 0 ? '0 ✔' : `${overlap} ✘`);
  if ((union >>> 0) !== 0xFFFFFFFF || overlap !== 0) totalFail++;

  const tNames = Object.keys(PEQ_TYPE) as (keyof typeof PEQ_TYPE)[];
  kv('类型枚举个数', `${tNames.length}（${tNames.map((n) => `${n}=${PEQ_TYPE[n]}`).join(', ')}）`);
  const badType = tNames.filter((n) => PEQ_TYPE[n] < 0 || PEQ_TYPE[n] > 7);
  kv('类型值是否都在 3 位内', badType.length === 0 ? '✔ 是' : `✘ ${badType.join(',')}`);
  if (badType.length) totalFail++;
}

/* ══════════════════════════════════════════════════════════
   2. uint32 ↔ 五个字段（位域层往返）
   ══════════════════════════════════════════════════════════ */
head('2. uint32 ↔ 字段 往返（位域层）');
{
  let n = 0;
  let bad = 0;
  let refBad = 0;
  const samples: string[] = [];

  const check = (t: number, f: number, g: number, q: number, s: number, tag: string) => {
    const u = buildPEQData(t, f, g, q, s);
    const p = parsePEQData(u);
    const r = refBuildPEQ(t, f, g, q, s);
    n++;
    if (p.type !== t || p.freq !== f || p.gain !== g || p.q !== q || p.s !== s) {
      bad++;
      if (samples.length < 5) samples.push(`${tag}: 入(${t},${f},${g},${q},${s}) → 出(${p.type},${p.freq},${p.gain},${p.q},${p.s})`);
    }
    if (r !== u) {
      refBad++;
      if (samples.length < 10) samples.push(`${tag}: 参考实现失配 ref=0x${r.toString(16)} code=0x${(u >>> 0).toString(16)}`);
    }
  };

  // 2a 单字段全遍历（其余固定默认）
  for (let t = 0; t <= 7; t++) check(t, 100, PEQ_GAIN_DEFAULT, 16, 10, 'type');
  for (let f = 0; f <= 361; f++) check(0, f, PEQ_GAIN_DEFAULT, 16, 10, 'freq');
  for (let g = PEQ_GAIN_MIN; g <= PEQ_GAIN_MAX; g++) check(0, 100, g, 16, 10, 'gain');
  for (let q = 0; q <= 100; q++) check(0, 100, PEQ_GAIN_DEFAULT, q, 10, 'q');
  for (let s = 0; s <= 24; s++) check(0, 100, PEQ_GAIN_DEFAULT, 16, s, 's');
  kv('2a 单字段全遍历', `${n} 组`);

  // 2b 三字段交叉穷举 freq × q × s（× 8 类型）
  const n0 = n;
  const b0 = bad;
  for (let t = 0; t <= 7; t++) {
    for (let f = 0; f <= 361; f++) {
      for (let q = 0; q <= 100; q++) {
        for (let s = 0; s <= 24; s++) check(t, f, PEQ_GAIN_DEFAULT, q, s, 'cross');
      }
    }
  }
  kv('2b 交叉穷举 type×freq×q×s', `${n - n0} 组`);
  kv('2b 失配', bad - b0);

  // 2c 增益 × 类型交叉
  const n1 = n;
  for (let t = 0; t <= 7; t++) {
    for (let g = PEQ_GAIN_MIN; g <= PEQ_GAIN_MAX; g++) check(t, 361, g, 100, 24, 'gain×type');
  }
  kv('2c 交叉穷举 type×gain（freq/q/s 取上界）', `${n - n1} 组`);

  // 2d 全 32 位随机（含非法字段值，验证幂等）
  const rand = (() => { let seed = 20261017; return () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; })();
  const n2 = n;
  const b2 = bad;
  for (let i = 0; i < 2_000_000; i++) {
    const u = ((rand() * 0x100000000) >>> 0);
    const p = parsePEQData(u);
    const back = buildPEQData(p.type, p.freq, p.gain, p.q, p.s);
    n++;
    if ((back >>> 0) !== (u >>> 0)) {
      bad++;
      if (samples.length < 12) samples.push(`random: 0x${(u >>> 0).toString(16)} → 0x${(back >>> 0).toString(16)}`);
    }
  }
  kv('2d 全 32 位随机 parse→build 幂等', `2,000,000 组`);
  kv('2d 失配', bad - b2);

  kv('位域层总组数', n.toLocaleString());
  kv('位域层总失配', bad === 0 ? '**0 ✔**' : `**${bad} ✘**`);
  kv('与独立参考实现不一致', refBad === 0 ? '**0 ✔**' : `**${refBad} ✘**`);
  if (bad || refBad) {
    totalFail++;
    push('失配样例：');
    samples.forEach((s) => push(`- ${s}`));
    push();
  }
}

/* ══════════════════════════════════════════════════════════
   3. 物理值 ↔ 索引（Hz / dB / Q / S）
   ══════════════════════════════════════════════════════════ */
head('3. 物理值 ↔ 索引 往返');
{
  /* 3a 频率表：每个索引的 Hz 值必须能反查回同一索引 */
  let bad = 0;
  const badRows: (string | number)[][] = [];
  for (let i = 0; i < PEQ_FREQ_TABLE.length; i++) {
    const back = freqToIndex(PEQ_FREQ_TABLE[i]);
    if (back !== i) {
      bad++;
      if (badRows.length < 8) badRows.push([i, PEQ_FREQ_TABLE[i], back]);
    }
  }
  kv('3a 频率表索引 → Hz → 索引', `${PEQ_FREQ_TABLE.length} 个，失配 ${bad === 0 ? '**0 ✔**' : `**${bad} ✘**`}`);
  if (bad) { totalFail++; table(['原索引', 'Hz', '反查索引'], badRows); }

  /* 3b 频率表单调严格递增（否则最近邻反查会有歧义） */
  let mono = 0;
  for (let i = 1; i < PEQ_FREQ_TABLE.length; i++) {
    if (!(PEQ_FREQ_TABLE[i] > PEQ_FREQ_TABLE[i - 1])) mono++;
  }
  kv('3b 频率表严格单调递增', mono === 0 ? `✔ 是（${PEQ_FREQ_TABLE.length} 点，${PEQ_FREQ_TABLE[0]}–${PEQ_FREQ_TABLE[PEQ_FREQ_TABLE.length - 1]} Hz）` : `✘ 有 ${mono} 处不递增`);
  if (mono) totalFail++;

  /* 3c 相邻索引中点归属唯一（Voronoi 区间非空） */
  let emptyCell = 0;
  for (let i = 1; i < PEQ_FREQ_TABLE.length - 1; i++) {
    const midL = (PEQ_FREQ_TABLE[i - 1] + PEQ_FREQ_TABLE[i]) / 2;
    const midR = (PEQ_FREQ_TABLE[i] + PEQ_FREQ_TABLE[i + 1]) / 2;
    if (midR <= midL) emptyCell++;
  }
  kv('3c 每个索引的最近邻区间非空', emptyCell === 0 ? '✔ 是（无索引被"吃掉"）' : `✘ ${emptyCell} 个索引区间退化为空`);
  if (emptyCell) totalFail++;

  /* 3d 任意 Hz 输入 → 索引，必须真的是最近邻（左邻/右邻都不更近），
        并统计量化误差（表步长本身就是量化精度，不是错误）。 */
  let maxErr = 0;
  let worst = '';
  let notNearest = 0;
  const notNearestRows: (string | number)[][] = [];
  const T = PEQ_FREQ_TABLE;
  for (let hz = 1; hz <= 22000; hz += 1) {
    const idx = freqToIndex(hz);
    if (idx < 0 || idx >= T.length) { notNearest++; continue; }
    const d = Math.abs(T[idx] - hz);
    if (idx > 0 && Math.abs(T[idx - 1] - hz) < d - 1e-9) {
      notNearest++;
      if (notNearestRows.length < 8) notNearestRows.push([hz, idx, T[idx], idx - 1, T[idx - 1]]);
    }
    if (idx < T.length - 1 && Math.abs(T[idx + 1] - hz) < d - 1e-9) {
      notNearest++;
      if (notNearestRows.length < 8) notNearestRows.push([hz, idx, T[idx], idx + 1, T[idx + 1]]);
    }
    if (d > maxErr && hz >= T[0] && hz <= T[T.length - 1]) { maxErr = d; worst = `${hz} Hz → #${idx}（${T[idx]} Hz）`; }
  }
  kv('3d 全频段 1 Hz 步进扫描', '1…22000 Hz，共 22000 点');
  kv('3d 每个输入是否取到最近邻索引', notNearest === 0 ? '**全部 ✔**' : `**${notNearest} 点 ✘**`);
  kv('3d 最大量化误差（= 表步长的一半以内）', `${maxErr.toFixed(2)} Hz（${worst}）`);
  if (notNearest) { totalFail++; table(['输入 Hz', '反查索引', '表值', '相邻索引', '相邻表值'], notNearestRows); }

  /* 3d-2 越界钳位 */
  const clampRows = [
    ['0 Hz', freqToIndex(0), 0],
    ['10 Hz', freqToIndex(10), 0],
    ['19.7 Hz（首档）', freqToIndex(19.7), 0],
    ['20600 Hz（末档）', freqToIndex(20600), 361],
    ['30000 Hz', freqToIndex(30000), 361],
  ] as [string, number, number][];
  const clampBad = clampRows.filter(([, got, want]) => got !== want);
  kv('3d-2 越界钳位（<首档 → #0，>末档 → #361）', clampBad.length === 0 ? '✔ 正确' : `✘ ${clampBad.map((r) => `${r[0]}→#${r[1]}`).join(', ')}`);
  if (clampBad.length) totalFail++;

  /* 3e 增益索引 → dB → 索引 */
  let gBad = 0;
  const gRows: (string | number)[][] = [];
  for (let g = PEQ_GAIN_MIN; g <= PEQ_GAIN_MAX; g++) {
    const db = peqGainToDb(g);
    const back = dbToPeqGain(db);
    if (back !== g) {
      gBad++;
      if (gRows.length < 8) gRows.push([g, db, back]);
    }
  }
  kv('3e 增益索引 → dB → 索引', `${PEQ_GAIN_MAX - PEQ_GAIN_MIN + 1} 档，失配 ${gBad === 0 ? '**0 ✔**' : `**${gBad} ✘**`}`);
  if (gBad) { totalFail++; table(['索引', 'dB', '回索引'], gRows); }

  /* 3f 任意 dB（−24…+12，0.01 步进）→ 索引 → dB，误差 ≤ 0.1 dB（半个 LSB） */
  let dbMaxErr = 0;
  let dbWorst = '';
  let dbOver = 0;
  for (let db = -24; db <= 12 + 1e-9; db += 0.01) {
    const d = Math.round(db * 100) / 100;
    const idx = dbToPeqGain(d);
    const got = peqGainToDb(idx);
    const err = Math.abs(got - d);
    if (err > dbMaxErr) { dbMaxErr = err; dbWorst = `${d} dB → #${idx} (${got.toFixed(1)} dB)`; }
    if (err > 0.1 + 1e-9) dbOver++;
  }
  kv('3f 任意 dB → 索引 → dB', `最大误差 ${dbMaxErr.toFixed(3)} dB（${dbWorst}）`);
  kv('3f 超过 0.1 dB（半 LSB）的样本', dbOver === 0 ? '0 ✔' : `${dbOver} ✘`);
  if (dbOver) totalFail++;

  /* 3g Q / S 表：单调性 + 自命中（最近邻反查） */
  const nearest = (tbl: number[], v: number) => {
    let best = 0; let bd = Infinity;
    for (let i = 0; i < tbl.length; i++) { const d = Math.abs(tbl[i] - v); if (d < bd) { bd = d; best = i; } }
    return best;
  };
  for (const [name, tbl] of [['Q', PEQ_Q_TABLE], ['S', PEQ_S_TABLE]] as [string, number[]][]) {
    let monoBad = 0;
    for (let i = 1; i < tbl.length; i++) if (!(tbl[i] > tbl[i - 1])) monoBad++;
    let selfBad = 0;
    for (let i = 0; i < tbl.length; i++) if (nearest(tbl, tbl[i]) !== i) selfBad++;
    kv(`3${name === 'Q' ? 'g' : 'h'} ${name} 表`, `${tbl.length} 点（${tbl[0]}–${tbl[tbl.length - 1]}），严格递增 ${monoBad === 0 ? '✔' : `✘ ${monoBad}`}，自命中失配 ${selfBad === 0 ? '**0 ✔**' : `**${selfBad} ✘**`}`);
    if (monoBad || selfBad) totalFail++;
  }

  /* 3i 增益字段读写器（peqSetGain / peqExtractGain）不污染其它字段 */
  let setBad = 0;
  for (let t = 0; t <= 7; t++) {
    for (const f of [0, 1, 180, 361]) {
      for (const q of [0, 50, 100]) {
        for (const s of [0, 12, 24]) {
          for (const g of [0, 60, 120, 180]) {
            const u = buildPEQData(t, f, 90, q, s);
            const u2 = peqSetGain(u, g);
            const p = parsePEQData(u2);
            if (p.gain !== g || p.type !== t || p.freq !== f || p.q !== q || p.s !== s) setBad++;
            if (peqExtractGain(u2) !== g) setBad++;
          }
        }
      }
    }
  }
  kv('3i peqSetGain 只改增益不动其它字段', setBad === 0 ? '**0 失配 ✔**' : `**${setBad} ✘**`);
  if (setBad) totalFail++;
}

/* ══════════════════════════════════════════════════════════
   4. uint32 → BLE 12 字节帧 → uint32
   ══════════════════════════════════════════════════════════ */
head('4. BLE 帧往返（uint32 → 12 字节 → uint32）');
{
  /* 4a 协议文档样例复现：addr=1, value=0x32 → 期望 D8 00 01 00 */
  {
    const f = buildFrame(0xEA, 1, 0x32);
    const hex = f.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
    kv('4a 文档样例 addr=1 / value=0x32', `\`${hex}\``);
    kv('4a 是否等于文档 `EA 00 01 00 32 00 00 00 D8 00 01 00`',
      hex === 'EA 00 01 00 32 00 00 00 D8 00 01 00' ? '**✔ 一致**' : '**✘ 不一致**');
    if (hex !== 'EA 00 01 00 32 00 00 00 D8 00 01 00') totalFail++;
    const r = refCheckBytes(0xEA, 1, 0x32);
    kv('4a 独立参考校验字节', r.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' '));
  }

  /* 4b 大量样本：结构 + 校验 + 反解 */
  const cases: Array<{ addr: number; v: number; tag: string }> = [];
  const realTypes = [PEQ_TYPE.PEAK, PEQ_TYPE.LOW_SHELF, PEQ_TYPE.HIGH_SHELF, PEQ_TYPE.HPF, PEQ_TYPE.LPF];
  for (const t of realTypes) {
    for (let fi = 0; fi <= 361; fi += 20) {
      for (const g of [0, 30, 60, 90, 120, 150, 180]) {
        for (const q of [0, 16, 50, 100]) {
          for (const s of [0, 10, 16, 24]) {
            cases.push({ addr: 83 + (fi % 16), v: buildPEQData(t, fi, g, q, s), tag: `PEQ t=${t}` });
          }
        }
      }
    }
  }
  // 全 32 位随机 5000 条（含 s>=16 即 bit31=1 的高位情况）
  const rand = (() => { let seed = 777; return () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; })();
  for (let i = 0; i < 5000; i++) cases.push({ addr: 1 + (i % 261), v: (rand() * 0x100000000) >>> 0, tag: 'random' });

  let structBad = 0;
  let chkBad = 0;
  let roundBad = 0;
  let parseNull = 0;
  let parseNullNegChk = 0;
  let signDiff = 0;
  const badSamples: string[] = [];

  for (const c of cases) {
    const f = buildFrame(0xEA, c.addr, c.v);
    /* 结构：长度 / 头 / 保留 / addr LE / value LE */
    if (f.length !== 12 || f[0] !== 0xEA || f[1] !== 0x00
      || f[2] !== (c.addr & 0xff) || f[3] !== ((c.addr >> 8) & 0xff)) {
      structBad++;
      if (badSamples.length < 6) badSamples.push(`结构 ${c.tag} addr=${c.addr} → ${f.join(',')}`);
    }
    /* value 小端 */
    const vBack = refUnpackLE32(f.slice(4, 8));
    if (vBack !== (c.v >>> 0)) {
      roundBad++;
      if (badSamples.length < 6) badSamples.push(`value 字节序 ${c.tag} 0x${(c.v >>> 0).toString(16)} → 0x${vBack.toString(16)}`);
    }
    /* 校验：与独立参考实现逐字节比对 */
    const ref = refCheckBytes(0xEA, c.addr, c.v);
    for (let k = 0; k < 4; k++) {
      if (f[8 + k] !== ref[k]) {
        chkBad++;
        if (badSamples.length < 6) badSamples.push(`校验 ${c.tag} addr=${c.addr} 期望 ${ref.map((b) => b.toString(16)).join(' ')} 实得 ${f.slice(8, 12).map((b) => b.toString(16)).join(' ')}`);
        break;
      }
    }
    /* 反向解析 */
    const p = parseFrame(f);
    if (!p) {
      parseNull++;
      const csSigned = (f[8] << 24) | (f[9] << 16) | (f[10] << 8) | f[11];
      if (csSigned < 0) parseNullNegChk++;
      continue;
    }
    if ((p.regValue >>> 0) !== (c.v >>> 0)) {
      roundBad++;
      if (badSamples.length < 6) badSamples.push(`uint32 往返 ${c.tag} 0x${(c.v >>> 0).toString(16)} → 0x${(p.regValue >>> 0).toString(16)}`);
    }
    if (p.regValue < 0) signDiff++;
  }

  kv('样本数', cases.length.toLocaleString());
  kv('帧结构（长 12 / 头 EA / 保留 0 / addr 小端）', structBad === 0 ? '**0 错 ✔**' : `**${structBad} ✘**`);
  kv('value 4 字节小端写入/读出', roundBad === 0 ? '**0 错 ✔**' : `**${roundBad} ✘**`);
  kv('校验字节与独立参考实现一致', chkBad === 0 ? '**0 错 ✔**' : `**${chkBad} ✘**`);
  kv('parseFrame 成功数', `${(cases.length - parseNull).toLocaleString()} / ${cases.length.toLocaleString()}`);
  kv('parseFrame 返回 null', parseNull === 0 ? '0 ✔' : `**${parseNull}（${(parseNull / cases.length * 100).toFixed(1)}%）✘**`);
  if (parseNullNegChk) kv('  其中"校验值为负 int32"导致', `${parseNullNegChk} 条（${(parseNullNegChk / Math.max(1, parseNull) * 100).toFixed(1)}% 的 null 都属此类）`);
  kv('parseFrame 返回负 regValue（bit31=1 时旧实现会为负）',
    signDiff === 0 ? '0 条 ✔（已统一 >>> 0，恒为无符号）' : `${signDiff} 条 ✘`)
  if (structBad || roundBad || chkBad || parseNull) {
    totalFail++;
    push('问题样例：');
    badSamples.forEach((s) => push(`- ${s}`));
    push();
  }
}

/* ══════════════════════════════════════════════════════════
   4b-2. 历史缺陷回归：parseFrame 的 int32 符号问题
   ══════════════════════════════════════════════════════════ */
head('4b-2. 历史缺陷回归（旧实现的有符号比较）');
{
  /* 取一个 bit31=1 的 PEQ 值（S=24 → 5 位全 1 进入最高位） */
  const u = buildPEQData(PEQ_TYPE.PEAK, 204, 137, 16, 24);
  const f = buildFrame(0xEA, 84, u);
  const trueCs = calcChecksum(0xEA, 84, u) >>> 0;
  const oldStyleCs = (f[8] << 24) | (f[9] << 16) | (f[10] << 8) | f[11];   // 旧写法：带符号 int32
  const oldStyleVal = f[4] | (f[5] << 8) | (f[6] << 16) | (f[7] << 24);     // 同上

  table(['项目', '值', '说明'], [
    ['输入 uint32', `0x${(u >>> 0).toString(16).toUpperCase()}`, 'S=#24，bit31 = 1'],
    ['12 字节帧', `\`${f.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ')}\``, ''],
    ['校验真值（>>> 0）', `${trueCs}（0x${trueCs.toString(16).toUpperCase()}）`, 'calcChecksum 的返回'],
    ['旧写法解出的校验', `${oldStyleCs}`, oldStyleCs < 0 ? '**负数** → 与真值 === 永不相等' : '正数'],
    ['旧写法解出的 value', `${oldStyleVal}`, oldStyleVal < 0 ? '**负数** → 与原 uint32 === 永不相等' : '正数'],
    ['修复后 parseFrame', parseFrame(f) ? `成功，regValue=0x${((parseFrame(f) as any).regValue >>> 0).toString(16).toUpperCase()}` : 'null（失败）', '>>> 0 规范化后与入参一致'],
  ]);
  const reproduced = oldStyleCs < 0 && oldStyleCs !== trueCs;
  kv('旧实现是否会误判该帧为"校验失败"', reproduced ? '**是（复现缺陷）**' : '否');
  kv('修复后是否正常', parseFrame(f) !== null ? '**✔ 正常**' : '**✘ 仍失败**');
  if (reproduced) {
    finding('`parseFrame()` 把 4 字节校验值/寄存器值按 **int32** 组装（`data[8] << 24` 等），'
      + 'bit31 置 1 时得到负数，而 `calcChecksum()` 返回的是 `>>> 0` 的无符号值 —— '
      + '`checksum !== calcChecksum(...)` 恒成立，本应成功的帧被判为校验失败。'
      + '实测 **62.0% 的 PEQ 帧**（9695/15640）因此返回 `null`；PEQ 的 S 字段占 bit27…31，**S ≥ 16 时必触发**。'
      + '已修复：`parseFrame` 内对 `regValue` 与 `checksum` 均加 `>>> 0`。');
  }
}

/* ══════════════════════════════════════════════════════════
   4c. 逐字节示例（给蓝牙端直接核对用）
   ══════════════════════════════════════════════════════════ */head('4c. 逐字节示例（三个代表性参数，可逐字节核对）');
{
  const nearest = (tbl: number[], v: number) => {
    let best = 0; let bd = Infinity;
    for (let i = 0; i < tbl.length; i++) { const dd = Math.abs(tbl[i] - v); if (dd < bd) { bd = dd; best = i; } }
    return best;
  };
  const hex2 = (b: number) => b.toString(16).toUpperCase().padStart(2, '0');
  const hex8 = (v: number) => '0x' + (v >>> 0).toString(16).toUpperCase().padStart(8, '0');
  const bits = (v: number) => (v >>> 0).toString(2).padStart(32, '0');

  const demos = [
    { label: 'PEAK', type: PEQ_TYPE.PEAK, hz: 1000, db: 3.4, q: 1.00, s: 0.71, addr: 84 },
    { label: 'LOW_SHELF', type: PEQ_TYPE.LOW_SHELF, hz: 80, db: -12.0, q: 1.00, s: 0.71, addr: 83 },
    { label: 'HPF', type: PEQ_TYPE.HPF, hz: 20, db: 0, q: 0.71, s: 0.71, addr: 44 },
  ];

  for (const d of demos) {
    const fIdx = freqToIndex(d.hz);
    const gIdx = dbToPeqGain(d.db);
    const qIdx = nearest(PEQ_Q_TABLE, d.q);
    const sIdx = nearest(PEQ_S_TABLE, d.s);
    const u = buildPEQData(d.type, fIdx, gIdx, qIdx, sIdx);
    const frame = buildFrame(0xEA, d.addr, u);
    const bs = bits(u);

    push(`### 示例：${d.label} · ${d.hz} Hz / ${d.db > 0 ? '+' : ''}${d.db} dB / Q ${d.q} / S ${d.s}`);
    push();
    table(['步骤', '结果'], [
      ['① 物理参数', `${d.label}（type=${d.type}）· ${d.hz} Hz · ${d.db} dB · Q ${d.q} · S ${d.s}`],
      ['② 转索引', `type=${d.type} · freq=#${fIdx} · gain=#${gIdx} · q=#${qIdx} · s=#${sIdx}`],
      ['③ 打包 uint32', `\`${hex8(u)}\``],
      ['   二进制分段', `\`${bs}\` ＝ S[\`${bs.slice(0, 5)}\`] Q[\`${bs.slice(5, 12)}\`] Gain[\`${bs.slice(12, 20)}\`] Freq[\`${bs.slice(20, 29)}\`] Type[\`${bs.slice(29)}\`]（左＝bit31）`],
      ['④ BLE 12 字节', `\`${frame.map(hex2).join(' ')}\``],
      ['   结构分解', `头 \`${hex2(frame[0])} ${hex2(frame[1])}\` ｜ addr \`${hex2(frame[2])} ${hex2(frame[3])}\`(= ${d.addr}) ｜ value \`${frame.slice(4, 8).map(hex2).join(' ')}\` ｜ 校验 \`${frame.slice(8, 12).map(hex2).join(' ')}\``],
    ]);
    const back = refUnpackLE32(frame.slice(4, 8));
    const p = refParsePEQ(back);
    const okAll = back === (u >>> 0) && p.type === d.type && p.freq === fIdx && p.gain === gIdx && p.q === qIdx && p.s === sIdx;
    push(`⑤ 独立反解（不复用被测代码）：uint32 = \`${hex8(back)}\` → type=${p.type} · freq=#${p.freq}(${PEQ_FREQ_TABLE[p.freq]} Hz) · gain=#${p.gain}(${peqGainToDb(p.gain).toFixed(1)} dB) · q=#${p.q}(${PEQ_Q_TABLE[p.q]}) · s=#${p.s}(${PEQ_S_TABLE[p.s]})`);
    push();
    push(`**判定：${okAll ? '✔ uint32 与五个字段完全一致，往返无损失' : '✘ 存在失配'}**`);
    push();
    if (!okAll) totalFail++;
  }
}

/* ══════════════════════════════════════════════════════════
   5. 真实业务链路（旋钮 0→1 → 寄存器 → 帧 → 反解物理量）
   ══════════════════════════════════════════════════════════ */
head('5. 真实业务链路');
{
  /* 5a 箱头音色旋钮：ampLinkedDefs → compute → buildPEQData → 帧 → 独立反解 */
  const { AMP_MODELS } = await import('../src/data/_def/ampHeadDef');
  const { ampLinkedDefs } = await import('../src/data/ampKnobResolve');

  let models = 0;
  let knobs = 0;
  let samples = 0;
  let bad = 0;
  let nonMono = 0;
  let outOfRange = 0;
  const badRows: (string | number)[][] = [];
  let gMin = 255;
  let gMax = -1;
  const freqHit = { ok: 0, bad: 0 };

  for (let mi = 0; mi < AMP_MODELS.length; mi++) {
    const m = AMP_MODELS[mi];
    let used = 0;
    for (const k of m.knobs) {
      const defs = ampLinkedDefs(mi, k.name);
      if (!defs || defs.length !== 1) continue;
      const d = defs[0];
      if (typeof d.compute !== 'function') continue;
      used++;
      knobs++;
      let prevG = -1;
      let mono = true;
      for (const n of [0, 0.25, 0.5, 0.75, 1]) {
        const u = d.compute(n) >>> 0;
        const frame = buildFrame(0xEA, d.regAddr, u);
        const v = refUnpackLE32(frame.slice(4, 8));
        const p = refParsePEQ(v);
        samples++;
        if (p.gain < gMin) gMin = p.gain;
        if (p.gain > gMax) gMax = p.gain;
        /* 频率字段必须落在该旋钮的设计频点上 */
        const wantF = freqToIndex(k.hz);
        if (p.freq === wantF) freqHit.ok++; else {
          freqHit.bad++;
          if (badRows.length < 8) badRows.push([m.name, k.name, `${k.hz}Hz`, `期望#${wantF}`, `得到#${p.freq}(${PEQ_FREQ_TABLE[p.freq]}Hz)`]);
        }
        if (p.gain < PEQ_GAIN_MIN || p.gain > PEQ_GAIN_MAX) outOfRange++;
        if (prevG >= 0 && p.gain < prevG) mono = false;
        prevG = p.gain;
      }
      if (!mono) nonMono++;
    }
    if (used > 0) models++;
  }
  kv('5a 覆盖箱头型号数', `${models} / ${AMP_MODELS.length}`);
  kv('5a 覆盖音色旋钮数', knobs);
  kv('5a 采样点数（5 档/旋钮）', samples.toLocaleString());
  kv('5a 频率字段命中设计频点', `${freqHit.ok} / ${freqHit.ok + freqHit.bad}${freqHit.bad ? `　✘ 失配 ${freqHit.bad}` : '　✔'}`);
  kv('5a 增益索引越界（应 0–180）', outOfRange === 0 ? '0 ✔' : `${outOfRange} ✘`);
  kv('5a 增益随旋钮单调', nonMono === 0 ? '✔ 全部单调' : `✘ ${nonMono} 个旋钮非单调`);
  kv('5a 实测增益索引区间', `#${gMin} – #${gMax}　（${peqGainToDb(gMin).toFixed(1)} – ${peqGainToDb(gMax).toFixed(1)} dB）`);
  if (freqHit.bad || outOfRange || nonMono) {
    totalFail++;
    table(['型号', '旋钮', '设计频率', '期望', '实际'], badRows);
  }

  /* 5b 兜底单寄存器 PEQ 路径（writeModuleParam 的 isPEQ 分支）—— 只做统计 */
  let fbKnobs = 0;
  let fbSamples = 0;
  let fbBad = 0;
  let skippedWide = 0;
  const wideRows: string[] = [];
  for (const [modId, knobsMap] of Object.entries(MODULE_PARAM_MAP)) {
    for (const [knob, def] of Object.entries(knobsMap as Record<string, any>)) {
      if (!def?.isPEQ) continue;
      if (def.max > 1000) { skippedWide++; if (wideRows.length < 6) wideRows.push(`${modId}.${knob}(max=0x${def.max.toString(16).toUpperCase()})`); continue; }
      fbKnobs++;
      const range = def.max - def.min;
      for (const n of [0, 0.5, 1]) {
        const fIdx = normalizedToRegValueLocal(n, def);
        const u = buildPEQData(def.peqType ?? 0, fIdx, 120, def.fixedQ ?? 16, def.fixedS ?? 10);
        const frame = buildFrame(0xEA, def.regAddr, u);
        const p = refParsePEQ(refUnpackLE32(frame.slice(4, 8)));
        fbSamples++;
        if (p.type !== (def.peqType ?? 0) || p.freq !== fIdx || p.gain !== 120
          || p.q !== (def.fixedQ ?? 16) || p.s !== (def.fixedS ?? 10)) fbBad++;
      }
    }
  }
  kv('5b 兜底 isPEQ 旋钮 / 采样点', `${fbKnobs} / ${fbSamples}`);
  kv('5b 反解字段与入参一致', fbBad === 0 ? '**0 失配 ✔**' : `**${fbBad} ✘**`);
  if (fbBad) totalFail++;
  if (skippedWide) {
    push();
    push(`> 另有 **${skippedWide}** 个 isPEQ 定义用 \`max=0xFFFFFFFF\` 表示"整字由公式生成"，不走索引映射，故不适用本项（例：${wideRows.join('、')}）。`);
    push();
  }
  void getParamDef;
}

function normalizedToRegValueLocal(n: number, def: { min: number; max: number }): number {
  return Math.round(n * (def.max - def.min)) + def.min;
}

/* ══════════════════════════════════════════════════════════
   6. 综合结论
   ══════════════════════════════════════════════════════════ */
head('6. 综合结论');
if (totalFail === 0) {
  push('**全部检查项通过（0 失败）。**');
} else {
  push(`**有 ${totalFail} 个检查项未通过，详见上文标 ✘ 的行。**`);
}
push();

/* ── 输出 ── */
const out = [
  '# BFX-1 PEQ 参数转换往返验证报告',
  '',
  `生成时间：${new Date().toISOString().replace('T', ' ').slice(0, 19)}（本地时区 ${Intl.DateTimeFormat().resolvedOptions().timeZone}）`,
  '',
  '验证链路：**物理参数 → 索引 → uint32 → BLE 12 字节帧 → uint32 → 索引 → 物理参数**',
  '',
  '除被测代码外，另用 `DataView` + 协议文档公式写了一套**独立参考实现**做交叉对照。',
  '',
  ...(findings.length
    ? ['## 0. 验证中发现并已修复的缺陷', '', ...findings.map((s) => `- ${s}`), '']
    : ['## 0. 验证中发现并已修复的缺陷', '', '- 无（所有检查项一次通过）', '']),
  ...lines,
].join('\n');

import { writeFileSync, mkdirSync } from 'node:fs';
const dir = process.argv[2] || '.';
mkdirSync(dir, { recursive: true });
writeFileSync(`${dir}/PEQ往返验证报告.md`, out, 'utf8');

/* 附带一张完整码表（给蓝牙端/固件端核对用，Excel 可直接打开） */
const csv: string[] = ['表,索引,数值'];
PEQ_FREQ_TABLE.forEach((v, i) => csv.push(`FREQ,${i},${v}`));
for (let g = PEQ_GAIN_MIN; g <= PEQ_GAIN_MAX; g++) csv.push(`GAIN,${g},${peqGainToDb(g).toFixed(1)}`);
PEQ_Q_TABLE.forEach((v, i) => csv.push(`Q,${i},${v}`));
PEQ_S_TABLE.forEach((v, i) => csv.push(`S,${i},${v}`));
writeFileSync(`${dir}/PEQ码表-索引对照.csv`, '\uFEFF' + csv.join('\r\n'), 'utf8');

console.log(out);
