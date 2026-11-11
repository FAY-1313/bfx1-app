/**
 * UI 层精简审计 —— 每批（箱体/箱头/单块）改完 uiTrim.ts 后必跑。
 *
 * 编译运行：
 *   & node ".\node_modules\esbuild\bin\esbuild" scripts/_ui_trim_audit.ts --bundle --platform=node --format=cjs --outfile=scripts\_uta.cjs
 *   & node ".\scripts\_uta.cjs"
 *
 * 校验 8 项：
 *   1) applyUiTrim 不修改 module.subModels（带/不带 pinnedKey 各一次）
 *   2) 输出型号是原始数据的子集
 *   3) 输出的每个型号 captures 非空且为原始捕获子集
 *   4) 精简后数量符合预期
 *   5) 内置预设/官方音色库「依赖项」仍在列表中
 *   6) 已知会被精简的官方音色项，必须能被 pinnedKey 兜底找回
 *   7) 未列入精简清单的模块（Compressor/Chorus/Delay/Reverb 等）输出与原始一致
 *   8) bassStart 等于过滤后的吉他区条目数
 */
import { MODULES, ModuleConfig, SubModel } from '../src/data/pedalData';
import { applyUiTrim, UI_TRIM_ON } from '../src/data/uiTrim';

let pass = 0;
const fails: string[] = [];
const ok = (cond: boolean, msg: string) => { if (cond) pass++; else fails.push(msg); };
const findMod = (id: string): ModuleConfig | undefined => MODULES.find((m) => m.id === id);
const srcOf = (m: ModuleConfig) => [...(m.subModels?.guitar ?? []), ...(m.subModels?.bass ?? [])];

// ── 精简后的期望条目数（随批次推进补齐）──
const EXPECT: Record<string, { g: number; b: number }> = {
  'amp-head': { g: 19, b: 9 },
  cabinet: { g: 14, b: 7 },
  overdrive: { g: 6, b: 3 },
  dist: { g: 5, b: 2 },
};

