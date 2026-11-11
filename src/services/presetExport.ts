/**
 * BFX1 预设导出 · 三种格式（v3.68 · 2026-10-24 用户要求）
 *
 * 用户原话：「我们要按三种格式文件导出」。这三个格式沿用**高级工程模式 → 参数导出**
 * 里已经在用的那套（DebugPanel 的 FORMAT 1/2/3），只是从"屏幕上一段文本"
 * 升级成"三个真实文件"，可以带走给固件/文档/第三方工具用：
 *
 *   ① Register Map   `.txt`  逐条 `REG[addr] = value`
 *   ② BLE Key Frames `.txt`  逐条 12 字节 EA 帧（含校验），可直接对帧比对
 *   ③ C Array        `.c`    `data_chunk_t` 初始化表，固件/仿真直接拷
 *
 * 三条铁律：
 *   · 一个预设 = 一节，节头写 `[A1] 名称`，节内**地址升序**（同一份音色两次导出逐字节一致）；
 *   · 旁路地址在 FORMAT 2/3 里额外标 `*`（它们在写入时是最后发的，人的阅读顺序需要这个提示）；
 *   · 不写 BOM、行尾 `\n`、UTF-8 —— 固件侧 C 编译器与 Windows 记事本都能直接用。
 *
 * ★★ v3.89（2026-10-27 用户要求「三格式导出也要补一条 ED 行，让导出文件与本地库音色一一对应」）：
 *   **激励器 BOOST 不是寄存器**，它走 PGA 芯片 I2C（`ED 00 30 14 v`），寄存器表里没有它。
 *   所以三个格式各补一处**明确的非寄存器区**：
 *     FORMAT 1 → 节末一行 `PGA[BOOST] = <0..10>`（永远不会被误读成 REG[…]）
 *     FORMAT 2 → 节末一行以 `P` 开头的完整 12 字节 I2C 帧（排在全部 EA 帧之后）
 *     FORMAT 3 → 寄存器数组之外单独一个 `uint8_t pga_frame_XX[12]`
 *   帧字节复用 `bleService.buildI2CFrame` / `pgaLevelToValue` —— **同一份算法**，
 *   不在这里重写，否则导出文件和实际下发会分裂成两套。
 */
import type { LocalPreset } from './localPresets';
import { BYPASS_ADDRS } from '../data/passThrough';
/* ★★ v3.76（D2）：注册寄存器净化（与 presetFile 导入端同一份规则） */
import { sanitizeRegisters } from './presetSanitize';
/* ★★ v3.89：PGA 帧与实际下发同源（bleService 的 writePGA 用的就是这两个函数） */
import { buildI2CFrame, pgaLevelToValue } from './bleService';

export interface ExportFile {
  filename: string;
  content: string;
  mime: string;
}

const BYPASS = new Set(BYPASS_ADDRS);

const HEX2 = (n: number) => (n & 0xFF).toString(16).padStart(2, '0').toUpperCase();
const HEX4 = (n: number) => (n & 0xFFFF).toString(16).padStart(4, '0').toUpperCase();

/** 12 字节 EA 帧（含 BE 校验），返回大写十六进制空格分隔 */
function frameHex(reg: number, val: number): string {
  const H = 0xEA;
  const hw = (((H << 24) | ((reg & 0xFF) << 8) | ((reg >>> 8) & 0xFF)) >>> 0);
  const rv = (((val & 0xFF) << 24) | ((val & 0xFF00) << 8) | ((val & 0xFF0000) >> 8) | ((val >>> 24) & 0xFF)) >>> 0;
  const cs = (hw ^ rv) >>> 0;
  return [
    H, 0x00, reg & 0xFF, (reg >>> 8) & 0xFF,
    val & 0xFF, (val >>> 8) & 0xFF, (val >>> 16) & 0xFF, (val >>> 24) & 0xFF,
    (cs >>> 24) & 0xFF, (cs >>> 16) & 0xFF, (cs >>> 8) & 0xFF, cs & 0xFF,
  ].map(HEX2).join(' ');
}

/** C 字面量 4 字节小端：0x00, 0x00, 0x00, 0x00 */
const LE4 = (n: number) =>
  [n & 0xFF, (n >>> 8) & 0xFF, (n >>> 16) & 0xFF, (n >>> 24) & 0xFF]
    .map((b) => `0x${HEX2(b).toLowerCase()}`).join(', ');

const slotLabel = (s: number) => String.fromCharCode(65 + Math.floor((s - 1) / 4)) + (((s - 1) % 4) + 1);

/* ── 激励器 BOOST（PGA，非寄存器） ──────────────────────────────
   `knobValues.boost.BOOST` 存的是 **0…1 归一值**，UI 档位 = round(v × 10)（0…10，3 dB/档）。
   存档里没有这个字段（老音色 / 从未调过）→ 按 0 档导出，与「切回该音色会 writePGA(0)」一致。 */
const PGA_DEVICE = 0x30;
const PGA_REG = 0x14;

function boostLevel(p: LocalPreset): number {
  const v = p.knobValues?.['boost']?.['BOOST'];
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 10) : 0;
  return Math.max(0, Math.min(10, n));
}

/** 12 字节 I2C 帧（与实际下发逐字节一致） */
function pgaFrameBytes(level: number): number[] {
  return buildI2CFrame(PGA_DEVICE, PGA_REG, pgaLevelToValue(level));
}

const pgaFrameHex = (level: number) => pgaFrameBytes(level).map(HEX2).join(' ');
const pgaFrameC = (level: number) => pgaFrameBytes(level).map((b) => '0x' + HEX2(b).toLowerCase()).join(', ');

