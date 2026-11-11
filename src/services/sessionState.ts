/**
 * 会话状态持久化（★ 2026-10-17 用户要求）
 *
 * 需求原文：
 *   「蓝牙连接状态下，必须保持后台可以运行，如果蓝牙中断或者关闭，需要实时保存当前参数，
 *     蓝牙连接或者开启软件后，需要恢复之前的参数。」
 *
 * 做法：
 *   · 首页每次改参数 / 切模块开关 / 换型号，都在 350ms 防抖后把「当前整机状态」写进
 *     localStorage —— 所以蓝牙断开的瞬间，最后一份状态**已经**在本地了，不需要等断开事件。
 *   · App 退到后台（visibilitychange → hidden / pagehide）时立即落盘一次，防止被系统杀掉丢状态。
 *   · 重新连接蓝牙后，首页把当前状态重新写一遍硬件（见 HomePanel 的 restore effect）；
 *     重新打开 App 时直接用本地状态渲染 UI。
 *
 * 只存「首页能编辑的东西」：模块开关、型号索引、旋钮值。不存寄存器镜像
 * （那个由 registerStore 管，且可由 value 反推）。
 */

const KEY = 'bfx_session_v1';

export interface SessionState {
  /** 结构版本号 —— 以后字段变动就 +1，旧数据自动作废 */
  v: 1;
  savedAt: number;
  /** 模块开关（noise-gate / compressor / …） */
  on: Record<string, boolean>;
  compIdx: number;
  odIdx: number;
  ampIdx: number;
  cabIdx: number;
  micIdx: number;
  /** ③ 区设备图（spk / hp） */
  cabView: string;
  /** FX 预设索引（chorus / delay / reverb） */
  fxIdx: Record<string, number>;
  /** 每模块的寄存器值（boost 的 PGA 档位记在 key -1） */
  values: Record<string, Record<number, number>>;
}

export function saveSession(s: SessionState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* 配额满 / 隐私模式 → 静默失败，不影响操作 */
  }
}

export function loadSession(): SessionState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as SessionState;
    if (!o || o.v !== 1 || typeof o.values !== 'object' || o.values === null) return null;
    return o;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
