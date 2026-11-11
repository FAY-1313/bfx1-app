/**
 * 音色收藏面板 (C档改造) — 内嵌于音色库, 支持搜索/来源筛选/编辑, 添加与编辑走弹层.
 *
 * 来源: 社区音色 (source:'community') + 手动添加当前设备音色 (source:'local').
 * 操作: 添加收藏 / 编辑 / 删除 / 试听 / 保存到预设 (A1-D4 槽位).
 * 序号 = 数组下标 + 1, 删除后自动重排.
 * 封面: fileID (CloudBase) 每次 mount 批量重解析临时 URL, dataURL (本地) 直接显示.
 */
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useI18n } from '../i18n';
import { PanelHeader } from '../ui/PanelHeader';
import { getImageUrl } from '../services/toneCommunity';
import {
  loadFavorites, addFavorite, removeFavorite, updateFavorite,
  isCoverFileId, isCoverDataUrl,
} from '../services/favorites';
import type { FavoriteItem } from '../services/favorites';
import type { LocalPreset } from '../services/localPresets';
import OverflowMenu from '../ui/OverflowMenu';
import type { OverflowAction } from '../ui/OverflowMenu';
import { notifyOk } from '../services/feedback';

const GOLD = '#f0b429';
const ACCENT = '#4cc9f0';

// A1-D4 槽位分组 (组件内复制, 避免 import pages/Index 循环引用)
const SLOT_GROUPS = [
  { label: 'A', color: '#ececec', slots: [1, 2, 3, 4] },
  { label: 'B', color: '#3ddc84', slots: [5, 6, 7, 8] },
  { label: 'C', color: '#e2c044', slots: [9, 10, 11, 12] },
  { label: 'D', color: '#4cc9f0', slots: [13, 14, 15, 16] },
];

// 标签库: 三组, 值即标签文本 (中文). 每组部分显示, 可展开全部.
const TAG_LIBRARY: Array<{ key: string; tags: string[] }> = [
  { key: 'favorites.tagStyle', tags: ['清音', '轻过载', '过载', '失真', '法兹', '金属', '高增益', '摇滚', '布鲁斯', '爵士', '流行', '乡村'] },
  { key: 'favorites.tagFx', tags: ['延迟', '混响', '合唱', '镶边', '相位', '哇音', '颤音', '压缩', '降噪', '激励'] },
  { key: 'favorites.tagUse', tags: ['节奏吉他', '主音吉他', '独奏', '分解和弦', '扫弦', '录音', '现场', '练习'] },
];
const PARTIAL_COUNT = 6;
const MAX_TAGS = 6;

/** 本地图片 → 压缩 dataURL (≤240px JPEG, 防 localStorage 配额); 任何环节失败都回退原始 dataURL, 绝不 reject */
function fileToDataUrl(file: File, maxSize = 240): Promise<string> {
  return new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(String(reader.result)); return; }
        ctx.drawImage(img, 0, 0, w, h);
        try { resolve(canvas.toDataURL('image/jpeg', 0.82)); } catch { resolve(String(reader.result)); }
      };
      img.onerror = () => resolve(String(reader.result));
      img.src = String(reader.result);
    };
    reader.onerror = () => resolve('');
    reader.readAsDataURL(file);
  });
}

interface AddForm {
  name: string;
  description: string;
  cover: string;
  category: 'guitar' | 'bass';
  tags: Set<string>;
  customTag: string;
}

const defaultForm = (): AddForm => ({
  name: '',
  description: '',
  cover: '',
  category: 'guitar',
  tags: new Set<string>(),
  customTag: '',
});

type SourceFilter = 'all' | 'community' | 'local';

