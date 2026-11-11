/**
 * 音色社区云服务 (v3.66) — CloudBase 直连.
 *
 * ★ 2026-10-24 用户拍板 A「社区必须登录」→ 本文件所有读写都要求在**手机号会话**下进行。
 *   云端身份 = auth.currentUser.uid，与 account.ts 的 uid 同源、跨设备稳定。
 *   ensureSignIn() 不再无条件 signInAnonymously（那会顶掉已有会话，导致关注/收藏换 uid 后全丢）。
 *
 * ★ 数据模型 v3.66（用户拍板 F/G/H）：
 *   tones  : style(8 枚举) + tags(≤5 自写) + trialCount + favCount + uid/author/avatar
 *            **不再区分单个/预设组**，也没有审核态（H：不要审核，发布即公开）
 *   favs   : { uid, toneId, createdAt }        —— 收藏全云端
 *   follows: { fromUid, toUid, createdAt }     —— 好友 = 双向各一条（互关）
 *   users  : { uid, name, avatar, bio }        —— 按 uid 存，换设备不丢
 */
import { app, auth, db } from './cloudbase';
import type { LocalPreset } from './localPresets';
import { OFFICIAL_TONES } from '../data/officialTones';
import { guessStyle } from '../data/toneStyles';
import { ensureUid, readLocalAccount, rememberUid } from './account';

/** 官方文件作者名 (v34: 半角 &) */
export const OFFICIAL_AUTHOR = 'B&F core';
/** ★ v3.75（C6）：官方音色的 uid 是固定字符串，**不是真实账号** ——
    关注它会在 follows 里写 toUid:'official'，users 里永远查不到 → 幽灵用户。
    social.ts 的 followUser 会直接拒绝；社区里也不渲染「关注」键。 */
export const OFFICIAL_UID = 'official';
/** 音色文件类型: 单个预设 / 预设组 (4 个一组) */
export type ToneKind = 'single' | 'group';

export interface CommunityTone {
  _id: string;
  /** 作者 uid（v3.66 起写。旧文档无此字段 → 用 author 名兜底匹配） */
  uid?: string;
  author: string;
  /** 作者头像 fileID（冗余存一份，列表不必再查 users） */
  avatar?: string;
  name: string;
  description?: string;
  /** ★ v3.66：风格（8 枚举，单选）。旧文档无 → 空串 */
  style?: string;
  /** ★ v3.66：自定义标签 ≤5 */
  tags: string[];
  category: 'guitar' | 'bass';
  /** 封面图 fileID (CloudBase 云存储) */
  cover?: string;
  /** 封面临时 URL (显示用, getTempFileURL 换算) */
  coverUrl?: string;
  /** ⚠ 旧字段：v3.66 起不再有单个/预设组之分，仅保留以便读取历史文档 */
  kind?: ToneKind;
  /** 官方文件标记 (B&F core 云预置) */
  official?: boolean;
  data: LocalPreset;
  /** ⚠ 旧字段：历史预设组，新 UI 不展示也不上传 */
  tones?: LocalPreset[];
  /** ★ v3.66：试用次数（卡片 ▶ 计数） */
  trialCount?: number;
  /** ★ v3.66：收藏次数（卡片 ♥ 计数） */
  favCount?: number;
  downloads: number;
  createdAt: string;
  updatedAt: string;
}

export interface ToneUpload {
  uid: string;
  author: string;
  avatar?: string;
  name: string;
  description?: string;
  style?: string;
  tags: string[];
  category: 'guitar' | 'bass';
  cover?: string;
  data: LocalPreset;
  /** ★ 2026-11-04：整组分享（4 格音色包，与"我的音色库 · 整组上传"同口径） */
  kind?: ToneKind;
  tones?: LocalPreset[];
}

/** 旧文档无 kind → 视为 single; 有 tones 且无 kind → 视为 group (防御) */
export function getToneKind(t: Pick<CommunityTone, 'kind' | 'tones'>): ToneKind {
  if (t.kind === 'group' || (!t.kind && Array.isArray(t.tones) && t.tones.length > 0)) return 'group';
  return 'single';
}

let signedIn = false;

