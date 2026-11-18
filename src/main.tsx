import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { applySafeAreaInsets } from "./utils/safeArea.ts";
import { applyTheme, readTheme } from "./config/theme.ts";

/* ★ v4.30：主题要在首帧之前落到 <html> 上，否则会看到"深色闪一下再变浅" */
applyTheme(readTheme());

/* 安全区先量一次，再挂 React —— 免得首帧顶栏压在灵动岛下面闪一下 */
applySafeAreaInsets();
window.addEventListener("resize", applySafeAreaInsets);
window.addEventListener("orientationchange", applySafeAreaInsets);
/* ★ v4.23（iOS 适配漂移根治）：键盘弹出/收起、App 前后台切换时，
   env(safe-area-inset-*) 会变化但不触发 resize。这些时机补一次重算，
   让 --sa-* 及时跟上，避免页面切换后留白漂移、要旋转才恢复。
   focusin/focusout 用冒泡阶段捕获输入框聚焦；延迟一帧等键盘动画开始后再量。 */
const rescheduleSafeArea = () => {
  window.setTimeout(applySafeAreaInsets, 60);
  window.setTimeout(applySafeAreaInsets, 320);
};
window.addEventListener("focusin", rescheduleSafeArea);
window.addEventListener("focusout", rescheduleSafeArea);
document.addEventListener("visibilitychange", rescheduleSafeArea);

createRoot(document.getElementById("root")!).render(<App />);
