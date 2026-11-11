/**
 * BFX1 · 调试模式 v2（2026-10-19 用户要求「换成新界面，原有模式取消」）
 *
 * 与原调试面板的区别：
 *   · 不再显示寄存器编号 / 参数表 / 日志 —— 只做「看得懂的音色调节」
 *   · 按信号链竖排：PRE EQ → 过载 → POST EQ → 曲线（箱头同样五段）
 *   · 每段 PEQ 一根调音台推子（增益）+ 类型选框 + 频率旋钮 + Q/S 旋钮
 *   · 频率 / Q / S 走固件离散表（362 / 101 / 25 档），旋钮按档步进
 *   · 箱头 OUTPUT EQ 16 段 → 8 段一页，左右滑动翻两页
 *   · 导出自定义模块：进「自定义」组，固定音色、不可再调，每类上限 5 个
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  parsePEQData, buildPEQData,
  PEQ_FREQ_TABLE, PEQ_Q_TABLE, PEQ_S_TABLE,
} from '../data/peqCodec';
import {
  loadCustomModules, addCustomModule, removeCustomModule, customOf,
  CUSTOM_LIMIT, CUSTOM_KNOB, type CustomModule,
} from './customModules';
/* ★ 2026-10-26：音量上限的**唯一权威**（288 = 0 dB）。
   旧代码在这里写字面量 286，导致工程模式永远拿不到 0 dB。 */
import { VOL_MIN_REG, VOL_MAX_REG } from '../data/ampKnobResolve';

/* ★★ v3.85：自定义卡片上的旋钮要和首页箱头长得一模一样 → 用同一个 KnobRing；
   四段音色旋钮的归一位置与 dB 读数走 Knob.peqGainDb（与首页同一换算）。 */
import KnobRing from './KnobRing';
import { peqGainDb } from './Knob';

/**
 * 自定义模块卡片上的旋钮「只读视图」：寄存器原值 → { 归一位置, 读数 }。
 * · GAIN(64) / DRIVE(79)：0.5 dB/LSB，行程按箱头 40 dB 上限 → 0…80
 * · VOLUME(66)：166…288（288 = 0 dB），0.25 显示单位/LSB —— 与工程模式 VOL 同口径
 * · 68/69/70/71：PEQ 增益词 → −24 + idx×0.2 dB，显示范围取 ±9（与首页 N8 一致）
 */
function customKnobView(addr: number, raw: number | undefined): { norm: number; read: string } {
  const v = typeof raw === 'number' && Number.isFinite(raw) ? raw : 0;
  const cl = (n: number) => Math.max(0, Math.min(1, n));
  if (addr === 64 || addr === 79) {
    return { norm: cl(v / 80), read: `${(v * 0.5).toFixed(1)}` };
  }
  if (addr === 66) {
    const span = Math.max(1, VOL_MAX_REG - VOL_MIN_REG);
    return { norm: cl((v - VOL_MIN_REG) / span), read: `${((v - 288) * 0.25).toFixed(1)}` };
  }
  /* N4 四段（68/69/70/71）—— 增益取值范围 ±9 dB */
  const db = peqGainDb(v);
  return { norm: cl((db + 9) / 18), read: `${db >= 0 ? '+' : ''}${db.toFixed(1)}` };
}

/* ══════════════════════ 常量 ══════════════════════ */

const OD_PRE = [44, 45, 46, 47];
const OD_POST = [53, 54, 55, 56];
const AMP_N1 = [59, 60, 61, 62];
const AMP_N4 = [68, 69, 70, 71];

/* ★★ v3.86（用户 2026-10-27）：N4 四段的**显示顺序**必须与首页箱头一致（低频→中频→高频→临场）。
   注意寄存器顺序是 68(TREBLE) / 69(BASS) / 70(MID) / 71(PRESENCE) —— 与显示序不一致，
   所以单独给一个显示序数组；`AMP_N4` 原样保留给导出与频响曲线（与顺序无关）。 */
const N4_DISPLAY = [69, 70, 68, 71];
const N4_META: Record<number, { name: string; hz: number }> = {
  69: { name: '低频', hz: 99 },
  70: { name: '中频', hz: 650 },
  68: { name: '高频', hz: 3170 },
  71: { name: '临场', hz: 4000 },
};
const AMP_N5 = [74, 75, 76, 77];
const AMP_N8 = [83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98];

const GAIN_STEPS = 180;          // 0…180，每步 0.2 dB
const GAIN_ZERO = 120;           // = 0 dB
const gainDb = (idx: number) => -24 + idx * 0.2;
const dbToIdx = (db: number) => Math.max(0, Math.min(GAIN_STEPS, Math.round((db + 24) / 0.2)));

type UiType = { id: number; label: string; qs: 'q' | 's' | null };
const UI_TYPES: UiType[] = [
  { id: 0, label: 'PEAK', qs: 'q' },
  { id: 1, label: 'LOW', qs: 's' },
  { id: 2, label: 'HIGH', qs: 's' },
  /* ★ v3.79（用户 2026-10-26）：原来只有 6/7 两个「HPF / LPF」，实际固件有四个滤波器类型
     —— 6=一阶 HPF、4=二阶 HPF、7=一阶 LPF、5=二阶 LPF。补齐后每个都能单选。 */
  { id: 6, label: 'HPF1', qs: null },
  { id: 4, label: 'HPF2', qs: null },
  { id: 7, label: 'LPF1', qs: null },
  { id: 5, label: 'LPF2', qs: null },
  /* ★ 2026-10-26（审查 A5）：补回 ALLPASS(3)。
     原来 7 个类型里唯一遗漏它 → 段型 3 被 normalizeType 兜成 PEAK，
     读数/曲线全错；而且下拉里没有回程项，**一旦选过别的类型就再也设不回 ALLPASS**。 */
  { id: 3, label: 'PASS', qs: 'q' },
];
/** 已知类型都能单独选中；只有真正未知的编码才兜到 PEAK */
const normalizeType = (t: number): UiType =>
  UI_TYPES.find((x) => x.id === t) ?? UI_TYPES[0];

