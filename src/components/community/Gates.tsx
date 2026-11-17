/**
 * 社区两道门（v3.66）
 *
 * 进门顺序由用户拍板（E）：**先连设备 → 再登录 → 才进社区**。
 *   - 未连设备：整页拦截，不渲染任何页签/上传键，也不发任何云请求（不缓存、不预加载）
 *   - 连上未登录：锁屏 —— 模糊的音色墙当背景，中间一张登录卡
 * 顺序不能反：先登录再要求连设备，会让「只想看看」的人白跑一次验证码。
 */
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { C, IconBluetooth, IconBack } from './parts';
import LoginForm from './LoginForm';
import type { Account } from '../../services/account';

/**
 * ★ 2026-11-16（第二次修键盘错位）：
 *   上一次只改 padding 不够 —— Capacitor WebView 在键盘弹出时**整个 WebView 会被
 *   resize**（adjustResize），`window.innerHeight` 一起变小，于是
 *   ① 贴底布局的表单被压到最小高度里、输入框被键盘盖住；
 *   ② 底部 tab 栏跟着布局一起上移，看起来"菜单弹到键盘上方"。
 *
 *   现在改成：登录锁屏 **portal 到 document.body + position:fixed**，
 *   并用 visualViewport 的 height/offsetTop 精确贴合**可视区**（不是布局视口），
 *   键盘弹出时它仍覆盖整屏（包括底部菜单），表单从顶部排 + 可滚动 + 聚焦自动滚动。
 */
function useVisualViewport(): { height: number; top: number } {
  const read = () => {
    if (typeof window === 'undefined') return { height: 600, top: 0 };
    const vv = window.visualViewport;
    return {
      height: Math.round(vv?.height ?? window.innerHeight),
      top: Math.round(vv?.offsetTop ?? 0),
    };
  };
  const [vp, setVp] = useState(read);
  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    const update = () => setVp(read());
    update();
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    vv?.addEventListener('resize', update);
    vv?.addEventListener('scroll', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
      vv?.removeEventListener('resize', update);
      vv?.removeEventListener('scroll', update);
    };
  }, []);
  return vp;
}

