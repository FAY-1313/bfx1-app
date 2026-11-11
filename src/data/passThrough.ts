/**
 * BFX-1 旁路体系 · 单一权威来源（★ 2026-10-15 重构）
 *
 * 按《全参数与寄存器规范 v5》第 1、5 章定案：
 *   · 模块开关一律用【模块级旁路位】表达，取消「参数复位」（旧整组复位已停用）
 *   · 箱头与箱体【常开】（除 A1），不参与踩钉
 *   · A1 = 唯一全旁路档（所有旁路位写 1）
 *   · 写入分级延时：42 / 57 后 50 ms；72 后 150 ms；末两位固定 72 → 107
 *
 * 本文件不再依赖 parameterMap（改依赖零依赖的 peqCodec），
 * 与 registerMap 共同构成地址与旁路的唯一口径。
 */
import { buildPEQData, PEQ_TYPE, freqToIndex } from './peqCodec';
/* ★ 2026-10-17：写入节拍统一收口到 src/config/writeTiming.ts（改一个数字即整版回退） */
import { EA_WRITE_MS, EB_WRITE_MS, BYPASS_SLOW_MS, BYPASS_72_MS } from '../config/writeTiming';

/* ══════════════════ 一、写入节拍 ══════════════════ */

/** 普通寄存器（含 EA / 数据类）最小间隔 */
export const REG_WRITE_MS = EA_WRITE_MS;
/** 保存到硬件（EB）最小间隔 */
export { EB_WRITE_MS };
/** 42 / 57 旁路位落定所需间隔 */
export { BYPASS_SLOW_MS };
/** 72 旁路位落定所需间隔（原最长 150ms，5ms 版与之统一） */
export { BYPASS_72_MS };

/* ══════════════════ 二、模块级旁路表（权威） ══════════════════ */

export interface BypassSpec {
  /** 模块级旁路位地址 */
  addr: number;
  /** 启用值 */
  on: number;
  /** 旁路值 */
  off: number;
  /** 是否参与踩钉 */
  footswitch: boolean;
}

/**
 * 模块 → 模块级旁路位。
 *   0 噪声门 · 7 压缩 · 42 过载 · 57 箱头（块级 1）· 107 箱体 · 215 合唱 · 221 延迟 · 224 混响
 * 箱头的第二块级旁路位 72 与 57 成对写（总开关），由 A1_BYPASS_ALL 统一处理。
 * ★ 2026-10-15 口径修正：库旁路 58/67/73/82 与分支旁路 63/78 均不纳入写入集。
 */
export const MODULE_BYPASS: Record<string, BypassSpec> = {
  'noise-gate': { addr: 0, on: 0, off: 1, footswitch: true },
  compressor: { addr: 7, on: 0, off: 1, footswitch: true },
  'amp-head': { addr: 57, on: 0, off: 1, footswitch: false },
  cabinet: { addr: 107, on: 0, off: 1, footswitch: false },
  chorus: { addr: 215, on: 0, off: 1, footswitch: true },
  delay: { addr: 221, on: 0, off: 1, footswitch: true },
  /* ★ 2026-10-20（用户拍板）：混响开关回到 reg 224（1 = 旁路）。
     此前因「固件 R4 取消 224」改成 MIX(229) 归零，副作用是每次切档把预设的 MIX 钉成 20；
     现按用户确认改回 224，MIX 归预设自己管。 */
  reverb: { addr: 224, on: 0, off: 1, footswitch: true },
};

/** 兼容别名：模块 → 旁路地址（原 parameterMap.MODULE_BYPASS_ADDR） */
export const MODULE_BYPASS_ADDR: Record<string, number> = Object.fromEntries(
  Object.entries(MODULE_BYPASS).map(([k, v]) => [k, v.addr]),
);

/** 带踩钉的模块（7 个）—— 箱头与箱体不在其中 */
export const FOOTSWITCH_MODULES = Object.entries(MODULE_BYPASS)
  .filter(([, v]) => v.footswitch).map(([k]) => k);

/** 踩钉可操作的旁路位（6 个模块级 + PGA） */
export const FOOTSWITCH_BYPASS_ADDRS: readonly number[] = [0, 7, 42, 215, 221, 224];

/** 箱头块级旁路位（A1 必须成对写） */
export const AMP_BLOCK_BYPASS: readonly number[] = [57, 72];
/**
 * 箱头库旁路位 —— ★ 2026-10-15 口径修正后【不进写入集】。
 *   箱头只由块级总开关 57 + 72 控制，库旁路交回固件 / 型号数据决定。
 *   本常量仅作登记与排查参考，任何写入路径都不得使用。
 */
