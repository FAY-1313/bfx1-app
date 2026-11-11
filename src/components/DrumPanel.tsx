// ─── 鼓机: 16 步网格 + 鼓组子选择器 (2026-09-03 CC0 重做) ────────────
// 鼓组: rock/funk/hiphop/house/lofi = CC0 真实单次采样 (src/assets/drum/<kit>/<piece>.wav),
//       808 = 纯合成. 子选择器按「真实采样 / 合成」分组 (仿硬件页 SubModelSelector 视觉),
//       首次选中采样组时懒解码 (按套缓存), 加载中/缺失鼓件由引擎合成兜底;
//       采样未就绪时仍沿用上一鼓组发声 (playKitRef), 避免加载瞬间音色跳变.
// 每步 3 档力度 (幽灵/常规/重), swing 微调, BPM 由 StudioPanel 统一共享.
// 节奏预设库: 12+ 内置 groove + 4 个用户自定义槽 (C11: 命名/长按删除, localStorage 持久化).
// C10: MASTER 总音量; C9: CLEAR 二次确认 (arm 3s).

import { useCallback, useEffect, useRef, useState } from 'react';
import { notifyOk } from '../services/feedback';
import { ChevronDownIcon } from 'lucide-react';
import { useI18n } from '../i18n';
import { DRUM_PATTERNS } from '../data/drumPatterns';
import { DRUM_DEFS, DrumId, DrumKit, ensureDrumSamples, getSynthCtx, normalizeKit, scheduleDrum } from '../utils/audioSynth';
import { claimTransport, releaseTransport } from '../utils/transportBus';
import { DropMenu, DockPlayBtn, TransportDock } from '../ui/controls';
import OverflowMenu from '../ui/OverflowMenu';

interface DrumPanelProps {
  bpm: number;
  setBpm: (n: number) => void;
  visible: boolean;
  accentColor: string;
}

type Vel = 0 | 1 | 2 | 3;

/** C11 (2026-09-02): 用户自定义节奏槽 — 4 槽, 每槽含 kit/swing/steps + 可选名称. */
const SLOT_COUNT = 4;
const SLOTS_KEY = 'bfx_drum_custom_slots';
const LEGACY_CUSTOM_KEY = 'bfx_drum_custom'; // ≤v38 单槽 key, 迁移用
const KIT_KEY = 'bfx_drum_kit';               // 上次鼓组 (跨会话记忆, 同 C2)

/** 鼓组次序 + 分组 (子选择器): 0-4 = CC0 真实采样, 5 = 808 合成. */
const KIT_META: Array<{ kit: DrumKit; labelKey: string; swatch: string }> = [
  { kit: 'rock',   labelKey: 'drum.kitRock',   swatch: '#d97b4f' },
  { kit: 'funk',   labelKey: 'drum.kitFunk',   swatch: '#d9a94e' },
  { kit: 'hiphop', labelKey: 'drum.kitHiphop', swatch: '#9b7bff' },
  { kit: 'house',  labelKey: 'drum.kitHouse',  swatch: '#55b4e0' },
  { kit: 'lofi',   labelKey: 'drum.kitLofi',   swatch: '#c98a5e' },
  { kit: '808',    labelKey: 'drum.kit808',    swatch: '#7cd77e' },
];
const KIT_ORDER: DrumKit[] = KIT_META.map(m => m.kit);
const KIT_GROUPS: Array<{ labelKey: string; startIndex: number; count: number }> = [
  { labelKey: 'drum.grpSamples', startIndex: 0, count: 5 },
  { labelKey: 'drum.grpSynth', startIndex: 5, count: 1 },
];