export function ConnectGate({ onConnect, connecting, onClose }: {
  onConnect: () => void;
  connecting?: boolean;
  onClose: () => void;
}) {
  return (
    <div style={{ position: 'absolute', inset: 0, background: C.bg, display: 'flex', flexDirection: 'column', zIndex: 5 }}>
      <div style={{ height: 52, display: 'flex', alignItems: 'center', gap: 4, padding: '0 8px', flexShrink: 0 }}>
        <button onClick={onClose} style={{ width: 42, height: 42, borderRadius: 12, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <IconBack />
        </button>
        <span style={{ fontSize: 14, fontWeight: 750, color: C.text, fontFamily: C.font }}>音色社区</span>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 34px 60px' }}>
        <div style={{ position: 'relative', width: 108, height: 108, marginBottom: 26 }}>
          <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: `1px solid ${C.brandLine}`, animation: 'cmPulse 2.4s ease-out infinite' }} />
          <div style={{ position: 'absolute', inset: 12, borderRadius: '50%', border: `1px solid ${C.brandLine}`, animation: 'cmPulse 2.4s ease-out infinite 0.7s' }} />
          <div style={{
            position: 'absolute', inset: 26, borderRadius: '50%', background: C.brandSoft,
            border: `1px solid ${C.brandLine}`, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <IconBluetooth size={30} />
          </div>
        </div>

        <div style={{ fontSize: 16, fontWeight: 800, color: C.text, fontFamily: C.font, marginBottom: 10, letterSpacing: '0.02em' }}>
          先连接 BFX1 设备
        </div>
        <div style={{ fontSize: 11.5, color: C.text3, fontFamily: C.font, lineHeight: 1.85, textAlign: 'center', maxWidth: 280 }}>
          社区里的音色要直接试给你的箱子听，所以要先连上设备。<br />
          未连接时社区不联网、不缓存任何数据。
        </div>

        <button onClick={onConnect} disabled={connecting} style={{
          marginTop: 26, width: '100%', maxWidth: 280, height: 46, borderRadius: 13, cursor: connecting ? 'default' : 'pointer',
          background: connecting ? 'rgba(240,111,33,0.16)' : C.brand, border: 'none',
          color: connecting ? C.brand : '#3b281c', fontSize: 13, fontWeight: 800,
          fontFamily: C.font, letterSpacing: '0.06em',
        }}>{connecting ? '正在连接…' : '连接设备'}</button>

        <button onClick={onClose} style={{
          marginTop: 12, height: 40, padding: '0 18px', borderRadius: 11, cursor: 'pointer',
          background: 'transparent', border: 'none', color: C.text3, fontSize: 11.5, fontWeight: 600, fontFamily: C.font,
        }}>先回音色页</button>
      </div>

      <style>{`@keyframes cmPulse{0%{transform:scale(.72);opacity:.9}70%{transform:scale(1.18);opacity:0}100%{opacity:0}}`}</style>
    </div>
  );
}

/**
 * 登录锁屏（v3.67）
 *
 * ★ 用户拍板「登录改为一步」：卡片本身就是表单（手机号 + 验证码 + 获取验证码 + 协议行），
 *   不再「只有一个手机号登录按钮 → 跳到账号面板再填一次」。
 *   旧链路还会让 CommunityPanel 卸载重挂 → 回来页签跳回「推荐」、滚动位置丢失。
 */
/**
 * ★ 2026-11-16（第三次）：社区锁屏与顶栏账号入口**共用同一个登录页**。
 *   以前两处各写一套容器：社区是整屏浮层、账号页是面板内嵌表单，观感和键盘行为都不一样。
 *   现在抽出 `LoginScreen`：
 *     · 社区锁屏 = LoginScreen（带模糊音色墙装饰，标题「音色社区」）
 *     · 顶栏账号 = LoginScreen（标题「账号」，无装饰）
 *   两处都用 portal + visualViewport 贴可视区，键盘弹出表现一致。
 */
export function LoginScreen({
  title, subtitle, onSuccess, onClose, lang = 'zh', decor = false,
}: {
  title: string;
  subtitle?: string;
  onSuccess: (acc: Account) => void;
  onClose: () => void;
  lang?: string;
  decor?: boolean;
}) {
  const cells = Array.from({ length: 12 }, (_, i) => i);
  const vp = useVisualViewport();
  /* ★★ 2026-11-17（iOS TestFlight 返回键被状态栏盖住根治）：
     本组件 portal 到 document.body，**绕过了 #root 的 padding**（安全区只加在 #root 上），
     所以这里必须自己吃进 --sa-top/--sa-bottom。否则 iPhone 灵动岛(59px)/刘海(47px)/
     TestFlight 顶部条会把 52px 的标题栏压住 → 左上角「返回」和标题点不到、重叠。
     用 CSS var 读取 safeArea.ts 实测值，键盘弹出时仍以 visualViewport 为准。 */
  const sTop = "var(--sa-top, 0px)";
  const sBottom = "var(--sa-bottom, 0px)";
  const overlay = (
    <div
      style={{
        position: 'fixed', left: 0, right: 0, top: `calc(${vp.top}px + ${sTop})`,
        height: `calc(${vp.height}px - ${sTop} - ${sBottom})`,
        background: C.bg, display: 'flex', flexDirection: 'column',
        overflow: 'hidden', zIndex: 4000,
      }}
    >
      {decor && (
        <>
          <div style={{ position: 'absolute', top: 52, left: 12, right: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, opacity: 0.16, filter: 'blur(7px)' }}>
            {cells.map((i) => (
              <div key={i} style={{
                height: 92, borderRadius: 14, border: `1px solid ${C.line2}`,
                background: `linear-gradient(150deg, hsl(${(i * 37) % 360} 42% 30%), hsl(${(i * 37) % 360} 36% 16%))`,
              }} />
            ))}
          </div>
          <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(180deg, rgba(11,13,17,0.55), ${C.bg} 52%)` }} />
        </>
      )}

      <div style={{ position: 'relative', height: 52, display: 'flex', alignItems: 'center', gap: 4, padding: '0 8px', flexShrink: 0 }}>
        <button onClick={onClose} style={{ width: 42, height: 42, borderRadius: 12, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <IconBack />
        </button>
        <span style={{ fontSize: 14, fontWeight: 750, color: C.text, fontFamily: C.font }}>{title}</span>
      </div>

      {/* ★ 从顶部排 + 可滚动：键盘弹出时输入框永远在可视区内，不会被盖住 */}
      <div
        style={{
          position: 'relative', flex: 1, minHeight: 0,
          display: 'flex', flexDirection: 'column', justifyContent: 'flex-start',
          /* ★ 2026-11-17：overlay 已减去 --sa-bottom，这里不再叠加 env()，
             否则键盘/底部会多留一倍空白。 */
          padding: '8px 20px 24px',
          overflowY: 'auto', WebkitOverflowScrolling: 'touch',
        }}
        className="no-scrollbar"
      >
        <LoginForm
          variant="card"
          lang={lang}
          subtitle={subtitle}
          onSuccess={onSuccess}
          onCancel={onClose}
        />
      </div>
    </div>
  );
  /* portal 到 body：不再受社区面板/底部 tab 栏的布局影响 */
  return typeof document !== 'undefined' ? createPortal(overlay, document.body) : overlay;
}

export function LoginLock({ onLoggedIn, onClose, lang = 'zh' }: { onLoggedIn: () => void; onClose: () => void; lang?: string }) {
  return (
    <LoginScreen
      title="音色社区"
      decor
      lang={lang}
      subtitle={lang === 'en'
        ? 'Browsing, trying, saving and uploading all need an account. Username + password, synced to the cloud.'
        : '浏览、试用、收藏和上传都需要账号。用户名 + 密码登录，作品存云端。'}
      onSuccess={onLoggedIn}
      onClose={onClose}
    />
  );
}
