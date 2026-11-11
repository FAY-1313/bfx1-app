/**
 * 一步登录表单（v3.67 · 2026-10-24 用户拍板「1 改为一步」）
 *
 * 一个组件两处复用：
 *   · `variant='card'` —— 社区锁屏里那张卡（门在社区内部，登录完立刻能看内容）
 *   · `variant='page'` —— 顶栏账号入口打开的整页
 * 共用同一份流程（services/authLogin），避免两处样式再分叉 —— v3.65 就是分叉成
 * 「锁屏是新设计 / 表单是旧样式」，用户点了「手机号登录」看到的是老页面。
 *
 * 设计口径：单品牌橙 #F06F21，主按钮 46 高，输入框 44 高且左对齐（不再 width:75% + 居中），
 * 协议行常驻底部（合规），说明书 / 教程这类无关入口不放在登录页里。
 */
import React, { useEffect, useRef, useState } from 'react';
import { C } from './parts';
import { sendSmsCode } from '../../services/smsCode';
import type { SmsVerificationInfo } from '../../services/smsCode';
import { loginWithPhone } from '../../services/authLogin';
import type { Account } from '../../services/account';

export default function LoginForm({
  onSuccess, onCancel, lang = 'zh', variant = 'card', subtitle,
}: {
  onSuccess: (acc: Account) => void;
  onCancel?: () => void;
  lang?: string;
  variant?: 'card' | 'page';
  subtitle?: string;
}) {
  const zh = lang !== 'en';
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const infoRef = useRef<SmsVerificationInfo | null>(null);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => setCountdown((c) => (c > 0 ? c - 1 : 0)), 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  const clean = phone.replace(/\D/g, '');
  const canSend = /^1[3-9]\d{9}$/.test(clean) && !sending && countdown <= 0;
  const canSubmit = /^1[3-9]\d{9}$/.test(clean) && /^\d{6}$/.test(code) && !loading;

  const doSend = async () => {
    if (!/^1[3-9]\d{9}$/.test(clean)) { setErr(zh ? '手机号格式不对，检查一下' : 'Invalid phone number'); return; }
    if (sending || countdown > 0) return;
    setSending(true); setErr('');
    const res = await sendSmsCode(clean);
    setSending(false);
    if (res.success && res.verificationInfo) {
      infoRef.current = res.verificationInfo;
      setCountdown(60);
    } else {
      setErr(zh ? '验证码没发出去，稍后再试' : 'Failed to send code');
    }
  };

  const doSubmit = async () => {
    if (!/^1[3-9]\d{9}$/.test(clean)) { setErr(zh ? '手机号格式不对，检查一下' : 'Invalid phone number'); return; }
    if (!/^\d{6}$/.test(code)) { setErr(zh ? '请输入 6 位验证码' : 'Enter the 6-digit code'); return; }
    if (!infoRef.current) { setErr(zh ? '请先获取验证码' : 'Request a code first'); return; }
    setLoading(true); setErr('');
    const res = await loginWithPhone(clean, code, infoRef.current);
    setLoading(false);
    if (res.ok && res.account) { onSuccess(res.account); return; }
    if (res.error === 'expired') {
      // 验证码过期 / 已消费：一次性凭证作废，必须重新获取，不能只改提示
      infoRef.current = null; setCountdown(0); setCode('');
      setErr(zh ? '验证码已过期，请重新获取' : 'Code expired, request a new one');
      return;
    }
    if (res.error === 'wrong') { setErr(zh ? '验证码不对，再确认一次' : 'Wrong code'); return; }
    /* 会话没建立起来：验证码已被消费，只能重发 —— 顺带把倒计时清零让按钮可点 */
    infoRef.current = null; setCountdown(0); setCode('');
    setErr(zh ? '登录会话建立失败，请重新获取验证码' : 'Session failed, request a new code');
  };

  const inputBase: React.CSSProperties = {
    width: '100%', height: 44, padding: '0 14px', borderRadius: 12, boxSizing: 'border-box',
    background: 'rgba(255,255,255,0.045)', border: `1px solid ${C.line2}`,
    color: C.text, fontSize: 14, outline: 'none', fontFamily: C.font,
  };

  const body = (
    <>
      <div style={{ fontSize: 11, fontWeight: 800, color: C.brand, fontFamily: C.font, letterSpacing: '0.16em', marginBottom: 8 }}>
        BFX1 · ACCOUNT
      </div>
      <div style={{ fontSize: 18, fontWeight: 800, color: C.text, fontFamily: C.font, lineHeight: 1.35, marginBottom: 7 }}>
        {zh ? '手机号登录' : 'Sign in with phone'}
      </div>
      <div style={{ fontSize: 11.5, color: C.text3, fontFamily: C.font, lineHeight: 1.75, marginBottom: 16 }}>
        {subtitle || (zh ? '首次登录自动创建账号，没有密码要记。' : 'First sign-in creates your account automatically.')}
      </div>

      <input
        value={phone}
        onChange={(e) => { setPhone(e.target.value.replace(/\D/g, '').slice(0, 11)); setErr(''); }}
        placeholder={zh ? '请输入手机号' : 'Phone number'}
        inputMode="numeric" maxLength={11} autoComplete="tel"
        style={{ ...inputBase, marginBottom: 10 }}
      />

      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input
          value={code}
          onChange={(e) => { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setErr(''); }}
          placeholder={zh ? '6 位验证码' : '6-digit code'}
          inputMode="numeric" maxLength={6} autoComplete="one-time-code"
          style={{ ...inputBase, flex: 1, minWidth: 0, letterSpacing: '0.16em' }}
        />
        <button
          onClick={doSend}
          disabled={!canSend}
          style={{
            height: 44, padding: '0 12px', borderRadius: 12, flexShrink: 0, cursor: canSend ? 'pointer' : 'default',
            background: canSend ? C.brandSoft : 'rgba(255,255,255,0.035)',
            border: `1px solid ${canSend ? C.brandLine : C.line}`,
            color: canSend ? C.brand : C.text3,
            fontSize: 11, fontWeight: 750, fontFamily: C.font, whiteSpace: 'nowrap',
          }}
        >{sending ? (zh ? '发送中…' : 'Sending') : countdown > 0 ? `${countdown}s` : (zh ? '获取验证码' : 'Get code')}</button>
      </div>

      {!!err && (
        <div style={{ fontSize: 11, color: 'rgba(242,120,105,0.95)', fontFamily: C.font, lineHeight: 1.6, marginBottom: 10 }}>
          {err}
        </div>
      )}

      <button
        onClick={doSubmit}
        disabled={loading}
        style={{
          width: '100%', height: 46, borderRadius: 13,
          cursor: loading ? 'default' : 'pointer',
          /* ★ 2026-11-11：禁用态原来是「深橙底 + 半透明橙字」，在深空灰底上糊成一团、
             看不出按钮不可点 —— 改成中性灰底 + 明确灰字 */
          background: canSubmit ? C.brand : 'rgba(255,255,255,0.06)',
          color: canSubmit ? '#2a1b0c' : '#9aa3b2',
          border: canSubmit ? 'none' : '1px solid rgba(255,255,255,0.10)',
          fontSize: 13, fontWeight: 800, fontFamily: C.font, letterSpacing: '0.05em',
          transition: 'background .15s',
        }}
      >{loading ? (zh ? '登录中…' : 'Signing in…') : (zh ? '登录 / 自动注册' : 'SIGN IN / SIGN UP')}</button>

      <div style={{ marginTop: 13, fontSize: 11, color: C.text3, fontFamily: C.font, lineHeight: 1.7, textAlign: 'center' }}>
        {zh ? '继续即表示同意' : 'By continuing you agree to '}
        <span style={{ color: C.text2 }}>{zh ? '《用户协议》' : 'Terms'}</span>
        {zh ? '与' : ' and '}
        <span style={{ color: C.text2 }}>{zh ? '《隐私政策》' : 'Privacy Policy'}</span>
      </div>

      {onCancel && (
        <button onClick={onCancel} style={{
          width: '100%', height: 38, marginTop: 6, borderRadius: 11, border: 'none', background: 'transparent',
          color: C.text3, fontSize: 11.5, fontWeight: 650, fontFamily: C.font, cursor: 'pointer',
        }}>{zh ? '先不登录' : 'Not now'}</button>
      )}
    </>
  );

  if (variant === 'page') {
    return <div style={{ padding: '4px 2px 8px' }}>{body}</div>;
  }
  return (
    <div style={{
      borderRadius: 20, background: C.surface, border: `1px solid ${C.line2}`,
      padding: '22px 20px 14px', boxShadow: '0 18px 50px rgba(0,0,0,0.55)',
    }}>{body}</div>
  );
}
