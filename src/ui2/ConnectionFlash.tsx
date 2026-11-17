import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BluetoothIcon } from 'lucide-react';

/**
 * ★ 2026-10-17（用户要求）：连接成功 → 全屏「闪烁 → 常亮」确认画面，停留 2.1s 再进首页/教程。
 * ★★ v3.68（2026-10-24 用户拍板 F）：**拆成两段**。
 *
 * 为什么：
 *   首连一次 `BleClient.connect()` 内部要串三段 GATT（connectGatt → 服务发现 → MTU 协商），
 *   冷启动还要动态 import 插件，2–4 秒很正常。旧实现这段时间界面只有按钮文字变「连接中」，
 *   用户体感就是「点了没反应 / 卡住了」，然后画面突然跳出来。
 *
 * 现在：
 *   connecting  点下按钮立刻出现 —— 蓝牙图标持续呼吸 + 「正在连接」，无进度条、不自动关闭；
 *   connected   连接建立后切换成「闪烁三下 → 常亮 2.1s → 淡出」的原成功画面。
 *
 * 两段共用同一个 portal 层，切换时不重建 DOM，所以从「正在连接」到「连接成功」
 * 是原地变文案 + 光晕亮起，没有黑一下的断层。
 */

const FLASH_MS = 620;
const HOLD_MS = 2100;
const OUT_MS = 320;
/** ★ v3.80（P1-13）：connecting 态停留上限。超过则转「连接超时」并给出口，
 *  否则 GATT 卡死 / 设备关机时这个 fixed z9997 层会永久盖住整个 App。
 *  ★★ 2026-11-17：12s → 25s。官方 BLE 插件 connect 默认超时就是 10s
 *  （iOS 含服务+特征发现），一次 connect 可能就要 10s；旧上限比它还短，
 *  导致设备还在正常连接中就被误报「未收到设备响应 / 连接失败」。
 *  给到 25s（≈10s connect + 一次退避重试 + 余量），超时才真正代表异常。 */
const DEFAULT_TIMEOUT_MS = 25000;

const BT = '#5bc8f5';

export type ConnectionPhase = 'connecting' | 'connected';

export interface ConnectionFlashProps {
  active: boolean;
  /** v3.68：默认按「连接成功」处理，保持旧调用点不用改 */
  mode?: ConnectionPhase;
  deviceName?: string;
  lang: 'zh' | 'en';
  onDone: () => void;
  /** v3.80（P1-13）：connecting 态超时毫秒数，默认 12000 */
  timeoutMs?: number;
  /** v3.80（P1-13）：用户主动取消 / 超时后关闭。未传则回落到 onDone */
  onCancel?: () => void;
}

