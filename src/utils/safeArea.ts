import { Capacitor } from '@capacitor/core';
import type { CSSProperties } from 'react';

/**
 * 全屏浮层统一安全区填充（替代 `position:fixed; inset:0`）。
 * fixed 元素不受 #root 的 padding 影响、从视口 y=0 起，会被状态栏/灵动岛盖住。
 * 用 CSS 变量把四边都收进安全区，iOS + Android 沉浸式状态栏一并兼容。
 * 用法：<div style={{ ...FULLSCREEN_SAFE_STYLE, zIndex: 60, ... }}>…</div>
 */
export const FULLSCREEN_SAFE_STYLE: CSSProperties = {
  position: 'fixed',
  top: 'var(--sa-top, 0px)',
  bottom: 'var(--sa-bottom, 0px)',
  left: 'var(--sa-left, 0px)',
  right: 'var(--sa-right, 0px)',
};

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
    /* ★★ 2026-11-17（v4.20 · 按宽度+高度联合判机型，根治 iPhone 13 显示不全）：
       旧逻辑只按高度 h>=840 判灵动岛(59)，而 iPhone 13=844、13 Pro=852、
       13 Pro Max=926 全都 >=840 → 被误判成灵动岛、顶部多留 12px、底部留白、
       内容被压缩显示不全。真实逻辑分辨率：
         SE(1/2/3) 375x667 / 老机型 ~667-700 → 状态栏 20、无 Home 条 padding
         iPhone X/XS/11 Pro 375x812 → 刘海 47 / 34
         iPhone 13/13 Pro/14 390x844、393x852 → 刘海 47 / 34
         iPhone 13/14 Pro Max 428x926、430x932 → 刘海/灵动岛 47~59 / 34
         iPhone 14 Pro/15 系列（灵动岛）→ 59 / 34
       单靠高度无法区分 13 Pro(852) 与 14 Pro(852)、13 Pro Max(926) 与 15 Pro Max(932)。
       故联合宽度判断，并对「灵动岛 vs 刘海同高」的边界取更稳妥的 47（宁可少留、不遮挡）。
       注意：这段只是 env()==0 时的兜底；env 正常时优先用真值。 */
    const w = window.screen.width || 0;
    const h = window.screen.height || 0;
    const iPad = w >= 700;               // iPad 全系竖屏宽度 ≥768
    const isDynamicIsland = h >= 932 && w >= 420;  // 仅 14/15 Pro Max 级大屏判灵动岛
    if (iPad) {
      /* iPad：无 Home 指示条机型 bottom=0；全面屏 iPad Pro 底部手势区 20~34。
         env() 正常时不会进这里；这里只是 env=0 的兜底。 */
      top = top || 20;
      bottom = bottom || 0;
    } else if (isDynamicIsland) {
      top = 59; bottom = bottom || 34;
    } else if (h >= 780) {
      /* 刘海机型（X/11/12/13/14 全系，含 Pro/Max）统一 47/34。
         13 Pro Max(926) 等若实为灵动岛，env 正常时会给 59；这里兜底取 47 更安全。 */
      top = 47; bottom = bottom || 34;
    } else if (h >= 640) {
      top = 20; bottom = bottom || 0;    // 老机型 / SE（667）
    }
  }

  /* ★★ 2026-11-17（v4.21 · 安卓返回键被状态栏盖住根治）：
     Android 15+/16（本项目 targetSdk 36）强制 edge-to-edge，WebView 画到状态栏下方，
     且 env(safe-area-inset-*) 常报 0。MainActivity 注册了 BFX1Insets 同步接口，
     从这里拉取真实状态栏/导航条高度（dp=CSS px）。凡 env 已给值就以 env 为准，
     只有 env=0 才用原生值兜底，避免双重留白。 */
  if (Capacitor.getPlatform() === 'android') {
    const bridge = (window as any).BFX1Insets;
    if (bridge) {
      try {
        if (top === 0 && typeof bridge.getTop === 'function') top = Number(bridge.getTop()) || 0;
        if (bottom === 0 && typeof bridge.getBottom === 'function') bottom = Number(bridge.getBottom()) || 0;
      } catch { /* 接口异常：保持 env 值 */ }
    }
  }

  const root = document.documentElement.style;
  root.setProperty('--sa-top', `${top}px`);
  root.setProperty('--sa-bottom', `${bottom}px`);
  root.setProperty('--sa-left', `${left}px`);
  root.setProperty('--sa-right', `${right}px`);
}