export const AMP_LIB_BYPASS: readonly number[] = [58, 67, 73, 82];
/** 箱头分支级旁路位（由型号数据决定，不作开关，A1 也不写） */
export const AMP_BRANCH_BYPASS: readonly number[] = [63, 78];

/* ══════════════════ 三、旁路写入顺序与延时 ══════════════════ */

/**
 * 旁路类地址全集（9 个）。写入时一律排在数据类之后。
 *   普通段：0 · 7 · 42 · 57 · 215 · 221 · 224
 *   收尾段：72 · 107
 *
 * ★ 2026-10-15 口径修正：箱头只写【总开关 57 + 72】；
 *   库旁路 58 / 67 / 73 / 82 与分支旁路 63 / 78 一律不写。
 */
export const BYPASS_ADDRS: readonly number[] = [
  0, 7, 42, 57, 215, 221, 224, 72, 107,
];

/** 固定收尾两位：72（写后 150 ms）→ 107（整批最后一条） */
export const BYPASS_TAIL: readonly number[] = [72, 107];

/** 旁路位集合 —— orderBypassSplit 分段排序用（★ 别删：它是唯一在用的形态） */
const BYPASS_ADDR_SET: ReadonlySet<number> = new Set(BYPASS_ADDRS);

/* ══════════════════ 加载窗时长口径（v3.68 · 2026-10-24 用户拍板）══════════════════
 *
 * 用户原话：「由于硬件加载音色需要时间，所以切换箱头、箱体、过载的时候，要有一个
 * LOADING 提示窗，加载期间禁止其他操作。同样的整组预设加载也是。计算方式，
 * BYPASS 的延迟是 50ms，非 BYPASS 参数单个延迟时间是 15ms，按这个时间做加载窗口时间计算。」
 *
 * 口径：
 *   · 旁路 / 开关类地址（0·7·42·57·72·107·215·221·224）→ **50 ms / 条**
 *   · 其余音色参数                                              → **15 ms / 条**
 *   这是**窗口停留时间**（给固件消化用），不是 BLE 实际发包时间（打包后远快于此）。
 */
export const LOAD_MS_PARAM = 15;
/** 收尾余量：覆盖 BLE 往返 + 遮罩淡入淡出，避免"刚到 100% 就消失" */
export const LOAD_MS_TAIL = 150;
/** 最小窗口：极短批（几帧）也至少停顿这么久，否则遮罩闪一下反而更难受 */
export const LOAD_MS_MIN = 240;


/* ══════════════════ 加载窗时长 · B 口径（v3.70 · 2026-10-24 用户拍板）══════════════════
 *
 * 用户原话：「loading 按 B」。
 *
 * B 口径 = **全部 ×15ms + 尾 150ms**，不再给旁路位额外的 50ms。
 * 为什么可以取消：批次是统一队列，旁路位只是「排在最后」，并不需要单独等它落定 ——
 * 那 50ms 是 v3.58 之前「逐条 + 分级落定」时代的遗留口径。
 *
 * 实测对照（A3→A4，21 帧含 7 个旁路位）：
 *   A 口径 = 7×50 + 14×15 + 150 = 560ms（旧）
 *   B 口径 = 21×15 + 150        = 465ms（现）
 *   固件实际耗时 ≈ 300ms（69 帧/s）
 *
 * 下限 240ms 只用于「极短批也别闪一下就消失」，不是用户口径的一部分。
 */
export function switchWindowMs(frameCount: number): number {
  return Math.max(LOAD_MS_MIN, frameCount * LOAD_MS_PARAM + LOAD_MS_TAIL);
}

/** 某个旁路位写完后需要等待的时间（ms） */
export function bypassDelayMs(addr: number): number {
  if (addr === 42 || addr === 57) return BYPASS_SLOW_MS;
  if (addr === 72) return BYPASS_72_MS;
  return REG_WRITE_MS;
}

/**
 * ★★ v3.74（2026-10-24 用户拍板）：**旁路位按目标值分段排序**
 *
 * 用户原话：「现在 A4 和 A2 写回 A1 时，需要 BYPASS 先在前面，否则有噪音。」
 *
 * 成因：A1 是「全旁路」格（0 / 7 / 57 / 224 = 1）。旧规则（v3.74 已删）把
 * **所有**旁路位一律排到数据之后，于是 A4→A1 的执行顺序是
 *   先写 64 / 66 / 68（箱头参数，此时箱头还开着）→ 最后才 57=1（旁路）。
 * 改参数的那十几帧箱头在满负荷运行 = 用户听到的噪音。
 *
 * 新口径按**目标值**分段（与「参数先、开关后」并不冲突 —— 它只对「要关」的开关破例）：
 *   ① 旁路位 且 目标 = 1（进旁路 / 关掉）→ **最前面**：先停算法，再改参数
 *   ② 数据类 → 地址升序
 *   ③ 旁路位 且 目标 = 0（出旁路 / 打开）→ 最后：参数全部就位才开声
 *   ④ 72 / 107 若目标是「打开」→ 仍固定收尾（72 → 107）
 *
 * 一句话：**关 = 前置，开 = 后置，数据居中。**
 */
