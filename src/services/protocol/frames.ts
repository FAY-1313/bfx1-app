/**
 * BFX1 / JL7018 BLE 协议帧编解码（纯函数，无副作用、不依赖传输层）。
 * ★ 2026-11-24：从 services/bleService.ts 原样搬出；bleService 仍 re-export 这些名字，旧 import 不受影响。
 *
 * 12 字节帧：[0] 包头 [1] 0x00/sub [2-3] RegAddr LE [4-7] Value LE [8-11] CheckSum BE
 *   CheckSum = BE32(header, sub, addr_lo, addr_hi) ^ BE32(value 的 4 个 LE 字节)
 */

// PGA Gain via I2C: header=0xED00, device=0x30, register=0x14
// PGA levels: 0=0dB, 1=3dB, 2=6dB, 3=9dB, 4=12dB, 5=15dB, 6=18dB, 7=21dB, 8=24dB, 9=27dB, 10=30dB
export const I2C_HEADER = 0xED;
export const I2C_DEVICE = 0x30;
export const I2C_REG_PGA = 0x14; // Register 0x14, bits[3:0] = PGA gain

/** Build 12-byte I2C frame for PGA control */
export function buildI2CFrame(deviceAddr: number, regAddr: number, value: number): number[] {
  const f = new Array<number>(12).fill(0);
  f[0] = I2C_HEADER; f[1] = 0x00;
  f[2] = deviceAddr & 0xff;
  f[3] = regAddr & 0xff;
  f[4] = value & 0xff; f[5] = (value>>8)&0xff;
  f[6] = (value>>16)&0xff; f[7] = (value>>24)&0xff;
  const headerBE = (I2C_HEADER<<24) | ((deviceAddr&0xff)<<8) | (regAddr&0xff);
  const valBE = ((value&0xff)<<24) | (((value>>8)&0xff)<<16) | (((value>>16)&0xff)<<8) | ((value>>>24)&0xff);
  const cs = (headerBE ^ valBE) >>> 0;
  f[8] = (cs>>>24)&0xff; f[9] = (cs>>>16)&0xff;
  f[10] = (cs>>>8)&0xff; f[11] = cs&0xff;
  return f;
}

/** PGA gain lookup: level 0-10 → register value */
export function pgaLevelToValue(level: number): number {
  return 0x10 | (Math.max(0, Math.min(10, Math.round(level))) & 0x0F);
}

// ─── Checksum ───────────────────────────────────────────────────────
// CheckSum = BE32([header, 0x00, regAddr_lo, regAddr_hi]) ^ BE32(LE_bytes(regValue))
// 校验值以大端序放入 [8..11] (参见协议 §1.2)
export function calcChecksum(header: number, regAddr: number, regValue: number): number {
  // BE32: header as MSB, then 0x00, then regAddr_lo, regAddr_hi as LSB
  const headerRegBE = (header << 24) | ((regAddr & 0xff) << 8) | ((regAddr >> 8) & 0xff);
  // The 4 regValue LE-bytes interpreted as BE32 (byte-swapped regValue)
  const regValBE = ((regValue & 0xff) << 24) | (((regValue >> 8) & 0xff) << 16) |
                   (((regValue >> 16) & 0xff) << 8) | ((regValue >>> 24) & 0xff);
  return (headerRegBE ^ regValBE) >>> 0;
}

export function buildFrame(header: number, regAddr: number, regValue: number): number[] {
  const frame = new Array<number>(12).fill(0);
  frame[0] = header;
  frame[1] = 0x00;
  frame[2] = regAddr & 0xff;
  frame[3] = (regAddr >> 8) & 0xff;
  frame[4] = regValue & 0xff;
  frame[5] = (regValue >> 8) & 0xff;
  frame[6] = (regValue >> 16) & 0xff;
  frame[7] = (regValue >> 24) & 0xff;
  const cs = calcChecksum(header, regAddr, regValue);
  // 校验值以大端序存储 (MSB first)
  frame[8] = (cs >>> 24) & 0xff;
  frame[9] = (cs >>> 16) & 0xff;
  frame[10] = (cs >>> 8) & 0xff;
  frame[11] = cs & 0xff;
  return frame;
}

/* ★S2c：EB/E8/E9 用的帧（带 sub 字节：表类型+频道）
 * 校验公式不变：hdrBE 多了 sub<<16（对应帧[1]） */
export function buildFrameSub(header: number, sub: number, regAddr: number, regValue: number): number[] {
  const frame = new Array<number>(12).fill(0);
  frame[0] = header & 0xff;
  frame[1] = sub & 0xff;
  frame[2] = regAddr & 0xff;
  frame[3] = (regAddr >> 8) & 0xff;
  frame[4] = regValue & 0xff;
  frame[5] = (regValue >> 8) & 0xff;
  frame[6] = (regValue >> 16) & 0xff;
  frame[7] = (regValue >> 24) & 0xff;
  const hdrBE = (((header & 0xff) << 24) | ((sub & 0xff) << 16) |
                 ((regAddr & 0xff) << 8) | ((regAddr >> 8) & 0xff)) >>> 0;
  const valBE = (((regValue & 0xff) << 24) | (((regValue >> 8) & 0xff) << 16) |
                 (((regValue >> 16) & 0xff) << 8) | ((regValue >>> 24) & 0xff)) >>> 0;
  const cs = (hdrBE ^ valBE) >>> 0;
  frame[8] = (cs >>> 24) & 0xff;
  frame[9] = (cs >>> 16) & 0xff;
  frame[10] = (cs >>> 8) & 0xff;
  frame[11] = cs & 0xff;
  return frame;
}

export function parseFrame(data: number[]): {
  header: number; regAddr: number; regValue: number; checksum: number;
} | null {
  if (data.length < 12) return null;
  const header = data[0];
  const regAddr = data[2] | (data[3] << 8);
  /* ★ 2026-10-17 修复：必须 >>> 0 转无符号。
     JS 的 `<<` 产出的是 int32，第 31 位置 1 时结果是负数（如 0xF8000000 → -134217728），
     而 calcChecksum 返回的是 >>> 0 的无符号值 —— 用 === 直接比较会永远不相等，
     导致 parseFrame 在本该成功的帧上返回 null（实测 62% 的 PEQ 帧被误判为校验失败）。
     PEQ 的 S 字段占 bit27…31，S≥16 时必触发；校验值的 bit31 = 1 ^ (value.bit7)。 */
  const regValue = (data[4] | (data[5] << 8) | (data[6] << 16) | (data[7] << 24)) >>> 0;
  // checksum is big-endian stored (MSB first)
  const checksum = ((data[8] << 24) | (data[9] << 16) | (data[10] << 8) | data[11]) >>> 0;
  if (checksum !== calcChecksum(header, regAddr, regValue)) return null;
  return { header, regAddr, regValue, checksum };
}
