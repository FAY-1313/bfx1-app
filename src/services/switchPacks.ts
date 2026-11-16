/**
 * ══════════════════════════════════════════════════════════════════════════
 * ★★ v3.70（2026-10-24 用户拍板）：本地库「预存切换包」
 *
 * 用户原话：
 *   「我不需要你实时比对，应该在保存本地文件时比对，也就是保存时你要判断好
 *     当前频道在前后切换时需要改变哪些参数，只保存修改的参数即可，这样才能
 *     速度最快，不能切换时判断。」
 *   「同组同箱头箱体切换时不用加 MUTE。只有换组或更换箱头箱体时，才要加 MUTE。
 *     切换前先开启 MUTE，LOADING 结束后再关闭。」
 *   「判定 A3-A4 时也要考虑 A4-A3 切换的问题，因为是可以双向切换的，
 *     必须双向都没有问题。」
 *
 * ── 设计要点 ──────────────────────────────────────────────────────────────
 * 1. ★★★ **每格预存到其余 15 格 —— 2026-11-16 起本地库任意格可互切**：
 *      本地库 `LocalBankPage` 的 `reachable = s !== cur`，四组 × 四格都可直接点。
 *      所以 16 格 × 15 = 240 条边，任意换组方向都能命中预存包。
 *      ⛔ 不要再缩回「组内相邻 + 下一组第 1 格」的 3 条边：上一组第 1 格、
 *      跨两组/三组都会被漏掉，退回实时 diff。
 * 2. **双向天然正确**。A3→A4 与 A4→A3 是两条独立边，各自按同一套规则算帧、
 *    各自算 mute —— 没有任何「从 A 推 B」的反向假设。
 * 3. **跨组 = 全量包，组内 = 差异包**。跨组差异 73–97 条（≈ 全量），
 *    存差异没有收益，直接存全量反而更快到达目标状态（不会残留旧格参数）。
 * 4. **MUTE 只由型号决定**（用户拍板口径）：
 *      ① 箱头 name 不等 → mute；② 箱体 name 不等 → mute；
 *      ③ 任一侧型号名缺失 → 退回「数据段比对」兜底（箱头 57–98 去 57/72、
 *         箱体 107–142 去 107 逐个比，全等才算同型号）。
 *    同组改旋钮、跨组但箱头箱体没变，都**不**静音。
 * 5. **完整 registers 必须保留**。导出三种格式、上传硬件、社区发布全都需要完整表，
 *    切换包只是附加的加速层，绝不替代存档本体。
 * 6. 缓存签名 = `slot:savedAt:条数`。任一格被保存 / 清空 / 导入 → 签名变化 →
 *    下次 `getPack()` 自动整批重建（240 条边，毫秒级），不需要调用方手动通知。
 * 7. ★★ v3.74 **写入顺序按目标值分段**（`orderBypassSplit`）：
 *      目标 = 1（进旁路）→ 最前面；数据 → 中间；目标 = 0（出旁路）→ 最后。
 *    用户原话：「A4 和 A2 写回 A1 时，需要 BYPASS 先在前面，否则有噪音。」
 *    （A1 是全旁路格，旧规则把 57=1 排到最后 → 改箱头参数时箱头还开着。）
 * 8. ★★ 2026-11-16 **合唱 / 延迟 / 混响都做三段式预加载**：
 *      只要本包要写该效果的参数，就先发 bypass=1，写参数，再按目标值恢复 bypass。
 *      合唱 215 / 216–220，延迟 221 / 222–223，混响 224 / 225–229。
 *
 * ── 与「实时 diff」的关系 ────────────────────────────────────────────────
 * 切换时的顺序是：`getPack(当前格 → 目标格)` 命中就直接发；未命中（社区试听、
 * 刚连上还没切过、目标是空槽、drift 过大）才回退到原来的实时 diff 逻辑。
 * 两条路径产出的 `frames` 结构完全一致，发送端只有一份代码。
 */
import type { BankItem, LocalPreset } from './localPresets';
import { loadBankSlots } from './localPresets';
import { normalizeSubModels } from '../data/subModelNames';
import { baseKeyOf } from '../data/peqVariants';
import {
  FORBIDDEN_REGS, isWritableAddr, orderBypassSplit, switchPlan, BYPASS_ADDRS,
} from '../data/passThrough';
import { switchCostMs } from '../data/switchCost';
/* ★★★ 2026-11-04（一致性）：切换包/试听/上传/固件切档必须是同一套地址集 ——
 *   只保留固件 117 条音色表内的地址（表外地址固件不存、不发）。 */
