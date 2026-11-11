/**
 * ══════════════════════════════════════════════════════════════════════════
 * 上传表构造 + 回读比对（2026-11-03 用户拍板 · 方案 A → 2026-11-03 改 EA 口径）
 *
 * ★★★ 2026-11-03（用户要求「上传时用 EA 参数，不下发 DSP，截留；按 EA 值核准」）★★★
 *
 *   背景：用户实测「上传后回读校验通过（表里 116 条一条不差），但切档后的声音
 *   仍与本地试听不同」。既然**表是对的**，差异只可能来自**下发到 DSP 的那一步**。
 *
 *   本版做法（App 侧）：
 *     ① 上传的表改成 **EA 口径** —— 与本地试听（EA 路径）**同一套地址集、同一套值**。
 *        不再是「1a 基线垫底 + 存档覆盖」，而是「本地试听会写的那些参数」，
 *        消除了地址集合与取值口径的差异。
 *     ② 上传（E8/EB/E9）**只写固件本地表**，不下发 DSP —— 这一条本来就是
 *        固件侧的行为（EB 只改 RAM 表，E9 只落盘），本版把它明确成约定。
 *     ③ 上传完成后，App **用 EA 通道把同一份参数直接写进 DSP**（本地试听那条
 *        已验证正常的路），并通知固件「这一格已由 EA 就位」→ 固件切档时
 *        跳过全量下发，DSP 里保留的就是 EA 那份（与本地试听逐帧同源）。
 *     ④ 回读校验的基准也随之变成 EA 口径表 ⇒ "按 EA 值核准"。
 *
 *   三个口径必须记住：
 *   ① `260`（DSP 输出静音）、`2`（输入静音）不是音色，不参与比对；
 *   ② `253`（限幅旁路）不在这 117 条里，它存在固件 flags 里、回读也读不到，跳过；
 *   ③ 其余地址一律以 **EA 口径表** 为准 —— 上传与"回读校验"用的是同一份数据。
 */

import { FW_BANK } from '../data/firmwareBank';

/** 不参与上传/比对（运行态或带外存储） */
export const UPLOAD_SKIP = new Set<number>([2, 253, 260]);

export interface RegDiff {
  addr: number;
  /** App 认为应该是多少（一定有） */
  app: number;
  /** 设备回读值；null = 设备整表里没有这一条（等于丢了） */
  hw: number | null;
}

/**
 * 合成"这台设备该频道应有的整表"—— **EA 口径**。
 *
 * ★ 为什么不再用「1a 基线垫底」：
 *   EA（本地试听）**只写存档里真实存在的那些参数**（Twin 净声 = 105 条），
 *   而 1a 垫底版是 **116 条** —— 多出的 11 条是 1a（线材直通）的值，
 *   与本地试听**根本不是同一套数据**。既然要"上传 = EA"，这里的地址集和值
 *   都必须与 EA 路径一致。
 *
 *   固件侧 `tone_build_full()` 会把整张 117 条表全部下发（含 260 之外的全部），
 *   所以**表里没写的地址 = 固件保留 E8 之后的基线值（1a）**，
 *   而 DSP 里那些地址**根本没被写过**（EA 路径不写）⇒ 两者天然一致。
 *
 * @param registers 存档寄存器（已含 withSwitchPlan 补的 9 条开关位）
 * @param modules   模块开关（决定 PGA 口径：boost 关时 PGA 写 0）
 * @param slot      目标硬件频道号（1~16）
 * @param boost     激励器归一值 0~1（配合 modules.boost 决定 PGA）
 */
/* ★★★ 2026-11-04（用户拍板）：**上传表 = App 音色参数（EA）+ 激励器（ED/PGA）**。
 *   地址集必须正好是固件的 117 条音色表 —— 多一条（表外地址）固件不存也不发，
 *   少一条（没上传）该格就会停在 1a 基线。导出给本地试听/预存包共用，保证
 *   「试听 = 上传 = 固件切档」三套数据同源。 */
