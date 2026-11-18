import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { getFloatHint, subscribeFloatHint, type HintState } from '../services/floatHint';

/**
 * 全局浮层提示的渲染宿主（v4.29）
 *
 * 位置：默认**顶栏下方居中**（`--sa-top` + 64px）；带 anchor 时贴着控件弹出。
 * 样式：与旋钮数值浮框 `.t3k-bubble` 同一套语言 —— 深底 `rgba(9,11,14,.96)`、
 *       1px 语义色描边、10px 圆角、不超过 86vw。
 * 层级：9998（旋钮浮框 9999 更高，拖旋钮时数值不会被提示盖住）。
 * 触控：整层 pointer-events:none，绝不挡按钮。
 */
export default function FloatHint() {
  const [hint, setHint] = useState<HintState | null>(getFloatHint());

  useEffect(() => subscribeFloatHint(setHint), []);

  if (!hint) return null;

  const card = (
    <div
      className={
        `fhint fhint-${hint.kind}`
        + (hint.sub ? '' : ' is-single')
        + (hint.leaving ? ' is-out' : '')
      }
    >
      <span className="fhint-main">{hint.main}</span>
      {hint.sub && <span className="fhint-sub">{hint.sub}</span>}
    </div>
  );

  /* ── 锚点模式：贴着被点的按钮（上方 8px；顶部不够就翻到下方） ── */
  if (hint.anchor) {
    const a = hint.anchor;
    const saTop = readSaTop();
    const half = 118;                       // 浮层半宽上限（min-width 120 + padding）
    const cx = a.left + a.width / 2;
    const x = Math.max(half + 8, Math.min(window.innerWidth - half - 8, cx));
    const below = a.top < saTop + 96;
    return createPortal(
      <div
        className="fhint-layer is-anchor"
        style={{
          left: x,
          top: below ? a.top + a.height + 8 : a.top - 8,
          transform: below ? 'translate(-50%, 0)' : 'translate(-50%, -100%)',
        }}
      >
        {card}
      </div>,
      document.body,
    );
  }

  /* ── 默认：顶栏下方居中 ── */
  return createPortal(
    <div className="fhint-layer" style={{ top: 'calc(var(--sa-top, 0px) + 64px)' }}>
      {card}
    </div>,
    document.body,
  );
}

function readSaTop(): number {
  try {
    return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sa-top')) || 0;
  } catch {
    return 0;
  }
}
