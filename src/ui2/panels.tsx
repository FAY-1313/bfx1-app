/**
 * BFX1 新 UI · 8 个模块面板（v4 · v8 数据驱动）
 *
 * ★ v8 关键改动（2026-10-06 用户定稿）：
 *   1. 箱头【单模式】，彻底去掉模式切换 UI
 *   2. GAIN = reg 64（原 PGA 已移出 → 恢复独立 BOOST 模块）
 *   3. DRIVE = reg 79 ｜ VOL1 = reg 66 ｜ VOL2 = reg 81 ｜ MASTER = reg 239
 *   4. 音调栈从 N1（59–62）移到 N8（83–98），且【每型号旋钮数不同 1~5 个】
 *   5. 过载旋钮由 odDef.knobs[] 驱动，支持 reg / db / hz 三种单位
 */
import Knob, { type KnobSize, PeqGainKnob, PeqFreqKnob } from './Knob';
import PedalShell, { type PedalTheme } from './PedalShell';
import PedalPhoto, { photoSkinFor } from './PedalPhoto';
import { SPECS, ampGainSpec, ampDriveSpec } from './registers';
import { ampBaseKnobs, n8Short, ampKnobCount } from './ampKnobMap';
import { PEQ_FREQ_TABLE } from '../data/parameterMap';
import {
  AMP_MODELS,
  OD_MODELS,
  COMP_MODELS, COMP_KNOB_REG,
} from '../data/_def';

/** values: 寄存器 → 值（数据驱动）；onParam: 单旋钮改动 */
export interface PanelProps {
  values: Record<number, number>;
  onParam: (reg: number | 'PGA', value: number) => void;
  onToggle: () => void;
  on: boolean;
  modelIdx: number;
  /** ★ v5：拖动预览（HUD 用，不走 BLE） */
  onPreview?: (v: number) => void;
}

const pick = (v: Record<number, number>, reg: number, spec: string) =>
  v[reg] ?? SPECS[spec].def;

export const THEMES: Record<string, PedalTheme> = {
  'noise-gate': { c1: '#2f4a38', c2: '#28382d', ac: '#50d080' },
  compressor:   { c1: '#2b3a52', c2: '#232e3e', ac: '#6098d8' },
  boost:        { c1: '#4a3a22', c2: '#403320', ac: '#f0c060' },
  overdrive:    { c1: '#2d4a2c', c2: '#16261a', ac: '#f0a040' },
  'amp-head':   { c1: '#3a3128', c2: '#383029', ac: '#e0a040' },
  cabinet:      { c1: '#3a2818', c2: '#3b2d1c', ac: '#c8a060' },
  chorus:       { c1: '#1f4448', c2: '#213d40', ac: '#40c0c0' },
  delay:        { c1: '#1e3a4e', c2: '#1f3341', ac: '#48b0e0' },
  reverb:       { c1: '#332a4e', c2: '#2c243d', ac: '#8060d0' },
};

/* ══════════ 1 · 噪声门 ══════════ */
export function GatePanel(p: PanelProps) {
  return (
    <PedalShell theme={THEMES['noise-gate']} on={p.on} onFootswitch={p.onToggle}
      note="1 旋钮 + 1 踩钉（reg 0 bypass / 1 threshold）">
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <Knob label="THRESHOLD" spec={SPECS.GATE_THRESHOLD} size="xl"
          value={pick(p.values, 1, 'GATE_THRESHOLD')}
          releaseCommit fineX enlargeable onPreview={p.onPreview}
          onChange={(v) => p.onParam(1, v)} />
      </div>
    </PedalShell>
  );
}

/* ══════════ 2 · 压缩器（★ 按型号真实旋钮个数渲染，不灰显）══════════ */
const COMP_SPEC: Record<string, string> = {
  THRESHOLD: 'COMP_INPUT', ATTACK: 'COMP_ATTACK', RELEASE: 'COMP_RELEASE',
  RATIO: 'COMP_RATIO', KNEE: 'COMP_KNEE', GAIN: 'COMP_GAIN',
};
export function CompPanel(p: PanelProps) {
  const md = COMP_MODELS[p.modelIdx] ?? COMP_MODELS[0];
  // ★ 只渲染 md.knobs 里有的旋钮（LA-2A 2 个 / CS-2 3 个 / 1176 5 个）
  const ks = md.knobs;
  const rows = ks.length <= 3 ? [ks] : ks.length === 4 ? [ks.slice(0, 2), ks.slice(2)] : [ks.slice(0, 3), ks.slice(3)];
  return (
    <PedalShell theme={THEMES.compressor} on={p.on} onFootswitch={p.onToggle}
      note={`${md.name} · ${md.desc} · ${ks.length} 旋钮`}>
      {rows.map((r, ri) => (
        <div key={ri} style={{ display: 'flex', justifyContent: 'center', gap: 12 }}>
          {r.map((k) => {
            const reg = COMP_KNOB_REG[k];
            const sk = COMP_SPEC[k];
            const size: KnobSize = ks.length <= 2 ? 'xl' : ks.length <= 3 ? 'lg' : 'md';
            return <Knob key={k} label={k} spec={SPECS[sk]} size={size}
              value={pick(p.values, reg, sk)}
              releaseCommit fineX enlargeable onPreview={p.onPreview}
              onChange={(v) => p.onParam(reg, v)} />;
          })}
        </div>
      ))}
    </PedalShell>
  );
}