/** 预设按槽位升序 + 寄存器按地址升序 */
function normalize(presets: LocalPreset[]): Array<{ p: LocalPreset; entries: Array<{ addr: number; val: number }> }> {
  return [...presets]
    .sort((a, b) => (a.slot || 0) - (b.slot || 0))
    .map((p) => {
      /* ★★ v3.76（D2）：这三种文件是交给固件 / 第三方工具的「音色契约」，
         地址白名单 + 禁写位 + 值域先净化一遍，别把垃圾地址写出去。 */
      const regs = sanitizeRegisters(p.registers);
      const entries = Object.keys(regs)
        .map(Number)
        .filter((n) => Number.isFinite(n))
        .sort((a, b) => a - b)
        .map((addr) => ({ addr, val: (regs[addr] >>> 0) }));
      return { p, entries };
    })
    .filter((x) => x.entries.length > 0);
}

function stampForName(): string {
  const d = new Date();
  const p2 = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}`;
}

function head(title: string, count: number): string {
  const d = new Date();
  return [
    `# ═══════════════════════════════════════════════════════════════`,
    `# BFX1 PRESET EXPORT · ${title}`,
    `# exportedAt : ${d.toISOString()}`,
    `# presets    : ${count}`,
    `# ═══════════════════════════════════════════════════════════════`,
    ``,
  ].join('\n');
}

/** ① Register Map */
export function buildRegisterMap(presets: LocalPreset[]): string {
  const list = normalize(presets);
  let out = head('FORMAT 1 · Register Map', list.length);
  for (const { p, entries } of list) {
    const by = entries.filter((e) => BYPASS.has(e.addr)).length;
    const bl = boostLevel(p);
    out += `\n## [${slotLabel(p.slot)}] ${p.name || ''}   regs=${entries.length} bypass=${by} boost=${bl}\n`;
    for (const e of entries) out += `REG[${e.addr}] = ${e.val}\n`;
    /* ★★ v3.89：非寄存器参数单独一行 —— `PGA[...]` 前缀让它与 REG[...] 永不混淆 */
    out += `# 激励 BOOST 走 PGA I2C（非寄存器），0…10 档 × 3 dB\n`;
    out += `PGA[BOOST] = ${bl}   # ${bl * 3} dB\n`;
  }
  return out;
}

/** ② BLE Key Frames（EA） */
export function buildBleFrames(presets: LocalPreset[]): string {
  const list = normalize(presets);
  let out = head('FORMAT 2 · BLE Key Frames (EA, 12 bytes each)', list.length);
  out += `# 行格式: <槽位> <地址> <REG>  完整 12 字节帧 (EA 00 lo hi v0 v1 v2 v3 ck0 ck1 ck2 ck3)\n`;
  out += `# 带 * 的是旁路/开关地址 —— 下发时必须排在数据类之后\n`;
  out += `# 带 P 的是激励 PGA 帧（ED 00 30 14 …，I2C 非寄存器）—— 必须排在同一槽位全部 EA 帧之后\n`;
  for (const { p, entries } of list) {
    const bl = boostLevel(p);
    out += `\n## [${slotLabel(p.slot)}] ${p.name || ''}   boost=${bl}\n`;
    for (const e of entries) {
      const mark = BYPASS.has(e.addr) ? '*' : ' ';
      out += `${mark}${slotLabel(p.slot)} 0x${HEX4(e.addr)} ${String(e.addr).padStart(3, ' ')}  ${frameHex(e.addr, e.val)}\n`;
    }
    out += `P ${slotLabel(p.slot)} PGA       ${String(bl).padStart(2, ' ')}  ${pgaFrameHex(bl)}\n`;
  }
  return out;
}

/** ③ C Array */
export function buildCArray(presets: LocalPreset[]): string {
  const list = normalize(presets);
  let out = head('FORMAT 3 · C Array (data_chunk_t)', list.length).replace(/^#/gm, '//');
  for (const { p, entries } of list) {
    const tag = slotLabel(p.slot);
    const maxAddr = Math.max(...entries.map((e) => e.addr));
    const arr = new Array(maxAddr + 1).fill(0);
    for (const e of entries) arr[e.addr] = e.val;
    out += `\n/* [${tag}] ${p.name || ''} : REG 0..${maxAddr}, ${entries.length} valid · PGA BOOST = ${boostLevel(p)} */\n`;
    out += `const data_chunk_t all_data_${tag}[] = {\n`;
    for (let i = 0; i < arr.length; i += 1) {
      const mark = BYPASS.has(i) ? ' *bypass' : '';
      out += `    { ${LE4(i)}, ${LE4(arr[i])} }, // REG ${i} = ${arr[i]}${mark}\n`;
    }
    out += `};\n`;
    /* ★★ v3.89：PGA 帧不进 data_chunk_t（它不是寄存器），单独一个 12 字节数组 */
    out += `/* 激励 BOOST = ${boostLevel(p)} 档 (${boostLevel(p) * 3} dB) —— I2C 帧，非寄存器；须在全部 EA 帧之后发送 */\n`;
    out += `const uint8_t pga_frame_${tag}[12] = { ${pgaFrameC(boostLevel(p))} };\n`;
  }
  return out;
}

/**
 * 生成三个文件（文件名带时间戳，一次导出不会覆盖上一次）。
 * @param presets 要导出的预设（一般是本地库全部有数据的槽位）
 */
export function buildThreeFormatFiles(presets: LocalPreset[]): ExportFile[] {
  const stamp = stampForName();
  return [
    { filename: `bfx1-registers-${stamp}.txt`, content: buildRegisterMap(presets), mime: 'text/plain' },
    { filename: `bfx1-bleframes-${stamp}.txt`, content: buildBleFrames(presets), mime: 'text/plain' },
    { filename: `bfx1-datachunk-${stamp}.c`, content: buildCArray(presets), mime: 'text/plain' },
  ];
}
