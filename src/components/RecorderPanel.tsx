// ─── 录音机: 多轨工程 (Cubase/Logic/GarageBand 精简版) ──────────────
// F 批 #5 (2026-09-03): 单轨录音笔 → 多轨工程:
//   - 工程 = 一次创作会话; 上限 20 轨; 列表页工程卡片 → 进入 = 多轨编辑视图.
//   - 录音: 点轨道 ● 布防 (可多轨) → 底部 ● REC 同时写入所有布防轨;
//     录音中可再点其它轨 ● 中途加入; 已录轨道再录 = 整轨重录覆盖 (先确认, 不做层叠).
//   - 播放: 底部 dock ▶/■ 播整工程 (同一播放头), 各轨波形画统一竖线进度;
//     导出: dock ⋯ 导出混音 WAV (各轨 × 音量求和 → softNormalize 防削波), 轨道 ⋯ 导出当前轨.
//   - 持久化 recStore v2: projects + laneSamples; v1 旧单条录音自动迁移为单轨工程.
// 保留: 录音中就地秒表/暂停/电平、mic 生命周期 (离开本 tab 保存半段并停麦).
// 布局与 #72/#4 语义: 内容区 flex:1 内部滚动 + 底部 TransportDock 常驻.

import { useCallback, useEffect, useRef, useState } from 'react';
import { notifyOk, notifyErr, notifyWarn, notifyInfo } from '../services/feedback';
import { useI18n } from '../i18n';
import Waveform from './Waveform';
import { getSynthCtx } from '../utils/audioSynth';
import { encodeWavPCM16 } from '../utils/wav';
import { mixLanes, softNormalize } from '../utils/audioFx';
import {
  loadProjects, saveProject, updateProjectMeta,
  loadLaneSample, saveLaneSample, deleteLaneSamples, deleteProject,
} from '../utils/recStore';
import type { ProjectMeta, RecordingLane } from '../utils/recStore';
import { claimTransport, releaseTransport } from '../utils/transportBus';
import { DockPlayBtn, TransportDock, tint, fmtDur } from '../ui/controls';
import OverflowMenu from '../ui/OverflowMenu';

interface RecorderPanelProps {
  active: boolean;
  visible: boolean;
}

/** 编辑器内轨 (data 懒加载缓存) */
interface Lane extends RecordingLane {
  data: Float32Array | null;
}

/** 内存工程 */
interface Proj {
  id: string;
  name: string;
  durSec: number;
  sampleRate: number;
  createdAt: string;
  lanes: Lane[];
}

const BLOCK = 4096;
const REC_COLOR = 'rgb(255,80,120)';
const PEAK_BUCKETS = 320;
const MAX_LANES = 20; // 拍板: 多轨上限 20 轨
const LANE_COLORS = ['#4cc9f0', '#7cd77e', '#ffb454', '#c792ea', '#5ad1c8', '#ff8c5a', '#f4e04d', '#6cb8ff', '#ff7ea8', '#8dffb0', '#ffd166', '#e56b8f', '#57c4c4', '#b0a0ff', '#ff9f66', '#a8e05f', '#62b6ff', '#ff95c2', '#9fd6ff', '#f6c445'];

