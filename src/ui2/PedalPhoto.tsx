/**
 * BFX1 新 UI · 照片踏板（TS-808 · 2026-10-13）
 * ══════════════════════════════════════════════════════════════
 * 用用户提供的硬件设计照替换过载模块的 CSS 外壳（PedalShell）。
 *
 * 设计原则（用户 2026-10-13 拍板：路线 B）：
 *   · 面板图 100% 保留原照（白背景已透明化），不做任何抹除
 *   · 旋钮/踩钉/LED 均为透明抠片，原位叠加 → 与原照像素级一致
 *   · 原照旋钮是无角度标记的平盖金属帽（旋转不可见）→ 用 108 高清
 *     滚花旋钮（白指示线）覆盖；刻度环保留为表盘
 *   · 交互完全复用 Knob 组件：竖直拖动 220px 满行程 / 270° 扫角
 *     （7:30 → 4:30 顺时针），白线实时跟随
 *   · 踩钉点按 = 旁通开关（reg 63），LED 联动；按下反馈为
 *     scale + 压暗（用户：其他状态后续补图再做）
 *   · 写硬件复用 onParam → BLE 20ms 闸门；拖动经 30ms 合并，
 *     防止快速拖动把闸门队列塞爆（卸载前强制 flush）
 *
 * 几何基准：面板裁切 599×715（tools/_slice_pedal_ui.py 实测）
 *   旋钮圆心 GAIN(134,171) TONE(298,171) VOL(463,172)，刻度环 r55–75
 *   LED(297,324) 踩钉(300,557)
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import Knob from './Knob';
import type { RegSpec } from './registers';
import { SPECS } from './registers';
import type { PanelProps } from './panels';
import { OD_MODELS } from '../data/_def';
import {
  peqGainDb, peqSetGainIdx, dbToPeqGainIdx,
} from './Knob';

import faceUrl from '../assets/pedals/ts808_face.webp';
import knobBaseUrl from '../assets/pedals/ts808_knob_base.webp';
import knobMarkUrl from '../assets/pedals/ts808_knob_mark.webp';
import switchUrl from '../assets/pedals/ts808_switch.webp';
import ledUrl from '../assets/pedals/ts808_led.webp';

/* ═══════════ 面板几何（599×715 坐标系，与裁切脚本一致） ═══════════ */
const PW = 599, PH = 715;

/**
 * 三个旋钮位（面板坐标）—— 2026-10-13 50% 穿越点精测（对准白芯/圆孔中心）
 * GAIN 白芯 (138.5,172.0) ｜ TONE 圆孔 (299.2,169.8) ｜ VOLUME 白芯 (463.0,172.2)
 */
const KNOB_SLOTS = [
  { x: 138.5, y: 172.0 },
  { x: 299.2, y: 169.8 },
  { x: 463.0, y: 172.2 },
];
/** 旋钮 asset 显示边长（旋钮盘径 ≈ 88.6，内切刻度环 r55 → 留 ~11px 间隙） */
const KNOB_BOX = 92;
const LED_POS = { x: 299.5, y: 324.0, box: 68 };     // 白热芯中心，asset 即原尺寸
const SW_POS = { x: 300.0, y: 556.5, box: 92 };      // 白盘中心，asset 92 → 白盘 70

/** 旋钮名 → 面板槽位（语义映射；不认识的旋钮 → 不上照片面板） */
const NAME_SLOT: Record<string, number> = {
  DRIVE: 0, GAIN: 0,
  TONE: 1,
  LEVEL: 2, VOLUME: 2,
};

export interface PhotoSkin {
  /** 槽位 → odDef 旋钮下标 */
  slots: (number | null)[];
}

/** 型号是否配照片面板（目前仅 TS-808；其余回退标准 PedalShell） */
export function photoSkinFor(md: { id: string; knobs: { name: string }[] }): PhotoSkin | null {
  if (md.id !== 'ts808_g') return null;
  if (md.knobs.length !== 3) return null;
  const slots: (number | null)[] = [null, null, null];
  for (let i = 0; i < md.knobs.length; i++) {
    const s = NAME_SLOT[md.knobs[i].name];
    if (s === undefined || slots[s] !== null) return null;   // 重名/未知 → 放弃
    slots[s] = i;
  }
  return slots.every((s) => s !== null) ? { slots } : null;
}