/** 0 dB 在推子行程上的位置（top 百分比）—— idx=120/180 → 33.33% */
const ZERO_TOP = 100 - (GAIN_ZERO / GAIN_STEPS) * 100;
/** 0 dB 距底部的距离（供增益条定位） */
const ZERO_BOTTOM = 100 - ZERO_TOP;

const DEFAULT_PEQ = buildPEQData(0, 174 /* ~1 kHz */, GAIN_ZERO, 16 /* 1.00 */, 10 /* 0.71 */);

const fmtHz = (hz: number) => (hz >= 1000 ? `${(hz / 1000).toFixed(hz >= 10000 ? 1 : 2)}k` : `${hz.toFixed(hz < 100 ? 1 : 0)}`);
const fmtDb = (db: number) => (db > 0.05 ? `+${db.toFixed(1)}` : db < -0.05 ? `−${Math.abs(db).toFixed(1)}` : '0.0');

/* ══════════════════════ 小旋钮 ══════════════════════ */

function MiniKnob({
  value, min, max, step = 1, size = 30, label, accent, disabled, fmt, onChange,
}: {
  value: number; min: number; max: number; step?: number; size?: number;
  label: string; accent: string; disabled?: boolean;
  fmt: (v: number) => string;
  onChange: (v: number) => void;
}) {
  const drag = useRef<{ y: number; v: number } | null>(null);
  const [preview, setPreview] = useState<number | null>(null);
  const v = preview ?? value;
  const t = Math.max(0, Math.min(1, (v - min) / Math.max(1, max - min)));
  const ang = -135 + 270 * t;
  const R = size / 2;

  const down = (e: React.PointerEvent) => {
    if (disabled) return;
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    drag.current = { y: e.clientY, v };
    setPreview(v);
    e.preventDefault();
  };
  const move = (e: React.PointerEvent) => {
    if (!drag.current || disabled) return;
    const dy = drag.current.y - e.clientY;
    const span = Math.round((max - min) / step);
    const nv = Math.max(min, Math.min(max, drag.current.v + Math.round((dy / 110) * span) * step));
    setPreview(nv);
  };
  const up = () => {
    if (drag.current && preview !== null && preview !== value) onChange(preview);
    drag.current = null;
    setPreview(null);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, opacity: disabled ? .35 : 1 }}>
      <div
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
        role="slider" aria-label={label} aria-valuenow={Math.round(t * 100)}
        style={{
          width: size, height: size, borderRadius: '50%', position: 'relative', touchAction: 'none',
          background: 'radial-gradient(circle at 36% 28%, #454C57 0%, #23272E 48%, #2b3036 100%)',
          border: '1px solid #343B46', boxShadow: 'inset 0 1px 0 rgba(255,255,255,.09), 0 3px 7px rgba(0,0,0,.5)',
          cursor: disabled ? 'default' : 'grab', flexShrink: 0,
        }}
      >
        <span style={{
          position: 'absolute', left: '50%', top: 3, width: 2, height: size * 0.31, borderRadius: 2,
          background: accent, transformOrigin: `50% ${R - 4}px`,
          transform: `translateX(-50%) rotate(${ang}deg)`,
          boxShadow: `0 0 5px ${accent}88`, opacity: disabled ? .4 : 1,
        }} />
      </div>
      <span style={{ fontSize: 10.5, color: '#71798A', letterSpacing: .6, lineHeight: 1 }}>{label}</span>
      <span style={{ fontSize: 10.5, fontWeight: 600, color: disabled ? '#4A5260' : '#C7CDD8', lineHeight: 1.1 }}>
        {disabled ? '—' : fmt(v)}
      </span>
    </div>
  );
}

/* ══════════════════════ 单个 PEQ 频段 ══════════════════════ */

