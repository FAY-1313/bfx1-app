/**
 * HwGuidePanel — 硬件按键教程（全屏面板）
 *
 * 设计要点（2026-11-02 用户拍板）：
 *   1. 设备图**只做显示**（LED + 按键高亮），不接受点击 —— 触屏上没法真的多指同时按；
 *   2. 用户操作的是「功能」按钮（下一个音色 / 下一组 / 看电量…），
 *      每个功能背后是一串按键动作，由界面演出来；
 *   3. 自动演示与手动点按共用同一份动作定义（data/deviceGuide.ts），不会两套逻辑。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  KEY_POS, LED_POS, LED_RGB, GROUP_RGB, GROUP_NAME, TONE_NAME, MODE_NAME,
  GUIDE_FEATURES, FEATURE_MAP, DEMO_STEPS, DEMO_SPEEDS, initialDemoState,
  type DemoState, type KeyId, type KeyAct,
} from '../data/deviceGuide';
import { FULLSCREEN_SAFE_STYLE } from '../utils/safeArea';

const ORANGE = '#F06F21';
const CARD_BG = 'rgba(28,29,33,0.97)';
const LINE = '#454b55';
const TEXT = '#EDEFF3';
const TEXT2 = '#c2c9d6';
const FONT = '"Barlow-Regular_2",sans-serif';

interface Props {
  open: boolean;
  /** 教程模式：顶部显示「跳过」，打开即自动演示 */
  tutorial?: boolean;
  onClose: () => void;
  lang?: 'zh' | 'en';
}

interface LedView {
  rgb: string;
  on: boolean;
  half?: boolean;
  blink?: boolean;
  dim?: boolean;
}

function computeLeds(s: DemoState): { ch: LedView[]; tn: LedView[] } {
  const chActive = s.ch - 1;
  const groupRgb = GROUP_RGB[chActive] ?? LED_RGB.WHITE;
  const ch: LedView[] = [];
  if (s.mode === 'battery') {
    for (let i = 0; i < 4; i++) ch.push({ rgb: LED_RGB.GREEN, on: i < s.bat, blink: false });
  } else if (s.mode === 'volume') {
    for (let j = 0; j < 4; j++) {
      const full = s.vol >= 2 * (j + 1);
      const half = !full && s.vol === 2 * j + 1;
      ch.push({ rgb: LED_RGB.BLUE, on: full || half, half });
    }
  } else if (s.mode === 'channel') {
    for (let k = 0; k < 4; k++) {
      ch.push({ rgb: s.mute ? LED_RGB.RED : LED_RGB.WHITE, on: true, blink: true, dim: k !== chActive });
    }
  } else {
    for (let m = 0; m < 4; m++) {
      ch.push({ rgb: s.mute ? LED_RGB.RED : LED_RGB.WHITE, on: m === chActive });
    }
  }
  const toneDim = s.mode !== 'idle';
  const tn: LedView[] = [];
  for (let t = 0; t < 4; t++) tn.push({ rgb: groupRgb, on: t === s.tone, dim: toneDim });
  return { ch, tn };
}

const GESTURE_MS: Record<KeyAct['gesture'], number> = { tap: 130, double: 330, long: 760, hold: 220 };

