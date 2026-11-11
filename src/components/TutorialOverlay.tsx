/**
 * TutorialOverlay — 分步开机教程浮层 (spotlight 挖洞 + 气泡提示 + 步进导航)
 *
 * 定位方式: 每步通过 `data-tour="xxx"` 选择器找到目标元素,
 * 先执行 step.action (如切换模块页), 再 scrollIntoView 使其进入视口,
 * 之后用 getBoundingClientRect 计算挖洞矩形与气泡位置。
 * 无 target 的步骤 (欢迎/完成) 渲染居中卡片, 无挖洞。
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export interface TourStep {
  /** [data-tour] 选择器值; 缺省=居中卡片步骤 */
  target?: string;
  /** 气泡相对目标的位置 */
  placement?: 'top' | 'bottom' | 'left' | 'right';
  /** 进入该步时执行的命名动作, 交给父组件处理 */
  action?: string;
  /** action 后等待毫秒数 (默认 560, 无 action 默认 80) */
  delay?: number;
  /** 该步在卡片内显示中/英文切换器 (欢迎页) */
  lang?: boolean;
  title: string;
  body: string;
}

interface TutorialOverlayProps {
  steps: TourStep[];
  active: number;
  onChange: (idx: number) => void;
  onClose: () => void;
  onAction?: (action: string) => void;
  labels: { prev: string; next: string; done: string };
  /** 当前语言 (用于卡片内语言切换器高亮) */
  lang?: 'en' | 'zh';
  onSetLang?: (lang: 'en' | 'zh') => void;
}

const CARD_BG = 'rgba(38,39,44,0.93)';
const CARD_BORDER = 'rgba(96,98,108,0.72)';
const ACCENT = 'rgb(240,111,33)';

const navBtnStyle: React.CSSProperties = {
  padding: '7px 14px', borderRadius: 999, cursor: 'pointer',
  fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
  fontFamily: '"Barlow-Regular_2",sans-serif', border: '1px solid',
  display: 'flex', alignItems: 'center', gap: 4,
};