/**
 * 确保有云会话（v3.66）。
 * ★ 不再无条件匿名登录：已有手机号会话时直接复用；只有「完全没有会话」才匿名（官方 seed 兜底）。
 *   旧实现会在登录后被任何一次读操作顶成匿名 → uid 变化 → 关注/收藏全丢。
 */
export async function ensureSignIn(): Promise<void> {
  if (signedIn) return;
  const live = (auth as any)?.currentUser?.uid;
  if (typeof live === 'string' && live) {
    signedIn = true;
    rememberUid(live);
    return;
  }
  // 本地有账号却没有会话 → 说明会话过期。这里**不能**退化成匿名，
  // 否则用户下次读到的是别人的空数据；交给调用方按「未登录」处理。
  if (readLocalAccount()) return;
  try {
    await auth.signInAnonymously();
    signedIn = true;
  } catch (e) {
    console.warn('CloudBase anonymous sign-in failed:', e);
  }
}

/** 登录会话建立后调用，强制下一次读重新确认会话（不会退回匿名） */
export function resetSignInFlag(): void {
  signedIn = false;
}

/** 当前 uid. 安全规则按 doc._openid == auth.uid 隔离身份, 改/删必须带此条件. */
function currentUid(): string {
  const u = (auth as any).currentUser?.uid;
  return typeof u === 'string' ? u : '';
}

/* ══════════════════════════════════════════════════════════════════
 * ★★ v3.77（E4）：把「读取失败」从**静默**变成**可查询**
 *
 * 旧实现每个 fetch 的 catch 都 `return []` —— 用户看到空列表，分不清是
 * 「社区确实没人发」还是「网络/权限挂了」，只能干等。这里记一条最近失败原因，
 * 调用方（CommunityPanel）在列表为空时读它决定显示「空状态」还是「错误 + 重试」。
 * 用「读走即清」避免旧错误干扰下一次成功的加载。
 * ══════════════════════════════════════════════════════════════════ */
let lastFetchError = '';
function noteFetchError(api: string, e: unknown): void {
  const msg = (e as { message?: string })?.message || String(e);
  lastFetchError = `${api}：${msg}`;
}
/** 取走并清空最近一次读取错误（空串 = 没有错误） */
export function takeFetchError(): string {
  const e = lastFetchError;
  lastFetchError = '';
  return e;
}

/** 对外暴露的 uid（社区所有写操作都要带） */
export async function requireUid(): Promise<string> {
  await ensureSignIn();
  return currentUid() || (await ensureUid());
}

/**
 * 推荐流音色列表（云端最新在前）。
 * v3.66：风格/标签筛选改在**客户端**做 —— tags 是数组，云端 `where tags == x` 只能全等匹配，
 * 组合筛选写到服务端反而更贵；一页 50 条在本地过滤毫无压力。
 */
export interface ToneQuery {
  category?: string;
  search?: string;
  style?: string;
  tag?: string;
  /** ★★ v3.77（E7）：上一页最后一条的 createdAt —— 有值就取「更早」的一页 */
  cursor?: string;
  /** 每页条数（缺省 30） */
  limit?: number;
}

export interface TonePage {
  list: CommunityTone[];
  /** 下一页游标；为空 = 没有更多 */
  nextCursor: string;
}

/**
 * 推荐流分页（云端最新在前）。
 * v3.66：风格/标签筛选改在**客户端**做（tags 是数组，云端只能全等匹配）。
 * ★★ v3.77（E7）：固定 `limit(60)` 改成 **createdAt 游标翻页**（不用 skip —— 深翻页 skip
 *   是 O(n) 扫描）。官方内置目录只在**首页**参与合并，否则翻页会把官方条目重复插进每一页。
 */
