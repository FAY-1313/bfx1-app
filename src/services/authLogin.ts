/**
 * 账号流程（v3.67 · 2026-10-24 用户拍板）
 *
 * 用户拍板：
 *   · 登录**一步完成** —— 手机号 + 验证码在同一页输完，不再「锁屏 → 再跳一个登录页」
 *   · **去掉头像** —— 不做头像上传，界面统一用昵称首字色块占位
 *   · **用户名可自行修改** —— 2–12 字，中英文数字下划线，不能与本机其它账号重名
 *
 * 这里只放「流程」，UI 在 components/community/LoginForm.tsx。
 * 抽出来的原因：社区锁屏卡与顶栏账号页要共用同一套流程，避免两处各写一遍再分叉。
 *
 * ★ 关键（v3.66 已修正，别改回去）：验证码通过后**绝不 resetToAnonymous()**。
 *   旧实现「验完码立刻退回匿名」会让 _openid 每次重登都变 → 关注 / 收藏 / 我的作品全丢。
 *   现在保持手机号会话，uid 一次登录终身稳定。
 */
import type { SmsVerificationInfo } from './smsCode';
import { verifySmsCode } from './smsCode';
import { resetSignInFlag, getMyProfileEx, saveMyProfile } from './toneCommunity';
import { ensureUid, saveLocalAccount, readLocalAccount } from './account';
import type { Account } from './account';

/** 本机昵称索引（老版本就在用这个键，保留以免丢历史账号） */
const ACCOUNTS_KEY = 'bfx_accounts';
type NameIndex = Record<string, { h?: string; c?: string; phone?: string }>;

export const NAME_MIN = 2;
export const NAME_MAX = 12;

function readIndex(): NameIndex {
  try { return JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || '{}'); } catch { return {}; }
}
function writeIndex(v: NameIndex): void {
  try { localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(v)); } catch { /* 配额满忽略 */ }
}

/** 首次登录的默认昵称：玩家 + 手机号后 4 位，本机重名自动加序号 */
export function suggestName(phone: string): string {
  const idx = readIndex();
  const base = `玩家${phone.slice(-4)}`;
  if (!idx[base]) return base;
  for (let i = 2; i < 1000; i++) {
    const n = `${base}${i}`;
    if (!idx[n]) return n;
  }
  return `${base}${Date.now() % 1000}`;
}

export type NameError = 'empty' | 'short' | 'long' | 'chars' | 'taken';

export function validateName(raw: string): { ok: boolean; error?: NameError; name: string } {
  const name = (raw || '').trim();
  if (!name) return { ok: false, error: 'empty', name };
  if (name.length < NAME_MIN) return { ok: false, error: 'short', name };
  if (name.length > NAME_MAX) return { ok: false, error: 'long', name };
  /* 只允许中英文 / 数字 / 下划线 / 短横 / 中点 —— 表情和空格会把卡片标题撑破行 */
  if (!/^[\u4e00-\u9fa5A-Za-z0-9_\-·]+$/.test(name)) return { ok: false, error: 'chars', name };
  const me = readLocalAccount();
  const taken = Object.keys(readIndex()).some((k) => k === name && k !== me?.name);
  if (taken) return { ok: false, error: 'taken', name };
  return { ok: true, name };
}

export type LoginError = 'expired' | 'wrong' | 'session' | 'verify';
/* ★ 不用判别联合：本工程 strict:false → strictNullChecks 关闭，字面量 true/false 会被拓宽成
   boolean，`if (res.ok)` 收窄失效，调用处访问 res.error 会报 TS2339。可选项写法更稳。 */
export type LoginResult = { ok: boolean; account?: Account; error?: LoginError };

/**
 * 一步登录 / 自动建号。
 * @param phone 已去空格的 11 位手机号
 * @param code  6 位验证码
 * @param info  sendSmsCode() 返回的 verificationInfo（一次性，失败后必须重新获取）
 */
export async function loginWithPhone(phone: string, code: string, info: SmsVerificationInfo): Promise<LoginResult> {
  const v = await verifySmsCode(info, phone, code);
  if (!v.success) {
    return { ok: false, error: /expired/i.test(v.error || '') ? 'expired' : 'wrong' };
  }

  // ★ 不 resetToAnonymous：保持手机号会话，uid 终身稳定（见文件头注释）
  resetSignInFlag();
  const uid = await ensureUid();
  if (!uid) return { ok: false, error: 'session' };

  // 昵称优先取云端（换设备仍是同一个名），其次按手机号命中本机已有账号，最后按规则新建
  /* ★★ v3.76（E8）：必须区分「云端没有资料」与「读取失败」。
     旧实现 `getMyProfile()` 两种都返回 {}，于是弱网/离线时算出「玩家XXXX」，
     紧接着 `saveMyProfile({ name })` 把云端旧昵称**永久覆盖** —— 老用户改名一次，
     他所有历史作品的作者名全跟着变，且无法恢复。
     现在：读失败 → 本机昵称照用（界面不至于空白），但**绝不写云端 name**；
     他的真实昵称还在云上，下次登录读到就自动同步回来。 */
  const prof = await getMyProfileEx();
  const cloud = prof.profile;
  const idx = readIndex();
  const existing = Object.entries(idx).find(([, a]) => a.phone === phone);
  let name = (cloud.name || '').trim();
  if (!name && existing) name = existing[0];
  if (!name) name = suggestName(phone);
  idx[name] = { ...(idx[name] || {}), c: (idx[name] || {}).c || new Date().toISOString(), phone };
  writeIndex(idx);

  const account: Account = { uid, name, phone, bio: cloud.bio };
  saveLocalAccount(account);
  if (prof.ok) {
    await saveMyProfile({ name }); // 让社区里其他人看到正确的作者名
  } else {
    console.warn('loginWithPhone: 读取云端资料失败，跳过写 name，避免覆盖历史昵称');
  }
  return { ok: true, account };
}

export type RenameResult = { ok: boolean; name?: string; error?: NameError | 'session' };

/** 改用户名：本地账号 + 本机索引 + 云端 users 三处一起改 */
export async function renameUser(raw: string): Promise<RenameResult> {
  const cur = readLocalAccount();
  if (!cur) return { ok: false, error: 'session' };
  const check = validateName(raw);
  if (!check.ok) return { ok: false, error: check.error! };

  const next = check.name;
  if (next === cur.name) return { ok: true, name: next };

  const idx = readIndex();
  const old = idx[cur.name];
  delete idx[cur.name];
  idx[next] = { ...(old || {}), c: (old || {}).c || new Date().toISOString(), phone: cur.phone };
  writeIndex(idx);

  saveLocalAccount({ ...cur, name: next });
  await saveMyProfile({ name: next });
  return { ok: true, name: next };
}
