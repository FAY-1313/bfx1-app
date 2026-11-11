/**
 * BFX1 新 UI · 模块旋钮描述符（v5.1 · 2026-10-14）
 *
 * 为「原地放大」交互提供统一的旋钮抽象：每个旋钮 = { 归一值, 显示格式, 回写函数 }。
 * 覆盖：噪音门 / BOOST(PGA) / 压缩器 / 过载（reg·db·hz 三单位，PEQ 位域）
 *       / 合唱·延迟·混响 / 箱头（realKnobs 映射 + N8 音调段）/ 总音量。
 *
 * 旋钮交互统一走 KnobRing：拖动预览 → 松手 onCommit → 此处 setNorm 转寄存器值 → onParam。
 */
import { SPECS, ampGainSpec, ampDriveSpec } from './registers';
import { COMP_MODELS, COMP_KNOB_REG, OD_MODELS, AMP_MODELS } from '../data/_def';
import { FX_CFG } from './panels';
import { ampBaseKnobs, type AmpBaseKnob } from './ampKnobMap';
import { peqGainDb, peqSetGainIdx, dbToPeqGainIdx, peqFreqIdx, peqSetFreqIdx } from './Knob';
import { PEQ_FREQ_TABLE } from '../data/parameterMap';
import { shortLabel } from './knobLabels';

export interface KnobDesc {
  key: string;
  /** 缩写（≤5 字符，单排标签） */
  short: string;
  /** 全称（HUD / 浮动面板） */
  full: string;
  /** ★ 2026-10-17：英文短标签（≤5 字符）—— 英文界面用，中文界面仍用 short */
  shortEn?: string;
  /** 归一 0..1 */
  norm: number;
  /** 当前显示文本 */
  fmt: string;
  /** 任意归一值 → 显示文本（拖动气泡实时用） */
  fmtAt: (n: number) => string;
  /** 归一值 → 寄存器写入（松手提交时调用） */
  setNorm: (n: number) => void;
  /** 指定行号（箱头专用：0 = 驱动/音量/总音量，1 = N8 音调段）；未设则由 knobRows 自动分行 */
  row?: number;
  /**
   * ★ 2026-10-17（用户反馈「字符消失后旋钮跳动 / 放大调的数值缩小后变了」）：
   *   归一化吸附步长 = 寄存器步进 ÷ 量程。KnobRing 拖动时按这个网格取整，
   *   于是「拖动中的位置」与「松手后回读的位置」完全重合，不再跳；
   *   同时 fmtAt 显示的就是真正会落盘的那一档，显示值与实际值一致。
   */
  snapNorm?: number;
  /**
   * ★★ 2026-10-26：0 dB（或 0 值）在归一量程上的位置 —— 供旋钮「双击复位」用。
   *   只有 dB 类旋钮（对称 ±9 / 单向 0…+12 / CUT −12…0）才有意义；
   *   未设 = 该旋钮没有自然零点，双击不生效。
   */
  zeroNorm?: number;
  /**
   * ★★ 2026-10-26（用户要求「自定义箱头的四个音色旋钮要标注对应频段位置，
   *   要对应每一段，方便用户设计」）：该音色旋钮落在箱头 PEQ 的第几段（1–4）。
   *
   *   ⚠ 段位顺序与显示顺序**不一致**，这正是要标注出来的原因：
   *     显示顺序（TONE_RANK）= 低频 → 中频 → 高频 → 临场
   *     实际段位              = 第2段 → 第3段 → 第1段 → 第4段
   *   （TREBLE 走 seg 1 HighShelf、BASS 走 seg 2 LowShelf、MID 走 seg 3 Peak、
   *     PRESENCE 走 seg 4 Peak —— 见 customModules.customAmpModels / 内置 ampHeadDef）
   *
   *   只在 N8 音色旋钮（row === 1）上有值；基础旋钮（GAIN/DRIVE/VOL/MASTER）为空。
   */
  seg?: number;
}

/** 过载 PEQ 寄存器集合（与 panels.tsx 一致） */
const OD_PEQ_REGS = new Set([44, 45, 46, 47, 53, 54, 55, 56]);

