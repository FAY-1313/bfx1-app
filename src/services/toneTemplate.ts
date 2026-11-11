/**
 * ★★ v3.62（2026-10-24 用户拍板）· 预设库 / 本地库「参数模板」分层
 *
 * 用户原话：
 *   「预设库应该有一个自己的 UI 参数模版，和本地库不是一个模版，以防止本地库模版切换后，
 *     不上传，影响 UI 载入问题。预设库的 UI 模版和硬件一致，除非通过本地库上传可以修改，
 *     否则不会有修改。」
 *
 * ── 三层存储，职责互不越界 ─────────────────────────────────────────────
 *   ① bfx_presets       预设库模板 = **硬件频道表的内容**（切档后 UI 的唯一来源）
 *                       写入口只有三个：
 *                         · 内置预设首次播种（APP_VERSION 变化）
 *                         · 本地库「上传硬件」（唯一常规入口）
 *                         · 社区音色 / 收藏「替换频道」（用户显式覆盖）
 *   ② bfx_localBank16   本地库草稿箱。点一格 = 只发 EA 改硬件 RAM + 改当前 UI，
 *                       **绝不写 ①**；只有点「上传硬件」才写 ① 并 EB 落盘。
 *   ③ bfx_session_v1    当前会话实时态（首页拧旋钮）。只影响自己，重启按 ① 重新同步。
 *
 * ── 为什么要「补全成完整模板」 ────────────────────────────────────────
 *   UI 载入如果按 `{...上一个状态, ...新模板}` 合并，模板里**缺失的键**会把上一套的值
 *   留下来（本地库换过模板 → 预设库载入 → 旋钮/开关成为两套模板的混合物）。
 *   这里把模板补全成「10 个模块键齐全 + 寄存器浅拷贝」的完整形态，
 *   载入路径一律**整体替换**，物理上不可能残留。
 */
import { getPresetLocal, type LocalPreset } from './localPresets';
import { buildBuiltinPresets } from '../data/builtinPresets';

/** 首页 / 开关表认识的全部模块键（与 G_MODULES_ALL_OFF 一致） */
export const TEMPLATE_MODULE_IDS = [
  'noise-gate', 'boost', 'compressor', 'overdrive', 'dist',
  'amp-head', 'cabinet', 'chorus', 'delay', 'reverb',
] as const;

/** 中性模块态：除箱头/箱体保持「开」以外全关（与 switchPlan 的缺省口径一致） */
const NEUTRAL_MODULES: Record<string, boolean> = {
  'noise-gate': false, boost: false, compressor: false, overdrive: false, dist: false,
  'amp-head': true, cabinet: true, chorus: false, delay: false, reverb: false,
};

/**
 * 把任意来源的音色补成「完整模板」：
 *   · modules：10 个键齐全，缺的走中性值 —— 杜绝上一套模板的开关残留
 *   · subModels / knobValues / registers：浅拷贝，调用方后续改动不会反写存储
 */
export function completeTemplate(src: LocalPreset): LocalPreset {
  const mods: Record<string, boolean> = { ...NEUTRAL_MODULES, ...(src.modules || {}) };
  /* ★★★ 2026-11-02（用户报障「A 组 UI 显示模块没全关」）：
   *   中性表里 `amp-head: true / cabinet: true` 是给"老存档缺这两个 key"兜底的，
   *   结果把线材四档（1a–1d）也补成了"箱头箱体开着" —— 用户看到的就是这个。
   *
   *   现在改为**以寄存器为准**：老存档没写这个 key 时，按 57/72/107 的真实值反推。
   *     · 57=1 且 72=1        → 箱头旁路 → amp-head = false
   *     · 107=1               → 箱体旁路 → cabinet  = false
   *   这样 1a–1d（全旁路）→ 全关；2a–4d（57/72/107=0）→ 全开，两边都对。
   *   显式写了 key 的模板不受影响（下面的展开仍以 src.modules 优先）。 */
  const r = (src.registers ?? {}) as Record<number, number>;
  if (src.modules?.['amp-head'] === undefined) {
    mods['amp-head'] = !(r[57] === 1 || r[72] === 1);
  }
  if (src.modules?.cabinet === undefined) {
    mods.cabinet = r[107] !== 1;
  }
  return {
    ...src,
    modules: mods,
    subModels: { ...(src.subModels || {}) },
    knobValues: { ...(src.knobValues || {}) },
    registers: { ...(src.registers || {}) },
  };
}

/**
 * 预设库模板读取 —— 切档 / 连接同步 / 踩钉跟随 三条路径的唯一数据源。
 * 顺序：本地槽 1–16 → 内置预设（App 数据被清空时兜底）→ null。
 */
export function getPresetTemplate(slot: number): LocalPreset | null {
  const local = getPresetLocal(slot);
  if (local) return completeTemplate(local);
  const built = buildBuiltinPresets().find((p) => p.slot === slot);
  return built ? completeTemplate(built) : null;
}
