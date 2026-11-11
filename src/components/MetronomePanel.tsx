// ─── 节拍器: Soundbrenner 风格 ─────────────────────────────────────
// 中央圆形脉冲 (拍点 + 旋转 playhead + 重拍脉冲), BPM 圆形拨盘拖拽调节.
// 声音用 audioSynth 合成 click, 排程在 AudioContext 时钟上 (look-ahead),
// 消除 setTimeout 抖动. BPM 由 StudioPanel 统一共享 (节拍器/鼓机/循环同一 bpm,
// 各自界面仍可调), 拍号本地持久.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n';
import {
  getSynthCtx, scheduleClick,
  setClickGainDb, CLICK_GAIN_MIN_DB, CLICK_GAIN_MAX_DB,
} from '../utils/audioSynth';

interface MetronomePanelProps {
  bpm: number;
  setBpm: (n: number) => void;
  visible: boolean;
  accentColor: string;
}

const PRESETS = [60, 90, 120, 140, 160, 180];
// C7 (2026-09-02): 补 2/4、9/8、12/8 — 8 分音符类拍号重拍按 3 个 8 分音一组
const TIME_SIGS: [number, number][] = [[2, 4], [3, 4], [4, 4], [5, 4], [6, 8], [7, 8], [9, 8], [12, 8]];

