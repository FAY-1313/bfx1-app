/**
 * EQ 修复自我验证脚本 (2026-09-22 建立 / 2026-09-23 按 A6 语义修订)
 *
 * A6 修订要点: 出厂预设的"档位差异不再靠已取消的旁路位", 而是"未启用的模块写直通参数"。
 *   因此 PRE/POST EQ 的"按型号取数"断言必须改到【该模块真正启用的档位】上取样本:
 *     · 过载: A3(TS808) / B2(BD-2) / C2(SD-1) / D2(B3K)   —— 清音档(如 A2/C3)过载是直通值
 *     · 失真: A4(DS-1) / B3(Distortion+) / C3(MT-2)       —— 与原先一致(这些档失真启用)
 *
 * 实际运行 buildBuiltinPresets() 生成 16 个出厂预设, 校验:
 *  V1: OD POST EQ(reg53-56) 不再是 BD-2 兜底 (TS808 / BD-2 / SD-1 各不相同且非 BD-2 兜底值)
 *  V1b: D 组贝斯 B3K OD POST EQ
 *  V1c: A6 直通档语义 —— 未启用模块的区间必须等于直通参数 (PASSTHROUGH_PEQ)
 *  V2: DIST 块 64/65/66/68/69/70/71 存在且非零 (DS-1 / Distortion+ / MT-2)
 *  V3: 不同失真型号 POST EQ 值互不相同 (证明按型号取数, 非单兜底)
 *  V4: 箱头 16 段 POST EQ(83-98) 回归完好
 *  V5: 系列键物化生效 (OVERDRIVE_DEFAULTS['中频过载/TS808'] 存在)
 *  V6: PRE EQ 覆盖回归 (在过载/失真启用的档位上)
 */
import { buildBuiltinPresets } from '../src/data/builtinPresets';
import { OVERDRIVE_DEFAULTS } from '../src/data/presetData';
import { PEDAL_PRE_EQ2 } from '../src/data/_gen/pedal_params2';

const FREQ = [19.7,20.1,20.5,20.9,21.3,21.7,22.1,22.5,23.0,23.4,23.9,24.3,24.8,25.3,25.8,26.3,26.8,27.3,27.8,28.4,28.9,29.5,30.1,30.7,31.3,31.9,32.5,33.1,33.8,34.4,35.1,35.8,36.5,37.2,37.9,38.6,39.4,40.1,40.9,41.7,42.5,43.4,44.2,45.1,45.9,46.8,47.7,48.7,49.6,50.6,51.6,52.6,53.6,54.6,55.7,56.8,57.9,59.0,60.1,61.3,62.5,63.7,65.0,66.2,67.5,68.8,70.2,71.5,72.9,74.3,75.8,77.2,78.7,80.3,81.8,83.4,85.0,86.7,88.4,90.1,91.9,94.0,95.0,97.0,99.0,101,103,105,107,109,111,114,116,118,120,123,125,127,130,132,135,138,140,143,146,149,152,154,157,161,164,167,170,173,177,180,184,187,191,195,198,202,206,210,214,218,223,227,231,236,241,245,250,255,260,265,270,275,281,286,292,297,303,309,315,321,327,334,340,347,354,360,367,375,382,389,397,405,412,420,429,437,445,454,463,472,481,490,500,510,520,530,540,551,561,572,583,595,606,618,630,642,655,667,680,694,707,721,735,749,764,779,794,809,825,841,857,874,891,908,926,944,962,981,1000,1020,1040,1060,1080,1100,1120,1140,1170,1190,1210,1240,1260,1280,1310,1330,1360,1390,1410,1440,1470,1500,1530,1560,1590,1620,1650,1680,1710,1750,1780,1820,1850,1890,1920,1960,2000,2040,2080,2120,2160,2200,2240,2290,2330,2380,2420,2470,2520,2570,2620,2670,2720,2770,2830,2880,2940,3000,3050,3110,3170,3240,3300,3360,3430,3500,3560,3630,3700,3780,3850,3920,4000,4080,4160,4240,4320,4400,4490,4580,4670,4760,4850,4940,5040,5140,5240,5340,5440,5550,5660,5770,5880,5990,6110,6230,6350,6470,6600,6730,6860,6990,7130,7270,7410,7550,7700,7850,8000,8160,8310,8480,8640,8810,8980,9150,9330,9510,9700,9890,10100,10300,10500,10700,10900,11100,11300,11500,11800,12000,12200,12500,12700,12900,13200,13500,13700,14000,14300,14500,14800,15100,15400,15700,16000,16300,16600,17000,17300,17600,18000,18300,18700,19000,19400,19800,20200,20600];
const TYPES = ['Peak','LowShelf','HighShelf','AllPass','HPF','LPF','HPF-1st','LPF-1st'];
function dec(v: number): string {
  const t = v & 7, fi = (v >> 3) & 0x1FF, g = (v >> 12) & 0xFF;
  const f = FREQ[fi] ?? -1, gdb = -24 + g * 0.2;
  return `${TYPES[t] ?? '?'}@${f}Hz ${gdb >= 0 ? '+' : ''}${gdb.toFixed(1)}dB`;
}
const hex = (v: number | undefined) => (v === undefined ? 'MISSING' : `0x${(v >>> 0).toString(16).toUpperCase().padStart(8, '0')}`);