import { isToneTableAddr } from './toneUpload';

/* ★★★ 2026-10-30：本地库的包耗时改用**固件真实模型**。
 *   旧 `switchWindowMs(n) = n×15 + 150` 把旁路帧和参数帧当一个价，而固件对
 *   `dsp_addr_triggers_rebuild` 命中的帧要等 DSP_REBUILD_MS(500ms) 重建窗口 ——
 *   一个 33 帧含 4 个旁路的组内边，旧口径算 645ms、实际 1.8s，用户看着角标切完了其实还在重建。 */
/* ★ 2026-11-03：253（限幅旁路）在固件里也是重建帧，成本按旁路算 */
const BYPASS_ADDR_SET = new Set<number>([...BYPASS_ADDRS, 253]);
function framesCostMs(all: Array<[number, number]>): number {
  return switchCostMs(all.length, all.filter(([a]) => BYPASS_ADDR_SET.has(a)).length);
}

/** 一条预存的切换包 */
export interface SwitchPack {
  /** 起始槽位 1..16 */
  from: number;
  /** 目标槽位 1..16 */
  to: number;
  /** 保存时算定：切换期间要不要静音（用户拍板：只有箱头/箱体换型才静音） */
  mute: boolean;
  /** true = 跨组全量包 */
  full: boolean;
  /** 主体帧 [地址, 值]，已按「数据类在前、旁路位最后（72 → 107）」排好序 */
  frames: Array<[number, number]>;
  /**
   * ★★ v3.71（2026-10-24 用户拍板）：**前置段** —— 必须先于主体单独发。
   *
   * 用户原话：
   *   「我发现切换延迟效果器直接在当前频道写参数，会有一个很长时间的延迟尾音出来，
   *     但是如果写好参数，直接开启 BYPASS 开关，就没有这个问题，所以我需要在前一个
   *     和后一个频道就提前写入参数，但是要保持 BYPASS 开启状态，这样在当前频道使用
   *     延迟效果器时，只需要关闭 BYPASS 开关即可，就不会有声音问题。」
   *
   * 落到协议上就是：**延迟算法正在跑的时候写 222/223，会拖出一段长尾音**。
   * 而只要先把 221 置 1（旁路），同样的参数写下去就完全安静。
   *
   * 所以包里拆成三段：`pre`（先把 221 关掉）→ `frames`（写参数）→ `post`（按目标值恢复 221）。
   * 这条判定在**保存时**就算死写进包里，切换时只是照发，不做任何判断。
   */
  pre: Array<[number, number]>;
  /** ★★ v3.71：**后置段** —— 主体发完之后单独发，参数就位后再把延迟打开 */
  post: Array<[number, number]>;
  /** LOADING 窗口时长（B 口径：全部 ×15 + 尾 150，下限 400） */
  ms: number;
}

/**
 * ★★ 2026-10-30（用户要求）：「组内切换要注意延迟和合唱的预加载 …… 最好预加载，
 *   先加载参数，之后再通过 BYPASS 控制开关」。
 *
 *   `sw`     = 旁路开关地址（0 = 开启 / 1 = 旁路）
 *   `params` = 必须趁旁路时才写的参数地址
 *
 * ⚠ v3.74 曾把合唱从本表移除（当时本地库没有合唱音色，多两次开关只会变慢）。
 *   现在 A2「Twin 亮丽」带 CE-2，合唱会跨格开关 —— 必须加回来：
 *   合唱在算法运行中改 216–220 会出现音高滑移，时长 1~3 秒。
 */
export const PRE_BYPASS_FX: ReadonlyArray<{ sw: number; params: readonly number[]; name: string }> = [
  { sw: 215, params: [216, 217, 218, 219, 220], name: 'chorus' },
  { sw: 221, params: [222, 223], name: 'delay' },
  /* ★ 2026-11-06（用户实测确认）：混响必须同样预旁路。
     225–229（混响时间/反馈/湿声等）直接写进正在运行的混响算法，会把旧缓冲一路播出来
     = 那段"持续加载的延音"；关掉混响就没有。改成「先 224=1 → 写参数 → 再按目标开」。 */
  { sw: 224, params: [225, 226, 227, 228, 229], name: 'reverb' },
];

