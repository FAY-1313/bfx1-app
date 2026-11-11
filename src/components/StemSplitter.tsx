/**
 * StemSplitter — AI 分轨. 两种模式:
 * - 4 轨端侧: Spleeter 5stems ONNX 跑本地 Web Worker (onnxruntime-web wasm), 离线.
 *   首次使用加载 4 个模型 (~76MB), 之后复用缓存. (无吉他/钢琴模型)
 * - 6 轨云端: 直连自建 stem-split-server (FastAPI + Demucs htdemucs_6s) 返回 ZIP,
 *   含 guitar.wav + piano.wav → 6 轨 (vocals/drums/bass/guitar/piano/other).
 *   服务器地址已预填默认值, 无需输入; 失败时可弹卡片改一次, 自动记住.
 *
 * 结果渲染为混音台: 静音/独奏 · 音量 · 波形 · 单轨/全部导出; 底部浮动传输条:
 * ORIGINAL/STEMS 切换 · 可拖动进度条 seek · 播放/停止 · 关闭(停止并清空).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { notifyOk, notifyErr, notifyWarn, notifyInfo } from '../services/feedback';
import JSZip from 'jszip';
import { useI18n } from '../i18n';
import Waveform from './Waveform';
import { getSynthCtx } from '../utils/audioSynth';
import { encodeWavPCM16 } from '../utils/wav';
import { Chip, IconBtn, SegRow, ProgressBar, fmtDur as fmtClock } from '../ui/controls';
import { getStemWorker, onStemMessage, ensureStemDeviceInit, isStemDeviceReady } from '../services/stemDevice';
import { claimTransport, releaseTransport } from '../utils/transportBus';

interface StemSplitterProps {
  accentColor: string;
  active: boolean;
}

type StemId = 'vocals' | 'drums' | 'bass' | 'other' | 'guitar' | 'piano';
interface StemCfg { id: StemId; color: string; cloudOnly?: boolean }

const STEMS: StemCfg[] = [
  { id: 'vocals', color: 'rgb(180,80,255)' },
  { id: 'drums',  color: 'rgb(255,80,80)'  },
  { id: 'bass',   color: '#4cc9f0'         },
  { id: 'other',  color: 'rgb(100,220,160)'},
  // 吉他/钢琴轨: 仅云端 Demucs htdemucs_6s 可出 (Spleeter 无), 端侧隐藏该行
  { id: 'guitar', color: 'rgb(255,160,80)', cloudOnly: true },
  { id: 'piano',  color: 'rgb(150,170,255)', cloudOnly: true },
];

type Engine = 'device' | 'cloud';

interface StemState {
  muted: boolean;
  solo: boolean;
  gain: number;
}

const DEVICE_TIMEOUT = 240000; // 端侧分离最久等待, 超时转云端
// 云端 Demucs 服务器地址 — 固定生产服务器, 用户无需也不可输入
// 2026-09-02: 生产服务器迁移到腾讯云公网 124.223.119.201:8000 (原局域网 192.168.1.213 为本机联调地址, 手机不可达)
// 2026-09-02 (重做): 移除「服务器地址输入卡」UI — 默认地址永远生效, 失败仅 toast, 不弹配置卡;
//                   不再读 localStorage, 避免用户曾手输错误地址的缓存继续生效
const DEFAULT_SERVER = 'http://124.223.119.201:8000';

// ── 云端结果 ZIP 下载 (带真实进度) ──────────────────────────────────
// 整首歌 6 轨 wav 打包后 ~100-150MB, 服务器出网带宽有限时下载可能持续数分钟.
// 旧实现直接 res.blob() 全程无反馈 — 界面看起来像死掉. 这里用流式读取 +
// content-length 计算真实百分比; 拿不到 content-length 时回退 (进度保持不确定).
const CLOUD_DOWNLOAD_TIMEOUT = 20 * 60 * 1000; // 下载最久 20min (150MB @ 6Mbps ≈ 4min, 余量足)
async function fetchZipWithProgress(url: string, onPct: (p: number | null) => void): Promise<Blob> {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), CLOUD_DOWNLOAD_TIMEOUT);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`download http ${res.status}`);
    const total = Number(res.headers.get('content-length') || 0);
    const body = res.body;
    if (total > 0 && body && typeof body.getReader === 'function') {
      const reader = body.getReader();
      const chunks: BlobPart[] = [];
      let got = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) { chunks.push(value); got += value.byteLength; onPct(Math.min(99, Math.round((got / total) * 100))); }
      }
      onPct(100);
      return new Blob(chunks, { type: 'application/zip' });
    }
    onPct(null); // 无进度信息 → 交由上层显示不确定条 + 计时
    return await res.blob();
  } finally {
    clearTimeout(to);
  }
}

// 画面常亮: 云端分离/下载常达数分钟, 屏幕熄灭后 WebView 定时器会被节流,
// 轮询暂停会让进度看起来卡死. 处理期间请求屏幕常亮 (仅 Android Chrome/WebView 支持, 失败静默).
let wakeLockRef: any = null;
async function acquireWakeLock() {
  try {
    const nav: any = navigator;
    if (!nav.wakeLock?.request) return;
    wakeLockRef = await nav.wakeLock.request('screen');
    wakeLockRef.addEventListener?.('release', () => { wakeLockRef = null; });
  } catch { /* 忽略: 不支持或被拒不影响主流程 */ }
}
function releaseWakeLock() {
  try { wakeLockRef?.release(); } catch { /* noop */ }
  wakeLockRef = null;
}