/**
 * 旋钮分行（参考实物排列，不做成一排以保尺寸）
 *   ≤3 单排 · 4 = 2×2 · 5–6 = 3+N · 7+ = 4+N
 * 与 panels.tsx FX_CFG.rows（合唱/混响 5 → [[0,1,2],[3,4]]）一致。
 */
export function knobRows(ds: KnobDesc[]): KnobDesc[][] {
  /* ★ 2026-10-15：若有旋钮显式指定 row（箱头：基座行 / N8 音调行）→ 按 row 分组 */
  if (ds.some((d) => d.row !== undefined)) {
    const rows: KnobDesc[][] = [];
    for (const d of ds) {
      const r = d.row ?? 0;
      if (!rows[r]) rows[r] = [];
      rows[r].push(d);
    }
    return rows.filter((r) => r.length > 0);
  }
  const n = ds.length;
  if (n <= 3) return [ds];
  if (n === 4) return [ds.slice(0, 2), ds.slice(2)];
  const head = n <= 6 ? 3 : 4;
  return [ds.slice(0, head), ds.slice(head)];
}
const COMP_SPEC: Record<string, string> = {
  THRESHOLD: 'COMP_INPUT', ATTACK: 'COMP_ATTACK', RELEASE: 'COMP_RELEASE',
  RATIO: 'COMP_RATIO', KNEE: 'COMP_KNEE', GAIN: 'COMP_GAIN',
};

/**
 * ★ 2026-10-16（C6）：N8 音调段量程 —— ★ 2026-10-24（用户拍板）**统一 ±9 dB**。
 *   「0 dB 偏移、居中不对」的根因就在这张表：显示路径用 `norm=(db-lo)/(hi-lo)` 线性铺满，
 *   旧表不对称（BASS/TREBLE −12…+9 / MID/PRESENCE/RESONANCE −12…+6）→
 *   居中(norm 0.5) 落在 −1.5 / −3.0 dB，旋钮 12 点根本不是 0 dB。
 *   改为对称 ±9 后 norm 0.5 ⇔ 0 dB ⇔ 12 点。
 *   CUT 保留 −12…0（只能挖）· BRIGHT/BOOST/ULTRA HI/DEEP 单向开关 0…+12。
 *   ★★ 与 data/ampKnobResolve.ts 的 TONE_SWEEP_DB **必须逐字一致**。
 */
const N8_RANGE: Record<string, [number, number]> = {
  BASS: [-9, 9],
  MID: [-9, 9],
  TREBLE: [-9, 9],
  PRESENCE: [-9, 9],
  RESONANCE: [-9, 9],
  /* ★ 带斜杠的合成名：ampKnobResolve 取斜杠前段（= TREBLE），这里必须同口径，
     否则 AC30tb 这类「TREBLE/CUT」@83 会被当成 CUT 套上 −12…0。 */
  'TREBLE/CUT': [-9, 9],
  CUT: [-12, 0],
  /* ★ 2026-10-20：v19 新箱头的第 4 旋钮（单向开关） */
  BRIGHT: [0, 12],       // JC-120 v19 / Acoustic 360 v19：只能开
  BOOST: [0, 12],        // Peavey Classic 30 v19：只能加
  'ULTRA HI': [0, 12],   // Ampeg SVT v19：只抬顶部
  DEEP: [0, 12],         // Gibson Lab L4 v19：只加低频
};

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/* ══════════ ① 动态区 ══════════ */

export function gateKnobs(values: Record<number, number>, onParam: (r: number | 'PGA', v: number) => void): KnobDesc[] {
  const s = SPECS.GATE_THRESHOLD;
  const snap = s.snap ?? 1;
  /* ★ v73（用户要求）：把归一化位置换算成【吸附档位】—— 噪声门 0…100 / snap 10 = 11 档。
   *   fmtAt 与 setNorm 共用同一函数，读数与真正落盘的寄存器值一定一致。 */
  const at = (n: number) => Math.round((s.min + n * (s.max - s.min)) / snap) * snap;
  const v = values[1] ?? s.def;
  return [{
    key: 'thr', short: shortLabel('THRESHOLD'), shortEn: shortLabel('THRESHOLD', 'en'), full: 'THRESHOLD',
    norm: clamp01((v - s.min) / (s.max - s.min)), fmt: s.fmt(v), fmtAt: (n) => s.fmt(at(n)),
    setNorm: (n) => onParam(1, at(n)),
    snapNorm: snap / Math.max(1, s.max - s.min),
  }];
}

