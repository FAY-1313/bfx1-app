/**
 * 账号流程 · 用户名 + 密码（★ 2026-11-16 用户拍板，替换手机验证码）
 *
 * 为什么换：短信通道不可用，而且用户明确要求「去掉手机注册登录，改为用户名+密码」。
 * 云端用 CloudBase Auth 的用户名密码体系：
 *   · 注册：auth.signUp({ username, password })
 *   · 登录：auth.signInWithPassword({ username, password })
 * 登录后 uid 跨设备稳定 → 社区音色 / 关注 / 收藏都跟着账号走（云端存储）。
 *
 * 兼容：老版本可能已经存在「手机号会话」，这里不做迁移（用户名是新的主键）；
 * 若 CloudBase 返回用户名不存在，UI 会引导去「注册」。
 */
import { auth } from './cloudbase';
import { ensureUid, saveLocalAccount } from './account';
import type { Account } from './account';
import { resetSignInFlag, getMyProfileEx, saveMyProfile } from './toneCommunity';

/** 云函数 bfxAuth 的 HTTP 访问服务地址（登录前的匿名调用走这里，见 callAuthFn） */
const AUTH_FN_URL = 'https://bfx1-v1-fay-d6g6w79ss8e4d9bf5.service.tcloudbase.com/bfxAuth';

export const NAME_MIN = 2;
export const NAME_MAX = 12;
export const PASSWORD_MIN = 6;

export type NameError = 'empty' | 'short' | 'long' | 'chars' | 'taken';

export type AuthError =
  | 'user_not_found' | 'wrong_password' | 'user_exists' | 'name_invalid'
  | 'password_short' | 'session' | 'network' | 'provider' | 'unsupported_signup'
  | 'blocked' | 'server' | 'custom_login' | 'fn_unavailable' | 'unknown';

export type AuthResult = { ok: boolean; account?: Account; error?: AuthError; detail?: string };

/** CloudBase v3 的错误是 { code, error, error_code, error_description, requestId }，
    真实原因往往只在 error_description 里（如 "username x is not exist"），
    所以要全部拼起来再匹配，不能只看 code。 */
function errText(e: any): string {
  if (!e) return '';
  if (typeof e === 'string') return e;
  const parts = [e.code, e.error, e.error_code, e.error_description, e.message]
    .filter((x) => x !== undefined && x !== null && x !== '');
  const s = parts.join(' ');
  return s || String(e);
}

function mapError(raw: string): AuthError {
  const s = raw.toLowerCase();
  /* 顺序有意义：先判最具体的原因，再落到 password / network 这类宽泛词 */
  if (/provider_not_enabled|provider not enabled|未开启|登录方式/.test(s)) return 'provider';
  if (/unimplemented|can ?not signup|not support.*signup|不支持.*注册/.test(s)) return 'unsupported_signup';
  if (/unregistered_user|user_not_found|usernotfound|not.?exist|no such user|does not exist|用户不存在/.test(s)) return 'user_not_found';
  if (/blocked|locked|banned|pending|under_review|封禁|锁定|审核/.test(s)) return 'blocked';
  if (/already|duplicate|conflict|user_exists|已存在|已被占用/.test(s)) return 'user_exists';
  if (/invalid_username_or_password|invalid_credential|invalid_password|wrong password|incorrect|password|凭据/.test(s)) return 'wrong_password';
  if (/network|timeout|timed out|offline|fetch failed|enotfound|networkrequestfailed/.test(s)) return 'network';
  if (/internal|unavailable|deadline|server error|5\d\d/.test(s)) return 'server';
  return 'unknown';
}

/** 给 UI 的短错误码：括号里只放最有信息量的一段，不刷屏 */
function briefDetail(raw: string): string {
  const s = (raw || '').replace(/\s+/g, ' ').trim();
  return s.length > 90 ? s.slice(0, 90) + '…' : s;
}

/** 用户名是否已被占用（CloudBase 原生接口；失败时按"未占用"处理，交给 signUp 报错） */
export async function isUsernameTaken(username: string): Promise<boolean> {
  try {
    const r: any = await (auth as any).isUsernameRegistered?.(username);
    return r === true || r?.data === true;
  } catch {
    return false;
  }
}

/** 用户名规则：2–12 字，中英文 / 数字 / 下划线 / 短横 / 中点 */
export function validateUsername(raw: string): { ok: boolean; error?: NameError; name: string } {
  const name = (raw || '').trim();
  if (!name) return { ok: false, error: 'empty', name };
  if (name.length < NAME_MIN) return { ok: false, error: 'short', name };
  if (name.length > NAME_MAX) return { ok: false, error: 'long', name };
  if (!/^[\u4e00-\u9fa5A-Za-z0-9_\-·]+$/.test(name)) return { ok: false, error: 'chars', name };
  return { ok: true, name };
}

/** 登录成功后的收尾：拿 uid、写本地账号、同步云端昵称（读不到就不写，避免覆盖） */
async function finish(username: string): Promise<AuthResult> {
  resetSignInFlag();
  const uid = await ensureUid();
  if (!uid) return { ok: false, error: 'session' };

  const prof = await getMyProfileEx();
  const account: Account = { uid, name: username };
  saveLocalAccount(account);
  if (prof.ok && (prof.profile.name || '') !== username) {
    await saveMyProfile({ name: username });
  }
  return { ok: true, account };
}