export default function StemSplitter({ accentColor, active }: StemSplitterProps) {
  const { t } = useI18n();
  const serverUrl = DEFAULT_SERVER; // 固定默认地址; 无输入入口, 失败仅 toast
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState<number | null>(0);
  const [elapsed, setElapsed] = useState(0); // 处理已用秒数 (不确定进度时让界面"活着")
  const [processingLabel, setProcessingLabel] = useState('');
  const [engine, setEngine] = useState<Engine | null>(null); // 最近一次使用的引擎
  const [splitMode, setSplitMode] = useState<'device' | 'cloud'>('cloud'); // 快速(端侧) / 完整(云端)
  // C22: 网络状态 — 离线禁用「完整(云端)」档并自动切回「快速(端侧)」
  const [online, setOnline] = useState<boolean>(() => (typeof navigator !== 'undefined' ? navigator.onLine : true));
  const [deviceReady, setDeviceReady] = useState(isStemDeviceReady());
  const [done, setDone] = useState(false);
  const [masterGain, setMasterGain] = useState(0.8);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isOrigPlaying, setIsOrigPlaying] = useState(false);
  const [playPos, setPlayPos] = useState(0);
  const [playDur, setPlayDur] = useState(0);
  const [playMode, setPlayMode] = useState<'orig' | 'stems'>('stems');

  const [stemStates, setStemStates] = useState<Record<StemId, StemState>>(() => {
    const s = {} as Record<StemId, StemState>;
    for (const cfg of STEMS) s[cfg.id] = { muted: false, solo: false, gain: 0.8 };
    return s;
  });
  // #71: 渲染期镜像 — 事件处理器/音频裁决一律读 stemStatesRef, 不再闭包捕获可能陈旧的 state
  const stemStatesRef = useRef(stemStates);
  stemStatesRef.current = stemStates;
  const [waveData, setWaveData] = useState<Partial<Record<StemId, Float32Array>>>({});

  const masterGainRef = useRef<GainNode | null>(null);
  const stemNodesRef = useRef<Map<StemId, { source: AudioBufferSourceNode | null; gain: GainNode }>>(new Map());
  const stemBuffersRef = useRef<Map<StemId, AudioBuffer> | null>(null);
  const bufFactoryRef = useRef<OfflineAudioContext | null>(null);
  const playStartCtxRef = useRef(0);
  const playOffsetRef = useRef(0);
  const posTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const origSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const origBufRef = useRef<AudioBuffer | null>(null);

  const audioFileRef = useRef<File | null>(null);
  audioFileRef.current = audioFile;
  const serverUrlRef = useRef(DEFAULT_SERVER); // 恒定, 无需每帧同步
  const splitModeRef = useRef(splitMode);
  splitModeRef.current = splitMode;

  // C22: 监听在线/离线 — 离线时云端档禁用; 若当前恰为 cloud 则切回 device
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, []);
  useEffect(() => { if (!online && splitMode === 'cloud') setSplitMode('device'); }, [online, splitMode]);
  const processingRef = useRef(false);
  const deviceOpRef = useRef<{ resolve: (ok: boolean) => void } | null>(null);
  const tRef = useRef(t);
  tRef.current = t;

  // 端侧 (engine='device') 隐藏吉他行 (Spleeter 无吉他模型), 云端 (Demucs) 显示全部
  const displayStems = engine === 'cloud' ? [...STEMS] : STEMS.filter(s => !s.cloudOnly);

  const getBufFactory = () => {
    if (!bufFactoryRef.current) bufFactoryRef.current = new OfflineAudioContext(2, 1, 44100);
    return bufFactoryRef.current;
  };

  // ── Worker 消息路由 ──────────────────────────────────────────────
  useEffect(() => {
    const off = onStemMessage((msg: any) => {
      if (msg?.type === 'progress') {
        if (msg.stage === 'model') { setDeviceReady(false); setProcessingLabel(tRef.current('stem.loadingModel')); setProgress(msg.pct); }
        else if (msg.stage === 'separate') { setProgress(msg.pct); }
      } else if (msg?.type === 'ready') {
        setDeviceReady(true); setProcessingLabel(''); setProgress(0);
      } else if (msg?.type === 'result') {
        deviceOpRef.current?.resolve(true); deviceOpRef.current = null;
        handleResult(msg);
      } else if (msg?.type === 'error') {
        deviceOpRef.current?.resolve(false); deviceOpRef.current = null;
      }
    });
    return off;
  }, []);

  // 处理期间 1s 计时 (不确定进度条的"存活证明"); 结束/失败自动归零
  useEffect(() => {
    if (!processing) { setElapsed(0); return; }
    const t0 = Date.now();
    const iv = setInterval(() => setElapsed(Math.floor((Date.now() - t0) / 1000)), 500);
    return () => clearInterval(iv);
  }, [processing]);
  const fmtElapsed = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  // #71 (单事实源): 一切改轨操作 → 显式算 next → 立即刷音频 + setState.
  // 旧实现: updateStem() 后立刻 updatePlayState(), 但后者闭包读到的 stemStates 仍是
  // setState 落定前的旧值 → MUTE/SOLO/音量实际不生效或晚一拍 (串线 bug 根源).
  const setStem = (id: StemId, patch: Partial<StemState>) => {
    const cur = stemStatesRef.current;
    const next = { ...cur, [id]: { ...cur[id], ...patch } };
    stemStatesRef.current = next;
    setStemStates(next);
    applyMix(next);
  };

  /** 给定一份轨状态, 判断某轨此刻是否出声 — 唯一出声裁决: MUTE 优先拦截, 其次 SOLO 过滤. */
  const audibleOf = (states: Record<StemId, StemState>, id: StemId): boolean => {
    const s = states[id];
    if (!s || s.muted) return false;
    return Object.values(states).some(x => x.solo) ? s.solo : true;
  };

  /** #71: 唯一音频裁决入口 — 按传入(最新)状态把每轨 gain 平滑渐变到应有值. */
  const applyMix = (states: Record<StemId, StemState>) => {
    const nodes = stemNodesRef.current;
    if (!nodes || nodes.size === 0) return;
    const t0 = getSynthCtx().currentTime + 0.02;
    for (const cfg of STEMS) {
      const node = nodes.get(cfg.id);
      if (!node) continue;
      const audible = audibleOf(states, cfg.id);
      node.gain.gain.cancelScheduledValues(t0);
      node.gain.gain.setValueAtTime(node.gain.gain.value, t0);
      node.gain.gain.linearRampToValueAtTime(audible ? states[cfg.id].gain : 0, t0 + 0.05);
    }
  };

  // ── 文件选择 ─────────────────────────────────────────────────────
  const handleSelectFile = () => {
    if (processing) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'audio/*';
    input.onchange = (e: any) => {
      const file = e.target?.files?.[0] as File | undefined;
      if (!file) return;
      setAudioFile(file);
      setDone(false);
      setProgress(0);
      setWaveData({});
      setEngine(null);
      stopEverything();
      // 预解码原曲, 供浮动条 ORIGINAL 播放
      origBufRef.current = null;
      file.arrayBuffer()
        .then(ab => getBufFactory().decodeAudioData(ab))
        .then(buf => { origBufRef.current = buf; })
        .catch(() => { origBufRef.current = null; });
      notifyOk(t('stem.loaded', { name: file.name }));
    };
    input.click();
  };

  // ── 端侧分离 (返回是否成功) ───────────────────────────────────────
  const processDevice = useCallback((file: File): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      (async () => {
        try {
          const count = await ensureStemDeviceInit();
          if (count < 4) return resolve(false);
          const decoded = await getBufFactory().decodeAudioData(await file.arrayBuffer());
          const ch = Math.min(2, decoded.numberOfChannels);
          const L = decoded.getChannelData(0);
          const R = ch === 2 ? decoded.getChannelData(1) : null;
          const outLen = decoded.length;
          const durSec = outLen / 44100;
          if (durSec > 120) notifyWarn(t('stem.longWarn'));
          const pcm = new Float32Array(outLen * ch);
          for (let i = 0; i < outLen; i++) {
            pcm[i * ch] = L[i];
            if (R) pcm[i * ch + 1] = R[i];
          }
          let settled = false;
          const finish = (ok: boolean) => { if (settled) return; settled = true; clearTimeout(to); resolve(ok); };
          const to = setTimeout(() => finish(false), DEVICE_TIMEOUT);
          deviceOpRef.current = { resolve: finish };
          getStemWorker().postMessage({ type: 'split', audio: pcm, channels: ch, sampleRate: 44100, outLen });
        } catch (e) {
          console.error('device split fail:', e);
          resolve(false);
        }
      })();
    });
  }, [t]);

  // ── 云端 ZIP → 内存 6 轨 (解析并置状态) ──────────────────────────
  const ingestZip = useCallback(async (blob: Blob, onStep?: (done: number, total: number) => void): Promise<boolean> => {
    try {
      const zip = await JSZip.loadAsync(blob);
      const buffers = new Map<StemId, AudioBuffer>();
      const waves = {} as Partial<Record<StemId, Float32Array>>;
      let doneN = 0;
      for (const cfg of STEMS) {
        const entry = zip.file(`${cfg.id}.wav`);
        if (!entry) continue;
        const ab = await getBufFactory().decodeAudioData(await entry.async('arraybuffer'));
        buffers.set(cfg.id, ab);
        waves[cfg.id] = toWaveData(ab);
        doneN++;
        onStep?.(doneN, STEMS.length);
      }
      if (buffers.size === 0) throw new Error('empty zip');
      stemBuffersRef.current = buffers;
      setWaveData(waves);
      setDone(true); setProgress(100); setProcessing(false); setProcessingLabel('');
      notifyOk(t('stem.separatedN', { n: buffers.size }));
      return true;
    } catch (e) {
      console.error('cloud zip ingest fail:', e);
      return false;
    }
  }, [t]);

  // ── 云端分离: 异步任务队列 (POST /tasks → 轮询 → 下载 ZIP) ───────
  // 2026-09-02 (C21): 由同步 /split 改为 /tasks 队列 API — 提交后立刻拿到排队号,
  // 轮询展示「排队第 N 位 / 服务器分离中」, 多人并发不干等, 队列满(429)明确提示.
  // 返回 'ok' | 'server'(网络/地址问题, 需弹配置卡) | 'task'(任务侧失败, 已提示)
  const CLOUD_TASK_TIMEOUT = 15 * 60 * 1000; // 排队+处理总上限 (单任务~25s × 队列 16)
  const CLOUD_POLL_MS = 2500;
  const runCloud = useCallback(async (file: File): Promise<'ok' | 'server' | 'task'> => {
    const url = serverUrlRef.current.trim().replace(/\/+$/, '');
    if (!url) return 'server';
    setProgress(null); // 排队/处理阶段为不确定进度条
    try {
      // 1) 提交任务 → 202 + task_id (上传本身也设超时, 防弱网无限转圈)
      const form = new FormData();
      form.append('file', file);
      setProcessingLabel(t('stem.processingCloud'));
      let res: Response;
      try {
        const ctrl = new AbortController();
        const to = setTimeout(() => ctrl.abort(), 120000);
        res = await fetch(`${url}/tasks`, { method: 'POST', body: form, signal: ctrl.signal });
        clearTimeout(to);
      } catch (e) {
        console.error('cloud submit fail:', e);
        return 'server';
      }
      if (res.status === 429) { notifyWarn(t('stem.queueFull')); return 'task'; }
      if (!res.ok) return 'server';
      const task = await res.json().catch(() => null);
      const taskId = task?.task_id as string | undefined;
      if (!taskId) return 'server';

      // 2) 轮询状态 → 排队位置 / 处理中 / done → 下载 ZIP
      const deadline = Date.now() + CLOUD_TASK_TIMEOUT;
      while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, CLOUD_POLL_MS));
        let st: any = null;
        try {
          const sr = await fetch(`${url}/tasks/${taskId}`);
          if (sr.ok) st = await sr.json().catch(() => null);
        } catch { /* 瞬时网络抖动, 下一轮再试 */ }
        const state = st?.status as string | undefined;
        if (state === 'queued') {
          const pos = typeof st?.position === 'number' ? st.position : '?';
          setProcessingLabel(t('stem.queuedPos', { pos }));
        } else if (state === 'running') {
          setProcessingLabel(t('stem.separatingCloud'));
        } else if (state === 'done') {
          // 下载结果: 流式读取 + 真实百分比 (整首歌 6 轨 ZIP 可达上百 MB, 弱带宽下下载数分钟)
          // 旧实现直接 await res.blob() — 全程零反馈, 配合静态条纹条 = "进度条卡死" 观感
          try {
            setProgress(0);
            setProcessingLabel(t('stem.downloading'));
            const blob = await fetchZipWithProgress(`${url}/tasks/${taskId}/download`, p => {
              setProgress(p); // null → 不确定条+计时; number → 真实下载 %
            });
            setProgress(null);
            setProcessingLabel(t('stem.ingestN', { done: 0, total: STEMS.length }));
            const ok = await ingestZip(blob, (doneN, total) =>
              setProcessingLabel(t('stem.ingestN', { done: doneN, total })));
            return ok ? 'ok' : 'task';
          } catch (e) {
            console.error('cloud download fail:', e);
            return 'server';
          }
        } else if (state === 'error') {
          const detail = typeof st?.detail === 'string' ? st.detail : t('stem.fail');
          notifyErr(t('stem.taskError', { detail }));
          return 'task';
        }
      }
      notifyErr(t('stem.taskTimeout'));
      return 'task';
    } catch (e) {
      console.error('cloud queue fail:', e);
      return 'server';
    }
  }, [t, ingestZip]);

  const handleResult = (msg: any) => {
    setProcessing(false); setProcessingLabel('');
    const ch = Math.max(1, msg.channels ?? 2);
    const sr = msg.sampleRate ?? 44100;
    const outLen = msg.outLen ?? 0;
    const buffers = new Map<StemId, AudioBuffer>();
    const waves = {} as Partial<Record<StemId, Float32Array>>;
    const factory = getBufFactory();
    for (const s of (msg.stems ?? []) as Array<{ id: StemId; data: Float32Array }>) {
      const d = s.data;
      const ab = factory.createBuffer(ch, outLen, sr);
      const L = ab.getChannelData(0);
      const R = ch === 2 ? ab.getChannelData(1) : null;
      for (let i = 0; i < outLen; i++) {
        L[i] = d[i * ch];
        if (R) R[i] = d[i * ch + 1];
      }
      buffers.set(s.id, ab);
      waves[s.id] = toWaveData(ab);
    }
    stemBuffersRef.current = buffers;
    setWaveData(waves);
    setDone(true); setProgress(100);
    notifyOk(t('stem.separatedN', { n: buffers.size }));
  };

  // ── 主流程: 4 轨端侧优先(失败自动转云端) / 6 轨云端直接走 Demucs ──
  const handleProcess = useCallback(async () => {
    const file = audioFileRef.current;
    if (!file || processingRef.current) return;
    processingRef.current = true;
    setProcessing(true); setProgress(0); setDone(false); setWaveData({});
    stemBuffersRef.current = null;
    stopEverything();
    acquireWakeLock(); // 长任务期间保持屏幕常亮, 防止 WebView 定时器被节流
    try {
      if (splitModeRef.current === 'cloud') {
        // 6 轨云端: 走 Demucs 任务队列 (排队→处理→下载)
        setEngine('cloud');
        const ok = await runCloud(file);
        if (ok === 'server') {
          // 网络/地址问题 → toast 提示 (默认地址固定正确, 无需用户操作)
          setProcessing(false); setProcessingLabel(''); setProgress(0);
          notifyErr(t('stem.cloudFail'));
        } else if (ok === 'task') {
          // 任务侧失败 (429/解析错误/超时) — runCloud 内已 toast 具体原因, 不弹地址卡
          setProcessing(false); setProcessingLabel(''); setProgress(0);
        }
      } else {
        // 4 轨端侧: 端侧优先, 失败自动转云端
        setEngine('device');
        let ok = await processDevice(file);
        if (!ok) {
          setEngine('cloud');
          const cok = await runCloud(file); // 地址恒定, 无需判空短路
          if (cok === 'server') {
            setProcessing(false); setProcessingLabel(''); setProgress(0);
            notifyErr(t('stem.deviceFail'));
          } else if (cok === 'task') {
            setProcessing(false); setProcessingLabel(''); setProgress(0);
          }
        }
      }
    } finally {
      releaseWakeLock();
    }
    processingRef.current = false;
  }, [processDevice, runCloud, t]);

  // ── 播放 (分轨/原曲, 支持 seek) ─────────────────────────────────
  const playStems = (startAt = playOffsetRef.current) => {
    const buffers = stemBuffersRef.current;
    if (!buffers) return;
    stopPlayback();
    stopOriginal();
    // #70: 开播前独占传输总线 — 若 Drum/Looper/Rec 在唱, 先停掉它们 (互斥语义)
    claimTransport('stem', stopEverything);

    const ctx = getSynthCtx();
    const dur = [...buffers.values()][0]?.duration ?? 0;
    const master = ctx.createGain();
    master.gain.value = masterGain;
    master.connect(ctx.destination);
    masterGainRef.current = master;

    const nodes = new Map<StemId, { source: AudioBufferSourceNode | null; gain: GainNode }>();
    for (const cfg of STEMS) {
      const buf = buffers.get(cfg.id);
      if (!buf) continue;
      const gainNode = ctx.createGain();
      gainNode.gain.value = 0;
      gainNode.connect(master);
      const source = ctx.createBufferSource();
      source.buffer = buf;
      source.loop = true;
      source.start(0, Math.max(0, Math.min(startAt, dur)));
      source.connect(gainNode);
      nodes.set(cfg.id, { source, gain: gainNode });
    }
    stemNodesRef.current = nodes;
    applyMix(stemStatesRef.current); // 用最新 MUTE/SOLO/音量铺开各轨, 取代旧 updatePlayState()
    playStartCtxRef.current = ctx.currentTime;
    playOffsetRef.current = startAt;
    setPlayDur(dur);
    setPlayPos(Math.min(startAt, dur));
    setIsPlaying(true);
    if (posTimerRef.current) clearInterval(posTimerRef.current);
    posTimerRef.current = setInterval(() => {
      const np = playOffsetRef.current + (ctx.currentTime - playStartCtxRef.current);
      setPlayPos(np % Math.max(0.01, dur));
    }, 200);
    notifyInfo(t('stem.playing'));
  };

  const stopPlayback = useCallback(() => {
    for (const [, node] of stemNodesRef.current) {
      try { node.source?.stop(); } catch {}
    }
    stemNodesRef.current.clear();
    if (masterGainRef.current) { try { masterGainRef.current.disconnect(); } catch {} masterGainRef.current = null; }
    if (posTimerRef.current) { clearInterval(posTimerRef.current); posTimerRef.current = null; }
    setIsPlaying(false);
    setPlayPos(0);
    releaseTransport('stem');
  }, []);

  const stopOriginal = useCallback(() => {
    if (origSourceRef.current) { try { origSourceRef.current.stop(); } catch {} origSourceRef.current = null; }
    if (posTimerRef.current) { clearInterval(posTimerRef.current); posTimerRef.current = null; }
    setIsOrigPlaying(false);
    setPlayPos(0);
    releaseTransport('stem');
  }, []);

  /** #70: 全停 (分轨+原曲) — 供传输总线 stopSelf / 关闭 / 失活统一调用. */
  const stopEverything = useCallback(() => { stopPlayback(); stopOriginal(); }, [stopPlayback, stopOriginal]);

  const playOriginal = (startAt = playOffsetRef.current) => {
    const buf = origBufRef.current;
    if (!buf) return;
    stopPlayback();
    stopOriginal();
    claimTransport('stem', stopEverything);
    const ctx = getSynthCtx();
    const off = Math.max(0, Math.min(startAt, buf.duration));
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain(); g.gain.value = 0.9;
    src.connect(g).connect(ctx.destination);
    src.onended = () => { setIsOrigPlaying(false); setPlayPos(0); };
    src.start(0, off);
    origSourceRef.current = src;
    playStartCtxRef.current = ctx.currentTime;
    playOffsetRef.current = off;
    setPlayDur(buf.duration);
    setPlayPos(off);
    setIsOrigPlaying(true);
    if (posTimerRef.current) clearInterval(posTimerRef.current);
    posTimerRef.current = setInterval(() => {
      const np = playOffsetRef.current + (ctx.currentTime - playStartCtxRef.current);
      if (np >= buf.duration) { stopOriginal(); return; }
      setPlayPos(np);
    }, 200);
  };

  const seekTo = (sec: number) => {
    if (playMode === 'orig') {
      if (!origBufRef.current) return;
      const s = Math.max(0, Math.min(sec, origBufRef.current.duration));
      if (isOrigPlaying) playOriginal(s);
      else { playOffsetRef.current = s; setPlayPos(s); }
    } else {
      if (!playDur) return;
      const s = Math.max(0, Math.min(sec, playDur));
      if (isPlaying) { stopPlayback(); playStems(s); }
      else { playOffsetRef.current = s; setPlayPos(s); }
    }
  };

  const switchPlayMode = (m: 'orig' | 'stems') => {
    if (m === playMode) return;
    stopEverything();
    playOffsetRef.current = 0;
    setPlayPos(0);
    setPlayMode(m);
  };

  const closePlayer = () => {
    stopEverything();
    stemBuffersRef.current = null;
    setWaveData({});
    setDone(false);
    setEngine(null);
    setPlayDur(0); setPlayPos(0);
  };

  // 离开本 tab / 关闭工作室 (active=false): 停播放; worker 保留 (模型缓存跨 tab 复用)
  useEffect(() => () => { stopEverything(); }, [stopEverything]);
  useEffect(() => { if (!active) { stopEverything(); } }, [active, stopEverything]);

  // #71: MUTE/SOLO/音量 — 全部走 setStem (ref 同步 + 立即 applyMix), 无陈旧闭包
  const toggleMute = (id: StemId) => setStem(id, { muted: !stemStatesRef.current[id].muted });
  const toggleSolo = (id: StemId) => setStem(id, { solo: !stemStatesRef.current[id].solo });
  const handleStemGain = (id: StemId, v: number) => setStem(id, { gain: v });

  // #71 (修复「轨行 ▶ 播放后不响应切换」): 轨行圆形按钮 = 试听本轨 (solo 播放),
  // 播放状态由传输条单事实源驱动:
  //  - 停止态点 ▶  → 独奏本轨(顺带解除静音)并开播
  //  - 播放中且本轨正被独奏 → 点 ■ 停止 (旧 bug: 再点只是取消独奏, 全轨继续响, 看着像失灵)
  //  - 播放中, 独奏在别轨 / 无独奏 → 点 ▶ 把独奏切到本轨, 不重播不打断
  const handleRowAudition = (id: StemId) => {
    if (!stemBuffersRef.current) return;
    if (!isPlaying) {
      setStem(id, { solo: true, muted: false });
      playStems(playOffsetRef.current);
      return;
    }
    if (stemStatesRef.current[id].solo) { stopEverything(); return; }
    setStem(id, { solo: true, muted: false });
  };

  const handleMasterGain = (v: number) => {
    setMasterGain(v);
    if (masterGainRef.current) masterGainRef.current.gain.value = v;
  };

  const handleTogglePlayback = () => {
    if (playMode === 'orig') {
      if (isOrigPlaying) stopOriginal();
      else playOriginal(playOffsetRef.current);
    } else {
      if (isPlaying) stopPlayback();
      else playStems(playOffsetRef.current);
    }
  };

  // ── 导出 ─────────────────────────────────────────────────────────
  const handleExport = async (id: StemId) => {
    const buf = stemBuffersRef.current?.get(id);
    if (!buf) { notifyErr(t('stem.noData')); return; }
    try {
      const channels: Float32Array[] = [];
      for (let c = 0; c < buf.numberOfChannels; c++) channels.push(buf.getChannelData(c));
      const wav = encodeWavPCM16(channels, buf.sampleRate);
      const blob = new Blob([wav], { type: 'audio/wav' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${audioFileRef.current?.name.replace(/\.[^.]+$/, '') || 'stem'}_${id}.wav`;
      a.click();
      URL.revokeObjectURL(url);
      notifyOk(t('stem.exported', { name: id }));
    } catch (e) {
      console.error('Export error:', e);
      notifyErr(t('stem.exportFail'));
    }
  };

  // 2026-09-02 (C19): 全部导出改为「单次 ZIP」— 逐轨 wav 打包成一个 zip 再下载,
  // 避免 WebView 连续 6 次下载被系统拦截/弹窗轰炸; 端侧(4轨)与云端(6轨)结果均适用.
  const handleExportAll = async () => {
    const buffers = stemBuffersRef.current;
    if (!buffers) return;
    const base = audioFileRef.current?.name.replace(/\.[^.]+$/, '') || 'stems';
    try {
      const zip = new JSZip();
      let n = 0;
      for (const cfg of displayStems) {
        const buf = buffers.get(cfg.id);
        if (!buf) continue;
        const channels: Float32Array[] = [];
        for (let c = 0; c < buf.numberOfChannels; c++) channels.push(buf.getChannelData(c));
        zip.file(`${base}_${cfg.id}.wav`, encodeWavPCM16(channels, buf.sampleRate));
        n++;
      }
      if (n === 0) { notifyErr(t('stem.noData')); return; }
      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${base}_stems.zip`;
      a.click();
      URL.revokeObjectURL(url);
      notifyOk(t('stem.exportAllDone', { n }));
    } catch (e) {
      console.error('Export all error:', e);
      notifyErr(t('stem.exportFail'));
    }
  };

  const fmtDur = (id: StemId): string => {
    const buf = stemBuffersRef.current?.get(id);
    if (!buf) return '';
    const s = buf.length / buf.sampleRate;
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  // ── 渲染 ─────────────────────────────────────────────────────────
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* 引擎徽标 + 提示 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{
          fontSize: 10.5, fontWeight: 700, letterSpacing: '0.1em',
          color: engine === 'cloud' ? 'rgb(255,200,60)' : accentColor,
          fontFamily: '"Barlow-Regular_2",sans-serif', padding: '4px 10px', borderRadius: 5,
          background: engine === 'cloud' ? 'rgba(255,200,60,0.1)' : `${accentColor}12`,
          border: `1px solid ${engine === 'cloud' ? 'rgba(255,200,60,0.4)' : `${accentColor}40`}`,
        }}>
          {engine === 'cloud' ? t('stem.engineCloud') : t('stem.engineDevice')}
        </span>
        <span style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.3)', fontFamily: '"Barlow-Regular_2",sans-serif' }}>
          {deviceReady ? t('stem.modelReady') : t('stem.modelHint')}
        </span>
      </div>

      {/* 分轨模式: 快速(端侧) / 完整(云端) — C22 不暴露引擎技术细节 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <SegRow
          value={splitMode}
          onChange={v => setSplitMode(v === 'device' ? 'device' : 'cloud')}
          accent={accentColor}
          options={[
            { value: 'device', label: t('stem.modeDevice') },
            { value: 'cloud', label: t('stem.modeCloud6'), disabled: !online },
          ]}
        />
        <span style={{ fontSize: 10.5, color: !online ? 'rgba(255,170,80,0.85)' : 'rgba(255,255,255,0.3)', fontFamily: '"Barlow-Regular_2",sans-serif', flex: 1 }}>
          {!online ? t('stem.offline') : (splitMode === 'cloud' ? t('stem.cloud6Hint') : t('stem.device4Hint'))}
        </span>
      </div>

      {/* 文件栏 */}
      <div style={{ background: `${accentColor}06`, border: `1px solid ${accentColor}22`, borderRadius: 8, padding: '10px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={handleSelectFile} disabled={processing} style={{
            padding: '7px 14px', borderRadius: 5, cursor: processing ? 'not-allowed' : 'pointer',
            background: `${accentColor}14`, border: `1px solid ${accentColor}44`,
            color: accentColor, fontSize: 11, fontWeight: 700, letterSpacing: '0.12em',
            fontFamily: '"Barlow-Regular_2",sans-serif', flexShrink: 0, opacity: processing ? 0.5 : 1,
          }}>
            {t('stem.selectAudio')}
          </button>
          <div style={{ flex: 1, overflow: 'hidden', minWidth: 0 }}>
            <div style={{ fontSize: 11, color: audioFile ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.25)', fontFamily: '"Barlow-Regular_2",sans-serif', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
              {audioFile ? audioFile.name : t('stem.noFile')}
            </div>
            {audioFile && (
              <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.3)', fontFamily: '"Barlow-Regular_2",sans-serif' }}>
                {(audioFile.size / 1024 / 1024).toFixed(1)} MB
              </div>
            )}
          </div>
          {audioFile && !processing && !done && (
            <button onClick={handleProcess} style={{
              padding: '7px 16px', borderRadius: 5, cursor: 'pointer',
              background: `linear-gradient(135deg, ${accentColor}40, rgba(240,111,33,0.3))`,
              border: `1px solid ${accentColor}66`, color: '#fff',
              fontSize: 11, fontWeight: 700, letterSpacing: '0.12em',
              fontFamily: '"Barlow-Regular_2",sans-serif', flexShrink: 0,
            }}>
              {t('stem.process')}
            </button>
          )}
        </div>

        {/* 进度 */}
        {(processing || done) && (
          <div style={{ marginTop: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
              <span style={{ fontSize: 10.5, color: `${accentColor}aa`, fontFamily: '"Barlow-Regular_2",sans-serif' }}>
                {processing ? `${processingLabel || t('stem.separating')}` : t('stem.complete')}
              </span>
              <span style={{ fontSize: 10.5, color: `${accentColor}aa`, fontFamily: '"Barlow-Regular_2",sans-serif', fontVariantNumeric: 'tabular-nums' }}>
                {progress === null
                  ? (processing ? fmtElapsed(elapsed) : '…')
                  : `${progress}%`}
              </span>
            </div>
            <div style={{ height: 4, borderRadius: 2, background: `${accentColor}15`, overflow: 'hidden' }}>
              {progress === null ? (
                <div style={{
                  height: '100%', width: '100%', opacity: 0.35,
                  background: `repeating-linear-gradient(45deg, ${accentColor} 0 8px, transparent 8px 16px)`,
                  animation: 'stripeSweep 0.8s linear infinite',
                }} />
              ) : (
                <div style={{
                  height: '100%', width: `${progress}%`,
                  background: `linear-gradient(90deg, ${accentColor}, rgb(240,111,33))`,
                  borderRadius: 2, transition: 'width 0.15s linear',
                  boxShadow: `0 0 6px ${accentColor}66`,
                }} />
              )}
            </div>
          </div>
        )}
      </div>

      {/* 分轨行 */}
      {done && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.35)', fontFamily: '"Barlow-Regular_2",sans-serif', letterSpacing: '0.15em', textTransform: 'uppercase' }}>
              {t('stem.extracted')}
            </span>
            <span style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.2)', fontFamily: '"Barlow-Regular_2",sans-serif', letterSpacing: '0.1em' }}>
              {displayStems.length} {t('stem.tracks')}
            </span>
          </div>

          {displayStems.map(cfg => {
            const id = cfg.id;
            const state = stemStates[id];
            // #71: 行态 = 传输条 isPlaying 单事实源 + 每轨出声裁决 (audibleOf 同一函数)
            const audible = audibleOf(stemStates, id);   // 该轨此刻在混音里出声?
            const singing = isPlaying && audible;         // 且传输正在播
            const auditioning = isPlaying && state.solo;  // 正被当作试听目标
            return (
              <div key={id} style={{
                background: `${cfg.color}08`, border: `1px solid ${audible ? cfg.color + '3d' : cfg.color + '18'}`,
                borderRadius: 8, padding: '8px 10px', opacity: audible ? 1 : 0.5,
                transition: 'all 0.12s',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {/* 试听按钮: ▶ 独奏本轨并开播 / ■ 停止 (旧实现把 solo+播放捆在一起, 再点不响应) */}
                  <button onClick={() => handleRowAudition(id)} title={auditioning ? t('btn.stop') : t('stem.playStems')} style={{
                    width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                    background: auditioning ? `${cfg.color}22` : 'transparent',
                    border: `1px solid ${auditioning ? cfg.color : cfg.color + '55'}`,
                    color: auditioning ? cfg.color : cfg.color + '88',
                    cursor: 'pointer', fontSize: 11,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: '"Barlow-Regular_2",sans-serif',
                    boxShadow: auditioning ? `0 0 8px ${cfg.color}55` : 'none',
                  }}>
                    {auditioning ? '■' : '▶'}
                  </button>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
                    <div style={{ width: 3, height: 14, borderRadius: 1.5, background: cfg.color, boxShadow: `0 0 5px ${cfg.color}88`, flexShrink: 0 }} />
                    <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', color: cfg.color, fontFamily: '"Barlow-Regular_2",sans-serif' }}>
                      {id.toUpperCase()}
                    </span>
                    <span style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.25)', fontFamily: '"Barlow-Regular_2",sans-serif' }}>{fmtDur(id)}</span>
                    {/* 发声指示: 传输在播且本轨有声 → 呼吸亮点 (与鼓机/循环的播放态一致) */}
                    {singing && (
                      <span style={{
                        width: 5, height: 5, borderRadius: '50%', flexShrink: 0,
                        background: cfg.color, animation: 'blink 0.8s infinite',
                        boxShadow: `0 0 6px ${cfg.color}`, marginLeft: 2,
                      }} />
                    )}
                  </div>
                  <button onClick={() => handleExport(id)} style={{
                    width: 26, height: 26, borderRadius: 5, cursor: 'pointer', flexShrink: 0,
                    background: 'transparent', border: `1px solid ${cfg.color + '44'}`,
                    color: cfg.color + '99', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <svg width={11} height={11} viewBox="0 0 12 12" fill="none">
                      <path d="M6 2 L6 8 M3.5 5.5 L6 8 L8.5 5.5" stroke={cfg.color} strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round" />
                      <line x1={2} y1={10} x2={10} y2={10} stroke={cfg.color} strokeWidth={1.2} strokeLinecap="round" />
                    </svg>
                  </button>
                </div>

                <div style={{ marginTop: 6 }}>
                  <Waveform data={waveData[id] ?? null} color={cfg.color} height={26} />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                  <Chip label={t('btn.mute')} on={state.muted} accent={cfg.color} small onClick={() => toggleMute(id)} />
                  <Chip label={t('btn.solo')} on={state.solo} accent={cfg.color} small onClick={() => toggleSolo(id)} />
                  <span style={{ fontSize: 10.5, color: `${cfg.color}66`, fontFamily: '"Barlow-Regular_2",sans-serif', flexShrink: 0 }}>VOL</span>
                  <input type="range" min={0} max={1} step={0.01} value={state.gain}
                    onChange={e => handleStemGain(id, Number(e.target.value))}
                    style={{ flex: 1, accentColor: cfg.color, height: 2, minWidth: 0 }} />
                  <span style={{ fontSize: 10.5, color: `${cfg.color}88`, fontFamily: '"Barlow-Regular_2",sans-serif', minWidth: 22, textAlign: 'right' }}>
                    {Math.round(state.gain * 100)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 总音量 */}
      {done && (
        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '8px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.4)', fontFamily: '"Barlow-Regular_2",sans-serif', letterSpacing: '0.15em' }}>MASTER</span>
            <input type="range" min={0} max={1} step={0.01} value={masterGain}
              onChange={e => handleMasterGain(Number(e.target.value))}
              style={{ flex: 1, accentColor }} />
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontFamily: '"Barlow-Regular_2",sans-serif', minWidth: 28, textAlign: 'right' }}>
              {Math.round(masterGain * 100)}
            </span>
          </div>
        </div>
      )}

      {/* 空状态 */}
      {!audioFile && (
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <svg width={36} height={36} viewBox="0 0 24 24" fill="none" style={{ margin: '0 auto 8px', opacity: 0.3 }}>
            <path d="M9 18V5l12-2v13" stroke={accentColor} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
            <circle cx={6} cy={18} r={3} stroke={accentColor} strokeWidth={1.5} />
            <circle cx={18} cy={16} r={3} stroke={accentColor} strokeWidth={1.5} />
          </svg>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', fontFamily: '"Barlow-Regular_2",sans-serif', letterSpacing: '0.1em' }}>
            {t('stem.emptyTitle')}<br />
            {t('stem.emptyList')}
          </div>
        </div>
      )}

      {done && (
        <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.15)', fontFamily: '"Barlow-Regular_2",sans-serif', textAlign: 'center' }}>
          {t('stem.footer')}
        </div>
      )}
      </div>

      {/* 浮动传输条 (列表滚动时固定底部): 原曲/分轨切换 + seek + 播放/导出/关闭 */}
      {done && (
        <div style={{
          flexShrink: 0, borderTop: `1px solid ${accentColor}40`,
          background: 'rgba(27,25,31,0.97)', padding: '8px 12px 10px',
          display: 'flex', flexDirection: 'column', gap: 6,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <SegRow
              value={playMode}
              onChange={switchPlayMode}
              accent={accentColor}
              options={[
                { value: 'orig', label: t('stem.original') },
                { value: 'stems', label: t('stem.playStems') },
              ]}
            />
            {isOrigPlaying && (
              <span style={{ fontSize: 10.5, fontWeight: 700, color: accentColor, fontFamily: '"Barlow-Regular_2",sans-serif', letterSpacing: '0.1em', display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: accentColor, animation: 'blink 0.6s infinite' }} />
                {t('stem.original')}
              </span>
            )}
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.35)', fontFamily: '"Barlow-Regular_2",sans-serif' }}>
              {fmtClock(playPos)} / {fmtClock(playDur)}
            </span>
            {/* #72: 播放态 → 按钮转警示红 (■ STOP), 停止态 → 面板 accent (▶ PLAY), 与四区一致 */}
            <IconBtn onClick={handleTogglePlayback} accent={(isPlaying || isOrigPlaying) ? 'rgb(255,110,90)' : accentColor} size={30}>
              <span style={{ fontSize: 11, lineHeight: 1 }}>{(isPlaying || isOrigPlaying) ? '■' : '▶'}</span>
            </IconBtn>
            <IconBtn onClick={handleExportAll} accent={accentColor} size={30}>
              <svg width={11} height={11} viewBox="0 0 12 12" fill="none">
                <path d="M6 2 L6 8 M3.5 5.5 L6 8 L8.5 5.5" stroke={accentColor} strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round" />
                <line x1={2} y1={10} x2={10} y2={10} stroke={accentColor} strokeWidth={1.2} strokeLinecap="round" />
              </svg>
            </IconBtn>
            <IconBtn onClick={closePlayer} size={28}>
              <span style={{ fontSize: 13, lineHeight: 1, color: 'rgba(255,255,255,0.6)' }}>×</span>
            </IconBtn>
          </div>
          <ProgressBar pos={playPos} dur={playDur} onSeek={seekTo} accent={accentColor} />
        </div>
      )}
    </div>
  );
}

// ── 波形预览 (每列 min/max) ────────────────────────────────────────
function toWaveData(buf: AudioBuffer, cols = 720): Float32Array {
  const ch0 = buf.getChannelData(0);
  const ch1 = buf.numberOfChannels > 1 ? buf.getChannelData(1) : null;
  const out = new Float32Array(cols * 2);
  const step = ch0.length / cols;
  for (let c = 0; c < cols; c++) {
    const start = Math.floor(c * step);
    const end = Math.max(start + 1, Math.floor((c + 1) * step));
    let mn = 0, mx = 0;
    for (let j = start; j < end; j++) {
      const v = ch1 ? (ch0[j] + ch1[j]) * 0.5 : ch0[j];
      if (v < mn) mn = v;
      if (v > mx) mx = v;
    }
    out[c * 2] = mn;
    out[c * 2 + 1] = mx;
  }
  return out;
}
