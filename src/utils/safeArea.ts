import { Capacitor } from '@capacitor/core';

/**
 * ★ 2026-11-11（用户反馈「上方与 iOS 系统 UI 重叠，显示不了也点不到」）：
 * WKWebView 在「内容延伸到状态栏」模式下偶尔会把 env(safe-area-inset-*) 报成 0，
 * 顶栏就被灵动岛/刘海压住、底部 Dock 被 Home 指示条盖住。
 *
 * 这里启动时实测一次 env()，若在 iOS 上拿到 0，就按屏幕逻辑高度兜底：
 *   ≥840 → 灵动岛机型（59 / 34）
 *   ≥780 → 刘海机型（47 / 34）
 *   ≥700 → 老机型状态栏（20 / 0）
 * 结果写进 --sa-*，index.css 的 #root padding 直接消费这些变量。
 */
export function applySafeAreaInsets(): void {
  if (typeof document === 'undefined') return;

  const probe = document.createElement('div');
  probe.setAttribute('aria-hidden', 'true');
  probe.style.cssText =
    'position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;pointer-events:none;' +
    'padding-top:env(safe-area-inset-top,0px);' +
    'padding-bottom:env(safe-area-inset-bottom,0px);' +
    'padding-left:env(safe-area-inset-left,0px);' +
    'padding-right:env(safe-area-inset-right,0px);';
  document.body.appendChild(probe);
  const cs = getComputedStyle(probe);
  let top = parseFloat(cs.paddingTop) || 0;
  let bottom = parseFloat(cs.paddingBottom) || 0;
  const left = parseFloat(cs.paddingLeft) || 0;
  const right = parseFloat(cs.paddingRight) || 0;
  probe.remove();

  if (Capacitor.getPlatform() === 'ios' && top === 0) {
    /* ★★ 2026-11-17（全机型适配）：必须用 **screen.height**（设备逻辑高度，恒定），
       不能用 innerHeight —— TestFlight 顶部横幅 / 键盘弹出 / Safari 工具栏都会让
       innerHeight 变小，导致把灵动岛机型误判成刘海、把刘海误判成老机型，
       顶栏就又被压住（用户报的「返回点不到」）。screen 不受这些影响。 */
    const w = window.screen.width || 0;
    const h = window.screen.height || 0;
    const iPad = w >= 700;               // iPad 全系竖屏宽度 ≥768
    if (iPad) {
      /* iPad：无 Home 指示条机型 bottom=0；全面屏 iPad Pro 底部手势区 20~34。
         env() 正常时不会进这里；这里只是 env=0 的兜底。 */
      top = top || 20;
      bottom = bottom || 0;
    } else if (h >= 840) {               // iPhone 灵动岛（14/15/16 Pro 等）
      top = 59; bottom = bottom || 34;
    } else if (h >= 780) {               // iPhone 刘海（X/11/12/13 等）
      top = 47; bottom = bottom || 34;
    } else if (h >= 700) {               // iPhone 老机型（带状态栏、无刘海）
      top = 20;
    }
  }

  const root = document.documentElement.style;
  root.setProperty('--sa-top', `${top}px`);
  root.setProperty('--sa-bottom', `${bottom}px`);
  root.setProperty('--sa-left', `${left}px`);
  root.setProperty('--sa-right', `${right}px`);
}
