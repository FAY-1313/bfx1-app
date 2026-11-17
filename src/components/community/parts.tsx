/**
 * 社区 UI 基础件（v3.66 · 2026-10-24）
 *
 * 设计口径（与 `社区与登录UI重构v2.html` 一致）：
 *  - 单品牌橙 #F06F21 是唯一动作色；金色 #DFA43C 只作「官方 / 过千热度」特权色
 *  - 三级文字：#F0F2F5 / #c2c9d6 / #7C8494
 *  - 字号：卡片名 13.5 / 次级 11 / 标签 9.5 / 徽章 8.5 —— 不再出现 7px 那种看不清的字
 *  - 所有可点区域 ≥ 42px 高（列表行 56+），拇指够得到
 */
import React from 'react';
import { SURF, TXT, BRAND, GOLD } from '../../ui2/tokens';

/**
 * ★★ v3.83（7.3 色板双轨合并）：本对象不再自带色值，全部从 `ui2/tokens` 派生。
 * 之前这里和 tokens.ts 各写一份（`#F0F2F5` vs `#F2F4F8`、`#2a2e37` vs `#31343b`），
 * 两边各自演化 → 社区一套色、首页一套色。现在只有 tokens 一处真值。
 */
export const C = {
  bg: SURF.bg,
  surface: SURF.panel,
  surface2: SURF.panel2,
  line: 'rgba(255,255,255,0.07)',
  line2: 'rgba(255,255,255,0.14)',
  brand: BRAND,
  brandSoft: 'rgba(240,111,33,0.14)',
  brandLine: 'rgba(240,111,33,0.42)',
  gold: GOLD,
  goldSoft: 'rgba(223,164,60,0.14)',
  text: TXT.main,
  text2: TXT.sub,
  text3: TXT.weak,
  green: '#5BC88F',
  font: '"Barlow-Regular_2", "PingFang SC", sans-serif',
};

/** 1200 → 1.2k，用于试用/收藏计数 */
export function fmtCount(n?: number): string {
  const v = Number(n || 0);
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
  return String(v);
}

/** 过千才染金（低于一千保持灰），避免「全部金色 = 没有重点」 */
export function isHot(n?: number): boolean {
  return Number(n || 0) >= 1000;
}

/** 由名字稳定取一个色相，占位头像不随机跳色 */
export function hueOf(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return h;
}

// ─── 图标 ──────────────────────────────────────────────────────────

export const IconBack = ({ size = 20, color = C.text2 }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <path d="M15 5l-7 7 7 7" />
  </svg>
);

export const IconPlay = ({ size = 13, color = 'currentColor' }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill={color}>
    <path d="M5 3.2v9.6c0 .5.55.8.98.55l7.2-4.8a.65.65 0 000-1.1l-7.2-4.8A.65.65 0 005 3.2z" />
  </svg>
);

export const IconHeart = ({ size = 13, color = 'currentColor', filled = true }: { size?: number; color?: string; filled?: boolean }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill={filled ? color : 'none'} stroke={color} strokeWidth={filled ? 0 : 1.5}>
    <path d="M8 13.6S1.6 9.9 1.6 5.9A3.4 3.4 0 018 3.8a3.4 3.4 0 016.4 2.1c0 4-6.4 7.7-6.4 7.7z" />
  </svg>
);

export const IconMore = ({ size = 16, color = C.text2 }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill={color}>
    <circle cx="3.2" cy="8" r="1.35" /><circle cx="8" cy="8" r="1.35" /><circle cx="12.8" cy="8" r="1.35" />
  </svg>
);

