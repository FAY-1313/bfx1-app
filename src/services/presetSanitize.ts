/**
 * 预设寄存器净化（v3.76 · D2）
 *
 * ★ 背景（v3.75 审查）：
 *   导入端 `Number(v) >>> 0` 接受任意 32 位值，既不查地址白名单也不查值域 ——
 *     · `{"261": 4294967295}` 会被 buildFrame 截成低字节写进**总音量**；
 *     · `{"999": ...}` 落进 registerStore，之后所有 diff / 切换包都被这条幽灵地址污染；
 *     · `{"43": 1}` 这类禁写位（过载结构位 / 级库旁路）本不该出现在音色里。
 *   导出端同样问题：被污染的音色会把垃圾地址写进交给固件的 Register Map / C Array。
 *
 * ★ 本模块是**唯一**一份「这条寄存器能不能进音色」的判据，导入与导出两端共用。
 *   三条规则，顺序固定（先地址、再语义、后值域），命中即丢弃并计数 —— 不静默吞：
 *     ① 地址必须在固件白名单内（`isWritableAddr`）；
 *     ② 禁写位（`FORBIDDEN_REGS`）与**非音色状态位**（260 静音 / 2 连接态）一律不收；
 *     ③ 值必须是整数且落在该地址的值域内（见 `ADDR_VALUE_RANGE`，缺省 32 位无符号）。
 *
 * ★ 261（输出总音量）单独收紧到 0–50：它在切换批次里由 App 按目标值补写，
 *   导入进来一个 4294967295 只会让总音量瞬间归零 —— 值域外直接丢弃。
 */
import { isWritableAddr, FORBIDDEN_REGS } from '../data/passThrough';

/** 不属于音色的状态位：2 = 连接/静音控制，260 = 静音开关。**261 不在此列**（见 policy 特例） */
export const NON_TONE_ADDRS: ReadonlySet<number> = new Set([2, 260]);

/** 地址特例值域（缺省 = 0 … 0xFFFFFFFF） */
export const ADDR_VALUE_RANGE: Readonly<Record<number, readonly [number, number]>> = {
  /* ★ 261 = M1OutVolume：协议 v2.0 **0…50**（0 = −Inf dB，1…50 = −49…0 dB，1 dB/step），
     见 `data/registerMap.ts:248` 与 `data/parameterMapping`。16 格内置/快照里恒为 50。
     ⚠ 别按「MASTER 0…500」写 —— 那是箱头级 reg239，不是这个。 */
  261: [0, 50],
};

/** 丢弃计数（给用户看的「跳过 N 条」用） */
export interface SanitizeStats {
  /** 地址不在固件白名单 */
  addrInvalid: number;
  /** 禁写位 / 非音色状态位 */
  addrForbidden: number;
  /** 值不是整数或越界 */
  valueBad: number;
}

export const emptyStats = (): SanitizeStats => ({ addrInvalid: 0, addrForbidden: 0, valueBad: 0 });

export const statsTotal = (s: SanitizeStats): number => s.addrInvalid + s.addrForbidden + s.valueBad;

/** 这条地址是否允许出现在音色里（不含值域判断） */
export function isToneAddr(addr: number): boolean {
  if (!Number.isInteger(addr) || addr < 0) return false;
  if (!isWritableAddr(addr)) return false;
  if (FORBIDDEN_REGS.has(addr) || NON_TONE_ADDRS.has(addr)) return false;
  return true;
}

/** 值是否落在该地址的合法值域内 */
export function isToneValue(addr: number, val: number): boolean {
  if (!Number.isInteger(val)) return false;
  const range = ADDR_VALUE_RANGE[addr];
  if (range) return val >= range[0] && val <= range[1];
  return val >= 0 && val <= 0xFFFFFFFF;
}

/**
 * 净化一张寄存器表（返回新对象，不改入参）。
 * @param stats 传入则就地累加丢弃计数（调用方负责创建）
 */
export function sanitizeRegisters(
  regs: Record<number, number> | undefined | null,
  stats?: SanitizeStats,
): Record<number, number> {
  const out: Record<number, number> = {};
  if (!regs) return out;
  for (const key of Object.keys(regs)) {
    const addr = Number(key);
    const val = Number(regs[addr]);
    if (!isToneAddr(addr)) {
      if (stats) { if (Number.isInteger(addr) && isWritableAddr(addr)) stats.addrForbidden++; else stats.addrInvalid++; }
      continue;
    }
    if (!isToneValue(addr, val)) { if (stats) stats.valueBad++; continue; }
    out[addr] = val >>> 0;
  }
  return out;
}

/** 一句话说明丢弃了什么（空表返回空串，调用方据此决定是否提示） */
export function statsMessage(s: SanitizeStats): string {
  const parts: string[] = [];
  if (s.addrInvalid) parts.push(`${s.addrInvalid} 条地址非法`);
  if (s.addrForbidden) parts.push(`${s.addrForbidden} 条禁写/状态位`);
  if (s.valueBad) parts.push(`${s.valueBad} 条数值越界`);
  return parts.join('，');
}
