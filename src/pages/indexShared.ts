import { MODULE_PARAM_MAP } from '../data/parameterMap';
import { registerStore } from '../services/registerStore';
import { stripForbidden } from '../data/passThrough';

/* ★ 2026-11-24：从 Index.tsx 原样搬出 —— Index 与 parts/* 共用的模块级状态和工具（必须是同一份对象，
   例如 localSlotRef 是可变单例，所以不能各自复制）。 */

/* ══════════════════════════════════════════════════════════════════════
 * ★★ v3.70（2026-10-24 用户拍板）：本地库切换的「当前格」状态
 *
 * 为什么放模块级：`handleSlotSelect`（预设库切档）属于 PresetsPanel 组件，
 * `applyLoadedTone`（本地库载入）属于 Index 组件 —— 两边都要读写同一个状态，
 * 用 prop 穿透太啰嗦。App 里 Index 常驻，不存在卸载残留的问题。
 * ══════════════════════════════════════════════════════════════════════ */
/** 硬件当前对应的**本地库槽位**。本地库载入走 EA 直接写参数（不发 EE），
 *  硬件频道号不变，所以本地库自己的格位只能单独记。
 *  null = 硬件状态不对应本地库任何格（刚连接 / 刚切过预设库档 / 刚断线）
 *         → 取不到预存包，自动回退实时 diff。 */
export const localSlotRef: { current: number | null } = { current: null };

/* ★★★ 2026-10-31（用户要求）：预设库命名统一为「组 1–4 + 组内 a–d」。
 *   组标签 = 数字 1/2/3/4，组内四格 = a/b/c/d，组合显示成 1a / 2c / 4d。
 *   （原 A/B/C/D + 1~4 的写法与本地库的 1–16 冲突，且用户要求全英文名。） */
export const PRESET_GROUPS = [
  { label: '1', color: '#F2F4F8', slots: [1,2,3,4], bg: 'rgba(255,255,255,0.03)' },
  { label: '2', color: '#3ddc84', slots: [5,6,7,8], bg: 'rgba(255,255,255,0.03)' },
  { label: '3', color: '#e2c044', slots: [9,10,11,12], bg: 'rgba(255,255,255,0.03)' },
  { label: '4', color: '#4cc9f0', slots: [13,14,15,16], bg: 'rgba(255,255,255,0.03)' },
];

/** 组内序号 0~3 → a/b/c/d */
export const CH_LETTER = ['a', 'b', 'c', 'd'];

/** 从 registerStore 当前寄存器(EA关键帧) 反解所有模块旋钮归一化值 (旋钮永远跟随寄存器状态) */
export const deriveAllKnobValues = (sm: Record<string, string>): Record<string, Record<string, number>> => {
  const knobs: Record<string, Record<string, number>> = {};
  for (const mid of Object.keys(MODULE_PARAM_MAP)) {
    const vals = registerStore.getModuleKnobValues(mid, sm[mid]);
    if (Object.keys(vals).length > 0) knobs[mid] = vals;
  }
  return knobs;
};

/**
 * A1 (2026-09-22) 频道快照 → 本地镜像（覆盖式装入）
 *
 * 语义（用户决议）: 切台时"当前 UI 参数不保存, 直接跟随频道参数切换 UI" →
 *   用目标频道的完整寄存器参数【覆盖】本地镜像, 保证 UI/调试面板与硬件一致。
 *   registerStore → 供旋钮反解(deriveAllKnobValues)与上传快照(collectAll)
 *   regCacheRef   → 调试面板 PRE/POST EQ 曲线数据源
 */
export const loadChannelSnapshot = (
  registers: Record<number, number> | undefined,
  regCacheRef?: React.MutableRefObject<Record<number, number>>,
): void => {
  registerStore.clear();
  const cache = regCacheRef?.current;
  if (cache) for (const k of Object.keys(cache)) delete cache[Number(k)];
  if (!registers) return;
  /* ★ 2026-10-20（用户拍板）：禁写寄存器不进本地镜像 —— 首页 sendAll / pushAllCurrent /
     上传快照都以镜像为源，从这里剔掉，任何后续路径都不会再发出 43/48/52/58/63/67/73/78/82。 */
  const src = stripForbidden({ ...registers });
  for (const [k, v] of Object.entries(src)) {
    const addr = Number(k);
    registerStore.set(addr, v);
    if (cache) cache[addr] = v;
  }
};

/* ★ 2026-11-16：网页预览（iPhone/iPad Safari、桌面浏览器）没有 Web Bluetooth，
   不能再用「未连设备」的锁屏把整个界面挡死，否则没法检查 iOS/iPad 的画面兼容。
   原生 App（Android/iOS Capacitor）行为不变。 */
export const IS_WEB_PREVIEW = (() => {
  try {
    const cap = (window as any).Capacitor;
    return !cap?.isNativePlatform?.();
  } catch { return false; }
})();
