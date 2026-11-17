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

        // ★ 2026-11-17（v4.22 · 恢复原有布局）：主动关闭 edge-to-edge。
        // targetSdk 36（Android 15+/16）默认强制内容延伸到状态栏/手势条下方，导致
        // ① 首页顶栏被 --sa-top 推下 24px、出现空白带（用户报「顶栏不对」）；
        // ② 二级菜单返回键被状态栏盖住。让 DecorView 重新 fitsSystemWindows，
        // WebView 回到状态栏下方 —— 顶栏/底栏都回到原生位置，无需 JS 侧安全区注入。
        androidx.core.view.WindowCompat.setDecorFitsSystemWindows(getWindow(), true);
    }
}