export const IconPlus = ({ size = 22, color = 'currentColor' }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.1" strokeLinecap="round">
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const IconSearch = ({ size = 16, color = C.text3 }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 18 18" fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round">
    <circle cx="7.6" cy="7.6" r="5" /><path d="M11.4 11.4L15.5 15.5" />
  </svg>
);

export const IconBluetooth = ({ size = 34, color = C.brand }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M7.5 7.5L16 16l-4 3.5V4.5L16 8l-8.5 8.5" />
  </svg>
);

export const IconUsers = ({ size = 18, color = C.text2 }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round">
    <circle cx="7.4" cy="6.8" r="2.6" />
    <path d="M2.6 16c0-2.6 2.2-4.2 4.8-4.2s4.8 1.6 4.8 4.2" />
    <path d="M13.4 5.2a2.4 2.4 0 010 4.6M14.6 11.9c2 .4 3.4 1.9 3.4 4.1" />
  </svg>
);

// ─── 小组件 ────────────────────────────────────────────────────────

/** 头像：有 fileID 时显示图片，否则按名字首字 + 稳定色相 */
export function Avatar({ url, name, size = 44, radius = 14, ring }: { url?: string; name: string; size?: number; radius?: number; ring?: string }) {
  const h = hueOf(name || '?');
  return (
    <div style={{
      width: size, height: size, borderRadius: radius, flexShrink: 0, overflow: 'hidden',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: url ? '#000' : `linear-gradient(145deg, hsl(${h} 46% 38%), hsl(${h} 40% 22%))`,
      border: ring ? `1.5px solid ${ring}` : `1px solid ${C.line}`,
    }}>
      {url
        ? <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        : <span style={{ fontSize: Math.round(size * 0.38), fontWeight: 800, color: 'rgba(255,255,255,0.92)', fontFamily: C.font }}>
          {(name || '?').slice(0, 1).toUpperCase()}
        </span>}
    </div>
  );
}

/** 卡片 meta 行的计数：图标 + 数字，纯图标不写字（用户要求「用图标标识简单点」） */
export function CountChip({ kind, n }: { kind: 'play' | 'heart'; n?: number }) {
  const hot = isHot(n);
  const color = kind === 'heart' && hot ? C.gold : C.text3;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3.5, color, fontFamily: C.font, fontSize: 11, fontWeight: 600 }}>
      {kind === 'play' ? <IconPlay size={11} color={color} /> : <IconHeart size={11} color={color} />}
      <em style={{ fontStyle: 'normal' }}>{fmtCount(n)}</em>
    </span>
  );
}

/** 风格 = 橙底实心（单选、封闭枚举），一眼区分于自定义标签 */
export function StyleChip({ label, active, onClick }: { label: string; active?: boolean; onClick?: () => void }) {
  return (
    <button onClick={onClick} style={{
      height: 26, padding: '0 11px', borderRadius: 7, cursor: 'pointer', flexShrink: 0,
      background: active ? C.brand : 'rgba(255,255,255,0.045)',
      border: `1px solid ${active ? C.brand : C.line}`, color: active ? '#3b291c' : C.text2,
      fontSize: 11, fontWeight: 750, fontFamily: C.font,
    }}>{label}</button>
  );
}

/** 自定义标签 = 描边（# 前缀、可多选） */
export function TagChip({ label, active, onClick }: { label: string; active?: boolean; onClick?: () => void }) {
  return (
    <button onClick={onClick} style={{
      height: 26, padding: '0 10px', borderRadius: 999, cursor: 'pointer', flexShrink: 0,
      background: active ? C.brandSoft : 'transparent',
      border: `1px solid ${active ? C.brandLine : C.line2}`, color: active ? C.brand : C.text3,
      fontSize: 11, fontWeight: 650, fontFamily: C.font,
    }}>#{label}</button>
  );
}

export function Badge({ text, tone = 'official' }: { text: string; tone?: 'official' | 'friend' }) {
  const gold = tone === 'official';
  return (
    <span style={{
      flexShrink: 0, padding: '1px 5px', borderRadius: 4, fontSize: 10.5, fontWeight: 800,
      letterSpacing: '0.04em', fontFamily: C.font,
      background: gold ? C.goldSoft : 'rgba(91,200,143,0.14)',
      color: gold ? C.gold : C.green,
      border: `1px solid ${gold ? 'rgba(223,164,60,0.4)' : 'rgba(91,200,143,0.38)'}`,
    }}>{text}</span>
  );
}