const DEFAULT_PATTERN: Record<DrumId, Vel[]> = {
  kick:    [2,0,0,0, 0,0,0,0, 2,0,0,0, 0,0,0,0],
  snare:   [0,0,0,0, 2,0,0,0, 0,0,0,0, 2,0,0,0],
  hihat:   [2,1,2,1, 2,1,2,1, 2,1,2,1, 2,1,2,1],
  clap:    [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
  tom:     [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
  openhat: [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
  crash:   [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
  shaker:  [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
};

/** 为全部 8 鼓件生成统一初始状态. */
const initKitState = <T,>(val: T): Record<DrumId, T> => {
  const o = {} as Record<DrumId, T>;
  for (const d of DRUM_DEFS) o[d.id] = val;
  return o;
};

const VEL_STYLE: Record<Vel, { o: number; glow: boolean }> = {
  0: { o: 0.06, glow: false },
  1: { o: 0.28, glow: false },
  2: { o: 0.55, glow: false },
  3: { o: 0.9, glow: true },
};

interface SavedCustom { kit: DrumKit; swing: number; steps: Record<DrumId, number[]>; name?: string }
type CustomSlots = Array<SavedCustom | null>;

/** 校验旧/外来源节奏结构 (8 鼓件含 kick 且 16 步). */
const isValidCustom = (s: any): s is SavedCustom =>
  !!s && typeof s === 'object' && !!s.steps && Array.isArray(s.steps.kick) && s.steps.kick.length === 16;

function persistSlots(arr: CustomSlots) {
  try { localStorage.setItem(SLOTS_KEY, JSON.stringify(arr)); } catch { /* quota */ }
}

/** C11: 读 4 槽; 无新 key → 尝试迁移旧单槽 bfx_drum_custom 到槽 1; kit 旧值经 normalizeKit 归一. */
function loadSlots(): CustomSlots {
  const out: CustomSlots = Array(SLOT_COUNT).fill(null);
  try {
    const raw = localStorage.getItem(SLOTS_KEY);
    if (raw) {
      const p = JSON.parse(raw) as CustomSlots;
      if (Array.isArray(p)) {
        for (let i = 0; i < SLOT_COUNT && i < p.length; i++) {
          const s = p[i];
          if (s && isValidCustom(s)) out[i] = { ...s, kit: normalizeKit(s.kit) };
        }
        return out;
      }
    }
  } catch { /* corrupted → rebuild */ }
  try {
    const raw = localStorage.getItem(LEGACY_CUSTOM_KEY);
    if (raw) {
      const p = JSON.parse(raw) as SavedCustom;
      if (isValidCustom(p)) { out[0] = { ...p, kit: normalizeKit(p.kit) }; persistSlots(out); }
    }
  } catch { /* ignore */ }
  return out;
}

type KitPhase = 'idle' | 'loading' | 'ready' | 'failed';

export default function DrumPanel({ bpm, setBpm, visible, accentColor }: DrumPanelProps) {
  const { t } = useI18n();
  const [pattern, setPattern] = useState<Record<DrumId, Vel[]>>(() => JSON.parse(JSON.stringify(DEFAULT_PATTERN)));
  const [kit, setKit] = useState<DrumKit>(() => normalizeKit(localStorage.getItem(KIT_KEY)));
  const [swing, setSwing] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentStep, setCurrentStep] = useState(-1);
  const [vols, setVols] = useState<Record<DrumId, number>>(() => initKitState(0.8));
  const [muted, setMuted] = useState<Record<DrumId, boolean>>(() => initKitState(false));
  const [soloed, setSoloed] = useState<Record<DrumId, boolean>>(() => initKitState(false));
  const [activePat, setActivePat] = useState('');
  // 2026-09-03: 逐套采样就绪状态 (808 恒 idle) — 替代旧 realReady 全局标志
  const [kitPhase, setKitPhase] = useState<Record<DrumKit, KitPhase>>(() => {
    const o = {} as Record<DrumKit, KitPhase>;
    for (const k of KIT_ORDER) o[k] = 'idle';
    return o;
  });
  // C10 (2026-09-02): 总音量 MASTER (与逐轨音量相乘)
  const [master, setMaster] = useState(0.8);
  // C11 (2026-09-02): 4 个自定义节奏槽; Batch G #9: 槽位管理收进 SAVE 弹窗
  const [slots, setSlots] = useState<CustomSlots>(loadSlots);
  const [delArmed, setDelArmed] = useState(false);
  const delTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Batch G #9: SAVE 弹窗 (命名 + 槽位保存/载入/覆盖/删除)
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [ovSlot, setOvSlot] = useState(-1); // 覆盖确认 arm 槽位 (3s 内再点执行)
  const ovTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Batch G #6: 节奏 / 混音 双 tab
  const [tab, setTab] = useState<'beat' | 'mix'>('beat');

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runningRef = useRef(false);
  const nextTickRef = useRef(0);
  const stepRef = useRef(-1);
  const patternRef = useRef(pattern);
  const kitRef = useRef(kit);
  const swingRef = useRef(swing);
  const bpmRef = useRef(bpm);
  const volsRef = useRef(vols);
  const mutedRef = useRef(muted);
  const soloedRef = useRef(soloed);
  const masterRef = useRef(master);
  const playKitRef = useRef<DrumKit>(kit);
  const reqKitRef = useRef<Set<DrumKit>>(new Set()); // 已发起解码请求的套件 (每套只请求一次)
  patternRef.current = pattern;
  kitRef.current = kit;
  swingRef.current = swing;
  bpmRef.current = bpm;
  volsRef.current = vols;
  mutedRef.current = muted;
  soloedRef.current = soloed;
  masterRef.current = master;
  // 采样组未就绪 (idle/loading) → 沿用上一鼓组发声, 就绪/失败后切到新套件 (引擎逐件兜底)
  const kitUsable = kit === '808' || kitPhase[kit] === 'ready' || kitPhase[kit] === 'failed';
  const effectiveKit = kitUsable ? kit : playKitRef.current;
  playKitRef.current = effectiveKit;

  // 跨会话记忆上次鼓组
  useEffect(() => { try { localStorage.setItem(KIT_KEY, kit); } catch { /* ignore */ } }, [kit]);

  // 离开 Tab / 关闭工作室时停止发声; 同 Tab 切换不卸载, 鼓机在别的面板播放时保持 (jam 场景).
  // #70: 关闭工作室 (visible=false) → 停并释放传输总线占用.
  useEffect(() => { if (!visible) { stopDrum(); } }, [visible]);

  // 采样组鼓组: 首次选中即懒解码 (按套缓存); 之后切换套件命中缓存秒开.
  useEffect(() => {
    if (!visible || kit === '808') return;
    if (reqKitRef.current.has(kit)) return;
    reqKitRef.current.add(kit);
    setKitPhase(p => ({ ...p, [kit]: 'loading' }));
    let cancelled = false;
    ensureDrumSamples(kit).then(ok => {
      if (cancelled) return;
      setKitPhase(p => ({ ...p, [kit]: ok ? 'ready' : 'failed' }));
    });
    return () => { cancelled = true; };
  }, [visible, kit]);

  const stopScheduler = () => {
    runningRef.current = false;
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    setCurrentStep(-1);
    stepRef.current = -1;
  };

  // #70: 统一停止入口 — 停调度 + 清 UI + 释放传输总线占用 (供 claim 回调与手动停止共用).
  const stopDrum = () => {
    stopScheduler();
    setIsPlaying(false);
    releaseTransport('drum');
  };

  const runScheduler = useCallback(() => {
    const ac = getSynthCtx();
    nextTickRef.current = ac.currentTime + 0.06;
    stepRef.current = -1;
    runningRef.current = true;

    const tick = () => {
      if (!runningRef.current) return;
      const ctx = getSynthCtx();
      while (nextTickRef.current < ctx.currentTime + 0.12) {
        const next = (stepRef.current + 1) % 16;
        stepRef.current = next;
        setCurrentStep(next);
        const base = 60 / bpmRef.current / 4;
        const off = (swingRef.current > 0 && next % 2 === 1) ? base * (swingRef.current / 100) : 0;
        const time = nextTickRef.current + off;
        const soloActive = Object.values(soloedRef.current).some(Boolean);
        for (const d of DRUM_DEFS) {
          const vel = patternRef.current[d.id][next];
          if (vel === 0) continue;
          if (mutedRef.current[d.id]) continue;
          if (soloActive && !soloedRef.current[d.id]) continue;
          const v = (vel === 3 ? 1.0 : vel === 2 ? 0.7 : 0.3) * volsRef.current[d.id] * masterRef.current;
          scheduleDrum(time, d.id, playKitRef.current, v);
        }
        nextTickRef.current += base;
      }
      timerRef.current = setTimeout(tick, 25);
    };
    timerRef.current = setTimeout(tick, 0);
  }, []);

  const toggle = () => {
    if (isPlaying) {
      stopDrum();
    } else {
      // #70: 开播前声明全局传输占用 — 若 Looper/Rec/Stem 正在发声, 总线先停掉它们.
      claimTransport('drum', stopDrum);
      stopScheduler();
      setIsPlaying(true);
      runScheduler();
    }
  };

  useEffect(() => () => { stopDrum(); }, []);

  const cycleStep = (id: DrumId, step: number) => {
    setPattern(prev => {
      const next = { ...prev, [id]: [...prev[id]] as Vel[] };
      next[id][step] = ((next[id][step] + 1) % 4) as Vel;
      return next;
    });
    setActivePat('');
  };

  /** 全零 16 步网格 (C11: 空槽/删除槽后的空白模板). */
  const blankPattern = (): Record<DrumId, Vel[]> => {
    const p = {} as Record<DrumId, Vel[]>;
    for (const d of DRUM_DEFS) p[d.id] = Array(16).fill(0);
    return p;
  };

  const clearAll = () => {
    setPattern(blankPattern());
    setActivePat('');
  };

  useEffect(() => () => {
    if (delTimerRef.current) clearTimeout(delTimerRef.current); // C11
    if (ovTimerRef.current) clearTimeout(ovTimerRef.current); // G#9
  }, []);

  const loadPattern = (p: { kit: DrumKit; swing: number; steps: Record<string, number[]> }, id: string) => {
    // 归一化到 8 鼓件 (旧版 custom 只存 4 件 → 缺失件补零) + kit 旧值归一
    const steps = {} as Record<DrumId, number[]>;
    for (const d of DRUM_DEFS) {
      const row = p.steps && p.steps[d.id];
      steps[d.id] = row && row.length === 16 ? [...row] : Array(16).fill(0);
    }
    setPattern(steps as Record<DrumId, Vel[]>);
    setKit(normalizeKit(p.kit));
    setSwing(p.swing);
    setActivePat(id);
  };

  // F 批 #3 (2026-09-03): 原生 select → DropMenu; 选中即载入 (Batch G #9: 自定义槽移入 SAVE 弹窗, 下拉只留内置)
  const handlePatPick = (id: string) => {
    if (!id) return;
    const p = DRUM_PATTERNS.find(x => x.id === id);
    if (p) loadPattern(p, p.id);
  };

  const customIdxOf = (id: string) => {
    const m = id.match(/^c(\d)$/);
    return m ? Number(m[1]) : -1;
  };

  // Batch G #9: SAVE 弹窗 — 保存当前网格到指定槽 (命名可选; 有内容槽需覆盖确认), 保存后选中该槽
  const saveToSlot = (target: number) => {
    if (target < 0 || target >= SLOT_COUNT) return;
    if (ovTimerRef.current) clearTimeout(ovTimerRef.current);
    setOvSlot(-1);
    const prev = slots[target];
    const nm = saveName.trim();
    const next: CustomSlots = [...slots];
    next[target] = { kit, swing, steps: pattern, name: nm || prev?.name };
    setSlots(next); persistSlots(next);
    setActivePat(`c${target}`);
    setSaveOpen(false);
    notifyOk(`${t('drum.saved')} · ${next[target].name || `${t('drum.custom')} ${target + 1}`}`);
  };

  // Batch G #9: 覆盖确认 — 首点 arm 3s, 再点执行 (与全局危险操作一致)
  const requestSaveTo = (target: number) => {
    if (slots[target] && customIdxOf(activePat) !== target) {
      if (ovSlot !== target) {
        setOvSlot(target);
        if (ovTimerRef.current) clearTimeout(ovTimerRef.current);
        ovTimerRef.current = setTimeout(() => setOvSlot(-1), 3000);
        return;
      }
    }
    saveToSlot(target);
  };

  // Batch G #9: 载入已存槽
  const loadSlot = (i: number) => {
    const s = slots[i];
    if (!s) return;
    loadPattern(s, `c${i}`);
    setSaveOpen(false);
  };

  // C11: 删除当前槽 — 二次确认 (arm 3s), 确认后清空网格避免误存回
  const requestDelSlot = () => {
    const idx = customIdxOf(activePat);
    if (idx < 0) return;
    if (!delArmed) {
      setDelArmed(true);
      delTimerRef.current = setTimeout(() => setDelArmed(false), 3000);
      return;
    }
    if (delTimerRef.current) clearTimeout(delTimerRef.current);
    setDelArmed(false);
    const next: CustomSlots = [...slots];
    next[idx] = null;
    setSlots(next); persistSlots(next);
    setActivePat('');
    setPattern(blankPattern());
  };

  const activeSlotIdx = customIdxOf(activePat);
  const activeSlot = activeSlotIdx >= 0 ? slots[activeSlotIdx] : null;

  // Batch G #8: DropMenu 选项 — 按建议鼓组分组的内置节奏 (自定义槽移入 SAVE 弹窗管理)
  // v48: label/sub 直接用数据内 nameEn/nameZh (英文术语主行 + 规范中文副行), 不再走 i18n drum.pat.*
  const swatchOf = (k: DrumKit) => KIT_META.find(m => m.kit === k)?.swatch;
  const kitGroupKey: Record<string, string> = { rock: 'drum.kitRock', funk: 'drum.kitFunk', hiphop: 'drum.kitHiphop', house: 'drum.kitHouse', lofi: 'drum.kitLofi', '808': 'drum.kit808' };
  const patOptions = DRUM_PATTERNS.map(p => ({
    value: p.id,
    label: p.nameEn,
    sub: p.nameZh,
    group: t(kitGroupKey[p.kit] ?? 'drum.kitRock'),
    dot: swatchOf(p.kit),
  }));

  const toggleMute = (id: DrumId) => setMuted(m => ({ ...m, [id]: !m[id] }));
  const toggleSolo = (id: DrumId) => setSoloed(s => ({ ...s, [id]: !s[id] }));

  const loading = kit !== '808' && kitPhase[kit] === 'loading';

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', width: '100%' }}>
      {/* Batch G #6/#2 (2026-09-03): 内容内部滚动; BPM / 鼓组 / 节奏型选框常驻,
          tab 移到节奏型选框下方, 只切换「节奏编辑(步序网格)」↔「混音」, 不再整页切换 */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 10px 14px' }}>
      {/* Batch G #2: BPM 拉条移到控件右侧同一行 (StudioPanel 共享, 节拍器/鼓机/循环统一) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(255,200,120,0.7)', fontFamily: '"Barlow-Regular_2",sans-serif' }}>BPM</span>
        <button onClick={() => setBpm(Math.max(30, bpm - 1))} style={{ width: 26, height: 26, borderRadius: 6, cursor: 'pointer', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.8)', fontSize: 14, lineHeight: 1, fontFamily: '"Barlow-Regular_2",sans-serif' }}>−</button>
        <span style={{ fontSize: 22, fontWeight: 800, color: accentColor, fontFamily: '"Barlow-Regular_2",sans-serif', minWidth: 44, textAlign: 'center', textShadow: `0 0 12px ${accentColor}66` }}>{bpm}</span>
        <button onClick={() => setBpm(Math.min(260, bpm + 1))} style={{ width: 26, height: 26, borderRadius: 6, cursor: 'pointer', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.8)', fontSize: 14, lineHeight: 1, fontFamily: '"Barlow-Regular_2",sans-serif' }}>+</button>
        <input type="range" min={30} max={260} value={bpm} onChange={e => setBpm(Number(e.target.value))}
          style={{ flex: 1, minWidth: 0, accentColor, height: 3, cursor: 'pointer' }} />
      </div>

      {/* 鼓组子选择器 (2026-09-03: 仿 SubModelSelector 视觉 — 色块 + 分组下拉) */}
      <KitBar kit={kit} onKit={setKit} accentColor={accentColor} t={t} />
      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10.5, color: 'rgba(255,180,80,0.75)', fontFamily: '"Barlow-Regular_2",sans-serif', letterSpacing: '0.06em' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', border: '1.5px solid rgba(255,180,80,0.3)', borderTopColor: 'rgba(255,180,80,0.9)', animation: 'bfxspin 0.8s linear infinite' }} />
          {t('drum.sampleLoading')}
        </div>
      )}

      {/* 节奏预设库 (Batch G #8: 按建议鼓组分组; 自定义槽移入 SAVE 弹窗) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <DropMenu
            value={activeSlotIdx >= 0 ? '' : activePat}
            onChange={handlePatPick}
            options={patOptions}
            accent={accentColor}
            placeholder={activeSlot ? (activeSlot.name || `${t('drum.custom')} ${activeSlotIdx + 1}`) : t('drum.patterns')}
          />
        </div>
        <button onClick={() => { setSaveName(activeSlot?.name || ''); setOvSlot(-1); setSaveOpen(true); }} style={{
          height: 28, padding: '0 12px', borderRadius: 6, cursor: 'pointer', flexShrink: 0,
          background: 'rgba(60,220,100,0.08)', border: '1px solid rgba(60,220,100,0.3)', color: 'rgb(80,230,130)',
          fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', fontFamily: '"Barlow-Regular_2",sans-serif',
        }}>{t('drum.save')}</button>
      </div>

      {/* Batch G #6 (2026-09-03): 节奏编辑 / 混音 双 tab — 移到节奏型选框下方, 局部切换 */}
      <div style={{ flexShrink: 0, display: 'flex', gap: 4 }}>
        {([['beat', t('drum.tabBeat')], ['mix', t('drum.tabMix')]] as const).map(([k, lbl]) => {
          const on = tab === k;
          return (
            <button key={k} onClick={() => setTab(k)} style={{
              flex: 1, height: 27, borderRadius: 6, cursor: 'pointer',
              background: on ? `${accentColor}16` : 'rgba(255,255,255,0.03)',
              border: `1px solid ${on ? `${accentColor}66` : 'rgba(255,255,255,0.1)'}`,
              color: on ? accentColor : 'rgba(200,200,210,0.5)',
              fontSize: 11, fontWeight: 800, letterSpacing: '0.1em',
              fontFamily: '"Barlow-Regular_2",sans-serif',
            }}>{lbl}</button>
          );
        })}
      </div>

      {/* Batch G #9: 槽位管理行移入 SAVE 弹窗 (原 C11 管理行删除) */}

      {tab === 'beat' && (<>
      {/* 步序号 */}
      <div style={{ display: 'flex', paddingLeft: 34, gap: 2, marginBottom: 2 }}>
        {Array.from({ length: 16 }).map((_, i) => (
          <div key={i} style={{
            flex: 1, textAlign: 'center', fontSize: 10.5,
            color: i % 4 === 0 ? `${accentColor}` : 'rgba(120,120,130,0.4)',
            fontFamily: '"Barlow-Regular_2",sans-serif',
          }}>{i + 1}</div>
        ))}
      </div>

      {/* 轨道网格 (点 label 切换静音) */}
      {DRUM_DEFS.map(track => {
        const m = muted[track.id];
        return (
          <div key={track.id} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <div onClick={() => toggleMute(track.id)} style={{
              width: 32, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.05em',
              color: m ? 'rgba(120,120,130,0.35)' : track.color, fontFamily: '"Barlow-Regular_2",sans-serif',
              textShadow: m ? 'none' : `0 0 4px ${track.color}`, flexShrink: 0, textAlign: 'left', cursor: 'pointer',
              userSelect: 'none', textDecoration: m ? 'line-through' : 'none',
            }} title={t('drum.tapMute')}>{track.shortLabel}</div>
            {Array.from({ length: 16 }).map((_, step) => {
              const vel = pattern[track.id][step];
              const isCurrent = isPlaying && currentStep === step;
              const st = VEL_STYLE[vel];
              const bg = vel === 0
                ? (step % 4 === 0 ? `${accentColor}0a` : 'rgba(20,24,34,0.7)')
                : track.color.replace('rgb', 'rgba').replace(')', `,${st.o})`);
              return (
                <button key={step} onClick={() => cycleStep(track.id, step)} style={{
                  flex: 1, height: 22, borderRadius: 3, padding: 0, cursor: 'pointer',
                  background: bg,
                  border: isCurrent
                    ? `1.5px solid rgba(255,255,255,0.85)`
                    : `1px solid ${vel === 0 ? 'rgba(60,60,80,0.4)' : track.color.replace('rgb', 'rgba').replace(')', ',0.6)')}`,
                  boxShadow: st.glow && isCurrent ? `0 0 8px ${track.color}` : (st.glow ? `0 0 5px ${track.color}66` : 'none'),
                  transition: 'background 0.05s',
                }} />
              );
            })}
          </div>
        );
      })}

      <div style={{ fontSize: 10.5, color: 'rgba(120,120,130,0.4)', fontFamily: '"Barlow-Regular_2",sans-serif', paddingLeft: 2 }}>
        {t('drum.velHint')}
      </div>
      </>)/* beat tab */}

      {tab === 'mix' && (<>
      {/* Batch G #6: 混音 tab — 逐轨音量 + MUTE/SOLO (MASTER 已并入底部 dock) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, background: 'rgba(255,255,255,0.02)', borderRadius: 6, padding: '6px 8px', border: '1px solid rgba(255,200,0,0.08)' }}>
        <span style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.3)', fontFamily: '"Barlow-Regular_2",sans-serif', letterSpacing: '0.12em' }}>{t('drum.mix')}</span>
        {DRUM_DEFS.map(track => {
          const m = muted[track.id];
          const s = soloed[track.id];
          return (
            <div key={track.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 26, fontSize: 10.5, fontWeight: 700, color: m ? 'rgba(120,120,130,0.35)' : track.color, fontFamily: '"Barlow-Regular_2",sans-serif', textDecoration: m ? 'line-through' : 'none' }}>{track.shortLabel}</span>
              <input type="range" min={0} max={1} step={0.05} value={vols[track.id]}
                onChange={e => setVols(v => ({ ...v, [track.id]: Number(e.target.value) }))}
                style={{ flex: 1, accentColor: track.color, height: 3, cursor: 'pointer' }} />
              <span style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.35)', fontFamily: 'monospace', width: 24, textAlign: 'right' }}>{Math.round(vols[track.id] * 100)}</span>
              <button onClick={() => toggleMute(track.id)} style={{
                width: 22, height: 20, borderRadius: 4, cursor: 'pointer', fontSize: 10.5, fontWeight: 800, lineHeight: 1,
                background: m ? 'rgba(255,80,80,0.25)' : 'rgba(255,255,255,0.04)',
                border: m ? '1px solid rgba(255,80,80,0.6)' : '1px solid rgba(255,255,255,0.12)',
                color: m ? 'rgb(255,110,110)' : 'rgba(255,255,255,0.5)',
                fontFamily: '"Barlow-Regular_2",sans-serif',
              }}>M</button>
              <button onClick={() => toggleSolo(track.id)} style={{
                width: 22, height: 20, borderRadius: 4, cursor: 'pointer', fontSize: 10.5, fontWeight: 800, lineHeight: 1,
                background: s ? 'rgba(255,200,60,0.25)' : 'rgba(255,255,255,0.04)',
                border: s ? '1px solid rgba(255,200,60,0.6)' : '1px solid rgba(255,255,255,0.12)',
                color: s ? 'rgb(255,210,90)' : 'rgba(255,255,255,0.5)',
                fontFamily: '"Barlow-Regular_2",sans-serif',
              }}>S</button>
            </div>
          );
        })}
      </div>
      </>)/* mix tab */}
      </div>

      {/* Batch G #5/#7: 底部 TransportDock — 播放钮 + STEP + MASTER 滑条 + ⋯菜单(上弹) + 16 步进度 */}
      <TransportDock accent={accentColor}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <DockPlayBtn playing={isPlaying} onClick={toggle} accent={accentColor} label={isPlaying ? t('btn.stop') : t('btn.play')} />
          {isPlaying && (
            <span style={{
              fontSize: 10.5, fontWeight: 700, color: accentColor, fontFamily: '"Barlow-Regular_2",sans-serif',
              letterSpacing: '0.08em', display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap',
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'rgb(255,80,80)', animation: 'blink 0.6s infinite' }} />
              STEP {currentStep + 1}/16
            </span>
          )}
          <div style={{ flex: 1 }} />
          {/* Batch G #5: MASTER 总音量并入 dock (原内容区 MASTER 行删除, 与控件重合问题解决) */}
          <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.45)', fontFamily: '"Barlow-Regular_2",sans-serif', flexShrink: 0 }}>MASTER</span>
          <input type="range" min={0} max={1} step={0.01} value={master}
            onChange={e => setMaster(Number(e.target.value))}
            style={{ width: 72, accentColor, height: 3, cursor: 'pointer', flexShrink: 0 }} />
          <span style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.35)', fontFamily: 'monospace', width: 22, textAlign: 'right', flexShrink: 0 }}>
            {Math.round(master * 100)}
          </span>
          {/* Batch G #7: 下方无空间 → 菜单改向上弹出 */}
          <OverflowMenu direction="up" actions={[
            { key: 'clear', label: t('drum.clear'), danger: true, confirmLabel: t('drum.clearConfirm'), onClick: () => { clearAll(); } },
          ]} />
        </div>
        {/* 16 步迷你进度点 (播放时当前步高亮) */}
        <div style={{ display: 'flex', gap: 2 }}>
          {Array.from({ length: 16 }).map((_, i) => (
            <div key={i} style={{
              flex: 1, height: 4, borderRadius: 1.5,
              background: isPlaying && currentStep === i ? accentColor : (i % 4 === 0 ? `${accentColor}3a` : 'rgba(255,255,255,0.08)'),
              boxShadow: isPlaying && currentStep === i ? `0 0 6px ${accentColor}` : 'none',
              transition: 'background 0.06s',
            }} />
          ))}
        </div>
      </TransportDock>

      {/* Batch G #9: SAVE 弹窗 — 向上弹出 (命名 + 4 槽 保存/载入/覆盖/删除) */}
      {saveOpen && (
        <>
          <div onClick={() => { setSaveOpen(false); setOvSlot(-1); }} style={{ position: 'fixed', inset: 0, zIndex: 9600, background: 'rgba(0,0,0,0.45)' }} />
          <div style={{
            position: 'fixed', left: 12, right: 12, bottom: 118, zIndex: 9601,
            background: '#26272c', border: '1px solid #41424a', borderRadius: 12, padding: 12,
            boxShadow: '0 -12px 40px rgba(0,0,0,0.6)', animation: 'bfxSheetUp 0.18s ease',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', color: accentColor, fontFamily: '"Barlow-Regular_2",sans-serif' }}>{t('drum.saveTitle')}</span>
              <button onClick={() => { setSaveOpen(false); setOvSlot(-1); }} style={{
                width: 24, height: 24, borderRadius: 6, cursor: 'pointer', flexShrink: 0,
                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.14)', color: 'rgba(255,255,255,0.6)', fontSize: 11,
              }}>✕</button>
            </div>
            <input value={saveName}
              onChange={e => setSaveName(e.target.value)}
              placeholder={t('drum.namePh')}
              style={{
                width: '100%', height: 30, borderRadius: 6, padding: '0 10px', marginBottom: 8,
                background: '#2c2f36', border: `1px solid ${accentColor}55`, color: '#fff',
                fontSize: 11, fontFamily: '"Barlow-Regular_2",sans-serif', outline: 'none', boxSizing: 'border-box',
              }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {slots.map((s, i) => {
                const isCur = customIdxOf(activePat) === i;
                const arming = ovSlot === i;
                return (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', borderRadius: 7,
                    background: isCur ? `${accentColor}10` : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${isCur ? `${accentColor}55` : 'rgba(255,255,255,0.08)'}`,
                  }}>
                    <span style={{ width: 14, fontSize: 11, fontWeight: 800, color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace', flexShrink: 0 }}>{i + 1}</span>
                    {s?.kit && <span style={{ width: 10, height: 10, borderRadius: 3, flexShrink: 0, background: swatchOf(s.kit), border: '1px solid rgba(255,255,255,0.22)' }} />}
                    <span style={{
                      flex: 1, minWidth: 0, fontSize: 11, fontWeight: s ? 700 : 400,
                      color: s ? 'rgba(255,255,255,0.85)' : 'rgba(160,160,170,0.45)',
                      fontFamily: '"Barlow-Regular_2",sans-serif', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>{s ? (s.name || `${t('drum.custom')} ${i + 1}`) : t('drum.empty')}</span>
                    {s && (
                      <button onClick={() => loadSlot(i)} style={{
                        height: 24, padding: '0 10px', borderRadius: 5, cursor: 'pointer', flexShrink: 0,
                        background: `${accentColor}14`, border: `1px solid ${accentColor}44`, color: accentColor,
                        fontSize: 10.5, fontWeight: 700, letterSpacing: '0.05em', fontFamily: '"Barlow-Regular_2",sans-serif',
                      }}>{t('drum.load')}</button>
                    )}
                    <button onClick={() => requestSaveTo(i)} style={{
                      height: 24, padding: '0 10px', borderRadius: 5, cursor: 'pointer', flexShrink: 0,
                      background: arming ? 'rgba(255,170,60,0.2)' : 'rgba(60,220,100,0.1)',
                      border: `1px solid ${arming ? 'rgba(255,170,60,0.7)' : 'rgba(60,220,100,0.3)'}`,
                      color: arming ? 'rgb(255,190,110)' : 'rgb(80,230,130)',
                      fontSize: 10.5, fontWeight: 800, letterSpacing: '0.05em', fontFamily: '"Barlow-Regular_2",sans-serif',
                    }}>{arming ? t('drum.overwrite') : t('drum.save')}</button>
                    {isCur && (
                      <button onClick={requestDelSlot} style={{
                        height: 24, padding: '0 8px', borderRadius: 5, cursor: 'pointer', flexShrink: 0,
                        background: delArmed ? 'rgba(255,80,80,0.18)' : 'rgba(255,80,80,0.05)',
                        border: `1px solid ${delArmed ? 'rgba(255,80,80,0.7)' : 'rgba(255,80,80,0.3)'}`,
                        color: delArmed ? 'rgb(255,130,130)' : 'rgba(255,80,80,0.65)',
                        fontSize: 10.5, fontWeight: 800, letterSpacing: '0.05em', fontFamily: '"Barlow-Regular_2",sans-serif',
                      }}>{delArmed ? t('drum.delConfirm') : t('drum.del')}</button>
                    )}
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop: 8, fontSize: 10.5, color: 'rgba(120,120,130,0.5)', fontFamily: '"Barlow-Regular_2",sans-serif', letterSpacing: '0.04em' }}>
              {t('drum.saveHint')}
            </div>
          </div>
          <style>{`@keyframes bfxSheetUp { from { transform: translateY(14px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`}</style>
        </>
      )}
    </div>
  );
}

// ─── 鼓组子选择器: 压缩版 SubModelSelector (色块条 + fixed 定位分组下拉) ───
type I18nFn = (key: string) => string;

function KitBar({ kit, onKit, accentColor, t }: {
  kit: DrumKit; onKit: (k: DrumKit) => void; accentColor: string; t: I18nFn;
}) {
  const [open, setOpen] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);
  const ddRef = useRef<HTMLDivElement>(null);
  const [ddStyle, setDdStyle] = useState<React.CSSProperties>({});

  const idx = Math.max(0, KIT_ORDER.indexOf(kit));
  const meta = KIT_META[idx];
  const label = t(meta.labelKey);

  const computePosition = useCallback(() => {
    if (!barRef.current) return;
    const r = barRef.current.getBoundingClientRect();
    setDdStyle({
      position: 'fixed', top: r.bottom + 4, left: r.left, width: r.width, zIndex: 9999,
      maxHeight: Math.max(160, Math.min(380, window.innerHeight - r.bottom - 24)),
      overflowY: 'auto',
      background: '#2a2b30', border: '1px solid #3f4045',
      borderRadius: 10, boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
    });
  }, []);

  // Batch G #1: 与 DropMenu 同款定位重算 — 面板入场动画期间首开不错位
  useEffect(() => {
    if (!open) return;
    computePosition();
    const raf1 = requestAnimationFrame(() => requestAnimationFrame(computePosition));
    const t1 = setTimeout(computePosition, 120);
    const t2 = setTimeout(computePosition, 400);
    window.addEventListener('resize', computePosition);
    window.addEventListener('scroll', computePosition, true);
    return () => {
      cancelAnimationFrame(raf1);
      clearTimeout(t1); clearTimeout(t2);
      window.removeEventListener('resize', computePosition);
      window.removeEventListener('scroll', computePosition, true);
    };
  }, [open, computePosition]);

  // 外部点击关闭 (overlay 拦截, 允许下拉内滚动)
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (barRef.current && !barRef.current.contains(target) && !ddRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [open]);

  return (
    <>
      <style>{`@keyframes bfxspin { to { transform: rotate(360deg); } }`}</style>
      <div ref={barRef} data-cmp="DrumKitSelector" style={{
        width: '100%', flexShrink: 0, borderRadius: 8, overflow: 'visible',
        border: `1px solid ${open ? `${accentColor}88` : `${accentColor}44`}`,
        background: '#2c2f36', transition: 'border-color 0.15s ease',
      }}>
        <div onClick={() => setOpen(o => !o)} style={{
          position: 'relative', display: 'flex', alignItems: 'center', height: 32, cursor: 'pointer', padding: '0 10px', gap: 8,
        }}>
          {/* 套件色调块 */}
          <div style={{ width: 16, height: 16, borderRadius: 4, flexShrink: 0, background: meta.swatch, border: '1px solid rgba(255,255,255,0.25)', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.4)' }} />
          <span style={{ flex: 1, fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', color: accentColor, fontFamily: '"Barlow-Regular_2",sans-serif', textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {label}
          </span>
          <ChevronDownIcon size={14} color="rgba(255,255,255,0.45)" style={{ flexShrink: 0, transition: 'transform 0.15s', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }} />
        </div>
      </div>

      {/* 全屏遮罩: 拦截背景滚动/点击 */}
      {open && <div style={{ position: 'fixed', inset: 0, zIndex: 9998 }} onTouchMove={e => e.preventDefault()} onClick={() => setOpen(false)} />}

      {/* Fixed 定位下拉 */}
      {open && (
        <div ref={ddRef} style={ddStyle} onTouchMove={e => e.stopPropagation()}>
          {KIT_META.map((m, i) => {
            const grp = KIT_GROUPS.find(g => g.startIndex === i);
            const on = i === idx;
            return (
              <div key={m.kit}>
                {grp && (
                  <div style={{
                    padding: '7px 12px 3px', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.12em',
                    color: '#9aa0a6', fontFamily: '"Barlow-Regular_2",sans-serif',
                    borderTop: i > 0 ? '1px solid rgba(255,255,255,0.06)' : 'none',
                    background: 'rgba(255,255,255,0.03)',
                  }}>
                    {t(grp.labelKey)}
                  </div>
                )}
                <div
                  onClick={(e) => { e.stopPropagation(); setOpen(false); onKit(m.kit); }}
                  style={{
                    padding: '9px 12px', fontSize: 11, fontWeight: on ? 800 : 500,
                    letterSpacing: '0.06em', color: on ? accentColor : '#d8d8dc',
                    fontFamily: '"Barlow-Regular_2",sans-serif', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 8,
                    background: on ? `${accentColor}14` : 'transparent',
                    borderLeft: on ? `2px solid ${accentColor}` : '2px solid transparent',
                  }}
                >
                  <div style={{ width: 14, height: 14, borderRadius: 4, flexShrink: 0, background: m.swatch, border: '1px solid rgba(255,255,255,0.2)' }} />
                  <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t(m.labelKey)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
