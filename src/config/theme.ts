/**
 * 明暗主题（v4.30）
 *
 * ══════════ 回滚（三种，从轻到重）══════════
 *  ① **功能开关**：把下面的 `THEME_SWITCH` 改成 `false` → 全 App 恒为深色，
 *     LOGO 单击恢复成"只播弹跳动画"，一行回滚，不用 revert 提交。
 *  ② **用户侧**：LOGO 单击在深/浅之间切，选择会记忆 —— 不满意随时切回深色。
 *  ③ **版本回滚**：02_apk 里保留 v4.29 的 APK；iOS 在 TestFlight 装回上一个 build。
 *
 * ══════════ 作用范围（v4.30 有意收窄）══════════
 *  浅色目前只覆盖 **音色页（ui3/tone）+ 全局提示浮层**。
 *  社区 / 预设库 / 本地库 / 录音 / 调音表等面板仍是深色 —— 那些组件大量用行内
 *  style 写死颜色，逐个改造风险高，等这一版确认方向后再铺。
 *
 * ══════════ 为什么不简单反色 ══════════
 *  原来的强调色 #ffa53a 放在暖白底上对比度只有 1.9:1（等于看不见）。
 *  浅色下拆成两个橙：图形用 #e2661b，小字号文字用 #b8500f（5.9:1）。
 */

export type ThemeMode = 'dark' | 'light';

/** ★★★ 总开关：false = 不启用浅色主题（LOGO 单击不再切主题） */
export const THEME_SWITCH = true;

const KEY = 'bfx1.theme';
const ATTR = 'data-theme';

/** 读当前主题：默认深色（浅色是可选方案，不改变老用户观感） */
export function readTheme(): ThemeMode {
  if (!THEME_SWITCH) return 'dark';
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'light' || v === 'dark') return v;
  } catch { /* 隐私模式 / 存储被禁 */ }
  return 'dark';
}

/** 把主题写到 <html data-theme="…">，CSS 靠 `:root[data-theme="light"]` 接管 */
export function applyTheme(mode: ThemeMode): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (!THEME_SWITCH || mode === 'dark') root.removeAttribute(ATTR);
  else root.setAttribute(ATTR, 'light');
}

/** 保存并立即生效 */
export function saveTheme(mode: ThemeMode): void {
  try { localStorage.setItem(KEY, mode); } catch { /* ignore */ }
  applyTheme(mode);
}