// ── 依赖清单 ──
// kind='must'     : 必须出现在精简后列表中（内置预设 / 官方音色库保留项）
// kind='fallback' : 允许被精简，但必须能被 pinnedKey 兜底找回（官方音色库中的近似款）
interface Dep { mod: string; name: string; pos?: string; kind: 'must' | 'fallback'; why: string }
const DEPS: Dep[] = [
  // 箱头：内置 16 预设 + 官方音色库 8 个箱头底座（AMP_TWIN/PLEXI/MESA/VOX/ORANGE/BOGNER/SVT/HARTKE）
  { mod: 'amp-head', name: 'B&F NAM Fender Twin Reverb', pos: 'Fender Twin Reverb', kind: 'must', why: '内置A + AMP_TWIN' },
  { mod: 'amp-head', name: 'B&F NAM Marshall Plexi', pos: 'Marshall Plexi', kind: 'must', why: '内置B + AMP_PLEXI' },
  { mod: 'amp-head', name: 'B&F NAM Mesa Dual Rectifier', pos: 'Mesa Dual Rectifier', kind: 'must', why: '内置C + AMP_MESA' },
  { mod: 'amp-head', name: 'B&F NAM Vox AC30', pos: 'Vox AC30', kind: 'must', why: 'AMP_VOX' },
  { mod: 'amp-head', name: 'B&F NAM Orange Rockerverb', pos: 'Orange Rockerverb', kind: 'must', why: 'AMP_ORANGE' },
  { mod: 'amp-head', name: 'B&F NAM Bogner Ecstasy', pos: 'Bogner Ecstasy', kind: 'must', why: 'AMP_BOGNER' },
  { mod: 'amp-head', name: 'B&F NAM EVH 5150III', pos: 'EVH 5150III', kind: 'must', why: 'AMP_EVH' },
  { mod: 'amp-head', name: 'B&F NAM Ampeg SVT-CL', pos: 'Ampeg SVT-CL', kind: 'must', why: '内置D + AMP_SVT' },
  { mod: 'amp-head', name: 'B&F NAM Hartke', pos: 'Hartke', kind: 'must', why: '内置E + AMP_HARTKE' },
  // 内置 16 预设 + 官方音色库 箱体底座
  { mod: 'cabinet', name: 'B&F NAM 1971 Fender Twin Reverb 2x12 Oxford 12T6-10', pos: 'Distant 24In', kind: 'must', why: '内置A + CAB_TWIN' },
  { mod: 'cabinet', name: 'B&F NAM Marshall 1960', pos: '421', kind: 'must', why: '内置B + CAB_MARSHALL' },
  { mod: 'cabinet', name: 'B&F NAM Mesa Boogie Rectifier OS 4x12 V30', pos: 'R121/57', kind: 'must', why: '内置C + CAB_MESA' },
  { mod: 'cabinet', name: 'B&F NAM Ampeg 8x10', pos: '4033 AH', kind: 'must', why: '内置D + CAB_SVT' },
  { mod: 'cabinet', name: 'B&F NAM GK RBH 410', pos: 'SM57 + MD421', kind: 'must', why: '内置E + CAB_HARTKE' },
  { mod: 'cabinet', name: 'B&F NAM TJ3 66AC30 SLVR', pos: '121-545', kind: 'must', why: 'CAB_VOX' },
  { mod: 'cabinet', name: 'B&F NAM Orange 4x12 V30 shure57 cn', pos: '(无话筒)', kind: 'must', why: 'CAB_ORANGE' },
  { mod: 'cabinet', name: 'B&F NAM EVH 5150 iii', pos: 'Airsong', kind: 'must', why: 'CAB_EVH' },
  // 官方音色库使用的近似款 → 走 pinned 兜底
  { mod: 'cabinet', name: 'B&F NAM Orange 2x12 V30', pos: 'SM57 A', kind: 'fallback', why: 'CAB_BOGNER' },
  // 单块：内置 16 预设依赖
  { mod: 'overdrive', name: '中频过载', pos: 'TS808', kind: 'must', why: '内置A' },
  { mod: 'overdrive', name: '中频过载', pos: 'SD-1', kind: 'must', why: '内置C' },
  { mod: 'overdrive', name: '透明过载', pos: 'BD-2', kind: 'must', why: '内置B' },
  { mod: 'overdrive', name: '贝斯过载', pos: 'B3K', kind: 'must', why: '内置D/E' },
  { mod: 'dist', name: '经典失真', pos: 'DS-1', kind: 'must', why: '内置A' },
  { mod: 'dist', name: '现代金属', pos: 'MT-2', kind: 'must', why: '内置C' },
  { mod: 'dist', name: '复古失真', pos: 'Distortion+', kind: 'must', why: '内置B' },
  // 官方音色库使用的近似款（同型号下的变体）→ 走 pinned 兜底
  { mod: 'overdrive', name: '中频过载', pos: 'OD808', kind: 'fallback', why: 'officialTones（同 TS 系变体）' },
  { mod: 'overdrive', name: '中频过载', pos: 'Precision Drive', kind: 'fallback', why: 'officialTones x3' },
  { mod: 'dist', name: '经典失真', pos: 'DS-2', kind: 'fallback', why: 'officialTones x3' },
];

console.log('=== UI 层精简审计 ===');
console.log('UI_TRIM_ON =', UI_TRIM_ON);
console.log('');

// ── 1) 不修改原数据 ──
for (const id of Object.keys(EXPECT)) {
  const m = findMod(id);
  if (!m) { fails.push(`模块不存在: ${id}`); continue; }
  const before = JSON.stringify(m.subModels);
  applyUiTrim(m);
  const pin = DEPS.find((d) => d.mod === id && d.kind === 'fallback');
  if (pin) applyUiTrim(m, `${pin.name}/${pin.pos}`);
  ok(JSON.stringify(m.subModels) === before, `${id}: applyUiTrim 修改了原 subModels（不可 mutation）`);
}

