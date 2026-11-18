import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Index from './pages/Index';
import { I18nProvider, useI18n, I18nContext } from './i18n';
import BootSplash from './ui2/BootSplash';
import FloatHint from './components/FloatHint';
import { notifyErr } from './services/feedback';

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  static contextType = I18nContext;
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: Error) {
    console.log('ErrorBoundary caught:', error);
    /* ★ v4.29：提示通道换成自绘浮层后，这里不能再直接调 sonner（已无 Toaster），
       统一走 notifyErr。FloatHint 宿主挂在 ErrorBoundary 之外，所以崩了也还在。 */
    notifyErr((this.context as { t: (k: string) => string }).t('error.msg'));
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
        background: '#24262b',
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
      {/* ★★★ v4.29（用户要求）：提示位置从「底部居中」改为「顶栏下方居中 / 贴着按钮」。
          sonner 已整体移除 —— 位置和皮肤都不可控，改用自绘浮层，视觉与旋钮浮框一致。
          宿主挂在 ErrorBoundary 之外，页面崩了提示仍然能显示。 */}
      <FloatHint />
    </I18nProvider>
  </BrowserRouter>
);

export default App;
