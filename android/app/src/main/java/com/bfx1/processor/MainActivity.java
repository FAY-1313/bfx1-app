package com.bfx1.processor;

import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;
import com.bfx1.processor.plugins.FileSaverPlugin;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // v74: registerPlugin() feeds the bridge builder, so it must run BEFORE
        // super.onCreate() (which creates the bridge in load()).
        registerPlugin(FileSaverPlugin.class);
        super.onCreate(savedInstanceState);
        // ★ 2026-11-05（用户拍板方案 A）：APK 常亮 —— 调音/演出时不自动熄屏。
        // 用窗口 FLAG 而非 WakeLock：随 Activity 生命周期自动释放，无泄漏、无需权限。
        getWindow().addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        WebView webView = getBridge().getWebView();
        // 禁用 WebView 缓存: 每次启动强制从 assets 加载最新页面,
        // 避免覆盖安装更新 APK 后 WebView 磁盘缓存显示旧版本 UI
        webView.getSettings().setCacheMode(WebSettings.LOAD_NO_CACHE);
        webView.getSettings().setMediaPlaybackRequiresUserGesture(false);
        webView.setLayerType(android.view.View.LAYER_TYPE_HARDWARE, null);
    }
}