/* ── 自建账号（云函数 bfxAuth）─────────────────────────────────────────
 * CloudBase 拒绝纯用户名注册（501），所以自助注册走云函数：账号存 bfx_users，
 * 校验通过后签发**自定义登录 ticket**，这里拿 ticket 换真正的云端会话。
 * 老账号（控制台创建的）继续走原生 signInWithPassword，两条路并存。
 * 云函数还没部署时返回 fn_unavailable，UI 会提示「云函数未部署」。 */
type FnResult = {
  ok: boolean; uid?: string; username?: string; ticket?: string;
  error?: string; detail?: string;
};

const FN_ERRORS: Record<string, AuthError> = {
  user_exists: 'user_exists',
  user_not_found: 'user_not_found',
  wrong_password: 'wrong_password',
  name_invalid: 'name_invalid',
  password_short: 'password_short',
  custom_login_not_configured: 'custom_login',
  write_failed: 'server',
  bad_action: 'unknown',
};

async function callAuthFn(action: 'register' | 'login', username: string, password: string): Promise<FnResult> {
  /* ★ 2026-11-16：改走云函数 HTTP 访问服务。
     `app.callFunction` 在未登录时会抛 "unauthenticated credentials not found"
     （网关要求会话/publishable key），而注册恰恰发生在登录之前，所以用 HTTP 直连；
     该地址已配置 CORS，只允许本环境站点域名。 */
  try {
    const r = await fetch(AUTH_FN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action, username, password }),
    });
    const j: any = await r.json();
    if (j && typeof j === 'object') return j as FnResult;
    return { ok: false, error: 'unknown' };
  } catch (e: any) {
    return { ok: false, error: 'fn_unavailable', detail: briefDetail(errText(e)) };
  }
}

function fnFail(fn: FnResult): AuthResult {
  return { ok: false, error: FN_ERRORS[fn.error || ''] || 'unknown', detail: fn.detail };
}

async function signInWithTicket(ticket: string, username: string): Promise<AuthResult> {
  try {
    const res: any = await (auth as any).signInWithCustomTicket(() => Promise.resolve(ticket));
    if (res?.error) {
      const raw = errText(res.error);
      return { ok: false, error: mapError(raw), detail: briefDetail(raw) };
    }
    return await finish(username);
  } catch (e: any) {
    const raw = errText(e);
    return { ok: false, error: mapError(raw), detail: briefDetail(raw) };
  }
}

export async function loginWithUsername(username: string, password: string): Promise<AuthResult> {
  const v = validateUsername(username);
  if (!v.ok) return { ok: false, error: 'name_invalid' };
  if ((password || '').length < PASSWORD_MIN) return { ok: false, error: 'password_short' };

  try {
    const res: any = await (auth as any).signInWithPassword({ username: v.name, password });
    if (!res?.error) return await finish(v.name);

    const raw = errText(res.error);
    const first = mapError(raw);
    /* 原生账号不存在 / 密码不符 → 都可能是自建账号，交给云函数再判一次。
       （服务端 /auth/v1/signin 对"用户不存在"和"密码错"统一返回
        invalid_username_or_password，光看原生错误分不出来） */
    if (first === 'user_not_found' || first === 'wrong_password') {
      const fn = await callAuthFn('login', v.name, password);
      if (fn.ok && fn.ticket) return await signInWithTicket(fn.ticket, fn.username || v.name);
      if (fn.error === 'wrong_password') return fnFail(fn);
      /* 云函数也不认识这个用户名：原生若是"用户不存在"就照实说，否则保留密码错误 */
      if (fn.error === 'user_not_found' && first === 'user_not_found') {
        return { ok: false, error: 'user_not_found', detail: briefDetail(raw) };
      }
    }
    return { ok: false, error: first, detail: briefDetail(raw) };
  } catch (e: any) {
    const raw = errText(e);
    return { ok: false, error: mapError(raw), detail: briefDetail(raw) };
  }
}

export async function registerWithUsername(username: string, password: string): Promise<AuthResult> {
  const v = validateUsername(username);
  if (!v.ok) return { ok: false, error: 'name_invalid' };
  if ((password || '').length < PASSWORD_MIN) return { ok: false, error: 'password_short' };

  /* 自助注册只走云函数（原生 signUp 必须验证码，纯用户名会被服务端拒绝） */
  const fn = await callAuthFn('register', v.name, password);
  if (fn.ok && fn.ticket) return await signInWithTicket(fn.ticket, fn.username || v.name);
  if (fn.ok && !fn.ticket) {
    /* 云函数建号成功但没给 ticket（自定义登录没配好）→ 至少让用户可以去登录 */
    return { ok: false, error: 'custom_login' };
  }
  return fnFail(fn);
}

/** 社区后台自检：匿名会话 + users 集合可读（排查「社区空白」用） */
export { probeCommunity } from './authLogin';
