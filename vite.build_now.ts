import { defineConfig } from "vite";
import base from "./vite.config";

/* 临时构建配置：跳过产物级 esbuild 转译（esnext + 不压缩），
   规避本机 esbuild.exe 删除临时文件被拒绝的问题。仅用于出包。 */
export default defineConfig({
  ...(base as any),
  build: {
    target: "esnext",
    minify: false,
    sourcemap: false,
    chunkSizeWarningLimit: 30000,
  },
});
