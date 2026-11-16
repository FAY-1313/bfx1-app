import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../../i18n';
import { EA_WRITE_MS } from '../../config/writeTiming';
import { orderBypassSplit, switchWindowMs } from '../../data/passThrough';
import { notifyErr, notifyOk } from '../../services/feedback';
import { bleManager } from '../../services/bleService';
import { PRE_BYPASS_FX } from '../../services/switchPacks';
import { beginBusy, endBusy, endBusyAfter, isBusy } from '../../services/switchBusy';
import { setUiSnapshot } from '../../services/uiSnapshot';
import { CHORUS_PRESETS, DELAY_PRESETS, REVERB_PRESETS } from '../../data/_def/fxPresets';
import {
  buildKnobWrites,
  buildSelectRegs,
  decodeRowKnobs,
  defaultRow,
  FAMILY_ROWS,
  findRow,
  primaryAmpOfCab,
  primaryCabOfAmp,
  refreshVariantRows,
  siblingRows,
  type ToneFamily,
  type ToneRow,
} from './toneCatalog';
import PreEqPanel from './PreEqPanel';
import {
  AMP_PRE_ADDRS, OD_PRE_ADDRS, applyPreEqNorm, baseKeyOf, findVariant,
  isVariantKey, pickPreEqWords, upsertVariant, variantIdOf,
} from '../../data/peqVariants';
import { familyTitle, knobValueText, pickerTitle, rowPrimary, t3 } from './toneI18n';
import { FlipHorizontal2Icon } from 'lucide-react';
import FxPresetSheet from './FxPresetSheet';
import ToneKnob from './ToneKnob';
import PickerSheet from './PickerSheet';
import AmpFace from './AmpFace';
import CabSection from './CabSection';
import { FxCard, PedalCard, QuickCard } from './ToneCards';
import './tone3.css';

const HOME_FAMILIES = [
  'compressor', 'overdrive', 'amp-head', 'cabinet', 'chorus', 'delay', 'reverb',
] as const;

type HomeFamily = (typeof HOME_FAMILIES)[number];

const DEFAULT_ON: Record<string, boolean> = {
  'noise-gate': true,
  compressor: true,
  boost: false,
  'amp-head': true,
  cabinet: true,
  chorus: true,
  delay: true,
  reverb: true,
};

const BYPASS_REGS: Partial<Record<HomeFamily, readonly number[]>> = {
  compressor: [7],
  overdrive: [42],
  'amp-head': [57, 72],
  cabinet: [107],
  chorus: [215],
  delay: [221],
  reverb: [224],
};

const TONE_RANGES: Record<HomeFamily, ReadonlyArray<readonly [number, number]>> = {
  compressor: [[4, 13]],
  overdrive: [[42, 56]],
  'amp-head': [[57, 98], [239, 239]],
  cabinet: [[107, 142], [253, 259]],
  chorus: [[215, 220]],
  delay: [[221, 223]],
  reverb: [[224, 229]],
};

const SKIP_SYNC = new Set([43, 48, 52, 58, 63, 67, 73, 78, 82]);

const SESSION_KEY = 'bfx1.tone.v2';
const SNAP_KEY = 'bfx1.tone.snap.v2';
const LINK_KEY = 'bfx1.tone.link.v2';
const CHORUS_UI_PRESETS = CHORUS_PRESETS;
const DELAY_UI_PRESETS = DELAY_PRESETS;
const REVERB_UI_PRESETS = REVERB_PRESETS.slice(0, 3);

interface ParamSnap {
  regs: Record<number, number>;
  values: Record<string, number>;
  at: number;
}

type SnapStore = Record<string, ParamSnap>;

function readSnaps(): SnapStore {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(SNAP_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? parsed as SnapStore : {};
  } catch { return {}; }
}

function snapKey(family: HomeFamily, key: string): string {
  return `${family}:${key}`;
}

function readPairLinked(): boolean {
  /* 默认开启箱头/箱体同步；只有用户明确关闭过（写入 '0'）才保持关闭。 */
  try {
    const v = localStorage.getItem(LINK_KEY);
    return v === null ? true : v === '1';
  } catch { return true; }
}

interface Stored {
  sel?: Partial<Record<HomeFamily, string>>;
  on?: Record<string, boolean>;
  gate?: number;
  boost?: number;
}

interface ToneSync {
  tick: number;
  regs: Record<number, number>;
  modules?: Record<string, boolean>;
  subModels?: Record<string, string>;
  boost?: number;
}