export async function fetchTonesPage(q0?: ToneQuery): Promise<TonePage> {
  await ensureSignIn();
  const limit = Math.min(Math.max(q0?.limit ?? 30, 1), 60);
  const cond: Record<string, any> = {};
  if (q0?.category) cond.category = q0.category;
  if (q0?.search) cond.name = db.RegExp({ regexp: q0.search, options: 'i' });
  if (q0?.cursor) cond.createdAt = (db as any).command.lt(q0.cursor);
  let q: any = db.collection('tones');
  if (Object.keys(cond).length > 0) q = q.where(cond);
  let cloud: CommunityTone[] = [];
  try {
    const res = await q.orderBy('createdAt', 'desc').limit(limit).get();
    cloud = (res.data || []) as CommunityTone[];
  } catch (e) {
    console.warn('fetchTonesPage failed:', e);
    noteFetchError('读取音色列表', e);
  }
  const raw = q0?.cursor ? cloud : mergeOfficialBaseline(cloud, q0);
  const filtered = raw.filter((t) => {
    if (q0?.style && (t.style || guessStyle(t.tags, t.category)) !== q0.style) return false;
    if (q0?.tag && !(t.tags || []).includes(q0.tag)) return false;
    return true;
  });
  const last = cloud[cloud.length - 1];
  return {
    list: filtered,
    /* 云端返回不足一页 = 到底了；游标用云端最后一条（不含官方兜底条目） */
    nextCursor: cloud.length >= limit && last ? String(last.createdAt || '') : '',
  };
}

/** 兼容旧调用方：单页推荐流（首页 30 条 + 官方兜底） */
export async function fetchTones(opts?: ToneQuery): Promise<CommunityTone[]> {
  const page = await fetchTonesPage({ ...opts, limit: opts?.limit ?? 60 });
  return page.list;
}

/** 内置官方目录 → CommunityTone（云端没有该 _id 时用它兜底，收藏页/列表共用） */
function officialToTone(s: (typeof OFFICIAL_TONES)[number]): CommunityTone {
  return {
    _id: s._id,
    uid: OFFICIAL_UID,
    author: OFFICIAL_AUTHOR,
    name: s.name,
    description: s.description,
    style: guessStyle(s.tags, s.category),
    tags: s.tags,
    category: s.category,
    official: true,
    data: s.data,
    trialCount: 0,
    favCount: 0,
    downloads: 0,
    createdAt: s.createdAt,
    updatedAt: s.createdAt,
  } as CommunityTone;
}

/** 用内置官方目录补齐云端缺失的官方文件 (按固定 _id 去重), 并应用分类/搜索客户端过滤 */
function mergeOfficialBaseline(cloud: CommunityTone[], _opts?: { category?: string; search?: string }): CommunityTone[] {
  /* ★★★ v3.78（2026-10-26 用户拍板）：云端官方 45 条已全部删除，**不重建**。
     这里是「云端没有就注入内置目录」的兜底 —— 不关掉，App 一打开就会把 45 条
     重新灌回列表，等于没删。现在一律返回云端真实数据（云端空 = 空态）。 */
  return cloud;
}

/**
 * 我的作品（v3.66）。
 * ★ 按 uid 查，不再按昵称 —— 昵称可重名，按名字查会串号（别人的作品出现在我的列表里）。
 * uid 为空（旧版本匿名上传的历史文档没有 uid）→ 回退按 author 名查一次，尽量不让老用户「作品消失」。
 */
export async function fetchMyTones(author: string): Promise<CommunityTone[]> {
  await ensureSignIn();
  const uid = currentUid();
  if (uid) {
    try {
      const res = await db.collection('tones').where({ uid }).orderBy('createdAt', 'desc').limit(60).get();
      const mine = (res.data || []) as CommunityTone[];
      if (mine.length > 0) return mine;
    } catch (e) {
      console.warn('fetchMyTones by uid failed:', e);
      noteFetchError('读取我的作品', e);
    }
  }
  if (!author) return [];
  try {
    const res = await db.collection('tones').where({ author }).orderBy('createdAt', 'desc').limit(60).get();
    /* ★★ v3.76（E9）：按 author 名的回退**只对没有 uid 的历史文档**生效。
       昵称可重名 —— 不加这道过滤，任何与他人同名的用户都会把别人的作品收进「我的」，
       进而在自己的列表里出现删不掉、也打不开详情的他人音色。 */
    return ((res.data || []) as CommunityTone[]).filter((t) => !t.uid);
  } catch { return []; }
}

/** 某个用户的音色（TA 的主页用） */
export async function fetchUserTones(uid: string, name: string): Promise<CommunityTone[]> {
  await ensureSignIn();
  try {
    const res = await db.collection('tones').where({ uid }).orderBy('createdAt', 'desc').limit(40).get();
    const list = (res.data || []) as CommunityTone[];
    if (list.length > 0 || !name) return list;
  } catch { /* 回退按名字 */ }
  try {
    const res = await db.collection('tones').where({ author: name }).orderBy('createdAt', 'desc').limit(40).get();
    /* ★★ v3.76（E9）：同 fetchMyTones —— author 回退只收无 uid 的历史文档，避免同名串号 */
    return ((res.data || []) as CommunityTone[]).filter((t) => !t.uid);
  } catch { return []; }
}

