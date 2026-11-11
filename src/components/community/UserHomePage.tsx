/**
 * TA 的主页（v3.66）
 *
 * 用户拍板 J：要有这个页面 —— 关注列表点人必须有落脚点，否则只能看名字。
 * 用户拍板 I：**私信不做，按键先隐藏** → 这里只留「关注 / 已关注」，不摆灰按钮占位。
 */
import React from 'react';
import { C, Avatar, Badge, IconBack } from './parts';
import ToneCard from './ToneCard';
import type { CommunityTone } from '../../services/toneCommunity';

export default function UserHomePage({
  uid, name, avatarUrl, bio, tones, loading, following, followsMe,
  officialName, onBack, onFollow, onOpenTone, onTrialTone, isMe,
  lang = 'zh', error, onRetry,
}: {
  uid: string;
  name: string;
  avatarUrl?: string;
  bio?: string;
  tones: CommunityTone[];
  loading?: boolean;
  following: boolean;
  followsMe: boolean;
  officialName: string;
  onBack: () => void;
  onFollow: () => void;
  onOpenTone: (tone: CommunityTone) => void;
  onTrialTone: (tone: CommunityTone) => void;
  isMe?: boolean;
  /** ★ v3.80（P1-14）：补齐语言，原来这个页面全中文 */
  lang?: string;
  /** ★ v3.80（P1-14）：加载失败态（原来只有 加载中/空 两种） */
  error?: string | null;
  onRetry?: () => void;
}) {
  const zh = lang !== 'en';
  const friend = following && followsMe;
  return (
    <div style={{ position: 'absolute', inset: 0, background: C.bg, display: 'flex', flexDirection: 'column', zIndex: 6 }}>
      <div style={{ height: 52, display: 'flex', alignItems: 'center', gap: 4, padding: '0 8px', flexShrink: 0 }}>
        <button onClick={onBack} style={{ width: 42, height: 42, borderRadius: 12, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <IconBack />
        </button>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: C.text2, fontFamily: C.font }}>{zh ? 'TA 的主页' : "User's Profile"}</span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 14px 20px' }} className="no-scrollbar">
        {/* 资料 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 13, marginBottom: 14 }}>
          <Avatar url={avatarUrl} name={name} size={64} radius={20} ring={C.brandLine} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <span style={{ fontSize: 16, fontWeight: 800, color: C.text, fontFamily: C.font, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
              {friend && <Badge text={zh ? '好友' : 'Friend'} tone="friend" />}
            </div>
            <div style={{ fontSize: 11, color: C.text3, fontFamily: C.font, lineHeight: 1.6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {bio || (zh ? '这个人还没写签名' : 'No bio yet')}
            </div>
          </div>
        </div>

        {/* 三个数（粉丝数不展示虚数，改用「关系」更实在） */}
        <div style={{ display: 'flex', borderRadius: 13, background: C.surface, border: `1px solid ${C.line}`, padding: '12px 0', marginBottom: 14 }}>
          <div style={{ flex: 1, textAlign: 'center', borderRight: `1px solid ${C.line}` }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: C.text, fontFamily: C.font }}>{tones.length}</div>
            <div style={{ fontSize: 11, color: C.text3, fontFamily: C.font, marginTop: 2 }}>{zh ? '音色' : 'Tones'}</div>
          </div>
          <div style={{ flex: 1, textAlign: 'center', borderRight: `1px solid ${C.line}` }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: followsMe ? C.green : C.text, fontFamily: C.font }}>{followsMe ? (zh ? '已关注你' : 'Follows you') : '—'}</div>
            <div style={{ fontSize: 11, color: C.text3, fontFamily: C.font, marginTop: 2 }}>{zh ? '关系' : 'Relation'}</div>
          </div>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: friend ? C.green : C.text, fontFamily: C.font }}>{friend ? (zh ? '互关' : 'Mutual') : (zh ? '单向' : 'One-way')}</div>
            <div style={{ fontSize: 11, color: C.text3, fontFamily: C.font, marginTop: 2 }}>{zh ? '状态' : 'Status'}</div>
          </div>
        </div>

        {/* 关注键（私信键按用户拍板隐藏） */}
        {!isMe && (
          <button onClick={onFollow} style={{
            width: '100%', height: 44, borderRadius: 12, cursor: 'pointer', marginBottom: 16,
            background: following ? C.surface : C.brand,
            border: `1px solid ${following ? C.line2 : C.brand}`,
            color: following ? C.text2 : '#3b281c', fontSize: 12.5, fontWeight: 800, fontFamily: C.font,
          }}>{following ? (zh ? '已关注（再点取消）' : 'Following (tap to unfollow)') : (zh ? '+ 关注 TA' : '+ Follow')}</button>
        )}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <span style={{ fontSize: 11.5, fontWeight: 800, color: C.text2, fontFamily: C.font, letterSpacing: '0.06em' }}>{zh ? 'TA 的音色' : "Tones"}</span>
          <span style={{ fontSize: 11, color: C.text3, fontFamily: C.font }}>{tones.length}{zh ? ' 个' : ''}</span>
        </div>

        {loading && <div style={{ textAlign: 'center', padding: 26, color: C.text3, fontSize: 11, fontFamily: C.font }}>{zh ? '加载中…' : 'Loading…'}</div>}
        {/* ★ v3.80（P1-14）：失败态 —— 原来失败会被当成「TA 还没有发布音色」，用户以为对方空号 */}
        {!loading && error && (
          <div style={{ textAlign: 'center', padding: '26px 16px', borderRadius: 13, background: C.surface, border: `1px solid ${C.line}` }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: C.text2, fontFamily: C.font }}>
              {zh ? '加载失败' : 'Failed to load'}
            </div>
            <div style={{ fontSize: 11, color: C.text3, fontFamily: C.font, marginTop: 5, lineHeight: 1.6, wordBreak: 'break-all' }}>
              {error}
            </div>
            {onRetry && (
              <button onClick={onRetry} style={{
                marginTop: 12, minWidth: 92, height: 42, padding: '0 18px', borderRadius: 21,
                background: C.brand, border: 'none', color: '#3b281c',
                fontSize: 12, fontWeight: 800, fontFamily: C.font, cursor: 'pointer',
              }}>{zh ? '重试' : 'Retry'}</button>
            )}
          </div>
        )}
        {!loading && !error && tones.length === 0 && (
          <div style={{ textAlign: 'center', padding: 30, color: C.text3, fontSize: 11, fontFamily: C.font }}>{zh ? 'TA 还没有发布音色' : 'No tones published yet'}</div>
        )}
        {tones.map((tn) => (
          <ToneCard
            key={tn._id}
            tone={{ ...tn, author: name, uid }}
            officialName={officialName}
            onOpen={() => onOpenTone(tn)}
            onTrial={() => onTrialTone(tn)}
          />
        ))}
      </div>
    </div>
  );
}