export default function HwGuidePanel({ open, tutorial = false, onClose, lang = 'zh' }: Props) {
  const [st, setSt] = useState<DemoState>(initialDemoState);
  const [held, setHeld] = useState<Set<KeyId>>(new Set());
  const [flash, setFlash] = useState<KeyId | null>(null);
  const [featId, setFeatId] = useState<string>(GUIDE_FEATURES[0].id);
  const [caption, setCaption] = useState('');
  const [playing, setPlaying] = useState(false);
  const [stepIdx, setStepIdx] = useState(-1);
  const [speed, setSpeed] = useState(0.75);
  const abortRef = useRef(false);
  const runningRef = useRef(false);

  const leds = useMemo(() => computeLeds(st), [st]);
  const feat = FEATURE_MAP[featId] ?? GUIDE_FEATURES[0];
  const zh = lang === 'zh';

  const sleep = useCallback((ms: number) => new Promise<void>((r) => setTimeout(r, Math.max(30, ms))), []);

  /** 播放一串按键动作；hold 会保持到整段结束，用于组合键的视觉表达 */
  const playActs = useCallback(async (acts: KeyAct[]) => {
    const heldSet = new Set<KeyId>();
    for (const act of acts) {
      if (abortRef.current) return;
      if (act.gesture === 'hold') {
        heldSet.add(act.key);
        setHeld(new Set(heldSet));
        await sleep(GESTURE_MS.hold / speed);
        continue;
      }
      /* 双击：闪两下 */
      if (act.gesture === 'double') {
        setFlash(act.key);
        await sleep(110 / speed);
        setFlash(null);
        await sleep(90 / speed);
        setFlash(act.key);
        await sleep(130 / speed);
        setFlash(null);
      } else {
        setFlash(act.key);
        await sleep(GESTURE_MS[act.gesture] / speed);
        setFlash(null);
      }
      if (act.patch) setSt((prev) => ({ ...prev, ...act.patch!(prev) }));
      await sleep(140 / speed);
    }
    setHeld(new Set());
  }, [sleep, speed]);

  const stopDemo = useCallback(() => {
    abortRef.current = true;
    runningRef.current = false;
    setPlaying(false);
  }, []);

  const runDemo = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    abortRef.current = false;
    setPlaying(true);
    setSt(initialDemoState);
    await sleep(500);
    for (let i = 0; i < DEMO_STEPS.length; i++) {
      if (abortRef.current) break;
      const s = DEMO_STEPS[i];
      setStepIdx(i);
      setFeatId(s.feat);
      setCaption(`${s.no} ${s.caption}`);
      await playActs(s.acts ?? FEATURE_MAP[s.feat].acts);
      if (abortRef.current) break;
      await sleep(620 / speed);
    }
    runningRef.current = false;
    setPlaying(false);
    if (!abortRef.current) setCaption(zh ? '演示结束 · 可点下面的功能按钮自己试' : 'Done');
  }, [playActs, sleep, speed, zh]);

  /** 教程模式：打开即自动播一遍 */
  useEffect(() => {
    if (!open) { stopDemo(); return; }
    setSt(initialDemoState);
    setStepIdx(-1);
    setCaption(zh ? '准备中…' : 'Ready');
    if (tutorial) {
      const t = setTimeout(() => { void runDemo(); }, 380);
      return () => { clearTimeout(t); stopDemo(); };
    }
    return () => stopDemo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tutorial]);

  const onFeature = useCallback(async (id: string) => {
    if (playing) return;
    const f = FEATURE_MAP[id];
    setFeatId(id);
    setCaption(`${f.label} · ${f.combo}`);
    abortRef.current = false;
    runningRef.current = true;
    setPlaying(true);
    await playActs(f.acts);
    runningRef.current = false;
    setPlaying(false);
  }, [playActs, playing]);

  if (!open) return null;

  const progress = stepIdx >= 0 ? (stepIdx + 1) / DEMO_STEPS.length : 0;

  return (
    <div style={{
      ...FULLSCREEN_SAFE_STYLE, zIndex: 60, background: '#24262b',
      display: 'flex', flexDirection: 'column', fontFamily: FONT, color: TEXT,
    }}>
      {/* 顶部栏 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
        borderBottom: `1px solid ${LINE}`, background: 'rgba(16,18,22,.98)',
      }}>
        <button onClick={onClose} style={{
          background: 'transparent', border: `1px solid ${LINE}`, color: TEXT2,
          borderRadius: 9, padding: '6px 12px', fontSize: 12, fontFamily: FONT,
        }}>{zh ? '返回' : 'Back'}</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: 0.4 }}>
            {zh ? '设备按键教程' : 'Hardware Guide'}
          </div>
          {tutorial && (
            <div style={{ height: 3, marginTop: 5, borderRadius: 2, background: '#22262E', overflow: 'hidden' }}>
              <div style={{
                height: '100%', width: `${Math.round(progress * 100)}%`,
                background: ORANGE, transition: 'width .3s ease',
              }} />
            </div>
          )}
        </div>
        {tutorial && (
          <button onClick={() => { stopDemo(); onClose(); }} style={{
            background: 'transparent', border: 'none', color: TEXT2,
            fontSize: 12, fontFamily: FONT, padding: '6px 8px',
          }}>{zh ? '跳过' : 'Skip'}</button>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px 18px' }}>
        {/* 设备俯视图 */}
        <div style={{
          position: 'relative', width: '100%', aspectRatio: '1920 / 1350',
          borderRadius: 14, overflow: 'hidden', background: '#F1F2F4',
          boxShadow: '0 8px 26px rgba(0,0,0,.45)',
        }}>
          <img src="/brand/device-top.jpeg" alt="BFX-1" style={{ width: '100%', height: '100%', display: 'block', objectFit: 'cover' }} />

          {/* LED 层 */}
          {leds.ch.map((l, i) => (
            <span key={`c${i}`} style={{
              position: 'absolute', left: `${LED_POS.ch.x[i]}%`, top: `${LED_POS.ch.y}%`,
              width: '2.6%', aspectRatio: '1', transform: 'translate(-50%,-50%)',
              borderRadius: '50%', pointerEvents: 'none', mixBlendMode: 'screen',
              opacity: l.on ? (l.dim ? 0.22 : l.half ? 0.4 : 0.92) : 0,
              background: `radial-gradient(circle, rgba(${l.rgb},.98) 0%, rgba(${l.rgb},.62) 30%, rgba(${l.rgb},.16) 56%, rgba(${l.rgb},0) 74%)`,
              animation: l.on && l.blink ? 'bfxLedBlink .58s steps(1,end) infinite' : undefined,
              transition: 'opacity .18s ease',
            }} />
          ))}
          {leds.tn.map((l, i) => (
            <span key={`t${i}`} style={{
              position: 'absolute', left: `${LED_POS.tn.x[i]}%`, top: `${LED_POS.tn.y}%`,
              width: '2.6%', aspectRatio: '1', transform: 'translate(-50%,-50%)',
              borderRadius: '50%', pointerEvents: 'none', mixBlendMode: 'screen',
              opacity: l.on ? (l.dim ? 0.22 : 0.92) : 0,
              background: `radial-gradient(circle, rgba(${l.rgb},.98) 0%, rgba(${l.rgb},.62) 30%, rgba(${l.rgb},.16) 56%, rgba(${l.rgb},0) 74%)`,
              transition: 'opacity .18s ease',
            }} />
          ))}

          {/* 按键高亮层（只显示，不可点） */}
          {(Object.keys(KEY_POS) as KeyId[]).map((k) => {
            const p = KEY_POS[k];
            const active = held.has(k) || flash === k;
            return (
              <div key={k} style={{
                position: 'absolute', left: `${p.x}%`, top: `${p.y}%`,
                width: '9.6%', height: '6.4%', transform: 'translate(-50%,-50%)',
                pointerEvents: 'none',
              }}>
                <div style={{
                  position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)',
                  width: '86%', height: '40%', borderRadius: 999,
                  border: `1.5px solid ${active ? ORANGE : 'rgba(240,111,33,0)'}`,
                  background: active ? 'rgba(240,111,33,.30)' : 'transparent',
                  boxShadow: active ? '0 0 0 4px rgba(240,111,33,.20), 0 0 14px rgba(240,111,33,.55)' : 'none',
                  transition: 'all .12s ease',
                }} />
                <div style={{
                  position: 'absolute', left: '50%', top: '100%', transform: 'translate(-50%, 2px)',
                  fontSize: 10, color: active ? ORANGE : 'rgba(30,33,38,.75)',
                  fontWeight: 700, whiteSpace: 'nowrap', letterSpacing: 0.3,
                }}>{p.label}</div>
              </div>
            );
          })}
        </div>

        {/* 状态条 */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginTop: 10,
          padding: '10px 12px', borderRadius: 12, background: CARD_BG, border: `1px solid ${LINE}`,
        }}>
          {[
            [zh ? '模式' : 'MODE', MODE_NAME[st.mode], st.mode === 'idle' ? TEXT : '#4CC9F0'],
            [zh ? '组 / 频道' : 'GROUP', `${st.ch} · CH ${st.ch}`, GROUP_NAME[st.ch - 1] === '白' ? TEXT : GROUP_NAME[st.ch - 1] === '绿' ? '#5BC88F' : GROUP_NAME[st.ch - 1] === '黄' ? '#E2C044' : '#4CC9F0'],
            [zh ? '音色' : 'TONE', TONE_NAME[st.tone], '#E2C044'],
            [zh ? '输入静音' : 'MUTE', st.mute ? (zh ? '已静音' : 'ON') : (zh ? '关' : 'OFF'), st.mute ? '#F05050' : TEXT2],
            [zh ? '音量' : 'VOLUME', `${st.vol} / 8`, '#4CC9F0'],
            [zh ? '电量' : 'BATTERY', `${st.bat} 格 · ${st.bat * 25}%`, '#5BC88F'],
          ].map(([k, v, c]) => (
            <div key={k as string} style={{ minWidth: 0 }}>
              <div style={{ fontSize: 9.5, color: TEXT2, letterSpacing: 0.5 }}>{k}</div>
              <div style={{
                fontSize: 12.5, fontWeight: 700, color: c as string,
                fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
                overflow: 'hidden', textOverflow: 'ellipsis',
              }}>{v}</div>
            </div>
          ))}
        </div>

        {/* 字幕 / 说明 */}
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 8,
          padding: '9px 12px', borderRadius: 10, background: CARD_BG,
          border: `1px solid ${caption ? 'rgba(240,111,33,.42)' : LINE}`,
          minHeight: 40,
        }}>
          <span style={{
            flex: 'none', width: 6, height: 6, borderRadius: '50%', marginTop: 6,
            background: caption ? ORANGE : TEXT2,
            boxShadow: caption ? '0 0 8px rgba(240,111,33,.8)' : 'none',
          }} />
          <div style={{ fontSize: 11.5, lineHeight: 1.55, color: caption ? TEXT : TEXT2 }}>
            {caption || (zh ? '点下面的功能按钮，看设备上对应的按键动作' : 'Tap a feature below')}
            {!playing && feat.note && (
              <div style={{ marginTop: 4, color: TEXT2, fontSize: 10.5 }}>{feat.note}</div>
            )}
          </div>
        </div>

        {/* 功能网格 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7, marginTop: 10 }}>
          {GUIDE_FEATURES.map((f) => {
            const active = f.id === featId;
            return (
              <button key={f.id} onClick={() => { void onFeature(f.id); }} disabled={playing} style={{
                textAlign: 'left', padding: '9px 11px', borderRadius: 11,
                background: active ? `${f.accent}1F` : CARD_BG,
                border: `1px solid ${active ? `${f.accent}99` : LINE}`,
                color: TEXT, fontFamily: FONT, opacity: playing && !active ? 0.45 : 1,
                transition: 'all .15s ease',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: f.accent, flex: 'none' }} />
                  <span style={{ fontSize: 12, fontWeight: 700 }}>{zh ? f.label : f.labelEn}</span>
                </div>
                <div style={{ fontSize: 10, color: TEXT2, marginTop: 3, lineHeight: 1.4 }}>{f.combo}</div>
              </button>
            );
          })}
        </div>

        {/* 演示控制 */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, marginTop: 12,
          padding: '9px 12px', borderRadius: 12, background: CARD_BG, border: `1px solid ${LINE}`,
        }}>
          <button
            onClick={() => { if (playing) stopDemo(); else void runDemo(); }}
            style={{
              flex: 1, padding: '9px 12px', borderRadius: 10, fontFamily: FONT,
              fontSize: 12, fontWeight: 700, letterSpacing: 0.3,
              background: playing ? 'transparent' : ORANGE,
              border: `1px solid ${playing ? LINE : ORANGE}`,
              color: playing ? TEXT2 : '#fff',
            }}
          >{playing ? (zh ? '■ 停止演示' : 'Stop') : (zh ? '▶ 自动演示' : 'Play')}</button>
          <button
            onClick={() => { stopDemo(); setSt(initialDemoState); setStepIdx(-1); setCaption(''); }}
            style={{
              padding: '9px 12px', borderRadius: 10, background: 'transparent',
              border: `1px solid ${LINE}`, color: TEXT2, fontSize: 12, fontFamily: FONT,
            }}
          >{zh ? '重置' : 'Reset'}</button>
          <div style={{ display: 'flex', gap: 4 }}>
            {DEMO_SPEEDS.map((s) => (
              <button key={s} onClick={() => setSpeed(s)} style={{
                padding: '6px 7px', borderRadius: 7, fontFamily: FONT, fontSize: 10.5,
                background: speed === s ? `${ORANGE}26` : 'transparent',
                border: `1px solid ${speed === s ? ORANGE : LINE}`,
                color: speed === s ? ORANGE : TEXT2,
              }}>{s}×</button>
            ))}
          </div>
        </div>

        {tutorial && !playing && stepIdx >= DEMO_STEPS.length - 1 && (
          <button onClick={() => { stopDemo(); onClose(); }} style={{
            width: '100%', marginTop: 12, padding: '12px 14px', borderRadius: 12,
            background: ORANGE, border: 'none', color: '#fff',
            fontSize: 13, fontWeight: 700, fontFamily: FONT, letterSpacing: 0.4,
          }}>{zh ? '开始使用' : 'Start'}</button>
        )}
      </div>

      <style>{`
        @keyframes bfxLedBlink { 0%,49%{opacity:.98} 50%,100%{opacity:.10} }
      `}</style>
    </div>
  );
}