export function orderBypassSplit<T>(
  items: T[],
  getAddr: (item: T) => number,
  getVal: (item: T) => number,
): T[] {
  const rank = (a: number, v: number): number => {
    /* ★★★ 2026-10-31（用户拍板）：**箱头总音量（239）必须先落**。
     *   "过载+箱头的所有增益核算到音量衰减之后，在箱头总音量做相应衰减，
     *    而且这个音量参数要放到前面先做衰减，这样不会出现突然爆音。"
     *   排 0.5 = 在"关模块(0)"之后、"其它数据(1)"之前 —— 先压音量，再提增益。 */
    if (a === 239) return 0.5;
    if (!BYPASS_ADDR_SET.has(a)) return 1;              // 数据段
    if (v === 1) return 0;                              // 目标 = 旁路 → 前置
    return BYPASS_TAIL.includes(a) ? 3 : 2;             // 目标 = 开启 → 后置 / 收尾
  };
  return [...items].sort((x, y) => {
    const ax = getAddr(x), ay = getAddr(y);
    const rx = rank(ax, getVal(x));
    const ry = rank(ay, getVal(y));
    if (rx !== ry) return rx - ry;
    if (rx === 3) return BYPASS_TAIL.indexOf(ax) - BYPASS_TAIL.indexOf(ay);
    return ax - ay;
  });
}

/* ══════════════════ 四、A1 全旁路与常开常量 ══════════════════ */

/**
 * A1（槽位 1）全旁路写入集 —— 共 9 个地址（不含 PGA 归零）。
 *   ★ 2026-10-15 口径修正：箱头只写块级【总开关 57 + 72】，
 *     库旁路 58/67/73/82 与分支旁路 63/78 一律不写。
 */
export const A1_BYPASS_ALL: Record<number, number> = {
  0: 1,
  7: 1,
  42: 1,
  57: 1,
  72: 1,
  107: 1,
  215: 1,
  221: 1,
  224: 1,
};

/** 旁路位全集（用于 A1 之后恢复常开） */
export const ALL_BYPASS_ADDRS: readonly number[] = Object.keys(A1_BYPASS_ALL).map(Number);

/**
 * 箱头 / 箱体【常开常量集】—— A2–D4 共 15 档恒为这些值。
 *   · 箱头两个块级总开关 57 / 72 写 0（固件上电默认为 1）
 *   · 箱体 107 写 0
 *   ★ 2026-10-15 口径修正：库旁路 58/67/73/82 与分支旁路 63/78 **不再纳入写入集**，
 *     交回固件/型号数据决定。
 */
export const ALWAYS_ON_REGS: Record<number, number> = {
  57: 0, 72: 0, 107: 0,
};

/** 静音开关（C6）：0 = 正常 / 1 = 静音 */
export const MUTE_ADDR = 260;

/* ══════════════════ 五、白名单与取消区 ══════════════════ */

/**
 * ── 固件可写寄存器地址白名单（2026-10-15 更新，权威口径）──────────────
 *   0-1, 7-13, **42**, 44-51, 53-56, 57-58, 59-66, 67, 68-71, 72-73,
 *   74-81, 82, 83-98, 107-142, 215-223, **224**-229, 239, 254-**261**
 *
 * 变更（相对 2026-10-03）：
 *   · ★ 开放 `42`  —— 过载模块级旁路（C1：踩钉可真正整段旁路过载）
 *   · ★ 开放 `224` —— 混响模块级旁路（C2）
 *   · ★ 开放 `260` —— 静音开关（C6）
 *   · ✗ 移除 `2 / 3 / 240 / 251 / 252 / 253`（C3 等定案取消）
 *   · ✗ 维持免写：`43 / 52`（过载 Pre / Post 库旁路）
 */
export const REG_ADDR_WHITELIST: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [7, 13],
  [42, 42],
  [44, 51], [53, 56],
  [57, 58],
  [59, 66],
  [67, 67],
  [68, 71],
  [72, 73],
  [74, 81],
  [82, 82],
  [83, 98],
  [107, 142],
  [215, 223],
  [224, 229],
  [239, 239],
  [254, 261],
] as const;

