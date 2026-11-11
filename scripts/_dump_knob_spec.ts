/**
 * 旋钮规格导出（一次性离线脚本）
 *
 * 目的：不靠人工读源码抄数字，而是**直接调用 UI 真正使用的旋钮构造函数**
 *      （compKnobs / odKnobs / ampKnobs），把每个旋钮在 norm=0/0.25/0.5/0.75/1
 *      时【显示什么文本】+【实际写什么寄存器值】打出来。
 *      这样量程/步进/单位三项都能被核对，且不会出现"文档与代码不一致"。
 */
import { compKnobs, odKnobs, ampKnobs, type KnobDesc } from '../src/ui2/moduleKnobs';
import { COMP_MODELS, OD_MODELS, AMP_MODELS } from '../src/data/_def';
import { SPECS } from '../src/ui2/registers';
import { ampBaseKnobs } from '../src/ui2/ampKnobMap';
import { writeFileSync, mkdirSync } from 'node:fs';

interface Pt { n: number; text: string; reg: number | 'PGA' | null; regName?: string }
interface Row {
  module: string; model: string; knob: string; short: string;
  regName: string; pts: Pt[];
}


const N8_TAB: Record<string, [number, number]> = {
  BASS: [-12, 9], MID: [-12, 6], MIDDLE: [-12, 6], TREBLE: [-12, 9],
  PRESENCE: [-12, 6], RESONANCE: [-12, 6], 'TREBLE/CUT': [-9, 0], CUT: [-9, 0],
};
const N8_LO = (n: string) => (N8_TAB[n] ?? [-24, 12])[0];
const N8_HI = (n: string) => (N8_TAB[n] ?? [-24, 12])[1];

const rows: Row[] = [];
const issues: string[] = [];
const note = (s: string) => issues.push(s);

/* ── 每个模块单独构造，带捕获 onParam ── */
function collect(
  module: string, model: string,
  build: (onParam: (r: number | 'PGA', v: number) => void) => KnobDesc[],
) {
  const captured: Array<{ r: number | 'PGA'; v: number }> = [];
  const descs = build((r, v) => captured.push({ r, v }));
  descs.forEach((d, i) => {
    const pts: Pt[] = [];
    for (const n of [0, 0.25, 0.5, 0.75, 1]) {
      captured.length = 0;
      d.setNorm(n);
      const got = captured[0];
      pts.push({ n, text: d.fmtAt(n), reg: got ? got.v : null, regName: got ? String(got.r) : '-' });
    }
    rows.push({
      module, model, knob: d.full, short: d.short,
      regName: pts[0]?.regName ?? '-',
      pts,
    });
    void i;
  });
}

/* 压缩器：每个型号 */
COMP_MODELS.forEach((md, mi) => {
  collect('压缩器', md.name, (onParam) => compKnobs(mi, { ...md.regs }, onParam));
});

/* 过载：每个型号 */
OD_MODELS.forEach((md, mi) => {
  collect('过载', md.name, (onParam) => odKnobs(mi, { ...md.regs }, onParam));
});

/* 箱头：每个型号 */
AMP_MODELS.forEach((md, mi) => {
  collect('箱头', md.name, (onParam) => ampKnobs(mi, { ...md.regs }, onParam));
});

/* ══════════ 输出 ─═════════ */
const L: string[] = [];
const P = (s = '') => L.push(s);

P('# 旋钮规格导出（自动生成，勿手改）');
P();
P(`生成时间：${new Date().toISOString().slice(0, 19).replace('T', ' ')}`);
P();
P('每格格式：`显示文本 → 写入寄存器值`；n = 旋钮归一位置 0 / 0.25 / 0.5 / 0.75 / 1。');
P();

let curMod = '';
let curModel = '';
for (const r of rows) {
  if (r.module !== curMod) { P(); P(`## ${r.module}`); P(); curMod = r.module; curModel = ''; }
  if (r.model !== curModel) { P(); P(`### ${r.model}`); P(); curModel = r.model; }
  P(`- **${r.knob}**（${r.short}，reg ${r.regName}）：` +
    r.pts.map((p) => `\`${p.text} → ${p.reg ?? '?'}\``).join(' ｜ '));
}

/* ══════════ 自动一致性检查 ─═════════ */
P();
P('## 自动一致性检查');
P();

