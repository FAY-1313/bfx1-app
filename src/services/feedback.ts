/**
 * BFX1 统一反馈（v3.68 · 2026-10-24 用户拍板 ABCD）
 *
 * 用户原话：「所有反馈弹窗要统一一个位置提示，不要不统一，太乱了」。
 *
 * 问题背景（改造前的实测账）：
 *   · 一个动作最多同时出现 4 层反馈 —— 全屏遮罩（switchBusy）/ 底部 sonner 胶囊 /
 *     面板行内自绘提示（PresetsPanel.upNotice、CommunityPanel.toastMsg、LocalBankPage.notice）/
 *     首页中央盖字（knobDisplay、CenterHint）。
 *   · 全工程 91 处 toast 调用，只有 2 处带 `id` → 同一个动作分两步各弹一条，
 *     用户看到的是「一条接一条往下排」。
 *   · 诊断信息（「硬件切换到 A2」「未能读取频道」）也走弹层，进一步加重噪音。
 *
 * 现在的三条规矩：
 *   1. **只有一个位置**：底部居中胶囊（`App.tsx` 的 Toaster）。面板内不再自绘提示条。
 *   2. **只有一条**：固定 `id = 'bfx-op'`，新提示直接替换上一条，永不排队堆叠。
 *   3. **按语义分档**：
 *        `notifyOk`    操作成功（3.2s，可被下一条覆盖）
 *        `notifyErr`   操作失败（4.0s，必须让用户看到）
 *        `notifyInfo`  中性信息（3.4s）
 *        （诊断类 → `notifyDebug`：只在高级工程模式下弹，普通使用完全不打扰）
 *
 * ★★ v3.85（用户反馈「底部提示速度太快看不清具体内容」）：
 *   全部时长统一上调 —— 旧值 1.5/1.8/2.2/2.8s 对中文长句（「已上传 4 格」「出厂音色已写入
 *   本地 1–16 档 · 需要时点写入同步」）根本读不完。新值按下限「一眼扫完最少 2.6 秒」定，
 *   最高频的成功提示从 1.5s → 2.6s，错误提示 2.8 → 3.4s。
 *   ⚠ 仍然是**覆盖式单条**（固定 id），不会因为变长而堆叠。
 *
 * 与「加载窗」的分工：
 *   写硬件的长动作（切档 / 载入 / 上传 / 整组替换）以 **全屏 LOADING** 为唯一进行态反馈，
 *   结束后只报一条结果；不再「先弹一条开始、再弹一条结束」。
 */
import { toast } from 'sonner';

export type NotifyKind = 'ok' | 'err' | 'info' | 'warn';

/** 全局唯一提示 id —— 覆盖式，保证任意时刻屏幕上只有一条本 App 的提示 */
const OP_ID = 'bfx-op';

/** 高级工程模式开关（由 Index 在 debugMode 变化时同步；诊断类提示只在它开着时才显示） */
let _debugMode = false;
export function setNotifyDebugMode(on: boolean): void { _debugMode = on; }

const DUR: Record<NotifyKind, number> = { ok: 3200, err: 4000, info: 3400, warn: 3600 };

/* ★★ v3.85（用户「速度太快看不清具体内容」）：同一句话在 1.2s 内重复出现时直接忽略。
   原因不是时长不够，而是**同一条消息被连续重发**（逐格进度、连点两次）——
   sonner 用固定 id 覆盖时会把计时器归零，视觉上就是「闪一下又没了」，永远读不完。
   忽略重复 = 不再重置计时，用户能安稳读完一次。 */
let _lastMsg = '';
let _lastAt = 0;
function isEcho(message: string): boolean {
  const now = Date.now();
  if (message === _lastMsg && now - _lastAt < 1200) { _lastAt = now; return true; }
  _lastMsg = message;
  _lastAt = now;
  return false;
}

function show(message: string, kind: NotifyKind, duration?: number): void {
  if (!message) return;
  if (isEcho(message)) return;
  const opts = { id: OP_ID, duration: duration ?? DUR[kind] };
  if (kind === 'err') toast.error(message, opts);
  else if (kind === 'info') toast.info(message, opts);
  else if (kind === 'warn') toast.warning(message, opts);
  else toast.success(message, opts);
}

/** 兼容旧调用：第二个参数既可以是毫秒数，也可以是 `{ duration }` */
type DurArg = number | { duration?: number } | undefined;
function dur(v: DurArg): number | undefined {
  if (typeof v === 'number') return v;
  if (v && typeof v === 'object' && typeof v.duration === 'number') return v.duration;
  return undefined;
}

/** 操作成功 —— 覆盖上一条，不排队 */
export function notifyOk(message: string, d?: DurArg): void { show(message, 'ok', dur(d)); }

/** 操作失败 —— 停留更久；同样覆盖，不会与成功提示叠在一起 */
export function notifyErr(message: string, d?: DurArg): void { show(message, 'err', dur(d)); }

/** 中性信息 */
export function notifyInfo(message: string, d?: DurArg): void { show(message, 'info', dur(d)); }

/**
 * ★ v3.83（P3-3）：警告 —— 介于 info 与 err 之间（「已导出但没落盘」「文件过大已截断」）。
 * 原来这些散在 5 个录音/循环/分轨面板里直接用 sonner `toast.warning()`，
 * 没带固定 id → 不覆盖、会排队，用户看到「一条接一条往下排」。
 */
export function notifyWarn(message: string, d?: DurArg): void { show(message, 'warn', dur(d)); }

/** 诊断类（档位推送、读频道失败等）—— 只在高级工程模式下可见 */
export function notifyDebug(message: string): void {
  if (_debugMode) show(message, 'info', 2600);
}

/** 立刻收起当前提示（例如用户开始新的写操作时，避免旧结果压在 LOADING 上方） */
export function dismissNotify(): void {
  try { toast.dismiss(OP_ID); } catch { /* ignore */ }
}
