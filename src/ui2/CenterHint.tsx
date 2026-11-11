import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * ★ 2026-10-17（用户反馈）：双击 / 长按 TONE 键的提示原来走 sonner（底部居中、11px），
 *   手指正按在底部 TONE 键上时完全被手挡住，字也太小。
 *   改为**屏幕中部居中**的大号提示卡：
 *     · 垂直 34% —— 拇指操作区在屏幕下 1/3，永远不会挡；
 *     · 字号 15px / 图标 26px —— 一瞥即读；
 *     · 走 body portal + fixed，不受页面容器 overflow / transform 影响。
 */

export type HintKind = 'reset' | 'lock' | 'unlock';

export interface HintPayload {
  seq: number;          // 每次 +1，用于重播
  kind: HintKind;
  text: string;
}

const HOLD_MS = 1350;   // 停留
const OUT_MS = 300;     // 淡出

function Glyph({ kind }: { kind: HintKind }) {
  const stroke = kind === 'unlock' ? 'rgba(200,206,214,.9)' : '#F06F21';
  if (kind === 'reset') {
    return (
      <svg width={26} height={26} viewBox="0 0 24 24" fill="none"
        stroke={stroke} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 12a9 9 0 1 0 3.2-6.9" />
        <path d="M3 4.5V10h5.5" />
      </svg>
    );
  }
  // lock / unlock
  return (
    <svg width={26} height={26} viewBox="0 0 24 24" fill="none"
      stroke={stroke} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="10.5" width="16" height="10.5" rx="2.6" />
      <path d={kind === 'lock' ? 'M8 10.5V7a4 4 0 0 1 8 0v3.5' : 'M8 10.5V7a4 4 0 0 1 7.4-2'} />
      <circle cx="12" cy="15.6" r="1.5" fill={stroke} stroke="none" />
    </svg>
  );
}

export default function CenterHint({ hint }: { hint: HintPayload | null }) {
  const [cur, setCur] = useState<HintPayload | null>(null);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (!hint) return;
    setCur(hint);
    setLeaving(false);
    const t1 = setTimeout(() => setLeaving(true), HOLD_MS);
    const t2 = setTimeout(() => setCur(null), HOLD_MS + OUT_MS);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [hint?.seq]);

  if (!cur) return null;

  return createPortal(
    <div style={{
      position: 'fixed', left: 0, right: 0, top: '34%',
      display: 'flex', justifyContent: 'center',
      zIndex: 9998, pointerEvents: 'none',
    }}>
      <div
        key={cur.seq}
        style={{
          display: 'flex', alignItems: 'center', gap: 14,
          padding: '16px 26px',
          borderRadius: 20,
          background: 'linear-gradient(180deg, rgba(38,40,47,.97), rgba(24,25,30,.97))',
          border: '1px solid rgba(240,111,33,.42)',
          boxShadow: '0 16px 44px rgba(0,0,0,.62), 0 0 0 1px rgba(0,0,0,.35) inset, 0 0 26px rgba(240,111,33,.14)',
          backdropFilter: 'blur(14px)',
          animation: leaving
            ? `hintOut ${OUT_MS}ms ease forwards`
            : 'hintIn 220ms cubic-bezier(.16,1,.3,1) both',
          maxWidth: '84vw',
        }}
      >
        <Glyph kind={cur.kind} />
        <span style={{
          fontFamily: '"Barlow-Regular_2",sans-serif',
          fontSize: 15, fontWeight: 700, letterSpacing: '0.02em',
          color: '#f2f3f5', whiteSpace: 'nowrap', lineHeight: 1.25,
        }}>
          {cur.text}
        </span>
      </div>
    </div>,
    document.body,
  );
}
