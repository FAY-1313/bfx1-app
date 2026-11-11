/**
 * 社区社交层（v3.66，2026-10-24 用户拍板）—— 关注 / 好友 / 收藏，全部云端。
 *
 * ★ 关注模型：follows 集合，一条 = fromUid 关注 toUid。
 *   · 关注数（我关注了几个人）= where({ fromUid: me })
 *   · 粉丝数（几个人关注我）  = where({ toUid: me })
 *   · **好友 = 互关**：我关注的 uid 集合 ∩ 关注我的 uid 集合。
 *     不另建「好友」集合 —— 互关是两向各一条记录的自然结果，
 *     单独存一份好友表只会产生「关注了但好友表没同步」这类不一致。
 *
 * ★ 收藏模型：favs 集合，一条 = { uid, toneId }。uid + toneId 唯一（客户端去重）。
 *   旧的 localStorage `bfx_favorites` 不再作为社区收藏的真相源（D6 要求全云端）。
 *
 * ★ 用户资料：users 集合按 uid 存（昵称/头像/签名）。列表展示的人名、头像都从
 *   users + tones 冗余字段取，不依赖本地账号名，这样看别人的列表也正确。
 */
import { auth, db } from './cloudbase';
import { ensureSignIn, fetchProfiles, OFFICIAL_UID } from './toneCommunity';
import { rememberUid } from './account';

export interface UserBrief {
  uid: string;
  name: string;
  avatar?: string;
  bio?: string;
  /** 作品数 */
  works: number;
  /** 粉丝数 */
  fans: number;
  /** 我是否关注了 TA */
  following: boolean;
  /** TA 是否关注我（与 following 同时为真 = 好友/互关） */
  followsMe: boolean;
  /** 最近活跃：作品最新 createdAt（无作品返回空串） */
  active: string;
}

function me(): string {
  const u = (auth as any)?.currentUser?.uid;
  if (typeof u === 'string' && u) { rememberUid(u); return u; }
  return '';
}

/** 我的 uid（同步，可能为空；写操作前先 await ensureSession()） */
export function myUid(): string {
  return me();
}

/** 确保会话就绪并返回 uid；未登录返回空串（调用方应提示登录） */
export async function ensureSession(): Promise<string> {
  await ensureSignIn();
  return me();
}

// ─── 关注 ──────────────────────────────────────────────────────────

export async function followUser(toUid: string): Promise<boolean> {
  const uid = await ensureSession();
  if (!uid || !toUid || uid === toUid) return false;
  /* ★★ v3.75（C6）：官方音色的 uid 是固定字符串 `official`，不是真实账号 ——
     关注它会在 follows 里沉淀 `toUid:'official'` 的永久脏数据，关注页再按 uid
     反查 users 必然查不到 → 出现一个点不开、也取关不掉的幽灵用户。 */
  if (toUid === OFFICIAL_UID) return false;
  try {
    const res = await db.collection('follows').where({ fromUid: uid, toUid }).limit(1).get();
    if ((res.data || []).length > 0) return true; // 已关注，幂等
    await db.collection('follows').add({ fromUid: uid, toUid, createdAt: new Date().toISOString() });
    return true;
  } catch (e) {
    console.error('followUser failed:', e);
    return false;
  }
}

export async function unfollowUser(toUid: string): Promise<boolean> {
  const uid = await ensureSession();
  if (!uid || !toUid) return false;
  try {
    const res: any = await db.collection('follows').where({ fromUid: uid, toUid }).remove();
    /* ★★ v3.75（C5）：where().remove() 被安全规则挡掉时**不抛错**，resolve 出 deleted:0 ——
       旧实现无条件 return true，于是本地状态先翻成「已取关」，重进面板又变回关注。
       与 deleteTone 同口径：deleted 是数字就必须 >0；老 SDK 不带该字段才保持乐观。 */
    return typeof res?.deleted === 'number' ? res.deleted > 0 : true;
  } catch (e) {
    console.error('unfollowUser failed:', e);
    return false;
  }
}

/** 我关注的 uid 列表 */
export async function listFollowingUids(): Promise<string[]> {
  const uid = await ensureSession();
  if (!uid) return [];
  try {
    const res = await db.collection('follows').where({ fromUid: uid }).limit(200).get();
    return ((res.data || []) as any[]).map((d) => String(d.toUid || '')).filter(Boolean);
  } catch { return []; }
}

/** 关注我的 uid 列表 */
export async function listFollowerUids(): Promise<string[]> {
  const uid = await ensureSession();
  if (!uid) return [];
  try {
    const res = await db.collection('follows').where({ toUid: uid }).limit(200).get();
    return ((res.data || []) as any[]).map((d) => String(d.fromUid || '')).filter(Boolean);
  } catch { return []; }
}

