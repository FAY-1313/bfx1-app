/**
 * 登录 / 注册表单 · 用户名 + 密码（★ 2026-11-16 用户拍板）
 *
 * 一个组件两处复用：
 *   · `variant='card'` —— 社区锁屏里那张卡
 *   · `variant='page'` —— 顶栏账号入口打开的整页
 *
 * 为什么改成用户名+密码：短信验证码通道不可用；用户名+密码是 CloudBase 原生账号，
 * 登录后 uid 跨设备稳定，社区音色 / 关注 / 收藏都走云端。
 */
import React, { useState } from 'react';
import { C } from './parts';
import {
  loginWithUsername, registerWithUsername, isUsernameTaken,
  validateUsername, PASSWORD_MIN, NAME_MIN, NAME_MAX,
} from '../../services/userAuth';
import { probeCommunity } from '../../services/userAuth';
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
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [probe, setProbe] = useState('');

  const clean = username.trim();
  const canSubmit = clean.length >= NAME_MIN && password.length >= PASSWORD_MIN && !loading;

  const errText = (code?: string, detail?: string) => {
    const map: Record<string, string> = {
      user_not_found: zh ? '用户名不存在，先去注册' : 'User not found — register first',
      wrong_password: zh ? '密码不正确' : 'Wrong password',
      user_exists: zh ? '这个用户名已被占用' : 'Username already taken',
      password_short: zh ? `密码至少 ${PASSWORD_MIN} 位` : `Password must be at least ${PASSWORD_MIN} characters`,
      name_invalid: zh ? `用户名 ${NAME_MIN}–${NAME_MAX} 字，只能用中英文/数字/下划线` : 'Invalid username',
      session: zh ? '无法建立云端会话，请检查网络后重试' : 'Cannot start cloud session',
      network: zh ? '网络不可用，请检查连接' : 'Network unavailable',
      /* ★ 2026-11-16：云开发侧的具体原因（以前一律显示「操作失败」） */
      provider: zh ? '云开发未开启「用户名密码登录」，请先在控制台开启' : 'Username/password login is not enabled in CloudBase',
      unsupported_signup: zh ? '当前云环境不支持纯用户名自助注册，请联系管理员开通账号' : 'Self sign-up is not supported in this environment',
      blocked: zh ? '账号已被限制或审核中' : 'Account blocked or under review',
      server: zh ? '云端服务异常，请稍后重试' : 'Cloud service error, try later',
      custom_login: zh ? '账号已创建，但云端「自定义登录」未配置好，请联系管理员' : 'Custom login is not configured',
      fn_unavailable: zh ? '注册服务未部署（云函数 bfxAuth 不可用）' : 'Auth service unavailable',
    };
    const msg = map[code || 'unknown'] || (zh ? '操作失败' : 'Failed');
    return detail ? `${msg}（${detail}）` : msg;
  };

  const submit = async () => {
    if (!canSubmit) return;
    const v = validateUsername(clean);
    if (!v.ok) { setErr(errText('name_invalid')); return; }
    if (mode === 'register' && password !== password2) {
      setErr(zh ? '两次输入的密码不一致' : 'Passwords do not match');
      return;
    }
    setLoading(true); setErr('');
    const res = mode === 'login'
      ? await loginWithUsername(v.name, password)
      : await registerWithUsername(v.name, password);
    setLoading(false);
    if (res.ok && res.account) { onSuccess(res.account); return; }
    setErr(errText(res.error, res.detail));
  };

  const toggleMode = async () => {
    const next = mode === 'login' ? 'register' : 'login';
    setMode(next); setErr(''); setPassword2('');
    if (next === 'register' && clean.length >= NAME_MIN) {
      const taken = await isUsernameTaken(clean);
      if (taken) setErr(errText('user_exists'));
    }
  };

  const doProbe = async () => {
    setProbe(zh ? '检测中…' : 'Checking…');
    const r = await probeCommunity();
    setProbe(r.ok
      ? (zh ? '云端社区连接正常' : 'Cloud community OK')
      : (zh ? `云端社区不可用（${r.error || 'unknown'}）` : `Backend unavailable (${r.error || 'unknown'})`));
  };

  const inputBase: React.CSSProperties = {
    width: '100%', height: 44, padding: '0 14px', borderRadius: 12, boxSizing: 'border-box',
    background: 'rgba(255,255,255,0.045)', border: `1px solid ${C.line2}`,
    color: C.text, fontSize: 14, outline: 'none', fontFamily: C.font,
  };

  /* ★ 2026-11-17（v4.22 · 恢复原有状态）：不再用 scrollIntoView(block:center) 强行把
     输入框滚到屏幕中央 —— 键盘弹出时它会把整张表单推得上下跳动、非输入区被挤出视野。
     登录页已改为稳定高度 + 内部滚动，Webview 的原生聚焦滚动足够把输入框带进可视区。 */
  const focusIntoView = (_e: React.FocusEvent<HTMLInputElement>) => {
    /* no-op：保留 onFocus 挂点，避免改动输入元素结构 */
  };

  const body = (
    <>
      <div style={{ fontSize: 11, fontWeight: 800, color: C.brand, fontFamily: C.font, letterSpacing: '0.16em', marginBottom: 8 }}>
        BFX1 · ACCOUNT
      </div>
      <div style={{ fontSize: 18, fontWeight: 800, color: C.text, fontFamily: C.font, lineHeight: 1.35, marginBottom: 7 }}>
        {mode === 'login'
          ? (zh ? '用户名登录' : 'Sign in')
          : (zh ? '注册新账号' : 'Create account')}
      </div>
      <div style={{ fontSize: 11.5, color: C.text3, fontFamily: C.font, lineHeight: 1.75, marginBottom: 16 }}>
        {subtitle || (zh
          ? (mode === 'login'
            ? '用用户名 + 密码登录；登录后社区音色、关注、收藏都存在云端。'
            : `设置一个用户名（${NAME_MIN}–${NAME_MAX} 字）与密码（至少 ${PASSWORD_MIN} 位），登录后作品存云端。`)
          : 'Username + password. Your community tones and favourites are stored in the cloud.')}
      </div>

      <input
        value={username}
        onChange={(e) => { setUsername(e.target.value.slice(0, NAME_MAX)); setErr(''); }}
        onFocus={focusIntoView}
        placeholder={zh ? '用户名' : 'Username'}
        autoComplete="username"
        style={{ ...inputBase, marginBottom: 10 }}
      />
      <input
        value={password}
        onChange={(e) => { setPassword(e.target.value.slice(0, 32)); setErr(''); }}
        onFocus={focusIntoView}
        placeholder={zh ? `密码（至少 ${PASSWORD_MIN} 位）` : `Password (min ${PASSWORD_MIN})`}
        type="password"
        autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
        style={{ ...inputBase, marginBottom: 10 }}
      />
      {mode === 'register' && (
        <input
          value={password2}
          onChange={(e) => { setPassword2(e.target.value.slice(0, 32)); setErr(''); }}
          onFocus={focusIntoView}
          placeholder={zh ? '再输一次密码' : 'Confirm password'}
          type="password"
          autoComplete="new-password"
          style={{ ...inputBase, marginBottom: 10 }}
        />
      )}

      {!!err && (
        <div style={{ fontSize: 11, color: 'rgba(242,120,105,0.95)', fontFamily: C.font, lineHeight: 1.6, marginBottom: 10 }}>
          {err}
        </div>
      )}

      <button
        onClick={() => { void submit(); }}
        disabled={!canSubmit}
        style={{
          width: '100%', height: 46, borderRadius: 13,
          cursor: canSubmit ? 'pointer' : 'default',
          background: canSubmit ? C.brand : 'rgba(255,255,255,0.06)',
          color: canSubmit ? '#2a1b0c' : '#9aa3b2',
          border: canSubmit ? 'none' : '1px solid rgba(255,255,255,0.10)',
          fontSize: 13, fontWeight: 800, fontFamily: C.font, letterSpacing: '0.05em',
          transition: 'background .15s',
        }}
      >{loading
        ? (zh ? '处理中…' : 'Working…')
        : mode === 'login'
          ? (zh ? '登录' : 'SIGN IN')
          : (zh ? '注册并登录' : 'CREATE & SIGN IN')}</button>

      <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
        <button onClick={() => { void toggleMode(); }} style={{
          border: 'none', background: 'transparent', color: C.brand, cursor: 'pointer',
          fontSize: 11.5, fontWeight: 700, fontFamily: C.font, padding: '6px 2px',
        }}>{mode === 'login'
          ? (zh ? '没有账号？注册' : 'No account? Register')
          : (zh ? '已有账号？登录' : 'Have an account? Sign in')}</button>
        <button onClick={() => { void doProbe(); }} style={{
          border: 'none', background: 'transparent', color: C.text3, cursor: 'pointer',
          fontSize: 11, fontFamily: C.font, padding: '6px 2px',
        }}>{zh ? '检测云端社区' : 'Check cloud'}</button>
      </div>
      {!!probe && (
        <div style={{ marginTop: 2, fontSize: 10.5, color: C.text3, fontFamily: C.font, textAlign: 'center' }}>
          {probe}
        </div>
      )}

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