export function boostKnobs(values: Record<number, number>, onParam: (r: number | 'PGA', v: number) => void): KnobDesc[] {
  const s = SPECS.BOOST_LEVEL;
  const v = values[-1] ?? s.def;
  const at = (n: number) => s.fmt(Math.round(s.min + n * (s.max - s.min)));
  return [{
    key: 'bst', short: shortLabel('BOOST'), shortEn: shortLabel('BOOST', 'en'), full: 'BOOST',
    norm: clamp01((v - s.min) / (s.max - s.min)), fmt: s.fmt(v), fmtAt: at,
    setNorm: (n) => onParam('PGA', Math.round(s.min + n * (s.max - s.min))),
    snapNorm: 1 / Math.max(1, s.max - s.min),
  }];
}

export function compKnobs(modelIdx: number, values: Record<number, number>, onParam: (r: number | 'PGA', v: number) => void): KnobDesc[] {
  const md = COMP_MODELS[modelIdx] ?? COMP_MODELS[0];
  return md.knobs.map((k) => {
    const reg = COMP_KNOB_REG[k];
    const s = SPECS[COMP_SPEC[k]] ?? SPECS.COMP_INPUT;
    const v = values[reg] ?? s.def;
    const at = (n: number) => s.fmt(Math.round(s.min + n * (s.max - s.min)));
    return {
      key: `c${reg}`, short: shortLabel(k), shortEn: shortLabel(k, 'en'), full: k,
      norm: clamp01((v - s.min) / (s.max - s.min)), fmt: s.fmt(v), fmtAt: at,
      setNorm: (n: number) => onParam(reg, Math.round(s.min + n * (s.max - s.min))),
      snapNorm: 1 / Math.max(1, s.max - s.min),
    };
  });
}