/** 地址是否属固件可写范围 */
export const isWritableAddr = (addr: number): boolean =>
  REG_ADDR_WHITELIST.some(([lo, hi]) => addr >= lo && addr <= hi);

/** 白名单策略：删除所有白名单外的地址（就地修改并返回） */
export function applyWhitelistPolicy(regs: Record<number, number>): Record<number, number> {
  for (const k of Object.keys(regs)) {
    const a = Number(k);
    if (!isWritableAddr(a)) delete regs[a];
  }
  return regs;
}

/** 已取消地址（不再属于任何写入集） */
export const CANCELLED_ADDRS: readonly number[] = [2, 3, 240, 251, 252, 253];

/** 免写地址（存在于协议但一律不下发） */
export const CANCELLED_CLEAR_ADDRS: readonly number[] = [43, 52];

/** 保留区（不使用） */
export const RESERVED_RANGES: ReadonlyArray<readonly [number, number]> = [
  [4, 6], [14, 41], [99, 106], [143, 214], [230, 238], [241, 250], [262, 263],
];

/** @deprecated 迁移期兼容：语义等于 applyWhitelistPolicy */
export function applyCancelledPolicy(regs: Record<number, number>): Record<number, number> {
  return applyWhitelistPolicy(regs);
}

/* ══════════════════ 六、模块参数区间 ══════════════════ */

/** 模块「自身参数」地址区间（关闭该模块时整段删除的权威口径） */
export const MODULE_PARAM_RANGES: Record<string, ReadonlyArray<readonly [number, number]>> = {
  compressor: [[4, 13]],
  'amp-head': [[57, 98], [239, 239]],
  cabinet: [[107, 142]],
  reverb: [[224, 229]],
};

/** @deprecated 单段代表版，删除请用 MODULE_PARAM_RANGES */
export const PASSTHROUGH_RANGES: Record<string, [number, number]> = {
  compressor: [4, 13],
  'amp-head': [57, 98],
  cabinet: [107, 142],
  reverb: [224, 229],
};

/**
 * 模块"关"时的写入集 —— 一律是【模块级旁路位】写法。
 *   · 普通模块：单地址写 off 值
 *   · 箱头：块级总开关 **57 与 72 成对写**
 *     ★ 2026-10-15：库旁路 58/67/73/82 与分支级 63/78 均不写
 */
export function getModuleOffRegs(mid: string): Record<number, number> {
  const spec = MODULE_BYPASS[mid];
  if (!spec) return {};
  const out: Record<number, number> = { [spec.addr]: spec.off };
  if (mid === 'amp-head') out[72] = spec.off;
  return out;
}

/** 模块"开"时的写入集（与关闭完全对称） */
export function getModuleOnRegs(mid: string): Record<number, number> {
  const spec = MODULE_BYPASS[mid];
  if (!spec) return {};
  const out: Record<number, number> = { [spec.addr]: spec.on };
  if (mid === 'amp-head') out[72] = spec.on;
  return out;
}

/**
 * @deprecated 旧「整组复位」表已停用。模块关闭一律用 {@link getModuleOffRegs}
 *   （模块级旁路位写法）。保留本别名只为迁移期不破坏引用。
 */
export const PASSTHROUGH_REGS: Record<string, Record<number, number>> = Object.fromEntries(
  Object.keys(MODULE_BYPASS).map(mid => [mid, getModuleOffRegs(mid)]),
);

/** @deprecated 用 {@link MODULE_BYPASS} 的键代替 */
export const PASSTHROUGH_MODULES: readonly string[] = Object.keys(MODULE_BYPASS);

/** @deprecated 旁路位已全部可用，不再区分「保留 / 取消」两类 */
export const LEGACY_BYPASS_MODULES: readonly string[] = [];

/** 模块"开"时若无可听参数的兜底（混响） */
export const REVERB_ON_DEFAULTS: Record<number, number> = {
  225: 30, 226: 16, 227: 21, 228: 126, 229: 20,
};

/** 按型号决定分支级旁路的模块
 *  ★ 2026-10-20（用户拍板）：这些"级/库旁路位"一律不写 —— 一是拖慢切换速度（每条预设 4–7 条白写），
 *     二是用户已确认固件默认就是 0（启用）。开关只保留 MODULE_BYPASS 里的那一张表。
 *     本表保留导出（调用方仍在遍历），但内容为空 = 不产生任何写入。 */
