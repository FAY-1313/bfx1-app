/**
 * APK 侧 EA 地址集审计 (只读分析, 不改任何代码)
 * 目的: 核对文档 R4 的 115 地址集与 APK 现有出厂预设实际使用的地址集是否兼容,
 *       特别是被砍的 13 个地址是否真的"非音色必需"。
 */
import { buildBuiltinPresets } from '../src/data/builtinPresets';

const R4_KEEP: number[] = [];
const push = (lo: number, hi: number) => { for (let a = lo; a <= hi; a++) R4_KEEP.push(a); };
push(0, 3); push(8, 13); push(44, 51); push(53, 56); push(59, 66); push(68, 71);
push(74, 81); push(83, 98); push(108, 142); push(215, 223); push(225, 229);
push(239, 239);   // 239 箱头 MASTER(PreMixer)，2026-09-25 用户确认补入
push(254, 261);
const R4_REMOVE = [7, 42, 43, 52, 57, 58, 67, 72, 73, 82, 107, 224, 253];

const presets = buildBuiltinPresets();

// 1) 出厂 16 预设实际用到的地址并集 + 出现次数
const usage = new Map<number, number>();
for (const p of presets) for (const k of Object.keys(p.registers as any)) {
  const a = parseInt(k, 10); usage.set(a, (usage.get(a) ?? 0) + 1);
}
const used = [...usage.keys()].sort((a, b) => a - b);

console.log(`文档 R4 保留集: ${R4_KEEP.length} 个 (去重后 ${new Set(R4_KEEP).size})`);
console.log(`文档 R4 砍掉  : ${R4_REMOVE.length} 个 -> ${R4_REMOVE.join(',')}`);
console.log(`APK 出厂预设实际使用地址: ${used.length} 个\n`);

const keepSet = new Set(R4_KEEP), rmSet = new Set(R4_REMOVE);
const usedKeep = used.filter(a => keepSet.has(a));
const usedRm = used.filter(a => rmSet.has(a));
const usedNeither = used.filter(a => !keepSet.has(a) && !rmSet.has(a));

console.log('─── A. APK 用到 且 R4 保留 ───');
console.log(`  ${usedKeep.length} 个: ${usedKeep.join(',')}`);
console.log('\n─── B. APK 用到 但 R4 砍掉 (冲突项) ───');
for (const a of usedRm) console.log(`  reg${a}  出现于 ${usage.get(a)}/16 个预设`);
console.log(`  小计 ${usedRm.length} 个`);
console.log('\n─── C. APK 用到 但两表都没列 (R4 遗漏项) ───');
console.log(usedNeither.length ? `  ${usedNeither.join(',')}` : '  (无)');
console.log('\n─── D. R4 砍掉但 APK 未使用 (可安全删除) ───');
console.log('  ' + R4_REMOVE.filter(a => !usage.has(a)).join(',') || '  (无)');

// 2) 组内 BYPASS 差异分析: 出厂预设按组区分音色的关键
console.log('\n═══ 组内差异分析 (A/B/C/D 各 4 档) ═══');
const GROUPS: Record<string, number[]> = { A: [2, 3, 4], B: [5, 6, 7, 8], C: [9, 10, 11, 12], D: [13, 14, 15, 16] };
const bySlot = new Map(presets.map(p => [p.slot, p]));
for (const [g, slots] of Object.entries(GROUPS)) {
  const addrs = new Set<number>();
  for (const s of slots) for (const k of Object.keys((bySlot.get(s)!.registers as any))) addrs.add(parseInt(k, 10));
  const diffs: number[] = [];
  for (const a of [...addrs].sort((x, y) => x - y)) {
    const vals = slots.map(s => (bySlot.get(s)!.registers as any)[a]);
    if (new Set(vals.map(v => String(v))).size > 1) diffs.push(a);
  }
  const diffsRm = diffs.filter(a => rmSet.has(a));
  console.log(`${g} 组 (槽 ${slots.join(',')}): 组内取值不同的寄存器 ${diffs.length} 个`);
  console.log(`   其中落在 R4 砍掉集: ${diffsRm.length ? diffsRm.join(',') : '(无)'}`);
}

// 3) 逐槽统计: 若按 R4 砍掉 13 个, 每槽还剩多少可下发
console.log('\n═══ 按 R4 砍 13 个后, 各槽剩余可下发寄存器数 ═══');
for (const p of presets) {
  const all = Object.keys(p.registers as any).map(Number);
  const remain = all.filter(a => !rmSet.has(a));
  console.log(`  槽${String(p.slot).padStart(2)} ${p.name.padEnd(20)} 原 ${String(all.length).padStart(3)} -> 剩 ${remain.length}`);
}
