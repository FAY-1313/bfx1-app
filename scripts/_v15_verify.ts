/** v15 测试轮校验：主键 = v14 电路值；_N 后缀键 = 未被覆盖的原 NAM 值；UI 侧 _2 档可见 */
import { AMP_DEFAULTS2 } from '../src/data/_gen/amp_params2';
import { AMP_HEAD_HIDDEN } from '../src/data/presetData';
import { MODULES } from '../src/data/pedalData';
import { applyUiTrim } from '../src/data/uiTrim';

const norm = (o: any): string =>
  o ? JSON.stringify(Object.keys(o).map(Number).sort((x, y) => x - y).map((k) => [k, o[k]])) : 'undef';

const posOf = (k: string) => k.slice(k.lastIndexOf('/') + 1);
const gen = Object.keys(AMP_DEFAULTS2);
const main = gen.filter((k) => !/_\d+$/.test(posOf(k)));
const suff = gen.filter((k) => /_\d+$/.test(posOf(k)));

console.log(`AMP_DEFAULTS2 键 = ${gen.length}（主键 ${main.length} / _N 后缀 ${suff.length}）`);
console.log(`运行时 AMP_HEAD_HIDDEN 键 = ${Object.keys(AMP_HEAD_HIDDEN).length}`);

let okMain = 0, okSuff = 0;
const badMain: string[] = [], badSuff: string[] = [];
for (const k of main) {
  if (norm((AMP_HEAD_HIDDEN as any)[k]) === norm((AMP_DEFAULTS2 as any)[k]?.allRegs)) okMain++;
  else badMain.push(posOf(k));
}
for (const k of suff) {
  if (norm((AMP_HEAD_HIDDEN as any)[k]) === norm((AMP_DEFAULTS2 as any)[k]?.allRegs)) badSuff.push(posOf(k));
  else okSuff++;
}
console.log(`[1] 主键 == v14 电路值        : ${okMain}/${main.length} ${badMain.length ? 'X 不一致: ' + badMain.join(',') : 'OK'}`);
console.log(`[2] _N 键 != v14 值（保 NAM） : ${okSuff}/${suff.length} ${badSuff.length ? 'X 被覆盖: ' + badSuff.join(',') : 'OK'}`);

console.log('\n[3] 实例 reg 对比（74-77 PreEQ / 83-86 PostEQ 首四段）');
for (const name of [
  'B&F NAM Marshall JCM800/Marshall JCM800',
  'B&F NAM Marshall JCM800/Marshall JCM800_2',
  'B&F NAM Mesa Dual Rectifier/Mesa Dual Rectifier',
  'B&F NAM Mesa Dual Rectifier/Mesa Dual Rectifier_2',
]) {
  const r = (AMP_HEAD_HIDDEN as any)[name];
  if (!r) { console.log(`  ${name}  <缺失>`); continue; }
  const f = (a: number[]) => a.map((i) => (r[i] ?? 0).toString(16).padStart(8, '0')).join(' ');
  console.log(`  ${posOf(name).padEnd(26)} 74-77: ${f([74, 75, 76, 77])}   83-86: ${f([83, 84, 85, 86])}`);
}

const amp = MODULES.find((m) => m.id === 'amp-head')!;
const { list, bassStart } = applyUiTrim(amp);
console.log(`\n[4] UI 精简后箱头条目 = ${list.length}（吉他区 ${bassStart}）`);
for (const m of list.slice(0, 5)) {
  console.log(`  ${m.name.padEnd(30)} -> ${(m.captures ?? []).map((c) => `${c.pos}[${c.label}]`).join(' | ')}`);
}
const namTagged = list.flatMap((m) => m.captures ?? []).filter((c) => c.label.includes('· NAM'));
console.log(`  带 "· NAM" 标注的捕获数 = ${namTagged.length}`);