interface Props {
  onParam: (reg: number | 'PGA', value: number, modId?: string, keepBusy?: boolean) => Promise<boolean>;
  onBypass: (modId: string, on: boolean) => void;
  sync?: ToneSync | null;
  muted?: boolean;
  onMuteToggle?: () => void;
  outVol?: number;
  onOutVol?: (norm: number) => void;
  btConnected?: boolean;
  onSubModelsChange?: (sm: Record<string, string>) => void;
  onMuteGuard?: (on: boolean) => Promise<void>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function compactToken(s: string): string {
  return s.toLowerCase().replace(/b&f\s+nam\s+/g, '').replace(/b&f\s+/g, '').replace(/[^a-z0-9]/g, '');
}

function resolveSyncRow(family: HomeFamily, token: string): ToneRow | undefined {
  const direct = findRow(family, token);
  if (direct) return direct;
  const needle = compactToken(token);
  if (!needle) return undefined;
  return FAMILY_ROWS[family].find((row) => (
    compactToken(row.hardware) === needle
    || compactToken(row.title) === needle
    || row.aliases.some((a) => compactToken(a) === needle)
  ));
}

function familyHasAddr(family: HomeFamily, addr: number): boolean {
  return TONE_RANGES[family].some(([lo, hi]) => addr >= lo && addr <= hi);
}

function readStored(): Stored {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Stored;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function regsToStrings(src: Record<number, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [addr, value] of Object.entries(src)) {
    if (typeof value === 'number' && Number.isFinite(value)) out[addr] = value;
  }
  return out;
}

export default function TonePage({
  onParam, onBypass, sync, muted, onMuteToggle, outVol, onOutVol,
  btConnected, onSubModelsChange, onMuteGuard,
}: Props) {
  const { lang } = useI18n();

  const boot = useMemo(() => {
    const stored = readStored();
    const onState: Record<string, boolean> = { ...DEFAULT_ON };
    if (stored.on) {
      for (const key of Object.keys(DEFAULT_ON)) {
        if (typeof stored.on[key] === 'boolean') onState[key] = stored.on[key]!;
      }
    }
    const selState = {} as Record<HomeFamily, string>;
    for (const family of HOME_FAMILIES) {
      const token = stored.sel?.[family];
      selState[family] = (findRow(family, token) ?? defaultRow(family)).key;
    }
    /* 关联开启时使用主搭配；第一次安装没有箱体存档时也先给主搭配。 */
    const pairLinked = readPairLinked();
    const paired = primaryCabOfAmp(selState['amp-head']);
    if (paired && (pairLinked || !stored.sel?.cabinet)) selState.cabinet = paired.key;
    const valuesState = {} as Record<HomeFamily, Record<string, number>>;
    const regsState = {} as Record<HomeFamily, Record<number, number>>;
    for (const family of HOME_FAMILIES) {
      const row = defaultRow(family, selState[family]);
      valuesState[family] = { ...row.defaults };
      regsState[family] = buildSelectRegs(row, onState[family] !== false);
    }
    return {
      sel: selState,
      on: onState,
      values: valuesState,
      regs: regsState,
      gate: typeof stored.gate === 'number' ? clamp01(stored.gate) : 0.5,
      boost: typeof stored.boost === 'number' ? clamp01(stored.boost) : 0.5,
      pairLinked,
    };
  }, []);

  const [sel, setSel] = useState<Record<HomeFamily, string>>(boot.sel);
  const [on, setOn] = useState<Record<string, boolean>>(boot.on);
  const [values, setValues] = useState<Record<HomeFamily, Record<string, number>>>(boot.values);
  const [rowRegs, setRowRegs] = useState<Record<HomeFamily, Record<number, number>>>(boot.regs);
  const [gate, setGate] = useState(boot.gate);
  const [boost, setBoost] = useState(boot.boost);
  const [pairLinked, setPairLinked] = useState(boot.pairLinked);
  const [cabOpen, setCabOpen] = useState(false);
  const [openPicker, setOpenPicker] = useState<HomeFamily | null>(null);
  const [extOpen, setExtOpen] = useState(false);
  const [snaps, setSnaps] = useState<SnapStore>(readSnaps);
  const [fxPreset, setFxPreset] = useState<{ chorus: number; delay: number; reverb: number }>({ chorus: 0, delay: 0, reverb: 0 });
  const [presetSheet, setPresetSheet] = useState<'chorus' | 'delay' | 'reverb' | null>(null);
  /* ★ 2026-11-16（用户拍板）：PRE EQ 隐藏参数翻面。
     同一时刻只翻一张卡；背面编辑的字放在 preEqWords，保存后成为 `原名-1`。 */
  const [flip, setFlip] = useState<'overdrive' | 'amp-head' | null>(null);
  const [preEqWords, setPreEqWords] = useState<Record<number, number>>({});
  const [variantRev, setVariantRev] = useState(0);
  const [savingVariant, setSavingVariant] = useState(false);

  const selected = useMemo(() => {
    const table = {} as Record<HomeFamily, ToneRow>;
    for (const family of HOME_FAMILIES) table[family] = defaultRow(family, sel[family]);
    return table;
  }, [sel]);

  const smKeys = useMemo(() => {
    const out: Record<string, string> = {};
    for (const family of HOME_FAMILIES) out[family] = sel[family];
    return out;
  }, [sel]);

  const selRef = useRef(sel);
  const onRef = useRef(on);
  const valuesRef = useRef(values);
  const regsRef = useRef(rowRegs);
  const syncRef = useRef(sync);
  const smCbRef = useRef(onSubModelsChange);
  const pairRef = useRef(pairLinked);
  selRef.current = sel;
  onRef.current = on;
  valuesRef.current = values;
  regsRef.current = rowRegs;
  syncRef.current = sync;
  smCbRef.current = onSubModelsChange;
  pairRef.current = pairLinked;

  const masterValue = clamp01(outVol ?? 0.5);
  const ampRow = selected['amp-head'];
  const cabRow = selected.cabinet;
  const cabSiblings = useMemo(() => siblingRows(cabRow), [cabRow]);
  const cabIndex = Math.max(0, cabSiblings.findIndex((r) => r.key === cabRow.key));

  const requireOnline = useCallback((): boolean => {
    if (btConnected) return true;
    notifyErr(t3(lang, 'notConnected'));
    return false;
  }, [btConnected, lang]);

  const withOutputMute = useCallback(async (run: () => Promise<void>) => {
    const reg = (v: number) => bleManager.writeRegister(260, v, 0xEA).catch(() => {});
    await reg(1);
    const guard = window.setTimeout(() => { void reg(0); }, 4000);
    try {
      await run();
    } finally {
      window.clearTimeout(guard);
      await sleep(80);
      await reg(0);
    }
  }, []);

  const sendAll = useCallback(async (
    regs: Record<number, number>,
    label: string,
    modId: string,
    muteHint: boolean,
  ): Promise<void> => {
    if (!btConnected) {
      notifyErr(t3(lang, 'notConnected'));
      return;
    }
    if (isBusy()) return;

    const pre: Array<[number, number]> = [];
    const post: Array<[number, number]> = [];
    const pulled = new Set<number>();
    for (const fx of PRE_BYPASS_FX) {
      if (!fx.params.some((a) => regs[a] !== undefined)) continue;
      const target = regs[fx.sw];
      if (target === undefined) continue;
      pre.push([fx.sw, 1]);
      if (target !== 1) post.push([fx.sw, target]);
      pulled.add(fx.sw);
    }
    const mid = orderBypassSplit(
      Object.keys(regs).map(Number).filter((a) => Number.isFinite(a) && !pulled.has(a)),
      (a) => a,
      (a) => regs[a],
    );
    const plan: Array<[number, number]> = [
      ...pre,
      ...mid.map((a) => [a, regs[a]] as [number, number]),
      ...post,
    ];
    if (!plan.length) return;

    const t0 = Date.now();
    const guard = !!(muteHint && onMuteGuard);
    beginBusy(t3(lang, 'loading'), label);
    try {
      if (guard) {
        try { await onMuteGuard!(true); } catch { /* ignore */ }
      }
      for (const [addr, value] of plan) {
        try { await onParam(addr, value, modId, true); } catch { /* reported by onParam */ }
        await sleep(EA_WRITE_MS);
      }
    } finally {
      const need = switchWindowMs(plan.length);
      const left = need - (Date.now() - t0);
      if (left > 30) {
        endBusyAfter(left);
        if (guard) await sleep(left);
      } else {
        endBusy();
      }
      if (guard) {
        try { await onMuteGuard!(false); } catch { /* ignore */ }
      }
    }
  }, [btConnected, lang, onMuteGuard, onParam]);

  const applyRow = useCallback(async (family: HomeFamily, row: ToneRow): Promise<void> => {
    if (row.key === selRef.current[family]) {
      setOpenPicker(null);
      return;
    }
    if (!requireOnline()) return;
    if (isBusy()) return;

    const nextOn = onRef.current[family] !== false;
    const regs = buildSelectRegs(row, nextOn);
    const nextSel = { ...selRef.current, [family]: row.key };
    const nextValues = { ...valuesRef.current, [family]: { ...row.defaults } };
    const nextRegs = { ...regsRef.current, [family]: regs };
    let sendRegs = regs;

    /* 关联开启时：箱头带主箱体，选箱体也切回主箱头；关闭后各自独立。 */
    if (family === 'amp-head' && pairRef.current) {
      const paired = primaryCabOfAmp(row.key);
      if (paired && paired.key !== selRef.current.cabinet) {
        const cabRegs = buildSelectRegs(paired, onRef.current.cabinet !== false);
        nextSel.cabinet = paired.key;
        nextValues.cabinet = { ...paired.defaults };
        nextRegs.cabinet = cabRegs;
        sendRegs = { ...regs, ...cabRegs };
      }
    }
    if (family === 'cabinet' && pairRef.current) {
      const currentAmp = defaultRow('amp-head', selRef.current['amp-head']);
      const pairedAmp = primaryAmpOfCab(row.key, currentAmp.key);
      if (pairedAmp && pairedAmp.key !== selRef.current['amp-head']) {
        const ampRegs = buildSelectRegs(pairedAmp, onRef.current['amp-head'] !== false);
        nextSel['amp-head'] = pairedAmp.key;
        nextValues['amp-head'] = { ...pairedAmp.defaults };
        nextRegs['amp-head'] = ampRegs;
        sendRegs = { ...regs, ...ampRegs };
      }
    }

    setSel(nextSel);
    setValues(nextValues);
    setRowRegs(nextRegs);
    setOpenPicker(null);
    setExtOpen(false);

    const label = `${familyTitle(lang, family)} · ${rowPrimary(lang, row)}`;
    const mutedRebuild = family === 'amp-head' || family === 'cabinet';
    const run = () => sendAll(sendRegs, label, family, mutedRebuild);
    if (mutedRebuild) await withOutputMute(run);
    else await run();
  }, [lang, requireOnline, sendAll, withOutputMute]);

  const stepFamily = useCallback((family: HomeFamily, rows: ToneRow[], index: number, dir: number) => {
    const next = rows[index + dir];
    if (next) void applyRow(family, next);
  }, [applyRow]);

  const togglePairLink = useCallback(() => {
    const next = !pairRef.current;
    pairRef.current = next;
    setPairLinked(next);
    try { localStorage.setItem(LINK_KEY, next ? '1' : '0'); } catch { /* ignore */ }
    if (!next) return;
    const amp = defaultRow('amp-head', selRef.current['amp-head']);
    const paired = primaryCabOfAmp(amp.key);
    if (paired && paired.key !== selRef.current.cabinet) {
      void applyRow('cabinet', paired);
    }
  }, [applyRow]);

  const hasSnapshot = useCallback((family: HomeFamily, row: ToneRow): boolean => (
    !!snaps[snapKey(family, row.key)]
  ), [snaps]);

  const saveSnapshot = useCallback((family: HomeFamily, row: ToneRow): void => {
    const bypass = new Set(BYPASS_REGS[family] ?? []);
    const regs: Record<number, number> = {};
    for (const [addr, value] of Object.entries(regsRef.current[family] ?? {})) {
      if (!bypass.has(Number(addr))) regs[Number(addr)] = value;
    }
    const entry: ParamSnap = {
      regs,
      values: family === 'amp-head' ? { ...(valuesRef.current['amp-head'] ?? {}) } : {},
      at: Date.now(),
    };
    const key = snapKey(family, row.key);
    setSnaps((prev) => {
      const next = { ...prev, [key]: entry };
      try { window.localStorage.setItem(SNAP_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
    notifyOk(`已保存当前${family === 'amp-head' ? '箱头' : '箱体'}参数`);
  }, []);

  const resetRow = useCallback(async (family: HomeFamily, row: ToneRow): Promise<void> => {
    if (!requireOnline()) return;
    if (isBusy()) return;
    const regs = buildSelectRegs(row, onRef.current[family] !== false);
    setRowRegs((prev) => ({ ...prev, [family]: regs }));
    setValues((prev) => ({ ...prev, [family]: { ...row.defaults } }));
    const label = `${familyTitle(lang, family)} · ${rowPrimary(lang, row)} · RESET`;
    await withOutputMute(() => sendAll(regs, label, family, true));
    notifyOk(`已恢复当前${family === 'amp-head' ? '箱头' : '箱体'}基础参数`);
  }, [isBusy, lang, requireOnline, sendAll, withOutputMute]);

  const recallSnapshot = useCallback(async (family: HomeFamily, row: ToneRow): Promise<void> => {
    const snap = snaps[snapKey(family, row.key)];
    if (!snap) return;
    if (!requireOnline()) return;
    if (isBusy()) return;
    const bypass = new Set(BYPASS_REGS[family] ?? []);
    const regs = buildSelectRegs(row, onRef.current[family] !== false);
    for (const [addr, value] of Object.entries(snap.regs)) {
      if (!bypass.has(Number(addr))) regs[Number(addr)] = value;
    }
    setRowRegs((prev) => ({ ...prev, [family]: regs }));
    setValues((prev) => ({
      ...prev,
      [family]: family === 'amp-head' ? decodeRowKnobs(row, regs) : { ...row.defaults },
    }));
    const label = `${familyTitle(lang, family)} · ${rowPrimary(lang, row)} · CURRENT`;
    await withOutputMute(() => sendAll(regs, label, family, true));
    notifyOk(`已载入当前${family === 'amp-head' ? '箱头' : '箱体'}参数`);
  }, [isBusy, lang, requireOnline, sendAll, snaps, withOutputMute]);

  const handleSnapshot = useCallback((family: HomeFamily, row: ToneRow): void => {
    if (snaps[snapKey(family, row.key)]) void recallSnapshot(family, row);
    else saveSnapshot(family, row);
  }, [recallSnapshot, saveSnapshot, snaps]);

  const toggleModule = useCallback((key: string) => {
    if (!requireOnline()) return;
    if (isBusy()) return;
    const next = !(onRef.current[key] ?? false);
    setOn((prev) => ({ ...prev, [key]: next }));
    onBypass(key, next);

    if ((HOME_FAMILIES as readonly string[]).includes(key)) {
      const family = key as HomeFamily;
      const addrs = BYPASS_REGS[family];
      if (addrs) {
        setRowRegs((prev) => {
          const cur = { ...prev[family] };
          for (const addr of addrs) cur[addr] = next ? 0 : 1;
          return { ...prev, [family]: cur };
        });
      }
    }
  }, [onBypass, requireOnline]);

  const applyFxPreset = useCallback(async (family: 'chorus' | 'delay' | 'reverb', index: number): Promise<void> => {
    if (!requireOnline()) return;
    if (isBusy()) return;
    const list = family === 'chorus' ? CHORUS_UI_PRESETS : family === 'delay' ? DELAY_UI_PRESETS : REVERB_UI_PRESETS;
    const preset = list[index];
    if (!preset) return;
    const row = defaultRow(family, selRef.current[family]);
    const regs: Record<number, number> = { ...row.baseRegs, ...preset.regs };
    regs[family === 'chorus' ? 215 : family === 'delay' ? 221 : 224] = 0;
    setRowRegs((prev) => ({ ...prev, [family]: regs }));
    setValues((prev) => ({ ...prev, [family]: decodeRowKnobs(row, regs) }));
    setFxPreset((prev) => ({ ...prev, [family]: index }));
    await sendAll(regs, `${familyTitle(lang, family)} · ${preset.name}`, family, false);
    notifyOk(`${family === 'chorus' ? '合唱' : family === 'delay' ? '延迟' : '混响'} · ${preset.name}`);
    setPresetSheet(null);
  }, [isBusy, lang, requireOnline, sendAll]);

  const setKnobValue = useCallback((family: HomeFamily, label: string, v: number) => {
    setValues((prev) => ({
      ...prev,
      [family]: { ...prev[family], [label]: clamp01(v) },
    }));
  }, []);

  const commitKnob = useCallback(async (family: HomeFamily, label: string, v: number) => {
    if (!requireOnline()) return;
    if (isBusy()) return;
    const row = defaultRow(family, selRef.current[family]);
    const writes = buildKnobWrites(row, label, v);
    if (!writes.length) return;
    const done: Array<{ reg: number; value: number }> = [];
    for (const write of writes) {
      let ok = false;
      try { ok = await onParam(write.reg, write.value, family); } catch { ok = false; }
      if (!ok) {
        notifyErr(t3(lang, 'writeFailed'));
        break;
      }
      done.push(write);
      await sleep(EA_WRITE_MS);
    }
    if (done.length) {
      setRowRegs((prev) => {
        const cur = { ...prev[family] };
        for (const write of done) cur[write.reg] = write.value;
        return { ...prev, [family]: cur };
      });
    }
  }, [lang, onParam, requireOnline]);

  const commitGate = useCallback(async (v: number) => {
    if (!requireOnline()) return;
    if (isBusy()) return;
    const value = Math.round(clamp01(v) * 100);
    let ok = false;
    try { ok = await onParam(1, value, 'noise-gate'); } catch { ok = false; }
    if (ok) {
      setGate(clamp01(v));
      /* 噪声门：旋钮 0 = 关闭，>0 = 自动开；灯跟随模块状态。 */
      const nextOn = v > 0.001;
      if (onRef.current['noise-gate'] !== nextOn) {
        setOn((prev) => ({ ...prev, 'noise-gate': nextOn }));
        onBypass('noise-gate', nextOn);
      }
    } else notifyErr(t3(lang, 'writeFailed'));
  }, [lang, onBypass, onParam, requireOnline]);

  const commitBoost = useCallback(async (v: number) => {
    if (!requireOnline()) return;
    if (isBusy()) return;
    const value = Math.round(clamp01(v) * 10);
    let ok = false;
    try { ok = await onParam('PGA', value, 'boost'); } catch { ok = false; }
    if (ok) {
      setBoost(clamp01(v));
      /* 激励：旋钮 0 = 关闭，>0 = 自动开。 */
      const nextOn = v > 0.001;
      if (!!onRef.current.boost !== nextOn) {
        setOn((prev) => ({ ...prev, boost: nextOn }));
        onBypass('boost', nextOn);
      }
    } else notifyErr(t3(lang, 'writeFailed'));
  }, [lang, onBypass, onParam, requireOnline]);

  /* ══════════════ ★ 2026-11-16：PRE EQ 隐藏段（翻面） ══════════════ */

  /** 翻面 / 换型号 / 载入预设后，把当前寄存器里的 PRE EQ 字读进编辑态 */
  useEffect(() => {
    if (!flip) return;
    const addrs = flip === 'amp-head' ? AMP_PRE_ADDRS : OD_PRE_ADDRS;
    const row = defaultRow(flip, sel[flip]);
    const regs = regsRef.current[flip] ?? {};
    const next: Record<number, number> = {};
    for (const a of addrs) next[a] = regs[a] ?? row.preEqBase?.[a] ?? 0;
    setPreEqWords(next);
  }, [flip, sel, sync?.tick, variantRev]);

  /** 当前段在**型号原值**上的那个字（±12 的中心） */
  const preEqBaseOf = useCallback((addr: number): number => {
    if (!flip) return 0;
    const row = defaultRow(flip, selRef.current[flip]);
    return row.preEqBase?.[addr] ?? 0;
  }, [flip]);

  const handlePreEqChange = useCallback((addr: number, norm: number) => {
    const base = preEqBaseOf(addr);
    setPreEqWords((prev) => ({ ...prev, [addr]: applyPreEqNorm(addr, prev[addr] ?? base, base, norm) }));
  }, [preEqBaseOf]);

  const handlePreEqCommit = useCallback(async (addr: number, norm: number) => {
    if (!flip) return;
    const base = preEqBaseOf(addr);
    const word = applyPreEqNorm(addr, preEqWords[addr] ?? base, base, norm);
    setPreEqWords((prev) => ({ ...prev, [addr]: word }));
    if (!requireOnline()) return;
    if (isBusy()) return;
    let ok = false;
    try { ok = await onParam(addr, word, flip); } catch { ok = false; }
    if (ok) {
      setRowRegs((prev) => ({ ...prev, [flip]: { ...prev[flip], [addr]: word } }));
    } else {
      notifyErr(t3(lang, 'writeFailed'));
    }
  }, [flip, preEqBaseOf, preEqWords, lang, onParam, requireOnline]);

  /** 保存：生成 / 覆盖 `<原名>-1`，并把当前选择切到它（保证建档一致） */
  const savePreEqVariant = useCallback(async () => {
    if (!flip || savingVariant) return;
    const family = flip;
    const row = defaultRow(family, selRef.current[family]);
    const baseKey = baseKeyOf(row.key);
    const baseRow = findRow(family, baseKey) ?? row;
    const addrs = family === 'amp-head' ? AMP_PRE_ADDRS : OD_PRE_ADDRS;
    const name = `${rowPrimary(lang, baseRow)}-1`;
    setSavingVariant(true);
    try {
      upsertVariant(
        family === 'amp-head' ? 'amp' : 'od',
        baseKey,
        name,
        pickPreEqWords(preEqWords, addrs),
      );
      refreshVariantRows();
      setVariantRev((v) => v + 1);
      const newRow = findRow(family, variantIdOf(baseKey)) ?? baseRow;
      const regs = buildSelectRegs(newRow, onRef.current[family] !== false);
      setSel((prev) => ({ ...prev, [family]: newRow.key }));
      setValues((prev) => ({ ...prev, [family]: { ...newRow.defaults } }));
      setRowRegs((prev) => ({ ...prev, [family]: regs }));
      setPreEqWords(pickPreEqWords(regs, addrs));
      if (bleManager.connected) {
        await sendAll(regs, `${familyTitle(lang, family)} · ${name}`, family, family === 'amp-head');
      }
      notifyOk(lang === 'en' ? `Saved as ${name}` : `已保存为 ${name}`);
    } finally {
      setSavingVariant(false);
    }
  }, [flip, lang, preEqWords, savingVariant, sendAll]);

  /** 保存按钮上显示的目标名（当前型号 → 基座名 + "-1"） */
  const preEqSaveName = useMemo(() => {
    if (!flip) return '';
    const row = defaultRow(flip, sel[flip]);
    const baseRow = findRow(flip, baseKeyOf(row.key)) ?? row;
    return `${rowPrimary(lang, baseRow)}-1`;
  }, [flip, lang, sel]);

  /** 变体是否存在（决定按钮写"保存为"还是"覆盖"） */
  const preEqIsVariant = useMemo(() => {
    if (!flip) return false;
    const row = defaultRow(flip, sel[flip]);
    return isVariantKey(row.key) || !!findVariant(
      flip === 'amp-head' ? 'amp' : 'od',
      baseKeyOf(row.key),
    );
  }, [flip, sel, variantRev]);

  useEffect(() => {
    if (!syncRef.current || !syncRef.current.regs) return;
    const s = syncRef.current;
    const regs = s.regs;
    const nextOn = { ...onRef.current };
    const nextSel = { ...selRef.current };

    const readSwitch = (key: string, addr: number) => {
      const value = regs[addr];
      if (typeof value === 'number') nextOn[key] = value === 0;
    };
    readSwitch('noise-gate', 0);
    readSwitch('compressor', 7);
    readSwitch('overdrive', 42);
    readSwitch('cabinet', 107);
    readSwitch('chorus', 215);
    readSwitch('delay', 221);
    readSwitch('reverb', 224);
    if (typeof regs[57] === 'number' || typeof regs[72] === 'number') {
      nextOn['amp-head'] = (regs[57] ?? 0) === 0 && (regs[72] ?? 0) === 0;
    }

    const modules = s.modules;
    if (modules) {
      const fallback: Array<[string, number]> = [
        ['noise-gate', 0], ['compressor', 7], ['overdrive', 42], ['cabinet', 107],
        ['chorus', 215], ['delay', 221], ['reverb', 224],
      ];
      for (const [key, addr] of fallback) {
        if (typeof regs[addr] !== 'number' && typeof modules[key] === 'boolean') nextOn[key] = modules[key];
      }
      if (typeof modules.boost === 'boolean' && typeof s.boost !== 'number') nextOn.boost = modules.boost;
    }

    const nextValues = { ...valuesRef.current };
    const nextRegs = { ...regsRef.current };
    for (const family of HOME_FAMILIES) {
      const token = s.subModels?.[family];
      const resolved = token ? resolveSyncRow(family, token) : undefined;
      if (resolved) nextSel[family] = resolved.key;
      const row = defaultRow(family, nextSel[family]);
      const merged = buildSelectRegs(row, nextOn[family] !== false);
      for (const [key, value] of Object.entries(regs)) {
        const addr = Number(key);
        if (!Number.isFinite(addr) || typeof value !== 'number') continue;
        if (SKIP_SYNC.has(addr) || !familyHasAddr(family, addr)) continue;
        merged[addr] = value;
      }
      nextRegs[family] = merged;
      nextValues[family] = decodeRowKnobs(row, merged);
    }

    setOn(nextOn);
    setSel(nextSel);
    setValues(nextValues);
    setRowRegs(nextRegs);
    if (typeof regs[1] === 'number') setGate(clamp01(regs[1] / 100));
    if (typeof s.boost === 'number') {
      setBoost(clamp01(s.boost));
      nextOn.boost = s.boost > 0;
      setOn({ ...nextOn });
    }
  }, [sync?.tick]);

  const snapshot = useMemo(() => {
    const valuesSnap: Record<string, Record<string, number>> = {};
    for (const family of HOME_FAMILIES) valuesSnap[family] = regsToStrings(rowRegs[family]);
    valuesSnap['noise-gate'] = {
      0: on['noise-gate'] !== false ? 0 : 1,
      1: Math.round(gate * 100),
    };
    valuesSnap.boost = { '-1': Math.round(boost * 10) };
    valuesSnap.master = { 261: Math.max(0, Math.min(50, Math.round(masterValue * 50))) };
    return valuesSnap;
  }, [boost, gate, masterValue, on, rowRegs]);

  useEffect(() => {
    const timer = window.setTimeout(() => setUiSnapshot(snapshot, on, smKeys), 120);
    return () => window.clearTimeout(timer);
  }, [on, smKeys, snapshot]);

  useEffect(() => {
    smCbRef.current?.(smKeys);
  }, [smKeys]);

  useEffect(() => {
    try {
      window.localStorage.setItem(SESSION_KEY, JSON.stringify({ sel, on, gate, boost }));
    } catch { /* storage unavailable */ }
  }, [boost, gate, on, sel]);

  useEffect(() => {
    if (!extOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setExtOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [extOpen]);

  const extras = ampRow.knobs.slice(7);
  /* ★ 2026-11-16：翻面开关（同时只翻一张卡）+ 离线提示 */
  const toggleFlip = (family: 'overdrive' | 'amp-head') => setFlip((v) => (v === family ? null : family));
  const offlinePreEqHint = !btConnected
    ? (lang === 'en'
      ? 'Offline — edits are saved on the phone, not written to hardware'
      : '未连接蓝牙：可调可保存，但不会写入硬件')
    : undefined;
  const gateTitle = t3(lang, 'gate');
  const boostTitle = t3(lang, 'boost');
  const masterTitle = t3(lang, 'master');

  return (
    <div className="t3page">
      <div className="t3wrap">
        <section className="t3sec t3sec-quick">
          <div className="t3grid t3grid-3 t3quickbar">
            <QuickCard
              lang={lang}
              title={gateTitle}
              variant="t3quick-gate"
              accent="#9fb4c7"
              on={on['noise-gate'] !== false && gate > 0.001}
              onToggle={() => { void commitGate(on['noise-gate'] !== false && gate > 0.001 ? 0 : (gate > 0.001 ? gate : 0.1)); }}
              toggleAria={`${gateTitle} ${t3(lang, on['noise-gate'] !== false && gate > 0.001 ? 'on' : 'off')}`}
              knobLabel={t3(lang, 'gateThreshold')}
              hideKnobLabel
              value={gate}
              defaultValue={0.5}
              formatValue={(v) => String(Math.round(v * 10))}
              onChange={setGate}
              onCommit={commitGate}
            />
            <QuickCard
              lang={lang}
              title={boostTitle}
              variant="t3quick-boost"
              accent="#7ee787"
              on={!!on.boost && boost > 0.001}
              onToggle={() => { void commitBoost(!!on.boost && boost > 0.001 ? 0 : (boost > 0.001 ? boost : 0.1)); }}
              toggleAria={`${boostTitle} ${t3(lang, !!on.boost && boost > 0.001 ? 'on' : 'off')}`}
              knobLabel={t3(lang, 'boostLevel')}
              hideKnobLabel
              value={boost}
              defaultValue={0.5}
              formatValue={(v) => String(Math.round(v * 10))}
              onChange={setBoost}
              onCommit={commitBoost}
            />
            <QuickCard
              lang={lang}
              title={masterTitle}
              variant="t3quick-master"
              accent="#ffa53a"
              on={!muted && masterValue > 0.001}
              knobLabel={t3(lang, 'outputLevel')}
              hideKnobLabel
              value={masterValue}
              defaultValue={0.5}
              formatValue={(v) => {
                const reg = Math.round(v * 50);
                return reg === 0 ? '−∞ dB' : `${reg - 50} dB`;
              }}
              onChange={(v) => onOutVol?.(clamp01(v))}
              onCommit={(v) => onOutVol?.(clamp01(v))}
              muted={!!muted}
              onMuteToggle={() => {
                if (masterValue <= 0.001) onOutVol?.(0.5);
                else onMuteToggle?.();
              }}
            />
          </div>
        </section>

        <section className="t3sec t3sec-drive">
          <div className="t3grid t3grid-2">
            <PedalCard
              lang={lang}
              family="compressor"
              title={t3(lang, 'compressor')}
              variant="t3comp"
              accent="#ff8a5b"
              row={selected.compressor}
              values={values.compressor}
              on={on.compressor !== false}
              onToggle={() => toggleModule('compressor')}
              onOpenPicker={() => setOpenPicker('compressor')}
              onKnobChange={(label, v) => setKnobValue('compressor', label, v)}
              onKnobCommit={(label, v) => { void commitKnob('compressor', label, v); }}
            />
            <div
              className={`t3flip-host t3flip-od${flip === 'overdrive' ? ' flipped' : ''}`}
              data-grow="1"
            >
              <div className="t3flip-inner">
                <div className="t3flip-front">
                  <PedalCard
                    lang={lang}
                    family="overdrive"
                    title={t3(lang, 'overdrive')}
                    variant="t3od"
                    accent="#7ee787"
                    row={selected.overdrive}
                    values={values.overdrive}
                    on={on.overdrive !== false}
                    onToggle={() => toggleModule('overdrive')}
                    onOpenPicker={() => setOpenPicker('overdrive')}
                    onKnobChange={(label, v) => setKnobValue('overdrive', label, v)}
                    onKnobCommit={(label, v) => { void commitKnob('overdrive', label, v); }}
                  />
                </div>
                <div className="t3flip-back" aria-hidden={flip !== 'overdrive'}>
                  {flip === 'overdrive' && (
                    <PreEqPanel
                      lang={lang}
                      row={selected.overdrive}
                      words={preEqWords}
                      saveName={preEqSaveName}
                      isVariant={preEqIsVariant}
                      saving={savingVariant}
                      offlineHint={offlinePreEqHint}
                      onKnobChange={handlePreEqChange}
                      onKnobCommit={(a, n) => { void handlePreEqCommit(a, n); }}
                      onSave={() => { void savePreEqVariant(); }}
                    />
                  )}
                </div>
              </div>
              <button
                type="button"
                className="t3flip-btn"
                onClick={() => toggleFlip('overdrive')}
                aria-label={flip === 'overdrive'
                  ? (lang === 'en' ? 'Back to knobs' : '返回正面')
                  : (lang === 'en' ? 'Hidden PRE EQ' : '隐藏参数 PRE EQ')}
                title={lang === 'en' ? 'Hidden PRE EQ' : '隐藏参数 PRE EQ'}
              >
                <FlipHorizontal2Icon size={13} />
              </button>
            </div>
          </div>
        </section>

        <section className="t3sec t3sec-amp">
          <div
            className={`t3flip-host t3flip-amp${flip === 'amp-head' ? ' flipped' : ''}`}
            data-grow="0"
          >
            <div className="t3flip-inner">
              <div className="t3flip-front">
                <AmpFace
                  lang={lang}
                  row={ampRow}
                  values={values['amp-head']}
                  on={on['amp-head'] !== false}
                  onToggle={() => toggleModule('amp-head')}
                  onOpenPicker={() => setOpenPicker('amp-head')}
                  onKnobChange={(label, v) => setKnobValue('amp-head', label, v)}
                  onKnobCommit={(label, v) => { void commitKnob('amp-head', label, v); }}
                  onExtended={extras.length ? () => setExtOpen(true) : undefined}
                  linked={pairLinked}
                  onToggleLink={togglePairLink}
                />
              </div>
              <div className="t3flip-back" aria-hidden={flip !== 'amp-head'}>
                {flip === 'amp-head' && (
                  <PreEqPanel
                    lang={lang}
                    row={selected['amp-head']}
                    words={preEqWords}
                    saveName={preEqSaveName}
                    isVariant={preEqIsVariant}
                    saving={savingVariant}
                    offlineHint={offlinePreEqHint}
                    onKnobChange={handlePreEqChange}
                    onKnobCommit={(a, n) => { void handlePreEqCommit(a, n); }}
                    onSave={() => { void savePreEqVariant(); }}
                  />
                )}
              </div>
            </div>
            <button
              type="button"
              className="t3flip-btn"
              onClick={() => toggleFlip('amp-head')}
              aria-label={flip === 'amp-head'
                ? (lang === 'en' ? 'Back to knobs' : '返回正面')
                : (lang === 'en' ? 'Hidden PRE EQ' : '隐藏参数 PRE EQ')}
              title={lang === 'en' ? 'Hidden PRE EQ' : '隐藏参数 PRE EQ'}
            >
              <FlipHorizontal2Icon size={13} />
            </button>
          </div>
        </section>

        <section className="t3sec t3sec-cab">
          <CabSection
            lang={lang}
            row={cabRow}
            on={on.cabinet !== false}
            expanded={cabOpen}
            index={cabIndex}
            count={cabSiblings.length}
            hasPrev={cabIndex > 0}
            hasNext={cabIndex < cabSiblings.length - 1}
            onTogglePower={() => toggleModule('cabinet')}
            onToggleExpanded={() => setCabOpen((v) => !v)}
            onOpenPicker={() => setOpenPicker('cabinet')}
            onPrev={() => stepFamily('cabinet', cabSiblings, cabIndex, -1)}
            onNext={() => stepFamily('cabinet', cabSiblings, cabIndex, 1)}
          />
        </section>

        <section className="t3sec t3sec-fx">
          <div className="t3grid t3grid-3 t3grid-fx">
            <FxCard
              lang={lang}
              family="chorus"
              title={t3(lang, 'chorus')}
              variant="t3fx-chorus"
              accent="#57e3d5"
              row={selected.chorus}
              values={values.chorus}
              on={on.chorus !== false}
              onToggle={() => toggleModule('chorus')}
              presetName={CHORUS_UI_PRESETS[fxPreset.chorus]?.name}
              onOpenPresets={() => setPresetSheet('chorus')}
              onKnobChange={(label, v) => setKnobValue('chorus', label, v)}
              onKnobCommit={(label, v) => { void commitKnob('chorus', label, v); }}
            />
            <FxCard
              lang={lang}
              family="delay"
              title={t3(lang, 'delay')}
              variant="t3fx-delay"
              accent="#ffc35c"
              row={selected.delay}
              values={values.delay}
              on={on.delay !== false}
              onToggle={() => toggleModule('delay')}
              presetName={DELAY_UI_PRESETS[fxPreset.delay]?.name}
              onOpenPresets={() => setPresetSheet('delay')}
              onKnobChange={(label, v) => setKnobValue('delay', label, v)}
              onKnobCommit={(label, v) => { void commitKnob('delay', label, v); }}
            />
            <FxCard
              lang={lang}
              family="reverb"
              title={t3(lang, 'reverb')}
              variant="t3fx-reverb"
              accent="#a98bff"
              row={selected.reverb}
              values={values.reverb}
              on={on.reverb !== false}
              onToggle={() => toggleModule('reverb')}
              presetName={REVERB_UI_PRESETS[fxPreset.reverb]?.name}
              onOpenPresets={() => setPresetSheet('reverb')}
              onKnobChange={(label, v) => setKnobValue('reverb', label, v)}
              onKnobCommit={(label, v) => { void commitKnob('reverb', label, v); }}
            />
          </div>
        </section>
      </div>

      {openPicker && (
        <PickerSheet
          open
          lang={lang}
          family={openPicker as ToneFamily}
          rows={FAMILY_ROWS[openPicker]}
          selectedKey={sel[openPicker]}
          title={pickerTitle(lang, openPicker)}
          onSelect={(row) => { void applyRow(openPicker, row); }}
          onClose={() => setOpenPicker(null)}
        />
      )}

      {presetSheet && (
        <FxPresetSheet
          open
          lang={lang}
          title={pickerTitle(lang, presetSheet)}
          presets={presetSheet === 'chorus' ? CHORUS_UI_PRESETS : presetSheet === 'delay' ? DELAY_UI_PRESETS : REVERB_UI_PRESETS}
          selected={fxPreset[presetSheet]}
          onSelect={(i) => { void applyFxPreset(presetSheet, i); }}
          onClose={() => setPresetSheet(null)}
        />
      )}

      {extOpen && extras.length > 0 && createPortal(
        <div
          className="t3sheet-backdrop"
          onPointerDown={(e) => { if (e.target === e.currentTarget) setExtOpen(false); }}
        >
          <section className="t3sheet t3ext" role="dialog" aria-modal="true" aria-label={t3(lang, 'extended')}>
            <div className="t3sheet-grip" aria-hidden="true" />
            <header className="t3sheet-head">
              <div>
                <h2>{t3(lang, 'extended')}</h2>
                <p>{rowPrimary(lang, ampRow)}</p>
              </div>
              <button type="button" className="t3sheet-close" onClick={() => setExtOpen(false)} aria-label={t3(lang, 'close')}>×</button>
            </header>
            <div className="t3ext-body">
              {extras.map((label) => (
                <ToneKnob
                  key={label}
                  label={label}
                  value={values['amp-head'][label] ?? ampRow.defaults[label] ?? 0.5}
                  defaultValue={ampRow.defaults[label] ?? 0.5}
                  size={72}
                  accent="#ffb347"
                  amp
                  showValue={false}
                  formatValue={(v) => knobValueText(ampRow, label, v)}
                  onChange={(v) => setKnobValue('amp-head', label, v)}
                  onCommit={(v) => { void commitKnob('amp-head', label, v); }}
                />
              ))}
            </div>
            <p className="t3ext-hint">{t3(lang, 'extendedHint')}</p>
            <button type="button" className="t3ext-done" onClick={() => setExtOpen(false)}>
              {t3(lang, 'close')}
            </button>
          </section>
        </div>,
        document.body,
      )}
    </div>
  );
}