let pass = 0, fail = 0;
function check(name: string, ok: boolean, detail: string) {
  if (ok) { pass++; console.log(`  OK  ${name}  ${detail}`); }
  else { fail++; console.log(`  FAIL ${name}  ${detail}`); }
}

// BD-2 兜底的旧 POST EQ 值 (修复前所有系列型号错成的值)
const BD2_POST = [0x50C000D8, 0x52571430, 0x5046F790, 0x50446AE8];

console.log('═══ V5: 系列键物化 ═══');
for (const k of ['中频过载/TS808', '透明过载/BD-2', '中频过载/SD-1', '经典失真/DS-1', '现代金属/MT-2', '复古失真/Distortion+', '贝斯过载/B3K']) {
  check(`OVERDRIVE_DEFAULTS['${k}']`, !!OVERDRIVE_DEFAULTS[k], OVERDRIVE_DEFAULTS[k] ? '存在' : '缺失');
}

const presets = buildBuiltinPresets();
const bySlot = new Map(presets.map(p => [p.slot, p]));
console.log(`\n═══ 生成 ${presets.length} 个出厂预设 ═══`);
check('预设数量 = 16', presets.length === 16, `实际 ${presets.length}`);

const A2 = bySlot.get(2)!, B1 = bySlot.get(5)!, C3 = bySlot.get(11)!, D1 = bySlot.get(13)!;
// A6: 过载"启用"的档位（清音档过载是直通值, 不能用于"按型号取数"断言）
const A3 = bySlot.get(3)!, B2 = bySlot.get(6)!, C2 = bySlot.get(10)!, D2 = bySlot.get(14)!;
const PTPEQ = 0x50A78540;

console.log('\n═══ V1: OD POST EQ (reg53-56) 按型号各归各 [取"过载启用"的档位] ═══');
const odPost = (p: typeof A2) => [53, 54, 55, 56].map(a => (p.registers as any)[a] >>> 0);
const a3post = odPost(A3), b2post = odPost(B2), c2post = odPost(C2);
console.log(`  A3 (TS808 ) reg53: ${hex(a3post[0])}  ${dec(a3post[0])}`);
console.log(`  B2 (BD-2  ) reg53: ${hex(b2post[0])}  ${dec(b2post[0])}`);
console.log(`  C2 (SD-1  ) reg53: ${hex(c2post[0])}  ${dec(c2post[0])}`);
check('A3 reg53 ≠ BD-2 兜底', a3post[0] !== BD2_POST[0], `${hex(a3post[0])} vs ${hex(BD2_POST[0])}`);
check('C2 reg53 ≠ BD-2 兜底', c2post[0] !== BD2_POST[0], `${hex(c2post[0])} vs ${hex(BD2_POST[0])}`);
check('A3(TS808) ≠ B2(BD-2) ≠ C2(SD-1)', a3post[0] !== b2post[0] && b2post[0] !== c2post[0] && a3post[0] !== c2post[0], '三型号三条曲线');
check('B2(BD-2) 保持 BD-2 自身数据', b2post[0] === BD2_POST[0], `${hex(b2post[0])}`);
for (const [nm, arr] of [['A3', a3post], ['C2', c2post]] as const)
  check(`${nm} OD POST 4 段全非零`, arr.every(v => v !== 0), arr.map(hex).join(' '));

console.log('\n═══ V1c: A6 直通档语义 (未启用模块 = 直通参数) ═══');
const ptEq = (p: typeof A2, addrs: number[]) => addrs.every(a => ((p.registers as any)[a] >>> 0) === PTPEQ);
check('A2(过载关) reg44-47/53-56 = 直通 PEQ',
  ptEq(A2, [44, 45, 46, 47, 53, 54, 55, 56]),
  [44, 45, 46, 47, 53, 54, 55, 56].map(a => hex((A2.registers as any)[a] >>> 0)).join(' '));
check('A2(失真关) reg59-62/68-71 = 直通 PEQ', ptEq(A2, [59, 60, 61, 62, 68, 69, 70, 71]));
check('A2(过载关) 三级驱动置最小 (49=0)', ((A2.registers as any)[49] ?? -1) === 0);
check('A3(失真关) reg59-62/68-71 = 直通 PEQ', ptEq(A3, [59, 60, 61, 62, 68, 69, 70, 71]));
check('A3(过载开) reg44-47 ≠ 直通 PEQ (真曲线)', !ptEq(A3, [44, 45, 46, 47]));

