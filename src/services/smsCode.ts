/**
 * 短信验证码登录 — CloudBase Auth v3 OTP flow.
 *
 * 旧实现使用 v1 `getVerification` + `signInWithSms`，SDK 已明确标记为
 * deprecated；新版 CloudBase 短信登录使用 `signInWithOtp`，返回的
 * `verifyOtp` 回调完成“验证码 → 会话”闭环。手机号必须使用 +86 前缀，
 * 且初始化 region 必须是 ap-shanghai（cloudbase.ts 已满足）。
 */
import { auth } from './cloudbase';
import { resetSignInFlag } from './toneCommunity';

export interface SmsVerificationInfo {
  phone: string;
  /** auth.signInWithOtp() 返回的一次性验证回调 */
  verifyOtp: (params: { token: string }) => Promise<any>;
}

export function normalizePhone(raw: string): string {
  return (raw || '').replace(/\s/g, '');
}

function errorText(e: any): string {
  if (!e) return 'unknown';
  if (typeof e === 'string') return e;
  return e.code || e.message || String(e);
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    p.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

export async function sendSmsCode(raw: string): Promise<{ success: boolean; verificationInfo?: SmsVerificationInfo; error?: string }> {
  const phone = normalizePhone(raw);
  if (!/^1[3-9]\d{9}$/.test(phone)) return { success: false, error: 'phone_invalid' };

  try {
    const res: any = await withTimeout(
      (auth as any).signInWithOtp({ phone: '+86' + phone }),
      20000,
    );
    if (res?.error) return { success: false, error: errorText(res.error) };

    const verifyOtp = res?.data?.verifyOtp ?? res?.verifyOtp;
    if (typeof verifyOtp !== 'function') {
      return { success: false, error: 'no_verifyOtp' };
    }
    return {
      success: true,
      verificationInfo: { phone, verifyOtp },
    };
  } catch (e: any) {
    return { success: false, error: errorText(e) };
  }
}

export async function verifySmsCode(
  verificationInfo: SmsVerificationInfo,
  raw: string,
  code: string,
): Promise<{ success: boolean; error?: string }> {
  const phone = normalizePhone(raw);
  if (!verificationInfo?.verifyOtp) return { success: false, error: 'no_verifyOtp' };
  if (verificationInfo.phone !== phone) return { success: false, error: 'phone_mismatch' };

  try {
    const res: any = await withTimeout(
      verificationInfo.verifyOtp({ token: code }),
      20000,
    );
    if (res?.error) return { success: false, error: errorText(res.error) };
    return { success: true };
  } catch (e: any) {
    return { success: false, error: errorText(e) };
  }
}

/** 注册校验成功后调用: 退回匿名态, 让社区继续使用匿名 _openid */
export async function resetToAnonymous(): Promise<void> {
  try { await auth.signOut(); } catch { /* signOut 失败不阻塞注册 */ }
  resetSignInFlag();
}