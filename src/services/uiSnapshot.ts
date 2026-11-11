/**
 * 首页 UI 参数快照登记表（2026-10-17 · 修复「保存的音色加载后是空的」）
 *
 * 问题：保存音色走 `buildUploadPayload()`，它只读 `registerStore`（硬件镜像）。
 *   但新首页（ui2/HomePanel）的旋钮值存在自己的 React state 里，只有"被拖动过"的
 *   寄存器才会通过 onParam 写进 registerStore。而 registerStore 在刚连接时几乎是空的
 *   （`handleBleConnect → queryChannel → restoreUiFromSlot` 里若本地 16 档没有该频道数据，
 *   会直接 return，不做任何装载）。结果：**保存下来的快照只有模块开关位、没有参数值**，
 *   再加载时等于什么都没恢复 —— 用户看到的就是"加载后是空的"。
 *
 * 做法：HomePanel 每次 values / 开关 / 型号变化就把它们登记到这里；
 *   保存时以「UI 当前状态」为权威，叠加到 registerStore 之上（UI 赢）。
 *   这样即使用户刚连接、没拖过任何旋钮，也能存下完整音色。
 */

export type RegMap = Record<string, number>;

let valuesSnap: Record<string, RegMap> = {};
let modulesSnap: Record<string, boolean> = {};
let subModelsSnap: Record<string, string> = {};
/** 最近一次登记的 tick，便于调试判断是否登记过 */
let lastTick = 0;

/** HomePanel 调用：登记当前 UI 状态（每次变化都调，开销仅一次引用赋值） */
export function setUiSnapshot(
  values: Record<string, RegMap>,
  modules: Record<string, boolean>,
  subModels: Record<string, string>,
): void {
  valuesSnap = values;
  modulesSnap = modules;
  subModelsSnap = subModels;
  lastTick = Date.now();
}

export function getUiSnapshot(): {
  values: Record<string, RegMap>;
  modules: Record<string, boolean>;
  subModels: Record<string, string>;
  tick: number;
} {
  return { values: valuesSnap, modules: modulesSnap, subModels: subModelsSnap, tick: lastTick };
}
