import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * ★ 2026-10-17（用户要求）：开屏动画使用 B&F LOGO。
 *
 * 三层衔接，全程无白闪：
 *   原生 splash（深色 + 同位置 B&F）→ 本组件首帧（同底色 #24262b、同构图）
 *   → logo 放大淡入 + 扫光 + 细线展开 + BFX1 STUDIO 字标 → **持续跳动** + LOADING
 *   → 整层淡出进入主界面。
 *
 * ★ 2026-10-17 第二次调整（用户要求）：停留时长 1.05s → **3.2s**，
 *   logo 在入场结束后进入循环跳动（bounce），底部进度条走满 + LOADING 呼吸字。
 *   另加「轻触跳过」——回访用户嫌久可以直接点掉，默认仍然完整播完。
 *
 * 只在**冷启动**播一次：sessionStorage 打标 —— WebView 进程还在（切前后台）
 * 就不会重播；进程被杀重进才播，正是「开屏动画」应有的语义。
 */

const KEY = 'bfx_boot_played_v1';
const HOLD_MS = 3200;     // 停留（含跳动）
const OUT_MS = 400;       // 淡出
const HARD_MS = 4600;     // 硬兜底

export default function BootSplash() {
  const [mounted, setMounted] = useState(() => {
    try { return sessionStorage.getItem(KEY) !== '1'; } catch { return true; }
  });
  const [leaving, setLeaving] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const leave = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setLeaving(true);
    timers.current.push(setTimeout(() => setMounted(false), OUT_MS));
  };

  useEffect(() => {
    if (!mounted) return;
    try { sessionStorage.setItem(KEY, '1'); } catch { /* 隐私模式忽略 */ }
    timers.current = [
      setTimeout(() => setLeaving(true), HOLD_MS),
      setTimeout(() => setMounted(false), HOLD_MS + OUT_MS),
      setTimeout(() => { setLeaving(true); setMounted(false); }, HARD_MS),
    ];
    return () => timers.current.forEach(clearTimeout);
  }, [mounted]);

  if (!mounted) return null;

  return createPortal(
    <div
      className="boot-root"
      style={{ opacity: leaving ? 0 : 1 }}
      onPointerDown={leave}
    >
      <div className="boot-stage">
        <div className="boot-logo-wrap">
          {/* 抖动层单独一层：入场动画在 .boot-logo-wrap，循环跳动在 .boot-bounce，
              两层 transform 分开写，互相不会互相覆盖。 */}
          <div className="boot-bounce">
            <img className="boot-logo" src="/brand/logo-boot.png" alt="B&F" draggable={false} />
          </div>
        </div>
        <div className="boot-rule" />
        <div className="boot-word">BFX1&nbsp;STUDIO</div>
      </div>
      <div className="boot-bar"><i /></div>
      <div className="boot-loading">LOADING</div>
    </div>,
    document.body,
  );
}
