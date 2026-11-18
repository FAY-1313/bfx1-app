/**
 * 统一浮层提示（v4.29）
 *
 * 为什么不用 sonner 了：
 *   v3.68 定下「全 App 只有一个反馈位置」→ 选了 sonner 的底部居中胶囊。
 *   但底部正好是手掌/手指区（`ui2/CenterHint.tsx` 的文件头就记着同一个教训：
 *   双击 TONE 键的提示"被手挡住"），而模块开关按钮都在屏幕中部 —— 提示在底部
 *   等于视线要来回跳 200~300px。v4.29 按用户要求统一改到**顶栏下方居中**，
 *   视觉与旋钮浮框（`ui3/tone/tone3.css` 的 `.t3k-bubble`）对齐。
 *
 * 这个仓库只做三件事：存一条当前提示 / 到点自动收 / 通知订阅者。
 * 渲染交给 `components/FloatHint.tsx`（portal 到 body），这样：
 *   · 不受任何祖先的 overflow / transform / container-type 影响；
 *   · 全局提示（顶部居中）与锚点提示（贴着按钮）共用同一套计时与去重。
 *
 * ⚠️ 语义仍然是「永远只有一条，后到覆盖先到」（与旧 sonner 固定 id 行为一致），
 *   所以不会出现两条并排往下排的情况。
 */

export type HintKind = 'ok' | 'err' | 'info' | 'warn';

/** 锚点矩形：由调用方在点击瞬间取 `getBoundingClientRect()` 压成普通对象 */
export interface HintAnchor {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface HintState {
  /** 每次 +1，用于重播入场动画 */
  seq: number;
  main: string;
  sub?: string;
  kind: HintKind;
  /** 有锚点 → 贴着控件弹；没有 → 顶部居中 */
  anchor?: HintAnchor;
  /** 正在淡出（宿主据此加 .is-out） */
  leaving: boolean;
}

export interface ShowHintOptions {
  sub?: string;
  /** 停留时长（不含淡出），默认 3400ms */
  duration?: number;
  anchor?: HintAnchor;
}

/** 淡出时长，与 index.css 的 .fhint.is-out transition 保持一致 */
export const HINT_OUT_MS = 200;
const HOLD_DEFAULT = 3400;

let cur: HintState | null = null;
let seq = 0;
let holdTimer: ReturnType<typeof setTimeout> | null = null;
let outTimer: ReturnType<typeof setTimeout> | null = null;
const subs = new Set<(h: HintState | null) => void>();

function emit(): void {
  for (const fn of subs) {
    try { fn(cur); } catch { /* 单个订阅者出错不影响其它 */ }
  }
}

function clearTimers(): void {
  if (holdTimer !== null) { clearTimeout(holdTimer); holdTimer = null; }
  if (outTimer !== null) { clearTimeout(outTimer); outTimer = null; }
}

/** 弹一条提示（覆盖当前那条） */
export function showFloatHint(main: string, kind: HintKind, opts?: ShowHintOptions): void {
  if (!main) return;
  clearTimers();
  cur = {
    seq: ++seq,
    main,
    sub: opts?.sub || undefined,
    kind,
    anchor: opts?.anchor,
    leaving: false,
  };
  emit();
  holdTimer = setTimeout(() => {
    if (!cur) return;
    cur = { ...cur, leaving: true };
    emit();
    outTimer = setTimeout(() => { cur = null; outTimer = null; emit(); }, HINT_OUT_MS);
  }, Math.max(500, opts?.duration ?? HOLD_DEFAULT));
}

/** 立刻收起（写操作开始前用，避免旧结果压在 LOADING 上） */
export function hideFloatHint(): void {
  clearTimers();
  if (!cur) return;
  cur = null;
  emit();
}

export function getFloatHint(): HintState | null {
  return cur;
}

export function subscribeFloatHint(fn: (h: HintState | null) => void): () => void {
  subs.add(fn);
  return () => { subs.delete(fn); };
}