/* ── 不可进入切换包的地址 ──
 *   2   = 输入静音（duckOn / duckOff 单独负责，进批会打乱「切换结束才开声」）
 *   261 = 总音量（批次后单独写，保证不静音的同组切换也能跟随目标格）
 *   260 = 硬件 mute，不属于音色（存档里若带着它，切过去会把硬件静音掉）
 *
 * ★★ v3.75：**导出**给 Index 的 EB 上传路径复用 —— 两条出口过滤口径必须一致，
 *    否则「导入的 JSON 带 260=1 → 上传硬件把静音位写死」这类问题会从另一条路复现。 */
export const SKIP_ADDRS: ReadonlySet<number> = new Set([2, 260, 261]);

/** 箱头参数段（去掉 57 总开关、72 收尾旁路） */
const AMP_SEG: [number, number] = [57, 98];
const AMP_SEG_SKIP = [57, 72];
/** 箱体参数段（去掉 107 箱体开关） */
const CAB_SEG: [number, number] = [107, 142];
const CAB_SEG_SKIP = [107];

const groupOf = (slot: number) => Math.floor((slot - 1) / 4);

/** 音色表的最小子集 —— 静音判定与过滤只需要这两个字段 */
export interface ToneShape {
  registers?: Record<number, number>;
  subModels?: Record<string, string>;
}

/**
 * 目标态寄存器表：禁写/白名单过滤 + 跳过静音类 + 9 条开关位以 modules 为权威补齐。
 * 与 Index 里 `withSwitchPlan()` 同一口径（不能让切换包和上传包出现两套值）。
 * ★★ v3.75：导出 —— EB 上传路径改成复用它，避免两套过滤慢慢漂移。
 */
export function cleanRegs(regs: Record<number, number> | undefined, modules?: Record<string, boolean>): Record<number, number> {
  const out: Record<number, number> = {};
  for (const [k, v] of Object.entries(regs || {})) {
    const a = Number(k);
    if (!Number.isFinite(a) || SKIP_ADDRS.has(a)) continue;
    if (!isWritableAddr(a) || FORBIDDEN_REGS.has(a)) continue;
    /* ★ 2026-11-04：表外地址不进入任何一条路径（与固件 117 条表同口径）。 */
    if (!isToneTableAddr(a)) continue;
    out[a] = v;
  }
  for (const [a, v] of Object.entries(switchPlan(modules))) out[Number(a)] = v;
  return out;
}

/** 两个数值表在 [lo,hi] 段内是否有实质差异（skip 里的地址不参与） */
function segChanged(
  x: Record<number, number> | undefined,
  y: Record<number, number> | undefined,
  [lo, hi]: [number, number],
  skip: number[],
): boolean {
  const s = new Set(skip);
  const A = x || {};
  const B = y || {};
  for (let a = lo; a <= hi; a++) {
    if (s.has(a)) continue;
    if ((A[a] ?? 0) !== (B[a] ?? 0)) return true;
  }
  return false;
}

/**
 * 静音判定（保存时算一次，写进 pack.mute）。
 * ① 箱头 name 不等 → mute
 * ② 箱体 name 不等 → mute
 * ③ 任一型号名缺失 → 用数据段兜底
 *
 * ★★ v3.75（结构性收口）：**导出**，Index 的回退路径（实时 diff）也调它。
 * 原来这里有第二份 `needSwitchMute(subModels, diffCount)`，型号缺失时只看 diff>60，
 * 导致「同一对音色，命中包会静音、走回退不静音」—— 用户听到什么取决于有没有命中包，
 * 这类不确定性最难排查。现在两条路径共用本函数，判据只有一份。
 */
export function muteFor(a: ToneShape, b: ToneShape): boolean {
  const sa = normalizeSubModels(a.subModels as Record<string, string> | undefined) ?? {};
  const sb = normalizeSubModels(b.subModels as Record<string, string> | undefined) ?? {};

  /* ★ 2026-11-16：`-1` 变体（PRE EQ 改动）仍属同一台箱头 —— 按原型号比较，
     否则两个 -1 互切会被当成"换箱头"，每次都静音 + 全量重建，快切彻底失效。 */
  const ampA = baseKeyOf(sa['amp-head'] ?? '');
  const ampB = baseKeyOf(sb['amp-head'] ?? '');
  if (ampA && ampB) {
    if (ampA !== ampB) return true;
  } else if (segChanged(a.registers, b.registers, AMP_SEG, AMP_SEG_SKIP)) {
    return true;
  }

  const cabA = sa['cabinet'] ?? '';
  const cabB = sb['cabinet'] ?? '';
  if (cabA && cabB) {
    if (cabA !== cabB) return true;
  } else if (segChanged(a.registers, b.registers, CAB_SEG, CAB_SEG_SKIP)) {
    return true;
  }

  return false;
}

