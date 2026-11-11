/**
 * 配色主题（★ 2026-10-17 用户要求）
 *
 * 需求：
 *   · 点模块底板空白处 → 该模块换一个随机柔和色（浅、低饱和、单色半透明）
 *   · 点顶栏「LOGO 与蓝牙图标之间」的空白处 → 换**整页底板**的颜色
 *   · 双击 TONE 菜单键 → 复位为默认配色
 *   · 长按 TONE 菜单键 → 锁定当前配色（再长按解锁）
 *
 * 为什么单独做成一个 store：
 *   配色要被三处同时用 —— 首页模块（HomePanel）、顶栏空白（Index）、底部 TONE 键（Index）。
 *   HomePanel 是 Index 的子组件，把 state 层层往下传不如做一个极简的订阅式 store：
 *   谁改了颜色，所有订阅者同步刷新。
 *
 * 存储：`bfx_accents_v1`（颜色表，键 = 模块 id 或 '__bg'）、`bfx_accents_locked`（锁定态）。
 */

export type AccentMap = Record<string, string>;

/** 整页底板在颜色表里的键 */
export const BG_ID = '__bg';
/** 底板默认色（与改造前的首页底色一致） */
export const BG_DEFAULT = '#24262b';

const ACCENT_KEY = 'bfx_accents_v1';
const LOCK_KEY = 'bfx_accents_locked';

function hslToHex(h: number, sat: number, lig: number): string {
  const s1 = sat / 100;
  const l1 = lig / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s1 * Math.min(l1, 1 - l1);
  const f = (n: number) => l1 - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const to = (x: number) => Math.round(255 * x).toString(16).padStart(2, '0');
  return `#${to(f(0))}${to(f(8))}${to(f(4))}`;
}

/** 绕开品牌橙（12–48°），保证不跟主色调抢 */
function safeHue(): number {
  const h = Math.floor(Math.random() * 360);
  return h >= 12 && h <= 48 ? (h + 100) % 360 : h;
}

/**
 * 模块色：粉彩（亮 64–74% / 饱和 48–68%）。
 * 落在深色底上就是一层淡淡的单色，用作 11% 透明度的底色 + 53% 的描边。
 */
export function randomPastel(prev?: string): string {
  for (let i = 0; i < 12; i++) {
    const c = hslToHex(safeHue(), 48 + Math.random() * 20, 64 + Math.random() * 10);
    if (!prev || c.toLowerCase() !== prev.toLowerCase()) return c;
  }
  return hslToHex(safeHue(), 55, 68);
}

/**
 * 底板色：**深灰同族**（亮 14–18% / 饱和 8–16%）。
 * ★ 2026-11-11：原来亮 7–13% 落到纯黑附近，用户反馈「整体偏黑看不清」，
 *   抬到深空灰区间；饱和度压低，避免整页发白或偏色。
 */
export function randomDarkTint(prev?: string): string {
  for (let i = 0; i < 12; i++) {
    const c = hslToHex(safeHue(), 8 + Math.random() * 8, 14 + Math.random() * 4);
    if (!prev || c.toLowerCase() !== prev.toLowerCase()) return c;
  }
  return hslToHex(safeHue(), 12, 16);
}

/** 亮度（0–1）；用来识别历史遗留的「近黑底板色」 */
function luminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return 1;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function loadMap(): AccentMap {
  try {
    const raw = localStorage.getItem(ACCENT_KEY);
    const o = raw ? JSON.parse(raw) : null;
    if (!o || typeof o !== 'object') return {};
    /* ★ 2026-11-11：老版本换过的底板色可能接近纯黑（亮 7–13%），
       沿用会让「深空灰」改造在升级后失效 → 过暗的直接丢弃，回落到新默认色 */
    const bg = (o as AccentMap)[BG_ID];
    if (typeof bg === 'string' && luminance(bg) < 0.08) delete (o as AccentMap)[BG_ID];
    return o as AccentMap;
  } catch { return {}; }
}

function loadLocked(): boolean {
  try { return localStorage.getItem(LOCK_KEY) === '1'; } catch { return false; }
}

let map: AccentMap = loadMap();
let locked: boolean = loadLocked();
const subs = new Set<() => void>();

function persist(): void {
  try {
    localStorage.setItem(ACCENT_KEY, JSON.stringify(map));
    localStorage.setItem(LOCK_KEY, locked ? '1' : '0');
  } catch { /* 配额满 / 隐私模式 → 忽略 */ }
}

function emit(): void {
  subs.forEach((fn) => { try { fn(); } catch { /* 单个订阅者出错不影响其它 */ } });
}

export function subscribeAccents(fn: () => void): () => void {
  subs.add(fn);
  return () => { subs.delete(fn); };
}

export function getAccents(): AccentMap { return map; }
export function isAccentLocked(): boolean { return locked; }
export function accentOf(id: string, fallback?: string): string { return map[id] ?? fallback ?? '#e8b860'; }
export function bgTint(): string { return map[BG_ID] ?? BG_DEFAULT; }

/**
 * 换一个颜色。
 * @param id  模块 id；传 `BG_ID` 时换底板（用深色系）
 * @param fallback 没有历史颜色时的参考色（模块原主题色），用于避免随机出同色
 * @returns 是否真的换了（锁定时返回 false）
 */
export function rollAccent(id: string, fallback?: string): boolean {
  if (locked) return false;
  const prev = map[id] ?? fallback;
  const next = id === BG_ID ? randomDarkTint(prev) : randomPastel(prev);
  map = { ...map, [id]: next };
  persist();
  emit();
  return true;
}

/** 复位为默认配色（同时解除锁定） */
export function resetAccents(): void {
  map = {};
  locked = false;
  persist();
  emit();
}

/** 锁定 / 解锁；返回新的锁定状态 */
export function toggleAccentLock(): boolean {
  locked = !locked;
  persist();
  emit();
  return locked;
}
