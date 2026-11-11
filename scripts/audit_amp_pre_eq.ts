/**
 * 箱头 PRE_EQ / allRegs 的滤波器类型合规检查（只读）
 * 规范(2026-09-25): REG77 应为 LPF_1st(7)，REG74 为 LowShelf(1)。
 * 对比：v14 设计(78 吉他位置) vs 未移植的 47 贝斯位置。
 */
import { MODULES } from '../src/data/pedalData';
import { AMP_HEAD_HIDDEN } from '../src/data/presetData';
import { SUB_MODEL_PRE_EQ } from '../src/data/parameterMap';
import { AMP_DEFAULTS2 } from '../src/data/_gen/amp_params2';

const TYPES = ['Peak', 'LowShelf', 'HighShelf', 'AllPass', 'HPF2nd', 'LPF2nd', 'HPF1st', 'LPF1st'];
const t = (v: number) => TYPES[v & 7];

const amp = MODULES.find((m: any) => m.id === 'amp-head')!;
const keys: Array<{ key: string; mode: string }> = [];
for (const mode of ['guitar', 'bass'] as const) {
  for (const sm of ((amp as any).subModels?.[mode] ?? []) as any[]) {
    for (const cap of (sm.captures ?? [])) keys.push({ key: `${sm.name}/${cap.pos}`, mode });
  }
}

const stat: Record<string, { v14: string[]; legacy: string[] }> = { PRE77: { v14: [], legacy: [] }, HID77: { v14: [], legacy: [] }, PRE74: { v14: [], legacy: [] } };
const legacyRows: string[] = [];

for (const { key, mode } of keys) {
  const isV14 = !!AMP_DEFAULTS2[key];
  const bucket = isV14 ? 'v14' : 'legacy';
  const pre: any = (SUB_MODEL_PRE_EQ as any)[key];
  const hid: any = (AMP_HEAD_HIDDEN as any)[key] ?? {};
  const pre77 = pre?.values?.[pre.regs.indexOf(77)];
  const pre74 = pre?.values?.[pre.regs.indexOf(74)];
  const hid77 = hid[77];
  stat.PRE77[bucket].push(pre77 === undefined ? 'n/a' : t(pre77));
  stat.PRE74[bucket].push(pre74 === undefined ? 'n/a' : t(pre74));
  stat.HID77[bucket].push(hid77 === undefined ? 'n/a' : t(hid77));
  if (!isV14 && pre77 !== undefined && (pre77 & 7) !== 7) {
    legacyRows.push(`${key}  PRE75-77=${pre.values.slice(1).map((v: number) => t(v)).join(',')}  hidden77=${hid77 !== undefined ? t(hid77) : 'n/a'}`);
  }
}

const tally = (arr: string[]) => arr.reduce((m: any, x) => ((m[x] = (m[x] ?? 0) + 1), m), {});
console.log('REG77(PRE_EQ) 类型分布  v14(78):', JSON.stringify(tally(stat.PRE77.v14)), ' legacy(47):', JSON.stringify(tally(stat.PRE77.legacy)));
console.log('REG74(PRE_EQ) 类型分布  v14(78):', JSON.stringify(tally(stat.PRE74.v14)), ' legacy(47):', JSON.stringify(tally(stat.PRE74.legacy)));
console.log('REG77(hidden) 类型分布  v14(78):', JSON.stringify(tally(stat.HID77.v14)), ' legacy(47):', JSON.stringify(tally(stat.HID77.legacy)));
console.log(`\nlegacy 中 REG77 非 LPF_1st 的位置: ${legacyRows.length} / 47`);
console.log(legacyRows.slice(0, 15).join('\n') + (legacyRows.length > 15 ? `\n...+${legacyRows.length - 15}` : ''));

// hidden 唯一性：47 legacy 与 78 v14 各自有多少套不同的 72-98 值
const uniq = (fs: (k: string) => any) => new Set(keys.filter((x) => fs(x.key) !== undefined).map((x) => JSON.stringify(fs(x.key)))).size;
console.log('\n唯一 hidden(72-98) 套数: v14 =', uniq((k) => (AMP_DEFAULTS2[k] as any)?.allRegs), ' legacy =', uniq((k) => (!AMP_DEFAULTS2[k] ? (AMP_HEAD_HIDDEN as any)[k] : undefined)));
