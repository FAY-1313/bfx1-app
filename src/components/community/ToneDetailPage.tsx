/**
 * 音色详情（v3.66）
 *
 * 用户拍板 C：**收藏只在这里**（底部动作条），卡片上没有 ♥。
 * 用户拍板 B：卡片整块进这里，所以详情是「了解这个人 + 决定要不要」的落脚点：
 *  封面 → 名称 → 作者（可点进主页）→ 风格与标签 → 简介 → 三个数 → 底部三键。
 * 不做「组内 4 音色」列表（用户已取消整组分享）。
 */
import React from 'react';
import { C, Avatar, Badge, CountChip, IconBack, IconPlay, IconHeart } from './parts';
import type { CommunityTone } from '../../services/toneCommunity';
import { guessStyle } from '../../data/toneStyles';

/** 从寄存器快照里猜箱头型号名（subModels 的第一个非空值），失败回退声部 */
function ampName(tone: CommunityTone): string {
  const sm = tone.data?.subModels || {};
  for (const v of Object.values(sm)) if (typeof v === 'string' && v.trim()) return v;
  return tone.category === 'bass' ? 'BASS' : 'GUITAR';
}

export default function ToneDetailPage({
  tone, coverUrl, authorName, isFav, following, connected, officialName, canFollow = true,
  canDelete = false,
  onBack, onTrial, onToggleFav, onStore, onOpenUser, onFollow, onDelete,
  lang = 'zh',
}: {
  tone: CommunityTone;
  coverUrl?: string;
  /** 云端最新昵称（改名后旧作品跟着变） */
  authorName?: string;
  isFav: boolean;
  following: boolean;
  connected: boolean;
  officialName: string;
  /** ★ v3.75（C6）：官方 / 作者是我 / 无 uid → false，整颗关注键不渲染。
      官方音色的 uid 是固定字符串 `official`，关注它只会写进查不到资料的幽灵记录。 */
  canFollow?: boolean;
  /** ★★ v3.76（E5）：作者本人 = true → 顶栏出现删除键（官方 / 他人作品永不出现） */
  canDelete?: boolean;
  onBack: () => void;
  onTrial: () => void;
  onToggleFav: () => void;
  onStore: () => void;
  onOpenUser: () => void;
  onFollow: () => void;
  /** 删除（调用方负责弹二次确认，本组件只发意图） */
  onDelete?: () => void;
  /** ★ v3.80（P1-14）：补齐语言，原来这个页面全中文 */
  lang?: string;
}) {
  const zh = lang !== 'en';
  const style = tone.style || guessStyle(tone.tags, tone.category);
  const official = tone.official === true;
  const cover = coverUrl || tone.coverUrl;
  const trial = tone.trialCount ?? tone.downloads ?? 0;

  return (
    <div style={{ position: 'absolute', inset: 0, background: C.bg, display: 'flex', flexDirection: 'column', zIndex: 6 }}>
      {/* 顶栏 */}
      <div style={{ height: 52, display: 'flex', alignItems: 'center', gap: 4, padding: '0 8px', flexShrink: 0 }}>
        <button onClick={onBack} style={{ width: 42, height: 42, borderRadius: 12, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <IconBack />
        </button>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: C.text2, fontFamily: C.font }}>{zh ? '音色详情' : 'Tone details'}</span>
        {/* ★★ v3.76（E5）：作者本人可见删除入口 —— 之前只能去「我发布的」列表里点，
            进了详情反而没有出口，用户以为删不掉。 */}
        {canDelete && onDelete && (
          <button onClick={onDelete} style={{
            marginLeft: 'auto', height: 32, padding: '0 12px', borderRadius: 9, cursor: 'pointer',
            background: 'transparent', border: '1px solid rgba(242,86,91,0.42)',
            color: '#F2565B', fontSize: 11, fontWeight: 750, fontFamily: C.font,
          }}>{zh ? '删除' : 'Delete'}</button>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 96 }} className="no-scrollbar">
        {/* 封面 */}
        <div style={{ margin: '0 14px', height: 178, borderRadius: 18, overflow: 'hidden', position: 'relative', border: `1px solid ${C.line}` }}>
          {cover ? (
            <img src={cover} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          ) : (
            <div style={{
              width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: `linear-gradient(150deg, hsl(${(tone.name.length * 47) % 360} 44% 32%), hsl(${(tone.name.length * 47) % 360} 38% 14%))`,
            }}>
              <span style={{ fontSize: 40, fontWeight: 800, color: 'rgba(255,255,255,0.28)', fontFamily: C.font }}>{tone.name.slice(0, 1)}</span>
            </div>
          )}
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 45%, rgba(11,13,17,0.86))' }} />
          <div style={{ position: 'absolute', left: 14, right: 14, bottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
              <span style={{ fontSize: 18, fontWeight: 800, color: '#fff', fontFamily: C.font, letterSpacing: '0.01em' }}>{tone.name}</span>
              {official && <Badge text={officialName} />}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              {style && (
                <span style={{ padding: '2px 8px', borderRadius: 6, background: C.brand, color: '#3b281c', fontSize: 11, fontWeight: 800, fontFamily: C.font }}>{style}</span>
              )}
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', fontFamily: C.font }}>{ampName(tone)}</span>
            </div>
          </div>
        </div>

        {/* 作者行 */}
        <div style={{ margin: '14px 14px 0', display: 'flex', alignItems: 'center', gap: 10, padding: 10, borderRadius: 13, background: C.surface, border: `1px solid ${C.line}` }}>
          <button onClick={onOpenUser} style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left' }}>
            <Avatar name={authorName || tone.author} size={40} radius={12} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ fontSize: 12.5, fontWeight: 750, color: C.text, fontFamily: C.font, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {official ? officialName : (authorName || tone.author)}
                </span>
                {official && <Badge text={zh ? '官方' : 'Official'} />}
              </div>
              <div style={{ fontSize: 11, color: C.text3, fontFamily: C.font, marginTop: 2 }}>
                {official ? (zh ? '官方运营账号' : 'Official account') : (zh ? '创作者 · 点击看 TA 的全部音色' : 'Creator · tap to see all their tones')}
              </div>
            </div>
          </button>
          {!official && canFollow && (
            <button onClick={onFollow} style={{
              height: 32, padding: '0 14px', borderRadius: 9, cursor: 'pointer', flexShrink: 0,
              background: following ? 'transparent' : C.brandSoft,
              border: `1px solid ${following ? C.line2 : C.brandLine}`,
              color: following ? C.text3 : C.brand, fontSize: 11, fontWeight: 750, fontFamily: C.font,
            }}>{following ? (zh ? '已关注' : 'Following') : (zh ? '+ 关注' : '+ Follow')}</button>
          )}
        </div>

        {/* 风格与标签 */}
        <div style={{ margin: '14px 14px 0', padding: 12, borderRadius: 13, background: C.surface, border: `1px solid ${C.line}` }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: C.text3, fontFamily: C.font, letterSpacing: '0.1em', marginBottom: 9 }}>{zh ? '风格与标签' : 'Style & tags'}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {style
              ? <span style={{ height: 24, padding: '0 10px', borderRadius: 7, background: C.brand, color: '#3b281c', fontSize: 11, fontWeight: 800, fontFamily: C.font, display: 'inline-flex', alignItems: 'center' }}>{style}</span>
              : <span style={{ fontSize: 11, color: C.text3, fontFamily: C.font }}>{zh ? '未标注风格' : 'No style set'}</span>}
            {(tone.tags || []).map((tg) => (
              <span key={tg} style={{
                height: 24, padding: '0 9px', borderRadius: 999, border: `1px solid ${C.line2}`,
                color: C.text2, fontSize: 11, fontFamily: C.font, display: 'inline-flex', alignItems: 'center',
              }}>#{tg}</span>
            ))}
          </div>
        </div>

        {/* 简介 */}
        {tone.description ? (
          <div style={{ margin: '14px 14px 0', padding: 12, borderRadius: 13, background: C.surface, border: `1px solid ${C.line}` }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: C.text3, fontFamily: C.font, letterSpacing: '0.1em', marginBottom: 8 }}>{zh ? '作者描述' : 'Description'}</div>
            <div style={{ fontSize: 11.5, color: C.text2, fontFamily: C.font, lineHeight: 1.85 }}>{tone.description}</div>
          </div>
        ) : null}

        {/* 三个数 */}
        <div style={{ margin: '14px 14px 0', display: 'flex', borderRadius: 13, background: C.surface, border: `1px solid ${C.line}`, padding: '12px 0' }}>
          <div style={{ flex: 1, textAlign: 'center', borderRight: `1px solid ${C.line}` }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 3 }}>
              <CountChip kind="play" n={trial} />
            </div>
            <div style={{ fontSize: 11, color: C.text3, fontFamily: C.font }}>{zh ? '试用次数' : 'Trials'}</div>
          </div>
          <div style={{ flex: 1, textAlign: 'center', borderRight: `1px solid ${C.line}` }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 3 }}>
              <CountChip kind="heart" n={tone.favCount} />
            </div>
            <div style={{ fontSize: 11, color: C.text3, fontFamily: C.font }}>{zh ? '收藏' : 'Saves'}</div>
          </div>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: 12, fontWeight: 750, color: C.text, fontFamily: C.font, marginBottom: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', padding: '0 6px' }}>
              {ampName(tone)}
            </div>
            <div style={{ fontSize: 11, color: C.text3, fontFamily: C.font }}>{zh ? '箱头型号' : 'Amp model'}</div>
          </div>
        </div>

        <div style={{ margin: '16px 14px 0', fontSize: 11, color: C.text3, fontFamily: C.font, lineHeight: 1.8, textAlign: 'center' }}>
          {zh ? '试用会把整表参数写进当前频道 · 不保存就不影响已存的音色' : 'Trial writes the full parameter set to the current channel · unsaved changes do not affect stored tones'}
        </div>
      </div>

      {/* 底部动作条：试用 / 收藏 / 存入 */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0, padding: '10px 14px 14px',
        background: 'linear-gradient(180deg, rgba(11,13,17,0), rgba(11,13,17,0.96) 34%)',
        display: 'flex', gap: 8, alignItems: 'center', borderTop: `1px solid ${C.line}`,
      }}>
        <button onClick={onTrial} style={{
          flex: 1, height: 46, borderRadius: 13, border: 'none', cursor: 'pointer',
          background: connected ? C.brand : 'rgba(240,111,33,0.16)',
          color: connected ? '#3b281c' : C.brand, fontSize: 13, fontWeight: 800, fontFamily: C.font,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, letterSpacing: '0.03em',
        }}>
          <IconPlay size={13} color={connected ? '#3b281c' : C.brand} />
          {connected ? (zh ? '试用这个音色' : 'Try this tone') : (zh ? '连上设备再试用' : 'Connect a device first')}
        </button>

        <button onClick={onToggleFav} style={{
          width: 62, height: 46, borderRadius: 13, cursor: 'pointer',
          background: isFav ? C.goldSoft : C.surface,
          border: `1px solid ${isFav ? 'rgba(223,164,60,0.45)' : C.line2}`,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
        }}>
          <IconHeart size={13} color={isFav ? C.gold : C.text2} filled={isFav} />
          <span style={{ fontSize: 11, fontWeight: 750, color: isFav ? C.gold : C.text3, fontFamily: C.font }}>
            {isFav ? (zh ? '已收藏' : 'Saved') : (zh ? '收藏' : 'Save')}
          </span>
        </button>

        <button onClick={onStore} style={{
          width: 62, height: 46, borderRadius: 13, cursor: 'pointer',
          background: C.surface, border: `1px solid ${C.line2}`,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
        }}>
          <span style={{ fontSize: 14, color: C.text2, lineHeight: 1 }}>⤓</span>
          <span style={{ fontSize: 11, fontWeight: 750, color: C.text3, fontFamily: C.font }}>{zh ? '存入' : 'Store'}</span>
        </button>
      </div>
    </div>
  );
}