export function odKnobs(
  modelIdx: number, values: Record<number, number>, onParam: (r: number | 'PGA', v: number) => void,
  /** ★ 2026-10-19：首页会追加「自定义」型号，调试面板仍用内置表 */
  models: typeof OD_MODELS = OD_MODELS,
): KnobDesc[] {
  const md = models[modelIdx] ?? models[0];
  return md.knobs.map((k) => {
    const word = values[k.addr] ?? 0;
    /* ① PEQ 频点（RAT FILTER 等） */
    if (k.unit === 'hz' && OD_PEQ_REGS.has(k.addr)) {
      const lo = Math.max(0, PEQ_FREQ_TABLE.findIndex((f) => f >= k.lo));
      let hi = PEQ_FREQ_TABLE.findIndex((f) => f > k.hi);
      hi = hi < 0 ? PEQ_FREQ_TABLE.length - 1 : Math.max(lo, hi - 1);
      const idx = Math.max(lo, Math.min(hi, peqFreqIdx(word)));
      const hz = PEQ_FREQ_TABLE[idx] ?? 0;
      const fmtHz = (i: number) => {
        const h = PEQ_FREQ_TABLE[Math.max(0, Math.min(PEQ_FREQ_TABLE.length - 1, i))] ?? 0;
        return h >= 1000 ? `${(h / 1000).toFixed(2)} kHz` : `${h.toFixed(1)} Hz`;
      };
      return {
        key: `o${k.addr}`, short: shortLabel(k.name), shortEn: shortLabel(k.name, 'en'), full: k.name,
        norm: clamp01((idx - lo) / Math.max(1, hi - lo)), fmt: fmtHz(idx), fmtAt: (n) => fmtHz(Math.round(lo + n * (hi - lo))),
        setNorm: (n: number) => onParam(k.addr, peqSetFreqIdx(word, Math.round(lo + n * (hi - lo)))),
        snapNorm: 1 / Math.max(1, hi - lo),   // 一个频点档
        /* ★ 2026-11-04（用户拍板）：TS/RAT 等 hz 类 TONE 旋钮**支持双击居中**，
           居中档 = 量程中位（norm 0.5），与预设里 odToneCenter 写入的频点完全一致。 */
        zeroNorm: 0.5,
      };
    }
    /* ② PEQ 增益（TONE/BASS/TREBLE）
     * ★ v73 修复：量程改用【型号自己的】k.lo…k.hi。
     *   原先硬编码 −24…+12（PEQ 全量程），既不等于 odDef 声明的型号范围
     *   （如 Timmy BASS −15…0 / KLON TREBLE −6…+6），旋钮拖到底也到不了真实端点。 */
    if (k.unit === 'db' && OD_PEQ_REGS.has(k.addr)) {
      const lo = k.lo, hi = k.hi;
      const db = peqGainDb(word);
      const fmtDb = (d: number) => `${d >= 0 ? '+' : ''}${d.toFixed(1)} dB`;
      /* PEQ 增益 0.2 dB/LSB（k.step）→ 吸附到 0.2 的整数倍，读数与落盘一致 */
      const at = (n: number) => Math.round((lo + n * (hi - lo)) / 0.2) * 0.2;
      return {
        key: `o${k.addr}`, short: shortLabel(k.name), shortEn: shortLabel(k.name, 'en'), full: k.name,
        norm: clamp01((db - lo) / Math.max(0.2, hi - lo)), fmt: fmtDb(db), fmtAt: (n) => fmtDb(at(n)),
        setNorm: (n: number) => onParam(k.addr, peqSetGainIdx(word, dbToPeqGainIdx(at(n)))),
        snapNorm: 0.2 / Math.max(0.2, hi - lo),   // 0.2 dB/LSB
      };
    }
    /* ③ 普通寄存器 */
    const lo = k.lo, hi = k.hi;
    const spec = { ...SPECS[k.addr === 49 ? 'OD_DRIVE' : 'OD_LEVEL'], min: lo, max: hi, step: k.step, def: Math.round((lo + hi) / 2) };
    const at = (n: number) => spec.fmt(Math.round(lo + n * (hi - lo)));
    return {
      key: `o${k.addr}`, short: shortLabel(k.name), shortEn: shortLabel(k.name, 'en'), full: k.name,
      norm: clamp01((word - lo) / Math.max(1, hi - lo)), fmt: spec.fmt(word), fmtAt: at,
      setNorm: (n: number) => onParam(k.addr, Math.round(lo + n * (hi - lo))),
      snapNorm: Math.max(1, k.step || 1) / Math.max(1, hi - lo),
    };
  });
}

/* ══════════ ④ 空间区 ══════════ */

export function fxKnobs(id: 'chorus' | 'delay' | 'reverb', values: Record<number, number>, onParam: (r: number | 'PGA', v: number) => void): KnobDesc[] {
  const c = FX_CFG[id];
  /* ★ 2026-10-20（用户拍板）：合唱 RATE 1/2 · DEPTH 1/2 = **0…10 共 11 档、无单位**。
     寄存器量纲仍是 0…100，靠 SPECS 的 step/snap = 10 吸附，显示由 fmt 除以 10（见 registers.ts）。
     其余旋钮（LEVEL / 延迟 / 混响）保持原样。 */
  return c.knobs.map(([lb, reg, sk]) => {
    const s = SPECS[sk];
    const v = values[reg] ?? s.def;
    /** 有 snap 的规格（噪声门 / 合唱速率深度）按 snap 对齐，避免落盘出现 33 这种中间值 */
    const q = (x: number) => (s.snap && s.snap > 1 ? Math.round(x / s.snap) * s.snap : Math.round(x));
    const at = (n: number) => s.fmt(q(s.min + n * (s.max - s.min)));
    return {
      key: `f${reg}`, short: shortLabel(lb), shortEn: shortLabel(lb, 'en'), full: lb,
      norm: clamp01((v - s.min) / (s.max - s.min)),
      fmt: s.fmt(v),
      fmtAt: at,
      setNorm: (n: number) => onParam(reg, q(s.min + n * (s.max - s.min))),
      snapNorm: Math.max(1, s.step || 1) / Math.max(1, s.max - s.min),
    };
  });
}

/* ══════════ ② 箱头（M2 单排） ══════════ */

