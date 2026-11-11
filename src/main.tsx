import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { applySafeAreaInsets } from "./utils/safeArea.ts";

/* 安全区先量一次，再挂 React —— 免得首帧顶栏压在灵动岛下面闪一下 */
applySafeAreaInsets();
window.addEventListener("resize", applySafeAreaInsets);
window.addEventListener("orientationchange", applySafeAreaInsets);

createRoot(document.getElementById("root")!).render(<App />);
