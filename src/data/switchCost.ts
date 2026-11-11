/* ══════════════════════════════════════════════════════════════════════════
 * 频道切换耗时模型 —— **与固件 dsp_comm.c 的 dsp_send_regs 逐项对齐**
 *
 * 旧口径（v3.70 起）：`帧数 × 15ms + 150ms`，把旁路帧和参数帧当一个价。
 * 这在三表引擎上线后就不对了，因为固件对两类帧的等待完全不同：
 *
 *   普通帧（系数类）  → dsp_wait_echo_match(10ms) + 无回显补 3ms
 *   旁路帧（重建类）  → dsp_wait_echo_match(**500ms**)，收到回显才提前走
 *
 * 固件只按**地址**判断是不是重建帧（`dsp_addr_triggers_rebuild`），不看写 0 还是 1，
 * 所以「关模块」和「开模块」两段里的旁路帧都要付这 500ms。9 个旁路位全开时，
 * 旧口径把全量算成 1.9s，实际是 4s 量级——这就是角标一直显示偏小的原因。
 *
 * 新口径：
 *   cost = FIXED + 参数帧 × 10ms + 旁路帧 × BYPASS_MS
 *
 *   FIXED     250ms  UART 进/出 + DAC 音量 191→50→191 + ES8311 PGA I2C + 收尾读回
 *   BYPASS_MS 300ms  实测回显 80~400ms，取中偏保守；没回显时固件等满 500ms
 *
 * 校准依据（现场 `bypass wait:` 日志）：
 *   A3→A4  2 帧 0 旁路 → 模型 270ms，实测 ≈300ms
 *   全量  117 帧 9 旁路 → 模型 4.1s，硬件交接单 6.5s / 源码注释 2.9s 之间
 *   两者差的就是「旁路帧有没有回显」——所以 BYPASS_MS 是最该按实测微调的常量。
 * ══════════════════════════════════════════════════════════════════════════ */

/** 固定开销：UART 模式进出 + DAC 音量压放 + PGA + 收尾读回（与帧数无关） */
export const COST_FIXED_MS = 250;

/** 普通参数帧：短探回显 DSP_ECHO_PROBE_MS(10) */
export const COST_PARAM_MS = 10;

/** 旁路 / 重建帧：DSP_REBUILD_MS 保护窗口（实测回显 80~400ms，取 300） */
export const COST_BYPASS_MS = 300;

/** 计算一次切换的耗时（ms）。frames 含参数帧 + 旁路帧，bypass 是其中旁路帧的条数 */
export function switchCostMs(frames: number, bypass: number): number {
  if (!frames && !bypass) return 0;
  const b = Math.min(bypass, frames);
  const p = frames - b;
  return COST_FIXED_MS + p * COST_PARAM_MS + b * COST_BYPASS_MS;
}

/** 统一的角标格式化：<1000 显示 ms，≥1000 显示一位小数秒 */
export function fmtCost(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${ms}ms`;
}
