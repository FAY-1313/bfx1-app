/**
 * BFX1 预设文件（.json）—— 本地库 / 调试面板共用的导出格式（v72 · 2026-10-16）
 *
 * 目的（用户 2026-10-16 要求）：
 *   「在本地库增加一个参数导出功能，可以导出一个所有参数的文件，方便导入 APK 来做预设音色。」
 *
 * 文件结构 —— 一条预设 = `modules + subModels + knobValues + registers` 四件套，
 * 其中 `registers` 是【权威真值】（加载时逐条写进硬件的就是它），其余三项是可读的链路镜像。
 *
 *   {
 *     "format": "BFX1-PRESET",
 *     "version": 1,
 *     "app": "BFX1",
 *     "exportedAt": "2026-10-16T15:20:00.000Z",
 *     "presets": [ { slot, name, playMode, modules, subModels, knobValues, registers, savedAt } ]
 *   }
 *
 * ★ v74 落盘方式再修正（用户 2026-10-16 实测：「没有弹出文件分享，只提示存了 JSON，
 *   但是我搜不到」）：
 *   ① Blob + a.download —— Android WebView 无 DownloadListener，下载被吞；
 *   ② navigator.share({files}) / canShare({files}) —— 本机 WebView 不可用。
 *   两者都在此环境失效，故导出改为【原生优先】：
 *     ① Android 原生 FileSaver 插件（MediaStore）→ 写入「下载/BFX1/」，立即可搜索；
 *     ② 原生失败/非 Android → 系统分享（带文件）→ 纯文本分享 → Blob 下载。
 *   原生插件源码：android/app/src/main/java/com/bfx1/processor/plugins/FileSaverPlugin.java
 *   （app 模块内自建，JDK 17 可编译，不引入 @capacitor/filesystem——那需要 JDK 21）。
 */
import type { LocalPreset } from './localPresets';
import {
  savePresetFileNative,
  savePresetFileAsNative,
  type NativeSaveResult,
} from './fileSaver';
/* ★★ v3.76（D2）：导入 / 导出共用的寄存器净化规则（地址白名单 · 禁写位 · 值域） */
import { sanitizeRegisters, emptyStats, statsMessage, type SanitizeStats } from './presetSanitize';

export const PRESET_FILE_FORMAT = 'BFX1-PRESET';
export const PRESET_FILE_VERSION = 1;

export interface PresetFile {
  format: typeof PRESET_FILE_FORMAT;
  version: number;
  app: 'BFX1';
  exportedAt: string;
  note?: string;
  presets: LocalPreset[];
}

/** 按地址升序重排 registers —— 人读友好，且同一份音色两次导出的文本完全一致（便于 diff） */
function sortRegisters(regs: Record<number, number> | undefined): Record<number, number> {
  /* ★★ v3.76（D2）：导出端同样过一遍净化 —— 存档里若混进禁写位 / 非法地址，
     不写到给固件和第三方工具看的文件里（导出文件是「音色契约」，不能带垃圾）。 */
  const src = sanitizeRegisters(regs);
  const keys = Object.keys(src)
    .map(Number)
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);
  const out: Record<string, number> = {};
  for (const k of keys) out[String(k)] = src[k] >>> 0;
  return out as unknown as Record<number, number>;
}

function normalizePreset(p: LocalPreset): LocalPreset {
  return {
    slot: p.slot,
    name: p.name,
    playMode: p.playMode,
    modules: { ...(p.modules ?? {}) },
    subModels: { ...(p.subModels ?? {}) },
    knobValues: { ...(p.knobValues ?? {}) },
    registers: sortRegisters(p.registers),
    ...(p.io ? { io: p.io } : {}),
    savedAt: p.savedAt,
  };
}

/** 序列化成文件文本（UTF-8、缩进 2、不写 BOM） */
export function serializePresetFile(presets: LocalPreset[], note?: string): string {
  const file: PresetFile = {
    format: PRESET_FILE_FORMAT,
    version: PRESET_FILE_VERSION,
    app: 'BFX1',
    exportedAt: new Date().toISOString(),
    ...(note ? { note } : {}),
    presets: presets.map(normalizePreset),
  };
  return JSON.stringify(file, null, 2);
}