/**
 * ★★★ 2026-11-16：本地库 16 格是草稿箱，`LocalBankPage` 的 `reachable = s !== cur`
 *   允许四组任意格互切（不再只限组内相邻 / 下一组第 1 格）。
 *   因此为每一格预存到其余 15 格的包，共 240 条；任意换组方向都能命中
 *   `getPack()`，不会退回实时 diff，也不会漏掉合唱/延迟/混响的预旁路。
 *
 *   ⛔ 不要再改回 3 条出边：上一组第 1 格、跨两组/三组都会被漏掉。
 */
function outEdges(slot: number): number[] {
  const out: number[] = [];
  for (let s = 1; s <= 16; s++) if (s !== slot) out.push(s);
  return out;
}

function buildPack(from: number, fromData: LocalPreset, to: number, toData: LocalPreset): SwitchPack {
  const crossGroup = groupOf(from) !== groupOf(to);
  const mute = muteFor(fromData, toData);

  const target = cleanRegs(toData.registers, toData.modules as Record<string, boolean> | undefined);
  /* 跨组 = 全量（不拿起始格做基准）；组内 = 只写差异 */
  const base = crossGroup
    ? null
    : cleanRegs(fromData.registers, fromData.modules as Record<string, boolean> | undefined);

  const list: Array<[number, number]> = [];
  for (const a of Object.keys(target).map(Number)) {
    const v = target[a];
    if (base && base[a] === v) continue;     // 组内：同值不写（用户要求的最快路径）
    list.push([a, v]);
  }

  /* ★★ v3.74（2026-10-24 用户拍板）：排序从「旁路位一律最后」改成「按目标值分段」
   *
   * 用户原话：「现在 A4 和 A2 写回 A1 时，需要 BYPASS 先在前面，否则有噪音。」
   *
   *   · 目标 = 1（进旁路）→ **最前面**：先停算法/停箱头，再改参数
   *   · 数据类           → 中间（升序）
   *   · 目标 = 0（出旁路）→ 最后：参数就位才开声，末两位仍 72 → 107
   *
   * A1 是全旁路格（0/7/57/224 = 1），旧规则会把 57=1 排到 64/66/68 之后 ——
   * 改箱头参数时箱头还开着，就是那段噪音。 */
  let frames = orderBypassSplit(list, (x) => x[0], (x) => x[1]);

  /* ★★ v3.71：延迟的「三段式」在这里一次性算死
   *
   *   pre  = 221→1（先把延迟旁路，参数才敢写）
   *   mid  = 参数（222/223）
   *   post = 221→目标值（参数就位了再开）
   *
   * ★★ v3.74（2026-10-24 用户拍板）：**不再看起始格开没开** ——
   *   「延迟需要在前一个和后一个频道预加载，否则会有问题。」
   *   只要本包要写 222/223，就无条件先发一帧 221=1：
   *     · 起始格本来就关着 → 这一帧只是把 1 再写一次，硬件侧无感知；
   *     · 起始格开着       → 正是要保护的那个场景；
   *     · 硬件实际状态未知 → 无条件 pre 天然安全（原来靠判定会漏）。
   *   代价只有一帧（≈15ms），换来「任何方向切延迟都不会拖尾音」。
   *   ★ 2026-10-30：合唱也进了 PRE_BYPASS_FX（A2 带 CE-2），同一套逻辑复用。
   */
  const pre: Array<[number, number]> = [];
  const post: Array<[number, number]> = [];

  /* ★★★ 2026-11-03（用户拍板）：**253（限幅旁路）只跟"1 组边界"有关**。
   *   · 固件侧的默认规则：1 组（线材直通）=1（旁路），其余组=0（限幅开）；
   *     而且固件只在"值真的变了"时才追加这一帧。
   *   · APP 本地库切档完全不写 253，于是本地听感与固件切档在限幅状态上会分叉。
   *   这里按同样的规则补一帧，并且**放在 pre 段最前面**（用户要求"先写入"）：
   *     · 1 组 → 2/3/4 组：先写 253=0（把限幅打开），再改别的参数
   *     · 2/3/4 组 → 1 组：先写 253=1（旁路限幅），线材直通才是真直通
   *   组内切换不动 253（两边同组，值一样）。 */
  {
    const gFrom = groupOf(from);
    const gTo = groupOf(to);
    /* ★ 2026-11-16（用户拍板）：**双向都写** —— 1 组=1，其余组=0。
       旧版只做「离开 1 组」，进 1 组靠固件，实测本地库进 1 组时限幅状态不对。 */
    if (gFrom !== gTo) pre.push([253, gTo === 0 ? 1 : 0]);
  }
  for (const fx of PRE_BYPASS_FX) {
    const set = new Set(frames.map(([a]) => a));
    if (!fx.params.some((a) => set.has(a))) continue;   // 本包不写它的参数 → 无需动开关
    pre.push([fx.sw, 1]);
    frames = frames.filter(([a]) => a !== fx.sw);       // 开关交回 post，避免被主批提前打开
    /* 目标值必须兜底（老音色可能没记这一位）—— 否则 pre 关掉后没人再打开。 */
    const toVal = target[fx.sw]
      ?? ((toData.modules as Record<string, boolean> | undefined)?.[fx.name] ? 0 : 1);
    /* 目标本来就是旁路（1）→ pre 已经写成 1 了，不用再发一次 */
    if (toVal !== 1) post.push([fx.sw, toVal]);
  }

  /* ★★★ 2026-10-30：按固件的「普通帧 10ms / 旁路帧 500ms 窗口」模型算，不再 15ms 一刀切。 */
  const ms = framesCostMs([...pre, ...frames, ...post]);

  return { from, to, mute, full: crossGroup, frames, pre, post, ms };
}