export default function MetronomePanel({ bpm, setBpm, visible, accentColor }: MetronomePanelProps) {
  const { t } = useI18n();
  const [timeSig, setTimeSig] = useState<[number, number]>(() => {
    const s = localStorage.getItem('bfx_metro_sig');
    if (s) { const [a, b] = s.split('/').map(Number); if (a && b) return [a, b]; }
    return [4, 4];
  });
  const [isPlaying, setIsPlaying] = useState(false);
  const [beat, setBeat] = useState(-1);
  const [pulseKey, setPulseKey] = useState(0);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runningRef = useRef(false);
  const nextTickRef = useRef(0);
  const beatRef = useRef(-1);
  const bpmRef = useRef(bpm);
  const sigRef = useRef(timeSig);
  bpmRef.current = bpm;
  sigRef.current = timeSig;

  useEffect(() => { localStorage.setItem('bfx_metro_sig', `${timeSig[0]}/${timeSig[1]}`); }, [timeSig]);

  /* ★ v3.68（2026-10-24 用户要求）：节拍器音量可调，最大比原来响 10 dB。
     增益走 audioSynth 的 click 总线（含压缩器，+10 dB 也不削波），这里只负责 UI + 持久化。 */
  const [gainDb, setGainDb] = useState<number>(() => {
    const s = Number(localStorage.getItem('bfx_metro_gain_db'));
    if (!Number.isFinite(s) || localStorage.getItem('bfx_metro_gain_db') === null) return 0;
    return Math.max(CLICK_GAIN_MIN_DB, Math.min(CLICK_GAIN_MAX_DB, s));
  });
  useEffect(() => {
    setClickGainDb(gainDb);
    try { localStorage.setItem('bfx_metro_gain_db', String(gainDb)); } catch { /* ignore */ }
  }, [gainDb]);
  // 离开 Tab (studio 关闭/切到别的面板) 时停止发声; 再回来手动开. 同 Tab 切换不卸载
  // → 节拍器在别的面板播放时也保持 (jam 场景), 但关闭工作室即停.
  useEffect(() => { if (!visible) { stopScheduler(); setIsPlaying(false); } }, [visible]);

  const stopScheduler = () => {
    runningRef.current = false;
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    setBeat(-1);
    beatRef.current = -1;
  };

  const runScheduler = useCallback(() => {
    const ctx = getSynthCtx();
    const [n, d] = sigRef.current;
    const secPerBeat = d === 8 ? 60 / bpmRef.current / 2 : 60 / bpmRef.current;
    nextTickRef.current = ctx.currentTime + 0.06;
    beatRef.current = -1;
    runningRef.current = true;

    const tick = () => {
      if (!runningRef.current) return;
      const ac = getSynthCtx();
      while (nextTickRef.current < ac.currentTime + 0.12) {
        const next = (beatRef.current + 1) % n;
        beatRef.current = next;
        // C7: 8 分音符类拍号 (6/8 9/8 12/8…) 重拍落在每 3 个 8 分音组头 (0,3,6,9…),
        // 其余 8 分音轻 tick; 4 分音符类拍号仅首拍重音.
        const accent = d === 8 ? next % 3 === 0 : next === 0;
        scheduleClick(nextTickRef.current, accent ? 'accent' : d === 8 ? 'sub' : 'tick');
        setBeat(next);
        setPulseKey(k => k + 1);
        nextTickRef.current += secPerBeat;
      }
      timerRef.current = setTimeout(tick, 25);
    };
    timerRef.current = setTimeout(tick, 0);
  }, []);

  const toggle = () => {
    if (isPlaying) {
      stopScheduler();
      setIsPlaying(false);
    } else {
      stopScheduler();
      setIsPlaying(true);
      runScheduler();
    }
  };

  // C8 (2026-09-02): Tap Tempo — 连点测速 (最近 ≤6 个间隔均值, 间隔 >2.2s 视为重新起拍)
  const tapsRef = useRef<number[]>([]);
  const tapTempo = () => {
    const now = performance.now();
    const arr = tapsRef.current;
    if (arr.length && now - arr[arr.length - 1] > 2200) arr.length = 0;
    arr.push(now);
    if (arr.length > 6) arr.shift();
    if (arr.length >= 2) {
      let sum = 0;
      for (let i = 1; i < arr.length; i++) sum += arr[i] - arr[i - 1];
      const avg = sum / (arr.length - 1);
      if (avg > 0) setBpm(Math.max(30, Math.min(260, Math.round(60000 / avg))));
    }
  };

  useEffect(() => () => { stopScheduler(); }, []);

  const [n] = timeSig;

  // ── 圆形拨盘拖拽: 角度 → BPM (30~260) ──
  const dialRef = useRef<HTMLDivElement | null>(null);
  const onDialPointer = useCallback((e: React.PointerEvent) => {
    const el = dialRef.current;
    if (!el) return;
    // −/+ 按钮点击不当作拨盘拖拽 (按钮自身 stopPropagation 兜底)
    if ((e.target as HTMLElement).closest('button')) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const ang = Math.atan2(e.clientY - cy, e.clientX - cx);
    // 角度 -PI..PI → 0..1 (顺时针)
    let f = (ang + Math.PI) / (2 * Math.PI);
    const val = Math.round(30 + f * (260 - 30));
    setBpm(Math.max(30, Math.min(260, val)));
  }, [setBpm]);

  const beatAngles = Array.from({ length: n }, (_, i) => (i / n) * 360 - 90);
  const currentAngle = beat >= 0 ? beatAngles[beat] : -90;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '14px 14px 18px' }}>
      {/* 拍号选择 */}
      <div style={{ display: 'flex', gap: 5, width: '100%' }}>
        {TIME_SIGS.map(([nn, dd]) => {
          const sel = nn === timeSig[0] && dd === timeSig[1];
          return (
            <button key={`${nn}/${dd}`} onClick={() => setTimeSig([nn, dd])} style={{
              flex: 1, height: 30, borderRadius: 5, cursor: 'pointer',
              border: `1px solid ${sel ? `${accentColor}66` : 'rgba(120,120,130,0.2)'}`,
              background: sel ? `${accentColor}1a` : 'transparent',
              color: sel ? accentColor : 'rgba(160,160,170,0.5)',
              fontSize: 11, fontWeight: 700, fontFamily: '"Barlow-Regular_2",sans-serif',
            }}>
              {nn}/{dd}
            </button>
          );
        })}
      </div>

      {/* 圆形拨盘 + 脉冲 */}
      <div
        ref={dialRef}
        onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture?.(e.pointerId); onDialPointer(e); }}
        onPointerMove={(e) => { if (e.buttons === 1) onDialPointer(e); }}
        style={{ position: 'relative', width: 208, height: 208, touchAction: 'none', cursor: 'grab', userSelect: 'none', flexShrink: 0 }}
      >
        <svg width="208" height="208" viewBox="0 0 208 208">
          {/* 背景环 */}
          <circle cx="104" cy="104" r="98" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="3" />
          {/* playhead 弧 */}
          <circle
            cx="104" cy="104" r="98" fill="none"
            stroke={isPlaying ? accentColor : 'rgba(255,255,255,0.15)'}
            strokeWidth="3" strokeLinecap="round"
            strokeDasharray={`${(1 / n) * 100} ${100 - (1 / n) * 100}`}
            strokeDashoffset={-(((currentAngle + 90) / 360) * 100)}
            transform="rotate(-90 104 104)"
            style={{ filter: isPlaying ? `drop-shadow(0 0 6px ${accentColor})` : 'none', transition: 'stroke-dashoffset 0.1s linear' }}
          />
          {/* 拍点 */}
          {beatAngles.map((a, i) => {
            const rad = ((a - 90) * Math.PI) / 180;
            const x = 104 + 76 * Math.cos(rad + Math.PI);
            const y = 104 + 76 * Math.sin(rad + Math.PI);
            const cur = isPlaying && beat === i;
            const isAccent = i === 0;
            return (
              <circle key={i} cx={x} cy={y} r={cur ? 6 : 3.5}
                fill={cur ? accentColor : isAccent ? `${accentColor}66` : 'rgba(160,160,170,0.3)'}
                style={{ filter: cur ? `drop-shadow(0 0 5px ${accentColor})` : 'none', transition: 'all 0.08s' }}
              />
            );
          })}
        </svg>

        {/* 中央 BPM + 脉冲圈 */}
        <div key={pulseKey} style={{
          position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)',
          width: 132, height: 132, borderRadius: '50%',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(16,18,24,0.85)',
          border: `2px solid ${isPlaying && beat === 0 ? accentColor : 'rgba(255,255,255,0.1)'}`,
          boxShadow: isPlaying && beat === 0 ? `0 0 26px ${accentColor}55` : '0 0 14px rgba(0,0,0,0.4)',
          animation: isPlaying && beat === 0 ? 'pulseScale 0.5s ease-out' : 'none',
          transition: 'all 0.1s',
        }}>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontFamily: '"Barlow-Regular_2",sans-serif', letterSpacing: '0.2em' }}>BPM</span>
          <span style={{ fontSize: 34, fontWeight: 800, color: accentColor, fontFamily: '"Barlow-Regular_2",sans-serif', lineHeight: 1, textShadow: `0 0 14px ${accentColor}` }}>{bpm}</span>
          <div style={{ display: 'flex', gap: 16, marginTop: 2 }}>
            <button onPointerDown={(e) => e.stopPropagation()} onClick={() => setBpm(Math.max(30, bpm - 1))} style={dialBtnStyle}>−</button>
            <button onPointerDown={(e) => e.stopPropagation()} onClick={() => setBpm(Math.min(260, bpm + 1))} style={dialBtnStyle}>+</button>
          </div>
        </div>
        <div style={{ position: 'absolute', bottom: -6, left: '50%', transform: 'translateX(-50%)', fontSize: 10.5, color: 'rgba(255,255,255,0.22)', fontFamily: '"Barlow-Regular_2",sans-serif', whiteSpace: 'nowrap' }}>
          {t('metro.dragHint')}
        </div>
      </div>

      {/* 预设 */}
      <div style={{ display: 'flex', gap: 4, width: '100%' }}>
        {PRESETS.map(v => (
          <button key={v} onClick={() => setBpm(v)} style={{
            flex: 1, height: 26, borderRadius: 5, cursor: 'pointer',
            border: `1px solid ${bpm === v ? `${accentColor}55` : 'rgba(120,120,130,0.2)'}`,
            background: bpm === v ? `${accentColor}14` : 'transparent',
            color: bpm === v ? accentColor : 'rgba(160,160,170,0.5)',
            fontSize: 11, fontFamily: '"Barlow-Regular_2",sans-serif', fontWeight: 600,
          }}>
            {v}
          </button>
        ))}
      </div>

      {/* ★ v3.68：音量增益（−20 … +10 dB，默认 0 dB = 原音量；最大 +10 dB） */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '0 2px' }}>
        <span style={{
          fontSize: 11, fontWeight: 700, letterSpacing: '0.16em', color: 'rgba(160,160,170,0.55)',
          fontFamily: '"Barlow-Regular_2",sans-serif', flexShrink: 0,
        }}>VOL</span>
        <input
          type="range"
          min={CLICK_GAIN_MIN_DB}
          max={CLICK_GAIN_MAX_DB}
          step={1}
          value={gainDb}
          onChange={(e) => setGainDb(Number(e.target.value))}
          aria-label={t('metro.volume')}
          style={{ flex: 1, height: 22, accentColor, cursor: 'pointer', minWidth: 0 }}
        />
        <span style={{
          width: 46, textAlign: 'right', flexShrink: 0,
          fontSize: 11, fontWeight: 800, color: gainDb > 0 ? accentColor : 'rgba(190,196,206,0.75)',
          fontFamily: '"Barlow-Regular_2",sans-serif',
        }}>{gainDb > 0 ? `+${gainDb}` : gainDb} dB</span>
      </div>

      {/* 播放/停止 + Tap Tempo (C8) */}
      <div style={{ display: 'flex', gap: 6, width: '100%' }}>
        <button onClick={toggle} style={{
          flex: 1, height: 38, borderRadius: 8, cursor: 'pointer',
          background: isPlaying ? 'rgba(255,80,80,0.12)' : `${accentColor}12`,
          border: `1px solid ${isPlaying ? 'rgba(255,80,80,0.5)' : `${accentColor}44`}`,
          color: isPlaying ? 'rgb(255,120,80)' : accentColor,
          fontSize: 11, fontWeight: 700, letterSpacing: '0.2em', fontFamily: '"Barlow-Regular_2",sans-serif',
          boxShadow: isPlaying ? '0 0 12px rgba(255,80,80,0.18)' : `0 0 12px ${accentColor}1a`,
        }}>
          {isPlaying ? '■ STOP' : '▶ PLAY'}
        </button>
        <button onClick={tapTempo} style={{
          width: 100, height: 38, borderRadius: 8, cursor: 'pointer', flexShrink: 0,
          background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.14)',
          color: 'rgba(255,255,255,0.75)', fontSize: 11, fontWeight: 700, letterSpacing: '0.16em',
          fontFamily: '"Barlow-Regular_2",sans-serif',
        }}>
          TAP
        </button>
      </div>
    </div>
  );
}

const dialBtnStyle: React.CSSProperties = {
  width: 24, height: 24, borderRadius: '50%', cursor: 'pointer',
  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.18)',
  color: 'rgba(255,255,255,0.7)', fontSize: 14, lineHeight: 1,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontFamily: '"Barlow-Regular_2",sans-serif',
};