/* ══════════ 3 · 过载（★ 旋钮由 odDef.knobs[] 驱动，3 种单位）══════════ */
/** 过载里属于 32 位 PEQ 字的寄存器（52–56 与 44–47） */
const OD_PEQ_REGS = new Set([44, 45, 46, 47, 53, 54, 55, 56]);

export function OdPanel(p: PanelProps) {
  const md = OD_MODELS[p.modelIdx] ?? OD_MODELS[0];
  // ★ 照片踏板（2026-10-13）：TS-808 用硬件设计照替换 CSS 外壳
  if (photoSkinFor(md)) return <PedalPhoto {...p} />;
  const ks = md.knobs;
  const rows = ks.length <= 3 ? [ks] : ks.length === 4 ? [ks.slice(0, 2), ks.slice(2)]
             : [ks.slice(0, 3), ks.slice(3)];
  const size: KnobSize = ks.length <= 3 ? 'lg' : 'md';

  return (
    <PedalShell theme={THEMES.overdrive} on={p.on} onFootswitch={p.onToggle}
      note={`${md.name} · ${md.group} · ${ks.length} 旋钮 · ${md.circuit.slice(0, 20)}`}>
      {rows.map((r, ri) => (
        <div key={ri} style={{ display: 'flex', justifyContent: 'center', gap: 12 }}>
          {r.map((k) => {
            // ① PEQ 频点（RAT 的 FILTER，478…934.7 Hz）
            if (k.unit === 'hz' && OD_PEQ_REGS.has(k.addr)) {
              const lo = Math.max(0, PEQ_FREQ_TABLE.findIndex((f) => f >= k.lo));
              let hi = PEQ_FREQ_TABLE.findIndex((f) => f > k.hi);
              hi = hi < 0 ? PEQ_FREQ_TABLE.length - 1 : Math.max(lo, hi - 1);
              return <PeqFreqKnob key={k.name} label={k.name} size={size}
                word={pick(p.values, k.addr, 'OD_DRIVE')}
                loIdx={lo} hiIdx={hi} freqTable={PEQ_FREQ_TABLE}
                releaseCommit fineX enlargeable onPreview={p.onPreview}
                onWord={(w) => p.onParam(k.addr, w)} />;
            }
            // ② PEQ 增益（TONE / BASS / TREBLE，范围按型号文档）
            if (k.unit === 'db' && OD_PEQ_REGS.has(k.addr)) {
              return <PeqGainKnob key={k.name} label={k.name} size={size}
                word={pick(p.values, k.addr, 'OD_DRIVE')}
                releaseCommit fineX enlargeable onPreview={p.onPreview}
                onWord={(w) => p.onParam(k.addr, w)} />;
            }
            // ③ 普通寄存器（DRIVE 49 / LEVEL 51 / GAIN 49 / VOLUME 51 …）
            const spec = { ...SPECS[k.addr === 49 ? 'OD_DRIVE' : 'OD_LEVEL'],
                           min: k.lo, max: k.hi, step: k.step,
                           def: Math.round((k.lo + k.hi) / 2) };
            return <Knob key={k.name} label={k.name} size={size} spec={spec}
              value={pick(p.values, k.addr, k.addr === 49 ? 'OD_DRIVE' : 'OD_LEVEL')}
              releaseCommit fineX enlargeable onPreview={p.onPreview}
              onChange={(v) => p.onParam(k.addr, v)} />;
          })}
        </div>
      ))}
    </PedalShell>
  );
}

