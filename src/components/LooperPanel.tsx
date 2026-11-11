// ─── Looper: RC-505 风格 20 轨循环工作站 (v3.7.2) ─────────────────
// 引擎: AudioContext + ScriptProcessor 采样, 以主循环网格 (origin 相位) 把话筒
// 输入混入目标轨 buffer (录/叠录同一机制 → 天然按拍对齐).
// v37: BPM 由 StudioPanel 统一共享; 循环网格长度一旦建立即固定, count-in 预备拍/click
// 跟随录音时的 tempo (loopTempo).
// v3.7.2: 20 轨可滚列表 + 传输图标置顶 + 10 个工程槽位 (IndexedDB 存整个 loop 工程).
// - 点击 REC 先进 1 小节预备拍 (count-in): 数字倒计时 + click, 到达网格起点才开始写入
// - 录音期间不显示长串时间码, 用 BAR 进度 (如 2/4) 指示
// - 色垫: 录/叠录/停止 + MUTE/SOLO + 音量; 循环边界短淡入淡出去爆音
// - Undo 记录 {trackId,data} 撤销上一叠录层
// - 离开本 tab 停麦保播放 (jam 场景); 关闭工作室全停

import { useCallback, useEffect, useRef, useState } from 'react';
import { notifyOk, notifyErr, notifyInfo } from '../services/feedback';
import { useI18n } from '../i18n';
import Waveform from './Waveform';
import { getSynthCtx, scheduleClick } from '../utils/audioSynth';
import { claimTransport, releaseTransport } from '../utils/transportBus';
import { encodeWavPCM16 } from '../utils/wav';
import { softNormalize } from '../utils/audioFx';
import { saveLoopSlot, loadLoopSlot, deleteLoopSlot, listLoopSlots, renameLoopSlot, type LoopSession, type LoopTrackData, type LoopSlotMeta } from '../utils/loopStorage';
import { DockPlayBtn, TransportDock } from '../ui/controls';
import OverflowMenu from '../ui/OverflowMenu';

interface LooperPanelProps {
  bpm: number;
  setBpm: (n: number) => void;
  active: boolean;
  visible: boolean;
}

type TrackState = 'idle' | 'recording' | 'playing' | 'muted' | 'solo';

interface TrackUI {
  id: number;
  label: string;
  color: string;
  state: TrackState;
  hasContent: boolean;
  gain: number;
}

const MAX_TRACKS = 20;
const TRACK_COLORS = [
  '#ff5050', '#ff9f43', '#ffd93d', '#6bcb5a', '#2ecc71',
  '#20c997', '#00b4d8', '#4cc9f0', '#5b8def', '#7b61ff',
  '#9d4edd', '#d459d4', '#ff5fa2', '#ff7f9e', '#e8836b',
  '#c97b4a', '#a8b400', '#2fa876', '#3d9aa8', '#8a9cd6',
];
const TRACK_LABELS = Array.from({ length: MAX_TRACKS }, (_, i) => `TRACK ${i + 1}`);

const BLOCK = 4096;
const BAR_CHOICES: (1 | 2 | 4)[] = [1, 2, 4];
const SIG_CHOICES: [number, number][] = [[3, 4], [4, 4], [6, 8]];

// F 批 #6 (2026-09-03): 电平管理 — 输入增益 0.8 (防贴 0dB 首录即临界),
// 监听增益 0.5 (防外放回授); 叠录落定 >0.98 自动归一至 0.92 (softNormalize).
const INPUT_GAIN = 0.8;
const MONITOR_GAIN = 0.5;

const mixFileName = () => {
  const d = new Date();
  const p = (x: number) => String(x).padStart(2, '0');
  return `loop-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.wav`;
};