/** 按 _id 批量取音色（收藏页用） */
export async function fetchTonesByIds(ids: string[]): Promise<CommunityTone[]> {
  await ensureSignIn();
  if (ids.length === 0) return [];
  const _ = (db as any).command;
  const byId = new Map<string, CommunityTone>();
  /* ★★ v3.75（C8）：**按 100 条分批**。旧实现一次 `.limit(100)` 查完全部 id，
     收藏超过 100 条之后多出来的永远查不到 —— 角标显示 N，列表却只有 100 条。 */
  for (let i = 0; i < ids.length; i += 100) {
    const part = ids.slice(i, i + 100);
    try {
      const res = await db.collection('tones').where({ _id: _.in(part) }).limit(100).get();
      for (const t of (res.data || []) as CommunityTone[]) byId.set(t._id, t);
    } catch (e) {
      console.warn('fetchTonesByIds chunk failed:', e);
    }
  }
  /* ★ v3.78：官方兜底已移除（云端官方音色已清空）。云端查不到的 _id 就是真实失效条目，
     由收藏页显示为「已失效」并允许一键清理，不再用内置目录假装还在。 */
  // 保持收藏顺序（后收藏的在前）
  return ids.map((id) => byId.get(id)).filter(Boolean) as CommunityTone[];
}

