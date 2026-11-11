import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Toaster, toast } from 'sonner';
import Index from './pages/Index';
import { I18nProvider, useI18n, I18nContext } from './i18n';
import BootSplash from './ui2/BootSplash';

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  static contextType = I18nContext;
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: Error) {
    console.log('ErrorBoundary caught:', error);
    toast.error((this.context as { t: (k: string) => string }).t('error.msg'));
  }
  render() {
    return this.state.hasError
      ? <ErrorView />
      : this.props.children;
  }
}

function ErrorView() {
  const { t } = useI18n();
  return (
    <div
      style={{
        width: '100%',
        height: '100vh',
        margin: '0 auto',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0d0d0f',
        color: '#666',
        fontSize: 14,
        letterSpacing: '0.1em',
      }}
    >
      {t('error.title')}
    </div>
  );
}

const App = () => (
  <BrowserRouter>
    <I18nProvider>
      <ErrorBoundary>
        <Routes>
          <Route path="/" element={<Index />} />
        </Routes>
      </ErrorBoundary>
      {/* ★ 2026-10-17（用户要求）：品牌开屏动画（B&F LOGO），冷启动播一次 */}
      <BootSplash />
      {/* ★ 2026-10-17（用户反馈「很多提示都从上面滑下来，特别影响操作」）：
          ① 位置 右上 → **底部居中**（在底部 Dock 之上），不再遮挡顶栏与首页模块；
          ② 时长 4s → 1.6s，最多同时 2 条，做成紧凑胶囊（更像状态指示，不像弹窗）；
          ③ 圆角胶囊 + 半透明底，视觉上"贴边一行字"，不抢操作区。 */}
      {/* ★★ v3.68（2026-10-24 用户拍板 ABCD）：全 App 唯一提示位置。
          · 固定底部居中（底部 Dock 之上），任何面板/页面都不再自绘第二条提示；
          · visibleToasts = 1 + services/feedback.ts 的固定 id → 永远只有一条，
            新提示直接替换旧的，不会「一条接一条往下排」；
          · 1.6s / 紧凑圆角胶囊，像状态指示而不是弹窗。
          ★★ v3.85（用户「底部提示太快看不清」）：时长交给 feedback.ts 分档
             （2.6 / 2.8 / 3.0 / 3.4s），这里只做兜底 2.6s；
             字号 11→12、行高 1.45、允许换行（长句「出厂音色已写入本地 1–16 档…」
             原来被 nowrap 挤成一条超出屏幕），圆角 999→14 让多行
             不再呈「药丸状」导致文字贴边。 */}
      <Toaster
        position="bottom-center"
        theme="dark"
        duration={2600}
        visibleToasts={1}
        gap={6}
        offset={74}
        toastOptions={{
          style: {
            background: 'rgba(32,34,40,.96)', border: '1px solid #3f4045', color: '#ececec',
            borderRadius: 14, padding: '9px 15px',
            fontFamily: '"Barlow-Regular_2",sans-serif',
            fontSize: 12, letterSpacing: '0.02em', lineHeight: 1.45,
            boxShadow: '0 6px 20px rgba(0,0,0,.45)',
            maxWidth: '88vw',
            whiteSpace: 'normal', wordBreak: 'break-word', textAlign: 'center',
          },
        }}
      />
    </I18nProvider>
  </BrowserRouter>
);

export default App;
