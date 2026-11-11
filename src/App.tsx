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

/* ★ 2026-11-11（用户反馈「底部提示被遮挡」）：提示条固定在底部 Dock 之上，
   还要额外让出 iOS Home 指示条的高度（--sa-bottom），否则会压在 Dock 上。 */
const BottomToaster = () => {
  const [offset, setOffset] = React.useState(74);
  React.useEffect(() => {
    const read = () => {
      const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sa-bottom')) || 0;
      setOffset(74 + v);
    };
    read();
    window.addEventListener('resize', read);
    return () => window.removeEventListener('resize', read);
  }, []);
  return (
    /* ★★ v3.68：全 App 唯一提示位置 —— 底部居中、只留一条、紧凑圆角 */
    <Toaster
      position="bottom-center"
      theme="dark"
      duration={2600}
      visibleToasts={1}
      gap={6}
      offset={offset}
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
  );
};

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
      <BottomToaster />
    </I18nProvider>
  </BrowserRouter>
);

export default App;