export function EmptyState({ title, hint, action, onAction, icon }: {
  title: string; hint?: string; action?: string; onAction?: () => void; icon?: React.ReactNode;
}) {
  return (
    <div style={{ padding: '48px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
      <div style={{
        width: 56, height: 56, borderRadius: '50%', background: C.brandSoft,
        border: `1px solid ${C.brandLine}`, display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 16, color: C.brand,
      }}>{icon || <IconHeart size={22} />}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: C.text, fontFamily: C.font, marginBottom: 8 }}>{title}</div>
      {hint && <div style={{ fontSize: 11, color: C.text3, fontFamily: C.font, lineHeight: 1.7, maxWidth: 256 }}>{hint}</div>}
      {action && (
        <button onClick={onAction} style={{
          marginTop: 20, minHeight: 44, height: 44, padding: '0 24px', borderRadius: 12, cursor: 'pointer',
          background: C.brandSoft, border: `1px solid ${C.brandLine}`, color: C.brand,
          fontSize: 12, fontWeight: 700, fontFamily: C.font, letterSpacing: '0.04em',
        }}>{action}</button>
      )}
    </div>
  );
}

/** 一级页签：下划线，不用分段胶囊（与二级分段区分开） */
export function UnderlineTabs({ tabs, active, onChange }: {
  tabs: Array<{ id: string; label: string; badge?: number }>;
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div style={{ display: 'flex', gap: 2, padding: '0 8px', borderBottom: `1px solid ${C.line}`, flexShrink: 0, background: C.bg }}>
      {tabs.map((tb) => {
        const on = tb.id === active;
        return (
          <button key={tb.id} onClick={() => onChange(tb.id)} style={{
            flex: 1, height: 44, position: 'relative', background: 'transparent', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
            color: on ? C.text : C.text3, fontSize: 12.5, fontWeight: on ? 750 : 600, fontFamily: C.font,
          }}>
            {tb.label}
            {!!tb.badge && tb.badge > 0 && (
              <span style={{
                minWidth: 15, height: 15, padding: '0 4px', borderRadius: 8, background: on ? C.brandSoft : 'rgba(255,255,255,0.07)',
                color: on ? C.brand : C.text3, fontSize: 11, fontWeight: 800, fontFamily: C.font,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              }}>{tb.badge > 99 ? '99+' : tb.badge}</span>
            )}
            {on && <span style={{ position: 'absolute', left: 18, right: 18, bottom: 0, height: 2, borderRadius: 2, background: C.brand }} />}
          </button>
        );
      })}
    </div>
  );
}