export default function ConnectionFlash({
  active, mode = 'connected', deviceName, lang, onDone,
  timeoutMs = DEFAULT_TIMEOUT_MS, onCancel,
}: ConnectionFlashProps) {
  const [phase, setPhase] = useState<'flash' | 'steady'>('flash');
  const [leaving, setLeaving] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  const isConnecting = mode === 'connecting';

  useEffect(() => {
    if (!active) return;
    setPhase('flash');
    setLeaving(false);
    setTimedOut(false);
    /* 「正在连接」是等待态，不自己结束 —— 由连接结果（成功转 connected / 失败由上层收掉）驱动。
       ★ v3.80：但必须有**上限**，卡死时不能让用户无路可退。 */
    if (isConnecting) {
      const t = setTimeout(() => setTimedOut(true), timeoutMs);
      return () => clearTimeout(t);
    }
    const t1 = setTimeout(() => setPhase('steady'), FLASH_MS);
    const t2 = setTimeout(() => setLeaving(true), HOLD_MS);
    const t3 = setTimeout(() => doneRef.current(), HOLD_MS + OUT_MS);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [active, isConnecting, timeoutMs]);

  if (!active) return null;

  const steady = !isConnecting && phase === 'steady';
  const dead = isConnecting && timedOut;
  const exit = onCancel ?? onDone;

  return createPortal(
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9997,
        background: 'rgba(8,10,14,0.88)',
        backdropFilter: 'blur(7px)',
        WebkitBackdropFilter: 'blur(7px)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        opacity: leaving ? 0 : 1,
        transition: `opacity ${OUT_MS}ms ease`,
        animation: 'connIn 260ms cubic-bezier(.16,1,.3,1) both',
      }}
    >
      {/* 中心光晕 */}
      <div style={{
        position: 'absolute', width: 340, height: 340, borderRadius: '50%',
        background: `radial-gradient(circle, ${BT}${steady ? '38' : dead ? '10' : '22'} 0%, ${BT}16 40%, transparent 66%)`,
        pointerEvents: 'none',
        transition: 'background 320ms ease',
      }} />

      {/* 图标 + 扩散环 */}
      <div style={{ position: 'relative', width: 120, height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {steady && [0, 0.75].map((d, i) => (
          <span key={i} style={{
            position: 'absolute', width: 96, height: 96, borderRadius: '50%',
            border: `1.5px solid ${BT}c0`,
            animation: `btRing 2000ms cubic-bezier(.2,.6,.3,1) ${d}s infinite`,
          }} />
        ))}
        <BluetoothIcon
          size={58}
          color={dead ? 'rgba(155,163,178,.85)' : BT}
          style={{
            filter: dead
              ? 'none'
              : steady || isConnecting
                ? `drop-shadow(0 0 13px ${BT}cc) drop-shadow(0 0 32px ${BT}66)`
                : 'none',
            transition: 'filter 320ms ease',
            /* 等待态：2 秒一轮的慢呼吸（不是 210ms 的三次快闪，快闪看起来像"已经成功"）。
               ★ v3.80：超时后停掉呼吸，避免"看起来还在努力"的误导。 */
            animation: dead ? undefined
              : steady ? undefined
              : isConnecting ? 'btBreath 2000ms ease-in-out infinite'
              : 'btFlash 210ms linear 3',
          }}
        />
      </div>

      {/* 文案 */}
      <div style={{ marginTop: 26, textAlign: 'center', padding: '0 24px' }}>
        <div style={{
          fontSize: 19, fontWeight: 700, letterSpacing: '0.03em',
          fontFamily: '"Barlow-Regular_2", sans-serif', color: '#eef1f4',
        }}>
          {dead
            ? (lang === 'zh' ? '连接超时' : 'Connection timed out')
            : isConnecting
              ? (lang === 'zh' ? '正在连接' : 'Connecting')
              : (lang === 'zh' ? '连接成功' : 'Connected')}
        </div>
        <div style={{
          marginTop: 7, fontSize: 11.5, letterSpacing: '0.06em',
          fontFamily: '"Barlow-Regular_2", sans-serif',
          color: 'rgba(203,212,222,.72)',
          maxWidth: '68vw', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {deviceName || 'BFX1'}
        </div>
        {isConnecting && (
          <div style={{
            marginTop: 6, fontSize: 11, letterSpacing: '0.04em',
            fontFamily: '"Barlow-Regular_2", sans-serif', color: 'rgba(155,163,178,.72)',
            maxWidth: '72vw', lineHeight: 1.5,
          }}>
            {dead
              ? (lang === 'zh' ? '未收到设备响应，请确认设备已开机并靠近手机' : 'No response — check the device is powered on and nearby')
              : (lang === 'zh' ? '首次连接需要几秒，请稍候' : 'First connection takes a few seconds')}
          </div>
        )}
        {/* ★ v3.80（P1-13）：等待态必须给出口 —— 否则连接卡死时用户被永久困在这一层 */}
        {isConnecting && (
          <button
            type="button"
            onClick={exit}
            style={{
              marginTop: 20, minWidth: 108, height: 42,
              padding: '0 22px', borderRadius: 21,
              border: `1px solid ${dead ? 'rgba(240,111,33,.55)' : 'rgba(155,163,178,.34)'}`,
              background: dead ? 'rgba(240,111,33,.14)' : 'rgba(255,255,255,.06)',
              color: dead ? '#F06F21' : 'rgba(226,232,240,.9)',
              fontSize: 13.5, fontWeight: 600, letterSpacing: '0.04em',
              fontFamily: '"Barlow-Regular_2", sans-serif',
              cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
            }}
          >
            {dead
              ? (lang === 'zh' ? '关闭' : 'Close')
              : (lang === 'zh' ? '取消' : 'Cancel')}
          </button>
        )}
      </div>

      {/* 底部进度线：只在成功态走满，暗示"马上进入界面" */}
      {!isConnecting && (
        <div style={{
          position: 'absolute', left: '50%', bottom: '22%', transform: 'translateX(-50%)',
          width: 116, height: 2, borderRadius: 2, background: 'rgba(255,255,255,.08)', overflow: 'hidden',
        }}>
          <span style={{
            display: 'block', height: '100%', borderRadius: 2,
            background: `linear-gradient(90deg, ${BT}66, ${BT})`,
            animation: `connBar ${HOLD_MS}ms linear both`,
          }} />
        </div>
      )}
    </div>,
    document.body,
  );
}
