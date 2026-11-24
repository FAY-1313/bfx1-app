/**
 * RegisterStore — tracks ALL register values (visible knobs + hidden/default registers)
 *
 * Serves as the bridge between:
 *   - BLE hardware read/write (raw register values)
 *   - UI knob state (moduleId + knobLabel → normalized 0-1)
 *   - Hidden register storage (registers without UI representation)
 *
 * LOAD: hardware → RegisterStore → UI knobs
 * SAVE: UI knobs + hidden registers → RegisterStore → hardware
 */

import { getParamDef, regValueToNormalized, normalizedToRegValue, MODULE_PARAM_MAP, SUB_MODEL_FORMULAS } from "../data/parameterMap";
import type { ParamDef } from "../data/parameterMap";
import { ampDecodeKnobs } from "../data/ampKnobResolve";

/** 通用单调反解: 找到 n∈[0,1] 使 compute(n)≈regValue (兼容递增/递减, 适用于 PEQ gain 域与线性) */
function invertKnob(compute: (n: number) => number, regValue: number): number {
  const lo = 0, hi = 1;
  const inc = compute(hi) >= compute(lo);
  let l = lo, r = hi;
  for (let i = 0; i < 32; i++) {
    const m = (l + r) / 2;
    const cv = compute(m);
    if (cv === regValue) return m;
    const below = inc ? cv < regValue : cv > regValue;
    if (below) l = m; else r = m;
  }
  return (l + r) / 2;
}

function clamp01(v: number): number { return Math.max(0, Math.min(1, v)); }

type RegisterChangeCallback = (regAddr: number, value: number) => void;

class RegisterStore {
  /** Raw register values keyed by address */
  private _regs: Map<number, number> = new Map();

  /** Hidden registers that have no UI knob representation */
  private _hiddenRegs: Map<number, number> = new Map();

  /** Subscribers notified on every register change */
  private _subs: Set<RegisterChangeCallback> = new Set();

  // ─── Raw register access ───────────────────────────────────────

  get(regAddr: number): number | undefined {
    return this._regs.get(regAddr);
  }

  set(regAddr: number, value: number): void {
    this._regs.set(regAddr, value);
    this._notify(regAddr, value);
  }

  getAll(): Map<number, number> {
    return new Map(this._regs);
  }

  /** Bulk-set from a LOAD response or preset engine */
  setAll(entries: Array<{ regAddr: number; value: number }>): void {
    for (const e of entries) {
      this._regs.set(e.regAddr, e.value);
    }
    // Notify once at the end with a sentinel
    this._notify(-1, 0);
  }

  // ─── Hidden registers (no UI knob) ────────────────────────────

  getHidden(regAddr: number): number | undefined {
    return this._hiddenRegs.get(regAddr);
  }

  setHidden(regAddr: number, value: number): void {
    this._hiddenRegs.set(regAddr, value);
  }

  getAllHidden(): Map<number, number> {
    return new Map(this._hiddenRegs);
  }

  /** Collect ALL registers (visible + hidden) for SAVE */
  collectAll(): Map<number, number> {
    const all = new Map<number, number>();
    for (const [addr, val] of this._regs) all.set(addr, val);
    for (const [addr, val] of this._hiddenRegs) {
      if (!all.has(addr)) all.set(addr, val);
    }
    return all;
  }

  // ─── Knob value conversion ────────────────────────────────────

  /** Get normalized (0-1) value for a specific module knob */
  getKnobNormalized(moduleId: string, knobLabel: string): number {
    const def = getParamDef(moduleId, knobLabel);
    if (!def) return 0.5;
    const regVal = this._regs.get(def.regAddr);
    if (regVal === undefined) return 0.5;
    return regValueToNormalized(regVal, def);
  }

  /**
   * Derive knob state for a module from current register values.
   * Formula-aware: 若存在子型号公式(或模块级通用公式), 用 invertKnob 反解 compute,
   * 否则回退 MODULE_PARAM_MAP 线性归一化. 公式未覆盖的旋钮仍从 MODULE_PARAM_MAP 补齐.
   */
  getModuleKnobValues(moduleId: string, subModelName?: string): Record<string, number> {
    /* ★ 2026-11-24：箱头反解改走 v3 权威表（与写入同表）。旧的 SUB_MODEL_FORMULAS['amp-head'] /
       MODULE_PARAM_MAP['amp-head'] 是 v13 旧布局（BASS/MID/TREBLE 段序错、GAIN 量程不同），
       实测 20 型号 900 个点 240 个读偏、400 个读不到（_verify/ampReadback.ts）。不回退旧表。 */
    if (moduleId === 'amp-head') return ampDecodeKnobs(subModelName, (a) => this._regs.get(a));
    const result: Record<string, number> = {};
    const moduleMap = MODULE_PARAM_MAP[moduleId];
    const formulaMap = ((subModelName && (SUB_MODEL_FORMULAS as any)[subModelName])
      || (SUB_MODEL_FORMULAS as any)[moduleId] || null);

    // 1) 公式驱动旋钮 (正确反解 uint32 寄存器)
    if (formulaMap) {
      for (const [knobLabel, defs] of Object.entries(formulaMap)) {
        const def = defs[0];
        if (!def || def.regAddr === -1) continue;
        const regVal = this._regs.get(def.regAddr);
        if (regVal === undefined) continue;
        if (typeof def.compute === 'function') {
          // 有 decode 则直接解码 (MT-2 档位/合并寄存器回显), 否则用 invertKnob 单调二分反解
          result[knobLabel] = clamp01(typeof def.decode === 'function' ? def.decode(regVal) : invertKnob(def.compute, regVal));
        } else {
          result[knobLabel] = clamp01((regVal - def.min) / ((def.max - def.min) || 1));
        }
      }
    }

    // 2) MODULE_PARAM_MAP 线性旋钮 (公式未覆盖的部分)
    if (moduleMap) {
      for (const [knobLabel, def] of Object.entries(moduleMap)) {
        if (knobLabel in result) continue;
        const regVal = this._regs.get(def.regAddr);
        if (regVal !== undefined) {
          result[knobLabel] = regValueToNormalized(regVal, def);
        }
      }
    }
    return result;
  }

  /** Write a knob normalized value → update register store + optionally hardware */
  setKnobNormalized(moduleId: string, knobLabel: string, normalized: number): boolean {
    const def = getParamDef(moduleId, knobLabel);
    if (!def) return false;
    const regVal = normalizedToRegValue(normalized, def);
    this._regs.set(def.regAddr, regVal);
    return true;
  }

  // ─── Subscription ────────────────────────────────────────────

  subscribe(cb: RegisterChangeCallback): () => void {
    this._subs.add(cb);
    return () => this._subs.delete(cb);
  }

  private _notify(regAddr: number, value: number): void {
    for (const cb of this._subs) cb(regAddr, value);
  }

  /** Clear all stored values (e.g. on disconnect) */
  clear(): void {
    this._regs.clear();
    this._hiddenRegs.clear();
  }
}

export const registerStore = new RegisterStore();
export default RegisterStore;