function Band({
  addr, raw, defHz, accent, selected, onSelect, onWrite, gainLocked = false, compact = false, toneName,
}: {
  addr: number; raw: number; defHz?: number; accent: string;
  selected: boolean; onSelect: () => void;
  onWrite: (addr: number, value: number) => void;
  /** ★★ v3.86：锁定段（N4）只读旋钮下方的名称，与首页箱头同一套文字 */
  toneName?: string;
  /** ★ v3.79：该段不接受增益调节（N4 中频段）—— 增益由箱头面板旋钮控制 */
  gainLocked?: boolean;
  /** ★ v3.79：窄列紧凑布局（8 段一行时，FREQ / Q 竖排） */
  compact?: boolean;
}) {
  /* 未连硬件 / 寄存器还没读回时，按该段在设计上的频点给一个占位值，
     避免所有段都显示 561 Hz / Q1.00 看起来像"没读到"。 */
  const fallback = useMemo(() => {
    if (!defHz) return DEFAULT_PEQ;
    let idx = 0;
    for (let i = 0; i < PEQ_FREQ_TABLE.length; i++) if (PEQ_FREQ_TABLE[i] <= defHz) idx = i;
    return buildPEQData(0, idx, GAIN_ZERO, 16, 10);
  }, [defHz]);
  const data = raw || fallback;
  /**
   * ★★ 2026-10-26（P0 修复）：本段是否真的有读回值。
   *
   *  `raw || fallback` 让"没读到"的段也能画出旋钮位置，但 `commit()` 是
   *  `buildPEQData(n.type, n.freq, n.gain, n.q, n.s)` —— **整字重写 32 位**。
   *  未读回时 p 来自占位值（PEAK / 默认频点 / Q1.00），用户只拖了一下增益，
   *  该段的 type/freq/Q 就被静默改成占位值 → **永久写坏这个地址**。
   *  （导出路径 `exportRegs()` 里特意 `if (v)` 跳过 0，说明作者知道这个风险，
   *    只是交互路径漏了防护。）
   *  修法：没有真实读回值 → 该段整体只读，任何写入入口直接拒绝。
   */
  const live = raw > 0;
  const p = useMemo(() => parsePEQData(data), [data]);
  const ui = normalizeType(p.type);
  const [localGain, setLocalGain] = useState<number | null>(null);
  const dragging = useRef<{ y: number; v: number } | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);

  /* ★ 2026-10-26：钳到行程内 —— p.gain 取自 8 位字段（≤255），原样绘制会让手柄跑到轨道外
     （255 时 top = −41.7%），读数还会显示 +27 dB（PEQ 上限只有 +12）。 */
  const gainIdx = Math.max(0, Math.min(GAIN_STEPS, Math.round(localGain ?? p.gain)));
  const db = gainDb(gainIdx);
  const pct = (gainIdx / GAIN_STEPS) * 100;

  const commit = (patch: Partial<{ type: number; freq: number; gain: number; q: number; s: number }>) => {
    /* ★★ 2026-10-26（P0）：没有读回值 → 一律不写（否则整字覆盖会把该段改成占位 PEAK） */
    if (!live) return;
    const n = { ...p, ...patch };
    onWrite(addr, buildPEQData(n.type, n.freq, n.gain, n.q, n.s));
  };

  /** ★ 2026-10-26：触屏双击复位（pointerdown 自己判时间戳，不依赖被 preventDefault 抑制的 dblclick） */
  const lastTap = useRef(0);

  const faderDown = (e: React.PointerEvent) => {
    if (!live) return;                                   // 未读回 → 只读
    const now = Date.now();
    if (now - lastTap.current <= 320) {
      lastTap.current = 0;
      dragging.current = null;
      setLocalGain(null);
      commit({ gain: GAIN_ZERO });
      e.preventDefault();
      return;
    }
    lastTap.current = now;
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    dragging.current = { y: e.clientY, v: gainIdx };
    setLocalGain(gainIdx);
    onSelect();
    e.preventDefault();
  };
  const faderMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    const h = trackRef.current?.clientHeight || 84;
    const dy = dragging.current.y - e.clientY;
    const nv = Math.max(0, Math.min(GAIN_STEPS, Math.round(dragging.current.v + (dy / h) * GAIN_STEPS)));
    setLocalGain(nv);
  };
  const faderUp = () => {
    if (localGain !== null && localGain !== p.gain) commit({ gain: localGain });
    dragging.current = null;
    setLocalGain(null);
  };

  /* ★ 2026-10-19（用户要求）：类型不再「点一下轮换」，改为点击后就地展开下拉框 */
  const [typeMenu, setTypeMenu] = useState(false);
  useEffect(() => {
    if (!typeMenu) return;
    const close = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (t && t.closest(`[data-typemenu="${addr}"]`)) return;
      setTypeMenu(false);
    };
    document.addEventListener('pointerdown', close, true);
    return () => document.removeEventListener('pointerdown', close, true);
  }, [typeMenu, addr]);

  return (
    <div
      onPointerDown={() => onSelect()}
      style={{
        position: 'relative',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
        padding: '5px 2px 6px', borderRadius: 10, minWidth: 0,
        background: selected ? `${accent}14` : 'transparent',
        boxShadow: selected ? `inset 0 0 0 1px ${accent}55` : 'none',
        transition: 'background .12s',
        /* 页面需要能上下滑：只有推子/旋钮自身锁手势，卡片其余区域放行 */
        touchAction: 'pan-y',
      }}
    >
      {/* 增益读数 —— ★★ v3.86：锁定段原来显示 7.5px 的 AUTO，现在与推子段统一走 fmtDb，
          数值同源（PEQ_GAIN_ZERO 120 / 0.2 dB/LSB），所以和首页箱头读数逐字一致。 */}
      <div style={{
        fontSize: 9.5, fontWeight: 700, lineHeight: 1, letterSpacing: 0,
        color: Math.abs(db) < 0.05 ? '#c2c9d6' : db > 0 ? '#8FD18A' : '#E08B6A',
      }}>{fmtDb(db)}</div>

      {/* 推子 —— ★ v3.79：0 dB 参考线按真实行程（idx 120/180 = 33.3%）定位，
          原来写死 50% 与手柄位置对不上；双击推子复位到 0 dB。 */}
      {/* ★★ v3.86（用户 2026-10-27「文字全部去掉，改成四个箱头旋钮一样的旋钮，不可调节」）：
          只读旋钮，归一位置走 ±9 dB 居中 —— **不能**沿用推子的 idx/180（0 dB 在 66.7%），
          否则同一条寄存器在首页与工程模式会转到不同角度，「同步显示」就失真了。 */}
      {gainLocked ? (
        <div style={{ height: 66, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
          <KnobRing norm={Math.max(0, Math.min(1, (db + 9) / 18))} size={40} mode="display" ariaLabel={toneName ?? ''} />
          <span style={{
            fontSize: 10.5, lineHeight: 1.1, color: '#c2c9d6', maxWidth: '100%',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>{toneName ?? ''}</span>
        </div>
      ) : (
      <div
        ref={trackRef}
        onPointerDown={faderDown} onPointerMove={faderMove} onPointerUp={faderUp} onPointerCancel={faderUp}
        title={live ? '双击复位 0 dB' : '该段尚未读回（只读）'}
        style={{
          position: 'relative', width: '100%', height: 66, touchAction: 'none',
          cursor: live ? 'grab' : 'not-allowed',
          /* ★ 2026-10-26：未读回的段明确置灰，避免用户误以为能调（点下去静默无反应最糟） */
          opacity: live ? 1 : 0.35,
        }}
      >
        <div style={{
          position: 'absolute', left: '50%', top: 0, bottom: 0, width: 6, marginLeft: -3,
          borderRadius: 4, background: 'rgba(255,255,255,.055)',
          boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.04)',
        }} />
        {/* 0 dB 参考线 —— 与手柄同一坐标口径 */}
        <div style={{ position: 'absolute', left: 2, right: 2, top: `${ZERO_TOP}%`, height: 1, background: 'rgba(255,255,255,.22)' }} />
        {Math.abs(db) > 0.05 && (
          <div style={{
            position: 'absolute', left: '50%', width: 6, marginLeft: -3, borderRadius: 4,
            ...(db > 0
              ? { bottom: `${ZERO_BOTTOM}%`, height: `${Math.max(2, pct - ZERO_BOTTOM)}%`, background: 'linear-gradient(180deg,#5BC8F5,rgba(91,200,245,.45))', boxShadow: '0 0 7px rgba(91,200,245,.45)' }
              : { top: `${ZERO_TOP}%`, height: `${Math.max(2, ZERO_BOTTOM - pct)}%`, background: 'linear-gradient(180deg,rgba(224,139,106,.45),#E08B6A)', boxShadow: '0 0 7px rgba(224,139,106,.4)' }),
          }} />
        )}
        <div style={{
          position: 'absolute', left: '50%', width: 22, height: 10, borderRadius: 3,
          transform: 'translate(-50%, -50%)', top: `${100 - pct}%`,
          background: 'linear-gradient(180deg,#5d646f,#3a4048)', border: '1px solid #6d7480',
          boxShadow: '0 2px 6px rgba(0,0,0,.55), inset 0 1px 0 rgba(255,255,255,.18)',
        }}>
          <span style={{ position: 'absolute', left: '50%', top: '50%', width: 9, height: 1, background: 'rgba(255,255,255,.55)', transform: 'translate(-50%,-50%)' }} />
        </div>
      </div>
      )}

      {/* 类型（点击就地展开下拉框） */}
      <div style={{ position: 'relative', width: '100%' }}>
        <div
          onPointerUp={(e) => { e.stopPropagation(); if (!live) return; setTypeMenu((v) => !v); }}
          role="button" aria-label={`滤波器类型 ${ui.label}`} aria-expanded={typeMenu}
          aria-disabled={!live}
          data-typemenu={addr}
          style={{
            width: '100%', height: 18, borderRadius: 5, display: 'flex', alignItems: 'center',
            justifyContent: 'center', gap: 3, cursor: live ? 'pointer' : 'not-allowed',
            background: typeMenu ? `${accent}33` : `${accent}20`,
            border: `1px solid ${accent}66`, color: accent,
            /* ★★ v3.86（用户：「16 段 EQ 的滤波器文字太大，超出外框」）：
               16 段一行 8 列，列宽只有 ~38px，10.5px 的 4 字（HIGH / PASS）+ 下拉箭头会顶出去。
               紧凑列统一降到 10px、字距归零、**去掉箭头**（下拉仍可点，只是不再占宽）。 */
            fontSize: compact ? 10 : 10.5, fontWeight: 700,
            letterSpacing: compact ? 0 : .4, boxSizing: 'border-box',
            opacity: live ? 1 : 0.35, padding: 0, overflow: 'hidden',
          }}
        >
          {ui.label}
          {!compact && (
            <span style={{ width: 0, height: 0, borderLeft: '2.5px solid transparent', borderRight: '2.5px solid transparent', borderTop: '3px solid currentColor', opacity: .6 }} />
          )}
        </div>
        {typeMenu && (
          <div data-typemenu={addr} style={{
            position: 'absolute', top: '100%', marginTop: 2, zIndex: 60,
            /* 紧凑列给下拉一个最小宽度并向左溢出，避免 38px 里挤 6 个选项 */
            ...(compact ? { left: 0, minWidth: 104 } : { left: 0, right: 0 }),
            background: '#2a2f37', border: `1px solid ${accent}77`, borderRadius: 7,
            boxShadow: '0 8px 22px rgba(0,0,0,.65)', overflow: 'hidden',
          }}>
            {UI_TYPES.map((t) => (
              <div key={t.id} data-typemenu={addr}
                onPointerUp={(e) => { e.stopPropagation(); commit({ type: t.id }); setTypeMenu(false); }}
                style={{
                  height: 21, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10.5, fontWeight: 700, letterSpacing: .4, cursor: 'pointer',
                  color: t.id === ui.id ? '#242a33' : '#C7CDD8',
                  background: t.id === ui.id ? accent : 'transparent',
                }}>{t.label}</div>
            ))}
          </div>
        )}
      </div>

      {/* 频率 + Q/S —— compact（8 段一行）时竖排，列宽只占一个旋钮 */}
      <div style={{ display: 'flex', flexDirection: compact ? 'column' : 'row', alignItems: 'center', gap: compact ? 2 : 4, marginTop: 2 }}>
        <MiniKnob
          value={p.freq} min={0} max={PEQ_FREQ_TABLE.length - 1} size={compact ? 24 : 28} accent={accent}
          label="FREQ" fmt={(i) => fmtHz(PEQ_FREQ_TABLE[Math.round(i)])}
          onChange={(v) => commit({ freq: v })}
        />
        <MiniKnob
          value={ui.qs === 'q' ? p.q : p.s}
          min={0} max={ui.qs === 'q' ? PEQ_Q_TABLE.length - 1 : PEQ_S_TABLE.length - 1}
          size={compact ? 24 : 28} accent={accent} disabled={!ui.qs}
          label={ui.qs === 'q' ? 'Q' : ui.qs === 's' ? 'S' : 'Q/S'}
          fmt={(i) => {
            const tbl = ui.qs === 'q' ? PEQ_Q_TABLE : PEQ_S_TABLE;
            return (tbl[Math.round(i)] ?? 0).toFixed(2);
          }}
          onChange={(v) => commit(ui.qs === 'q' ? { q: v } : ui.qs === 's' ? { s: v } : {})}
        />
      </div>
    </div>
  );
}

/* ══════════════════════ 卡片外壳 ══════════════════════ */

function Card({ title, sub, accent, children }: {
  title: string; sub?: string; accent: string; children: React.ReactNode;
}) {
  return (
    <div style={{
      borderRadius: 13, padding: '7px 7px 8px',
      background: 'linear-gradient(165deg, #2a2f37, #252a31)',
      border: '1px solid #232934',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '1px 4px 6px' }}>
        <span style={{ width: 5, height: 5, borderRadius: 2, background: accent, boxShadow: `0 0 6px ${accent}` }} />
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: .8, color: '#D7DCE4' }}>{title}</span>
        {sub && <span style={{ marginLeft: 'auto', fontSize: 10.5, color: '#8B93A2', letterSpacing: .4 }}>{sub}</span>}
      </div>
      {children}
    </div>
  );
}