export default function FavoritesPanel({
  visible, onClose, connectedDeviceId, getCurrentTone, onApply, onSaveToPreset, onReplaceGroupTones, embedded = false,
}: {
  visible: boolean;
  onClose: () => void;
  connectedDeviceId: string | null;
  getCurrentTone: () => LocalPreset | null;
  onApply: (data: LocalPreset) => void;
  onSaveToPreset: (data: LocalPreset, slot: number, name: string) => void;
  onReplaceGroupTones?: (tones: LocalPreset[], groupLabel: string) => void;
  embedded?: boolean;
}) {
  const { t } = useI18n();
  const [items, setItems] = useState<FavoriteItem[]>([]);
  const [coverUrlMap, setCoverUrlMap] = useState<Record<string, string>>({});
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<AddForm>(defaultForm);
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set());
  const [slotModal, setSlotModal] = useState<{ item: FavoriteItem; slot: number; name: string } | null>(null);
  const [groupPick, setGroupPick] = useState<{ tones: LocalPreset[]; group: string } | null>(null);
  /* ★★ v3.68（用户拍板 ABCD）：收藏面板不再自绘提示条 —— 统一走底部胶囊。 */
  const setNotice = (m: string) => { if (m) notifyOk(m); };
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<SourceFilter>('all');
  const coverInputRef = useRef<HTMLInputElement>(null);

  // 打开面板: 重载列表 + 批量解析社区封面 fileID 临时 URL
  useEffect(() => {
    if (!visible) return;
    setNotice('');
    setShowAdd(false);
    setEditId(null);
    setSlotModal(null);
    setGroupPick(null);
    setItems(loadFavorites());
    let alive = true;
    (async () => {
      const favs = loadFavorites();
      const ids = [...new Set(favs.map((f) => f.cover).filter((c): c is string => !!c && isCoverFileId(c)))];
      const map: Record<string, string> = {};
      await Promise.all(ids.map(async (id) => {
        const url = await getImageUrl(id);
        if (url) map[id] = url;
      }));
      if (alive) setCoverUrlMap(map);
    })();
    return () => { alive = false; };
  }, [visible]);

  const refreshItems = useCallback(() => setItems(loadFavorites()), []);

  const getCoverSrc = (item: FavoriteItem): string => {
    if (item.coverUrl) return item.coverUrl;
    if (isCoverDataUrl(item.cover)) return item.cover!;
    if (item.cover && isCoverFileId(item.cover) && coverUrlMap[item.cover]) return coverUrlMap[item.cover];
    return '';
  };

  const filtered = items.filter((item) => {
    if (filter !== 'all' && item.source !== filter) return false;
    const kw = search.trim().toLowerCase();
    if (kw && !item.name.toLowerCase().includes(kw) && !item.tags.some((tag) => tag.toLowerCase().includes(kw))) return false;
    return true;
  });

  // ── 添加 / 编辑收藏 ──
  const openAddForm = () => {
    if (showAdd) { setShowAdd(false); setEditId(null); return; }
    const payload = getCurrentTone();
    const f = defaultForm();
    if (payload) {
      const n = payload.name && payload.name !== 'community' ? payload.name : t('favorites.myTone');
      f.name = n;
      f.category = payload.playMode === 'bass' ? 'bass' : 'guitar';
    }
    setEditId(null);
    setForm(f);
    setShowAdd(true);
  };

  const openEdit = (item: FavoriteItem) => {
    setForm({
      name: item.name,
      description: item.description || '',
      cover: item.cover || '',
      category: item.category,
      tags: new Set(item.tags),
      customTag: '',
    });
    setEditId(item.id);
    setShowAdd(true);
  };

  const doAdd = () => {
    const name = form.name.trim();
    if (!name) { setNotice(t('favorites.nameRequired')); return; }
    const tags = [...form.tags, ...form.customTag.split(/[,，]/)]
      .map((s) => s.trim()).filter(Boolean).slice(0, MAX_TAGS);
    if (editId) {
      updateFavorite(editId, {
        name,
        description: form.description.trim() || undefined,
        cover: form.cover || undefined,
        tags,
        category: form.category,
      });
      setNotice(t('favorites.updated'));
    } else {
      const payload = getCurrentTone();
      if (!payload) { setNotice(t('favorites.noTone')); return; }
      addFavorite({
        name,
        description: form.description.trim() || undefined,
        cover: form.cover || undefined,
        tags,
        category: form.category,
        data: payload,
        source: 'local',
      });
      setNotice(t('favorites.added'));
    }
    setShowAdd(false);
    setEditId(null);
    setForm(defaultForm());
    refreshItems();
  };

  const toggleTag = (tag: string) => {
    setForm((prev) => {
      const tags = new Set(prev.tags);
      if (tags.has(tag)) tags.delete(tag);
      else if (tags.size < MAX_TAGS) tags.add(tag);
      return { ...prev, tags };
    });
  };

  // ── 操作 ──
  const doDelete = (id: string) => {
    removeFavorite(id);
    refreshItems();
    setNotice(t('favorites.deleted'));
  };

  const doApply = (item: FavoriteItem) => {
    if (!connectedDeviceId) { setNotice(t('toast.connectBtFirst')); return; }
    onApply(item.data);
  };

  const doSaveToPreset = () => {
    if (!slotModal) return;
    if (slotModal.slot < 1 || slotModal.slot > 16) { setNotice(t('favorites.pickSlot')); return; }
    const name = slotModal.name.trim() || slotModal.item.name;
    onSaveToPreset(slotModal.item.data, slotModal.slot, name);
    setNotice(t('favorites.savedToPreset', { slot: slotModal.slot }));
    setSlotModal(null);
  };

  const onPickCover = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const dataUrl = await fileToDataUrl(f);
    if (dataUrl) {
      setForm((prev) => ({ ...prev, cover: dataUrl }));
      setNotice('');
    } else {
      setNotice(t('favorites.coverFail'));
    }
  };

  if (!visible) return null;

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '9px 11px', borderRadius: 7, boxSizing: 'border-box',
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.14)',
    color: '#fff', fontSize: 12, outline: 'none', marginBottom: 8,
    fontFamily: '"Barlow-Regular_2",sans-serif',
  };

  const addModal = (
    <div style={{ position: 'absolute', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 340, maxHeight: '92%', overflowY: 'auto', background: '#232428', borderRadius: 14, border: '1px solid #3f4045', padding: 18, boxShadow: '0 20px 60px rgba(0,0,0,0.6)' }} className="no-scrollbar">
        <div style={{ fontSize: 11, fontWeight: 700, color: GOLD, marginBottom: 12, textAlign: 'center', letterSpacing: '0.1em', fontFamily: '"Barlow-Regular_2",sans-serif' }}>
          {editId ? t('favorites.edit') : t('favorites.addFromDevice')}
        </div>
        <input placeholder={t('favorites.name')} value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} style={inputStyle} maxLength={24} />
        <input placeholder={t('favorites.description')} value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} style={inputStyle} maxLength={60} />

        {/* 封面 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          {form.cover ? (
            <img src={form.cover} alt="" style={{ width: 52, height: 52, borderRadius: 8, objectFit: 'cover', border: `1px solid ${GOLD}55` }} />
          ) : (
            <div style={{ width: 52, height: 52, borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px dashed rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.35)', fontFamily: '"Barlow-Regular_2",sans-serif' }}>{t('favorites.cover')}</span>
            </div>
          )}
          <input ref={coverInputRef} type="file" accept="image/*" onChange={onPickCover} style={{ display: 'none' }} />
          <button onClick={() => coverInputRef.current?.click()} style={{ height: 32, padding: '0 14px', borderRadius: 6, background: `${GOLD}14`, border: `1px solid ${GOLD}55`, color: GOLD, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: '"Barlow-Regular_2",sans-serif' }}>
            {t('favorites.chooseImage')}
          </button>
        </div>

        {/* 类别 */}
        <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.45)', fontFamily: '"Barlow-Regular_2",sans-serif', marginBottom: 5, letterSpacing: '0.08em' }}>{t('favorites.category')}</div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          {(['guitar', 'bass'] as const).map((c) => (
            <button key={c} onClick={() => setForm((p) => ({ ...p, category: c }))}
              style={{ flex: 1, height: 32, borderRadius: 6, border: `1px solid ${form.category === c ? GOLD : 'rgba(255,255,255,0.15)'}`, background: form.category === c ? `${GOLD}18` : 'transparent', color: form.category === c ? GOLD : 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: '"Barlow-Regular_2",sans-serif', letterSpacing: '0.08em' }}>
              {c.toUpperCase()}
            </button>
          ))}
        </div>

        {/* 标签库 */}
        <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.45)', fontFamily: '"Barlow-Regular_2",sans-serif', marginBottom: 5, letterSpacing: '0.08em' }}>{t('favorites.tags')} <span style={{ color: 'rgba(255,255,255,0.3)' }}>({form.tags.size}/{MAX_TAGS})</span></div>
        {TAG_LIBRARY.map((group, gi) => {
          const expanded = expandedGroups.has(gi);
          const visibleTags = expanded ? group.tags : group.tags.slice(0, PARTIAL_COUNT);
          return (
            <div key={group.key} style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 10.5, color: 'rgba(240,180,41,0.6)', fontFamily: '"Barlow-Regular_2",sans-serif', letterSpacing: '0.1em' }}>{t(group.key)}</span>
                {group.tags.length > PARTIAL_COUNT && (
                  <button onClick={() => setExpandedGroups((prev) => { const s = new Set(prev); if (s.has(gi)) s.delete(gi); else s.add(gi); return s; })}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(76,201,240,0.7)', fontSize: 10.5, fontFamily: '"Barlow-Regular_2",sans-serif', padding: 0 }}>
                    {expanded ? t('favorites.collapse') : t('favorites.expandAll')}
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {visibleTags.map((tag) => {
                  const on = form.tags.has(tag);
                  return (
                    <button key={tag} onClick={() => toggleTag(tag)}
                      style={{ height: 28, padding: '0 9px', borderRadius: 999, cursor: 'pointer', border: `1px solid ${on ? GOLD : 'rgba(255,255,255,0.16)'}`, background: on ? `${GOLD}20` : 'transparent', color: on ? GOLD : 'rgba(255,255,255,0.55)', fontSize: 10.5, fontFamily: '"Barlow-Regular_2",sans-serif' }}>
                      {tag}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
        <input placeholder={t('favorites.customTag')} value={form.customTag} onChange={(e) => setForm((p) => ({ ...p, customTag: e.target.value }))} style={inputStyle} maxLength={60} />

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => { setShowAdd(false); setEditId(null); }} style={{ flex: 1, height: 36, borderRadius: 8, border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', color: 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: '"Barlow-Regular_2",sans-serif' }}>{t('btn.cancel')}</button>
          <button onClick={doAdd}
            style={{ flex: 1, height: 36, borderRadius: 8, border: 'none', cursor: 'pointer', background: `${GOLD}1e`, color: GOLD, fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', fontFamily: '"Barlow-Regular_2",sans-serif' }}>
            {t('favorites.save')}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div style={embedded
      ? { flex: 1, minHeight: 0, position: 'relative', display: 'flex', flexDirection: 'column' }
      : { position: 'fixed', inset: '0 0 64px 0', background: '#1a1b1f', zIndex: 51, display: 'flex', flexDirection: 'column' }}>
      {!embedded && (
        <>
          {/* Header */}
          <PanelHeader title={t('favorites.title')} accent={GOLD} onClose={onClose} />
        </>
      )}

      {/* 工具行 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, padding: '8px 10px', borderBottom: '1px solid #2b2c30', flexShrink: 0 }}>
        <button onClick={openAddForm}
          style={{ height: 32, padding: '0 14px', borderRadius: 6, cursor: 'pointer', background: showAdd ? `${GOLD}2a` : `${GOLD}14`, border: `1px solid ${GOLD}55`, color: showAdd ? GOLD : 'rgba(255,180,40,0.85)', fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', fontFamily: '"Barlow-Regular_2",sans-serif' }}>
          {t('favorites.addFromDevice')}
        </button>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontFamily: '"Barlow-Regular_2",sans-serif', letterSpacing: '0.06em' }}>
          {t('common.count', { n: filtered.length })}
        </span>
      </div>

      {/* 搜索 + 来源筛选 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '8px 10px', borderBottom: '1px solid #2b2c30', flexShrink: 0 }}>
        <input
          placeholder={t('community.search')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ ...inputStyle, marginBottom: 0 }}
        />
        <div style={{ display: 'flex', gap: 6 }}>
          {(['all', 'community', 'local'] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              style={{ height: 28, padding: '0 12px', borderRadius: 999, cursor: 'pointer', border: `1px solid ${filter === f ? GOLD : 'rgba(255,255,255,0.15)'}`, background: filter === f ? `${GOLD}22` : 'transparent', color: filter === f ? GOLD : 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: 700, fontFamily: '"Barlow-Regular_2",sans-serif', letterSpacing: '0.06em' }}>
              {f === 'all' ? t('favorites.all') : f === 'community' ? t('favorites.communitySource') : t('favorites.localSource')}
            </button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 10 }} className="no-scrollbar">
        {/* ── 收藏: 大图卡片网格 (E1) ── */}
        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: 30, color: 'rgba(255,255,255,0.3)', fontSize: 11, fontFamily: '"Barlow-Regular_2",sans-serif' }}>{t('favorites.empty')}</div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(146px, 1fr))', gap: 8 }}>
          {filtered.map((item) => {
            const src = getCoverSrc(item);
            const isGroup = item.kind === 'group';
            const isCommunity = item.source === 'community';
            const artFrom = isCommunity ? '#103a4c' : '#42330c';
            const artTo = isCommunity ? '#17607c' : '#6e5313';
            const catLabel = item.category === 'bass' ? t('menu.bass') : t('menu.guitar');
            const menuActions: OverflowAction[] = [];
            if (item.presets?.length) {
              menuActions.push({ key: 'grp', label: t('presetTones.replaceGroup'), color: '#b57bff', onClick: () => setGroupPick({ tones: item.presets!, group: '' }) });
            } else {
              menuActions.push({ key: 'slot', label: t('favorites.saveToPreset'), color: GOLD, onClick: () => setSlotModal({ item, slot: 0, name: item.name }) });
            }
            menuActions.push({ key: 'edit', label: t('favorites.edit'), onClick: () => openEdit(item) });
            menuActions.push({ key: 'del', label: t('favorites.delete'), danger: true, confirmLabel: t('btn.confirmDelete'), onClick: () => doDelete(item.id) });

            return (
              <div key={item.id} style={{ borderRadius: 12, border: '1px solid rgba(255,255,255,0.09)', background: 'rgba(255,255,255,0.03)', overflow: 'hidden' }}>
                {/* 大图封面: 点封面即试听 */}
                <div style={{ position: 'relative' }}>
                  <button onClick={() => doApply(item)} style={{ position: 'relative', display: 'block', width: '100%', aspectRatio: '1/1', padding: 0, border: 'none', cursor: 'pointer', background: `linear-gradient(135deg, ${artFrom}, ${artTo})`, fontFamily: '"Barlow-Regular_2",sans-serif' }}>
                    {src ? (
                      <img src={src} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 21, fontWeight: 800, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.18em' }}>{catLabel}</span>
                    )}
                    <span style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 34, height: 34, borderRadius: '50%', background: 'rgba(0,0,0,0.42)', border: '1px solid rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 11, paddingLeft: 2, boxShadow: '0 4px 14px rgba(0,0,0,0.35)' }}>▶</span>
                    {isGroup && (
                      <span style={{ position: 'absolute', top: 6, left: 6, padding: '1px 6px', borderRadius: 4, background: 'rgba(181,123,255,0.92)', color: '#fff', fontSize: 10.5, fontWeight: 800, letterSpacing: '0.06em', fontFamily: '"Barlow-Regular_2",sans-serif' }}>{t('community.kindGroup')}</span>
                    )}
                    <span style={{ position: 'absolute', bottom: 6, left: 6, padding: '1px 6px', borderRadius: 4, background: 'rgba(0,0,0,0.55)', color: isCommunity ? '#8fd8f5' : '#f5d08a', fontSize: 10.5, fontWeight: 800, letterSpacing: '0.08em', fontFamily: '"Barlow-Regular_2",sans-serif' }}>
                      {isCommunity ? t('favorites.communitySource') : t('favorites.localSource')}
                    </span>
                  </button>
                  {/* 次要操作: ⋯ 菜单 */}
                  <div style={{ position: 'absolute', top: 4, right: 4 }}>
                    <OverflowMenu actions={menuActions} />
                  </div>
                </div>

                {/* 文本 */}
                <div style={{ padding: '6px 8px 0' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.9)', fontFamily: '"Barlow-Regular_2",sans-serif', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</div>
                  {item.description ? (
                    <div style={{ marginTop: 2, fontSize: 10.5, color: 'rgba(255,255,255,0.4)', fontFamily: '"Barlow-Regular_2",sans-serif', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.description}</div>
                  ) : item.tags.length ? (
                    <div style={{ marginTop: 2, display: 'flex', gap: 3, overflow: 'hidden' }}>
                      {item.tags.slice(0, 2).map((tag) => (
                        <span key={tag} style={{ padding: '0 4px', borderRadius: 3, background: 'rgba(255,255,255,0.06)', fontSize: 10.5, color: 'rgba(255,255,255,0.5)', fontFamily: '"Barlow-Regular_2",sans-serif', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 64 }}>{tag}</span>
                      ))}
                    </div>
                  ) : null}
                </div>

                {/* 单主按钮 */}
                <div style={{ padding: 6 }}>
                  <button onClick={() => doApply(item)} style={{ width: '100%', height: 26, borderRadius: 7, cursor: 'pointer', background: `${ACCENT}1f`, border: `1px solid ${ACCENT}55`, color: ACCENT, fontSize: 10.5, fontWeight: 800, letterSpacing: '0.12em', fontFamily: '"Barlow-Regular_2",sans-serif', textTransform: 'uppercase' }}>
                    {t('favorites.apply')}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── 添加/编辑 弹层 ── */}
      {showAdd && addModal}

      {/* ── 存预设弹层 ── */}
      {slotModal && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ width: '100%', maxWidth: 320, background: '#232428', borderRadius: 14, border: '1px solid #3f4045', padding: 18, boxShadow: '0 20px 60px rgba(0,0,0,0.6)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: GOLD, marginBottom: 10, textAlign: 'center', letterSpacing: '0.1em', fontFamily: '"Barlow-Regular_2",sans-serif' }}>{t('favorites.pickSlot')}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
              {SLOT_GROUPS.map((g) => g.slots.map((slot) => {
                const on = slotModal.slot === slot;
                return (
                  <button key={slot} onClick={() => setSlotModal((p) => p ? { ...p, slot } : p)}
                    style={{ width: '22%', aspectRatio: '1.7', borderRadius: 8, cursor: 'pointer', border: `1px solid ${on ? g.color : 'rgba(255,255,255,0.15)'}`, background: on ? `${g.color}22` : 'rgba(255,255,255,0.03)', color: on ? g.color : 'rgba(255,255,255,0.55)', fontSize: 11, fontWeight: 700, fontFamily: '"Barlow-Regular_2",sans-serif' }}>
                    {g.label}{slot}
                  </button>
                );
              }))}
            </div>
            <input placeholder={t('favorites.slotName')} value={slotModal.name} onChange={(e) => setSlotModal((p) => p ? { ...p, name: e.target.value } : p)} style={{ ...inputStyle, marginBottom: 10, background: 'rgba(255,255,255,0.05)', textAlign: 'center' }} maxLength={24} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setSlotModal(null)} style={{ flex: 1, height: 36, borderRadius: 8, border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', color: 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: '"Barlow-Regular_2",sans-serif' }}>{t('btn.cancel')}</button>
              <button onClick={doSaveToPreset} style={{ flex: 1, height: 36, borderRadius: 8, border: 'none', cursor: 'pointer', background: `${GOLD}1e`, color: GOLD, fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', fontFamily: '"Barlow-Regular_2",sans-serif' }}>{t('favorites.save')}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── 预设组: 整组替换 弹层 ── */}
      {groupPick && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ width: '100%', maxWidth: 320, background: '#232428', borderRadius: 14, border: '1px solid #3f4045', padding: 18, boxShadow: '0 20px 60px rgba(0,0,0,0.6)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#b57bff', marginBottom: 10, textAlign: 'center', letterSpacing: '0.1em', fontFamily: '"Barlow-Regular_2",sans-serif' }}>{t('presetTones.pickGroup')}</div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
              {SLOT_GROUPS.map((g) => {
                const on = groupPick.group === g.label;
                return (
                  <button key={g.label} onClick={() => setGroupPick((p) => p ? { ...p, group: g.label } : p)}
                    style={{ flex: 1, aspectRatio: '1.6', borderRadius: 8, cursor: 'pointer', border: `1px solid ${on ? g.color : 'rgba(255,255,255,0.15)'}`, background: on ? `${g.color}22` : 'rgba(255,255,255,0.03)', color: on ? g.color : 'rgba(255,255,255,0.55)', fontSize: 12, fontWeight: 800, fontFamily: '"Barlow-Regular_2",sans-serif' }}>
                    {g.label}
                  </button>
                );
              })}
            </div>
            <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.4)', fontFamily: '"Barlow-Regular_2",sans-serif', textAlign: 'center', marginBottom: 12, letterSpacing: '0.06em' }}>
              {groupPick.group ? `${groupPick.group}1-${groupPick.group}4` : ''}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setGroupPick(null)} style={{ flex: 1, height: 36, borderRadius: 8, border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', color: 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: '"Barlow-Regular_2",sans-serif' }}>{t('btn.cancel')}</button>
              <button onClick={() => { if (!groupPick.group) return; onReplaceGroupTones?.(groupPick.tones, groupPick.group); setGroupPick(null); }}
                disabled={!groupPick.group}
                style={{ flex: 1, height: 36, borderRadius: 8, border: 'none', cursor: groupPick.group ? 'pointer' : 'default', background: groupPick.group ? 'rgba(181,123,255,0.22)' : 'rgba(255,255,255,0.06)', color: groupPick.group ? '#b57bff' : 'rgba(255,255,255,0.3)', fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', fontFamily: '"Barlow-Regular_2",sans-serif' }}>
                {t('favorites.save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
