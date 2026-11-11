/**
 * 导出 过载/失真/箱头/箱体 的全部型号清单 → Markdown
 * 数据源：src/data/pedalData.ts 的 MODULES（UI 型号树的唯一来源）
 */
import { writeFileSync } from 'fs';
import { MODULES } from '../src/data/pedalData';

type Cap = { pos: string; label?: string };
type SM = {
  id: string; group: string; name: string; display?: string;
  knobs?: string[]; speakerLabel?: string; disabled?: boolean; captures?: Cap[];
};
type Mod = { id: string; label: string; shortLabel: string; subModels?: { guitar: SM[]; bass: SM[] } };

const TARGETS: Array<{ id: string; cn: string; note: string }> = [
  { id: 'overdrive', cn: '过载 Overdrive', note: 'OD 单块模块' },
  { id: 'dist', cn: '失真 Distortion', note: '独立 DIST 单块模块' },
  { id: 'amp-head', cn: '箱头 Amp Head', note: 'AMP 模块' },
  { id: 'cabinet', cn: '箱体 Cabinet', note: 'CAB 模块' },
];

const mod = (id: string) => MODULES.find((m) => m.id === id) as unknown as Mod;

const posCount = (list: SM[]) => list.reduce((n, s) => n + (s.captures?.length ?? 0), 0);

function groupBy(list: SM[]) {
  const order: string[] = [];
  const map = new Map<string, SM[]>();
  for (const s of list) {
    const g = s.group || '(未分组)';
    if (!map.has(g)) { map.set(g, []); order.push(g); }
    map.get(g)!.push(s);
  }
  return order.map((g) => [g, map.get(g)!] as const);
}

let out = '';
const W = (s = '') => { out += s + '\n'; };

W('# BFX1 效果器型号总表 — 过载 / 失真 / 箱头 / 箱体');
W();
W('> 生成时间：2026-09-26');
W('> 数据源：`01_app/src/data/pedalData.ts` 的 `MODULES`（APP 内型号树的唯一来源）');
W('> 口径：**系列** = 一个 SubModel（对应 Slot B 的一个系列档）；**位置** = 该系列下的一个 captures 条目（具体型号 / 档位 / 麦克风位）');
W();

// ── 汇总表 ──
W('## 0. 汇总');
W();
W('| 模块 | 吉他系列 | 吉他位置 | 贝斯系列 | 贝斯位置 | 系列合计 | 位置合计 |');
W('|---|---:|---:|---:|---:|---:|---:|');
const stats: Array<{ cn: string; g: SM[]; b: SM[] }> = [];
for (const t of TARGETS) {
  const m = mod(t.id);
  const g = m.subModels?.guitar ?? [];
  const b = m.subModels?.bass ?? [];
  stats.push({ cn: t.cn, g, b });
  W(`| ${t.cn} | ${g.length} | ${posCount(g)} | ${b.length} | ${posCount(b)} | ${g.length + b.length} | ${posCount(g) + posCount(b)} |`);
}
const tot = stats.reduce((a, s) => ({
  gs: a.gs + s.g.length, gp: a.gp + posCount(s.g), bs: a.bs + s.b.length, bp: a.bp + posCount(s.b),
}), { gs: 0, gp: 0, bs: 0, bp: 0 });
W(`| **合计** | **${tot.gs}** | **${tot.gp}** | **${tot.bs}** | **${tot.bp}** | **${tot.gs + tot.bs}** | **${tot.gp + tot.bp}** |`);
W();

const CN = ['一', '二', '三', '四'];

TARGETS.forEach((t, ti) => {
  const m = mod(t.id);
  const g = m.subModels?.guitar ?? [];
  const b = m.subModels?.bass ?? [];
  W(`## ${CN[ti]}、${t.cn}（${m.shortLabel}）`);
  W();
  W(`> ${t.note}　模块 id：\`${m.id}\`　吉他 ${g.length} 系列 / ${posCount(g)} 位置　贝斯 ${b.length} 系列 / ${posCount(b)} 位置`);
  W();

  (['guitar', 'bass'] as const).forEach((mode, mi) => {
    const list = mode === 'guitar' ? g : b;
    if (!list.length) return;
    W(`### ${CN[ti]}.${mi + 1} ${mode === 'guitar' ? '吉他（Guitar）' : '贝斯（Bass）'} — ${list.length} 系列 / ${posCount(list)} 位置`);
    W();
    for (const [grp, items] of groupBy(list)) {
      W(`#### ${grp}（${items.length} 系列 / ${posCount(items)} 位置）`);
      W();
      W('| # | 系列（显示名） | 内部名 | 位置 pos | 位置标签 label | 旋钮 |');
      W('|---|---|---|---|---|---|');
      let n = 0;
      for (const s of items) {
        const kn = (s.knobs && s.knobs.length) ? s.knobs.join(' / ') : '—';
        const caps = s.captures?.length ? s.captures : [{ pos: '—', label: '—' }];
        caps.forEach((c, ci) => {
          n += 1;
          const disp = (s.display ?? s.name) + (ci === 0 && s.disabled ? ' ⚠disabled' : '');
          W(`| ${n} | ${ci === 0 ? disp : ''} | ${ci === 0 ? s.name : ''} | ${c.pos} | ${c.label ?? ''} | ${ci === 0 ? kn : ''} |`);
        });
      }
      W();
    }
  });
});

W('---');
W();
W('## 附：维护说明');
W();
W('- 型号清单的**唯一来源**是 `01_app/src/data/pedalData.ts` 的 `MODULES`（`overdrive` / `dist` / `amp-head` / `cabinet` 四个模块的 `subModels.guitar` / `subModels.bass`），本文档为只读派生表，不手工编辑。');
W('- 重新生成：');
W();
W('  ```powershell');
W('  Set-Location D:\\bfx1app\\01_app');
W('  & node ".\\node_modules\\esbuild\\bin\\esbuild" scripts/export_model_inventory.ts --bundle --platform=node --format=cjs --outfile=scripts/_expinv.cjs');
W('  & node ".\\scripts\\_expinv.cjs"');
W('  ```');
W();
W('- 型号增删后请重跑本脚本，并在 `04_开发文档/B_NAM拟合与寄存器/` 的相关移植文档中同步参数状态。');
W('- 备注：箱头贝斯 19 系列 / 47 位置目前**无 v14 设计参数**（沿用旧值），单块（OD+DIST）与箱体的参数数据完整。');

const OUT = process.argv[2] || 'D:\\bfx1app\\04_开发文档\\B_NAM拟合与寄存器\\效果器型号总表_OD_DIST_AMP_CAB_20260926.md';
writeFileSync(OUT, out, 'utf8');
console.log('已写入:', OUT);
console.log('字节数:', Buffer.byteLength(out, 'utf8'));
console.log(`合计: 吉他 ${tot.gs} 系列/${tot.gp} 位置, 贝斯 ${tot.bs} 系列/${tot.bp} 位置`);
