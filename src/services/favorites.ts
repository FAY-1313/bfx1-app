/**
 * 音色收藏本地服务 — 收藏存本机 (不占预设槽位).
 * 来源: 社区音色 (source:'community', cover=CloudBase fileID, coverUrl 为已解析临时 URL)
 *       或 手动添加当前设备音色 (source:'local', cover=dataURL).
 * 序号 = 数组下标 + 1; 删除用 splice 自然重排.
 */
import type { LocalPreset } from './localPresets';

export interface FavoriteItem {
  id: string;                 // 随机 id, 仅作 React key/删除目标
  refId?: string;             // 社区 tone._id, 用于去重
  name: string;
  description?: string;
  cover?: string;             // 社区=CloudBase fileID; 本地=dataURL
  coverUrl?: string;          // fileID 已解析临时 URL 缓存 (过期仅影响显示, 不持久化依赖)
  tags: string[];
  category: 'guitar' | 'bass';
  data: LocalPreset;
  source: 'community' | 'local';
  /** 文件类型 (v33): 单=预设文件 / 组=预设组 (4 音色); 旧收藏无此字段 → 视为 single */
  kind?: 'single' | 'group';
  /** 仅 group: 4 个完整音色 (slot=0) */
  presets?: LocalPreset[];
  createdAt: number;
}

const FAV_KEY = 'bfx_favorites';

export function loadFavorites(): FavoriteItem[] {
  try {
    const raw = localStorage.getItem(FAV_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as FavoriteItem[]) : [];
  } catch {
    return [];
  }
}

export function saveFavorites(list: FavoriteItem[]): void {
  try {
    localStorage.setItem(FAV_KEY, JSON.stringify(list));
  } catch { /* 配额超限忽略 */ }
}

export function addFavorite(input: Omit<FavoriteItem, 'id' | 'createdAt'>): FavoriteItem {
  const item: FavoriteItem = {
    ...input,
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    createdAt: Date.now(),
  };
  saveFavorites([item, ...loadFavorites()]);
  return item;
}

export function removeFavorite(id: string): FavoriteItem[] {
  const list = loadFavorites().filter((it) => it.id !== id);
  saveFavorites(list);
  return list;
}

export function updateFavorite(id: string, patch: Partial<FavoriteItem>): FavoriteItem[] {
  const list = loadFavorites().map((it) => (it.id === id ? { ...it, ...patch } : it));
  saveFavorites(list);
  return list;
}

export function findFavoriteByRef(refId: string): FavoriteItem | undefined {
  return loadFavorites().find((it) => it.refId === refId);
}

/** 封面为 CloudBase fileID (cloud://) 或已解析的 http(s) 临时 URL */
export function isCoverFileId(cover?: string): boolean {
  return !!cover && (cover.startsWith('cloud://') || /^https?:\/\//.test(cover));
}

/** 封面为本地 dataURL */
export function isCoverDataUrl(cover?: string): boolean {
  return !!cover && cover.startsWith('data:');
}
