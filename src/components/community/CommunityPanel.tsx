/**
 * 音色社区主面板（v3.66 · 2026-10-24 用户拍板 A–J 全量落地）
 *
 * 信息架构：
 *   进门口（顺序不可换）→ 未连设备 = 连接拦截页；连上未登录 = 锁屏
 *   社区 = 推荐 / 关注 / 收藏 三页签（「我的」已并入顶栏头像页）
 *   ├─ 推荐：搜索 + 风格行 + 标签行 → 音色卡流
 *   ├─ 关注：关注 / 好友（=互关）二级分段 → **用户行**（不是音色流）
 *   └─ 收藏：只有音色卡，不掺人
 *   卡片 → 详情（试用 / 收藏 / 存入本地库）；详情作者 → TA 的主页
 *   上传 → 本地库 16 格选一格 → 填名称/风格/标签/简介 → 直接发布（不审核）
 *
 * 用户拍板要点：
 *   A 社区必须登录｜B 卡片整块进详情 + 右侧播放键｜C 收藏只在详情
 *   D 我的并入头像页｜E 必须连接设备｜F 风格 8 个｜G 计数原子自增
 *   H 不审核｜I 私信不做（按键隐藏，不摆占位）｜J 要有 TA 的主页
 */
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { C, Avatar, Badge, EmptyState, UnderlineTabs, Segmented, StyleChip, TagChip, IconBack, IconPlus, IconSearch, IconUsers, IconHeart, IconPlay, LoadingList } from './parts';
import ToneCard from './ToneCard';
import ToneDetailPage from './ToneDetailPage';
import UserHomePage from './UserHomePage';
import UploadSheet from './UploadSheet';
import { ConnectGate, LoginLock } from './Gates';
import { TONE_STYLES, TONE_STYLE_EN, guessStyle } from '../../data/toneStyles';
import { notifyOk, notifyErr } from '../../services/feedback';
import {
  fetchTonesPage, fetchTonesByIds, fetchMyTones, fetchUserTones, resolveCoverUrls, fetchProfiles,
  takeFetchError, bumpToneCount, OFFICIAL_AUTHOR, OFFICIAL_UID, deleteTone, getToneKind,
} from '../../services/toneCommunity';
import type { CommunityTone } from '../../services/toneCommunity';
import { isLoggedIn, readLocalAccount, validateSession } from '../../services/account';
import { myUid, listFavIds, addFav, removeFav, listFollowingUids, listFollowerUids, followUser, unfollowUser, loadUserRows } from '../../services/social';
import type { UserBrief } from '../../services/social';
import { loadLocalBank } from '../../services/localPresets';
import { LOCAL_BANK_ZH, LOCAL_BANK_EN } from '../../config/bankLabels';
import type { LocalPreset } from '../../services/localPresets';

type Tab = 'rec' | 'feed' | 'fav';
/**
 * ★★ v3.76（E1）：加「粉丝」分段。
 *   旧实现只有「关注 / 好友」，而好友 = 互关 —— 别人关注你之后，你**没有任何入口回关**，
 *   于是「好友」这一栏在真实使用中几乎永远为空：要先知道谁关注了你，才能去关注他。
 */
type FeedSeg = 'following' | 'followers' | 'friends';

/** 跨挂载保留的页签（模块级，仅本次会话有效） */
let lastTab: Tab = 'rec';

const SLOT_GROUPS = [
  { label: 'A', color: '#ECECEC', slots: [1, 2, 3, 4] },
  { label: 'B', color: '#3DDC84', slots: [5, 6, 7, 8] },
  { label: 'C', color: '#E2C044', slots: [9, 10, 11, 12] },
  { label: 'D', color: '#4CC9F0', slots: [13, 14, 15, 16] },
];

function timeAgo(iso: string, zh: boolean): string {
  if (!iso) return zh ? '暂无动态' : 'no activity';
  const t = new Date(iso).getTime();
  if (!t) return '';
  const d = Date.now() - t;
  const day = 86400000;
  if (d < 3600000) return zh ? `${Math.max(1, Math.floor(d / 60000))} 分钟前活跃` : `${Math.max(1, Math.floor(d / 60000))}m ago`;
  if (d < day) return zh ? `${Math.floor(d / 3600000)} 小时前活跃` : `${Math.floor(d / 3600000)}h ago`;
  if (d < day * 30) return zh ? `${Math.floor(d / day)} 天前活跃` : `${Math.floor(d / day)}d ago`;
  return zh ? '很久没发了' : 'inactive';
}

