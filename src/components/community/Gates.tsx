/**
 * 社区两道门（v3.66）
 *
 * 进门顺序由用户拍板（E）：**先连设备 → 再登录 → 才进社区**。
 *   - 未连设备：整页拦截，不渲染任何页签/上传键，也不发任何云请求（不缓存、不预加载）
 *   - 连上未登录：锁屏 —— 模糊的音色墙当背景，中间一张登录卡
 * 顺序不能反：先登录再要求连设备，会让「只想看看」的人白跑一次验证码。
 */
import React from 'react';
import { C, IconBluetooth, IconBack } from './parts';
import LoginForm from './LoginForm';

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
export function LoginLock({ onLoggedIn, onClose, lang = 'zh' }: { onLoggedIn: () => void; onClose: () => void; lang?: string }) {
  // 背景音色墙：纯装饰，不请求云端（未登录不联网）
  const cells = Array.from({ length: 12 }, (_, i) => i);
  return (
    <div style={{ position: 'absolute', inset: 0, background: C.bg, display: 'flex', flexDirection: 'column', overflow: 'hidden', zIndex: 5 }}>
      <div style={{ position: 'absolute', top: 52, left: 12, right: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, opacity: 0.16, filter: 'blur(7px)' }}>
        {cells.map((i) => (
          <div key={i} style={{
            height: 92, borderRadius: 14, border: `1px solid ${C.line2}`,
            background: `linear-gradient(150deg, hsl(${(i * 37) % 360} 42% 30%), hsl(${(i * 37) % 360} 36% 16%))`,
          }} />
        ))}
      </div>
      <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(180deg, rgba(11,13,17,0.55), ${C.bg} 52%)` }} />

      <div style={{ position: 'relative', height: 52, display: 'flex', alignItems: 'center', gap: 4, padding: '0 8px', flexShrink: 0 }}>
        <button onClick={onClose} style={{ width: 42, height: 42, borderRadius: 12, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <IconBack />
        </button>
        <span style={{ fontSize: 14, fontWeight: 750, color: C.text, fontFamily: C.font }}>音色社区</span>
      </div>

      <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: '0 20px 24px', overflowY: 'auto' }} className="no-scrollbar">
        <LoginForm
          variant="card"
          lang={lang}
          subtitle={lang === 'en'
            ? 'Browsing, trying, saving and uploading all need an account. Phone + code, no password.'
            : '浏览、试用、收藏和上传都需要账号。手机号 + 验证码，首次登录自动建号。'}
          onSuccess={() => onLoggedIn()}
          onCancel={onClose}
        />
      </div>
    </div>
  );
}
