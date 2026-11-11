/**
 * BFX1 · 全寄存器扫描图（循环压测用 · 2026-10-17）
 *
 * 目的：给「5ms 全寄存器循环测试」包提供一张**覆盖每个可写寄存器**的参数图，
 *      16 个预设共用它，方便蓝牙端逐条核对是否完整收到。
 *
 * 取值规则（三条，全部为了保证"这次写是真的被发出去、且不会把设备搞成没声音"）：
 *   1. 安全固定值：239 箱头 MASTER = 40、260 静音 = 0、261 输出 = 50（0 dB）
 *      —— 避免循环测试时被静音 / 音量归零，让人误以为"没收到"；
 *   2. 旁路位（BYPASS_ADDRS：0/7/42/57/72/107/215/221/224）一律写 0 = 启用
 *      —— 保证固件在处理"模块参数写"时该模块是开着的；
 *   3. 其余按顺序循环 1…15 —— 都是合法小值，且相邻地址取值不同，
 *      除了"有没有到"，还能发现"地址与值错位"这类帧解析问题。
 *
 * 地址来源 = `REG_ADDR_WHITELIST`（全工程唯一的"可写地址"权威），共 124 个。
 */
import { REG_ADDR_WHITELIST, BYPASS_ADDRS } from '../passThrough';
import { REG } from '../registerMap';

/** 写死的安全值（其余寄存器走 1…15 循环） */
const SAFETY: Record<number, number> = {
  239: 40,   // 箱头 MASTER（≈ 中间位置，保证有声音）
  260: 0,    // 输出静音 = 关
  261: 50,   // 输出音量 = 0 dB（0…50 映射 -50…0 dB）
};

const BYPASS_SET = new Set<number>(BYPASS_ADDRS);

export const TEST_SWEEP_MAP: Record<number, number> = (() => {
  const out: Record<number, number> = {};
  let cycle = 0;
  for (const [lo, hi] of REG_ADDR_WHITELIST) {
    for (let a = lo; a <= hi; a++) {
      if (a in SAFETY) { out[a] = SAFETY[a]; continue; }
      if (BYPASS_SET.has(a)) { out[a] = 0; continue; }
      out[a] = (cycle % 15) + 1;
      cycle++;
    }
  }
  return out;
})();

/** 升序地址表（文档与调试打印用） */
export const TEST_SWEEP_ADDRS: number[] = Object.keys(TEST_SWEEP_MAP)
  .map(Number)
  .sort((a, b) => a - b);

/** 该地址是否被强制成"安全值"（文档里要标注出来，否则蓝牙端会以为是规律值） */
export const isSafetyAddr = (a: number): boolean => a in SAFETY;
/** 该地址是否旁路位（文档里标注 0 = 启用） */
export const isBypassAddr = (a: number): boolean => BYPASS_SET.has(a);

/** REG 反查：地址 → 寄存器名（同一地址多别名时取第一个） */
const NAME_BY_ADDR: Record<number, string> = (() => {
  const m: Record<number, string> = {};
  for (const [name, addr] of Object.entries(REG)) {
    const a = Number(addr);
    if (!(a in m)) m[a] = name;
  }
  return m;
})();

export const nameOfAddr = (a: number): string => NAME_BY_ADDR[a] ?? '';

/** 便于日志确认：扫描图规模与校验和 */
export const TEST_SWEEP_COUNT = TEST_SWEEP_ADDRS.length;
export const TEST_SWEEP_SUM = TEST_SWEEP_ADDRS.reduce((s, a) => s + TEST_SWEEP_MAP[a], 0);
