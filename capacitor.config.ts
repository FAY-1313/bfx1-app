import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.bfx1.processor',
  appName: 'BFX1',
  webDir: 'dist',
  server: {
    // 2026-09-02: androidScheme 由 'https' 改 'http' — https scheme 下 WebView 视 App 为 https://localhost,
    // fetch http://124.223.119.201:8000 会被 Mixed Content 拦截 (usesCleartextTraffic 只放行 Android 网络层).
    // http://localhost 仍属 secure context, getUserMedia/clipboard 等不受影响.
    androidScheme: 'http',
    hostname: 'localhost',
  },
};

export default config;
