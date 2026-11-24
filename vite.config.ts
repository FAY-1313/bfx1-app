import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import fs from "fs";
import AutoImport from "unplugin-auto-import/vite";
import checker from "vite-plugin-checker";
import * as lucide from "lucide-react";

// onnxruntime-web 会把 WebGPU EP 的 jsep wasm 也打进产物 (~27MB), 而我们只用 wasm EP
// (wasm 从 public/onnx 运行时加载). 这里从产物里删掉这个死重量.
const dropOrtJsepWasm: Plugin = {
  name: "drop-ort-jsep-wasm",
  apply: "build",
  generateBundle(_opts, bundle) {
    for (const key of Object.keys(bundle)) {
      if (key.includes("jsep") && key.endsWith(".wasm")) delete bundle[key];
    }
  },
};

// 只把 lucide 带 Icon 后缀的别名（MapIcon / FileIcon / StarIcon ...）纳入 auto-import。
// 这组名字由 lucide 官方 PR #2328 提供，天然不与 JS 全局 / DOM / React 导出撞名。
// 配合 src/vite-env.d.ts 里的 `declare module "lucide-react"` 重定向使用。
const lucideIconNames = Object.keys(lucide).filter(
  (k) => /^[A-Z]/.test(k) && k.endsWith("Icon")
);

// 生产包去掉 console.log/info/debug —— Capacitor 会把 console 桥接到 logcat，
// BLE 写入热路径每帧一条 log 有实际开销。保留 warn/error 供诊断。
// ⚠️ 只作用于 App 的 `vite build`：dev 和 `--ssr`（scripts/ 与 _verify/ 校验脚本）必须保留 console，
//    否则校验脚本的输出会被整段摇树删掉、看起来"跑完没报错"。
const stripConsoleInAppBuild: Plugin = {
  name: "strip-console-in-app-build",
  config(_cfg, { command, isSsrBuild }) {
    if (command !== "build" || isSsrBuild) return;
    return { esbuild: { pure: ["console.log", "console.info", "console.debug"], drop: ["debugger"] } };
  },
};

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    dropOrtJsepWasm,
    stripConsoleInAppBuild,
    AutoImport({
      dts: process.env.BFX_NO_AUTO_DTS ? false : "auto-imports.d.ts",
      include: [/\.[tj]sx?$/],
      imports: [
        "react",
        { "lucide-react": lucideIconNames },
      ],
      eslintrc: { enabled: false },
    }),
    checker({
      typescript: {
        tsconfigPath: "tsconfig.app.json",
      },
      enableBuild: true,
    }),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