/** 文件名安全化：去掉路径分隔符与 Windows 保留字符 */
export function safeFileName(name: string): string {
  const cleaned = (name || '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .trim()
    .slice(0, 60);
  return cleaned || 'preset';
}

function stamp(): string {
  const d = new Date();
  const p2 = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}`;
}

/** 导出一条用 `bfx1-<名称>-<时间>.json`；导出全部用 `bfx1-presets-<条数>-<时间>.json` */
export function presetFileName(presets: LocalPreset[], single?: LocalPreset): string {
  if (single) return `bfx1-${safeFileName(single.name)}-${stamp()}.json`;
  return `bfx1-presets-${presets.length}-${stamp()}.json`;
}

export interface SaveResult {
  /** 是否成功 */
  ok: boolean;
  /** 给用户看的一句话（含落盘位置或失败原因） */
  message: string;
  /** 用了哪条路径（便于排查） */
  via?: NativeSaveResult['via'];
  /** 原生落盘成功时的显示路径，如「下载/BFX1/xxx.json」 */
  displayPath?: string;
}

/**
 * ★ v74：导出预设文件 —— 原生优先 + 多级降级，见文件头说明。
 *   Android 真机：一步写入「下载/BFX1/<filename>」，消息里带完整路径。
 */
export async function savePresetFile(filename: string, text: string): Promise<SaveResult> {
  return savePresetFileNative(filename, text);
}

/** ★ v74：另存为 —— 调起系统目录选择器，由用户自选保存位置 */
export async function savePresetFileAs(filename: string, text: string): Promise<SaveResult> {
  return savePresetFileAsNative(filename, text);
}

/**
 * ★ v69：读取一个预设文件（供「导入」用）。
 * 走隐藏 `<input type="file">` —— WebView 与浏览器都可用，不依赖额外权限。
 * 返回文件文本；用户取消时返回 null。
 */
export function pickPresetFile(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.style.position = 'fixed';
    input.style.left = '-9999px';
    document.body.appendChild(input);
    const done = (v: string | null) => {
      input.remove();
      resolve(v);
    };
    input.onchange = () => {
      const f = input.files?.[0];
      if (!f) { done(null); return; }
      const reader = new FileReader();
      reader.onload = () => done(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => done(null);
      reader.readAsText(f);
    };
    /* 用户取消时 input 不触发 change —— 用 focus 回归做兜底 */
    window.setTimeout(() => {
      if (!input.files || input.files.length === 0) done(null);
    }, 60000);
    input.click();
  });
}

/* ────────────────────────── 解析（为将来「导入」预留，本轮 UI 未接线） ────────────────────────── */

export type ParseResult =
  | { ok: true; presets: LocalPreset[]; warnings: string[] }
  | { ok: false; error: string };

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function coerceRegisters(raw: unknown, stats: SanitizeStats): Record<number, number> | null {
  if (!isObj(raw)) return null;
  /* ★★ v3.76（D2）：地址白名单 + 禁写位 + 值域三关，规则见 services/presetSanitize.ts。
     旧实现只判 isFinite 就 `>>> 0` —— 261 写成 4294967295 会把总音量打到最低，
     非法地址还会落进 registerStore 污染后续所有 diff 与切换包。 */
  const numeric: Record<number, number> = {};
  for (const [k, v] of Object.entries(raw)) {
    const addr = Number(k);
    const val = Number(v);
    if (!Number.isFinite(addr) || !Number.isFinite(val)) { stats.addrInvalid++; continue; }
    numeric[addr] = val;
  }
  return sanitizeRegisters(numeric, stats);
}

/** 解析 BFX1 预设文件：做格式/版本/字段的最小必要校验，坏条目计入 warnings 而不是整体失败 */
export function parsePresetFile(text: string): ParseResult {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return { ok: false, error: '不是合法的 JSON 文件' }; }
  if (!isObj(raw)) return { ok: false, error: '文件根节点不是对象' };
  if (raw.format !== PRESET_FILE_FORMAT) {
    return { ok: false, error: `不是 BFX1 预设文件（format=${String(raw.format)}）` };
  }
  const version = Number(raw.version);
  if (!Number.isFinite(version) || version > PRESET_FILE_VERSION) {
    return { ok: false, error: `文件版本 ${String(raw.version)} 高于本机支持的 ${PRESET_FILE_VERSION}` };
  }
  if (!Array.isArray(raw.presets)) return { ok: false, error: '缺少 presets 数组' };

  const warnings: string[] = [];
  const presets: LocalPreset[] = [];
  /* ★★ v3.76（D2）：全文件累计被丢弃的寄存器条数，结束时**明确告知**用户，
     不静默丢 —— 「导入成功」但音色少了一半参数是最难查的一类问题。 */
  const stats = emptyStats();
  raw.presets.forEach((p, i) => {
    if (!isObj(p)) { warnings.push(`第 ${i + 1} 条不是对象，已跳过`); return; }
    const before = stats.addrInvalid + stats.addrForbidden + stats.valueBad;
    const registers = coerceRegisters(p.registers, stats);
    const dropped = (stats.addrInvalid + stats.addrForbidden + stats.valueBad) - before;
    if (!registers || Object.keys(registers).length === 0) {
      warnings.push(`「${String(p.name ?? i + 1)}」没有可用的 registers，已跳过`);
      return;
    }
    if (dropped > 0) warnings.push(`「${String(p.name ?? i + 1)}」跳过 ${dropped} 条非法寄存器`);
    const slot = Number(p.slot);
    presets.push({
      slot: Number.isFinite(slot) && slot >= 1 && slot <= 16 ? slot : ((i % 16) + 1),
      name: typeof p.name === 'string' && p.name.trim() ? p.name.trim() : `预设 ${i + 1}`,
      playMode: p.playMode === 'bass' ? 'bass' : 'guitar',
      modules: isObj(p.modules) ? (p.modules as Record<string, boolean>) : {},
      subModels: isObj(p.subModels) ? (p.subModels as Record<string, string>) : {},
      knobValues: isObj(p.knobValues) ? (p.knobValues as Record<string, Record<string, number>>) : {},
      registers,
      ...(isObj(p.io) ? { io: p.io as LocalPreset['io'] } : {}),
      savedAt: Number.isFinite(Number(p.savedAt)) ? Number(p.savedAt) : Date.now(),
    });
  });
  if (presets.length === 0) return { ok: false, error: '文件里没有可用的预设' };
  const droppedMsg = statsMessage(stats);
  if (droppedMsg) warnings.push(`共丢弃 ${droppedMsg}`);
  return { ok: true, presets, warnings };
}