/**
 * ★★ 2026-10-26（用户拍板，覆盖 2026-10-21 的「严格按频率」口径）：
 *   所有箱头 UI 的音色旋钮一律按 **低频 → 中频 → 高频 → 第 4 个（临场/其他名称）**
 *   排列，不再按中心频率升序。
 *
 *   为什么改：数据里 PRESENCE(71) 的频点常低于 TREBLE(68)
 *   （例：Twin 的 TREBLE 2520 / PRESENCE 1590，Champ 的 TREBLE 3170 / PRESENCE 1590），
 *   按频率排会得到「低 → 中 → 临场 → 高」，与面板上常见的
 *   BASS / MID / TREBLE / PRESENCE 顺序正好错位，用户对着真机找不到旋钮。
 *
 *   排序键 = (语义档位, 频点)：档位相同才用频率兜底（同族两枚旋钮仍按频率）。
 *   寄存器地址（68–71）与 ampLinkedDefs（按旋钮名查）都不受影响，只改显示顺序。
 */
const TONE_RANK: Record<string, number> = {
  /* ① 低频族 */
  BASS: 0, DEEP: 0,
  /* ② 中频族 */
  MID: 1, MIDDLE: 1,
  /* ③ 高频族 */
  TREBLE: 2, 'TREBLE/CUT': 2, BRIGHT: 2, BRILLIANCE: 2, CUT: 2,
  /* ④ 第 4 个旋钮（临场 / 超高频 / 激励 …）—— 「或其他名称」都归这一档 */
  PRESENCE: 3, RESONANCE: 3, 'ULTRA HI': 3, BOOST: 3,
};

export function ampToneKnobs<T extends { hz: number; name: string }>(md: { knobs: readonly T[] }): T[] {
  const rank = (n: string) => TONE_RANK[(n ?? '').trim().toUpperCase()] ?? 2.5;
  return [...md.knobs].sort((a, b) => {
    const ra = rank(a.name), rb = rank(b.name);
    return ra !== rb ? ra - rb : a.hz - b.hz;
  });
}

export function ampKnobs(
  modelIdx: number, values: Record<number, number>, onParam: (r: number | 'PGA', v: number) => void,
  /** ★ 2026-10-19：同 odKnobs，允许并入自定义箱头 */
  models: typeof AMP_MODELS = AMP_MODELS,
): KnobDesc[] {
  const md = models[modelIdx] ?? models[0];
  const out: KnobDesc[] = [];
  const specOf = (key: string) =>
    key === 'GAIN' ? ampGainSpec(md.limit) : key === 'DRIVE' ? ampDriveSpec(md.limit)
    : key === 'VOL1' ? SPECS.AMP_VOL1 : key === 'VOL2' ? SPECS.AMP_VOL2 : SPECS.AMP_MASTER;
  const pushBase = (b: AmpBaseKnob) => {
    const s = specOf(b.key);
    const v = values[b.reg] ?? md.regs[b.reg] ?? s.def;
    const at = (n: number) => s.fmt(Math.round(s.min + n * (s.max - s.min)));
    out.push({
      key: `a${b.reg}`, short: b.short,
      /* ★ v3.85：MASTER 中文标签已改为「总音量」，英文固定缩写 MAS（不再走 shortLabel） */
      shortEn: b.key === 'MASTER' ? 'MAS' : shortLabel(b.full, 'en'),
      full: b.full, row: 0,
      norm: clamp01((v - s.min) / (s.max - s.min)), fmt: s.fmt(v), fmtAt: at,
      setNorm: (n: number) => onParam(b.reg, Math.round(s.min + n * (s.max - s.min))),
      snapNorm: 1 / Math.max(1, s.max - s.min),
    });
  };
  /* ★ v10 排布规则（用户 2026-10-19）：GAIN → VOL1 →（DRIVE → VOL2）→ 四个音色段 → MASTER 固定最右
     ★★ 2026-10-26（用户反馈「临场应该在右边第四个」）：
        音色段原来按 **hz 升序**，而 PRESENCE 的频点常低于 TREBLE
        → 排出「低 → 中 → 临场 → 高」，与真机面板错位。
        现改为按 **语义档位**（ampToneKnobs 的 TONE_RANK）：
        低频 → 中频 → 高频 → 临场（或超高频/激励等同族名称）。 */
  const base = ampBaseKnobs(md);
  for (const b of base.filter((x) => x.key !== 'MASTER')) pushBase(b);
  for (const k of ampToneKnobs(md)) {
    const word = values[k.addr] ?? md.regs[k.addr] ?? 0;
    const db = peqGainDb(word);
    const [lo, hi] = N8_RANGE[k.name] ?? [-9, 9];
    const fmtDb = (d: number) => `${d >= 0 ? '+' : ''}${d.toFixed(1)} dB`;
    out.push({
      key: `n8-${k.addr}`, short: shortLabel(k.name), shortEn: shortLabel(k.name, 'en'), full: k.name, row: 1,
      /* ★★ 2026-10-26：段位（1–4）透传给 UI —— 自定义箱头的音色旋钮要标出「对应哪一段」。
         内置箱头的数据同样带 seg，UI 层只对自定义箱头显示，避免 20 台内置机型标签过密。 */
      seg: (k as { seg?: number }).seg,
      norm: clamp01((db - lo) / Math.max(1, hi - lo)), fmt: fmtDb(db),
      /* ★ 显示也按 0.2 dB 网格取整 —— 否则「看到的」和「写进去的」差 0.1 dB */
      fmtAt: (n: number) => fmtDb(Math.round((lo + n * (hi - lo)) / 0.2) * 0.2),
      setNorm: (n: number) => onParam(k.addr, peqSetGainIdx(word, dbToPeqGainIdx(lo + n * (hi - lo)))),
      snapNorm: 0.2 / Math.max(1, hi - lo),
      /* 0 dB 在量程上的位置：±9 → 0.5；0…+12 → 0；−12…0 → 1 */
      zeroNorm: clamp01((0 - lo) / Math.max(1, hi - lo)),
    });
  }
  for (const b of base.filter((x) => x.key === 'MASTER')) pushBase(b);
  return out;
}