export default function LooperPanel({ bpm, setBpm, active, visible }: LooperPanelProps) {
  const { t } = useI18n();
  const [timeSig, setTimeSig] = useState<[number, number]>(() => {
    const s = localStorage.getItem('bfx_loop_sig');
    if (s) { const [a, b] = s.split('/').map(Number); if (a && b) return [a, b]; }
    return [4, 4];
  });
  const [tracks, setTracks] = useState<TrackUI[]>(
    TRACK_COLORS.map((c, id) => ({ id, label: TRACK_LABELS[id], color: c, state: 'idle', hasContent: false, gain: 0.8 }))
  );
  const [isRunning, setIsRunning] = useState(false);
  const [recTrackId, setRecTrackId] = useState(-1);
  const [recIsOverdub, setRecIsOverdub] = useState(false);
  const [bars, setBars] = useState<1 | 2 | 4>(2);
  const [loopTempo, setLoopTempo] = useState(0); // 0 = 尚未建循环
  const [playClick, setPlayClick] = useState(false);
  // C22 (2026-09-03): 预备拍开关 — 关=点 REC 直接等下小节开录; 开=数一整小节(拍号分子拍)
  const [countInOn, setCountInOn] = useState<boolean>(() => localStorage.getItem('bfx_loop_countin') !== '0');
  useEffect(() => { localStorage.setItem('bfx_loop_countin', countInOn ? '1' : '0'); }, [countInOn]);
  const [masterVol, setMasterVol] = useState(0.8);
  const [wfTick, setWfTick] = useState(0);
  const [level, setLevel] = useState(0);
  const [progress, setProgress] = useState(0);
  const [countIn, setCountIn] = useState(0); // 预备拍剩余拍数 (0=不在预备)
  const [showFiles, setShowFiles] = useState(false);
  const [slotMeta, setSlotMeta] = useState<Record<number, LoopSlotMeta>>({});
  // C15 (2026-09-02): 槽位命名 + 删除二次确认
  const [renamingSlot, setRenamingSlot] = useState<number | null>(null);
  const [slotNameVal, setSlotNameVal] = useState('');
  const [delArmedSlot, setDelArmedSlot] = useState<number | null>(null);
  const delSlotTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── 引擎 refs ──
  const ctxRef = useRef<AudioContext | null>(null);
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const procRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);

  const buffersRef = useRef<Float32Array[]>(TRACK_COLORS.map(() => new Float32Array(0)));
  const audioBufRef = useRef<(AudioBuffer | null)[]>(Array(MAX_TRACKS).fill(null));
  const trackGainNodeRef = useRef<(GainNode | null)[]>(Array(MAX_TRACKS).fill(null));
  const sourcesRef = useRef<(AudioBufferSourceNode | null)[]>(Array(MAX_TRACKS).fill(null));
  const undoRef = useRef<{ trackId: number; data: Float32Array } | null>(null);

  const loopLenRef = useRef(0);
  const originRef = useRef(0);
  const runningRef = useRef(false);
  const recTrackRef = useRef(-1);
  const recStartRef = useRef(0); // 网格起点, 录音只在 >= 此时间后写入
  const countInBeatsRef = useRef(0); // C22: 本次预备拍固定拍数 (0=关)
  const recWrittenRef = useRef(0);
  // F 批 #6: 本次录音是否为「叠录」— 叠录中播放本轨原层 (原 overdubMutedRef 死代码废弃)
  const overdubActiveRef = useRef(false);
  const loopTempoRef = useRef(120);
  const playClickRef = useRef(false);
  const nextLoopStartRef = useRef(0);
  const loopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wfTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const bpmRef = useRef(bpm);
  const sigRef = useRef(timeSig);
  const barsRef = useRef(bars);
  const tracksRef = useRef(tracks);
  bpmRef.current = bpm;
  sigRef.current = timeSig;
  barsRef.current = bars;
  tracksRef.current = tracks;
  playClickRef.current = playClick;

  useEffect(() => { localStorage.setItem('bfx_loop_sig', `${timeSig[0]}/${timeSig[1]}`); }, [timeSig]);

  const loopLenSamples = useCallback((): number => {
    const ac = ctxRef.current ?? getSynthCtx();
    const [nn, dd] = sigRef.current;
    const secPerBar = dd === 8 ? (nn * 60) / bpmRef.current / 2 : (nn * 60) / bpmRef.current;
    return Math.max(BLOCK, Math.round(secPerBar * barsRef.current * ac.sampleRate));
  }, []);

  const download = (buf: ArrayBuffer, name: string) => {
    const url = URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
    const a = document.createElement('a');
    a.href = url; a.download = name; a.click();
    URL.revokeObjectURL(url);
  };

  // ── 主循环调度 ──
  const scheduleCycle = useCallback((time: number) => {
    const ac = ctxRef.current;
    if (!ac) return;
    const loopLen = loopLenRef.current;
    if (loopLen === 0) return;
    const loopDur = loopLen / ac.sampleRate;
    const bufs = buffersRef.current;
    const tracksUi = tracksRef.current;

    const hasSolo = tracksUi.some(x => x.state === 'solo');

    // 节拍 click: 录音期间或开启 playClick 时 (跟随循环 tempo)
    if (recTrackRef.current >= 0 || playClickRef.current) {
      const [nn, dd] = sigRef.current;
      const secPerBeat = dd === 8 ? 60 / loopTempoRef.current / 2 : 60 / loopTempoRef.current;
      const beatsInLoop = Math.round(loopDur / secPerBeat);
      for (let b = 0; b < beatsInLoop; b++) {
        const accent = b % nn === 0;
        scheduleClick(time + b * secPerBeat, accent ? 'accent' : 'tick');
      }
    }

    const fadeIn = 0.008, fadeOut = 0.04;
    const recId = recTrackRef.current;
    for (let i = 0; i < MAX_TRACKS; i++) {
      if (bufs[i].length === 0) continue;
      // F 批 #6: 仅空轨首录 (无既有内容) 跳过自身播放; 叠录播放原层 → 用户能听到已有内容对位
      const recordingHere = recId === i;
      if (recordingHere && !overdubActiveRef.current) continue;
      const state = tracksUi[i].state;
      const inRecState = recordingHere && state === 'recording';
      if (state !== 'playing' && state !== 'muted' && state !== 'solo' && !inRecState) continue;
      const activeOut = hasSolo
        ? (state === 'solo' || inRecState)
        : (state !== 'muted' || inRecState);
      if (!activeOut) continue;

      // 持久 AudioBuffer, 每个循环拷贝最新 buffer
      let ab = audioBufRef.current[i];
      if (!ab || ab.length !== loopLen) {
        ab = ac.createBuffer(1, loopLen, ac.sampleRate);
        audioBufRef.current[i] = ab;
      }
      ab.getChannelData(0).set(bufs[i]);

      const src = ac.createBufferSource();
      src.buffer = ab;
      src.loop = false;
      let gainNode = trackGainNodeRef.current[i];
      if (!gainNode) {
        gainNode = ac.createGain();
        gainNode.connect(masterGainRef.current ?? ac.destination);
        trackGainNodeRef.current[i] = gainNode;
      }
      // 循环边界短淡入淡出 → 去爆音; 上一 source 靠自身淡出自然结束, 不再硬停
      const g = tracksUi[i].gain;
      gainNode.gain.cancelScheduledValues(time);
      gainNode.gain.setValueAtTime(0, time);
      gainNode.gain.linearRampToValueAtTime(g, time + fadeIn);
      gainNode.gain.setValueAtTime(g, time + loopDur - fadeOut);
      gainNode.gain.linearRampToValueAtTime(0, time + loopDur);
      src.connect(gainNode);
      src.start(time, 0, loopDur);
      sourcesRef.current[i] = src;
    }
  }, []);

  const stopLoopTimer = () => {
    runningRef.current = false;
    if (loopTimerRef.current) { clearTimeout(loopTimerRef.current); loopTimerRef.current = null; }
  };

  const stopAll = useCallback(() => {
    stopLoopTimer();
    for (let i = 0; i < MAX_TRACKS; i++) {
      if (sourcesRef.current[i]) { try { sourcesRef.current[i]!.stop(); } catch {} sourcesRef.current[i] = null; }
    }
    recTrackRef.current = -1;
    recStartRef.current = 0;
    overdubActiveRef.current = false;
    countInBeatsRef.current = 0;
    setCountIn(0);
    setRecIsOverdub(false);
    setIsRunning(false);
    setRecTrackId(-1);
    setTracks(prev => prev.map(x => x.hasContent ? { ...x, state: 'playing' } : { ...x, state: 'idle' }));
    // #70: 引擎已停 → 释放传输总线占用 (claim 的 stopSelf 亦走此函数)
    releaseTransport('looper');
  }, []);

  // #70: 声明 looper 为唯一发声传输 — 若 Drum/Rec/Stem 正在唱, 总线先停掉它们.
  const claimLoop = useCallback(() => {
    claimTransport('looper', () => { stopAll(); });
  }, [stopAll]);

  const runLoop = useCallback(() => {
    const ac = ctxRef.current ?? getSynthCtx();
    ctxRef.current = ac;
    if (masterGainRef.current && masterGainRef.current.context !== ac) masterGainRef.current = null;
    if (!masterGainRef.current) {
      masterGainRef.current = ac.createGain();
      masterGainRef.current.gain.value = masterVol;
      masterGainRef.current.connect(ac.destination);
    }
    const loopLen = loopLenRef.current;
    const loopDur = loopLen / ac.sampleRate;
    const now = ac.currentTime + 0.04;
    const origin = now + (loopDur - (now % loopDur));
    originRef.current = origin;
    nextLoopStartRef.current = origin;
    runningRef.current = true;
    setIsRunning(true);

    const tick = () => {
      if (!runningRef.current || !ctxRef.current) return;
      while (nextLoopStartRef.current < ctxRef.current.currentTime + 0.15) {
        scheduleCycle(nextLoopStartRef.current);
        nextLoopStartRef.current += loopDur;
      }
      loopTimerRef.current = setTimeout(tick, 25);
    };
    loopTimerRef.current = setTimeout(tick, 0);
  }, [scheduleCycle, masterVol]);

  // #70/#72: 顶部传输按钮 = 真正的播放/停止 (旧实现恒为 stopAll — 停止态点 ▶ 无声是 bug)
  const toggleLoopPlayback = useCallback(() => {
    if (isRunning || recTrackId >= 0) { stopAll(); return; }
    if (loopLenRef.current === 0) { notifyInfo(t('looper.help')); return; } // 尚无循环 → 先录一轨
    claimLoop();
    runLoop();
  }, [isRunning, recTrackId, stopAll, claimLoop, runLoop, t]);

  // ── 播放进度 / 预备拍倒计时 (RAF) ──
  useEffect(() => {
    if (!isRunning) { setProgress(0); setCountIn(0); return; }
    let raf = 0;
    const update = () => {
      const ac = ctxRef.current;
      const loopLen = loopLenRef.current;
      if (ac && loopLen > 0) {
        const loopDur = loopLen / ac.sampleRate;
        const p = (((ac.currentTime - originRef.current) % loopDur) + loopDur) % loopDur / loopDur;
        setProgress(p);
      }
      if (ac && recStartRef.current > 0) {
        const rem = recStartRef.current - ac.currentTime;
        if (rem > 0) {
          const [nn, dd] = sigRef.current;
          const spb = dd === 8 ? 60 / loopTempoRef.current / 2 : 60 / loopTempoRef.current;
          const C = countInBeatsRef.current;
          // C22: 仅预备拍开启时倒计时; 等待期超过固定拍数 → -1 (已预备, 等小节线);
          // 最后 C 拍数字与 click 对齐; 关闭时保持 0 (到小节线直接开录, 无数字)
          setCountIn(C > 0 ? (rem > C * spb ? -1 : Math.max(1, Math.ceil(rem / spb))) : 0);
        } else { setCountIn(0); }
      }
      raf = requestAnimationFrame(update);
    };
    raf = requestAnimationFrame(update);
    return () => cancelAnimationFrame(raf);
  }, [isRunning]);

  // ── 麦克风采样引擎 ──
  const ensureMic = useCallback(async (): Promise<boolean> => {
    if (procRef.current) return true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, echoCancellation: false } as any);
      const ac = getSynthCtx();
      ctxRef.current = ac;
      const source = ac.createMediaStreamSource(stream);
      const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 55;
      const proc = ac.createScriptProcessor(BLOCK, 1, 1);
      proc.onaudioprocess = (e: AudioProcessingEvent) => {
        const input = e.inputBuffer.getChannelData(0);
        const n = input.length;
        const loopLen = loopLenRef.current;
        const acn = ctxRef.current;
        if (!acn || loopLen === 0 || recTrackRef.current < 0) return;

        let max = 0;
        for (let i = 0; i < n; i++) { const a = Math.abs(input[i]); if (a > max) max = a; }
        setLevel(Math.min(1, max * 4));

        // 预备拍: 未到网格起点不写入 → 录音严格从网格起点开始, 按拍对齐
        if (acn.currentTime < recStartRef.current) return;

        const origin = originRef.current;
        const blockStart = acn.currentTime - n / acn.sampleRate;
        const buf = buffersRef.current[recTrackRef.current];
        if (!buf || buf.length === 0) return;
        const sr = acn.sampleRate;
        for (let i = 0; i < n; i++) {
          const time = blockStart + i / sr;
          let p = Math.floor((time - origin) * sr);
          p = ((p % loopLen) + loopLen) % loopLen;
          // F 批 #6: 输入增益 0.8 → 降低首录贴 0dB 临界 / 叠录线性叠加爆头概率
          buf[p] += input[i] * INPUT_GAIN;
        }
        recWrittenRef.current += n;
        if (recWrittenRef.current >= loopLen) finishRecordPass();
      };
      source.connect(hp); hp.connect(proc);
      // F 批 #6: 监听经 0.5 增益 → 外放场景降低话筒回授啸叫概率 (耳机建议, 帮助文案同步)
      const mon = ac.createGain(); mon.gain.value = MONITOR_GAIN;
      proc.connect(mon); mon.connect(ac.destination);
      micSourceRef.current = source;
      procRef.current = proc;
      streamRef.current = stream;
      return true;
    } catch (e) {
      console.error('looper mic fail:', e);
      notifyErr(t('looper.micFail'));
      return false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finishRecordPass = () => {
    const trackId = recTrackRef.current;
    const wasOverdub = overdubActiveRef.current;
    recTrackRef.current = -1;
    recStartRef.current = 0;
    overdubActiveRef.current = false;
    countInBeatsRef.current = 0;
    setCountIn(0);
    setRecIsOverdub(false);
    setRecTrackId(-1);
    if (trackId >= 0) {
      // F 批 #6: 叠录自动落定防削波 — 整轨峰值 >0.98 → 等比缩放至 0.92
      // (保持各层相对比例不逐样本限幅; undo 快照在叠录开始前已存, 归一后仍可撤销本层)
      if (wasOverdub) {
        const b = buffersRef.current[trackId];
        if (b && b.length > 0) softNormalize(b);
      }
      setTracks(prev => prev.map(x => x.id === trackId ? { ...x, state: 'playing', hasContent: true } : x));
      // #70: 首录落定 → 循环内容已可闻, looper 正式独占传输 (若鼓机在打底, 此刻才把它停掉)
      claimLoop();
    }
  };

  // ── 开始录/叠录 (带预备拍) ──
  const startRecord = useCallback(async (trackId: number) => {
    if (recTrackRef.current >= 0) { notifyInfo(t('looper.busy')); return; }
    const ok = await ensureMic();
    if (!ok) return;
    const ac = ctxRef.current!;
    const newLoop = loopLenRef.current === 0;
    const loopLen = newLoop ? loopLenSamples() : loopLenRef.current;
    loopLenRef.current = loopLen;
    if (newLoop) { loopTempoRef.current = bpmRef.current; setLoopTempo(bpmRef.current); }

    // 叠录: 保留既有内容 (mix-in); 首录: 建空 buffer
    const existing = buffersRef.current[trackId];
    const hadContent = existing.length === loopLen && existing.some(v => v !== 0);
    if (hadContent) {
      undoRef.current = { trackId, data: existing.slice() };
    } else {
      buffersRef.current[trackId] = new Float32Array(loopLen);
      undoRef.current = null;
    }

    if (!runningRef.current) runLoop();
    // #70: 网格已存在 (叠录/补录 — 旧轨会继续出声) → 独占总线, 停掉他面板发声;
    //      首录 (网格为空, 仅 count-in/话筒) 不占用 → 保留「跟着鼓机录第一轨」的经典工作流
    if (!newLoop) claimLoop();

    // C22 (2026-09-03): 预备拍开关 — 固定倒计时 1 小节(拍号分子拍)/关; 倒计时数字 k
    // 与 recStart-k 拍的 click 一一对应, 首拍 accent, 到小节线(网格起点)才开写
    const [nn, dd] = sigRef.current;
    const secPerBeat = dd === 8 ? 60 / loopTempoRef.current / 2 : 60 / loopTempoRef.current;
    const C = countInOn ? nn : 0; // 1 小节 = 拍号分子拍
    countInBeatsRef.current = C;
    const loopDur = loopLen / ac.sampleRate;
    const now = ac.currentTime + 0.03;
    const phase = (((now - originRef.current) % loopDur) + loopDur) % loopDur;
    let recStart = now + (loopDur - phase); // 下一网格边界
    const minLead = Math.max(0.2, C * secPerBeat);
    if (recStart - now < minLead) recStart += loopDur; // 不够倒计时(或反应时间)则再等一整循环
    recStartRef.current = recStart;
    setCountIn(C > 0 ? -1 : 0); // -1 = 已预备、正在等小节线才开始数拍

    if (C > 0) {
      for (let k = C; k >= 1; k--) {
        scheduleClick(recStart - k * secPerBeat, k === C ? 'accent' : 'tick');
      }
    }

    recTrackRef.current = trackId;
    recWrittenRef.current = 0;
    setRecIsOverdub(hadContent);
    setRecTrackId(trackId);
    setTracks(prev => prev.map(x => x.id === trackId ? { ...x, state: 'recording', hasContent: true } : x));

    // F 批 #6: 叠录标志 — 录音期间该轨原层继续播放 (用户可听到已录内容对位叠录)
    overdubActiveRef.current = hadContent;
  }, [ensureMic, loopLenSamples, runLoop, t]);

  const stopRecord = useCallback(() => {
    if (recTrackRef.current < 0) return;
    const trackId = recTrackRef.current;
    const ac = ctxRef.current;
    const cancelled = !!ac && ac.currentTime < recStartRef.current;
    if (cancelled) {
      // 预备拍阶段点击 = 取消 (首录丢弃, 叠录还原)
      const undo = undoRef.current;
      if (undo && undo.trackId === trackId) {
        buffersRef.current[trackId] = undo.data;
        undoRef.current = null;
        setTracks(prev => prev.map(x => x.id === trackId ? { ...x, state: 'playing', hasContent: true } : x));
      } else {
        buffersRef.current[trackId] = new Float32Array(0);
        setTracks(prev => prev.map(x => x.id === trackId ? { ...x, state: 'idle', hasContent: false } : x));
      }
    } else {
      // 提前停止: 保留当前半段 (未满 loop 长度)
      // F 批 #6: 叠录提前停止 → 亦做落定归一 (防止已写入前半段求和超 0.98)
      if (overdubActiveRef.current) {
        const b = buffersRef.current[trackId];
        if (b && b.length > 0) softNormalize(b);
      }
      setTracks(prev => prev.map(x => x.id === trackId ? { ...x, state: 'playing', hasContent: true } : x));
      // #70: 半段已成可闻内容 → looper 独占传输 (覆盖 tab 切走 releaseMic→stopRecord 路径)
      claimLoop();
    }
    recTrackRef.current = -1;
    recStartRef.current = 0;
    overdubActiveRef.current = false;
    countInBeatsRef.current = 0;
    setCountIn(0);
    setRecIsOverdub(false);
    setRecTrackId(-1);
    setWfTick(v => v + 1);
  }, []);

  // 录/叠录切换
  const handlePadTap = (trackId: number) => {
    const track = tracksRef.current[trackId];
    if (recTrackRef.current === trackId) {
      stopRecord();
    } else if (recTrackRef.current >= 0) {
      notifyInfo(t('looper.busy'));
    } else if (track.hasContent) {
      startRecord(trackId);
      notifyInfo(t('looper.overdubbing', { track: track.label }));
    } else {
      startRecord(trackId);
    }
  };

  const handleMute = (id: number) => {
    if (!tracksRef.current[id].hasContent) return;
    const cur = tracksRef.current[id].state;
    const next = cur === 'muted' ? 'playing' : 'muted';
    setTracks(prev => prev.map(x => x.id === id ? { ...x, state: next } : x));
    if (sourcesRef.current[id]) { try { sourcesRef.current[id]!.stop(); } catch {} sourcesRef.current[id] = null; }
  };

  const handleSolo = (id: number) => {
    if (!tracksRef.current[id].hasContent) return;
    const cur = tracksRef.current[id].state;
    if (cur === 'solo') {
      setTracks(prev => prev.map(x => x.hasContent ? { ...x, state: 'playing' } : x));
    } else {
      setTracks(prev => prev.map(x => x.id === id ? { ...x, state: 'solo' } : (x.hasContent ? { ...x, state: 'muted' } : x)));
    }
    for (let i = 0; i < MAX_TRACKS; i++) {
      if (i !== id && sourcesRef.current[i]) { try { sourcesRef.current[i]!.stop(); } catch {} sourcesRef.current[i] = null; }
    }
  };

  const handleClear = (id: number) => {
    if (sourcesRef.current[id]) { try { sourcesRef.current[id]!.stop(); } catch {} sourcesRef.current[id] = null; }
    buffersRef.current[id] = new Float32Array(0);
    audioBufRef.current[id] = null;
    setTracks(prev => prev.map(x => x.id === id ? { ...x, hasContent: false, state: 'idle' } : x));
  };

  const handleUndo = () => {
    const undo = undoRef.current;
    if (!undo) { notifyInfo(t('looper.noUndo')); return; }
    buffersRef.current[undo.trackId] = undo.data;
    undoRef.current = null;
    setWfTick(v => v + 1);
    notifyOk(t('looper.undone'));
  };

  const handleClearAll = () => {
    stopAll();
    for (let i = 0; i < MAX_TRACKS; i++) { buffersRef.current[i] = new Float32Array(0); audioBufRef.current[i] = null; }
    undoRef.current = null;
    loopLenRef.current = 0;
    loopTempoRef.current = 120;
    setLoopTempo(0);
    setTracks(prev => prev.map(x => ({ ...x, hasContent: false, state: 'idle', gain: 0.8 })));
    setMasterVol(0.8);
    if (masterGainRef.current) masterGainRef.current.gain.value = 0.8;
  };

  const handleSaveMix = () => {
    const any = buffersRef.current.some(b => b.length > 0);
    if (!any) { notifyErr(t('looper.noTracks')); return; }
    const len = buffersRef.current.find(b => b.length > 0)!.length;
    const channels = [new Float32Array(len), new Float32Array(len)];
    for (let i = 0; i < MAX_TRACKS; i++) {
      const b = buffersRef.current[i];
      if (b.length === 0) continue;
      const g = tracksRef.current[i].gain;
      if (tracksRef.current[i].state === 'muted') continue;
      for (let j = 0; j < len; j++) { channels[0][j] += b[j] * g; channels[1][j] += b[j] * g; }
    }
    // F 批 #6: 求和后导出前软归一 → 防 encodeWavPCM16 二次硬钳位截成方波
    softNormalize(channels[0]); softNormalize(channels[1]);
    const sr = ctxRef.current?.sampleRate ?? 44100;
    download(encodeWavPCM16(channels, sr), mixFileName());
    notifyOk(t('looper.mixSaved'));
  };

  const handleMasterVol = (v: number) => {
    setMasterVol(v);
    if (masterGainRef.current) masterGainRef.current.gain.value = v;
  };

  // ── 槽位: 保存 / 载入 / 删除 (IndexedDB) ──
  const refreshSlots = useCallback(async () => {
    try {
      const list = await listLoopSlots();
      const m: Record<number, LoopSlotMeta> = {};
      for (const s of list) m[s.slot] = s;
      setSlotMeta(m);
    } catch { setSlotMeta({}); }
  }, []);

  useEffect(() => { if (showFiles) refreshSlots(); }, [showFiles, refreshSlots]);

  const saveToSlot = async (slot: number) => {
    if (loopTempoRef.current === 0 || loopLenRef.current === 0) { notifyErr(t('looper.noLoopToSave')); return; }
    if (recTrackRef.current >= 0) stopRecord();
    const tracksData: LoopTrackData[] = [];
    for (let i = 0; i < MAX_TRACKS; i++) {
      const b = buffersRef.current[i];
      tracksData.push({ data: b.length > 0 ? b.slice() : null, gain: tracksRef.current[i].gain });
    }
    const session: LoopSession = {
      slot, bars: barsRef.current, timeSig: sigRef.current, bpm: bpmRef.current,
      loopTempo: loopTempoRef.current, masterVol, tracks: tracksData, savedAt: new Date().toISOString(),
      // 保留已命名的槽位名称 (save 整包覆盖时不丢 name)
      name: slotMeta[slot]?.name,
    };
    try {
      await saveLoopSlot(session);
      notifyOk(t('looper.slotSaved', { n: slot }));
      refreshSlots();
    } catch { notifyErr(t('looper.mixFail')); }
  };

  const loadFromSlot = async (slot: number) => {
    let session: LoopSession | null = null;
    try { session = await loadLoopSlot(slot); } catch {}
    if (!session) return;
    stopAll();
    // 恢复参数
    setBars(session.bars);
    setTimeSig(session.timeSig);
    setBpm(session.bpm);
    setLoopTempo(session.loopTempo);
    loopTempoRef.current = session.loopTempo;
    setMasterVol(session.masterVol);
    if (masterGainRef.current) masterGainRef.current.gain.value = session.masterVol;
    // 恢复轨道 (不足 loop 长度补零对齐)
    const tracksData = session.tracks ?? [];
    let loopLen = 0;
    for (const td of tracksData) if (td.data && td.data.length > 0) { loopLen = td.data.length; break; }
    loopLenRef.current = loopLen;
    const ui: TrackUI[] = [];
    for (let i = 0; i < MAX_TRACKS; i++) {
      const td = tracksData[i];
      let data: Float32Array | null = null;
      if (td && td.data && td.data.length > 0) {
        data = td.data;
        if (loopLen > 0 && data.length < loopLen) { const pad = new Float32Array(loopLen); pad.set(data); data = pad; }
        buffersRef.current[i] = data;
      } else {
        buffersRef.current[i] = new Float32Array(0);
      }
      audioBufRef.current[i] = null;
      ui.push({ id: i, label: TRACK_LABELS[i], color: TRACK_COLORS[i], state: data ? 'playing' : 'idle', hasContent: !!data, gain: td ? td.gain : 0.8 });
    }
    setTracks(ui);
    setWfTick(v => v + 1);
    notifyOk(t('looper.slotLoaded', { n: slot }));
    setShowFiles(false);
  };

  // C15: 删除槽位需二次确认 (点第一次进入 armed 3s, 再点执行)
  const requestDeleteSlot = async (slot: number) => {
    if (delArmedSlot !== slot) {
      setDelArmedSlot(slot);
      if (delSlotTimerRef.current) clearTimeout(delSlotTimerRef.current);
      delSlotTimerRef.current = setTimeout(() => setDelArmedSlot(null), 3000);
      return;
    }
    if (delSlotTimerRef.current) clearTimeout(delSlotTimerRef.current);
    setDelArmedSlot(null);
    try { await deleteLoopSlot(slot); notifyOk(t('looper.slotDeleted', { n: slot })); } catch {}
    refreshSlots();
  };

  // C15: 提交槽位命名
  const commitSlotName = async (slot: number) => {
    const name = slotNameVal.trim();
    setRenamingSlot(null);
    if (!name) return;
    try { await renameLoopSlot(slot, name); refreshSlots(); } catch {}
  };

  useEffect(() => () => { if (delSlotTimerRef.current) clearTimeout(delSlotTimerRef.current); }, []);

  // 释放麦克风 (停录音 + 断流), 但保留已录循环播放
  const releaseMic = useCallback(() => {
    if (recTrackRef.current >= 0) stopRecord();
    if (procRef.current) { try { procRef.current.disconnect(); } catch {} procRef.current = null; }
    if (micSourceRef.current) { try { micSourceRef.current.disconnect(); } catch {} micSourceRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach(x => x.stop()); streamRef.current = null; }
    setLevel(0);
  }, [stopRecord]);

  // 生命周期
  useEffect(() => {
    return () => {
      stopAll();
      releaseMic();
      if (wfTimerRef.current) clearInterval(wfTimerRef.current);
      ctxRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 离开本 tab: 停麦保播放 (避免与其他面板麦克风冲突)
  useEffect(() => { if (!active) releaseMic(); }, [active, releaseMic]);
  // 关闭工作室: 全停
  useEffect(() => { if (!visible) { stopAll(); releaseMic(); } }, [visible, stopAll, releaseMic]);

  // 录音时波形定时刷新
  useEffect(() => {
    if (recTrackId >= 0) {
      wfTimerRef.current = setInterval(() => setWfTick(v => v + 1), 150);
    }
    return () => { if (wfTimerRef.current) { clearInterval(wfTimerRef.current); wfTimerRef.current = null; } };
  }, [recTrackId]);

  const hasContent = tracks.some(x => x.hasContent);
  const hasLoop = loopTempo > 0;
  const curBar = Math.min(bars, Math.floor(progress * bars) + 1);
  const [nSig, dSig] = timeSig;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 12px 14px', height: '100%', boxSizing: 'border-box' }}>
      {/* 顶部传输行已下移 → 底部 TransportDock (F 批 #4); 参数行 1 直接起 */}
      {/* 参数行 1: BPM + GRID + CLICK */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{
          background: 'rgba(255,80,200,0.07)', border: '1px solid rgba(255,80,200,0.22)',
          borderRadius: 8, padding: '4px 8px', display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <span style={{ fontSize: 10.5, color: 'rgba(255,120,200,0.75)', fontFamily: '"Barlow-Regular_2",sans-serif', letterSpacing: '0.12em' }}>BPM</span>
          <button onClick={() => setBpm(Math.max(30, bpm - 1))} style={miniBtn}>−</button>
          <span style={{ fontSize: 15, fontWeight: 800, color: 'rgb(255,80,200)', fontFamily: '"Barlow-Regular_2",sans-serif', minWidth: 34, textAlign: 'center', textShadow: '0 0 10px rgba(255,80,200,0.5)' }}>{bpm}</span>
          <button onClick={() => setBpm(Math.min(260, bpm + 1))} style={miniBtn}>+</button>
        </div>
        {hasLoop && (
          <div style={{ background: 'rgba(255,200,60,0.07)', border: '1px solid rgba(255,200,60,0.25)', borderRadius: 8, padding: '4px 8px', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 10.5, color: 'rgba(255,200,60,0.6)', fontFamily: '"Barlow-Regular_2",sans-serif', letterSpacing: '0.08em' }}>GRID</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'rgb(255,200,80)', fontFamily: '"Barlow-Regular_2",sans-serif' }}>{loopTempo}</span>
          </div>
        )}
        <div style={{ flex: 1 }} />
        {/* C22: 预备拍开关 (关 / 1小节) — 开则按拍号数一整小节再开录 */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0,
          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(120,120,130,0.18)',
          borderRadius: 6, padding: 2,
        }}>
          <span style={{
            fontSize: 10.5, color: 'rgba(160,160,170,0.65)', fontFamily: '"Barlow-Regular_2",sans-serif',
            letterSpacing: '0.06em', padding: '0 4px',
          }}>{t('looper.countIn')}</span>
          <button onClick={() => setCountInOn(false)} style={{
            height: 20, borderRadius: 4, cursor: 'pointer', padding: '0 7px',
            background: !countInOn ? 'rgba(255,80,200,0.18)' : 'transparent',
            border: !countInOn ? '1px solid rgba(255,80,200,0.5)' : '1px solid transparent',
            color: !countInOn ? 'rgb(255,80,200)' : 'rgba(160,160,170,0.55)',
            fontSize: 10.5, fontWeight: 700, fontFamily: '"Barlow-Regular_2",sans-serif',
          }}>{t('looper.countOff')}</button>
          <button onClick={() => setCountInOn(true)} style={{
            height: 20, borderRadius: 4, cursor: 'pointer', padding: '0 7px',
            background: countInOn ? 'rgba(255,80,200,0.18)' : 'transparent',
            border: countInOn ? '1px solid rgba(255,80,200,0.5)' : '1px solid transparent',
            color: countInOn ? 'rgb(255,80,200)' : 'rgba(160,160,170,0.55)',
            fontSize: 10.5, fontWeight: 700, fontFamily: '"Barlow-Regular_2",sans-serif',
          }}>{t('looper.countBar1')}</button>
        </div>
        <button onClick={() => setPlayClick(v => !v)} style={{
          height: 26, borderRadius: 6, cursor: 'pointer', padding: '0 10px',
          background: playClick ? 'rgba(255,80,200,0.16)' : 'transparent',
          border: `1px solid ${playClick ? 'rgba(255,80,200,0.55)' : 'rgba(120,120,130,0.25)'}`,
          color: playClick ? 'rgb(255,80,200)' : 'rgba(160,160,170,0.55)',
          fontSize: 10.5, fontWeight: 700, letterSpacing: '0.1em', fontFamily: '"Barlow-Regular_2",sans-serif',
        }}>♪ {t('looper.playClick')}</button>
      </div>

      {/* 参数行 2: BARS + SIG */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <span style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.3)', fontFamily: '"Barlow-Regular_2",sans-serif', letterSpacing: '0.1em', marginRight: 2 }}>BARS</span>
          {BAR_CHOICES.map(b => (
            <button key={b} onClick={() => setBars(b)} style={{
              height: 24, borderRadius: 5, cursor: 'pointer', padding: '0 10px',
              background: bars === b ? 'rgba(255,80,200,0.14)' : 'transparent',
              border: `1px solid ${bars === b ? 'rgba(255,80,200,0.5)' : 'rgba(120,120,130,0.2)'}`,
              color: bars === b ? 'rgb(255,80,200)' : 'rgba(160,160,170,0.5)',
              fontSize: 10.5, fontWeight: 700, fontFamily: '"Barlow-Regular_2",sans-serif',
            }}>{b}</button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          {SIG_CHOICES.map(([a, b]) => {
            const sel = a === nSig && b === dSig;
            return (
              <button key={`${a}/${b}`} onClick={() => setTimeSig([a, b])} style={{
                height: 24, borderRadius: 5, cursor: 'pointer', padding: '0 8px',
                background: sel ? 'rgba(255,80,200,0.14)' : 'transparent',
                border: `1px solid ${sel ? 'rgba(255,80,200,0.5)' : 'rgba(120,120,130,0.2)'}`,
                color: sel ? 'rgb(255,80,200)' : 'rgba(160,160,170,0.5)',
                fontSize: 10.5, fontWeight: 700, fontFamily: '"Barlow-Regular_2",sans-serif',
              }}>{a}/{b}</button>
            );
          })}
        </div>
      </div>

      {/* 电平条 */}
      <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${level * 100}%`, background: 'linear-gradient(90deg, rgb(60,255,160), rgb(255,200,60), rgb(255,80,80))', transition: 'width 0.05s' }} />
      </div>

      {/* 预备拍 (等小节线 / 倒计时) / 播放进度 */}
      {countIn === -1 ? (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 22,
          background: 'rgba(255,80,200,0.08)', border: '1px solid rgba(255,80,200,0.3)', borderRadius: 6,
        }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'rgb(255,200,80)', animation: 'blink 0.5s infinite' }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,170,120,0.9)', fontFamily: '"Barlow-Regular_2",sans-serif', letterSpacing: '0.12em' }}>
            {t('looper.countWait')} · {t('looper.countBar1')}
          </span>
        </div>
      ) : countIn > 0 ? (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 22,
          background: 'rgba(255,80,200,0.1)', border: '1px solid rgba(255,80,200,0.35)', borderRadius: 6,
        }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'rgb(255,60,60)', animation: 'blink 0.5s infinite' }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: 'rgb(255,120,180)', fontFamily: '"Barlow-Regular_2",sans-serif', letterSpacing: '0.15em' }}>
            {t('looper.countIn')} · {countIn}
          </span>
        </div>
      ) : null}
      {/* 播放进度条已下移 → 底部 TransportDock 行 2 (F 批 #4) */}

      {/* 轨道列表 (可滚) */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, paddingRight: 2 }}>
        {tracks.map((track, i) => {
          const isRec = recTrackId === track.id;
          const isRecOther = recTrackId >= 0 && !isRec;
          const padColor = countIn > 0 && isRec
            ? 'rgb(255,120,120)'
            : isRec
              ? (recIsOverdub ? 'rgb(255,170,60)' : 'rgb(255,60,60)')
              : track.hasContent
                ? (track.state === 'muted' ? 'rgba(140,140,150,0.6)' : track.state === 'solo' ? 'rgb(255,210,90)' : 'rgb(80,230,160)')
                : 'rgba(255,255,255,0.4)';
          const padLabel = isRec ? (recIsOverdub ? 'OVD' : 'REC') : track.hasContent ? (track.state === 'muted' ? 'MUT' : track.state === 'solo' ? 'SOLO' : '▶') : 'REC';
          return (
            <div key={track.id} style={{
              display: 'flex', alignItems: 'center', gap: 8, borderRadius: 10, padding: 6,
              background: isRec ? `${track.color}1f` : `${track.color}0d`,
              border: `1px solid ${isRec ? track.color : `${track.color}2e`}`,
              boxShadow: isRec ? `0 0 12px ${track.color}40` : 'none',
              opacity: isRecOther ? 0.5 : 1,
              transition: 'all 0.12s',
            }}>
              {/* 色垫 (点击 = 录/叠录/停) */}
              <button onClick={() => handlePadTap(track.id)} style={{
                width: 52, height: 52, borderRadius: 9, cursor: 'pointer', flexShrink: 0, padding: 0,
                position: 'relative',
                background: isRec
                  ? `radial-gradient(circle at 50% 45%, ${track.color}59, ${track.color}14)`
                  : track.hasContent
                    ? `radial-gradient(circle at 50% 45%, ${track.color}2b, rgba(20,24,34,0.7))`
                    : 'rgba(20,24,34,0.55)',
                border: `1.5px solid ${isRec ? track.color : track.hasContent ? `${track.color}52` : 'rgba(255,255,255,0.1)'}`,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
              }}>
                {countIn > 0 && isRec ? (
                  <span key={`ov-${countIn}`} style={{
                    position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    pointerEvents: 'none',
                  }}>
                    <span key={countIn} style={{
                      fontSize: 30, fontWeight: 800, lineHeight: 1, color: padColor,
                      fontFamily: '"Barlow-Regular_2",sans-serif', textShadow: `0 0 12px ${padColor}`,
                      animation: 'countPop 0.5s ease-out',
                    }}>{countIn}</span>
                  </span>
                ) : (
                  <>
                    <span style={{
                      fontSize: 11, fontWeight: 800, letterSpacing: '0.1em',
                      color: padColor, fontFamily: '"Barlow-Regular_2",sans-serif',
                      textShadow: isRec ? `0 0 10px ${padColor}` : 'none',
                    }}>{padLabel}</span>
                    {isRec && <span style={{ width: 7, height: 7, borderRadius: '50%', background: recIsOverdub ? 'rgb(255,170,60)' : 'rgb(255,60,60)', animation: 'blink 0.5s infinite' }} />}
                  </>
                )}
              </button>

              {/* 中列: 标签 + 波形 + 播放头 */}
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: padColor, fontFamily: '"Barlow-Regular_2",sans-serif', whiteSpace: 'nowrap' }}>{track.label}</span>
                  {isRec && (
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: padColor, fontFamily: '"Barlow-Regular_2",sans-serif', letterSpacing: '0.08em' }}>
                      BAR {curBar}/{bars}
                    </span>
                  )}
                </div>
                <div style={{ position: 'relative', height: 22, borderRadius: 4, overflow: 'hidden', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <Waveform data={track.hasContent && buffersRef.current[i].length > 0 ? buffersRef.current[i] : null} color={track.color} height={22} refresh={wfTick} />
                  {isRunning && !isRec && (
                    <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${progress * 100}%`, width: 1.5, background: 'rgba(255,255,255,0.9)', boxShadow: '0 0 4px #fff' }} />
                  )}
                </div>
              </div>

              {/* 控制列: M/S/× + 音量 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flexShrink: 0 }}>
                <div style={{ display: 'flex', gap: 3 }}>
                  <button onClick={() => handleMute(track.id)} disabled={!track.hasContent} title={t('btn.mute')} style={{
                    width: 22, height: 22, borderRadius: 4, cursor: track.hasContent ? 'pointer' : 'default',
                    background: track.state === 'muted' ? `${track.color}24` : 'transparent',
                    border: `1px solid ${track.state === 'muted' ? track.color : `${track.color}40`}`,
                    color: track.state === 'muted' ? track.color : `${track.color}99`,
                    fontSize: 10.5, fontWeight: 800, lineHeight: 1, opacity: track.hasContent ? 1 : 0.4,
                    fontFamily: '"Barlow-Regular_2",sans-serif',
                  }}>M</button>
                  <button onClick={() => handleSolo(track.id)} disabled={!track.hasContent} title={t('btn.solo')} style={{
                    width: 22, height: 22, borderRadius: 4, cursor: track.hasContent ? 'pointer' : 'default',
                    background: track.state === 'solo' ? `${track.color}24` : 'transparent',
                    border: `1px solid ${track.state === 'solo' ? track.color : `${track.color}40`}`,
                    color: track.state === 'solo' ? track.color : `${track.color}99`,
                    fontSize: 10.5, fontWeight: 800, lineHeight: 1, opacity: track.hasContent ? 1 : 0.4,
                    fontFamily: '"Barlow-Regular_2",sans-serif',
                  }}>S</button>
                  <button onClick={() => handleClear(track.id)} disabled={!track.hasContent} title={t('looper.clearAll')} style={{
                    width: 22, height: 22, borderRadius: 4, cursor: track.hasContent ? 'pointer' : 'default',
                    background: 'transparent', border: '1px solid rgba(255,255,255,0.15)',
                    color: 'rgba(255,255,255,0.45)', fontSize: 11, lineHeight: 1, opacity: track.hasContent ? 1 : 0.35,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '"Barlow-Regular_2",sans-serif',
                  }}>×</button>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                  <span style={{ fontSize: 10.5, color: `${track.color}88`, fontFamily: '"Barlow-Regular_2",sans-serif' }}>LV</span>
                  <input type="range" min={0} max={1} step={0.01} value={track.gain} disabled={!track.hasContent}
                    onChange={e => {
                      const v = Number(e.target.value);
                      setTracks(prev => prev.map(x => x.id === track.id ? { ...x, gain: v } : x));
                    }}
                    style={{ width: 58, accentColor: track.color, height: 2, opacity: track.hasContent ? 1 : 0.4 }} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 主音量 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.3)', fontFamily: '"Barlow-Regular_2",sans-serif', letterSpacing: '0.12em' }}>MASTER</span>
        <input type="range" min={0} max={1} step={0.01} value={masterVol} onChange={e => handleMasterVol(Number(e.target.value))} style={{ flex: 1, accentColor: 'rgb(255,80,200)', height: 2 }} />
        <span style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.3)', fontFamily: '"Barlow-Regular_2",sans-serif', minWidth: 26, textAlign: 'right' }}>{Math.round(masterVol * 100)}</span>
      </div>

      {/* 状态/帮助 */}
      <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.25)', fontFamily: '"Barlow-Regular_2",sans-serif', textAlign: 'center', lineHeight: 1.5 }}>
        {countIn > 0
          ? `● ${t('looper.countIn')}`
          : countIn === -1
            ? `… ${t('looper.countWait')} · ${t('looper.countBar1')}`
            : recTrackId >= 0
              ? (recIsOverdub ? t('looper.overdubNow') : t('looper.recordingNow'))
              : isRunning
                ? `${t('looper.playingNow')} · ${bars} ${t('looper.bars')}`
                : (hasLoop ? `${t('looper.loopLength')} · ${bars} ${t('looper.bars')}` : t('looper.help'))}
      </div>

      {/* 槽位弹层 */}
      {showFiles && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 70, background: 'rgba(0,0,0,0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }} onClick={() => setShowFiles(false)}>
          <div onClick={e => e.stopPropagation()} style={{
            background: '#232428', border: '1px solid #3f4045', borderRadius: 16, padding: 16,
            width: '100%', maxWidth: 380, display: 'flex', flexDirection: 'column', gap: 10,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.18em', color: 'rgb(120,220,255)', fontFamily: '"Barlow-Regular_2",sans-serif' }}>
                ☰ {t('looper.files')}
              </span>
              <button onClick={() => setShowFiles(false)} style={{ width: 28, height: 28, borderRadius: 6, cursor: 'pointer', background: 'rgba(255,255,255,0.06)', border: '1px solid #3a3b40', color: 'rgba(255,255,255,0.7)', fontSize: 15, lineHeight: 1, fontFamily: '"Barlow-Regular_2",sans-serif' }}>×</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, maxHeight: 380, overflowY: 'auto' }}>
              {Array.from({ length: 10 }, (_, i) => i + 1).map(slot => {
                const meta = slotMeta[slot];
                return (
                  <div key={slot} style={{
                    borderRadius: 10, padding: 8, display: 'flex', flexDirection: 'column', gap: 5,
                    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ width: 20, height: 20, borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: '#27292f', background: 'rgb(120,220,255)', fontFamily: '"Barlow-Regular_2",sans-serif', flexShrink: 0 }}>{slot}</span>
                      {meta ? (
                        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                          {renamingSlot === slot ? (
                            <div style={{ display: 'flex', gap: 3 }}>
                              <input autoFocus value={slotNameVal}
                                onChange={e => setSlotNameVal(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') commitSlotName(slot); }}
                                style={{ flex: 1, height: 20, borderRadius: 4, border: '1px solid rgba(120,220,255,0.5)', background: '#252831', color: '#fff', fontSize: 11, padding: '0 5px', fontFamily: '"Barlow-Regular_2",sans-serif', minWidth: 0 }}
                              />
                              <button onClick={() => commitSlotName(slot)} style={{ height: 20, padding: '0 7px', borderRadius: 4, cursor: 'pointer', background: 'rgba(120,220,255,0.15)', border: '1px solid rgba(120,220,255,0.45)', color: '#7fd8ff', fontSize: 10.5, fontFamily: '"Barlow-Regular_2",sans-serif' }}>{t('btn.ok')}</button>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 3, minWidth: 0 }}>
                              <span style={{ flex: 1, fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.85)', fontFamily: '"Barlow-Regular_2",sans-serif', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {meta.name || `LOOP ${slot}`}
                              </span>
                              <button title={t('looper.renameSlot')} onClick={() => { setRenamingSlot(slot); setSlotNameVal(meta.name ?? ''); }} style={{ width: 18, height: 18, borderRadius: 4, cursor: 'pointer', background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, padding: 0 }}>
                                <svg width={9} height={9} viewBox="0 0 12 12"><path d="M8.5 1.5l2 2L4 10H2V8L8.5 1.5z" fill="none" stroke="currentColor" strokeWidth="1.2" /></svg>
                              </button>
                            </div>
                          )}
                          <span style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.35)', fontFamily: '"Barlow-Regular_2",sans-serif' }}>
                            {meta.trackCount} {t('looper.tracks')} · {meta.bars} {t('looper.bars')} · {new Date(meta.savedAt).toLocaleString().slice(0, 16)}
                          </span>
                        </div>
                      ) : (
                        <span style={{ fontSize: 10.5, fontWeight: 700, color: 'rgba(255,255,255,0.3)', fontFamily: '"Barlow-Regular_2",sans-serif' }}>
                          {t('looper.slotEmpty')}
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button onClick={() => loadFromSlot(slot)} disabled={!meta} style={{
                        flex: 1, height: 22, borderRadius: 4, cursor: meta ? 'pointer' : 'default',
                        background: meta ? 'rgba(60,220,100,0.12)' : 'transparent', border: `1px solid ${meta ? 'rgba(60,220,100,0.4)' : 'rgba(255,255,255,0.1)'}`,
                        color: meta ? 'rgb(90,230,130)' : 'rgba(255,255,255,0.2)', fontSize: 10.5, fontWeight: 700, fontFamily: '"Barlow-Regular_2",sans-serif',
                        opacity: meta ? 1 : 0.5,
                      }}>{t('looper.loadSlot')}</button>
                      <button onClick={() => saveToSlot(slot)} style={{
                        flex: 1, height: 22, borderRadius: 4, cursor: 'pointer',
                        background: 'rgba(76,201,240,0.1)', border: '1px solid rgba(76,201,240,0.35)',
                        color: 'rgb(120,220,255)', fontSize: 10.5, fontWeight: 700, fontFamily: '"Barlow-Regular_2",sans-serif',
                      }}>{t('looper.saveSlot')}</button>
                      <button onClick={() => requestDeleteSlot(slot)} disabled={!meta} style={{
                        width: delArmedSlot === slot ? 40 : 22, height: 22, borderRadius: 4, cursor: meta ? 'pointer' : 'default',
                        background: delArmedSlot === slot ? 'rgba(255,80,80,0.22)' : 'transparent',
                        border: `1px solid ${delArmedSlot === slot ? 'rgba(255,80,80,0.75)' : meta ? 'rgba(255,80,80,0.4)' : 'rgba(255,255,255,0.1)'}`,
                        color: delArmedSlot === slot ? 'rgb(255,140,140)' : meta ? 'rgba(255,110,110,0.8)' : 'rgba(255,255,255,0.2)',
                        fontSize: delArmedSlot === slot ? 7.5 : 11, fontWeight: 800, lineHeight: 1,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '"Barlow-Regular_2",sans-serif',
                        opacity: meta ? 1 : 0.5,
                      }}>{delArmedSlot === slot ? '确认?' : '×'}</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* F 批 #4: 底部 TransportDock — 主传输 ▶/■ + 状态徽标 + ⋯菜单 + 只读循环进度条 */}
      <TransportDock accent="rgb(255,80,200)">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <DockPlayBtn
            playing={isRunning}
            onClick={toggleLoopPlayback}
            accent="rgb(255,80,200)"
            label={isRunning ? t('btn.stop') : t('btn.play')}
            disabled={!isRunning && recTrackId < 0 && !hasLoop}
          />
          {isRunning && (
            <span style={{
              fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', fontFamily: '"Barlow-Regular_2",sans-serif',
              color: recTrackId >= 0 ? (recIsOverdub ? 'rgb(255,170,60)' : 'rgb(255,80,80)') : 'rgba(255,80,200,0.85)',
              display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap',
            }}>
              <span style={{
                width: 6, height: 6, borderRadius: '50%', background: 'currentColor',
                animation: recTrackId >= 0 ? 'blink 0.6s infinite' : 'none', flexShrink: 0,
              }} />
              {recTrackId >= 0 ? (recIsOverdub ? 'OVD' : 'REC') : t('looper.playingNow')}
            </span>
          )}
          <div style={{ flex: 1 }} />
          <OverflowMenu actions={[
            { key: 'undo', label: t('looper.undo'), onClick: () => handleUndo() },
            { key: 'saveMix', label: t('looper.saveMix'), color: 'rgb(255,140,220)', onClick: () => handleSaveMix() },
            { key: 'clearAll', label: t('looper.clearAll'), danger: true, onClick: () => handleClearAll() },
            { key: 'files', label: t('looper.files'), color: 'rgb(140,220,255)', onClick: () => setShowFiles(true) },
          ]} />
        </div>
        {/* 只读循环进度条 (含 REC/OVD/PLAY · BAR 状态文字) */}
        {isRunning && (
          <div style={{ position: 'relative', height: 12, borderRadius: 4, overflow: 'hidden', background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,80,200,0.2)' }}>
            <div style={{ height: '100%', width: `${progress * 100}%`, background: 'linear-gradient(90deg, rgba(255,80,200,0.85), rgba(255,150,120,0.95))', transition: 'width 0.03s linear' }} />
            <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${progress * 100}%`, width: 1.5, background: 'rgba(255,255,255,0.95)', boxShadow: '0 0 5px #fff' }} />
            <span style={{
              position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
              fontSize: 10.5, fontWeight: 700, color: 'rgba(255,255,255,0.9)', fontFamily: '"Barlow-Regular_2",sans-serif', letterSpacing: '0.08em',
              textShadow: '0 1px 2px rgba(0,0,0,0.8)', whiteSpace: 'nowrap',
            }}>
              {recTrackId >= 0 ? (recIsOverdub ? 'OVD' : 'REC') : 'PLAY'} · BAR {curBar}/{bars}
            </span>
          </div>
        )}
      </TransportDock>
    </div>
  );
}

const miniBtn: React.CSSProperties = {
  width: 22, height: 22, borderRadius: 5, cursor: 'pointer',
  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)',
  color: 'rgba(255,255,255,0.8)', fontSize: 13, lineHeight: 1,
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
  fontFamily: '"Barlow-Regular_2",sans-serif',
};