const TONE_TABLE_ADDRS: ReadonlySet<number> = new Set(
  Object.keys((FW_BANK[0]?.registers ?? {}) as Record<string, number>).map(Number),
);

/** 地址是否属于固件 117 条音色表（表外地址固件会静默拒收） */
export function isToneTableAddr(a: number): boolean {
  return TONE_TABLE_ADDRS.has(a);
}

export function buildUploadTable(
  registers: Record<number, number>,
  slot: number,
  boost?: number,
  modules?: Record<string, boolean>,
): Record<number, number> {
  const out: Record<number, number> = {};
  /* ★ 只接受固件 117 条表里真实存在的地址：
   *   存档里可能带 240 / 251 / 252 这类"协议合法但不在音色表"的地址，
   *   发过去固件 `tone_set_full` 会静默拒收 —— 若把它们纳入比对，就会永远报
   *   "不一致"，把真正的丢帧淹掉。 */
  for (const [k, v] of Object.entries(registers)) {
    const a = Number(k);
    out[a] = v;
  }
  delete out[260];
  delete out[2];
  for (const k of Object.keys(out)) {
    const a = Number(k);
    if (!isToneTableAddr(a)) delete out[a];
  }
  /* ★ 2026-11-04：**253 不随音色上传**。固件规则固定为「1 组=1，其余组=0」，
   *   由切档时按目标组现算；上传写它会被忽略（也不参与回读比对）。 */
  void slot;
  /* ★★★ PGA 口径与 EA 路径统一（这一条以前两边不一致，是真实的听感差）：
   *   EA（本地试听）：`writePGA(boostOn && bv!==undefined ? round(bv*10) : 0)`
   *   → **boost 模块关时写 0**（= 0x10，0 dB）。
   *   上传（旧）：`0x10 + round(boost*10)`，**不看模块开关** ⇒ boost 关但旋钮
   *   仍有值时，固件会比本地试听多出 3~30 dB 的激励。
   *   现在上传也按 modules.boost 门控：关 → 0x10（0 dB）。 */
  void boost;
  void modules;
  return out;
}

/** 上传用的 PGA 原始值（ES8311 Reg0x14）：与 EA 路径 writePGA 完全同口径 */
export function pgaValueForUpload(
  boost: number | undefined,
  modules?: Record<string, boolean>,
): number {
  const on = modules?.['boost'] ?? false;
  const lv = (boost === undefined || !Number.isFinite(boost))
    ? 0
    : Math.max(0, Math.min(10, Math.round(boost * 10)));
  return 0x10 + (on ? lv : 0);
}

/** 参与比对的地址集合（去掉 2 / 253 / 260） */
export function comparableAddrs(table: Record<number, number>): number[] {
  return Object.keys(table)
    .map(Number)
    .filter((a) => !UPLOAD_SKIP.has(a))
    .sort((a, b) => a - b);
}

/** 逐条比对；设备没回这一条 → 记为 hw=null（丢帧/被拒收） */
export function diffTable(
  expected: Record<number, number>,
  hw: Map<number, number>,
): RegDiff[] {
  const out: RegDiff[] = [];
  for (const a of comparableAddrs(expected)) {
    const app = (expected[a] >>> 0);
    const got = hw.get(a);
    if (got === undefined) {
      out.push({ addr: a, app, hw: null });
    } else if ((got >>> 0) !== app) {
      out.push({ addr: a, app, hw: got >>> 0 });
    }
  }
  return out;
}

/** 给用户看的一句话（每条一行） */
export function describeDiff(d: RegDiff): string {
  const hex = (v: number | null) => (v === null ? '缺失' : `0x${v.toString(16).toUpperCase()}`);
  return `寄存器 ${d.addr}：App ${hex(d.app)} / 硬件 ${hex(d.hw)}`;
}