export const INTERNAL_BYPASS_BY_MODULE: Record<string, number> = {};
/** @deprecated 已不写任何级/库旁路位；保留仅为兼容旧引用 */
export const INTERNAL_BYPASS_ADDRS: ReadonlySet<number> = new Set([48, 63, 78]);

/**
 * ★ 2026-10-20（用户拍板）**禁写寄存器**：不进 UI 库、任何写入路径都要滤掉。
 *   · 箱头库旁路 58 / 67 / 73 / 82（N1/N4/N5/N8）
 *   · 箱头级旁路 63 / 78（削波①/②）
 *   · 过载结构位 43 / 48 / 52（PreOD 库 / 削波级 / PostOD 库）
 *   理由：这些位固件默认 0，写了既不改音色，又让每次切档/选型号多跑 3–7 帧。
 */
export const FORBIDDEN_REGS: ReadonlySet<number> = new Set([43, 48, 52, 58, 63, 67, 73, 78, 82]);

/** 从寄存器表里剔除禁写地址（就地修改并返回） */
export function stripForbidden(regs: Record<number, number>): Record<number, number> {
  for (const k of Object.keys(regs)) {
    if (FORBIDDEN_REGS.has(Number(k))) delete regs[Number(k)];
  }
  return regs;
}

/* ══════════════════ 六、开关表（单一真相 · 2026-10-20） ══════════════════
 * 只有这 9 条寄存器参与"模块开关"。boost 走 PGA、静音走 260，不在此表。
 * ★ 开关状态**只由 modules 决定**，与寄存器里存了什么无关 —— 这样切档 / 载入预设 /
 *   保存预设三条路径可以用同一张表对齐，不会再出现"UI 关了但硬件还开着"。
 */
export interface SwitchReg { id: string; regs: readonly number[]; on: number; off: number }

export const SWITCH_TABLE: readonly SwitchReg[] = [
  { id: 'noise-gate', regs: [0], on: 0, off: 1 },
  { id: 'compressor', regs: [7], on: 0, off: 1 },
  { id: 'amp-head', regs: [57, 72], on: 0, off: 1 },
  { id: 'cabinet', regs: [107], on: 0, off: 1 },
  { id: 'chorus', regs: [215], on: 0, off: 1 },
  { id: 'delay', regs: [221], on: 0, off: 1 },
  { id: 'reverb', regs: [224], on: 0, off: 1 },
] as const;

/** 开关地址全集（写入节拍/排序用） */
export const SWITCH_ADDRS: readonly number[] = SWITCH_TABLE.flatMap((s) => [...s.regs]);
export const isSwitchAddr = (addr: number): boolean => SWITCH_ADDRS.includes(addr);

/** modules → 目标开关表。缺字段时：箱头/箱体默认开，其余默认关 */
export function switchPlan(modules?: Record<string, boolean>): Record<number, number> {
  const out: Record<number, number> = {};
  for (const s of SWITCH_TABLE) {
    const def = s.id === 'amp-head' || s.id === 'cabinet';
    const on = modules?.[s.id] ?? def;
    for (const r of s.regs) out[r] = on ? s.on : s.off;
  }
  return out;
}

/* ── 影子表：App 认为硬件里现在的开关值（固件无读命令，只能靠"写过的值"记账） ── */
const switchShadow: Record<number, number> = {};

/** 每次成功写入开关地址后调用（bleService.writeRegister 已自动调用） */
export function noteSwitchWrite(addr: number, value: number): void {
  if (isSwitchAddr(addr)) switchShadow[addr] = value;
}

/** 冷启动 / 断线 → 清空影子，下一次必定全量写 */
export function resetSwitchShadow(): void {
  for (const k of Object.keys(switchShadow)) delete switchShadow[Number(k)];
}

/** 影子表快照（调试/自检用） */
export function snapshotSwitchShadow(): Record<number, number> { return { ...switchShadow }; }

/** 计划 vs 影子 → 需要补写的条目（顺序交给 orderBypassSplit） */
export function switchDiffs(plan: Record<number, number>): Array<{ addr: number; value: number }> {
  const out: Array<{ addr: number; value: number }> = [];
  for (const [a, v] of Object.entries(plan)) {
    if (switchShadow[Number(a)] !== v) out.push({ addr: Number(a), value: v });
  }
  return out;
}

/* ══════════════════ 七、直通 PEQ（历史保留，不再用于踩钉） ══════════════════ */

/** @deprecated 直通 PEQ 值 0x50A78540（PEAK · 500Hz · 0dB） */
export const PASSTHROUGH_PEQ: number =
  buildPEQData(PEQ_TYPE.PEAK, freqToIndex(500), 120, 10, 10);
