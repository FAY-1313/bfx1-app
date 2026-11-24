/**
 * 诊断浮条：真机上看不到 console（release 包不转发），把关键信息直接显示到屏幕上，12s 自动消失。
 * ★ 2026-11-24：从 services/bleService.ts 的 _diag 搬出（样式、时长、id 原样保留），
 *   由 Index 通过 bleManager.setDiagSink(showDiagBar) 注册。
 */
export function showDiagBar(msg: string): void {
  try {
    if (typeof document === 'undefined' || !document.body) return;
    const id = 'bfx-diag-bar';
    document.getElementById(id)?.remove();
    const d = document.createElement('div');
    d.id = id;
    d.textContent = '⚠ ' + msg;
    d.style.cssText =
      'position:fixed;left:8px;right:8px;top:calc(env(safe-area-inset-top,0px) + 60px);' +
      'z-index:99999;background:rgba(170,28,28,.96);color:#fff;padding:10px 12px;' +
      'border-radius:10px;font-size:11px;line-height:1.5;word-break:break-all;' +
      'box-shadow:0 6px 20px rgba(0,0,0,.5)';
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 12000);
  } catch { /* 诊断失败绝不影响主流程 */ }
}
