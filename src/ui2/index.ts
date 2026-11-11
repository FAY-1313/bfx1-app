/**
 * BFX1 新 UI · 入口
 *
 * ⚠️ 2026-10-16（用户拍板 A5）：原 `TonePage`（旧版标签页 UI）已整份删除 ——
 *   全工程无 import，属死代码；且它与 HomePanel 各持一份 MODULES 定义，
 *   是"改一处漏一处"的隐患来源。现行首页一律使用 HomePanel。
 *
 * ⚠️ 本目录只做 UI；BLE 发送仍走既有 bleService / writeModuleParam。
 */
export { default as Knob } from './Knob';
export { default as PedalShell } from './PedalShell';
export * from './registers';
export * from './panels';