/* ══════════════════ 缓存与重建 ══════════════════ */

let cache: Record<string, SwitchPack> | null = null;
let cacheSig = '';

/** 寄存器表指纹（FNV-1a）。★ v3.75（D5）：只靠 savedAt+条数 会碰撞 ——
 *  同一毫秒内两次保存且条数相同 → 签名不变 → 用旧包切换（参数错位且无任何提示）。 */
function regsHash(regs: Record<number, number> | undefined): string {
  if (!regs) return '-';
  let h = 2166136261;
  const keys = Object.keys(regs).map(Number).sort((x, y) => x - y);
  for (const a of keys) {
    h ^= a; h = Math.imul(h, 16777619);
    h ^= (regs[a] | 0); h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

/** 签名：任一格保存 / 清空 / 导入都会改 savedAt、条数或寄存器值 → 自动失效 */
function bankSig(items: BankItem[]): string {
  let s = '';
  for (const it of items) {
    const regs = it.data ? it.data.registers : undefined;
    s += `${it.slot}:${it.savedAt ?? 0}:${regs ? Object.keys(regs).length : '-'}:${regsHash(regs)}|`;
  }
  return s;
}

function buildAll(items: BankItem[]): Record<string, SwitchPack> {
  const bySlot = new Map<number, BankItem>();
  for (const it of items) bySlot.set(it.slot, it);
  const out: Record<string, SwitchPack> = {};
  for (const it of items) {
    if (!it.data) continue;
    for (const to of outEdges(it.slot)) {
      const dst = bySlot.get(to);
      if (!dst?.data) continue;                  // 目标是空槽 → 不预存，切换时自然回退
      out[`${it.slot}>${to}`] = buildPack(it.slot, it.data, to, dst.data);
    }
  }
  return out;
}

/** 惰性构建：签名没变就复用（正常的切换路径只做一次字符串比较） */
function ensurePacks(): Record<string, SwitchPack> {
  const items = loadBankSlots();
  const sig = bankSig(items);
  if (cache && sig === cacheSig) return cache;
  cache = buildAll(items);
  cacheSig = sig;
  return cache;
}

/**
 * 取一条切换包。
 * @param from 硬件当前对应的本地库槽位（未经本地库切换时传 null → 返回 null）
 * @param to   目标槽位
 */
export function getPack(from: number | null | undefined, to: number | null | undefined): SwitchPack | null {
  if (!from || !to || from === to) return null;
  if (from < 1 || from > 16 || to < 1 || to > 16) return null;
  return ensurePacks()[`${from}>${to}`] ?? null;
}

/** 强制重建（保存 / 导入 / 清空后调一次，把构建成本挪到写操作之后，切换时无感） */
export function rebuildPacks(): number {
  const items = loadBankSlots();
  cache = buildAll(items);
  cacheSig = bankSig(items);
  return Object.keys(cache).length;
}

/**
 * ══════════════════════════════════════════════════════════════════════════
 * ★★ v3.70（2026-10-24 用户拍板）：本地库「预存切换包」
 *
 * 用户原话：
 *   「我不需要你实时比对，应该在保存本地文件时比对，也就是保存时你要判断好
 *     当前频道在前后切换时需要改变哪些参数，只保存修改的参数即可，这样才能
 *     速度最快，不能切换时判断。」
 *   「同组同箱头箱体切换时不用加 MUTE。只有换组或更换箱头箱体时，才要加 MUTE。
 *     切换前先开启 MUTE，LOADING 结束后再关闭。」
 *   「判定 A3-A4 时也要考虑 A4-A3 切换的问题，因为是可以双向切换的，
 *     必须双向都没有问题。」
 *
 * ── 设计要点 ──────────────────────────────────────────────────────────────
 * 1. ★★★ **每格预存到其余 15 格 —— 2026-11-16 起本地库任意格可互切**：
 *      本地库 `LocalBankPage` 的 `reachable = s !== cur`，四组 × 四格都可直接点。
 *      所以 16 格 × 15 = 240 条边，任意换组方向都能命中预存包。
 *      ⛔ 不要再缩回「组内相邻 + 下一组第 1 格」的 3 条边：上一组第 1 格、
 *      跨两组/三组都会被漏掉，退回实时 diff。
 * 2. **双向天然正确**。A3→A4 与 A4→A3 是两条独立边，各自按同一套规则算帧、
 *    各自算 mute —— 没有任何「从 A 推 B」的反向假设。
 * 3. **跨组 = 全量包，组内 = 差异包**。跨组差异 73–97 条（≈ 全量），
 *    存差异没有收益，直接存全量反而更快到达目标状态（不会残留旧格参数）。
 * 4. **MUTE 只由型号决定**（用户拍板口径）：
 *      ① 箱头 name 不等 → mute；② 箱体 name 不等 → mute；
 *      ③ 任一侧型号名缺失 → 退回「数据段比对」兜底（箱头 57–98 去 57/72、
 *         箱体 107–142 去 107 逐个比，全等才算同型号）。
 *    同组改旋钮、跨组但箱头箱体没变，都**不**静音。
 * 5. **完整 registers 必须保留**。导出三种格式、上传硬件、社区发布全都需要完整表，
 *    切换包只是附加的加速层，绝不替代存档本体。
 * 6. 缓存签名 = `slot:savedAt:条数`。任一格被保存 / 清空 / 导入 → 签名变化 →
 *    下次 `getPack()` 自动整批重建（240 条边，毫秒级），不需要调用方手动通知。
 * 7. ★★ v3.74 **写入顺序按目标值分段**（`orderBypassSplit`）：
 *      目标 = 1（进旁路）→ 最前面；数据 → 中间；目标 = 0（出旁路）→ 最后。
 *    用户原话：「A4 和 A2 写回 A1 时，需要 BYPASS 先在前面，否则有噪音。」
 *    （A1 是全旁路格，旧规则把 57=1 排到最后 → 改箱头参数时箱头还开着。）
 * 8. ★★ 2026-11-16 **合唱 / 延迟 / 混响都做三段式预加载**：
 *      只要本包要写该效果的参数，就先发 bypass=1，写参数，再按目标值恢复 bypass。
 *      合唱 215 / 216–220，延迟 221 / 222–223，混响 224 / 225–229。
 *
 * ── 与「实时 diff」的关系 ────────────────────────────────────────────────
 * 切换时的顺序是：`getPack(当前格 → 目标格)` 命中就直接发；未命中（社区试听、
 * 刚连上还没切过、目标是空槽、drift 过大）才回退到原来的实时 diff 逻辑。
 * 两条路径产出的 `frames` 结构完全一致，发送端只有一份代码。
 */