function TourCard({
  step, idx, total, labels, lang, onSetLang, onPrev, onNext, onClose,
}: {
  step: TourStep; idx: number; total: number;
  labels: { prev: string; next: string; done: string };
  lang?: 'en' | 'zh';
  onSetLang?: (lang: 'en' | 'zh') => void;
  onPrev: () => void; onNext: () => void; onClose: () => void;
}) {
  return (
    <div style={{
      background: CARD_BG, border: `1px solid ${CARD_BORDER}`, borderRadius: 16,
      /* ★ 2026-10-17：毛玻璃 —— 气泡必然会盖住一部分界面，用半透明+模糊让背后的
         内容还能透出轮廓，观感上"浮在上面"而不是"糊了一块深色板"。 */
      backdropFilter: 'blur(16px) saturate(1.15)',
      WebkitBackdropFilter: 'blur(16px) saturate(1.15)',
      boxShadow: '0 24px 70px rgba(0,0,0,0.62), 0 0 0 1px rgba(0,0,0,0.35)',
      color: '#ececec', padding: '14px 15px 11px',
      boxSizing: 'border-box',
    }}>
      {/* Header: title + close */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: ACCENT, boxShadow: `0 0 6px ${ACCENT}`, flexShrink: 0 }} />
          <span style={{ fontSize: 14, fontWeight: 800, letterSpacing: '0.03em', fontFamily: '"Barlow-Regular_2",sans-serif', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{step.title}</span>
        </div>
        <button onClick={onClose} title={labels.done}
          style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '0 4px', flexShrink: 0 }}>×</button>
      </div>
      {/* Body */}
      <div style={{ fontSize: 12.5, lineHeight: 1.68, color: 'rgba(255,255,255,0.82)', fontFamily: '"Barlow-Regular_2",sans-serif', whiteSpace: 'pre-line' }}>
        {step.body}
      </div>
      {/* 语言切换器 (欢迎页) */}
      {step.lang && onSetLang && (
        <div style={{ display: 'flex', gap: 4, marginTop: 14, background: '#1d1e22', border: '1px solid #3f4045', borderRadius: 999, padding: 3 }}>
          {(['en', 'zh'] as const).map((l) => (
            <button key={l} onClick={() => onSetLang(l)} style={{
              flex: 1, padding: '6px 12px', borderRadius: 999, cursor: 'pointer',
              fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
              fontFamily: '"Barlow-Regular_2",sans-serif', border: 'none',
              background: lang === l ? `${ACCENT}26` : 'transparent',
              color: lang === l ? 'rgb(255,150,70)' : '#9aa0a6',
              transition: 'all 0.12s',
            }}>
              {l === 'en' ? 'EN' : '中文'}
            </button>
          ))}
        </div>
      )}
      {/* Nav row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14 }}>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontFamily: '"Barlow-Regular_2",sans-serif', letterSpacing: '0.08em', marginRight: 'auto', whiteSpace: 'nowrap' }}>
          {idx + 1} / {total}
        </span>
        {idx > 0 && (
          <button onClick={onPrev} style={{ ...navBtnStyle, background: 'rgba(255,255,255,0.05)', borderColor: '#3f4045', color: '#9aa0a6' }}>
            ‹ {labels.prev}
          </button>
        )}
        <button onClick={onNext} style={{ ...navBtnStyle, background: `${ACCENT}22`, borderColor: ACCENT, color: ACCENT }}>
          {idx === total - 1 ? labels.done : `${labels.next} ›`}
        </button>
      </div>
    </div>
  );
}

export default function TutorialOverlay({ steps, active, onChange, onClose, onAction, labels, lang, onSetLang }: TutorialOverlayProps) {
  const step = steps[active];
  const hasTarget = !!step?.target;
  const bubbleRef = useRef<HTMLDivElement>(null);
  const [centered, setCentered] = useState(false);
  const [box, setBox] = useState<{ top: number; left: number; width: number; height: number; radius: string } | null>(null);
  const [bubble, setBubble] = useState<{ top: number; left: number; arrow?: { edge: 'top' | 'bottom' | 'left' | 'right'; off: number } } | null>(null);

  const measure = useCallback(() => {
    const s = steps[active];
    if (!s?.target) { setCentered(true); setBox(null); setBubble(null); return; }
    const el = document.querySelector<HTMLElement>(`[data-tour="${s.target}"]`);
    const b = bubbleRef.current;
    if (!el || !b) { setCentered(true); setBox(null); setBubble(null); return; }
    setCentered(false);
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    // 目标尚不在视口内 (如切页完成前) → 暂不定位, 避免挖洞偏到屏幕外
    if (r.right < 0 || r.bottom < 0 || r.left > vw || r.top > vh) {
      setBox(null); setBubble(null);
      return;
    }
    const bw = b.offsetWidth || 300;
    const bh = b.offsetHeight || 180;
    const placement = s.placement ?? 'bottom';

    /* ★ 2026-10-17（用户反馈「选框有遮挡，看不清」）：
       旧逻辑只按 placement 算一次位置再 clamp 进视口 —— 结果气泡经常正好压在
       被高亮的目标上。现在按「首选方向 → 其余三个方向」依次试位，
       选**与目标矩形零重叠**的那一侧；都不行就选重叠面积最小的。
       这样挖洞里的东西永远能看见。 */
    const GAP = 14;
    const clampv = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(v, hi));
    const overlap = (t: number, l: number) => {
      const ox = Math.min(l + bw, r.right) - Math.max(l, r.left);
      const oy = Math.min(t + bh, r.bottom) - Math.max(t, r.top);
      return ox > 0 && oy > 0 ? ox * oy : 0;
    };

    type Dir = 'top' | 'bottom' | 'left' | 'right';
    const order: Dir[] = [placement];
    (['bottom', 'top', 'right', 'left'] as Dir[]).forEach((p) => { if (p !== placement) order.push(p); });

    let chosen: { dir: Dir; top: number; left: number; ov: number } | null = null;
    for (const dir of order) {
      let t0 = 0, l0 = 0;
      if (dir === 'bottom') { t0 = r.bottom + GAP; l0 = r.left + r.width / 2 - bw / 2; }
      else if (dir === 'top') { t0 = r.top - bh - GAP; l0 = r.left + r.width / 2 - bw / 2; }
      else if (dir === 'left') { t0 = r.top + r.height / 2 - bh / 2; l0 = r.left - bw - GAP; }
      else { t0 = r.top + r.height / 2 - bh / 2; l0 = r.right + GAP; }
      l0 = clampv(l0, 12, vw - bw - 12);
      t0 = clampv(t0, 12, vh - bh - 12);
      const ov = overlap(t0, l0);
      if (!chosen || ov < chosen.ov) chosen = { dir, top: t0, left: l0, ov };
      if (ov === 0) break;                       // 完全不挡 → 立刻采用
    }
    const top = chosen.top;
    const left = chosen.left;

    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    let arrow: { edge: 'top' | 'bottom' | 'left' | 'right'; off: number } | undefined;
    if (chosen.dir === 'bottom') arrow = { edge: 'top', off: cx };
    else if (chosen.dir === 'top') arrow = { edge: 'bottom', off: cx };
    else if (chosen.dir === 'left') arrow = { edge: 'right', off: cy };
    else arrow = { edge: 'left', off: cy };
    if (arrow.edge === 'top' || arrow.edge === 'bottom') {
      arrow.off = clampv(arrow.off - left, 20, bw - 20);
    } else {
      arrow.off = clampv(arrow.off - top, 20, bh - 20);
    }
    // 读取目标自身圆角 → 挖洞贴合目标形状 (胶囊/按钮=全圆角)
    let radius = '10px';
    try { radius = window.getComputedStyle(el).borderRadius || '10px'; } catch { /* ignore */ }
    setBox({ top: r.top, left: r.left, width: r.width, height: r.height, radius });
    setBubble({ top, left, arrow });
  }, [active, steps]);

  // 进入新步骤: 执行 action → 等待 → 把目标滚入视口 → 测量定位
  useEffect(() => {
    const s = steps[active];
    if (!s) return;
    if (s.action) onAction?.(s.action);
    if (!s.target) { setBox(null); setBubble(null); return; }
    const delay = s.delay ?? (s.action ? 600 : 80);
    const timers: ReturnType<typeof setTimeout>[] = [];
    timers.push(setTimeout(() => {
      const el = document.querySelector<HTMLElement>(`[data-tour="${s.target}"]`);
      if (el) el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' });
      setTimeout(measure, 120);
      // 平滑滚动可能未完全到位, 再补测一次
      timers.push(setTimeout(measure, 360));
    }, delay));
    return () => timers.forEach(clearTimeout);
  }, [active, steps, onAction, measure]);

  // 窗口尺寸/滚动变化时重测: 滚动停止后 90ms 补测一次, 保证挖洞始终贴合目标
  // (模块页切换的平滑滚动、页面内部滚动都会触发; capture 捕获子元素 scroll)
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null;
    const onMove = () => {
      if (t) clearTimeout(t);
      t = setTimeout(measure, 90);
    };
    document.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    window.addEventListener('orientationchange', onMove);
    return () => {
      document.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
      window.removeEventListener('orientationchange', onMove);
      if (t) clearTimeout(t);
    };
  }, [measure]);

  /* ★ 2026-10-17 修死锁：居中分支原来不渲染 bubbleRef 节点 →
     measure() 永远拿不到气泡尺寸 → 一旦居中过一次（例如 target 在切页动画中
     暂时不存在）就再也不会回到"挖洞定位"形态。
     现在居中卡片也挂了 bubbleRef，并在居中态补测一次，能定位就切回定位态。 */
  useEffect(() => {
    if (!centered || !steps[active]?.target) return;
    const t = setTimeout(measure, 60);
    return () => clearTimeout(t);
  }, [centered, active, steps, measure]);

  // 居中卡片 (欢迎/完成 等无 target 步骤, 或 target 未找到时回退)
  if (!hasTarget || centered) {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <div ref={bubbleRef} style={{ width: 'min(340px, 100%)' }}>
          <TourCard
            step={step!}
            idx={active}
            total={steps.length}
            labels={labels}
            lang={lang}
            onSetLang={onSetLang}
            onPrev={() => onChange(active - 1)}
            onNext={() => (active === steps.length - 1 ? onClose() : onChange(active + 1))}
            onClose={onClose}
          />
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 500 }}>
      {/* 挖洞遮罩: box-shadow 铺满屏幕, 洞内显示目标; 圆角跟随目标形状
          ★ 2026-10-17（用户反馈「看不清图片」）：原来遮罩是 rgba(0,0,0,0.82)，
            几乎纯黑 —— 挖洞里能看见，但周围一片漆黑，完全失去上下文，
            用户不知道这个控件在界面的哪个位置。降到 0.52，并给洞加一圈橙色柔光，
            既保留"聚焦"感，又能看清整体界面。 */}
      {box && (
        <div style={{
          position: 'fixed', top: box.top, left: box.left, width: box.width, height: box.height,
          borderRadius: box.radius,
          boxShadow: '0 0 0 9999px rgba(0,0,0,0.52)',
          border: '2px solid rgba(240,111,33,0.95)',
          outline: '6px solid rgba(240,111,33,0.13)',
          pointerEvents: 'none', zIndex: 1,
          transition: 'top 0.18s ease, left 0.18s ease, width 0.18s ease, height 0.18s ease',
        }} />
      )}

      {/* 气泡 (隐藏直到定位完成; 常驻以便测量尺寸) */}
      <div
        ref={bubbleRef}
        style={{
          position: 'fixed', zIndex: 2,
          width: 312, maxWidth: 'calc(100vw - 24px)',
          maxHeight: 'calc(100vh - 24px)', overflowY: 'auto',
          top: bubble?.top ?? 0, left: bubble?.left ?? 0,
          visibility: bubble ? 'visible' : 'hidden',
          transition: 'all 0.22s ease',
        }}
      >
        {bubble?.arrow && (
          <div style={{
            position: 'absolute',
            width: 12, height: 12, background: CARD_BG,
            boxShadow: `0 0 0 1px ${CARD_BORDER}`,
            transform: 'rotate(45deg)',
            ...(bubble.arrow.edge === 'top' ? { top: -6, left: bubble.arrow.off - 6 } :
              bubble.arrow.edge === 'bottom' ? { bottom: -6, left: bubble.arrow.off - 6 } :
              bubble.arrow.edge === 'left' ? { left: -6, top: bubble.arrow.off - 6 } :
              { right: -6, top: bubble.arrow.off - 6 }),
          }} />
        )}
        <TourCard
          step={step!}
          idx={active}
          total={steps.length}
          labels={labels}
          lang={lang}
          onSetLang={onSetLang}
          onPrev={() => onChange(active - 1)}
          onNext={() => (active === steps.length - 1 ? onClose() : onChange(active + 1))}
          onClose={onClose}
        />
      </div>
    </div>
  );
}
