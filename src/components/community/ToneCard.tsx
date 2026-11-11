/**
 * 音色卡（v3.66）
 *
 * 用户拍板 B：**整块进详情，右侧播放键直接试用**。
 * 用户拍板 C：卡片上**没有收藏按钮**（收藏只在详情底部），避免滑动时误触。
 * 卡片 meta 行 = `@作者 · [风格] #标签 ▶试用数 ♥收藏数`，计数只用图标不写字。
 */
import React from 'react';
import { C, Avatar, CountChip, Badge, IconPlay } from './parts';
import type { CommunityTone } from '../../services/toneCommunity';
import { guessStyle } from '../../data/toneStyles';

export default function ToneCard({ tone, coverUrl, officialName, authorName, onOpen, onTrial }: {
  tone: CommunityTone;
  coverUrl?: string;
  /** 官方账号显示名（'B&F core' → 'B&F 官方'） */
  officialName: string;
  /** 云端最新昵称（不传则用音色文档里存的作者名）—— 用户改名后旧作品要跟着变 */
  authorName?: string;
  onOpen: () => void;
  onTrial: () => void;
}) {
  const style = tone.style || guessStyle(tone.tags, tone.category);
  const official = tone.official === true;
  const cover = coverUrl || tone.coverUrl;

  return (
    <div
      onClick={onOpen}
      style={{
        display: 'flex', gap: 11, padding: 10, borderRadius: 14, marginBottom: 9,
        background: C.surface, border: `1px solid ${C.line}`, cursor: 'pointer',
        alignItems: 'center',
      }}
    >
      {/* 封面 */}
      <div style={{
        width: 62, height: 62, borderRadius: 11, flexShrink: 0, overflow: 'hidden',
        background: cover ? '#000' : `linear-gradient(145deg, hsl(${(tone.name.length * 47) % 360} 40% 30%), hsl(${(tone.name.length * 47) % 360} 34% 15%))`,
        border: `1px solid ${C.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {cover
          ? <img src={cover} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          : <span style={{ fontSize: 16, fontWeight: 800, color: 'rgba(255,255,255,0.9)', fontFamily: C.font }}>{tone.name.slice(0, 1)}</span>}
      </div>

      {/* 文本区 */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
          <span style={{
            fontSize: 13.5, fontWeight: 750, color: C.text, fontFamily: C.font,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>{tone.name}</span>
          {official && <Badge text={officialName} />}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5, minWidth: 0 }}>
          <span style={{ fontSize: 11, color: C.text3, fontFamily: C.font, flexShrink: 0, maxWidth: 96, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            @{official ? officialName : (authorName || tone.author)}
          </span>
          {style && (
            <span style={{
              flexShrink: 0, padding: '1px 6px', borderRadius: 5, background: C.brandSoft,
              border: `1px solid ${C.brandLine}`, color: C.brand, fontSize: 11, fontWeight: 750, fontFamily: C.font,
            }}>{style}</span>
          )}
          {(tone.tags || []).slice(0, 2).map((tg) => (
            <span key={tg} style={{
              flexShrink: 0, fontSize: 11, color: C.text3, fontFamily: C.font,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 62,
            }}>#{tg}</span>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <CountChip kind="play" n={tone.trialCount ?? tone.downloads} />
          <CountChip kind="heart" n={tone.favCount} />
        </div>
      </div>

      {/* 直接试用（右侧播放键） */}
      <button
        onClick={(e) => { e.stopPropagation(); onTrial(); }}
        title="试用"
        style={{
          width: 42, height: 42, borderRadius: 12, flexShrink: 0, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: C.brandSoft, border: `1px solid ${C.brandLine}`, color: C.brand, padding: 0,
        }}
      >
        <IconPlay size={15} color={C.brand} />
      </button>
    </div>
  );
}
