/**
 * 账号态（v3.66）—— 社区的唯一身份来源。
 *
 * ★ 2026-10-24 用户拍板 A：社区必须登录才能进。因此进社区时一定已有手机号会话，
 *   云端身份 = auth.currentUser.uid（手机号用户的 uid，跨设备稳定）。
 *
 * ★ 与 v3.65 的关键差异：登录成功后**不再 resetToAnonymous()**。
 *   旧实现「验完码立刻退回匿名」会让 _openid 在每次重登后变化 →
 *   关注、收藏、我的作品全都会「换台机器就丢」，这是社区功能的致命伤。
 *   现在保持手机号会话，uid 一次登录终身稳定。
 *
 * 匿名 openid 只在「还没登录」时用（官方预置音色 seed 用），不参与任何用户数据归属。
 */
import { auth } from './cloudbase';

export interface Account {
  /** 业务 uid = CloudBase auth uid */
  uid: string;
  name: string;
  phone?: string;
  /** 头像 fileID */
  avatar?: string;
  bio?: string;
}

const USER_KEY = 'bfx_user';

/** 同步读本地账号（不含 uid 时返回 uid:''）。UI 首帧用它，不阻塞渲染。 */
export function readLocalAccount(): Account | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    const u = JSON.parse(raw);
    if (typeof u?.username !== 'string' || !u.username) return null;
    return {
      uid: typeof u.uid === 'string' ? u.uid : '',
      name: u.username,
      phone: typeof u.phone === 'string' ? u.phone : undefined,
      avatar: typeof u.avatar === 'string' ? u.avatar : undefined,
      bio: typeof u.bio === 'string' ? u.bio : undefined,
    };
  } catch {
    return null;
  }
}

export function saveLocalAccount(acc: Account): void {
  try {
    localStorage.setItem(USER_KEY, JSON.stringify({
      username: acc.name, phone: acc.phone, uid: acc.uid, avatar: acc.avatar, bio: acc.bio,
    }));
  } catch { /* 配额满忽略 */ }
}

export function patchLocalAccount(patch: Partial<Account>): Account | null {
  const cur = readLocalAccount();
  if (!cur) return null;
  const next = { ...cur, ...patch };
  saveLocalAccount(next);
  return next;
}

export function clearLocalAccount(): void {
  try { localStorage.removeItem(USER_KEY); } catch { /* 忽略 */ }
}

/** 已登录？—— 只认「本地有账号 且 有 uid」，避免旧版本留下的半截数据被当成登录态 */
export function isLoggedIn(): boolean {
  const a = readLocalAccount();
  return !!a && !!a.uid;
}

/** 同步取 uid（未登录返回空串）。只在「已确认登录」的分支里用。 */
export function currentUidSync(): string {
  const live = (auth as any)?.currentUser?.uid;
  if (typeof live === 'string' && live) return live;
  return readLocalAccount()?.uid || '';
}

/**
 * 确保有可用会话并返回 uid。
 *  - 已有会话（手机号 / 匿名）→ 直接用，**不再重复登录**
 *  - 无会话且本地有账号 → 说明会话过期，返回空串让调用方提示重新登录
 *  - 无会话且无账号 → 匿名登录（仅官方 seed 需要）
 */
export async function ensureUid(allowAnonymous = false): Promise<string> {
  const live = (auth as any)?.currentUser?.uid;
  if (typeof live === 'string' && live) {
    rememberUid(live);
    return live;
  }
  // SDK 内部状态可能比 currentUser 慢一拍（刚验完验证码的瞬间），补一次显式查询
  try {
    const state = await (auth as any).getLoginState?.();
    const uid = state?.user?.uid;
    if (typeof uid === 'string' && uid) {
      rememberUid(uid);
      return uid;
    }
  } catch { /* 忽略 */ }
  const local = readLocalAccount();
  if (local) {
    // 有本地账号但云会话丢了 → 不偷偷退回匿名，否则用户数据会「人间蒸发」
    return '';
  }
  if (!allowAnonymous) return '';
  try {
    await (auth as any).signInAnonymously();
    const uid = (auth as any)?.currentUser?.uid;
    return typeof uid === 'string' ? uid : '';
  } catch {
    return '';
  }
}

/**
 * ★★ v3.75（C3）：校验「本地账号」与「实时云会话」是否一致。
 *
 * 症状来源：`isLoggedIn()` 只读 localStorage。用户重装 / 久未使用 / 换设备后，
 * 本地账号还在，但云会话已经失效 → 社区门照常放行 → 所有读走 catch 返回 `[]`、
 * 所有写被规则拒，界面表现为「整块社区静默变空 + 上传报检查网络」，
 * **永远不会提示重新登录**，用户只能卸载重装或找客服。
 *
 * 返回：
 *   · `{ ok: true,  uid }`               —— 会话有效
 *   · `{ ok: false, reason: 'no_account' }`        —— 本来就没登录
 *   · `{ ok: false, reason: 'session_expired' }`   —— 有账号无会话 → 必须重新登录
 *   · `{ ok: true,  uid, reason: 'uid_resynced' }` —— uid 被云端刷新（换号残留），已自动纠正
 */
export async function validateSession(): Promise<{ ok: boolean; uid: string; reason?: string }> {
  const local = readLocalAccount();
  if (!local) return { ok: false, uid: '', reason: 'no_account' };

  let live = (auth as any)?.currentUser?.uid;
  if (typeof live !== 'string' || !live) {
    /* SDK 内部状态可能慢一拍，补一次显式查询 */
    try {
      const state = await (auth as any).getLoginState?.();
      live = state?.user?.uid ?? '';
    } catch { /* ignore */ }
  }
  if (typeof live !== 'string' || !live) {
    return { ok: false, uid: '', reason: 'session_expired' };
  }
  if (local.uid && local.uid !== live) {
    /* localStorage 里残留另一个 uid（换号 / 旧数据）→ 以云会话为准，纠正本地 */
    rememberUid(live);
    return { ok: true, uid: live, reason: 'uid_resynced' };
  }
  if (!local.uid) rememberUid(live);
  return { ok: true, uid: live };
}

/** 把 auth uid 落到本地账号，供 UI 同步读取 */
export function rememberUid(uid: string): void {
  const acc = readLocalAccount();
  if (!acc) return;
  if (acc.uid === uid) return;
  saveLocalAccount({ ...acc, uid });
}

/**
 * 退出登录：清掉落本账号 + 结束云会话。
 * ★ 必须真的 signOut —— v3.65 只删了 localStorage，云会话还在，
 *   下次点进社区会被当成「已登录」但没有账号名，写操作还会写到旧 uid 上。
 */
export async function signOutAccount(): Promise<void> {
  clearLocalAccount();
  try { await (auth as any).signOut(); } catch { /* 忽略 */ }
}