/* ══════════ 总音量 ══════════ */

/* ★ v73（核定表「总音量」行）：首页 ④ 区「总音量」= reg 261（M1OutVolume），
 *   由 Index 的 outputVol 状态驱动（0…50；0 = −∞，1…50 = −49…0 dB；1 dB/LSB）。
 *   ⚠️ 不再是箱头模块自己的 MASTER（reg 239）—— 那两个是不同寄存器，现并存：
 *      ④ 区 = 整机输出电平，箱头浮窗里的 MASTER = 箱头前级电平。 */

export function masterKnob(outVol: number, onOutVol?: (n: number) => void): KnobDesc {
  const s = SPECS.OUT_VOLUME;
  const reg = Math.max(s.min, Math.min(s.max, Math.round(outVol * s.max)));
  const at = (n: number) => s.fmt(Math.round(s.min + n * (s.max - s.min)));
  return {
    key: 'master', short: shortLabel('MASTER'), shortEn: shortLabel('MASTER', 'en'), full: 'MASTER',
    norm: clamp01((reg - s.min) / (s.max - s.min)), fmt: s.fmt(reg), fmtAt: at,
    setNorm: (n: number) => onOutVol?.(clamp01(n)),
    snapNorm: 1 / Math.max(1, s.max - s.min),
  };
}

/** 按模块 id 取旋钮描述符（放大态 / 浮动面板用） */
export function moduleKnobs(
  modId: string,
  idx: { comp: number; od: number; amp: number },
  values: Record<string, Record<number, number>>,
  onParam: (r: number | 'PGA', v: number) => void,
  /** ★ 2026-10-19：首页合并「自定义过载」后传入（默认内置表） */
  odModels?: typeof OD_MODELS,
): KnobDesc[] {
  const v = values[modId] ?? {};
  switch (modId) {
    case 'noise-gate': return gateKnobs(v, onParam);
    case 'boost': return boostKnobs(v, onParam);
    case 'compressor': return compKnobs(idx.comp, v, onParam);
    case 'overdrive': return odKnobs(idx.od, v, onParam, odModels);
    case 'chorus': return fxKnobs('chorus', v, onParam);
    case 'delay': return fxKnobs('delay', v, onParam);
    case 'reverb': return fxKnobs('reverb', v, onParam);
    default: return [];
  }
}