/* ══════════════════════ 主组件 ══════════════════════ */

export interface DebugPanelV2Props {
  visible: boolean;
  onClose: () => void;
  onWrite: (reg: number, value: number) => void;
  regCacheRef: React.MutableRefObject<Record<number, number>>;
  regTick?: number;
  onApplyModule: (modId: string, values: Record<number, number>) => void;
  logEntries?: Array<{ time: string; reg: number; val: number }>;
  /**
   * ★ 2026-10-26（审查 A4）：当前箱头型号的 GAIN/DRIVE 上限（dB）。
   *   由 Index 按当前型号的 `limit` 传入 —— CLEAN/BASS 20、CRUNCH 25、HIGH-GAIN 40。
   *   旧实现把行程写死 0…80（= 40 dB），于是 CLEAN 箱头在工程模式里
   *   可以被推到设计上限的 2 倍，和首页同一参数读数直接打架。
   */
  ampLimit?: number;
}

type Tab = 'od' | 'amp' | 'custom';

export default function DebugPanelV2({
  visible, onClose, onWrite, regCacheRef, regTick, onApplyModule, ampLimit = 40,
}: DebugPanelV2Props) {
  const [tab, setTab] = useState<Tab>('od');
  const [sel, setSel] = useState<number | null>(null);
  /* ★ v3.79：自定义页签内部再分「过载 / 箱头」两个分组（用户 2026-10-26） */
  const [customKind, setCustomKind] = useState<'od' | 'amp'>('od');
  const [custom, setCustom] = useState<CustomModule[]>(() => loadCustomModules());
  const [exporting, setExporting] = useState(false);
  const [name, setName] = useState('');
  const [msg, setMsg] = useState('');

  const reg = useCallback((a: number) => regCacheRef.current[a] ?? 0, [regCacheRef]);

  /* 重新读一遍自定义模块（导出 / 删除后） */
  useEffect(() => { if (visible) setCustom(loadCustomModules()); }, [visible]);

  /* 切页时复位选中段 + 回到第 1 页 */
  useEffect(() => { setSel(null); }, [tab]);

  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(''), 2600);
    return () => clearTimeout(t);
  }, [msg]);

  if (!visible) return null;

  /* regTick 变化 → 强制重渲染（读取 regCacheRef 的新值） */
  void regTick;

  const tabAccent = tab === 'amp' ? '#E8B860' : tab === 'custom' ? '#C0A8FF' : '#F06F21';

  /* ── 推子组 ── */
  const bandGrid = (
    addrs: number[], cols = 4, accent = '#5BC8F5',
    opt?: {
      compact?: boolean; gainLocked?: boolean;
      /** ★★ v3.86：锁定段只读旋钮下方的名称（与首页箱头同一套文字） */
      toneNameOf?: (a: number) => string | undefined;
      /** ★★ v3.86：按寄存器给真实占位频点 —— 传了显示序之后，按下标算频点会错位 */
      defHzOf?: (a: number) => number | undefined;
    },
  ) => (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: opt?.compact ? 1 : 2 }}>
      {addrs.map((a, i) => (
        <Band
          key={a} addr={a} raw={reg(a)} accent={accent}
          defHz={opt?.defHzOf ? opt.defHzOf(a) : 40 * Math.pow(400, addrs.length <= 1 ? 0 : i / (addrs.length - 1))}
          selected={sel === a} onSelect={() => setSel(a)}
          onWrite={onWrite}
          compact={opt?.compact} gainLocked={opt?.gainLocked}
          toneName={opt?.toneNameOf?.(a)}
        />
      ))}
    </div>
  );

  /* ★★ v3.85（用户要求「工程模式里面不做文字介绍」）：
     旧的 Hint 说明条组件（7 条量纲/行程解释）整块删除 —— 工程模式只留可操作的旋钮，
     不再堆说明文字。 */

  /* ── 导出 ── */
  const exportRegs = () => {
    const out: Record<number, number> = {};
    const regs = tab === 'amp'
      ? [...AMP_N1, ...AMP_N4, ...AMP_N5, ...AMP_N8, 64, 65, 66, 79, 80, 81, 239]
      : [...OD_PRE, ...OD_POST, 49, 50, 51];
    for (const a of regs) {
      const v = reg(a);
      /* 跳过没读到 / 未设置的段：写 0 会把真机上已有的段清成非法值 */
      if (v) out[a] = v;
    }
    return out;
  };

  const doExport = () => {
    const kind = tab === 'amp' ? 'amp' : 'od';
    const mod = addCustomModule(kind, name, exportRegs());
    if (!mod) {
      setMsg(`自定义${kind === 'amp' ? '箱头' : '过载'}已满 ${CUSTOM_LIMIT} 个，请先删除一个`);
      return;
    }
    setCustom(loadCustomModules());
    window.dispatchEvent(new Event('bfx-custom-changed'));
    setExporting(false);
    setName('');
    setTab('custom');
    setCustomKind(kind === 'amp' ? 'amp' : 'od');
    setMsg('已生成到「自定义」组');
  };

  const applyCustom = (m: CustomModule) => {
    /* 固定音色：整包写入（含模块开关位），界面不再提供内部参数 */
    onApplyModule(m.kind === 'od' ? 'overdrive' : 'amp-head', m.regs);
    /* 通知首页把「当前型号」切到这个自定义模块，卡片才会显示它的名字 */
    window.dispatchEvent(new CustomEvent('bfx-custom-apply', { detail: { kind: m.kind, id: m.id } }));
    setMsg(`已加载「${m.name}」`);
  };

  const del = (m: CustomModule) => {
    removeCustomModule(m.id);
    setCustom(loadCustomModules());
    window.dispatchEvent(new Event('bfx-custom-changed'));
  };

  const odList = custom.filter((m) => m.kind === 'od');
  const ampList = custom.filter((m) => m.kind === 'amp');

  const customCard = (m: CustomModule) => {
    const accent = m.kind === 'amp' ? '#E8B860' : '#F06F21';
    const knobs = CUSTOM_KNOB[m.kind];
    /* ★★ 2026-10-26：自定义箱头已放开为「全参数可调」（GAIN/DRIVE/VOL + 低中高临场），
       只有自定义过载仍然是「EQ 固化」。文案与徽章必须跟着分叉，否则用户以为不能调。 */
    const live = m.kind === 'amp';
    return (
      <div key={m.id} style={{
        borderRadius: 12, padding: '8px 9px',
        background: 'linear-gradient(165deg, #2a2e37, #252a31)', border: '1px solid #2A3140',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 7 }}>
          <span style={{ width: 5, height: 5, borderRadius: 2, background: accent }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: '#E6EAF0', maxWidth: '52%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</span>
          <span style={{
            fontSize: 10.5, padding: '2px 5px', borderRadius: 4, letterSpacing: .4,
            background: live ? 'rgba(232,184,96,.12)' : 'rgba(192,168,255,.10)',
            border: `1px solid ${live ? 'rgba(232,184,96,.45)' : 'rgba(192,168,255,.35)'}`,
            color: live ? '#E8B860' : '#C7B4FF',
          }}>{live ? '可调' : '已锁定'}</span>
          <div onPointerUp={() => del(m)} style={{ marginLeft: 'auto', fontSize: 10.5, color: '#8A93A1', padding: '3px 7px', borderRadius: 6, border: '1px solid #333B49' }}>删除</div>
          <div onPointerUp={() => applyCustom(m)} style={{ fontSize: 10.5, color: '#242a33', fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: accent }}>加载</div>
        </div>
        {/* ★★ v3.85（用户要求「四个箱头旋钮使用和箱头一样的旋钮和文字注释，去掉现在的文字」）：
            原来这里是「名称 / 数值 / 2段·650Hz」三行纯文字，和首页箱头卡完全两套样子。
            现在改成与首页箱头同一套：**上方数值 + KnobRing 旋钮 + 下方名称 + 段位**，
            4 列网格（不再是 flex 换行堆叠，长名也不会顶出卡片外框）。 */}
        {/* ★★★ 2026-10-30：列数上限 4 → **5**。
            自定义箱头补全为「增益 / 音量1 / 驱动 / 音量2 / 总音量 + 四段音色」= **9 枚**，
            4 列会排成 4+4+1 —— 最后一行孤零零一个旋钮，卡片右半边整块空白。
            5 列正好 5+4 两行；过载仍是 2 枚（2 列）。 */}
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(5, knobs.length)}, minmax(0, 1fr))`, gap: '6px 4px', padding: '0 2px' }}>
          {knobs.map((k) => {
            const kd = customKnobView(k.addr, m.regs[k.addr]);
            return (
              <div key={k.key} style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, minWidth: 0,
              }}>
                <span style={{
                  fontSize: 10.5, fontWeight: 700, lineHeight: 1, color: '#D7DCE4',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%',
                }}>{kd.read}</span>
                <KnobRing norm={kd.norm} size={28} mode="display" ariaLabel={k.label} />
                <span style={{
                  fontSize: 10.5, lineHeight: 1.12, color: '#c2c9d6',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%',
                }}>{k.label}</span>
                {/* ★★ v3.86（用户 2026-10-27 明确「不显示」）：段位小字整块去掉，
                    工程模式只保留 数值 / 旋钮 / 名称 三行。 */}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 320, display: 'flex', flexDirection: 'column',
      background: '#2a2e37', color: '#E6EAF0',
      fontFamily: '"Barlow-Regular_2", -apple-system, "PingFang SC", sans-serif',
    }}>
      {/* 顶栏 */}
      <div style={{
        height: 46, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8,
        padding: '0 10px', borderBottom: '1px solid #262C36', background: '#2a2f37',
      }}>
        <div onPointerUp={onClose} role="button" aria-label="返回" style={{ width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 19, color: '#C6CCD6', cursor: 'pointer' }}>‹</div>
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
          <span style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: 1.6 }}>ENGINEERING</span>
          <span style={{ fontSize: 10.5, color: '#707A89', letterSpacing: .8 }}>工程模式</span>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <div
            onPointerUp={() => { if (tab !== 'custom') { setExporting(true); setName(tab === 'amp' ? 'My Amp' : 'My Warm OD'); } }}
            role="button" aria-label="导出为自定义模块"
            style={{
              height: 30, padding: '0 11px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 4,
              fontSize: 11, fontWeight: 700, letterSpacing: .3, cursor: tab === 'custom' ? 'default' : 'pointer',
              background: tab === 'custom' ? 'rgba(255,255,255,.04)' : 'rgba(240,111,33,.16)',
              border: `1px solid ${tab === 'custom' ? '#454b55' : 'rgba(240,111,33,.55)'}`,
              color: tab === 'custom' ? '#8B93A2' : '#FFB981',
            }}>⤓ 导出</div>
        </div>
      </div>

      {/* 页签 */}
      <div style={{ flexShrink: 0, display: 'flex', height: 38, background: '#2a2f37', borderBottom: '1px solid #262C36' }}>
        {([['od', '过载'], ['amp', '箱头'], ['custom', '自定义']] as const).map(([k, lb]) => (
          <div key={k} onPointerUp={() => setTab(k)} role="tab" aria-selected={tab === k}
            style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              fontSize: 11, fontWeight: tab === k ? 700 : 500, cursor: 'pointer',
              color: tab === k ? '#F2F4F8' : '#7B8494',
              borderBottom: `2px solid ${tab === k ? (k === 'amp' ? '#E8B860' : k === 'custom' ? '#C0A8FF' : '#F06F21') : 'transparent'}`,
            }}>
            {lb}
            {k === 'custom' && custom.length > 0 && (
              <span style={{ fontSize: 10.5, padding: '1px 4px', borderRadius: 4, background: 'rgba(192,168,255,.16)', color: '#C7B4FF' }}>{custom.length}</span>
            )}
          </div>
        ))}
      </div>

      {/* 内容 */}
      <div
        style={{
        flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch',
        touchAction: 'pan-y', overscrollBehavior: 'contain',
        padding: '8px 9px 14px', display: 'flex', flexDirection: 'column', gap: 4,
      }}>
        {tab === 'od' && (
          <>
            <Card title="PRE EQ" sub="4 BAND" accent={tabAccent}>
              {bandGrid(OD_PRE, 4, '#5BC8F5')}
            </Card>

            <div style={{ display: 'flex', justifyContent: 'center', color: '#39404B', fontSize: 11, lineHeight: 1 }}>▾</div>

            <Card title="电子管模拟电路" accent={tabAccent}>
              <div style={{ display: 'flex', justifyContent: 'space-around', padding: '2px 0 0' }}>
                <MiniKnob value={reg(49)} min={0} max={92} size={44} accent="#F06F21" label="DRIVE" fmt={(v) => String(Math.round(v))} onChange={(v) => onWrite(49, Math.round(v))} />
                {/* ★ 2026-10-19（用户要求）：过载也有 TUBE —— 对应 reg 50（DC Offset，0.01 b/LSB，50 = 0） */}
                <MiniKnob value={reg(50)} min={0} max={100} size={44} accent="#C0A8FF" label="TUBE" fmt={(v) => ((v - 50) * 0.01).toFixed(2)} onChange={(v) => onWrite(50, Math.round(v))} />
                <MiniKnob value={reg(51)} min={248} max={288} size={44} accent="#F06F21" label="LEVEL" fmt={(v) => (v ? ((v - 288) * 0.25).toFixed(1) : '—')} onChange={(v) => onWrite(51, Math.round(v))} />
              </div>
            </Card>

            <div style={{ display: 'flex', justifyContent: 'center', color: '#39404B', fontSize: 11, lineHeight: 1 }}>▾</div>

            <Card title="POST EQ" sub="4 BAND" accent={tabAccent}>
              {bandGrid(OD_POST, 4, '#5BC8F5')}
            </Card>

          </>
        )}

        {tab === 'amp' && (
          <>
            <Card title="INPUT EQ" sub="N1 · 4 BAND" accent={tabAccent}>
              {bandGrid(AMP_N1, 4, '#E8B860')}
            </Card>

            <div style={{ display: 'flex', justifyContent: 'center', color: '#39404B', fontSize: 11, lineHeight: 1 }}>▾</div>

            <Card title="电子管模拟电路" sub="STAGE 1" accent={tabAccent}>
              <div style={{ display: 'flex', justifyContent: 'space-around' }}>
                <MiniKnob value={reg(64)} min={0} max={Math.round(ampLimit * 2)} size={40} accent="#E8B860" label="GAIN" fmt={(v) => (v * 0.5).toFixed(1)} onChange={(v) => onWrite(64, Math.round(v))} />
                <MiniKnob value={reg(65)} min={0} max={100} size={40} accent="#C0A8FF" label="TUBE" fmt={(v) => ((v - 50) * 0.01).toFixed(2)} onChange={(v) => onWrite(65, Math.round(v))} />
                <MiniKnob value={reg(66)} min={VOL_MIN_REG} max={VOL_MAX_REG} size={40} accent="#E8B860" label="VOL" fmt={(v) => (v ? ((v - 288) * 0.25).toFixed(2) : '—')} onChange={(v) => onWrite(66, Math.round(v))} />
              </div>
            </Card>

            <div style={{ display: 'flex', justifyContent: 'center', color: '#39404B', fontSize: 11, lineHeight: 1 }}>▾</div>

            <Card title="MID EQ" sub="N4 音色旋钮 · N5 可调" accent={tabAccent}>
              {/* ★★ v3.86：按首页箱头顺序渲染，四枚只读旋钮 + 名称；下方类型块与 FREQ / Q 全部保留可调 */}
              {bandGrid(N4_DISPLAY, 4, '#E8B860', {
                gainLocked: true,
                toneNameOf: (a) => N4_META[a]?.name,
                defHzOf: (a) => N4_META[a]?.hz,
              })}
              <div style={{ height: 5 }} />
              {bandGrid(AMP_N5, 4, '#E8B860')}
            </Card>

            <div style={{ display: 'flex', justifyContent: 'center', color: '#39404B', fontSize: 11, lineHeight: 1 }}>▾</div>

            <Card title="电子管模拟电路" sub="STAGE 2" accent={tabAccent}>
              {/* ★★ v3.85（用户要求「箱头里面的总音量旋钮去掉」）：
                  原最右侧 MASTER(239) 与竖分隔线整块删除 —— 工程模式不再出现箱头总音量。
                  （首页箱头卡仍保留同一寄存器，标签已统一为 中文「总音量」/ 英文「MAS」。） */}
              <div style={{ display: 'flex', justifyContent: 'space-around' }}>
                <MiniKnob value={reg(79)} min={0} max={Math.round(ampLimit * 2)} size={40} accent="#E8B860" label="DRIVE" fmt={(v) => (v * 0.5).toFixed(1)} onChange={(v) => onWrite(79, Math.round(v))} />
                <MiniKnob value={reg(80)} min={0} max={100} size={40} accent="#C0A8FF" label="TUBE" fmt={(v) => ((v - 50) * 0.01).toFixed(2)} onChange={(v) => onWrite(80, Math.round(v))} />
                <MiniKnob value={reg(81)} min={VOL_MIN_REG} max={VOL_MAX_REG} size={40} accent="#E8B860" label="VOL" fmt={(v) => (v ? ((v - 288) * 0.25).toFixed(2) : '—')} onChange={(v) => onWrite(81, Math.round(v))} />
              </div>
            </Card>

            <div style={{ display: 'flex', justifyContent: 'center', color: '#39404B', fontSize: 11, lineHeight: 1 }}>▾</div>

            <Card title="OUTPUT EQ" sub="N8 · 16 BAND · 2 × 8" accent={tabAccent}>
              {/* ★ v3.79（用户 2026-10-26）：取消左右分页 —— 一行 8 段、共两行，全部一屏可见。
                  列宽因此只有 ~40px，FREQ / Q 两个旋钮在段内竖排（compact）。 */}
              {bandGrid(AMP_N8.slice(0, 8), 8, '#E8B860', { compact: true })}
              <div style={{ height: 6 }} />
              {bandGrid(AMP_N8.slice(8), 8, '#E8B860', { compact: true })}
            </Card>

          </>
        )}

        {tab === 'custom' && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 3px 4px' }}>
              <span style={{ width: 5, height: 5, borderRadius: 2, background: '#C0A8FF', boxShadow: '0 0 6px rgba(192,168,255,.7)' }} />
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: .8 }}>自定义组 · CUSTOM</span>
              <span style={{ marginLeft: 'auto', fontSize: 10.5, color: '#8B93A2' }}>上限 {CUSTOM_LIMIT} / 类</span>
            </div>

            {/* ★ v3.79（用户 2026-10-26）：自定义内部按「过载 / 箱头」分组，不再两条长列表堆在一起 */}
            <div style={{ display: 'flex', gap: 6, padding: '0 2px 5px' }}>
              {([
                ['od', '过载 OVERDRIVE', odList.length, '#F06F21'],
                ['amp', '箱头 AMP', ampList.length, '#E8B860'],
              ] as const).map(([k, lb, n, ac]) => (
                <div key={k} onPointerUp={() => setCustomKind(k)} role="tab" aria-selected={customKind === k}
                  style={{
                    flex: 1, height: 30, borderRadius: 9, display: 'flex', alignItems: 'center',
                    justifyContent: 'center', gap: 5, cursor: 'pointer',
                    fontSize: 10.5, fontWeight: customKind === k ? 700 : 500, letterSpacing: .4,
                    color: customKind === k ? '#242a33' : '#8A93A1',
                    background: customKind === k ? ac : 'rgba(255,255,255,.035)',
                    border: `1px solid ${customKind === k ? ac : '#2A3140'}`,
                  }}>
                  {lb}
                  <span style={{
                    fontSize: 10.5, padding: '1px 4px', borderRadius: 4,
                    background: customKind === k ? 'rgba(0,0,0,.22)' : 'rgba(255,255,255,.06)',
                  }}>{n}</span>
                </div>
              ))}
            </div>

            {/* ★★ v3.85（用户「工程模式里面不做文字介绍」）：整段说明删除 */}
            {(customKind === 'od' ? odList : ampList).length === 0 ? (
              <div style={{
                margin: '14px 3px', padding: '22px 14px', borderRadius: 12, textAlign: 'center',
                border: '1px dashed rgba(255,255,255,.12)', fontSize: 10.5, color: '#c2c9d6', lineHeight: 1.8,
              }}>
                还没有自定义{customKind === 'od' ? '过载' : '箱头'}<br />
                去「{customKind === 'od' ? '过载' : '箱头'}」页调好音色，点右上角「⤓ 导出」
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {(customKind === 'od' ? odList : ampList).map(customCard)}
              </div>
            )}
          </>
        )}
      </div>

      {/* 提示条
          ★ v3.85：去掉 nowrap —— 「自定义箱头已满 5 个，请先删除一个」这类长句
          原来会被压成一条超出屏幕宽度的细条（用户反馈「文字超出外框」）。 */}
      {/* ★★ v3.90（用户 2026-10-27「EQ 图形显示框不好用」）：浮动均衡器曲线窗整块删除，
          连同频响计算、位置存档、避让测量一起移除 —— 工程模式不再有浮窗。 */}

      {msg && (
        <div style={{
          position: 'absolute', left: '50%', bottom: 22, transform: 'translateX(-50%)',
          maxWidth: '88vw', padding: '8px 15px', borderRadius: 12, background: 'rgba(20,24,30,.97)',
          border: `1px solid ${tabAccent}66`, fontSize: 12, lineHeight: 1.45, color: '#D7DCE4',
          textAlign: 'center', whiteSpace: 'normal', wordBreak: 'break-word',
          boxShadow: '0 8px 24px rgba(0,0,0,.5)',
        }}>{msg}</div>
      )}

      {/* 导出弹窗 */}
      {exporting && (
        <div onPointerUp={(e) => { if (e.target === e.currentTarget) setExporting(false); }}
          style={{ position: 'absolute', inset: 0, zIndex: 20, background: 'rgba(4,5,7,.72)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{
            width: '100%', borderRadius: 16, padding: '15px 15px 13px',
            background: 'linear-gradient(180deg,#2a2e37,#2a2f37)', border: '1px solid #3E4653',
            boxShadow: '0 30px 80px rgba(0,0,0,.7)',
          }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 3 }}>导出为自定义模块</div>
            <div style={{ fontSize: 10.5, color: '#c2c9d6', marginBottom: 13 }}>
              固化为单块模块
            </div>

            <div style={{ fontSize: 10.5, letterSpacing: 1, color: '#c2c9d6', marginBottom: 5 }}>模块名称</div>
            <input
              value={name} onChange={(e) => setName(e.target.value)}
              style={{
                width: '100%', height: 36, borderRadius: 10, background: '#252a32',
                border: '1px solid #454b55', color: '#E6EAF0', fontSize: 12,
                padding: '0 11px', boxSizing: 'border-box', outline: 'none',
              }}
            />

            <div style={{ fontSize: 10.5, letterSpacing: 1, color: '#c2c9d6', margin: '11px 0 5px' }}>生成类型</div>
            <div style={{ display: 'flex', gap: 7 }}>
              <div style={{
                flex: 1, height: 32, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 700,
                background: tab === 'od' ? 'rgba(240,111,33,.16)' : 'rgba(255,255,255,.04)',
                border: `1px solid ${tab === 'od' ? 'rgba(240,111,33,.55)' : '#454b55'}`,
                color: tab === 'od' ? '#FFB981' : '#c2c9d6',
              }}>过载模块</div>
              <div style={{
                flex: 1, height: 32, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 700,
                background: tab === 'amp' ? 'rgba(232,184,96,.16)' : 'rgba(255,255,255,.04)',
                border: `1px solid ${tab === 'amp' ? 'rgba(232,184,96,.55)' : '#454b55'}`,
                color: tab === 'amp' ? '#F0CE8A' : '#c2c9d6',
              }}>箱头模块</div>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 13 }}>
              <div onPointerUp={() => setExporting(false)} role="button"
                style={{ flex: 1, height: 36, borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,.05)', border: '1px solid #454b55', fontSize: 11, color: '#9AA4B2' }}>取消</div>
              <div onPointerUp={doExport} role="button"
                style={{ flex: 1, height: 36, borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(240,111,33,.18)', border: '1px solid rgba(240,111,33,.55)', fontSize: 11, fontWeight: 700, color: '#FFB981' }}>导出</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