// ── 2~4) 子集 / 捕获非空 / 数量 / bassStart ──
console.log('模块          吉他         贝斯');
for (const [id, exp] of Object.entries(EXPECT)) {
  const m = findMod(id);
  if (!m) continue;
  const { list, bassStart } = applyUiTrim(m);
  const g = list.slice(0, bassStart);
  const b = list.slice(bassStart);
  console.log(`${id.padEnd(12)} ${String(g.length).padStart(3)}/${String(exp.g).padEnd(3)}      ${String(b.length).padStart(3)}/${String(exp.b).padEnd(3)}`);
  ok(g.length === exp.g, `${id}: 吉他数量 ${g.length} != 期望 ${exp.g}`);
  ok(b.length === exp.b, `${id}: 贝斯数量 ${b.length} != 期望 ${exp.b}`);
  ok(bassStart === g.length, `${id}: bassStart ${bassStart} != 实际吉他数 ${g.length}`);
  // 关键回归：bassStart 若沿用「未过滤的吉他数」，吉他/贝斯分组表头会错位
  const srcGuitarLen = (m.subModels?.guitar ?? []).length;
  if (g.length < srcGuitarLen) {
    ok(bassStart < srcGuitarLen, `${id}: bassStart 仍用未过滤的吉他数（${bassStart} >= ${srcGuitarLen}，分组表头会错位）`);
  }

  const src = new Map<string, SubModel>();
  srcOf(m).forEach((s) => src.set(s.name, s));
  for (const s of list) {
    const o = src.get(s.name);
    ok(!!o, `${id}: 输出型号不在原始数据中 → ${s.name}`);
    if (s.captures) {
      ok(s.captures.length >= 1, `${id}/${s.name}: 捕获被清空（必须保留至少 1 个）`);
      for (const c of s.captures) {
        ok(!!o?.captures?.some((x) => x.pos === c.pos), `${id}/${s.name}: 输出捕获不在原始数据中 → ${c.pos}`);
      }
    }
  }
}

// ── 5~6) 依赖项 ──
console.log('');
for (const d of DEPS) {
  const m = findMod(d.mod);
  if (!m) { fails.push(`依赖模块不存在: ${d.mod}`); continue; }
  const { list } = applyUiTrim(m);
  const hit = list.find((s) => s.name === d.name);
  if (d.kind === 'must') {
    ok(!!hit, `[must] ${d.mod}: 依赖型号被精简 → ${d.name}（${d.why}）`);
    if (hit && d.pos) ok(!!hit.captures?.some((c) => c.pos === d.pos), `[must] ${d.mod}/${d.name}: 依赖捕获被精简 → ${d.pos}（${d.why}）`);
  } else {
    const key = d.pos ? `${d.name}/${d.pos}` : d.name;
    // (1) 默认状态下该项必须不可见：型号被整体精简，或型号在但该捕获被精简
    const visible = hit ? (!d.pos || !!hit.captures?.some((c) => c.pos === d.pos)) : false;
    ok(!visible, `[fallback] ${d.mod}: ${key} 预期被精简，但默认列表中仍可见（${d.why}）`);
    // (2) 加载到该项时，pinned 兜底必须能按 name/pos 反查到索引（UI 正确高亮的前提）
    const pinned = applyUiTrim(m, key);
    const idx = pinned.list.findIndex((s) => s.name === d.name);
    ok(idx >= 0, `[fallback] ${d.mod}: pinned 兜底找不到型号 → ${key}（${d.why}）`);
    if (idx >= 0 && d.pos) {
      const pi = pinned.list[idx].captures?.findIndex((c) => c.pos === d.pos) ?? -1;
      ok(pi >= 0, `[fallback] ${d.mod}: pinned 兜底找不到捕获索引（-1）→ ${key}（${d.why}）`);
    }
  }
}

// ── 7~8) 未列入清单的模块必须完全不变 ──
for (const m of MODULES) {
  if (EXPECT[m.id]) continue;
  const srcG = (m.subModels?.guitar ?? []).length;
  const srcB = (m.subModels?.bass ?? []).length;
  const { list, bassStart } = applyUiTrim(m);
  ok(list.length === srcG + srcB, `${m.id}: 未列入精简清单却被过滤（${list.length} != ${srcG + srcB}）`);
  ok(bassStart === srcG, `${m.id}: bassStart 异常（${bassStart} != ${srcG}）`);
}

// ── 汇总 ──
console.log('');
console.log(`PASS ${pass}   FAIL ${fails.length}`);
if (fails.length) {
  fails.slice(0, 40).forEach((f) => console.log('  FAIL ' + f));
  console.log('\n审计未通过');
  process.exit(1);
}
console.log('ALL PASS');
