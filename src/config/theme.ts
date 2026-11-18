/**
 * 底板配色（v4.31）
 *
 * ══════════ 改了什么（v4.31 相对 v4.30）══════════
 *  v4.30 试了一版"整页浅色"（卡片、旋钮、文字全换成暖白）—— 用户看过后否掉了，
 *  本版已把那 174 行 CSS **整体回滚**。v4.31 按新要求大幅缩小范围：
 *    ① 主页底板（音色页背景）
 *    ② 顶部菜单栏
 *    ③ 底部菜单栏
 *  三块**同一种灰**一起切；卡片 / 旋钮 / 文字 / 照片 / 弹层全部保持原样。
 *
 * ══════════ 回滚（三种，从轻到重）══════════
 *  ① **功能开关**：`THEME_SWITCH = false` → 三块恒为原深色，LOGO 单击只播弹跳动画。
 *  ② **用户侧**：LOGO 单击在原深色 / 灰色之间切，选择记忆。
 *  ③ **版本回滚**：02_apk 保留 v4.29（浅色之前）与 v4.30 的包；iOS 装回对应 build。
 *
 * ══════════ 灰度为什么是这个值 ══════════
 *  三块要"同色"，而顶栏/底栏上的文字仍是原来的浅色（#e8eaed / #a4adbd）。
 *  在"其他都不动"的前提下，灰必须**足够深**、浅字才读得出来。
 *  当前 #4a4e55：比原 #24262b 明显提亮、仍是中性灰，白色系文字对比度 ≈7:1。
 *  想更亮就改 GRAY / GRAY_LINE —— 但再亮一档就必须同时把顶栏文字改深色，
 *  那就不止改底板了（可选值见文件末尾注释）。
 */

export type ThemeMode = 'grey' | 'dark';

/** ★★★ 总开关：false = 不启用灰色底板（LOGO 单击不再切换） */
export const THEME_SWITCH = true;

/** 三块共用的灰（底板 / 顶栏 / 底栏 同色） */
const GRAY = '#4a4e55';
/** 顶栏底栏的分隔线：比底色略亮，否则同色贴在一起看不出边界 */
const GRAY_LINE = '#5f646b';

const KEY = 'bfx1.theme';
const ATTR = 'data-theme';

/** 读当前模式：默认深色（灰色是可选方案，不改变老用户观感） */
export function readTheme(): ThemeMode {
  if (!THEME_SWITCH) return 'dark';
  try {
    const v = localStorage.getItem(KEY);
    /* v4.30 测试版存过 'light'，这里当 'grey' 兼容，避免用户切了回不去 */
    if (v === 'grey' || v === 'light') return 'grey';
    if (v === 'dark') return 'dark';
  } catch { /* 隐私模式 / 存储被禁 */ }
  return 'dark';
}

/**
 * 把主题落到 <html>：
 *   · data-theme="grey" → index.css 里的灰色变量生效（tone3 的底板靠它）
 *   · 同时写 --bfx-* 变量 —— 顶栏/底栏是行内 style，只能靠 CSS 变量吃值
 */
export function applyTheme(mode: ThemeMode): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const on = THEME_SWITCH && mode === 'grey';
  if (on) root.setAttribute(ATTR, 'grey');
  else root.removeAttribute(ATTR);

  if (on) {
    root.style.setProperty('--bfx-bar', GRAY);
    root.style.setProperty('--bfx-bar-line', GRAY_LINE);
    root.style.setProperty('--bfx-page', GRAY);
  } else {
    root.style.removeProperty('--bfx-bar');
    root.style.removeProperty('--bfx-bar-line');
    root.style.removeProperty('--bfx-page');
  }
}

/** 保存并立即生效 */
export function saveTheme(mode: ThemeMode): void {
  try { localStorage.setItem(KEY, mode); } catch { /* ignore */ }
  applyTheme(mode);
}

/* ── 想调灰度就改这里（三块永远同一个值）──
 *   #4a4e55  当前：中性偏亮，浅字对比度 ≈7:1
 *   #5c626a  再亮一档：浅字降到 ≈4.5:1，顶栏小字开始发虚
 *   #8a8f96  中灰：必须同时把顶栏文字改深，否则读不出来
 */