export default function CommunityPanel({
  visible, onClose, connectedDeviceId, onConnect, onApply, onStoreToBank, onStoreGroupToBank, onGoLogin, lang,
}: {
  visible: boolean;
  onClose: () => void;
  connectedDeviceId: string | null;
  onConnect: () => void;
  onApply: (data: LocalPreset, trialName?: string) => Promise<boolean> | boolean | void;
  onStoreToBank: (data: LocalPreset, slot: number, name: string) => void;
  /** ★ 2026-11-04：整组音色包（4 格）一次写入我的音色库 */
  onStoreGroupToBank?: (tones: LocalPreset[], startSlot: number) => void;
  onGoLogin: () => void;
  lang: string;
}) {
  const zh = lang !== 'en';
  const account = readLocalAccount();
  /* ★★ v3.75（C3）：`isLoggedIn()` 只看 localStorage —— 会话过期时它照样返回 true，
     社区门放行 → 所有读失败返回 []、所有写被云端规则拒，用户看到的是
     「推荐流空 / 收藏空 / 关注空 / 上传报检查网络」，而**永远不会提示重新登录**。
     这里进面板时校验一次实时云会话，失效就降级成未登录，直接亮 LoginLock。 */
  const [sessionBad, setSessionBad] = useState(false);
  const logged = isLoggedIn() && !sessionBad;

  /* 页签记忆：登录一步完成、或从顶栏账号页返回时组件会重新挂载，
     没有这个外部变量就会一律跳回「推荐」，用户刚翻到的位置白丢。 */
  const [tab, setTab] = useState<Tab>(lastTab);
  useEffect(() => { lastTab = tab; }, [tab]);
  const [feedSeg, setFeedSeg] = useState<FeedSeg>('following');
  const [tones, setTones] = useState<CommunityTone[]>([]);
  const [favTones, setFavTones] = useState<CommunityTone[]>([]);
  const [myTones, setMyTones] = useState<CommunityTone[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [style, setStyle] = useState('');
  const [tag, setTag] = useState('');
  const [favIds, setFavIds] = useState<Set<string>>(new Set());
  const [following, setFollowing] = useState<Set<string>>(new Set());
  const [follower, setFollower] = useState<Set<string>>(new Set());
  const [rows, setRows] = useState<UserBrief[]>([]);
  const [profiles, setProfiles] = useState<Record<string, { name?: string; bio?: string }>>({});
  const [detail, setDetail] = useState<CommunityTone | null>(null);
  const [userPage, setUserPage] = useState<{ uid: string; name: string } | null>(null);
  const [userTones, setUserTones] = useState<CommunityTone[]>([]);
  /* ★ v3.80（P1-14）：TA 主页原来没传 loading / 也没有失败态 ——
     请求在途时立刻显示「TA 还没有发布音色」，失败时（catch 是空的）同样显示这句，
     用户会以为对方是空号。 */
  const [userLoading, setUserLoading] = useState(false);
  const [userError, setUserError] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [storePick, setStorePick] = useState<CommunityTone | null>(null);
  const [storeSlot, setStoreSlot] = useState(0);
  const [storeName, setStoreName] = useState('');
  /* ★ 2026-11-04：整组音色包（4 格）→ 选一个目标组整组写入我的音色库 */
  const packTones = storePick && getToneKind(storePick) === 'group'
    && Array.isArray(storePick.tones) && storePick.tones.length >= 4
    ? storePick.tones.slice(0, 4)
    : null;
  const [tick, setTick] = useState(0);
  /* ══ ★★ v3.77（E6）：**计数的唯一来源**
     旧实现每次点赞/试用只改 `tones` 与 `detail`，`favTones / myTones / userTones` 里的同一个
     音色计数原地不动 —— 同一个音色在「推荐」显示 12、在「收藏」显示 11。
     现在计数器独立成一张表，四个列表渲染时统一 `view(t)` 取值，永远一致。 */
  const [counts, setCounts] = useState<Record<string, { trial: number; fav: number }>>({});
  /* ★★ v3.77（E4）：加载失败原因（空列表 ≠ 没人发） */
  const [loadErr, setLoadErr] = useState('');
  /* ★★ v3.77（E7）：createdAt 游标分页 */
  const [cursor, setCursor] = useState('');
  const [loadingMore, setLoadingMore] = useState(false);
  /* 登录成功后 isLoggedIn() 才是 true，需要一次重渲染才能从锁屏切到内容 */
  const [authTick, setAuthTick] = useState(0);

  /* ★★ v3.75（C3）：会话校验（每次打开面板 / 每次登录后重算） */
  useEffect(() => {
    if (!visible) return;
    let alive = true;
    void (async () => {
      const r = await validateSession();
      if (!alive) return;
      setSessionBad(!r.ok && r.reason === 'session_expired');
    })();
    return () => { alive = false; };
  }, [visible, authTick]);

  /** 计数 +delta（E6） */
  const bumpCount = useCallback((id: string, field: 'trial' | 'fav', delta: number) => {
    if (!id || !delta) return;
    setCounts((prev) => {
      const cur = prev[id] || { trial: 0, fav: 0 };
      return { ...prev, [id]: { ...cur, [field]: Math.max(0, (cur[field] || 0) + delta) } };
    });
  }, []);

  /** 首次见到某音色时把云端计数灌进表里（已有的不覆盖，避免盖掉本地刚 +1 的值） */
  const seedCounts = useCallback((lists: CommunityTone[][]) => {
    setCounts((prev) => {
      const next = { ...prev };
      for (const list of lists) for (const t of list) {
        if (!next[t._id]) next[t._id] = { trial: t.trialCount || 0, fav: t.favCount || 0 };
      }
      return next;
    });
  }, []);

  /** 渲染取值：一律以计数表为准（E6） */
  const view = (t: CommunityTone): CommunityTone => {
    const c = counts[t._id];
    return c ? { ...t, trialCount: c.trial, favCount: c.fav } : t;
  };

  /* ── 加载 ── */
  const loadAll = useCallback(async () => {
    if (!visible || !connectedDeviceId || !logged) return;
    setLoading(true);
    setLoadErr('');
    try {
      takeFetchError();                 // 清掉上一次的残留
      const page = await fetchTonesPage({ limit: 30 });
      const list = await resolveCoverUrls(page.list);
      setTones(list);
      setCursor(page.nextCursor);
      setLoadErr(takeFetchError());     // E4：本次是否发生过读取失败
      /* ★★ v3.81（P2-14）：三个关系查询必须各自独立结算。
         旧实现用 `Promise.all` —— 任一个 reject 就整体抛出、三个 Set 一个都不设，
         于是「已收藏」显示成「未收藏」；用户点一下走 addFav（幂等，返回 true）→
         再 bumpToneCount +1 → **favCount 虚增**。失败时保留旧值，绝不清空。 */
      const rel = await Promise.allSettled([listFavIds(), listFollowingUids(), listFollowerUids()]);
      const favs = rel[0].status === 'fulfilled' ? rel[0].value : null;
      const fo = rel[1].status === 'fulfilled' ? rel[1].value : null;
      const fr = rel[2].status === 'fulfilled' ? rel[2].value : null;
      if (favs) setFavIds(new Set(favs));
      if (fo) setFollowing(new Set(fo));
      if (fr) setFollower(new Set(fr));
      if (!favs || !fo) {
        notifyErr(lang === 'en'
          ? 'Favourites / follows not synced — pull to refresh'
          : '收藏 / 关注状态未同步，请下拉刷新', 3200);
      }
      /* ★ v3.67：头像功能按用户拍板去掉（不做上传、不取云存储 URL），
         界面统一用昵称首字色块占位。这里只取「最新昵称」与签名 ——
         取昵称还有一个用处：用户改名后，他以前发的音色要显示新名字。 */
      const uids = [...new Set(list.map((t) => t.uid).filter(Boolean) as string[])];
      const prof = await fetchProfiles(uids);
      const next: Record<string, { name?: string; bio?: string }> = {};
      for (const [uid, p] of Object.entries(prof)) next[uid] = { name: p.name, bio: p.bio };
      if (account?.uid) next[account.uid] = { ...(next[account.uid] || {}), name: account.name, bio: account.bio };
      setProfiles(next);
      // 收藏音色
      const favList = favs && favs.length > 0 ? await resolveCoverUrls(await fetchTonesByIds(favs)) : [];
      setFavTones(favList);
      const mine = account?.name ? await resolveCoverUrls(await fetchMyTones(account.name)) : [];
      setMyTones(mine);
      seedCounts([list, favList, mine]);   // E6：先灌一次基准计数
    } catch (e) {
      console.warn('community load failed', e);
    }
    setLoading(false);
  }, [visible, connectedDeviceId, logged, account?.name, account?.uid, account?.bio, tick, lang]);

  /** ★★ v3.77（E7）：加载更多 —— createdAt 游标往后取一页并追加 */
  const loadMore = useCallback(async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await fetchTonesPage({ limit: 30, cursor });
      const more = await resolveCoverUrls(page.list);
      setTones((prev) => {
        const seen = new Set(prev.map((t) => t._id));
        return [...prev, ...more.filter((t) => !seen.has(t._id))];
      });
      seedCounts([more]);
      setCursor(page.nextCursor);
      const err = takeFetchError();
      if (err) flash(zh ? '加载失败，请稍后重试' : 'Load failed, retry later', false);
    } catch {
      flash(zh ? '加载失败，请稍后重试' : 'Load failed, retry later', false);
    }
    setLoadingMore(false);
  }, [cursor, loadingMore, seedCounts, zh]);

  useEffect(() => { loadAll(); }, [loadAll]);

  /* ── 关注列表（用户维度） ── */
  const loadRows = useCallback(async () => {
    if (!logged) return;
    /* ★★ v3.76（E1）：三段各有独立数据源 ——
         关注 = 我关注的；粉丝 = 关注我的；好友 = 两者交集。 */
    const base = feedSeg === 'followers'
      ? [...follower]
      : feedSeg === 'friends'
        ? [...following].filter((u) => follower.has(u))
        : [...following];
    const uids = base.filter((u) => u && u !== OFFICIAL_UID && u !== myUid());
    if (uids.length === 0) { setRows([]); return; }
    const list = await loadUserRows(uids, following, follower);
    setRows(list);
  }, [feedSeg, following, follower, logged]);

  useEffect(() => { if (tab === 'feed') loadRows(); }, [tab, loadRows]);

  /* ── 打开 TA 主页 ── */
  const openUser = async (uid: string, name: string) => {
    /* ★★ v3.75（C6）：空 uid（v3.66 之前的旧文档没有 uid）和官方固定 uid `official`
       都没有 users 资料可查 —— 进去只会是空白主页 + 「+ 关注 TA」，
       一点就往 follows 里写永不消失的脏记录。直接不打开。 */
    if (!uid || uid === OFFICIAL_UID) {
      flash(zh ? '这个作者还没有个人主页' : 'No profile for this author', false);
      return;
    }
    if (uid === myUid()) { flash(zh ? '这是你自己' : 'That is you', false); return; }
    setUserPage({ uid, name });
    setUserTones([]);
    setUserError(null);
    setUserLoading(true);
    try {
      /* ★★ v3.76（E3）：改用按 uid 的专用查询。
         旧实现把整份推荐流（limit 60）拉回来再 filter —— 现成的 fetchUserTones 全项目零调用，
         结果 TA 的作品数一旦超过 60 条上限就被截断，用户看到的是「TA 只有这几首」。 */
      const list = await fetchUserTones(uid, name);
      setUserTones(await resolveCoverUrls(list));
      /* ★★ v3.81（P2-12）：先灌基准计数。否则从 TA 主页点「试用」时 counts 表里没有这条，
         `bumpCount` 会以 `{trial:0, fav:0}` 为基底建表 → 详情页试用数**从 12 掉到 1**。 */
      seedCounts([list]);
    } catch (e) {
      /* ★ v3.80（P1-14）：原为空 catch —— 失败静默变「空号」 */
      setUserTones([]);
      setUserError(e instanceof Error && e.message
        ? e.message
        : (zh ? '网络异常，请稍后重试' : 'Network error, please retry'));
    } finally {
      setUserLoading(false);
    }
  };

  /* ★★ v3.68：统一反馈 —— 社区里所有「已收藏 / 已关注 / 已删除 / 未连接设备」
     都走全 App 唯一的底部胶囊，不再自绘第二条浮层。 */
  const flash = (m: string, ok = true) => { if (ok) notifyOk(m); else notifyErr(m); };

  /* ── 试用 ── */
  const doTrial = async (tone: CommunityTone) => {
    if (!connectedDeviceId) { flash(zh ? '未连接设备' : 'No device', false); onConnect(); return; }
    /* ★★ v3.81（P2-13）：必须等结果再计数。
       旧实现无条件 `bumpToneCount +1` —— 而 onApply（applyLoadedTone）在
       「未连接 / isBusy」时返回 false，硬件一个字节都没变，热度却 +1，
       详情页的「试用次数」被自己刷虚。 */
    const r = onApply({ ...tone.data, slot: 0, name: tone.name }, tone.name);
    const settled = r && typeof (r as Promise<boolean>).then === 'function'
      ? await (r as Promise<boolean>)
      : (r as boolean | void);
    if (settled === false) {
      flash(zh ? '下发失败，未计入试用' : 'Apply failed, not counted', false);
      return;
    }
    bumpToneCount(tone._id, 'trialCount', 1);
    bumpCount(tone._id, 'trial', 1);     // E6：一处加，四个列表同时变
  };

  /* ── 收藏 ── */
  /* ★ v3.80（P1-14）：防连点。乐观更新下连点会「亮→灭→亮」连发请求，
     云端计数与本地计数互相追尾（最后一条回包决定成败，但计数已经 +3）。 */
  const favBusyRef = useRef<Set<string>>(new Set());
  const toggleFav = async (tone: CommunityTone) => {
    if (favBusyRef.current.has(tone._id)) return;
    favBusyRef.current.add(tone._id);
    try {
      const on = favIds.has(tone._id);
      const bump = on ? -1 : 1;
      const next = new Set(favIds);
      if (on) next.delete(tone._id); else next.add(tone._id);
      /* 乐观更新：心先亮、计数先动 */
      setFavIds(next);
      bumpCount(tone._id, 'fav', bump);
      if (on) setFavTones((prev) => prev.filter((t) => t._id !== tone._id));
      else setFavTones((prev) => [tone, ...prev.filter((t) => t._id !== tone._id)]);

      /* ★★ v3.75（C5）：返回值必须接。旧实现不看结果就无条件 flash('已收藏') ——
         被安全规则拒 / 离线 / 会话过期时，心变金色、计数 +1、提示成功，重进面板全回滚。
         失败 → 本地状态整体退回、提示失败，且**不涨计数**。 */
      const ok = on ? await removeFav(tone._id) : await addFav(tone._id);
      if (!ok) {
        setFavIds((prev) => { const b = new Set(prev); if (on) b.add(tone._id); else b.delete(tone._id); return b; });
        bumpCount(tone._id, 'fav', -bump);
        if (on) setFavTones((prev) => [tone, ...prev.filter((t) => t._id !== tone._id)]);
        else setFavTones((prev) => prev.filter((t) => t._id !== tone._id));
        flash(on ? (zh ? '取消收藏失败，请检查网络' : 'Failed, check network') : (zh ? '收藏失败，请检查网络' : 'Failed, check network'), false);
        return;
      }
      bumpToneCount(tone._id, 'favCount', bump);
      flash(on ? (zh ? '已取消收藏' : 'Removed') : (zh ? '已收藏' : 'Saved'));
    } finally {
      favBusyRef.current.delete(tone._id);
    }
  };

  /* ── 关注 / 取关 ── */
  const followBusyRef = useRef<Set<string>>(new Set());
  const toggleFollow = async (uid: string) => {
    /* C6：自己 / 官方 uid 都不允许关注（按钮已隐藏，这里再兜一层防误触） */
    if (!uid || uid === OFFICIAL_UID) return;
    const mine = myUid();
    if (mine && uid === mine) return;
    /* ★ v3.80（P1-14）：防连点（同 toggleFav） */
    if (followBusyRef.current.has(uid)) return;
    followBusyRef.current.add(uid);
    try {
      const on = following.has(uid);
      const next = new Set(following);
      if (on) next.delete(uid); else next.add(uid);
      setFollowing(next);
      const ok = on ? await unfollowUser(uid) : await followUser(uid);
      /* ★★ v3.75（C5）：同 toggleFav —— 失败必须回滚，不能假装成功 */
      if (!ok) {
        setFollowing((prev) => { const b = new Set(prev); if (on) b.add(uid); else b.delete(uid); return b; });
        flash(zh ? '操作失败，请检查网络后重试' : 'Failed, try again', false);
        return;
      }
      flash(on ? (zh ? '已取消关注' : 'Unfollowed') : (zh ? '已关注' : 'Following'));
      if (tab === 'feed') loadRows();
    } finally {
      followBusyRef.current.delete(uid);
    }
  };

  /* ── 删除自己的作品 ──
     ★★ v3.76（E5）：**先弹二次确认**。旧实现单击即 `deleteTone()` ——
     不可撤销、没有回收站、也不问一句，误触一次作品就没了。 */
  const [delConfirm, setDelConfirm] = useState<CommunityTone | null>(null);

  const askDelete = (tone: CommunityTone) => setDelConfirm(tone);

  const confirmDelete = async () => {
    const tone = delConfirm;
    if (!tone) return;
    setDelConfirm(null);
    const ok = await deleteTone(tone._id);
    flash(ok ? (zh ? '已删除' : 'Deleted') : (zh ? '删除失败（可能是早期作品）' : 'Delete failed'), ok);
    if (ok) {
      setMyTones((prev) => prev.filter((t) => t._id !== tone._id));
      setTones((prev) => prev.filter((t) => t._id !== tone._id));
      setFavTones((prev) => prev.filter((t) => t._id !== tone._id));
      setUserTones((prev) => prev.filter((t) => t._id !== tone._id));
      setDetail((d) => (d && d._id === tone._id ? null : d));
    }
  };

  /** ★★ v3.76（E5）：这条作品是不是我自己发的（决定详情页要不要给删除入口） */
  const isMine = (t: CommunityTone) => {
    if (t.official === true || !t.uid) return false;
    const mine = myUid() || account?.uid || '';
    return !!mine && t.uid === mine;
  };

  /* ── 筛选 ── */
  const tagPool = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of tones) for (const tg of (t.tags || [])) m.set(tg, (m.get(tg) || 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k]) => k);
  }, [tones]);

  const filtered = useMemo(() => {
    const kw = search.trim().toLowerCase();
    return tones.filter((t) => {
      if (kw && !(t.name.toLowerCase().includes(kw) || (t.tags || []).some((x) => x.toLowerCase().includes(kw)) || t.author.toLowerCase().includes(kw))) return false;
      const st = t.style || guessStyle(t.tags, t.category);
      if (style && st !== style) return false;
      if (tag && !(t.tags || []).includes(tag)) return false;
      return true;
    });
  }, [tones, search, style, tag]);

  if (!visible) return null;

  /* ★ v3.67 悬空修正：本组件挂在 Index 的 .panel-enter 里，而 .panel-enter 带
     `animation ... both` + `will-change: transform` —— 计算出的 transform 不是 none，
     于是它成为 position:fixed 后代的**包含块**。原先写 fixed + inset '0 0 64px 0'，
     那个 64px 就从「屏幕底」变成了「面板容器底」（容器本身已经 bottom:62），
     实际离屏幕底 62+64=126px，而底栏只有 59px → 底部空出 67px，露出首页内容。
     改成 absolute + inset:0，与本地库 / 预设库 / Studio 完全一致，自动填满同一块区域。 */
  const shell: React.CSSProperties = {
    position: 'absolute', inset: 0, background: C.bg, zIndex: 51,
    display: 'flex', flexDirection: 'column', overflow: 'hidden',
  };

  /* ── 门 1：未连设备 ── */
  if (!connectedDeviceId) {
    return (
      <div style={shell}>
        <ConnectGate onConnect={onConnect} onClose={onClose} />
      </div>
    );
  }

  /* ── 门 2：未登录（★ 一步登录：卡里直接是表单，登录完原地进社区） ── */
  if (!logged) {
    return (
      <div style={shell}>
        <LoginLock onLoggedIn={() => setAuthTick((t) => t + 1)} onClose={onClose} lang={lang} />
      </div>
    );
  }

  const favOf = (id: string) => favIds.has(id);
  /* 头像已去掉，统一首字占位（Avatar 组件的 url 留空即可）。
     作者名取云端最新昵称 → 用户改名后，他以前发布的音色立刻显示新名字。 */
  const authorNameOf = (t: CommunityTone) => (t.uid && profiles[t.uid]?.name) || t.author;

  return (
    <div style={shell}>
      {/* 顶栏 */}
      <div style={{ height: 52, display: 'flex', alignItems: 'center', gap: 4, padding: '0 8px', flexShrink: 0 }}>
        <button onClick={onClose} style={{ width: 42, height: 42, borderRadius: 12, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <IconBack />
        </button>
        <span style={{ flex: 1, fontSize: 15, fontWeight: 800, color: C.text, fontFamily: C.font }}>{zh ? '音色社区' : 'TONE COMMUNITY'}</span>
        <button onClick={() => setUploadOpen(true)} title={zh ? '上传音色' : 'Upload'} style={{
          width: 38, height: 38, borderRadius: 11, cursor: 'pointer',
          background: C.brandSoft, border: `1px solid ${C.brandLine}`, color: C.brand,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
        }}><IconPlus size={19} color={C.brand} /></button>
      </div>

      <UnderlineTabs
        tabs={[
          { id: 'rec', label: zh ? '推荐' : 'FOR YOU' },
          { id: 'feed', label: zh ? '关注' : 'FOLLOWING', badge: following.size },
          { id: 'fav', label: zh ? '收藏' : 'SAVED', badge: favIds.size },
        ]}
        active={tab}
        onChange={(id) => { setTab(id as Tab); setDetail(null); setUserPage(null); }}
      />

      {/* ── 推荐 ── */}
      {tab === 'rec' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px 16px' }} className="no-scrollbar">
          {/* 搜索 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 38, padding: '0 12px', borderRadius: 11, background: C.surface, border: `1px solid ${C.line}`, marginBottom: 10 }}>
            <IconSearch size={15} />
            <input
              value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder={zh ? '搜音色名、标签或作者' : 'Search tones, tags, creators'}
              style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: C.text, fontSize: 12, fontFamily: C.font }}
            />
            {!!search && (
              <button onClick={() => setSearch('')} style={{ background: 'transparent', border: 'none', color: C.text3, fontSize: 14, cursor: 'pointer', padding: 0, lineHeight: 1 }}>×</button>
            )}
          </div>

          {/* 风格行（实心单选） */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
            <span style={{ fontSize: 11, color: C.text3, fontFamily: C.font, flexShrink: 0, letterSpacing: '0.06em' }}>{zh ? '风格' : 'STYLE'}</span>
            <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }} className="no-scrollbar">
              <StyleChip label={zh ? '全部' : 'ALL'} active={!style} onClick={() => setStyle('')} />
              {TONE_STYLES.map((s) => (
                <StyleChip key={s} label={zh ? s : (TONE_STYLE_EN[s] || s)} active={style === s} onClick={() => setStyle(style === s ? '' : s)} />
              ))}
            </div>
          </div>

          {/* 标签行（描边多选） */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: 11, color: C.text3, fontFamily: C.font, flexShrink: 0, letterSpacing: '0.06em' }}>{zh ? '标签' : 'TAGS'}</span>
            <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }} className="no-scrollbar">
              {tagPool.length === 0 && <span style={{ fontSize: 11, color: C.text3, fontFamily: C.font }}>{zh ? '还没有标签' : 'no tags yet'}</span>}
              {tagPool.map((tg) => (
                <TagChip key={tg} label={tg} active={tag === tg} onClick={() => setTag(tag === tg ? '' : tg)} />
              ))}
            </div>
          </div>

          {loading && <LoadingList label={zh ? '正在加载音色…' : 'Loading tones…'} />}
          {/* ★★ v3.77（E4）：读取失败 ≠ 没有内容 —— 明确报错并给重试键 */}
          {!loading && tones.length === 0 && !!loadErr && (
            <EmptyState
              title={zh ? '加载失败' : 'Load failed'}
              hint={loadErr}
              action={zh ? '重试' : 'Retry'}
              onAction={() => setTick((t) => t + 1)}
              icon={<IconSearch size={22} color={C.brand} />}
            />
          )}
          {!loading && filtered.length === 0 && !loadErr && (
            <EmptyState
              /* ★★ v3.81（P2-11）：过滤只作用于**已加载的 30 条**。云端还有更多时
                 不能说「没有匹配的音色」—— 目标音色很可能在第 31 条之后。 */
              title={cursor
                ? (zh ? '已加载的里面没有匹配' : 'Nothing matched yet')
                : (zh ? '没有匹配的音色' : 'Nothing matched')}
              hint={cursor
                ? (zh ? '云端还有更多，点下面继续加载' : 'More tones on the server — keep loading')
                : (zh ? '换个风格或标签试试，也可能是第一个发的人还没出现' : 'Try another style or tag')}
              action={cursor ? (zh ? '加载更多' : 'Load more') : (zh ? '清空筛选' : 'Clear')}
              onAction={() => {
                if (cursor) { void loadMore(); return; }
                setSearch(''); setStyle(''); setTag('');
              }}
              icon={<IconSearch size={22} color={C.brand} />}
            />
          )}
          {filtered.map((tn) => (
            <ToneCard
              key={tn._id}
              tone={view(tn)}
              coverUrl={tn.coverUrl}
              officialName={zh ? 'B&F 官方' : 'B&F CORE'}
              authorName={authorNameOf(tn)}
              onOpen={() => setDetail(tn)}
              onTrial={() => doTrial(tn)}
            />
          ))}
          {/* ★★ v3.77（E7）：游标分页 —— 只有云端还有更早就给按钮
              ★★ v3.81（P2-11）：去掉 `filtered.length > 0` 前置条件。
              旧实现过滤后为空时按钮消失，而空态又说「没有匹配」→ 第 31 条之后彻底点不到。 */}
          {!loading && !!cursor && (
            <button
              onClick={() => void loadMore()}
              disabled={loadingMore}
              style={{
                width: '100%', height: 42, marginTop: 6, borderRadius: 11, cursor: loadingMore ? 'default' : 'pointer',
                background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.line2}`,
                color: loadingMore ? C.text3 : C.text2, fontSize: 11.5, fontWeight: 700,
                fontFamily: C.font, opacity: loadingMore ? 0.6 : 1,
              }}
            >{loadingMore ? (zh ? '加载中…' : 'Loading…') : (zh ? '加载更多' : 'LOAD MORE')}</button>
          )}
        </div>
      )}

      {/* ── 关注（用户维度） ── */}
      {tab === 'feed' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px 16px' }} className="no-scrollbar">
          <div style={{ marginBottom: 12 }}>
            <Segmented
              items={[
                { id: 'following', label: zh ? '关注' : 'FOLLOWING', count: following.size },
                { id: 'followers', label: zh ? '粉丝' : 'FOLLOWERS', count: follower.size },
                { id: 'friends', label: zh ? '好友' : 'FRIENDS', count: [...following].filter((u) => follower.has(u)).length },
              ]}
              active={feedSeg}
              onChange={(id) => setFeedSeg(id as FeedSeg)}
            />
          </div>

          {/* 找好友（通讯录匹配）—— 入口保留，功能下一批 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 11, borderRadius: 13, background: C.surface, border: `1px solid ${C.line}`, marginBottom: 12 }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(255,255,255,0.05)', border: `1px solid ${C.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <IconUsers size={17} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11.5, fontWeight: 750, color: C.text, fontFamily: C.font }}>{zh ? '找到好友' : 'Find friends'}</div>
              <div style={{ fontSize: 11, color: C.text3, fontFamily: C.font, marginTop: 2 }}>{zh ? '匹配通讯录里也在用 BFX1 的人，只比对手机号哈希' : 'Match contacts already on BFX1 by phone hash'}</div>
            </div>
            <span style={{ fontSize: 11, color: C.text3, fontFamily: C.font, flexShrink: 0 }}>{zh ? '即将开放' : 'SOON'}</span>
          </div>

          {rows.length === 0 && (
            <EmptyState
              title={feedSeg === 'friends'
                ? (zh ? '还没有好友' : 'No friends yet')
                : feedSeg === 'followers'
                  ? (zh ? '还没有粉丝' : 'No followers yet')
                  : (zh ? '还没关注任何人' : 'Not following anyone')}
              hint={feedSeg === 'friends'
                ? (zh ? '好友 = 互相关注。你关注的人回关你之后，就会出现在这里' : 'Friends = mutual follow')
                : feedSeg === 'followers'
                  ? (zh ? '别人在音色详情页关注你之后，就会出现在这里，可以一键回关' : 'People who follow you show up here')
                  : (zh ? '去推荐里看到喜欢的作者，点进详情关注他' : 'Follow creators you like from the feed')}
              action={zh ? '去推荐看看' : 'Go to feed'}
              onAction={() => setTab('rec')}
              icon={<IconUsers size={22} color={C.brand} />}
            />
          )}

          {rows.map((u) => (
            <div
              key={u.uid}
              onClick={() => openUser(u.uid, u.name)}
              style={{
                display: 'flex', alignItems: 'center', gap: 11, padding: 11, borderRadius: 14, marginBottom: 9,
                background: C.surface, border: `1px solid ${C.line}`, cursor: 'pointer', minHeight: 64,
              }}
            >
              <Avatar
                name={u.name}
                size={46}
                radius={14}
                ring={u.followsMe ? 'rgba(91,200,143,0.5)' : undefined}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 750, color: C.text, fontFamily: C.font, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.name}</span>
                  {u.following && u.followsMe && <Badge text={zh ? '好友' : 'FRIEND'} tone="friend" />}
                </div>
                <div style={{ fontSize: 11, color: C.text3, fontFamily: C.font, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: 3 }}>
                  {u.bio || (zh ? '这个人还没写签名' : 'No bio yet')}
                </div>
                <div style={{ fontSize: 11, color: C.text3, fontFamily: C.font }}>
                  {u.works} {zh ? '个音色' : 'tones'} · {timeAgo(u.active, zh)}
                </div>
              </div>
              {/* 私信按键按用户拍板 I 隐藏。
                  ★★ v3.76（E1）：粉丝段的人我可能还没关注 → 这里显示「回关」而不是「已关注」 */}
              <button
                onClick={(e) => { e.stopPropagation(); void toggleFollow(u.uid); }}
                style={{
                  height: 30, padding: '0 12px', borderRadius: 9, cursor: 'pointer', flexShrink: 0,
                  background: u.following ? 'transparent' : C.brandSoft,
                  border: `1px solid ${u.following ? C.line2 : C.brandLine}`,
                  color: u.following ? C.text3 : C.brand,
                  fontSize: 11, fontWeight: 700, fontFamily: C.font,
                }}
              >{u.following
                ? (zh ? '已关注' : 'FOLLOWING')
                : (u.followsMe ? (zh ? '+ 回关' : '+ FOLLOW BACK') : (zh ? '+ 关注' : '+ FOLLOW'))}</button>
            </div>
          ))}
        </div>
      )}

      {/* ── 收藏（只有音色） ── */}
      {tab === 'fav' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px 16px' }} className="no-scrollbar">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontSize: 11.5, fontWeight: 800, color: C.text2, fontFamily: C.font, letterSpacing: '0.06em' }}>{zh ? '我的收藏' : 'SAVED TONES'}</span>
            <span style={{ fontSize: 11, color: C.text3, fontFamily: C.font }}>{favTones.length} {zh ? '个 · 云端同步' : '· cloud synced'}</span>
          </div>
          {favTones.length === 0 && (
            <EmptyState
              title={zh ? '还没有收藏' : 'No saved tones'}
              hint={zh ? '在音色详情页点底部的心，就会出现在这里' : 'Tap the heart on a tone detail page'}
              action={zh ? '去推荐页' : 'Browse'}
              onAction={() => setTab('rec')}
              icon={<IconHeart size={22} color={C.gold} />}
            />
          )}
          {favTones.map((tn) => (
            <ToneCard
              key={tn._id}
              tone={view(tn)}
              coverUrl={tn.coverUrl}
              officialName={zh ? 'B&F 官方' : 'B&F CORE'}
              authorName={authorNameOf(tn)}
              onOpen={() => setDetail(tn)}
              onTrial={() => doTrial(tn)}
            />
          ))}

          {/* 我的作品（从「我的」页签并到这里以下，保持收藏区只放音色的原则：作品单独一段） */}
          {myTones.length > 0 && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '18px 0 10px' }}>
                <span style={{ fontSize: 11.5, fontWeight: 800, color: C.text2, fontFamily: C.font, letterSpacing: '0.06em' }}>{zh ? '我发布的' : 'MY UPLOADS'}</span>
                <span style={{ fontSize: 11, color: C.text3, fontFamily: C.font }}>{myTones.length}</span>
              </div>
              {myTones.map((tn) => (
                <div key={tn._id} style={{ position: 'relative' }}>
                  <ToneCard
                    tone={view(tn)}
                    coverUrl={tn.coverUrl}
                    officialName={zh ? 'B&F 官方' : 'B&F CORE'}
                    authorName={authorNameOf(tn)}
                    onOpen={() => setDetail(tn)}
                    onTrial={() => doTrial(tn)}
                  />
                  <button
                    onClick={(e) => { e.stopPropagation(); askDelete(tn); }}
                    style={{
                      position: 'absolute', right: 10, top: 10, height: 22, padding: '0 8px', borderRadius: 7,
                      background: 'rgba(0,0,0,0.55)', border: `1px solid ${C.line2}`, color: 'rgba(255,140,140,0.9)',
                      fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: C.font,
                    }}
                  >{zh ? '删除' : 'DEL'}</button>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* 详情页 */}
      {detail && (
        <ToneDetailPage
          tone={view(detail)}
          coverUrl={detail.coverUrl}
          authorName={authorNameOf(detail)}
          isFav={favOf(detail._id)}
          following={!!detail.uid && following.has(detail.uid)}
          /* ★★ v3.75（C6）：官方 / 自己 / 无 uid 一律不给关注键 */
          canFollow={!!detail.uid && detail.official !== true && detail.uid !== OFFICIAL_UID && detail.uid !== myUid()}
          connected={!!connectedDeviceId}
          officialName={zh ? 'B&F 官方' : 'B&F CORE'}
          onBack={() => setDetail(null)}
          onTrial={() => doTrial(detail)}
          onToggleFav={() => toggleFav(detail)}
          onStore={() => { setStorePick(detail); setStoreSlot(0); setStoreName(detail.name); }}
          onOpenUser={() => { const u = detail.uid || ''; setDetail(null); openUser(u, authorNameOf(detail)); }}
          onFollow={() => detail.uid && toggleFollow(detail.uid)}
          /* ★★ v3.76（E5）：只有作者本人看自己的作品才给删除入口 */
          canDelete={isMine(detail)}
          onDelete={() => askDelete(detail)}
          lang={lang}
        />
      )}

      {/* TA 的主页 */}
      {userPage && (
        <UserHomePage
          uid={userPage.uid}
          name={profiles[userPage.uid]?.name || userPage.name}
          bio={profiles[userPage.uid]?.bio}
          tones={userTones.map(view)}
          loading={userLoading}
          error={userError}
          onRetry={() => { if (userPage) void openUser(userPage.uid, userPage.name); }}
          lang={lang}
          following={following.has(userPage.uid)}
          followsMe={follower.has(userPage.uid)}
          isMe={!!userPage.uid && (userPage.uid === account?.uid || userPage.uid === myUid())}
          officialName={zh ? 'B&F 官方' : 'B&F CORE'}
          onBack={() => { setUserPage(null); }}
          onFollow={() => toggleFollow(userPage.uid)}
          onOpenTone={(tn) => setDetail(tn)}
          onTrialTone={(tn) => doTrial(tn)}
        />
      )}

      {/* 上传 */}
      <UploadSheet
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        uid={account?.uid || ''}
        author={account?.name || ''}
        lang={lang}
        onUploaded={() => { loadAll(); flash(zh ? '发布成功' : 'Published'); }}
      />

      {/* 存入本地库：选 16 格之一 */}
      {storePick && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 82, background: 'rgba(4,5,7,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18 }}>
          <div style={{ width: '100%', maxWidth: 330, background: C.surface, borderRadius: 16, border: `1px solid ${C.line2}`, padding: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: C.text, fontFamily: C.font, textAlign: 'center', marginBottom: 4 }}>
              {packTones
                ? (zh ? `整组存入${LOCAL_BANK_ZH}（4 格）` : `Save group to ${LOCAL_BANK_EN.toLowerCase()} (4 slots)`)
                : (zh ? `存入${LOCAL_BANK_ZH}` : `Save to ${LOCAL_BANK_EN.toLowerCase()}`)}
            </div>
            <div style={{ fontSize: 11, color: C.text3, fontFamily: C.font, textAlign: 'center', marginBottom: 12 }}>
              {packTones
                ? (zh ? '选一个目标组，4 格一起写；仍只写本机' : 'Pick a target bank, all 4 written locally')
                : (zh ? `只写${LOCAL_BANK_ZH}，不上传硬件` : 'Local only, hardware untouched')}
            </div>
            {packTones ? (
              <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                {SLOT_GROUPS.map((g) => {
                  const start = g.slots[0];
                  const on = storeSlot === start;
                  return (
                    <button key={g.label} onClick={() => setStoreSlot(start)} style={{
                      flex: 1, height: 44, borderRadius: 9, cursor: 'pointer',
                      background: on ? `${g.color}22` : 'rgba(255,255,255,0.035)',
                      border: `1px solid ${on ? g.color : C.line}`,
                      color: on ? g.color : C.text3, fontSize: 11.5, fontWeight: 800, fontFamily: C.font,
                    }}>{zh ? `${g.label} 组` : `BANK ${g.label}`}</button>
                  );
                })}
              </div>
            ) : SLOT_GROUPS.map((g) => (
              <div key={g.label} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                {g.slots.map((sn) => {
                  const on = storeSlot === sn;
                  return (
                    <button key={sn} onClick={() => setStoreSlot(sn)} style={{
                      flex: 1, height: 40, borderRadius: 9, cursor: 'pointer',
                      background: on ? `${g.color}22` : 'rgba(255,255,255,0.035)',
                      border: `1px solid ${on ? g.color : C.line}`,
                      color: on ? g.color : C.text3, fontSize: 11, fontWeight: 800, fontFamily: C.font,
                    }}>{g.label}{sn}</button>
                  );
                })}
              </div>
            ))}
            <input value={storeName} onChange={(e) => setStoreName(e.target.value)} maxLength={24} placeholder={zh ? '音色名称' : 'Tone name'} style={{
              width: '100%', padding: '10px 12px', borderRadius: 10, boxSizing: 'border-box', marginTop: 8,
              background: 'rgba(255,255,255,0.045)', border: `1px solid ${C.line2}`, color: C.text,
              fontSize: 12, outline: 'none', fontFamily: C.font,
            }} />
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button onClick={() => setStorePick(null)} style={{ flex: 1, height: 40, borderRadius: 11, border: `1px solid ${C.line2}`, background: 'transparent', color: C.text2, fontSize: 11.5, fontWeight: 700, cursor: 'pointer', fontFamily: C.font }}>{zh ? '取消' : 'Cancel'}</button>
              <button
                disabled={storeSlot < 1 || (!!packTones && !onStoreGroupToBank)}
                onClick={() => {
                  if (storeSlot < 1) return;
                  if (packTones) {
                    if (!onStoreGroupToBank) return;
                    const base = storeName.trim() || storePick.name;
                    onStoreGroupToBank(
                      packTones.map((t, k) => ({ ...t, name: k === 0 ? base : (t.name || `${base} ${k + 1}`) })),
                      storeSlot,
                    );
                    setStorePick(null);
                    flash(zh ? `已整组存入 ${['A', 'B', 'C', 'D'][Math.floor((storeSlot - 1) / 4)]} 组` : 'Group saved');
                    return;
                  }
                  onStoreToBank({ ...storePick.data, slot: storeSlot }, storeSlot, storeName.trim() || storePick.name);
                  setStorePick(null);
                  flash(zh ? `已存入 ${['A', 'B', 'C', 'D'][Math.floor((storeSlot - 1) / 4)]}${storeSlot}` : 'Saved');
                }}
                style={{
                  flex: 1, height: 40, borderRadius: 11, border: 'none',
                  cursor: storeSlot >= 1 ? 'pointer' : 'default',
                  background: storeSlot >= 1 ? C.brand : 'rgba(255,255,255,0.06)',
                  color: storeSlot >= 1 ? '#3b281c' : C.text3, fontSize: 11.5, fontWeight: 800, fontFamily: C.font,
                }}
              >{zh ? '存入' : 'SAVE'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ★★ v3.76（E5）：删除二次确认 —— 删除不可撤销、没有回收站 */}
      {delConfirm && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 84, background: 'rgba(4,5,7,0.74)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 22 }}>
          <div style={{ width: '100%', maxWidth: 300, background: C.surface, borderRadius: 16, border: `1px solid ${C.line2}`, padding: 18 }}>
            <div style={{ fontSize: 13.5, fontWeight: 800, color: C.text, fontFamily: C.font, textAlign: 'center', marginBottom: 6 }}>
              {zh ? '删除这条音色？' : 'Delete this tone?'}
            </div>
            <div style={{ fontSize: 11, color: C.text3, fontFamily: C.font, textAlign: 'center', lineHeight: 1.6, marginBottom: 14 }}>
              {zh ? `「${delConfirm.name}」将从社区永久移除，无法恢复。收藏与关注记录不会受影响。`
                  : `"${delConfirm.name}" will be removed permanently.`}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setDelConfirm(null)} style={{
                flex: 1, height: 42, borderRadius: 11, border: `1px solid ${C.line2}`, background: 'transparent',
                color: C.text2, fontSize: 11.5, fontWeight: 700, cursor: 'pointer', fontFamily: C.font,
              }}>{zh ? '取消' : 'Cancel'}</button>
              <button onClick={() => { void confirmDelete(); }} style={{
                flex: 1, height: 42, borderRadius: 11, border: 'none', background: '#E05555',
                color: '#FFF', fontSize: 11.5, fontWeight: 800, cursor: 'pointer', fontFamily: C.font,
              }}>{zh ? '删除' : 'DELETE'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ★★ v3.68（用户拍板 ABCD）：社区不再自绘轻提示 ——
          统一由 services/feedback.ts 走全 App 唯一的底部胶囊位置。 */}
    </div>
  );
}