export default function PedalPhoto(p: PanelProps) {
  const md = OD_MODELS[p.modelIdx] ?? OD_MODELS[0];
  const skin = photoSkinFor(md)!;

  /* ── 容器宽度测量（控件按面板坐标 × 比例定位） ── */
  const boxRef = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const k = w > 0 ? w / PW : 0;

  /* ── 写合并：30ms 内同寄存器只发最新值；卸载前强制 flush ── */
  const pending = useRef(new Map<number, number>());
  const timer = useRef<number | null>(null);
  const onParamRef = useRef(p.onParam);
  onParamRef.current = p.onParam;
  const flush = useCallback(() => {
    timer.current = null;
    if (!pending.current.size) return;
    pending.current.forEach((v, reg) => onParamRef.current(reg, v));
    pending.current.clear();
  }, []);
  const write = useCallback((reg: number, v: number) => {
    pending.current.set(reg, v);
    if (timer.current === null) timer.current = window.setTimeout(flush, 30);
  }, [flush]);
  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    pending.current.forEach((v, reg) => onParamRef.current(reg, v));
    pending.current.clear();
  }, []);

  /* ── 踩钉按压反馈（不做额外状态图，用户后续补图） ── */
  const [pressed, setPressed] = useState(false);

  /* ── 旋钮渲染：复刻 OdPanel 三分支（PEQ 增益 / 普通寄存器） ── */
  const renderKnob = (slotIdx: number) => {
    const ki = skin.slots[slotIdx];
    if (ki === null) return null;
    const kb = md.knobs[ki];
    const slot = KNOB_SLOTS[slotIdx];
    const dia = KNOB_BOX * k;
    const pos = {
      position: 'absolute' as const,
      left: slot.x * k, top: slot.y * k,
      transform: 'translate(-50%, -50%)',
    };

    // ② PEQ 增益段（TONE → reg 53 HIGH_SHELF 增益字段）
    if (kb.unit === 'db') {
      const word = p.values[kb.addr] ?? 0;
      const db = peqGainDb(word);
      const spec: RegSpec = {
        reg: kb.addr, min: kb.lo, max: kb.hi, step: kb.step, def: 0,
        fmt: (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)} dB`,
      };
      return (
        <div key={kb.name} style={pos}>
          <Knob label={kb.name} spec={spec}
            value={Math.max(kb.lo, Math.min(kb.hi, db))}
            onChange={(nv) => write(kb.addr, peqSetGainIdx(word, dbToPeqGainIdx(nv)))}
            d={dia} baseImg={knobBaseUrl} markImg={knobMarkUrl} chrome={false} />
        </div>
      );
    }
    // ③ 普通寄存器（DRIVE 49 / LEVEL 51）
    const spec: RegSpec = {
      ...SPECS[kb.addr === 49 ? 'OD_DRIVE' : 'OD_LEVEL'],
      min: kb.lo, max: kb.hi, step: kb.step,
      def: Math.round((kb.lo + kb.hi) / 2),
    };
    return (
      <div key={kb.name} style={pos}>
        <Knob label={kb.name} spec={spec}
          value={p.values[kb.addr] ?? spec.def}
          onChange={(nv) => write(kb.addr, nv)}
          d={dia} baseImg={knobBaseUrl} markImg={knobMarkUrl} chrome={false} />
      </div>
    );
  };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, width: '100%',
    }}>
      {/* ── 照片面板（居中 + 保持原图比例） ── */}
      <div ref={boxRef} style={{
        position: 'relative', width: '100%', maxWidth: 360, margin: '0 auto',
        aspectRatio: `${PW} / ${PH}`, userSelect: 'none',
      }}>
        <img src={faceUrl} alt="" draggable={false}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />

        {k > 0 && (
          <>
            {/* LED（旁通指示灯：开=红亮，关=压暗） */}
            <img src={ledUrl} alt="" draggable={false}
              style={{
                position: 'absolute', left: LED_POS.x * k, top: LED_POS.y * k,
                width: LED_POS.box * k, height: LED_POS.box * k,
                transform: 'translate(-50%, -50%)', pointerEvents: 'none',
                filter: p.on ? 'none' : 'brightness(.20) saturate(.40)',
                transition: 'filter .16s',
              }} />

            {/* 三个旋钮 */}
            {renderKnob(0)}
            {renderKnob(1)}
            {renderKnob(2)}

            {/* 踩钉（点按 = 旁通开关） */}
            <button
              onClick={() => p.onToggle()}
              onPointerDown={() => setPressed(true)}
              onPointerUp={() => setPressed(false)}
              onPointerLeave={() => setPressed(false)}
              onPointerCancel={() => setPressed(false)}
              aria-label="旁通开关"
              style={{
                position: 'absolute', left: SW_POS.x * k, top: SW_POS.y * k,
                width: SW_POS.box * k, height: SW_POS.box * k,
                transform: `translate(-50%, -50%) scale(${pressed ? 0.94 : 1})`,
                background: 'transparent', border: 'none', padding: 0, borderRadius: '50%',
                cursor: 'pointer', touchAction: 'none',
                transition: 'transform .09s ease',
              }}>
              <img src={switchUrl} alt="" draggable={false}
                style={{
                  width: '100%', height: '100%', pointerEvents: 'none',
                  filter: pressed ? 'brightness(.80)' : 'none',
                  transition: 'filter .09s ease',
                }} />
            </button>
          </>
        )}
      </div>

      {/* ── 底部说明（与照片面板同宽居中，与原 PedalShell 的 note 一致） ── */}
      <div style={{
        width: '100%', maxWidth: 360, fontSize: 11, color: '#8b93a2', lineHeight: 1.5,
        textAlign: 'center', background: 'rgba(10,12,16,.45)',
        borderLeft: '2px solid #5bc8f5', borderRadius: '0 6px 6px 0',
        padding: '5px 8px', boxSizing: 'border-box',
      }}>
        {md.name} · {md.group} · {md.knobs.length} 旋钮 · {md.circuit.slice(0, 20)}
        {p.on ? '' : ' · 已旁通'}
      </div>
    </div>
  );
}
