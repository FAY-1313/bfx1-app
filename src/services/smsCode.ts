/**
 * 短信验证码 (CloudBase auth 原生能力) — 复用用户已开通的腾讯云短信验证码登录.
 *
 * 流程 (与旧版 backup-20260806-ui L3663-3699 一致):
 *  - getVerification({phone_number}) 发真实短信, 返回 {verification_id, is_user};
 *  - signInWithSms({verificationInfo, verificationCode, phoneNum}) 校验验证码,
 *    同时建立手机号云会话 (仅本次注册使用);
 *  - resetToAnonymous 注册成功后 signOut 清掉手机会话并复位社区 signedIn,
 *    社区 ensureSignIn() 重新匿名登录, _openid 保持匿名身份不受手机号影响.
 */
import { auth } from './cloudbase';
import { resetSignInFlag } from './toneCommunity';

export interface SmsVerificationInfo {
  verification_id: string;
  is_user: boolean;
}

export function normalizePhone(raw: string): string {
  return (raw || '').replace(/\s/g, '');
}

export async function sendSmsCode(raw: string): Promise<{ success: boolean; verificationInfo?: SmsVerificationInfo; error?: string }> {
  const phone = normalizePhone(raw);
  if (!/^1[3-9]\d{9}$/.test(phone)) return { success: false, error: 'phone_invalid' };
  try {
    const res = await (auth as any).getVerification({ phone_number: '+86 ' + phone });
    const vi = res?.verification_id
      ? { verification_id: res.verification_id, is_user: Boolean(res.is_user) }
      : null;
    if (!vi) return { success: false, error: 'no_verification_id' };
    return { success: true, verificationInfo: vi };
  } catch (e: any) {
    return { success: false, error: e?.code || e?.message || 'send_failed' };
  }
}

export async function verifySmsCode(
  verificationInfo: SmsVerificationInfo,
  raw: string,
  code: string,
): Promise<{ success: boolean; error?: string }> {
  const phone = normalizePhone(raw);
  try {
    await (auth as any).signInWithSms({
      verificationInfo,
      verificationCode: code,
      phoneNum: '+86 ' + phone,
    });
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.code || e?.message || 'verify_failed' };
  }
}

/** 注册校验成功后调用: 退回匿名态, 让社区继续使用匿名 _openid */
export async function resetToAnonymous(): Promise<void> {
  try { await auth.signOut(); } catch { /* signOut 失败不阻塞注册 */ }
  resetSignInFlag();
}