/** 二级分段控件：关注 / 好友（形状与一级页签不同，避免两套下划线打架） */
export function Segmented({ items, active, onChange }: {
  items: Array<{ id: string; label: string; count?: number }>;
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div style={{ display: 'flex', gap: 3, padding: 3, borderRadius: 10, background: 'rgba(255,255,255,0.045)', border: `1px solid ${C.line}` }}>
      {items.map((it) => {
        const on = it.id === active;
        return (
          <button key={it.id} onClick={() => onChange(it.id)} style={{
            flex: 1, height: 32, borderRadius: 8, cursor: 'pointer', border: 'none',
            background: on ? C.surface2 : 'transparent',
            color: on ? C.text : C.text3, fontSize: 11, fontWeight: on ? 750 : 600, fontFamily: C.font,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
          }}>
            {it.label}
            {typeof it.count === 'number' && (
              <span style={{ fontSize: 11, color: on ? C.brand : C.text3, fontWeight: 800 }}>{it.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   ★ v4.22（UI 升级 · 方案 C）：统一加载态组件
   设计口径（ui-design-system）：
     · 8pt 网格 / 克制的品牌橙脉冲（不用廉价灰闪）
     · 骨架形状对齐真实内容，避免加载完成时的视觉跳变
     · 尊重 prefers-reduced-motion（关闭动效）
   ═══════════════════════════════════════════════════════════════════ */

/** 单块脉冲骨架。w/h 用数字(px)或 CSS 值；radius 默认 8。 */
export function Skel({ w = '100%', h = 12, radius = 8, style }: {
  w?: number | string; h?: number | string; radius?: number; style?: React.CSSProperties;
}) {
  return (
    <div className="bfx-skel" style={{
      width: w, height: h, borderRadius: radius,
      background: 'rgba(240,111,33,0.10)',
      border: '1px solid rgba(240,111,33,0.06)',
      ...style,
    }} />
  );
}

/** 社区音色列表项的骨架（对齐头像 44 + 标题/副标 + 标签） */
export function SkeletonToneRow() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '12px',
      borderRadius: 13, background: C.surface, border: `1px solid ${C.line}`, marginBottom: 8,
    }}>
      <Skel w={44} h={44} radius={12} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <Skel w="56%" h={13} radius={6} />
        <div style={{ height: 8 }} />
        <Skel w="82%" h={10} radius={5} style={{ background: 'rgba(255,255,255,0.05)', border: 'none' }} />
      </div>
      <Skel w={36} h={20} radius={10} style={{ background: 'rgba(255,255,255,0.05)', border: 'none' }} />
    </div>
  );
}

/** 列表首屏加载：3 行骨架 + 轻量提示 */
export function LoadingList({ label }: { label?: string }) {
  return (
    <div style={{ padding: '4px 14px' }} role="status" aria-live="polite">
      <SkeletonStyle />
      {[0, 1, 2].map((i) => <SkeletonToneRow key={i} />)}
      {label && (
        <div style={{ textAlign: 'center', padding: '8px 0 4px', fontSize: 11, color: C.text3, fontFamily: C.font, letterSpacing: '0.04em' }}>
          {label}
        </div>
      )}
    </div>
  );
}

/** TA 主页加载：头像 + 三统计 + 关注键 + 音色列表骨架 */
export function LoadingProfile() {
  return (
    <div style={{ padding: '14px' }} role="status" aria-live="polite">
      <div style={{ display: 'flex', alignItems: 'center', gap: 13, marginBottom: 14 }}>
        <Skel w={64} h={64} radius={20} />
        <div style={{ flex: 1 }}>
          <Skel w="46%" h={15} radius={6} />
          <div style={{ height: 8 }} />
          <Skel w="74%" h={10} radius={5} style={{ background: 'rgba(255,255,255,0.05)', border: 'none' }} />
        </div>
      </div>
      <div style={{ display: 'flex', borderRadius: 13, background: C.surface, border: `1px solid ${C.line}`, padding: '12px 0', marginBottom: 14 }}>
        {[0, 1, 2].map((i) => (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7 }}>
            <Skel w={30} h={15} radius={6} />
            <Skel w={40} h={9} radius={4} style={{ background: 'rgba(255,255,255,0.05)', border: 'none' }} />
          </div>
        ))}
      </div>
      <Skel w="100%" h={44} radius={12} />
      <div style={{ height: 20 }} />
      <SkeletonToneRow />
      <SkeletonToneRow />
    </div>
  );
}

/** 骨架脉冲动画样式：注入一次，全局生效。 */
export function SkeletonStyle() {
  return (
    <style>{`
      @keyframes bfxSkelPulse { 0%{opacity:.55} 50%{opacity:1} 100%{opacity:.55} }
      .bfx-skel { animation: bfxSkelPulse 1.4s ease-in-out infinite; }
      @media (prefers-reduced-motion: reduce) { .bfx-skel { animation: none; opacity:.75; } }
    `}</style>
  );
}