console.log('\n═══ V2: DIST 块数据完整性 (64/65/66/68-71) ═══');
const distAddrs = [64, 65, 66, 68, 69, 70, 71];
for (const [nm, p] of [['A4(DS-1)', bySlot.get(4)!], ['B3(Distortion+)', bySlot.get(7)!], ['C3(MT-2)', bySlot.get(11)!]] as const) {
  const missing = distAddrs.filter(a => (p.registers as any)[a] === undefined);
  const zero = distAddrs.filter(a => (p.registers as any)[a] === 0);
  check(`${nm} DIST 数据齐全`, missing.length === 0, missing.length ? `缺 ${missing.join(',')}` : '64-66,68-71 全在');
  if (missing.length === 0) {
    console.log(`    ${nm} reg68: ${hex((p.registers as any)[68] >>> 0)}  ${dec((p.registers as any)[68])}`);
    console.log(`    ${nm} reg70: ${hex((p.registers as any)[70] >>> 0)}  ${dec((p.registers as any)[70])}`);
  }
  void zero;
}

console.log('\n═══ V3: 不同失真型号 POST EQ 互不相同 ═══');
const dpost = (p: typeof A2) => [68, 69, 70, 71].map(a => (p.registers as any)[a] >>> 0);
const a4d = dpost(bySlot.get(4)!), b3d = dpost(bySlot.get(7)!), c3d = dpost(C3);
check('DS-1 ≠ Distortion+ ≠ MT-2', JSON.stringify(a4d) !== JSON.stringify(b3d) && JSON.stringify(b3d) !== JSON.stringify(c3d) && JSON.stringify(a4d) !== JSON.stringify(c3d), `${hex(a4d[0])} / ${hex(b3d[0])} / ${hex(c3d[0])}`);

console.log('\n═══ V4: 箱头 16 段 POST EQ(83-98) 回归 ═══');
for (const [nm, p] of [['A2 Twin', A2], ['C3 Mesa', C3], ['D1 SVT', D1]] as const) {
  const bands = Array.from({ length: 16 }, (_, i) => (p.registers as any)[83 + i]);
  const missing = bands.filter(v => v === undefined).length;
  check(`${nm} 83-98 全在`, missing === 0, missing ? `缺 ${missing} 段` : '16 段完整');
}

console.log('\n═══ V1b: D组贝斯 OD POST EQ (B3K) [取"过载启用"的档位: D2] ═══');
const d2post = odPost(D2);
check('D2 (B3K) reg53 ≠ BD-2 兜底', d2post[0] !== BD2_POST[0], `${hex(d2post[0])}  ${dec(d2post[0])}`);
check('D2 (B3K) OD POST 4 段全非零', d2post.every(v => v !== 0), d2post.map(hex).join(' '));
check('D1(清音档) 过载 = 直通 PEQ', ptEq(D1, [44, 45, 46, 47, 53, 54, 55, 56]));
void D1;

console.log('\n═══ V6: PRE EQ 覆盖回归 (buildPreEqOverride 后写生效) [与生成表对照] ═══');
// v12 (2026-09-23): 单块 PRE EQ 换源为 apk_model_params 标注值重编码表 → 断言改为"与生成表逐字节一致"
const TS808_KEY = 'B&F NAM Ibanez TS808/Ibanez TS808';
const SD1_KEY = 'B&F NAM Boss SD-1/Boss SD-1';
const a3pre = [44, 45, 46, 47].map(a => (A3.registers as any)[a] >>> 0);
check('A3 PRE EQ = 新表 TS808 Pre', JSON.stringify(a3pre) === JSON.stringify(PEDAL_PRE_EQ2[TS808_KEY].values), a3pre.map(hex).join(' '));
const c2pre = [44, 45, 46, 47].map(a => (C2.registers as any)[a] >>> 0);
check('C2 PRE EQ = 新表 SD-1 Pre', JSON.stringify(c2pre) === JSON.stringify(PEDAL_PRE_EQ2[SD1_KEY].values), c2pre.map(hex).join(' '));
check('新表 TS808 Pre B1 = HPF-1st(类型位 6，一阶滤波器)', (PEDAL_PRE_EQ2[TS808_KEY].values[0] & 7) === 6,
  hex(PEDAL_PRE_EQ2[TS808_KEY].values[0]));
// 清音档（过载关闭）必须是直通值, 不能残留子型号曲线 —— A6 的核心语义
const a2pre = [44, 45, 46, 47].map(a => (A2.registers as any)[a] >>> 0);
check('A2 清音档 PRE EQ = 直通值 (不残留 TS808 曲线)', a2pre.every(v => v === PTPEQ), a2pre.map(hex).join(' '));
// A4 (DS-1) DIST PRE EQ 覆盖值 reg59-62 — 取 SUB_MODEL_PRE_EQ['B&F NAM Boss DS-1/Boss DS-1'].values
const DS1_DIST_PREEQ = [0x00A781AC, 0x50D7D588, 0x510877E0, 0x51087902];
const a4pre = [59, 60, 61, 62].map(a => (bySlot.get(4)!.registers as any)[a] >>> 0);
check('A4 DIST PRE EQ = DS-1 覆盖值', JSON.stringify(a4pre) === JSON.stringify(DS1_DIST_PREEQ), a4pre.map(hex).join(' '));

console.log(`\n════════ 总结: ${pass} PASS / ${fail} FAIL ${fail === 0 ? '→ 验证通过' : '→ 存在问题, 需人工审核'}`);
process.exit(fail === 0 ? 0 : 1);