/* 1) 箱头 N8 旋钮名是否都登记了量程 */
const N8_KEYS = ['BASS', 'MID', 'MIDDLE', 'TREBLE', 'PRESENCE', 'RESONANCE', 'CUT', 'TREBLE/CUT'];
const missing = new Set<string>();
AMP_MODELS.forEach((m) => m.knobs.forEach((k) => {
  if (!N8_KEYS.includes(k.name)) missing.add(k.name);
}));
P(`- 箱头 N8 旋钮名全集：${[...new Set(AMP_MODELS.flatMap((m) => m.knobs.map((k) => k.name)))].join(' / ')}`);
P(`- 未登记量程（会回退 −24…+12）的旋钮名：${missing.size ? [...missing].join(' / ') : '无'}`);
if (missing.size) note(`N8 量程表未登记：${[...missing].join('、')}`);

/* 2) 同一旋钮名在不同型号的量程是否一致（看 UI 实际输出） */
const byName = new Map<string, Set<string>>();
for (const r of rows) {
  if (r.module !== '箱头') continue;
  const lo = r.pts[0].text;
  const hi = r.pts[4].text;
  const key = r.knob;
  if (!byName.has(key)) byName.set(key, new Set());
  byName.get(key)!.add(`${lo} … ${hi}`);
}
P();
P('### 箱头同名旋钮的 UI 量程');
for (const [k, v] of [...byName.entries()].sort()) {
  P(`- ${k}：${[...v].join(' ｜ ')}${v.size > 1 ? '  ⚠ 不一致' : ''}`);
  if (v.size > 1) note(`箱头 ${k} 在不同型号/下存在多个 UI 量程：${[...v].join(' / ')}`);
}

/* 3) 压缩器/过载同名旋钮量程 */
for (const mod of ['压缩器', '过载']) {
  const m = new Map<string, Set<string>>();
  for (const r of rows) {
    if (r.module !== mod) continue;
    const key = r.knob;
    if (!m.has(key)) m.set(key, new Set());
    m.get(key)!.add(`${r.pts[0].text} … ${r.pts[4].text}`);
  }
  P();
  P(`### ${mod}同名旋钮的 UI 量程`);
  for (const [k, v] of [...m.entries()].sort()) {
    P(`- ${k}：${[...v].join(' ｜ ')}${v.size > 1 ? '  ⚠ 不一致' : ''}`);
  }
}


/* ══════════ 箱头：UI 中点 vs 设计值（noon） ══════════ */
P();
P('## 箱头 N8 音调段：UI 中点 vs 型号设计值');
P();
P('`UI 中点` = 旋钮拖到 n=0.5 时显示的 dB；`设计值` = 型号 regs[addr] 里 PEQ 字的增益。');
P('两者相等才说明「中点 = 出厂音色」。');
P();
{
  const { parsePEQData } = await import('../src/data/peqCodec');
  let diff = 0;
  const rows: string[] = [];
  AMP_MODELS.forEach((m) => {
    m.knobs.forEach((k) => {
      const lo = N8_LO(k.name);
      const hi = N8_HI(k.name);
      const mid = (lo + hi) / 2;
      const design = (parsePEQData(m.regs[k.addr] ?? 0).gain - 120) * 0.2;
      const same = Math.abs(mid - design) < 0.05;
      if (!same) diff++;
      rows.push(`| ${m.sn ?? m.name} | ${k.name} | ${mid.toFixed(1)} | ${design.toFixed(1)} | ${same ? '✔' : '⚠ 不一致'} |`);
    });
  });
  P('| 型号 | 旋钮 | UI 中点 dB | 设计值 dB | 判定 |');
  P('|---|---|---|---|---|');
  rows.forEach((r) => P(r));
  P();
  P(`- 不一致数量：**${diff}** / ${rows.length}`);
  if (diff) note(`箱头 N8 有 ${diff} 个旋钮的「UI 中点」≠「型号设计值」（拖到中点会把出厂音色改掉）`);
}

P();
P('## 检查结论');
P();
if (issues.length === 0) P('- 未发现自动可判定的不一致');
else issues.forEach((s) => P(`- ⚠ ${s}`));

const out = L.join('\n');
const dir = process.argv[2] || '.';
mkdirSync(dir, { recursive: true });
writeFileSync(`${dir}/旋钮规格导出.md`, out, 'utf8');
console.log(out.slice(0, 12000));