/** 互关（好友）uid 列表 = 两个集合的交集 */
export async function listFriendUids(): Promise<string[]> {
  const [a, b] = await Promise.all([listFollowingUids(), listFollowerUids()]);
  const setB = new Set(b);
  return a.filter((u) => setB.has(u));
}

/**
 * 关注页数据：把 uid 列表补成可渲染的用户行。
 * ★ 故意**不带 orderBy**：`where({uid}) + orderBy('createdAt')` 是复合条件，需要先在
 *   控制台建索引，没建会直接报错 → 整个关注页空白。这里取回后客户端排序，只依赖单字段查询。
 *
 * ★★ v3.76（E2）：
 *   旧实现 `works = list.length`（查询 limit 30 → 有 31 个作品的人永远显示 30），
 *   且 `fans: 0` 是硬编码，粉丝数在任何界面都是 0。
 *   现在：作品与活跃时间用**一次批量取回**（limit 1000，本地聚合），粉丝数用
 *   `follows where toUid in [...]` 一次取回再本地计数 —— 仍然只有 2 个额外查询，
 *   与原来「每人一次」的请求量相比更少，且不再有 30 的硬上限。
 */
export async function loadUserRows(uids: string[], followingSet: Set<string>, followerSet: Set<string>): Promise<UserBrief[]> {
  await ensureSession();
  if (uids.length === 0) return [];
  const profiles = await fetchProfiles(uids);

  /* `in` 数组按 100 分批（CloudBase 单次 in 的元素数量有上限） */
  const chunks: string[][] = [];
  for (let i = 0; i < uids.length; i += 100) chunks.push(uids.slice(i, i + 100));

  const worksMap: Record<string, number> = {};
  const activeMap: Record<string, string> = {};
  const fansMap: Record<string, number> = {};
  const _ = (db as any).command;

  try {
    await Promise.all(chunks.map(async (part) => {
      const res = await db.collection('tones').where({ uid: _.in(part) }).limit(1000).get();
      for (const t of ((res.data || []) as any[])) {
        const u = String(t.uid || '');
        if (!u) continue;
        worksMap[u] = (worksMap[u] || 0) + 1;
        const c = String(t.createdAt || '');
        if (c > (activeMap[u] || '')) activeMap[u] = c;
      }
    }));
  } catch { /* 忽略：作品数退化为 0，不影响关注关系本身 */ }

  try {
    await Promise.all(chunks.map(async (part) => {
      const res = await db.collection('follows').where({ toUid: _.in(part) }).limit(1000).get();
      for (const f of ((res.data || []) as any[])) {
        const u = String(f.toUid || '');
        if (u) fansMap[u] = (fansMap[u] || 0) + 1;
      }
    }));
  } catch { /* 忽略 */ }

  const rows: UserBrief[] = [];
  for (const uid of uids) {
    const p = profiles[uid] || {};
    rows.push({
      uid,
      name: p.name || uid.slice(0, 6),
      avatar: p.avatar,
      bio: p.bio,
      works: worksMap[uid] || 0,
      fans: fansMap[uid] || 0,
      following: followingSet.has(uid),
      followsMe: followerSet.has(uid),
      active: activeMap[uid] || '',
    });
  }
  // 有关注动作的人排前面，然后是最近发过东西的
  return rows.sort((a, b) => (b.active || '').localeCompare(a.active || ''));
}

// ─── 收藏 ──────────────────────────────────────────────────────────

export async function addFav(toneId: string): Promise<boolean> {
  const uid = await ensureSession();
  if (!uid || !toneId) return false;
  try {
    const res = await db.collection('favs').where({ uid, toneId }).limit(1).get();
    if ((res.data || []).length > 0) return true;
    await db.collection('favs').add({ uid, toneId, createdAt: new Date().toISOString() });
    return true;
  } catch (e) {
    console.error('addFav failed:', e);
    return false;
  }
}

export async function removeFav(toneId: string): Promise<boolean> {
  const uid = await ensureSession();
  if (!uid || !toneId) return false;
  try {
    const res: any = await db.collection('favs').where({ uid, toneId }).remove();
    /* ★★ v3.75（C5）：同 unfollowUser —— 规则挡掉时 resolve deleted:0，不能无条件成功 */
    return typeof res?.deleted === 'number' ? res.deleted > 0 : true;
  } catch (e) {
    console.error('removeFav failed:', e);
    return false;
  }
}

/** 我收藏的 toneId 列表（后收藏的在前）。同样用客户端排序，避免复合索引依赖 */
export async function listFavIds(): Promise<string[]> {
  const uid = await ensureSession();
  if (!uid) return [];
  try {
    const res = await db.collection('favs').where({ uid }).limit(200).get();
    return ((res.data || []) as any[])
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
      .map((d) => String(d.toneId || ''))
      .filter(Boolean);
  } catch { return []; }
}
