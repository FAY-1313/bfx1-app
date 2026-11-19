/**
 * 本地预设档位银行 — 本地模式无需登录, 快照存 localStorage (app 沙箱本地文件)
 * 结构镜像 cloudbase PresetData, 但不含 user_phone/_id
 */
export interface LocalPreset {
  slot: number;        // 1-16
  name: string;
  /** ★ 2026-10-21（用户要求中英可切换）：英文名；缺省回退 name */
  nameEn?: string;
  playMode: string;
  modules: Record<string, boolean>;
  subModels: Record<string, string>;
  knobValues: Record<string, Record<string, number>>;
  registers: Record<number, number>;
  io?: { inputVol: number; outputVol: number; inputMute: boolean; outputMute: boolean };
  savedAt: number;
}

const BANK_KEY = 'bfx_presetBank';
const MODE_KEY = 'bfx_presetMode';

export type PresetMode = 'local' | 'cloud';

export function getPresetMode(): PresetMode {
  try {
    return localStorage.getItem(MODE_KEY) === 'cloud' ? 'cloud' : 'local';
  } catch {
    return 'local';
  }
}

export function setPresetMode(mode: PresetMode): void {
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch { /* ignore */ }
}

function readBank(): Record<number, LocalPreset> {
  try {
    const raw = localStorage.getItem(BANK_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function writeBank(bank: Record<number, LocalPreset>): void {
  try {
    localStorage.setItem(BANK_KEY, JSON.stringify(bank));
  } catch { /* ignore quota errors */ }
}

export function savePresetLocal(data: LocalPreset): void {
  const bank = readBank();
  bank[data.slot] = { ...data, savedAt: Date.now() };
  writeBank(bank);
}

export function getPresetLocal(slot: number): LocalPreset | null {
  return readBank()[slot] ?? null;
}

export function loadPresetsLocal(): LocalPreset[] {
  return Object.values(readBank()).sort((a, b) => a.slot - b.slot);
}

export function deletePresetLocal(slot: number): void {
  const bank = readBank();
  if (slot in bank) {
    delete bank[slot];
    writeBank(bank);
  }
}

// ─── A8 一致性保障 (2026-09-22): 频道"未同步到硬件"标记 ─────────────────────
// A1 之后切台只发 EE XX, 硬件按"本频道已上传数据"重建 →
// 本地库任何写入(替换/收藏保存/播种)若未同步到硬件, 切台就会出现软硬件不一致。
// 已连接时立即 EB 上传 → markChannelClean; 未连接 → markChannelDirty, 连接后自动补传。
const DIRTY_KEY = 'bfx_presetDirtySlots';

function readDirty(): Set<number> {
  try {
    const raw = localStorage.getItem(DIRTY_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr.filter((n: unknown) => typeof n === 'number') : []);
  } catch {
    return new Set();
  }
}

function writeDirty(set: Set<number>): void {
  try {
    localStorage.setItem(DIRTY_KEY, JSON.stringify([...set]));
  } catch { /* ignore */ }
}

/** 标记某频道本地数据尚未同步到硬件 */
export function markChannelDirty(slot: number): void {
  const s = readDirty();
  s.add(slot);
  writeDirty(s);
}

/** 标记某频道已与硬件同步 */
export function markChannelClean(slot: number): void {
  const s = readDirty();
  if (s.delete(slot)) writeDirty(s);
}

/** 读取全部"待同步"频道号 */
export function getDirtyChannels(): number[] {
  return [...readDirty()].sort((a, b) => a - b);
}

/* ════════════════════════════════════════════════════════════════
 * ★★ v3.62（2026-10-24 用户拍板）：预设库模板的「用户已改」标记
 *
 * 用户口径：「预设库的 UI 模版和硬件一致，**除非通过本地库上传可以修改**，
 *            否则不会有修改。」
 *
 * 所以：凡是被「本地库上传硬件」覆盖过的频道，记一笔；
 *       内置预设随 App 版本重新播种时**跳过这些频道**，
 *       否则一次升级就把用户上传的音色悄悄换回出厂值，
 *       而硬件频道表还是用户的 —— App 显示与听感立刻岔开。
 * ════════════════════════════════════════════════════════════════ */
const USER_TPL_KEY = 'bfx_presetUserTplSlots';

function readUserTpl(): Set<number> {
  try {
    const raw = localStorage.getItem(USER_TPL_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr.filter((n: unknown) => typeof n === 'number') : []);
  } catch {
    return new Set();
  }
}

/** 标记某频道已被「本地库上传」改写（播种时跳过它） */
export function markPresetUserSlot(slot: number): void {
  const s = readUserTpl();
  if (s.has(slot)) return;
  s.add(slot);
  try { localStorage.setItem(USER_TPL_KEY, JSON.stringify([...s])); } catch { /* ignore */ }
}

/** 已被用户上传改写的频道号列表 */
export function getPresetUserSlots(): number[] {
  return [...readUserTpl()].sort((a, b) => a - b);
}

/* ════════════════════════════════════════════════════════════════
 * ★★ v3.50（2026-10-22 用户拍板）：本地库 = **16 槽草稿箱**，与预设库同构
 *   · 槽位固定 1–16（A1–D4），**不可增删数量**
 *   · 只存本地，不写硬件；「上传覆盖」才写进预设库并 EB 落盘
 *   · 槽内容可为空（data = null），空槽仍占位
 *   · 相邻切换延迟按寄存器差异条数计算：T = N × 20 ms
 * ════════════════════════════════════════════════════════════════ */
const BANK16_KEY = 'bfx_localBank16';
const BANK_LEGACY_KEY = 'bfx_localBank20';
const BANK_OVERFLOW_KEY = 'bfx_localBank_overflow';
/** ★★ v3.76（D1）：用户主动清空过本地库的标记 —— 见 data/builtinPresets.ts:seedLocalBankOnce */
export const LOCAL_BANK_CLEARED_KEY = 'bfx_localBankCleared';
export const LOCAL_BANK_MAX = 16;
export const BANK_SLOT_MIN = 1;
export const BANK_SLOT_MAX = 16;

export interface BankItem {
  /** 1–16，与预设库槽位一一对应 */
  slot: number;
  name: string;
  /** ★ 中英可切换：英文名；缺省回退 name */
  nameEn?: string;
  savedAt: number;
  /** null = 空槽 */
  data: LocalPreset | null;
  /** 上传到预设库成功后的寄存器指纹（对比用） */
  tableHash?: string;
}

/** 寄存器指纹：地址升序 → "addr:val|..." */
export function hashRegisters(regs: Record<number, number>): string {
  const keys = Object.keys(regs).map(Number).sort((a, b) => a - b);
  return keys.map((k) => `${k}:${regs[k]}`).join('|');
}

/** 两套寄存器的差异条数（**地址并集**，含只在一边存在的） */
export function diffRegisterCount(
  a?: Record<number, number> | null,
  b?: Record<number, number> | null,
): number {
  const A = a ?? {};
  const B = b ?? {};
  const keys = new Set([...Object.keys(A).map(Number), ...Object.keys(B).map(Number)]);
  let n = 0;
  for (const k of keys) if (A[k] !== B[k]) n++;
  return n;
}

/** 每个寄存器一帧，EA 间隔 20 ms（用户 2026-10-22 口径） */
export const SWITCH_MS_PER_REG = 20;

/** 切换/补发耗时估算（纯按变更数量，不加固定开销） */
export function estimateSwitchMs(
  a?: Record<number, number> | null,
  b?: Record<number, number> | null,
): number {
  return diffRegisterCount(a, b) * SWITCH_MS_PER_REG;
}

/** 16 格补齐（缺的槽用空槽填，超出的丢弃） */
function normalizeSlots(list: BankItem[]): BankItem[] {
  const bySlot = new Map<number, BankItem>();
  for (const it of list) {
    if (!it) continue;
    const s = Number(it.slot);
    if (!Number.isFinite(s) || s < BANK_SLOT_MIN || s > BANK_SLOT_MAX) continue;
    if (!bySlot.has(s)) bySlot.set(s, { ...it, slot: s });
  }
  const out: BankItem[] = [];
  for (let s = BANK_SLOT_MIN; s <= BANK_SLOT_MAX; s++) {
    out.push(bySlot.get(s) ?? { slot: s, name: '', savedAt: 0, data: null });
  }
  return out;
}

/** 旧库（id 1..20 按 savedAt 倒序）→ 新 16 槽。多出的 4 条存入 overflow 保备键。 */
function migrateLegacy(): void {
  try {
    if (localStorage.getItem(BANK16_KEY)) return;
    const raw = localStorage.getItem(BANK_LEGACY_KEY);
    if (!raw) return;
    const old = JSON.parse(raw);
    if (!Array.isArray(old) || old.length === 0) return;
    const sorted = [...old].sort((a: any, b: any) => (b?.savedAt ?? 0) - (a?.savedAt ?? 0));
    const keep = sorted.slice(0, LOCAL_BANK_MAX);
    const overflow = sorted.slice(LOCAL_BANK_MAX);
    const items: BankItem[] = keep.map((o: any, i: number) => ({
      slot: i + 1,
      name: String(o?.name ?? `音色 ${i + 1}`),
      nameEn: o?.nameEn,
      savedAt: Number(o?.savedAt ?? Date.now()),
      data: (o?.data ?? null) as LocalPreset | null,
    }));
    localStorage.setItem(BANK16_KEY, JSON.stringify(normalizeSlots(items)));
    if (overflow.length) localStorage.setItem(BANK_OVERFLOW_KEY, JSON.stringify(overflow));
  } catch { /* ignore */ }
}

function readBank16(): BankItem[] {
  migrateLegacy();
  try {
    const raw = localStorage.getItem(BANK16_KEY);
    if (!raw) return normalizeSlots([]);
    const parsed = JSON.parse(raw);
    return normalizeSlots(Array.isArray(parsed) ? (parsed as BankItem[]) : []);
  } catch {
    return normalizeSlots([]);
  }
}

function writeBank16(items: BankItem[]): void {
  try {
    localStorage.setItem(BANK16_KEY, JSON.stringify(normalizeSlots(items)));
  } catch { /* ignore quota errors */ }
}

/** 16 格完整视图（含空槽）—— 供网格 UI 使用 */
export function loadBankSlots(): BankItem[] {
  return readBank16();
}

/** 只返回有内容的槽（按 slot 升序）—— 兼容旧调用点 */
export function loadLocalBank(): BankItem[] {
  return readBank16().filter((x) => x.data !== null);
}

export function getBankSlot(slot: number): BankItem | null {
  return readBank16().find((x) => x.slot === slot) ?? null;
}

/** 找第一个空槽；满返回 null */
export function findFirstEmptySlot(): number | null {
  const it = readBank16().find((x) => x.data === null);
  return it ? it.slot : null;
}

/** 写入指定槽（覆盖该槽内容） */
export function saveBankSlot(slot: number, name: string, data: LocalPreset): BankItem | null {
  if (slot < BANK_SLOT_MIN || slot > BANK_SLOT_MAX) return null;
  const items = readBank16();
  const i = items.findIndex((x) => x.slot === slot);
  if (i < 0) return null;
  const finalName = name.trim() || `音色 ${slot}`;
  const item: BankItem = {
    slot,
    name: finalName,
    nameEn: (data as { nameEn?: string }).nameEn,
    savedAt: Date.now(),
    /* ★★ v3.70（2026-10-24，导出文件暴露的 bug）：
       `buildUploadPayload()` 返回的是硬编码 `slot: 0, name: 'community'`，
       以前这里原样存进去 → 存档里的 slot 永远是 0、name 永远是 community。
       后果：① 导出按 slot 升序排 → 存过的音色全顶到最前面、标签变成 `[@0]`；
             ② 上传/社区发布的名字全是 community。
       这里统一回写真实槽位与名称（浅拷贝，不动调用方对象）。 */
    data: { ...data, slot, name: finalName },
  };
  items[i] = item;
  writeBank16(items);
  /* ★★ v3.76（D1）：用户又存了东西 → 「主动清空」状态不再成立，撤掉标记 */
  try { localStorage.removeItem(LOCAL_BANK_CLEARED_KEY); } catch { /* ignore */ }
  return item;
}

/** 旧 API 兼容：自动取第一个空槽 */
export function saveLocalBankItem(name: string, data: LocalPreset): BankItem | null {
  const slot = findFirstEmptySlot();
  if (slot === null) return null;
  return saveBankSlot(slot, name, data);
}

/** 覆盖已有槽（保留名称） */
export function overwriteBankSlot(slot: number, data: LocalPreset): BankItem | null {
  const items = readBank16();
  const i = items.findIndex((x) => x.slot === slot);
  if (i < 0) return null;
  /* ★ v3.70：与 saveBankSlot 同一口径 —— 存档内的 slot / name 必须与所在格一致 */
  const keepName = items[i].name || data.name || `音色 ${slot}`;
  items[i] = {
    ...items[i],
    savedAt: Date.now(),
    data: { ...data, slot, name: keepName },
    tableHash: undefined,
  };
  writeBank16(items);
  return items[i];
}

/** 旧 API 兼容：id 当 slot 用 */
export function overwriteLocalBankItem(slot: number, data: LocalPreset): BankItem | null {
  return overwriteBankSlot(slot, data);
}

/** 清空槽内容（槽位保留） */
export function clearBankSlot(slot: number): void {
  const items = readBank16();
  const i = items.findIndex((x) => x.slot === slot);
  if (i < 0) return;
  items[i] = { slot, name: '', savedAt: 0, data: null };
  writeBank16(items);
  /* ★★ v3.76（D1）：清空后若整库已空，落「用户主动清空」标记 ——
     下次打开本地库不再重播 16 条种子。见 builtinPresets.seedLocalBankOnce()。 */
  try {
    if (!items.some((x) => x.data !== null)) localStorage.setItem(LOCAL_BANK_CLEARED_KEY, '1');
  } catch { /* 配额满忽略 */ }
}

export function deleteLocalBankItem(slot: number): void {
  clearBankSlot(slot);
}

export function renameBankSlot(slot: number, name: string): void {
  const items = readBank16();
  const it = items.find((x) => x.slot === slot);
  if (!it) return;
  it.name = name.trim() || it.name;
  writeBank16(items);
}

export function renameLocalBankItem(slot: number, name: string): void {
  renameBankSlot(slot, name);
}

/** 撤销删除：按原 slot 放回（该槽必须仍为空） */
export function restoreLocalBankItem(item: BankItem): boolean {
  if (!item || item.slot < BANK_SLOT_MIN || item.slot > BANK_SLOT_MAX) return false;
  const items = readBank16();
  const i = items.findIndex((x) => x.slot === item.slot);
  if (i < 0 || items[i].data !== null) return false;
  items[i] = item;
  writeBank16(items);
  return true;
}

/** 上传成功后记指纹 */
export function markBankSlotUploaded(slot: number, regs: Record<number, number>): void {
  const items = readBank16();
  const i = items.findIndex((x) => x.slot === slot);
  if (i < 0) return;
  items[i] = { ...items[i], tableHash: hashRegisters(regs) };
  writeBank16(items);
}

/**
 * 按给定顺序【整体重灌】（16 条种子）。仅用于首次播种。
 */
export function replaceLocalBankForSeeds(seeds: Array<{ name: string; data: LocalPreset }>): number {
  const base = Date.now();
  const items: BankItem[] = seeds.slice(0, LOCAL_BANK_MAX).map((s, i) => ({
    slot: i + 1,
    name: (s.name || '').trim() || `音色 ${i + 1}`,
    nameEn: (s.data as { nameEn?: string }).nameEn,
    savedAt: base - i,
    data: s.data,
  }));
  writeBank16(items);
  return items.filter((x) => x.data !== null).length;
}

/* ── 当前已加载的本地预设（跨页面保持） ── */
const BANK_APPLIED_KEY = 'bfx_bankAppliedSlot';

/** 最近一次成功加载的本地预设 slot（无则 null） */
export function getLocalBankApplied(): number | null {
  try {
    const raw = localStorage.getItem(BANK_APPLIED_KEY) ?? localStorage.getItem('bfx_localBank20_applied');
    const n = raw ? Number(raw) : NaN;
    /* ★★★ 2026-11-19：旧版本遗留键 `bfx_localBank20_applied` 里可能存着 17~20。
       只做 Number.isFinite 不够 —— 越界值会被 LocalBankPage 直接当 cur 使用，
       渲染出一个「17–20」的空组（四格全 EMPTY、当前格不高亮、两个翻组键都变成
       「返回当前组」原地不动），用户就卡死在那屏，点「保存本地」还会误报
       "已保存到 20"。这里夹到 1~16，越界一律当作「没有已加载项」。 */
    return Number.isFinite(n) && n >= 1 && n <= 16 ? n : null;
  } catch { return null; }
}

export function setLocalBankApplied(slot: number | null): void {
  try {
    if (slot === null) localStorage.removeItem(BANK_APPLIED_KEY);
    else localStorage.setItem(BANK_APPLIED_KEY, String(slot));
  } catch { /* ignore */ }
}