let _idSeq = 0;
const genId = () => `${Date.now().toString(36)}-${(_idSeq++).toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

/** 波形预览峰值 (min/max 对, 与 Waveform 逐桶算法一致, 供 meta 存储). */
function toPeaks(data: Float32Array, buckets = PEAK_BUCKETS): Float32Array {
  const out = new Float32Array(buckets * 2);
  if (data.length === 0) return out;
  const step = data.length / buckets;
  for (let c = 0; c < buckets; c++) {
    const start = Math.floor(c * step);
    const end = Math.max(start + 1, Math.floor((c + 1) * step));
    let mn = 0, mx = 0;
    for (let j = start; j < end; j++) {
      const v = data[j];
      if (v < mn) mn = v;
      if (v > mx) mx = v;
    }
    out[c * 2] = mn;
    out[c * 2 + 1] = mx;
  }
  return out;
}

const laneDefault = (n: number, name: string): Lane => ({
  id: genId(), name, color: LANE_COLORS[(n - 1) % LANE_COLORS.length],
  gain: 1, muted: false, soloed: false, durSec: 0, peaks: new Float32Array(0), data: null,
});

const metaOf = (p: Proj): ProjectMeta => ({
  id: p.id, name: p.name, durSec: p.durSec, sampleRate: p.sampleRate, createdAt: p.createdAt,
  lanes: p.lanes.map(({ data: _d, ...rest }) => rest),
});

const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
const dateTimeName = () => {
  const d = new Date();
  const p = (x: number) => String(x).padStart(2, '0');
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

export default function RecorderPanel({ active, visible }: RecorderPanelProps) {
  const { t } = useI18n();

  // ── 视图 / 工程状态 ──
  const [projects, setProjects] = useState<Proj[]>([]);
  const [view, setView] = useState<'list' | 'proj'>('list');
  const [cur, setCur] = useState<Proj | null>(null);

  // ── 录音状态 ──
  const [isRec, setIsRec] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [level, setLevel] = useState(0);
  const [recSec, setRecSec] = useState(0);
  const [wfTick, setWfTick] = useState(0);
  const [armed, setArmed] = useState<Record<string, boolean>>({});
  /** 覆盖确认弹层: mode=rec 起录前统一确认 / mode=arm 录音中给已录轨道中途加轨 */
  const [ov, setOv] = useState<null | { laneIds: string[]; mode: 'rec' | 'arm' }>(null);

  // ── 播放状态 ──
  const [isPlaying, setIsPlaying] = useState(false);
  const [playPaused, setPlayPaused] = useState(false);
  const [playPos, setPlayPos] = useState(0);
  const [playDur, setPlayDur] = useState(0);

  // ── 重命名 (kind=proj/lane) ──
  const [renaming, setRenaming] = useState<null | { kind: 'proj' | 'lane'; id: string }>(null);
  const [renameVal, setRenameVal] = useState('');

  // ── mic / 采集 ──
  const procRef = useRef<ScriptProcessorNode | null>(null);
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const masterRef = useRef<Float32Array>(new Float32Array(0)); // 本次 REC 的全局母带 (容量倍增)
  const lenRef = useRef(0);
  const recActiveRef = useRef(false);
  const pausedRef = useRef(false);
  const capRef = useRef<Set<string>>(new Set());            // 本次正在采集的 laneId
  const capStartRef = useRef<Map<string, number>>(new Map()); // laneId → 母带起始样本
  const wfTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const curRef = useRef<Proj | null>(null);

  // ── 播放引擎 ──
  const playSourcesRef = useRef<Map<string, { src: AudioBufferSourceNode; gain: GainNode }>>(new Map());
  const playStartCtxRef = useRef(0);
  const playOffsetRef = useRef(0);
  const playPosRef = useRef(0);
  const posTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const playingRef = useRef(false);

  useEffect(() => { curRef.current = cur; }, [cur]);

  const appendSamples = (chunk: Float32Array) => {
    const n = chunk.length;
    const need = lenRef.current + n;
    if (need > masterRef.current.length) {
      const cap = Math.max(masterRef.current.length * 2, 8192, need);
      const grown = new Float32Array(cap);
      grown.set(masterRef.current.subarray(0, lenRef.current));
      masterRef.current = grown;
    }
    masterRef.current.set(chunk, lenRef.current);
    lenRef.current = need;
  };

  const ensureMic = useCallback(async (): Promise<boolean> => {
    if (procRef.current) return true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, echoCancellation: false } as any);
      const ac = getSynthCtx();
      const source = ac.createMediaStreamSource(stream);
      const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 50;
      const proc = ac.createScriptProcessor(BLOCK, 1, 1);
      proc.onaudioprocess = (e: AudioProcessingEvent) => {
        const input = e.inputBuffer.getChannelData(0);
        let max = 0;
        for (let i = 0; i < input.length; i++) { const a = Math.abs(input[i]); if (a > max) max = a; }
        setLevel(Math.min(1, max * 4));
        if (!recActiveRef.current || pausedRef.current) return;
        appendSamples(input);
      };
      const monitor = ac.createGain(); monitor.gain.value = 0; // 静音监视: 不打扰, 保证 onaudioprocess 被拉取
      source.connect(hp); hp.connect(proc); proc.connect(monitor); monitor.connect(ac.destination);
      micSourceRef.current = source;
      procRef.current = proc;
      streamRef.current = stream;
      return true;
    } catch {
      notifyErr(t('looper.micFail'));
      return false;
    }
  }, [t]);

  // ═══ 播放 (先定义, 供导航/删除时停播) ═══
  const audibleOf = useCallback((l: Lane, p: Proj) => {
    if (l.muted) return false;
    const anySolo = p.lanes.some(x => x.soloed);
    if (anySolo && !l.soloed) return false;
    return true;
  }, []);

  const syncPlayGains = useCallback((p: Proj | null) => {
    if (!p) return;
    p.lanes.forEach(l => {
      const node = playSourcesRef.current.get(l.id);
      if (node) node.gain.gain.value = audibleOf(l, p) ? l.gain : 0;
    });
  }, [audibleOf]);

  const stopPlayback = useCallback(() => {
    playingRef.current = false;
    playSourcesRef.current.forEach(({ src }) => { try { src.onended = null; src.stop(); } catch {} });
    playSourcesRef.current.clear();
    if (posTimerRef.current) { clearInterval(posTimerRef.current); posTimerRef.current = null; }
    setIsPlaying(false); setPlayPaused(false); setPlayPos(0); setPlayDur(0);
    releaseTransport('rec');
  }, []);

  const stopPlaybackIfLane = useCallback((laneId: string) => {
    const node = playSourcesRef.current.get(laneId);
    if (node) {
      try { node.src.onended = null; node.src.stop(); } catch {}
      playSourcesRef.current.delete(laneId);
      if (playSourcesRef.current.size === 0) stopPlayback();
    }
  }, [stopPlayback]);

  // ═══ 工程状态提交 (内存 + IDB 持久化) ═══
  /** 只更新内存 + 同步播放增益; IDB 延迟 600ms 合并写 (音量拖动防抖). */
  const commitProjState = useCallback((p: Proj) => {
    setCur(p);
    setProjects(prev => prev.map(x => x.id === p.id
      ? { ...p, lanes: p.lanes.map(l => ({ ...l, data: null })) }
      : x));
    syncPlayGains(p);
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(() => {
      updateProjectMeta(metaOf(p)).catch(e => { console.error('update project meta fail:', e); notifyWarn(t('rec.saveFail')); });
    }, 600);
  }, [syncPlayGains, t]);

  /** 内存 + 立即落盘. */
  const commitProj = useCallback((p: Proj) => {
    if (persistTimerRef.current) { clearTimeout(persistTimerRef.current); persistTimerRef.current = null; }
    setCur(p);
    setProjects(prev => prev.map(x => x.id === p.id
      ? { ...p, lanes: p.lanes.map(l => ({ ...l, data: null })) }
      : x));
    syncPlayGains(p);
    updateProjectMeta(metaOf(p)).catch(e => { console.error('update project meta fail:', e); notifyWarn(t('rec.saveFail')); });
  }, [syncPlayGains, t]);

  // ═══ 录音生命周期 ═══
  const startCapturingLane = (laneId: string) => {
    capRef.current.add(laneId);
    capStartRef.current.set(laneId, lenRef.current); // 中途加轨: 从此刻起写
  };

  const armLaneLive = (laneId: string) => {
    setArmed(prev => ({ ...prev, [laneId]: true }));
    startCapturingLane(laneId);
  };

  const disarmLane = (laneId: string) => {
    setArmed(prev => { const n = { ...prev }; delete n[laneId]; return n; });
    capRef.current.delete(laneId);
    capStartRef.current.delete(laneId);
  };

  const beginRec = useCallback(async (laneIds: string[]) => {
    if (recActiveRef.current || laneIds.length === 0) return;
    const ok = await ensureMic();
    if (!ok) return;
    masterRef.current = new Float32Array(0);
    lenRef.current = 0;
    capRef.current = new Set(laneIds);
    capStartRef.current = new Map(laneIds.map(id => [id, 0]));
    recActiveRef.current = true;
    pausedRef.current = false;
    setArmed(Object.fromEntries(laneIds.map(id => [id, true])));
    setIsRec(true); setIsPaused(false); setLevel(0); setRecSec(0);
    if (wfTimerRef.current) clearInterval(wfTimerRef.current);
    wfTimerRef.current = setInterval(() => setWfTick(v => v + 1), 150);
  }, [ensureMic]);

  /** 一轨落定: 重算 peaks/时长/工程总长, 返回新工程对象 (不写盘). */
  const settleLane = useCallback((p: Proj, laneId: string, data: Float32Array): Proj => {
    const peaks = toPeaks(data);
    const sr = p.sampleRate || getSynthCtx().sampleRate;
    const next: Proj = {
      ...p,
      sampleRate: sr,
      lanes: p.lanes.map(l => l.id === laneId ? { ...l, data, peaks, durSec: data.length / sr } : l),
    };
    next.durSec = Math.max(0, ...next.lanes.map(l => l.durSec));
    return next;
  }, []);

  const stopRecSession = useCallback(() => {
    if (!recActiveRef.current) return;
    recActiveRef.current = false;
    pausedRef.current = false;
    if (wfTimerRef.current) { clearInterval(wfTimerRef.current); wfTimerRef.current = null; }
    const starts = new Map(capStartRef.current);   // 先快照, 再清
    const armedIds = [...capRef.current];
    capRef.current = new Set();
    capStartRef.current = new Map();
    setArmed({});
    setIsRec(false); setIsPaused(false); setLevel(0); setRecSec(0);

    const p = curRef.current;
    const sr = p?.sampleRate || getSynthCtx().sampleRate;
    const n = lenRef.current;
    let saved = 0;
    if (p && n > sr * 0.1) {
      let next = p;
      for (const laneId of armedIds) {
        const s = starts.get(laneId) ?? 0;
        const len = n - s;
        if (len <= sr * 0.1) continue; // 本 pass 过短: 保留旧内容 (若有)
        const data = masterRef.current.slice(s, n);
        next = settleLane(next, laneId, data);
        saveLaneSample(laneId, data).catch(e => { console.error('save lane sample fail:', e); notifyWarn(t('rec.saveFail')); });
        saved++;
      }
      if (saved > 0) {
        commitProj(next);
        notifyOk(t('rec.saved'));
      }
    }
    masterRef.current = new Float32Array(0);
    lenRef.current = 0;
  }, [settleLane, commitProj, t]);

  // ═══ 工程/轨道操作 ═══
  const openProject = useCallback((p: Proj) => {
    if (playingRef.current) stopPlayback();
    setCur({ ...p, lanes: p.lanes.map(l => ({ ...l, data: null })) });
    setView('proj');
  }, [stopPlayback]);

  const newProject = useCallback((): Proj => {
    const id = genId();
    return {
      id,
      name: dateTimeName(),
      durSec: 0,
      sampleRate: 0,
      createdAt: new Date().toISOString(),
      lanes: [laneDefault(1, t('rec.lane', { n: 1 }))],
    };
  }, [t]);

  const createProjectAndOpen = useCallback(() => {
    if (recActiveRef.current) return;
    const p = newProject();
    setProjects(prev => [p, ...prev]);
    saveProject(metaOf(p)).catch(e => { console.error('save project fail:', e); notifyWarn(t('rec.saveFail')); });
    openProject(p);
  }, [newProject, openProject, t]);

  /** 列表页 dock ● REC: 一键新建单轨工程并开录 (保留旧快录习惯). */
  const quickCapture = useCallback(async () => {
    if (recActiveRef.current || playingRef.current) return;
    const p = newProject();
    setProjects(prev => [p, ...prev]);
    saveProject(metaOf(p)).catch(e => { console.error('save project fail:', e); notifyWarn(t('rec.saveFail')); });
    openProject(p);
    await beginRec([p.lanes[0].id]); // 自动布防首轨并开录
  }, [newProject, openProject, beginRec, t]);

  const addLane = useCallback(() => {
    const p = curRef.current;
    if (!p) return;
    if (p.lanes.length >= MAX_LANES) { notifyInfo(t('rec.maxTracks', { max: MAX_LANES })); return; }
    const lane = laneDefault(p.lanes.length + 1, t('rec.lane', { n: p.lanes.length + 1 }));
    commitProj({ ...p, lanes: [...p.lanes, lane] });
  }, [t]);

  const removeLane = useCallback((laneId: string) => {
    const p = curRef.current;
    if (!p || p.lanes.length <= 1) return; // 至少保留 1 轨
    if (recActiveRef.current && capRef.current.has(laneId)) disarmLane(laneId);
    stopPlaybackIfLane(laneId);
    const next = { ...p, lanes: p.lanes.filter(l => l.id !== laneId) };
    next.durSec = Math.max(0, ...next.lanes.map(l => l.durSec));
    commitProj(next);
    deleteLaneSamples([laneId]).catch(e => console.error('delete lane samples fail:', e));
  }, [commitProj, disarmLane, stopPlaybackIfLane]);

  const toggleLaneMute = (laneId: string) => {
    const p = curRef.current; if (!p) return;
    commitProj({ ...p, lanes: p.lanes.map(l => l.id === laneId ? { ...l, muted: !l.muted } : l) });
  };
  const toggleLaneSolo = (laneId: string) => {
    const p = curRef.current; if (!p) return;
    commitProj({ ...p, lanes: p.lanes.map(l => l.id === laneId ? { ...l, soloed: !l.soloed } : l) });
  };
  const setLaneGain = (laneId: string, gain: number) => {
    const p = curRef.current; if (!p) return;
    commitProjState({ ...p, lanes: p.lanes.map(l => l.id === laneId ? { ...l, gain } : l) });
  };

  const renameProjById = useCallback((id: string, name: string) => {
    const c = curRef.current;
    if (c && c.id === id) { commitProj({ ...c, name }); return; }
    setProjects(prev => {
      const next = prev.map(x => x.id === id ? { ...x, name } : x);
      const target = next.find(x => x.id === id);
      if (target) updateProjectMeta(metaOf(target)).catch(e => console.error('rename project fail:', e));
      return next;
    });
  }, [commitProj]);

  const commitRename = () => {
    const name = renameVal.trim();
    if (renaming && name) {
      if (renaming.kind === 'proj') renameProjById(renaming.id, name);
      else {
        const p = curRef.current;
        if (p) commitProj({ ...p, lanes: p.lanes.map(l => l.id === renaming.id ? { ...l, name } : l) });
      }
    }
    setRenaming(null);
  };

  const requestDeleteProj = (p: Proj) => {
    if (playingRef.current) stopPlayback();
    if (curRef.current?.id === p.id) { setCur(null); setView('list'); }
    setProjects(prev => prev.filter(x => x.id !== p.id));
    deleteProject(p.id).catch(e => { console.error('delete project fail:', e); notifyWarn(t('rec.saveFail')); });
  };

  useEffect(() => {
    let on = true;
    loadProjects()
      .then(list => { if (on) setProjects(list.map(m => ({ ...m, lanes: m.lanes.map(l => ({ ...l, data: null })) }))); })
      .catch(e => console.error('load projects fail:', e));
    return () => { on = false; };
  }, []);

  // ── 数据懒加载 (播放/导出前) ──
  const ensureData = useCallback(async (lane: Lane): Promise<Float32Array | null> => {
    if (lane.data) return lane.data;
    if (!lane.durSec) return null;
    try {
      const f32 = await loadLaneSample(lane.id);
      if (f32) setCur(prev => prev ? { ...prev, lanes: prev.lanes.map(l => l.id === lane.id ? { ...l, data: f32 } : l) } : prev);
      return f32;
    } catch (e) { console.error('load lane sample fail:', e); return null; }
  }, []);

  // ═══ 播放 ═══
  const startPlayback = useCallback(async (offset: number) => {
    const p = curRef.current;
    if (!p || p.durSec <= 0) return;
    const content = p.lanes.filter(l => l.durSec > 0);
    if (!content.length) return;
    if (recActiveRef.current) stopRecSession(); // 录音与播放互斥
    const sr = p.sampleRate || getSynthCtx().sampleRate;
    const datas = await Promise.all(content.map(l => ensureData(l)));
    if (curRef.current?.id !== p.id) return; // 等待期间切了工程
    const loaded = content.filter((_, i) => datas[i]);
    if (!loaded.length) { notifyErr(t('rec.loadFail')); return; }
    claimTransport('rec', () => stopPlayback());
    const ac = getSynthCtx();
    playSourcesRef.current.forEach(({ src }) => { try { src.stop(); } catch {} });
    playSourcesRef.current.clear();
    const off = Math.max(0, Math.min(offset, p.durSec));
    let remaining = 0;
    content.forEach((l, i) => {
      const data = datas[i];
      if (!data || data.length === 0 || off >= l.durSec) return;
      const buf = ac.createBuffer(1, data.length, sr);
      buf.getChannelData(0).set(data);
      const src = ac.createBufferSource();
      src.buffer = buf;
      const g = ac.createGain();
      g.gain.value = audibleOf(l, p) ? l.gain : 0;
      src.connect(g).connect(ac.destination);
      src.start(0, off);
      playSourcesRef.current.set(l.id, { src, gain: g });
      remaining++;
      src.onended = () => {
        playSourcesRef.current.delete(l.id);
        if (playingRef.current && playSourcesRef.current.size === 0) stopPlayback();
      };
    });
    if (remaining === 0) return;
    playingRef.current = true;
    playStartCtxRef.current = ac.currentTime;
    playOffsetRef.current = off;
    playPosRef.current = off;
    setPlayDur(p.durSec);
    setPlayPos(off);
    setIsPlaying(true); setPlayPaused(false);
    if (posTimerRef.current) clearInterval(posTimerRef.current);
    posTimerRef.current = setInterval(() => {
      const np = playOffsetRef.current + (ac.currentTime - playStartCtxRef.current);
      if (np >= (curRef.current?.durSec ?? p.durSec)) { stopPlayback(); return; }
      playPosRef.current = np;
      setPlayPos(np);
    }, 200);
  }, [audibleOf, ensureData, stopPlayback, stopRecSession, t]);

  const pausePlayback = useCallback(() => {
    if (!playingRef.current) return;
    const ac = getSynthCtx();
    const dur = curRef.current?.durSec ?? playDur;
    playPosRef.current = Math.min(dur, playOffsetRef.current + (ac.currentTime - playStartCtxRef.current));
    playingRef.current = false;
    playSourcesRef.current.forEach(({ src }) => { try { src.onended = null; src.stop(); } catch {} });
    playSourcesRef.current.clear();
    if (posTimerRef.current) { clearInterval(posTimerRef.current); posTimerRef.current = null; }
    setPlayPos(playPosRef.current);
    setPlayPaused(true);
  }, [playDur]);

  const resumePlayback = useCallback(async () => {
    setPlayPaused(false);
    await startPlayback(playPosRef.current);
  }, [startPlayback]);

  const togglePlay = useCallback(() => {
    if (playingRef.current) { stopPlayback(); return; }
    if (playPaused) { resumePlayback(); return; }
    startPlayback(0);
  }, [playPaused, resumePlayback, startPlayback, stopPlayback]);

  const seekTo = useCallback((sec: number) => {
    const p = curRef.current;
    if (!p) return;
    const s = Math.max(0, Math.min(sec, p.durSec));
    if (!playingRef.current && playPaused) { playPosRef.current = s; setPlayPos(s); return; }
    if (!playingRef.current) return;
    playingRef.current = false;
    playSourcesRef.current.forEach(({ src }) => { try { src.onended = null; src.stop(); } catch {} });
    playSourcesRef.current.clear();
    if (posTimerRef.current) { clearInterval(posTimerRef.current); posTimerRef.current = null; }
    startPlayback(s);
  }, [playPaused, startPlayback]);

  // ═══ 录音按钮 / 布防 ═══
  const onRecPressed = useCallback(() => {
    if (recActiveRef.current) { stopRecSession(); return; }
    if (view !== 'proj') { quickCapture(); return; } // 列表页 → 新建快录
    const p = curRef.current;
    if (!p) return;
    if (playingRef.current) return;
    const targetIds = p.lanes.filter(l => armed[l.id]).map(l => l.id);
    if (!targetIds.length) { notifyInfo(t('rec.noArm')); return; }
    const withContent = p.lanes.filter(l => armed[l.id] && l.durSec > 0);
    if (withContent.length) { setOv({ laneIds: targetIds, mode: 'rec' }); return; }
    beginRec(targetIds);
  }, [armed, beginRec, quickCapture, stopRecSession, t, view]);

  const toggleArm = useCallback((lane: Lane) => {
    const on = !armed[lane.id];
    if (recActiveRef.current) {
      // 录音中: 中途加轨 (已录内容轨需确认覆盖) / 撤下
      if (on) {
        if (lane.durSec > 0) { setOv({ laneIds: [lane.id], mode: 'arm' }); return; }
        armLaneLive(lane.id);
      } else {
        disarmLane(lane.id);
      }
      return;
    }
    setArmed(prev => ({ ...prev, [lane.id]: on }));
  }, [armed]);

  const confirmOverlay = () => {
    if (!ov) return;
    if (ov.mode === 'rec') { setOv(null); beginRec(ov.laneIds); }
    else { const id = ov.laneIds[0]; setOv(null); armLaneLive(id); }
  };

  // ── 录音中秒表 ──
  useEffect(() => {
    if (!isRec) { setRecSec(0); return; }
    const id = setInterval(() => {
      const sr = getSynthCtx().sampleRate || 44100;
      setRecSec(Math.floor(lenRef.current / sr));
    }, 250);
    return () => clearInterval(id);
  }, [isRec]);

  // ═══ 导出 ═══
  const downloadWav = (buf: ArrayBuffer, filename: string) => {
    const url = URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  /** 任意工程 (含列表条目, 未打开) 导出混音. */
  const exportProjectMix = useCallback(async (target: Proj) => {
    const content = target.lanes.filter(l => l.durSec > 0);
    if (!content.length) { notifyInfo(t('rec.nothingToExport')); return; }
    const sr = target.sampleRate || getSynthCtx().sampleRate;
    const datas = await Promise.all(content.map(async l => l.data ?? loadLaneSample(l.id)));
    const lanes = content
      .map((l, i) => ({ l, data: datas[i] }))
      .filter((x): x is { l: Lane; data: Float32Array } => !!x.data)
      .map(({ l, data }) => ({ data, gain: audibleOf(l, target) ? l.gain : 0 }));
    if (!lanes.length) { notifyErr(t('rec.loadFail')); return; }
    const mix = mixLanes(lanes, Math.ceil(target.durSec * sr));
    softNormalize(mix);
    downloadWav(encodeWavPCM16([mix], sr), `${target.name} mix.wav`);
    notifyOk(t('rec.mixExported', { name: target.name }));
  }, [audibleOf, t]);

  const exportMixCur = useCallback(() => {
    const p = curRef.current;
    if (p) exportProjectMix(p);
  }, [exportProjectMix]);

  const exportLane = useCallback(async (lane: Lane) => {
    const p = curRef.current;
    const data = await ensureData(lane);
    if (!data) { notifyErr(t('rec.loadFail')); return; }
    const sr = p?.sampleRate || getSynthCtx().sampleRate;
    downloadWav(encodeWavPCM16([data], sr), `${lane.name}.wav`);
    notifyOk(t('stem.exported', { name: lane.name }));
  }, [ensureData, t]);

  // ═══ mic 释放 / 离开面板 ═══
  const releaseMic = useCallback(() => {
    stopRecSession();
    if (procRef.current) { try { procRef.current.disconnect(); } catch {} procRef.current = null; }
    if (micSourceRef.current) { try { micSourceRef.current.disconnect(); } catch {} micSourceRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach(x => x.stop()); streamRef.current = null; }
    setLevel(0);
  }, [stopRecSession]);

  useEffect(() => () => {
    if (wfTimerRef.current) clearInterval(wfTimerRef.current);
    if (posTimerRef.current) clearInterval(posTimerRef.current);
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    stopPlayback();
    stopRecSession();
    if (procRef.current) { try { procRef.current.disconnect(); } catch {} procRef.current = null; }
    if (micSourceRef.current) { try { micSourceRef.current.disconnect(); } catch {} micSourceRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach(x => x.stop()); streamRef.current = null; }
  }, [stopPlayback, stopRecSession]);

  // 离开本 tab / 关闭工作室: 保存半段并停麦
  useEffect(() => { if (!active) releaseMic(); }, [active, releaseMic]);
  useEffect(() => { if (!visible) { releaseMic(); stopPlayback(); } }, [visible, releaseMic, stopPlayback]);

  // ═══ 渲染辅助 ═══
  /** 轨道内容在工程时间轴上的宽度占比 (波形区域左对齐; 空轨/录音中空轨画满行基线). */
  const laneSpanPct = (l: Lane) => {
    const p = cur;
    if (recActiveRef.current && armed[l.id]) {
      const start = capStartRef.current.get(l.id) ?? 0;
      const liveLen = Math.max(0, lenRef.current - start);
      const elapsed = Math.max(1, lenRef.current);
      return l.durSec <= 0 ? Math.max(0.05, liveLen / elapsed) : Math.max(0.05, liveLen / elapsed);
    }
    if (l.durSec <= 0) return 1; // 空轨: 整行基线
    return p && p.durSec > 0 ? l.durSec / p.durSec : 1;
  };

  const laneWaveData = (l: Lane): Float32Array | null => {
    if (recActiveRef.current && armed[l.id]) {
      const start = capStartRef.current.get(l.id) ?? 0;
      return masterRef.current.subarray(start, lenRef.current);
    }
    return l.data ?? (l.peaks.length ? l.peaks : null);
  };

  const hasTransport = isPlaying || playPaused;
  const playPct = hasTransport && playDur > 0 ? Math.max(0, Math.min(1, playPos / playDur)) : 0;

  const dockStatus = isRec
    ? { text: isPaused ? t('rec.paused') : t('rec.recording'), color: isPaused ? 'rgb(255,200,60)' : REC_COLOR }
    : isPlaying
      ? { text: t('rec.playing'), color: REC_COLOR }
      : playPaused
        ? { text: t('rec.paused'), color: 'rgb(255,200,60)' }
        : { text: t('rec.idle'), color: 'rgba(255,255,255,0.5)' };

  const showEditor = view === 'proj' && cur !== null;

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', width: '100%' }}>
      {/* ═══ 列表视图 (工程卡片) ═══ */}
      {!showEditor && (
        <>
          <div style={{ flexShrink: 0, padding: '12px 14px 8px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontFamily: '"Barlow-Regular_2",sans-serif', letterSpacing: '0.15em', flex: 1 }}>
              {t('rec.list')} ({projects.length})
            </span>
            <button onClick={createProjectAndOpen} style={{
              height: 26, padding: '0 12px', borderRadius: 6, cursor: 'pointer', flexShrink: 0,
              background: 'rgba(255,80,120,0.1)', border: '1px solid rgba(255,80,120,0.4)', color: '#ff9db8',
              fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', fontFamily: '"Barlow-Regular_2",sans-serif',
            }}>
              ＋ {t('rec.new')}
            </button>
          </div>

          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '4px 14px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {projects.length === 0 && (
              <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.25)', fontFamily: '"Barlow-Regular_2",sans-serif', textAlign: 'center', padding: '22px 0', lineHeight: 1.6 }}>
                {t('rec.empty')}
              </div>
            )}
            {projects.map(p => {
              const contentLane = p.lanes.find(l => l.durSec > 0 && l.peaks.length);
              return (
                <div key={p.id} onClick={() => openProject(p)}
                  style={{ borderRadius: 10, cursor: 'pointer',
                    border: '1px solid rgba(255,80,120,0.2)', background: 'rgba(255,80,120,0.04)',
                    padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: contentLane ? REC_COLOR : 'rgba(255,255,255,0.25)', flexShrink: 0 }} />
                    {renaming?.kind === 'proj' && renaming.id === p.id ? (
                      <input autoFocus value={renameVal} onChange={e => setRenameVal(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenaming(null); }}
                        onClick={e => e.stopPropagation()}
                        style={{ flex: 1, minWidth: 0, height: 22, borderRadius: 4, border: '1px solid rgba(255,80,120,0.4)', background: '#252831', color: '#fff', fontSize: 11, padding: '0 6px', fontFamily: '"Barlow-Regular_2",sans-serif' }} />
                    ) : (
                      <span onClick={e => e.stopPropagation()}
                        style={{ flex: 1, minWidth: 0, fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.85)', fontFamily: '"Barlow-Regular_2",sans-serif', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {p.name}
                      </span>
                    )}
                    <span style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.35)', fontFamily: '"Barlow-Regular_2",sans-serif', flexShrink: 0 }}>
                      {t('rec.lanes', { n: p.lanes.length })} · {fmt(p.durSec)}
                    </span>
                    <span onClick={e => e.stopPropagation()}>
                      <OverflowMenu actions={[
                        { key: 'rename', label: t('rec.rename'), onClick: () => { setRenaming({ kind: 'proj', id: p.id }); setRenameVal(p.name); } },
                        { key: 'mix', label: t('rec.exportMix'), color: 'rgb(140,220,255)', onClick: () => exportProjectMix(p) },
                        { key: 'del', label: t('rec.delete'), danger: true, confirmLabel: t('btn.confirmDelete'), onClick: () => requestDeleteProj(p) },
                      ]} />
                    </span>
                  </div>
                  <div style={{ height: 20, borderRadius: 4, overflow: 'hidden', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <Waveform data={contentLane ? (contentLane.data ?? contentLane.peaks) : null} color={contentLane?.color ?? REC_COLOR} height={20} />
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ═══ 工程编辑视图 (轨道车道) ═══ */}
      {showEditor && cur && (
        <>
          <div style={{ flexShrink: 0, padding: '10px 12px 6px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={() => { if (recActiveRef.current) return; stopPlayback(); setView('list'); }} style={{
              width: 28, height: 28, borderRadius: 7, cursor: 'pointer', flexShrink: 0,
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)',
              color: 'rgba(255,255,255,0.8)', fontSize: 13, lineHeight: 1, fontFamily: '"Barlow-Regular_2",sans-serif',
            }}>◀</button>
            <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
              {renaming?.kind === 'proj' && renaming.id === cur.id ? (
                <input autoFocus value={renameVal} onChange={e => setRenameVal(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenaming(null); }}
                  style={{ flex: 1, minWidth: 0, height: 24, borderRadius: 4, border: '1px solid rgba(255,80,120,0.4)', background: '#252831', color: '#fff', fontSize: 11, padding: '0 6px', fontFamily: '"Barlow-Regular_2",sans-serif' }} />
              ) : (
                <span onClick={() => { setRenaming({ kind: 'proj', id: cur.id }); setRenameVal(cur.name); }}
                  style={{ fontSize: 11, fontWeight: 800, color: 'rgba(255,255,255,0.9)', fontFamily: '"Barlow-Regular_2",sans-serif', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'pointer' }}>
                  {cur.name}
                </span>
              )}
              <span style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.3)', fontFamily: '"Barlow-Regular_2",sans-serif', flexShrink: 0, whiteSpace: 'nowrap' }}>
                {t('rec.lanes', { n: cur.lanes.length })} · {fmt(cur.durSec)}
              </span>
            </div>
          </div>

          {/* 轨道车道 (可滚) */}
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '6px 12px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {cur.lanes.map((lane, idx) => {
              const isArm = !!armed[lane.id];
              const live = isRec && isArm;
              const anySolo = cur.lanes.some(x => x.soloed);
              const audible = !lane.muted && (!anySolo || lane.soloed);
              return (
                <div key={lane.id} style={{
                  borderRadius: 10, padding: 7,
                  border: isArm ? `1px solid ${REC_COLOR}66` : `1px solid ${tint(lane.color, 0.22)}`,
                  background: isArm ? 'rgba(255,80,120,0.06)' : tint(lane.color, 0.045),
                  boxShadow: isArm ? '0 0 12px rgba(255,80,120,0.15)' : 'none',
                  opacity: (isRec && !isArm && !lane.durSec) ? 0.45 : 1,
                  transition: 'opacity 0.2s',
                }}>
                  {/* 行 1: arm ● + 色点/名 + M/S + ⋯ */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <button onClick={() => toggleArm(lane)}
                      title={isArm ? (live ? t('btn.stop') : t('rec.armed')) : t('rec.arm')}
                      style={{
                        width: 26, height: 26, borderRadius: '50%', cursor: 'pointer', flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: isArm ? 'rgba(255,80,120,0.2)' : 'transparent',
                        border: isArm ? '1.5px solid #ff5a86' : `1.5px solid ${lane.durSec > 0 ? tint(lane.color, 0.7) : 'rgba(255,255,255,0.22)'}`,
                        boxShadow: isArm ? '0 0 8px rgba(255,80,120,0.4)' : 'none',
                      }}>
                      <span style={{
                        width: isArm ? 9 : (lane.durSec > 0 ? 6 : 4), height: isArm ? 9 : (lane.durSec > 0 ? 6 : 4),
                        borderRadius: '50%', background: isArm ? REC_COLOR : (lane.durSec > 0 ? lane.color : 'rgba(255,255,255,0.3)'),
                        animation: live ? 'blink 0.5s infinite' : 'none',
                      }} />
                    </button>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: lane.color, flexShrink: 0, boxShadow: `0 0 6px ${lane.color}55` }} />
                    {renaming?.kind === 'lane' && renaming.id === lane.id ? (
                      <input autoFocus value={renameVal} onChange={e => setRenameVal(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenaming(null); }}
                        style={{ flex: 1, minWidth: 0, height: 24, borderRadius: 4, border: '1px solid rgba(255,80,120,0.4)', background: '#252831', color: '#fff', fontSize: 11, padding: '0 6px', fontFamily: '"Barlow-Regular_2",sans-serif' }} />
                    ) : (
                      <span onClick={() => { setRenaming({ kind: 'lane', id: lane.id }); setRenameVal(lane.name); }}
                        style={{ flex: 1, minWidth: 0, fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.85)', fontFamily: '"Barlow-Regular_2",sans-serif', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'pointer' }}>
                        {lane.name}
                        <span style={{ color: 'rgba(255,255,255,0.28)', fontWeight: 500, marginLeft: 5, fontSize: 10.5 }}>{idx + 1}</span>
                      </span>
                    )}
                    <button title={t('btn.mute')} onClick={() => toggleLaneMute(lane.id)} style={{
                      width: 24, height: 20, borderRadius: 5, cursor: 'pointer', flexShrink: 0,
                      fontSize: 10.5, fontWeight: 800, lineHeight: 1, fontFamily: '"Barlow-Regular_2",sans-serif',
                      background: lane.muted ? tint(lane.color, 0.22) : 'transparent',
                      border: lane.muted ? `1px solid ${lane.color}` : '1px solid rgba(255,255,255,0.16)',
                      color: lane.muted ? lane.color : 'rgba(255,255,255,0.4)',
                    }}>M</button>
                    <button title={t('btn.solo')} onClick={() => toggleLaneSolo(lane.id)} style={{
                      width: 24, height: 20, borderRadius: 5, cursor: 'pointer', flexShrink: 0,
                      fontSize: 10.5, fontWeight: 800, lineHeight: 1, fontFamily: '"Barlow-Regular_2",sans-serif',
                      background: lane.soloed ? tint(lane.color, 0.22) : 'transparent',
                      border: lane.soloed ? `1px solid ${lane.color}` : '1px solid rgba(255,255,255,0.16)',
                      color: lane.soloed ? lane.color : 'rgba(255,255,255,0.4)',
                    }}>S</button>
                    <OverflowMenu actions={[
                      { key: 'rename', label: t('rec.rename'), onClick: () => { setRenaming({ kind: 'lane', id: lane.id }); setRenameVal(lane.name); } },
                      ...(lane.durSec > 0 ? [{ key: 'export', label: t('rec.exportLane'), color: 'rgb(140,220,255)', onClick: () => exportLane(lane) }] : []),
                      ...(cur.lanes.length > 1 ? [{ key: 'del', label: t('rec.delete'), danger: true, confirmLabel: t('btn.confirmDelete'), onClick: () => removeLane(lane.id) }] : []),
                    ]} />
                  </div>
                  {/* 行 2: 波形 (左对齐工程时间轴; 播放头统一竖线) */}
                  <div style={{ position: 'relative', height: 26, borderRadius: 5, overflow: 'hidden', marginTop: 6, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${Math.min(1, Math.max(0.05, laneSpanPct(lane))) * 100}%`, overflow: 'hidden' }}>
                      <Waveform data={laneWaveData(lane)} color={isArm ? REC_COLOR : lane.color} height={26} refresh={live ? wfTick : 0} />
                    </div>
                    {hasTransport && playDur > 0 && (
                      <div style={{
                        position: 'absolute', left: `${playPct * 100}%`, top: 0, bottom: 0, width: 1.5,
                        background: 'rgba(255,255,255,0.95)', boxShadow: '0 0 6px rgba(255,255,255,0.6)', pointerEvents: 'none',
                      }} />
                    )}
                    {!audible && !isArm && (
                      <span style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', fontSize: 10.5, color: 'rgba(255,255,255,0.3)', fontFamily: '"Barlow-Regular_2",sans-serif', letterSpacing: '0.06em' }}>
                        {lane.muted ? 'MUTE' : 'SOLO'}
                      </span>
                    )}
                  </div>
                  {/* 行 3: 音量 */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                    <svg width={9} height={9} viewBox="0 0 12 12" style={{ flexShrink: 0, opacity: 0.7 }}>
                      <path d="M1 5v2h2l3 2.5v-7L3 5H1z" fill={lane.color} />
                      <path d="M8 4c.6.7.9 1.6.9 2.5S8.6 8.3 8 9" fill="none" stroke={lane.color} strokeWidth="0.9" />
                      <path d="M9.5 2.5c1 1.3 1.5 2.9 1.5 4.5s-.5 3.2-1.5 4.5" fill="none" stroke={lane.color} strokeWidth="0.9" />
                    </svg>
                    <input type="range" min={0} max={1.5} step={0.01} value={lane.gain}
                      onChange={e => setLaneGain(lane.id, Number(e.target.value))}
                      style={{ flex: 1, accentColor: lane.color, height: 2, minWidth: 0 }} />
                    <span style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.3)', fontFamily: '"Barlow-Regular_2",sans-serif', minWidth: 24, textAlign: 'right' }}>
                      {Math.round(lane.gain * 100)}%
                    </span>
                  </div>
                </div>
              );
            })}

            {cur.lanes.length < MAX_LANES && (
              <button onClick={addLane} style={{
                height: 30, borderRadius: 9, cursor: 'pointer',
                border: '1px dashed rgba(255,255,255,0.2)', background: 'transparent',
                color: 'rgba(255,255,255,0.55)', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
                fontFamily: '"Barlow-Regular_2",sans-serif',
              }}>
                ＋ {t('rec.addLane')} ({cur.lanes.length}/{MAX_LANES})
              </button>
            )}
          </div>
        </>
      )}

      {/* ═══ 底部 TransportDock (常驻; 列表页=快录, 编辑器=走带) ═══ */}
      <TransportDock accent={REC_COLOR}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* 录音主钮 ●/■ */}
          <button onClick={onRecPressed} disabled={isPlaying}
            style={{
              height: 32, borderRadius: 8, cursor: isPlaying ? 'not-allowed' : 'pointer', flexShrink: 0,
              padding: '0 14px', display: 'flex', alignItems: 'center', gap: 6,
              background: isRec ? 'rgba(255,80,120,0.22)' : 'rgba(255,80,120,0.08)',
              border: `1px solid ${isRec ? 'rgba(255,110,150,0.9)' : 'rgba(255,80,120,0.45)'}`,
              color: isRec ? 'rgb(255,140,170)' : '#ff9db8',
              fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', fontFamily: '"Barlow-Regular_2",sans-serif',
              opacity: isPlaying ? 0.4 : 1,
              boxShadow: isRec ? '0 0 12px rgba(255,80,120,0.35)' : 'none',
            }}>
            <span style={{ fontSize: 13, lineHeight: 1, color: isRec ? 'rgb(255,120,150)' : REC_COLOR, animation: isRec ? 'blink 0.6s infinite' : 'none' }}>
              {isRec ? '■' : '●'}
            </span>
            <span>{isRec ? t('btn.stop') : t('btn.rec')}</span>
          </button>
          {/* 播放 ▶/■ (工程走带) */}
          <DockPlayBtn
            playing={isPlaying}
            onClick={togglePlay}
            accent={REC_COLOR}
            label={isPlaying ? t('btn.stop') : t('btn.play')}
            disabled={!cur || cur.durSec <= 0 || isRec}
          />
          {isPlaying && (
            <button onClick={pausePlayback} style={{
              width: 30, height: 30, borderRadius: 7, cursor: 'pointer', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.2)',
              color: 'rgba(255,255,255,0.85)', fontSize: 11, fontFamily: '"Barlow-Regular_2",sans-serif',
            }}>⏸</button>
          )}
          <div style={{ flex: 1 }} />
          {/* 状态 + 时间码 */}
          <span style={{ fontSize: 11, fontWeight: 800, color: dockStatus.color, fontFamily: '"Barlow-Regular_2",sans-serif', letterSpacing: '0.06em', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 5 }}>
            {isRec && <span style={{ width: 6, height: 6, borderRadius: '50%', background: dockStatus.color, animation: 'blink 0.6s infinite' }} />}
            {isRec ? `${dockStatus.text} ${fmt(recSec)}` : dockStatus.text}
          </span>
          {hasTransport && cur && cur.durSec > 0 && (
            <span style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.4)', fontFamily: '"Barlow-Regular_2",sans-serif', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
              {fmtDur(playPos)} / {fmtDur(playDur)}
            </span>
          )}
          <OverflowMenu actions={[
            ...(showEditor && cur && cur.durSec > 0 ? [{ key: 'mix', label: t('rec.exportMix'), color: 'rgb(140,220,255)', onClick: () => exportMixCur() }] : []),
            { key: 'new', label: t('rec.new'), color: 'rgb(255,200,120)', onClick: createProjectAndOpen },
          ]} />
        </div>

        {/* 行 2: 录音电平 / 播放进度 / 提示 */}
        {isRec ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${level * 100}%`, background: 'linear-gradient(90deg, #4cc9f0, rgb(255,80,120))', transition: 'width 0.05s' }} />
            </div>
            <span style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.4)', fontFamily: '"Barlow-Regular_2",sans-serif', whiteSpace: 'nowrap' }}>
              {Object.values(armed).filter(Boolean).length > 0 ? `${Object.values(armed).filter(Boolean).length} ●` : ''}
            </span>
          </div>
        ) : hasTransport && cur && cur.durSec > 0 ? (
          <input type="range" min={0} max={Math.max(0.01, cur.durSec)} step={0.1} value={Math.min(playPos, cur.durSec)}
            onChange={e => seekTo(Number(e.target.value))}
            style={{ width: '100%', accentColor: REC_COLOR, height: 4, minWidth: 0 }} />
        ) : (
          <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.25)', fontFamily: '"Barlow-Regular_2",sans-serif', letterSpacing: '0.03em', lineHeight: 1.3 }}>
            {!showEditor
              ? t('rec.quickHint')
              : ((cur?.lanes.some(l => l.durSec > 0) ?? false) ? t('rec.hint') : t('rec.editorEmpty'))}
          </div>
        )}
      </TransportDock>

      {/* 覆盖确认弹层 */}
      {ov && (() => {
        const p = cur;
        const names = (p ? ov.laneIds.map(id => p.lanes.find(l => l.id === id)?.name ?? '') : []).filter(Boolean);
        const msg = ov.laneIds.length > 1
          ? t('rec.overwriteMany', { n: names.length })
          : t('rec.overwrite', { name: names[0] ?? '' });
        return (
          <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 28 }}>
            <div style={{
              background: '#26272c', border: '1px solid rgba(255,80,120,0.45)', borderRadius: 12, padding: 16,
              maxWidth: 300, width: '100%', boxShadow: '0 18px 50px rgba(0,0,0,0.6)',
            }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#fff', fontFamily: '"Barlow-Regular_2",sans-serif', marginBottom: 8, letterSpacing: '0.02em' }}>
                {t('rec.confirmOv')}
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', fontFamily: '"Barlow-Regular_2",sans-serif', lineHeight: 1.6, marginBottom: 14 }}>
                {msg}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setOv(null)} style={{
                  flex: 1, height: 32, borderRadius: 7, cursor: 'pointer',
                  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.2)',
                  color: 'rgba(255,255,255,0.8)', fontSize: 11, fontWeight: 700, fontFamily: '"Barlow-Regular_2",sans-serif',
                }}>{t('btn.cancel')}</button>
                <button onClick={confirmOverlay} style={{
                  flex: 1, height: 32, borderRadius: 7, cursor: 'pointer',
                  background: 'rgba(255,80,120,0.2)', border: '1px solid rgba(255,80,120,0.8)',
                  color: 'rgb(255,150,180)', fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', fontFamily: '"Barlow-Regular_2",sans-serif',
                }}>{t('rec.confirmOv')}</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