/** 上传音色（H：不审核，成功即公开） */
export async function uploadTone(data: ToneUpload): Promise<boolean> {
  /* ★★ v3.75（C7）：uid **必须来自当前云会话**，不能信调用方传进来的值。
     原来这里直接用 CommunityPanel 从 localStorage 读的 uid，而收藏/关注用的是 auth.uid ——
     两者不一致时（会话过期、换号残留、匿名兜底）会出现两种症状：
       ① 能收藏、不能上传（写被规则拒，却只报「检查网络」）；
       ② 作品写到错误 uid 下 → 「作者是我」但 fetchMyTones 查不到 → 永远删不掉。
     规则要求 `doc.uid == auth.uid`，所以客户端先自证一次，失败就直接报错，不发无效请求。 */
  const uid = await requireUid();
  if (!uid) {
    console.error('uploadTone: no live session uid');
    return false;
  }
  if (data.uid && data.uid !== uid) {
    console.error('uploadTone: uid mismatch', { passed: data.uid, session: uid });
    return false;
  }
  try {
    await db.collection('tones').add({
      ...data,
      uid,
      trialCount: 0,
      favCount: 0,
      downloads: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    return true;
  } catch (e) {
    console.error('uploadTone failed:', e);
    return false;
  }
}

/**
 * 计数自增（G：原子自增）。
 * 用 db.command.inc 而不是「读出来 +1 再写回」——后者两个用户同时点会把计数写丢。
 * 安全规则通常会拦「改别人文档」；被拦就静默跳过，UI 上的数字只是热度参考，不影响主流程。
 */
export async function bumpToneCount(id: string, field: 'trialCount' | 'favCount', delta = 1): Promise<void> {
  await ensureSignIn();
  if (!id) return;
  /* ★★ v3.75（C2）：改走**云函数** `bumpToneCount`。
     原来直接 `doc(id).update({ [field]: _.inc(delta) })` —— 改的是别人的文档，
     而 `tones` 的 update 规则只允许作者本人 → 除自己作品外全部被拒，catch 又把错误吞掉。
     症状：卡片上的 +1 只是内存假象，重进页面立刻归零，isHot 的金色阈值永远触发不了。
     云函数带 admin 权限、绕开行级规则；`tones` 的 update 规则因此可以保持最严
     （别人依旧改不了你的音色内容）。 */
  try {
    const res: any = await (app as any).callFunction({
      name: 'bumpToneCount',
      data: { id, field, delta },
    });
    const out = res?.result;
    if (out && out.ok === false) console.warn('bumpToneCount rejected:', out.err);
  } catch { /* 计数只是热度参考，失败不影响主流程 */ }
}

/**
 * 删除音色。官方文件禁止删除。
 *
 * ★ v3.75（2026-10-25）：查询条件从 `_openid` 改为 `uid`。
 *   Web 端（Capacitor 里跑的是 Web SDK）用手机号登录时，`add()` 写入的文档不一定带
 *   `_openid`，而 v3.66 起每条音色都显式写了 `uid`，安全规则也按 `doc.uid == auth.uid`
 *   判归属。旧写法 `where({ _id, _openid: uid })` 在无 `_openid` 时查询直接为空
 *   → 删除永远返回 false（用户看到「删不掉自己的音色」）。
 *   服务端规则仍会逐条校验归属，客户端这层只是提前拦掉明显不该删的。
 */
export async function deleteTone(id: string): Promise<boolean> {
  await ensureSignIn();
  const uid = currentUid();
  if (!uid) return false;
  try {
    const res = await db.collection('tones').where({ _id: id, uid }).limit(1).get();
    const doc = (res.data || [])[0] as CommunityTone | undefined;
    if (!doc || doc.official === true) return false;
    const removed: any = await db.collection('tones').where({ _id: id, uid }).remove();
    /* remove 返回 { deleted: n }；老版本 SDK 可能不带该字段 → 保持乐观 */
    const n = removed?.deleted;
    return typeof n === 'number' ? n > 0 : true;
  } catch (e) {
    console.error('deleteTone failed:', e);
    return false;
  }
}

/* ★★ v3.75（C1）：**客户端不再写官方音色** —— 整段 seed / 诊断日志（含 seedingInFlight
 * 与 recordSeedLog）已删除。
 *
 * 旧实现用固定 _id `doc().set()` 写 45 条官方音色，但安全规则要求 `doc.uid == auth.uid`，
 * 种子里的 uid 是 `official`（不是登录用户）→ 每次冷启动都发一次注定被拒的写，静默失败。
 *
 * 现在官方数据由云函数 `seedOfficial`（管理端调用，admin 权限）一次性灌入，
 * uid 固定 `official`。要更新官方内容：重跑云函数即可，客户端无需发版。
 * 客户端只保留 `mergeOfficialBaseline()` 作**离线兜底**（云端拉不到时用内置目录补，
 * 按 _id 去重，不会出现双份）。
 */

/** 上传图片 (头像/封面), 返回 fileID */
export async function uploadImage(file: File | Blob, cloudPath: string): Promise<string | null> {
  await ensureSignIn();
  try {
    // 调用方 cloudPath 可能带原文件名 (空格/中文), COS 对象名签名会失败 → 重写为安全文件名
    const safePath = sanitizeCloudPath(cloudPath, (file as File).name);
    // @cloudbase/js-sdk 类型把 filePath 声明为 string, 但浏览器端实际支持 File/Blob
    const res = await app.uploadFile({ cloudPath: safePath, filePath: file as unknown as string });
    return res.fileID || null;
  } catch (e) {
    console.error('uploadImage failed:', e);
    return null;
  }
}

/** 保留目录前缀, 文件名改为 img_<ts>_<rand>.<ext>; ext 从原文件名取, 无则 jpg */
function sanitizeCloudPath(cloudPath: string, rawName?: string): string {
  const slash = cloudPath.lastIndexOf('/');
  const dir = slash >= 0 ? cloudPath.slice(0, slash + 1) : '';
  const m = (rawName || '').match(/\.([a-zA-Z0-9]+)$/);
  const ext = m ? m[1].toLowerCase() : 'jpg';
  return `${dir}img_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
}

/**
 * 图片压缩转码: 读文件 → canvas 缩到 ≤maxSize → JPEG Blob.
 * 解决相机原图过大 (几 MB) / HEIC 等格式无法展示的问题; 失败返回 null (不抛错).
 */
export async function compressImageToJPEG(file: File | Blob, maxSize = 512, quality = 0.85): Promise<Blob | null> {
  try {
    const dataUrl = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => resolve('');
      reader.readAsDataURL(file);
    });
    if (!dataUrl) return null;
    const img = new Image();
    const loaded = await new Promise<boolean>((resolve) => {
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      img.src = dataUrl;
    });
    if (!loaded) return null;
    const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, w, h);
    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  } catch {
    return null;
  }
}

/** fileID → 临时访问 URL */
export async function getImageUrl(fileID: string): Promise<string> {
  try {
    const res = await app.getTempFileURL({ fileList: [fileID] });
    return res.fileList?.[0]?.tempFileURL || '';
  } catch { return ''; }
}

/** 批量解析封面临时 URL */
export async function resolveCoverUrls(tones: CommunityTone[]): Promise<CommunityTone[]> {
  const ids = tones.map((t) => t.cover).filter(Boolean) as string[];
  if (ids.length === 0) return tones;
  try {
    const res = await app.getTempFileURL({ fileList: ids });
    const map: Record<string, string> = {};
    (res.fileList || []).forEach((f: any) => { if (f.fileID && f.tempFileURL) map[f.fileID] = f.tempFileURL; });
    return tones.map((t) => (t.cover && map[t.cover] ? { ...t, coverUrl: map[t.cover] } : t));
  } catch { return tones; }
}

// ─── 我的资料 (users 集合) ─────────────────────────────────────────
// ★ v3.66：按 uid 字段查，不再只靠 _openid —— 后者在旧版「验完码退回匿名」时每次重登都会变，
//   头像和签名换台设备就丢。uid 是手机号会话给的，跨设备稳定。

interface MyProfile { _id?: string; uid?: string; avatar?: string; name?: string; bio?: string }

/**
 * ★★ v3.76（E8）：带成败标记的资料读取。
 *   `getMyProfile()` 把「没有文档」和「查询失败」都返回 `{}`，调用方无法区分 ——
 *   登录流程据此给老用户生成「玩家XXXX」并**写回云端**，一次弱网抖动就把昵称永久改掉，
 *   他所有历史作品的作者名也跟着变。这里把两种情况分开。
 */
export async function getMyProfileEx(): Promise<{ ok: boolean; profile: MyProfile }> {
  await ensureSignIn();
  const uid = currentUid();
  if (!uid) return { ok: false, profile: {} };
  try {
    const res = await db.collection('users').where({ uid }).limit(1).get();
    const doc = (res.data || [])[0] as MyProfile | undefined;
    return { ok: true, profile: doc || {} };
  } catch (e) {
    console.warn('getMyProfileEx failed:', e);
    return { ok: false, profile: {} };
  }
}

/** 读当前账号资料（avatar fileID / 昵称 / 签名）。读失败与无文档都返回 {} —— 需要区分请用 getMyProfileEx */
export async function getMyProfile(): Promise<MyProfile> {
  const r = await getMyProfileEx();
  return r.profile;
}

/** 只取头像 fileID（保留旧接口） */
export async function getMyAvatar(): Promise<string> {
  const p = await getMyProfile();
  return p.avatar || '';
}

/** 保存资料到云端（avatar / name / bio 任一）。首次自动建文档。 */
export async function saveMyProfile(patch: { avatar?: string; name?: string; bio?: string }): Promise<boolean> {
  await ensureSignIn();
  const uid = currentUid();
  if (!uid) return false;
  try {
    const res = await db.collection('users').where({ uid }).limit(1).get();
    const doc = (res.data || [])[0] as MyProfile | undefined;
    const payload = { ...patch, uid, updated_at: new Date().toISOString() };
    if (doc?._id) {
      await db.collection('users').doc(doc._id).update(payload);
    } else {
      await db.collection('users').add({ ...payload, created_at: new Date().toISOString() });
    }
    return true;
  } catch (e) {
    console.error('saveMyProfile failed:', e);
    return false;
  }
}

/** 保存当前账号头像 fileID（保留旧接口） */
export async function setMyAvatar(fileID: string): Promise<boolean> {
  return saveMyProfile({ avatar: fileID });
}

/** 批量取用户资料（关注列表 / 详情作者卡） */
export async function fetchProfiles(uids: string[]): Promise<Record<string, MyProfile>> {
  await ensureSignIn();
  const out: Record<string, MyProfile> = {};
  const ids = [...new Set(uids.filter(Boolean))];
  if (ids.length === 0) return out;
  const _ = (db as any).command;
  try {
    const res = await db.collection('users').where({ uid: _.in(ids) }).limit(100).get();
    for (const d of (res.data || []) as MyProfile[]) {
      if (d.uid) out[d.uid] = d;
    }
  } catch { /* 无权限/离线 → 空资料 */ }
  return out;
}
