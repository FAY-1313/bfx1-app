// ─── 调音器: GuitarTuna × TU-3 融合 ────────────────────────────────
// 双显示模式: bars (色块收敛条) / led (TU-3 21段流水灯).
// 输入链: 话筒 → gain → 高通滤波 → analyser; 检测算法沿用已验证的
// 归一化自相关 + McLeod 峰选 + 抛物线插值 + slew 平滑 + 静音门限.
// 话筒为手动开启 (START), 切走 Tab / 关工作室自动停麦 (active prop).
//
// 2026-09-03: 乐器扩为 6弦吉他 / 7弦吉他 / 4弦贝斯 / 5弦贝斯 + 全音阶,
// 每种弦乐器支持多组调音预设 (Standard/Drop D/Drop A/Eb/DADGAD...).
// 5弦贝斯最低弦 B0/Bb0 (<31.5Hz) 自动把 analyser FFT 提到 4096 并降帧,
// 高通频率随当前调音最低弦自适应 (压制 50Hz 工频又尽量放行低音).

import { useCallback, useEffect, useRef, useState } from 'react';
import { notifyErr } from '../services/feedback';
import { useI18n } from '../i18n';
import { getSynthCtx, scheduleRefTone } from '../utils/audioSynth';
import { DropMenu } from '../ui/controls';

interface TunerPanelProps {
  active: boolean;
  height?: number;
}