/* ══════════ 4 ⭐ BOOST（PGA · v8 从箱头移出后恢复）══════════ */
export function BoostPanel(p: PanelProps) {
  return (
    <PedalShell theme={THEMES.boost} on={p.on} onFootswitch={p.onToggle}
      note="PGA 输入增益 · 0–10 档 · 3 dB/档 = 0…+30 dB · 无寄存器（走 I2C）">
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <Knob label="BOOST" spec={SPECS.BOOST_LEVEL} size="xl"
          value={p.values[-1] ?? SPECS.BOOST_LEVEL.def}
          releaseCommit fineX enlargeable onPreview={p.onPreview}
          onChange={(v) => p.onParam('PGA', v)} />
      </div>
      <div style={{ fontSize: 11, color: '#79818f', textAlign: 'center', lineHeight: 1.6 }}>
        ★ v8 已把 PGA 从箱头移出 —— 本模块接管它<br />
        0 = 直通（0 dB）· 10 = +30 dB
      </div>
    </PedalShell>
  );
}

/* ══════════ 5 · 箱头 v8（M2 · 真实旋钮单排 · 2026-10-14）══════════
 * 旋钮显隐按 ampKnobMap（realKnobs 映射）：DC1/DC2 不显示（静默下发），
 * GAIN/DRIVE/VOL1/VOL2/MASTER 按真机面板有无决定，N8 音调段 1–5 个。
 * 全部旋钮单排等距，主界面直接拖动，松手一次性提交。 */
export function AmpPanel(p: PanelProps) {
  const md = AMP_MODELS[p.modelIdx] ?? AMP_MODELS[0];
  /** 型号数据优先，其次父组件当前值，最后规格默认 */
  const v = (reg: number, spec: string) =>
    p.values[reg] ?? md.regs[reg] ?? SPECS[spec].def;

  const gainSpec = ampGainSpec(md.limit);
  const driveSpec = ampDriveSpec(md.limit);
  const specOf = (key: string) =>
    key === 'GAIN' ? gainSpec : key === 'DRIVE' ? driveSpec
    : key === 'VOL1' ? SPECS.AMP_VOL1 : key === 'VOL2' ? SPECS.AMP_VOL2
    : SPECS.AMP_MASTER;

  const base = ampBaseKnobs(md);
  const n8 = md.knobs;
  const total = base.length + n8.length;
  const dia = `clamp(22px, calc(64vw / ${Math.max(1, total)}), 44px)`;

  return (
    <PedalShell theme={THEMES['amp-head']} on={p.on} onFootswitch={p.onToggle}
      note={`${md.name} · ${md.cls}（上限 ${md.limit} dB）· 真实旋钮 ${total} 个（DC 偏置静默下发）`}>

      {/* 单排：基座旋钮（按真机显隐）+ N8 音调段 */}
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-start', gap: 8, flexWrap: 'nowrap' }}>
        {base.map((b) => (
          <div key={b.key} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
            <Knob label={b.short} spec={specOf(b.key)} chrome={false} d={dia}
              releaseCommit fineX
              value={v(b.reg, b.key === 'MASTER' ? 'AMP_MASTER' : b.key === 'VOL1' ? 'AMP_VOL1' : b.key === 'VOL2' ? 'AMP_VOL2' : 'OD_DRIVE')}
              onChange={(x) => p.onParam(b.reg, x)}
              onPreview={p.onPreview} />
            <div style={{ fontSize: 10.5, color: '#8b93a2' }}>{b.short}</div>
          </div>
        ))}
        {n8.map((k) => (
          <div key={k.addr} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
            <PeqGainKnob label={n8Short(k.name)} chrome={false} d={dia}
              releaseCommit fineX
              word={v(k.addr, 'AMP_DC1')}
              onWord={(w) => p.onParam(k.addr, w)}
              onPreview={p.onPreview} />
            <div style={{ fontSize: 10.5, color: '#8b93a2' }}>{n8Short(k.name)}</div>
          </div>
        ))}
      </div>

      {/* DC 偏置说明（不再显示旋钮） */}
      <div style={{ fontSize: 10.5, color: '#79818f', textAlign: 'center', lineHeight: 1.5 }}>
        DC1(65) / DC2(80) 削波偏置按型号默认值静默下发，真机面板无此旋钮
      </div>
    </PedalShell>
  );
}

/* ══════════ 5 · 箱体（0 连续参数）══════════ */
export function CabPanel(p: PanelProps & {
  cabName?: string; micName?: string; makeup?: number; onPick?: () => void;
}) {
  return (
    <PedalShell theme={THEMES.cabinet} on={p.on} onFootswitch={p.onToggle}
      note="无连续参数 · 切换 = 下发 35 段 PEQ（reg 108–142）+ 后级补偿">
      <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
        <span style={{ color: '#8b93a2' }}>箱体型号</span>
        <span style={{ color: '#5bc8f5', fontWeight: 600, maxWidth: 180,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.cabName ?? '—'}</span>
      </div>
      <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
        <span style={{ color: '#8b93a2' }}>话筒 / 位置</span>
        <span style={{ color: '#5bc8f5', fontWeight: 600, maxWidth: 180,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.micName ?? '—'}</span>
      </div>
      <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
        <span style={{ color: '#8b93a2' }}>后级补偿</span>
        <span style={{ color: '#6ede8a', fontWeight: 600 }}>
          {p.makeup == null ? '—' : `${p.makeup >= 0 ? '+' : ''}${p.makeup.toFixed(2)} dB`}</span>
      </div>
      <button onClick={p.onPick} style={{
        width: '100%', padding: '10px 0', fontSize: 12, cursor: 'pointer',
        borderRadius: 8, background: 'rgba(232,184,96,.11)',
        border: '1px solid #e8b860', color: '#e8b860', fontWeight: 650,
      }}>选 箱 体</button>
    </PedalShell>
  );
}

/* ══════════ 6/7/8 · 合唱 / 延迟 / 混响 ══════════
 *  ★ 三者无型号切换；全部寄存器都在 UI 旋钮上，预设只负责填值。 */
const FX_CFG = {
  chorus: {
    label: '合唱', knobs: [
      ['VOLUME', 216, 'CH_LEVEL'], ['RATE 1', 217, 'CH_RATE1'], ['RATE 2', 218, 'CH_RATE2'],
      ['DEPTH 1', 219, 'CH_DEPTH1'], ['DEPTH 2', 220, 'CH_DEPTH2'],
    ] as [string, number, string][],
    rows: [[0, 1, 2], [3, 4]] as number[][],
  },
  delay: {
    label: '延迟', knobs: [
      ['TIME', 223, 'DLY_TIME'], ['REPEAT', 222, 'DLY_REPEAT'],
    ] as [string, number, string][],
    rows: [[0, 1]] as number[][],
  },
  reverb: {
    label: '混响', knobs: [
      ['PRE-DLY', 225, 'RV_PREDELAY'], ['TIME', 226, 'RV_TIME'], ['HPF', 227, 'RV_HPF'],
      ['LPF', 228, 'RV_LPF'], ['MIX', 229, 'RV_MIX'],
    ] as [string, number, string][],
    rows: [[0, 1, 2], [3, 4]] as number[][],
  },
};

export function FxPanel({ id, values, onValue, ...p }: PanelProps & {
  id: 'chorus' | 'delay' | 'reverb';
  onValue: (reg: number, v: number) => void;
}) {
  const c = FX_CFG[id];
  const isDelay = id === 'delay';
  return (
    <PedalShell theme={THEMES[id]} on={p.on} onFootswitch={p.onToggle}
      note={`${c.label} · 预设只填值，无型号切换`}>
      {c.rows.map((r, ri) => (
        <div key={ri} style={{ display: 'flex', justifyContent: 'center', gap: 12 }}>
          {r.map((i) => {
            const [lb, reg, sk] = c.knobs[i];
            return <Knob key={reg} label={lb} spec={SPECS[sk]} size={isDelay ? 'xl' : 'sm'}
              value={values[reg] ?? SPECS[sk].def}
              releaseCommit fineX enlargeable onPreview={p.onPreview}
              onChange={(v) => onValue(reg, v)} />;
          })}
        </div>
      ))}
    </PedalShell>
  );
}

/* ══════════ 型号/预设清单（供弹窗用）══════════ */
export const MODEL_ITEMS = {
  compressor: COMP_MODELS.map((m) => ({
    name: m.sn ?? m.name, desc: m.desc, knobCount: m.knobs.length,
  })),
  overdrive: OD_MODELS.map((m) => ({
    name: m.sn ?? m.name, desc: `${m.group} · ${m.circuit.slice(0, 20)}`, knobCount: m.knobs.length,
  })),
  'amp-head': AMP_MODELS.map((m) => ({
    name: m.sn ?? m.name,
    desc: `${m.cls}（≤${m.limit} dB）· ${m.family.slice(0, 18)}`,
    knobCount: ampKnobCount(m),   // ★ M2：真实旋钮数（基座按 realKnobs 显隐 + N8）
    tag: `${m.knobs.length} 音调`,
  })),
};
export { FX_CFG };