const GREEN = 'rgb(60,255,160)';
const YELLOW = 'rgb(255,200,80)';
const GREEN_T: [number, number, number] = [60, 255, 160];
const YELLOW_T: [number, number, number] = [255, 200, 80];
/** 颜色线性插值 (供黄→绿渐变). */
const lerp = (a: [number, number, number], b: [number, number, number], t: number): string => {
  const k = Math.max(0, Math.min(1, t));
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * k)},${Math.round(a[1] + (b[1] - a[1]) * k)},${Math.round(a[2] + (b[2] - a[2]) * k)})`;
};

/** A4 校准步进按钮样式 (C5). */
const a4StepBtnStyle: React.CSSProperties = {
  width: 24, height: 24, borderRadius: 4, cursor: 'pointer',
  background: 'rgba(60,255,160,0.08)', border: '1px solid rgba(60,255,160,0.25)',
  color: GREEN, fontSize: 13, fontWeight: 700, lineHeight: 1,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontFamily: '"Barlow-Regular_2",sans-serif',
};

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** C4: 全音阶档 — 任意音检测, 覆盖吉他/贝斯/人声等. N=4096 时最低可测 ~15.6Hz; 常规取值 30(A#0 之下略低). */
const CHROMATIC_RANGE = { lo: 30, hi: 1760 };
/** 需要把 analyser 提到 4096 的最低弦频率阈值 (2048 FFT 时 maxLag=0.75N → 下限 sr/1536≈31.25Hz@48k). */
const BIG_FFT_F0 = 31.5;

type TunerMode = 'guitar6' | 'guitar7' | 'bass4' | 'bass5' | 'chromatic';
type InstMode = Exclude<TunerMode, 'chromatic'>;

interface TuningPreset {
  id: string;
  /** i18n key (tuner.tuneXxx) */
  k: string;
  freqs: number[];  // 每根弦目标基频 (Hz, 低→高)
  names: string[];  // 每根弦音名
}

/** 各弦乐器的调音预设表 (2026-09-03). 频率按 A4=440 计算. */
const TUNINGS: Record<InstMode, TuningPreset[]> = {
  guitar6: [
    { id: 'std',    k: 'tuner.tuneStd',    freqs: [82.41, 110, 146.83, 196, 246.94, 329.63], names: ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'] },
    { id: 'dropD',  k: 'tuner.tuneDropD',  freqs: [73.42, 110, 146.83, 196, 246.94, 329.63], names: ['D2', 'A2', 'D3', 'G3', 'B3', 'E4'] },
    { id: 'dropDb', k: 'tuner.tuneDropDb', freqs: [69.30, 110, 146.83, 196, 246.94, 329.63], names: ['C#2', 'A2', 'D3', 'G3', 'B3', 'E4'] },
    { id: 'eb',     k: 'tuner.tuneEb',     freqs: [77.78, 103.83, 138.59, 185.00, 233.08, 311.13], names: ['Eb2', 'Ab2', 'Db3', 'Gb3', 'Bb3', 'Eb4'] },
    { id: 'd',      k: 'tuner.tuneD',      freqs: [73.42, 98.00, 130.81, 174.61, 220.00, 293.66], names: ['D2', 'G2', 'C3', 'F3', 'A3', 'D4'] },
    { id: 'dadgad', k: 'tuner.tuneDadgad', freqs: [73.42, 110, 146.83, 196, 220.00, 293.66], names: ['D2', 'A2', 'D3', 'G3', 'A3', 'D4'] },
  ],
  guitar7: [
    { id: 'std',    k: 'tuner.tuneStd',    freqs: [61.74, 82.41, 110, 146.83, 196, 246.94, 329.63], names: ['B1', 'E2', 'A2', 'D3', 'G3', 'B3', 'E4'] },
    { id: 'dropA',  k: 'tuner.tuneDropA',  freqs: [55.00, 82.41, 110, 146.83, 196, 246.94, 329.63], names: ['A1', 'E2', 'A2', 'D3', 'G3', 'B3', 'E4'] },
    { id: 'dropAb', k: 'tuner.tuneDropAb', freqs: [51.91, 82.41, 110, 146.83, 196, 246.94, 329.63], names: ['Ab1', 'E2', 'A2', 'D3', 'G3', 'B3', 'E4'] },
    { id: 'eb',     k: 'tuner.tuneEb',     freqs: [58.27, 77.78, 103.83, 138.59, 185.00, 233.08, 311.13], names: ['Bb1', 'Eb2', 'Ab2', 'Db3', 'Gb3', 'Bb3', 'Eb4'] },
  ],
  bass4: [
    { id: 'std',    k: 'tuner.tuneStd',   freqs: [41.20, 55, 73.42, 98], names: ['E1', 'A1', 'D2', 'G2'] },
    { id: 'dropD',  k: 'tuner.tuneDropD', freqs: [36.71, 55, 73.42, 98], names: ['D1', 'A1', 'D2', 'G2'] },
    { id: 'eb',     k: 'tuner.tuneEb',    freqs: [38.89, 51.91, 69.30, 92.50], names: ['Eb1', 'Ab1', 'Db2', 'Gb2'] },
    { id: 'd',      k: 'tuner.tuneD',     freqs: [36.71, 49.00, 65.41, 87.31], names: ['D1', 'G1', 'C2', 'F2'] },
  ],
  bass5: [
    { id: 'std',    k: 'tuner.tuneStd',    freqs: [30.87, 41.20, 55, 73.42, 98], names: ['B0', 'E1', 'A1', 'D2', 'G2'] },
    { id: 'dropBb', k: 'tuner.tuneDropBb', freqs: [29.14, 41.20, 55, 73.42, 98], names: ['Bb0', 'E1', 'A1', 'D2', 'G2'] },
    { id: 'eb',     k: 'tuner.tuneEb',     freqs: [29.14, 38.89, 51.91, 69.30, 92.50], names: ['Bb0', 'Eb1', 'Ab1', 'Db2', 'Gb2'] },
  ],
};

const TUNING_KEY = 'bfx_tuner_tunings'; // {instMode: tuningId}
const MODE_KEY = 'bfx_tuner_mode';

const loadMode = (): TunerMode => {
  const s = localStorage.getItem(MODE_KEY);
  return s === 'guitar6' || s === 'guitar7' || s === 'bass4' || s === 'bass5' || s === 'chromatic' ? s : 'guitar6';
};
const loadTuningMap = (): Record<string, string> => {
  try { return JSON.parse(localStorage.getItem(TUNING_KEY) || '{}') as Record<string, string>; } catch { return {}; }
};

export default function TunerPanel({ active, height = 420 }: TunerPanelProps) {
  const { t } = useI18n();
  const [deviation, setDeviation] = useState(0);
  const [detectedNote, setDetectedNote] = useState('');
  const [detectedFreq, setDetectedFreq] = useState(0);
  const [detectedString, setDetectedString] = useState(-1);
  const [isListening, setIsListening] = useState(false);
  const [tunerMode, setTunerMode] = useState<TunerMode>(loadMode);
  const [a4, setA4] = useState(440);
  const [level, setLevel] = useState(0);
  // C6 (2026-09-02): 进准(跨入 ±5¢)上升沿触发绿色锁定闪光
  const [flashKey, setFlashKey] = useState(0);
  const prevInTuneRef = useRef(false);

  const inst = (tunerMode === 'chromatic' ? 'guitar6' : tunerMode) as InstMode;
  const tuningMapRef = useRef<Record<string, string>>(loadTuningMap());
  const [tuningId, setTuningId] = useState<string>(() => {
    const m = loadMode();
    const im = (m === 'chromatic' ? 'guitar6' : m) as InstMode;
    return tuningMapRef.current[im] ?? 'std';
  });
  const tuning = TUNINGS[inst].find(p => p.id === tuningId) ?? TUNINGS[inst][0];

  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const hpRef = useRef<BiquadFilterNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const tunerModeRef = useRef<TunerMode>(tunerMode);
  const a4Ref = useRef(440);
  const levelRef = useRef(0);
  const lastLevelState = useRef(0);
  const startingRef = useRef(false);
  tunerModeRef.current = tunerMode;
  a4Ref.current = a4;
  // 检测闭包每帧读取当前调音 (切换调音/乐器即时生效)
  const instFreqsRef = useRef<number[]>(tuning.freqs);
  instFreqsRef.current = tunerMode === 'chromatic' ? [] : tuning.freqs;

  const selectMode = (m: TunerMode) => {
    setTunerMode(m);
    localStorage.setItem(MODE_KEY, m);
    if (m !== 'chromatic') {
      const id = tuningMapRef.current[m] ?? 'std';
      setTuningId(id);
    }
  };
  const selectTuning = (id: string) => {
    setTuningId(id);
    tuningMapRef.current[inst] = id;
    localStorage.setItem(TUNING_KEY, JSON.stringify(tuningMapRef.current));
  };

  const noteFromFreq = (freq: number): { name: string; cents: number; refFreq: number } => {
    const a4v = a4Ref.current;
    const semitones = 12 * Math.log2(freq / a4v) + 69;
    const midiNote = Math.round(semitones);
    const cents = Math.round((semitones - midiNote) * 100);
    const octave = Math.floor(midiNote / 12) - 1;
    const name = NOTE_NAMES[midiNote % 12] + octave;
    const refFreq = a4v * Math.pow(2, (midiNote - 69) / 12);
    return { name, cents, refFreq };
  };

  const detectString = (freq: number, mode: TunerMode): number => {
    if (mode === 'chromatic') return -1; // C4: 全音阶档无琴弦概念
    const freqs = instFreqsRef.current;
    let best = -1, bestDist = Infinity;
    for (let i = 0; i < freqs.length; i++) {
      const dist = Math.abs(Math.log2(freq / freqs[i]));
      if (dist < bestDist && dist < 0.2) { bestDist = dist; best = i; }
    }
    return best;
  };

  const stopAudio = useCallback(() => {
    startingRef.current = false;
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (sourceRef.current) { sourceRef.current.disconnect(); sourceRef.current = null; }
    // 不 close 共享 AudioContext (getSynthCtx 单例), 只断开自己的节点并停媒体流
    analyserRef.current = null;
    hpRef.current = null;
    if (streamRef.current) { streamRef.current.getTracks().forEach(x => x.stop()); streamRef.current = null; }
    audioCtxRef.current = null;
    setIsListening(false); setDeviation(0); setDetectedNote(''); setDetectedFreq(0); setDetectedString(-1); setLevel(0);
  }, []);

  const startTuner = useCallback(async () => {
    if (startingRef.current || streamRef.current) return;
    startingRef.current = true;
    setLevel(0); setDeviation(0); setDetectedNote(''); setDetectedFreq(0); setDetectedString(-1);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!startingRef.current) { stream.getTracks().forEach(x => x.stop()); return; }
      streamRef.current = stream;
      const ac = getSynthCtx();
      audioCtxRef.current = ac;
      const source = ac.createMediaStreamSource(stream);
      const gainNode = ac.createGain(); gainNode.gain.value = 2.2;
      const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 60; hp.Q.value = 0.8;
      const analyser = ac.createAnalyser(); analyser.fftSize = 2048;
      source.connect(gainNode); gainNode.connect(hp); hp.connect(analyser);
      sourceRef.current = source;
      analyserRef.current = analyser;
      hpRef.current = hp;
      setIsListening(true);

      const acorrAt = (buf: Float32Array, n: number, lag: number): number => {
        const len = n - lag; let sum = 0, r0A = 0, r0B = 0;
        for (let i = 0; i < len; i++) { sum += buf[i] * buf[i + lag]; r0A += buf[i] * buf[i]; r0B += buf[i + lag] * buf[i + lag]; }
        return sum / Math.sqrt(r0A * r0B + 1e-12);
      };

      let prevFreq = 0;
      let lastDetectTime = 0;
      let heldNote = '';
      let heldCents = 0;
      let heldString = -1;
      const HOLD_DURATION = 1.2;
      const DECAY_DURATION = 0.6;
      let lastLevelTick = 0;
      let frame = 0; // 大 FFT 时隔帧全扫, 控 CPU

      const detect = () => {
        const an = analyserRef.current;
        if (!an) return;
        const mode = tunerModeRef.current;
        const freqs = instFreqsRef.current;
        const isChr = mode === 'chromatic';
        const f0 = isChr ? CHROMATIC_RANGE.lo : freqs[0];
        const loFreq = isChr ? CHROMATIC_RANGE.lo : freqs[0] / Math.SQRT2;
        const hiFreq = isChr ? CHROMATIC_RANGE.hi : freqs[freqs.length - 1] * Math.SQRT2;
        const big = f0 < BIG_FFT_F0;
        // 自适应高通: 越接近最低弦越放行低音 (压制 50Hz 工频)
        const hpTgt = isChr ? 60 : Math.max(45, Math.min(62, f0 * 0.85));
        if (Math.abs(hp.frequency.value - hpTgt) > 1) hp.frequency.value = hpTgt;
        // 自适应 FFT: 5弦贝斯 B0/Bb0 及全音阶需扫到 <31.5Hz → 4096
        if (big && an.fftSize < 4096) an.fftSize = 4096;
        else if (!big && an.fftSize > 2048) an.fftSize = 2048;
        frame++;
        if (big && (frame & 1)) { animFrameRef.current = requestAnimationFrame(detect); return; } // 隔帧
        const N = an.fftSize;
        const buf = new Float32Array(N);
        an.getFloatTimeDomainData(buf);

        let rms = 0;
        for (let i = 0; i < N; i++) rms += buf[i] * buf[i];
        rms = Math.sqrt(rms / N);
        levelRef.current = Math.min(1, rms * 8);
        const now = audioCtxRef.current!.currentTime;

        if (now - lastLevelTick > 0.1) {
          lastLevelTick = now;
          const lv = levelRef.current;
          if (Math.abs(lv - lastLevelState.current) > 0.03) { lastLevelState.current = lv; setLevel(lv); }
        }

        if (rms < 0.004) {
          if (heldNote && now - lastDetectTime > HOLD_DURATION) {
            const elapsed = now - lastDetectTime - HOLD_DURATION;
            const tt = Math.min(elapsed / DECAY_DURATION, 1);
            const decayed = Math.round(heldCents * (1 - tt));
            setDeviation(decayed);
            if (tt >= 1) { heldNote = ''; heldCents = 0; heldString = -1; setDetectedNote(''); setDeviation(0); setDetectedString(-1); setDetectedFreq(0); }
          }
          prevFreq = 0;
          animFrameRef.current = requestAnimationFrame(detect);
          return;
        }

        const sr = audioCtxRef.current!.sampleRate;
        const minLag = Math.max(2, Math.floor(sr / hiFreq));
        const maxLag = Math.min(Math.floor(sr / loFreq), Math.floor(N * 0.75));

        const rs = new Float32Array(maxLag - minLag);
        let bestR = 0;
        for (let lag = minLag; lag < maxLag; lag++) {
          const r = acorrAt(buf, N, lag);
          rs[lag - minLag] = r;
          if (r > bestR) bestR = r;
        }

        const threshold = Math.max(0.8, bestR * 0.9);
        let bestLag = -1;
        for (let i = 0; i < rs.length; i++) {
          const r = rs[i];
          if (r < threshold) continue;
          const isPeak = (i === 0 || rs[i - 1] < r) && (i === rs.length - 1 || rs[i + 1] <= r);
          if (isPeak) { bestLag = minLag + i; bestR = r; break; }
        }

        if (bestLag > 0) {
          const r0 = bestLag > minLag ? rs[bestLag - minLag - 1] : 0;
          const r2 = bestLag + 1 < maxLag ? rs[bestLag - minLag + 1] : 0;
          const denom = 2 * (2 * bestR - r0 - r2);
          const delta = denom !== 0 ? (r0 - r2) / denom : 0;
          let freq = sr / (bestLag + delta);

          if (prevFreq > 0 && Math.abs(Math.log2(freq / prevFreq)) < 0.07) {
            freq = prevFreq * Math.pow(2, 0.4 * Math.log2(freq / prevFreq));
          }
          prevFreq = freq;

          if (freq >= loFreq && freq <= hiFreq) {
            const { name, cents } = noteFromFreq(freq);
            lastDetectTime = now;
            heldNote = name; heldCents = cents;
            heldString = detectString(freq, tunerModeRef.current);
            setDetectedNote(name); setDeviation(cents); setDetectedFreq(freq); setDetectedString(heldString);
            animFrameRef.current = requestAnimationFrame(detect);
            return;
          }
        }
        prevFreq = 0;
        animFrameRef.current = requestAnimationFrame(detect);
      };
      animFrameRef.current = requestAnimationFrame(detect);
    } catch {
      startingRef.current = false;
      setIsListening(false);
      notifyErr(t('toast.micFail'));
    }
  }, [t]);

  // 挂载: 预热共享 AudioContext; 卸载: 停麦 (面板保持挂载, 此清理仅在 App 退出时触发)
  useEffect(() => {
    const ctx = getSynthCtx();
    void ctx;
    return () => { stopAudio(); };
  }, [stopAudio]);

  // 切走 Tab / 关闭工作室 → 停麦
  useEffect(() => {
    if (!active) stopAudio();
  }, [active, stopAudio]);

  const inTune = isListening && Math.abs(deviation) < 5;
  // C6: 进准上升沿 → 闪光 key 递增 (重挂载闪光环)
  useEffect(() => {
    if (inTune && !prevInTuneRef.current) setFlashKey(k => k + 1);
    prevInTuneRef.current = inTune;
  }, [inTune]);
  const centsLabel = deviation > 0 ? `+${deviation}¢` : `${deviation}¢`;
  const isChromatic = tunerMode === 'chromatic';
  const strings = isChromatic ? [] : tuning.names;

  // F 批 #2 (2026-09-03): 乐器/调式 → 共享 DropMenu (分组下拉)
  // Batch G #1: 分组只用 吉他 / 贝斯 / 全音阶 三个常规用语 (复用现有键, 不生造翻译)
  const instOptions = [
    { value: 'guitar6', label: t('menu.guitar'), group: t('menu.guitar') },
    { value: 'guitar7', label: t('tuner.guitar7'), group: t('menu.guitar') },
    { value: 'bass4', label: t('menu.bass'), group: t('menu.bass') },
    { value: 'bass5', label: t('tuner.bass5'), group: t('menu.bass') },
    { value: 'chromatic', label: t('tuner.chromatic'), group: t('tuner.chromatic') },
  ];
  const tuningOptions = TUNINGS[inst].map(p => ({ value: p.id, label: t(p.k) }));

  // ── 单一指示条 (左右布满; 中心对准=绿, 远离中心=黄, 靠近中心=黄→绿渐变, 无红) ──
  const BAR_COUNT = 25;
  const BAR_CENTER = 12;
  const renderIndicator = () => {
    const lit = Math.min(Math.round(Math.abs(deviation) / 50 * BAR_CENTER), BAR_CENTER);
    const blocks = [];
    for (let i = 0; i < BAR_COUNT; i++) {
      const d = Math.abs(i - BAR_CENTER);
      const inGreen = d <= 1;
      let bg = 'rgba(255,255,255,0.06)';
      let glow = 'none';
      if (isListening) {
        if (inTune && inGreen) {
          bg = GREEN; glow = `0 0 8px ${GREEN}`;
        } else if (inGreen) {
          // 靠近中心但未完全对准: 黄→绿 渐变 (越准越绿)
          bg = lerp(YELLOW_T, GREEN_T, Math.max(0, 1 - Math.abs(deviation) / 25));
        } else {
          const onSide = (deviation < 0 && i < BAR_CENTER && BAR_CENTER - i <= lit)
            || (deviation > 0 && i > BAR_CENTER && i - BAR_CENTER <= lit);
          if (onSide) {
            // 点亮侧: 近中心绿 → 远端黄 渐变
            const t = 1 - (d - 1) / Math.max(1, lit);
            bg = lerp(YELLOW_T, GREEN_T, t);
            glow = `0 0 5px ${bg}`;
          }
        }
      }
      blocks.push(
        <div key={i} style={{
          flex: 1, height: i === BAR_CENTER ? 40 : 30, borderRadius: 2,
          background: bg, boxShadow: glow, transition: 'all 0.08s',
          margin: '0 1px', alignSelf: 'center',
        }} />
      );
    }
    return (
      <div style={{ display: 'flex', alignItems: 'center', width: '100%', padding: '0 2px' }}>
        {blocks}
      </div>
    );
  };

  return (
    <div style={{ height, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '10px 14px 12px', gap: 8 }}>
      {/* 固定圆框: 未开启=START 内容, 开启=音名; 占据位置恒定, 点击切换 (不引起上下位移) */}
      <button onClick={() => (isListening ? stopAudio() : startTuner())} style={{
        flexShrink: 0, cursor: 'pointer', width: 150, height: 150, borderRadius: '50%',
        position: 'relative',
        background: 'radial-gradient(circle at 50% 42%, rgba(60,255,160,0.28), rgba(60,255,160,0.05))',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
        boxShadow: isListening
          ? '0 0 38px rgba(60,255,160,0.30), inset 0 0 24px rgba(0,0,0,0.4)'
          : '0 0 34px rgba(60,255,160,0.25), inset 0 0 24px rgba(0,0,0,0.4)',
        border: `1.5px solid ${isListening ? 'rgba(60,255,160,0.6)' : 'rgba(60,255,160,0.35)'}`,
      }}>
        {/* C6: 进准瞬间绿色锁定闪光环 (key 递增重放) */}
        {flashKey > 0 && inTune && (
          <div key={flashKey} style={{
            position: 'absolute', inset: -7, borderRadius: '50%', pointerEvents: 'none',
            border: `2.5px solid ${GREEN}`, boxShadow: `0 0 22px ${GREEN}cc`,
            animation: 'tuneFlash 0.55s ease-out',
          }} />
        )}
        {isListening ? (
          <>
            <span style={{
              fontSize: 42, fontWeight: 800, letterSpacing: '0.04em', lineHeight: 1.05,
              color: inTune ? GREEN : 'rgba(210,235,255,0.95)',
              fontFamily: '"Barlow-Regular_2",sans-serif',
              textShadow: inTune ? `0 0 22px ${GREEN}99` : 'none',
              transition: 'all 0.12s',
            }}>
              {detectedNote || '—'}
            </span>
            <span style={{
              fontSize: 11, fontWeight: 600, color: inTune ? GREEN : 'rgba(110,150,190,0.6)',
              fontFamily: '"Barlow-Regular_2",sans-serif', letterSpacing: '0.08em', transition: 'all 0.12s',
            }}>
              {inTune ? `IN TUNE ✓ ${detectedFreq.toFixed(1)}Hz` : `${centsLabel}  ${detectedFreq.toFixed(1)}Hz`}
            </span>
          </>
        ) : (
          <>
            <span style={{ width: 14, height: 14, borderRadius: '50%', background: GREEN, boxShadow: `0 0 12px ${GREEN}` }} />
            <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: '0.14em', color: GREEN, fontFamily: '"Barlow-Regular_2",sans-serif', textShadow: `0 0 12px ${GREEN}88` }}>
              {t('tuner.start')}
            </span>
            <span style={{ fontSize: 10.5, color: 'rgba(60,255,160,0.5)', fontFamily: '"Barlow-Regular_2",sans-serif', letterSpacing: '0.08em' }}>
              {t('tuner.startHint')}
            </span>
          </>
        )}
      </button>

      {/* 刻度表 + 单一指示条 (左右布满; 中心绿/远离黄/靠近中心黄→绿渐变) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: '100%', flexShrink: 0 }}>
        {renderIndicator()}
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 4px' }}>
          <span style={{ fontSize: 11, color: YELLOW, fontFamily: 'monospace', opacity: 0.7 }}>♭ -50</span>
          <span style={{ fontSize: 11, color: GREEN, fontFamily: 'monospace', opacity: 0.8 }}>0</span>
          <span style={{ fontSize: 11, color: YELLOW, fontFamily: 'monospace', opacity: 0.7 }}>+50 ♯</span>
        </div>
      </div>

      {/* 琴弦灯带 / C4: chromatic 档显示 12 半音带 (无琴弦概念, 按音名字母高亮) */}
      {isChromatic ? (
        <div style={{ display: 'flex', gap: 3, justifyContent: 'center', flexShrink: 0, width: '100%' }}>
          {NOTE_NAMES.map(nm => {
            const on = isListening && !!detectedNote && detectedNote.replace(/\d+$/, '') === nm;
            return (
              <div key={nm} style={{
                flex: 1, height: 26, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: `1px solid ${on ? GREEN : 'rgba(60,255,160,0.13)'}`,
                background: on ? 'rgba(60,255,160,0.14)' : '#232428',
                color: on ? GREEN : 'rgba(60,255,160,0.3)',
                boxShadow: on ? `0 0 8px ${GREEN}55` : 'none',
                transition: 'all 0.15s',
              }}>
                <span style={{ fontSize: 11, fontWeight: on ? 800 : 500, fontFamily: '"Barlow-Regular_2",sans-serif' }}>{nm}</span>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 5, justifyContent: 'center', flexShrink: 0 }}>
          {strings.map((name, i) => (
            <div key={name} style={{
              width: inst === 'guitar7' ? 36 : 42, height: 26, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: `1.5px solid ${detectedString === i ? GREEN : 'rgba(60,255,160,0.16)'}`,
              background: detectedString === i ? 'rgba(60,255,160,0.12)' : '#232428',
              color: detectedString === i ? GREEN : 'rgba(60,255,160,0.3)',
              transition: 'all 0.15s',
            }}>
              <span style={{ fontSize: 12, fontWeight: detectedString === i ? 800 : 600, fontFamily: '"Barlow-Regular_2",sans-serif' }}>{name}</span>
            </div>
          ))}
        </div>
      )}

      {/* F 批 #2 (2026-09-03): 乐器 + 调式 → DropMenu (chromatic 无调式) */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0, width: '100%' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <DropMenu
            value={tunerMode}
            onChange={v => selectMode(v as TunerMode)}
            options={instOptions}
            accent={GREEN}
          />
        </div>
        {!isChromatic && (
          <div style={{ flex: 1, minWidth: 0 }}>
            <DropMenu
              value={tuning.id}
              onChange={selectTuning}
              options={tuningOptions}
              accent={GREEN}
              placeholder={t('tuner.tuning')}
            />
          </div>
        )}
      </div>

      {/* A4 校准行 (C5: 430–450, 0.5Hz 步进; 参考音 ♪) */}
      <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexShrink: 0, justifyContent: 'flex-end' }}>
        <span style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.35)', fontFamily: '"Barlow-Regular_2",sans-serif', letterSpacing: '0.1em' }}>A4</span>
        {/* C5 (2026-09-02): 校准范围 430–450, 0.5Hz 步进 (替换固定 440/442) */}
        <button onClick={() => setA4(a => Math.max(430, Math.round((a - 0.5) * 10) / 10))} style={a4StepBtnStyle}>−</button>
        <span style={{
          minWidth: 40, textAlign: 'center', fontSize: 12, fontWeight: 700, color: GREEN,
          fontFamily: 'monospace', lineHeight: 1,
        }}>
          {a4 % 1 === 0 ? String(a4) : a4.toFixed(1)}
        </span>
        <button onClick={() => setA4(a => Math.min(450, Math.round((a + 0.5) * 10) / 10))} style={a4StepBtnStyle}>+</button>
        <button onClick={() => { try { scheduleRefTone(getSynthCtx().currentTime + 0.05, a4, 0.8, 0.2); } catch {} }} style={{
          height: 24, borderRadius: 4, padding: '0 10px', cursor: 'pointer',
          background: 'rgba(60,255,160,0.08)', border: '1px solid rgba(60,255,160,0.25)',
          color: GREEN, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', fontFamily: '"Barlow-Regular_2",sans-serif',
        }}>
          ♪ {t('tuner.refTone')}
        </button>
      </div>

      {/* 电平表 (仅条, 无按钮无文字) */}
      <div style={{
        width: '100%', height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.07)', overflow: 'hidden',
        border: '1px solid rgba(255,255,255,0.05)', flexShrink: 0,
      }}>
        <div style={{
          height: '100%', width: `${Math.min(100, level * 100)}%`,
          background: level > 0.85 ? 'linear-gradient(90deg,#4cc9f0, rgb(255,200,80))' : 'linear-gradient(90deg,#4cc9f0, rgb(60,255,160))',
          transition: 'width 0.06s linear',
        }} />
      </div>
    </div>
  );
}
