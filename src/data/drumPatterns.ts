// ─── 鼓机节奏预设库 ────────────────────────────────────────────────
// 每首 16 步 × 8 鼓件 (kick/snare/hihat/clap/tom/openhat/crash/shaker),
// 每步力度 0~3 (1=幽灵 0.3 / 2=常规 0.7 / 3=重 1.0). kit 建议搭配, swing 建议值.
// ── v48 (2026-09-03) 精选 20 首 ─────────────────────────────────────
// 依据业界收敛的「常用节奏型」从原 26 首精选到 20 首:
//   · 删除冷门/非鼓型占位: Basic Rock(并入 Rock)/Ballad/EDM(由 Four-on-the-Floor 承担)/New Jack
//   · 命名规范化(英文术语 + 规范中文): Hip-Hop→Boom Bap、Reggae→One Drop、Brazil→Samba、
//     Reggaeton→Dembow、Latin→Son Clave、Shuffle→Blues Shuffle、Jazz→Jazz Swing、
//     Garage→UK Garage、Halftime→Half-Time(中文半速重拍)
//   · 新增两首「必背」: Four-on-the-Floor(四落地鼓)/Techno(科技舞曲)
//   · 每首绑定「听感最合适」的推荐鼓组(kit), 用户仍可随时切换其它鼓组.

import type { DrumId, DrumKit } from '../utils/audioSynth';

export interface DrumPattern {
  id: string;
  nameEn: string;
  nameZh: string;
  kit: DrumKit;
  swing: number; // 0~30
  steps: Record<DrumId, number[]>;
}

const S = (hits: Array<[number, number]>): number[] => {
  const a = Array(16).fill(0);
  for (const [i, v] of hits) a[i] = v;
  return a;
};

const H16 = (base: number, accentSteps: number[] = []): number[] =>
  Array.from({ length: 16 }, (_, i) => (accentSteps.includes(i) ? 2 : 1));

const NONE = (): number[] => Array(16).fill(0);

export const DRUM_PATTERNS: DrumPattern[] = [
  // ── Rock · 摇滚 (rock kit) ───────────────────────────────────────
  {
    id: 'rock', nameEn: 'Rock', nameZh: '摇滚', kit: 'rock', swing: 0,
    steps: {
      kick: S([[0, 2], [6, 1], [8, 2], [14, 1]]),
      snare: S([[4, 2], [12, 2]]),
      hihat: H16(1),
      clap: S([]),
      tom: S([[8, 1], [10, 1]]),
      openhat: NONE(), crash: S([[0, 1]]), shaker: NONE(),
    },
  },
  {
    id: 'blueshuffle', nameEn: 'Blues Shuffle', nameZh: '蓝调摇摆', kit: 'rock', swing: 22,
    steps: {
      kick: S([[0, 2], [7, 1], [10, 2]]),
      snare: S([[4, 2], [12, 2]]),
      hihat: H16(1),
      clap: S([]),
      tom: NONE(), openhat: NONE(), crash: S([[0, 1]]), shaker: NONE(),
    },
  },
  {
    id: 'disco', nameEn: 'Disco', nameZh: '迪斯科', kit: 'rock', swing: 0,
    steps: {
      kick: S([[0, 3], [4, 3], [8, 3], [12, 3]]),
      snare: S([[4, 2], [12, 2]]),
      hihat: H16(1),
      clap: S([[4, 1], [12, 1]]),
      tom: NONE(),
      openhat: S([[2, 2], [6, 2], [10, 2], [14, 2]]),
      crash: S([[0, 2]]),
      shaker: S([[0, 1], [2, 1], [4, 1], [6, 1], [8, 1], [10, 1], [12, 1], [14, 1]]),
    },
  },
  {
    id: 'onedrop', nameEn: 'One Drop', nameZh: '雷鬼一落', kit: 'rock', swing: 0,
    steps: {
      kick: S([[0, 2], [8, 1]]),
      snare: S([[8, 2]]),
      hihat: S([[2, 2], [6, 2], [10, 2], [14, 2]]),
      clap: S([]),
      tom: NONE(), openhat: NONE(), crash: NONE(), shaker: NONE(),
    },
  },
  {
    id: 'afrobeat', nameEn: 'Afrobeat', nameZh: '非洲节拍', kit: 'rock', swing: 8,
    steps: {
      kick: S([[0, 2], [5, 2], [8, 2], [13, 2]]),
      snare: S([[4, 2], [12, 2]]),
      hihat: H16(1, [2, 6, 10, 14]),
      clap: S([]),
      tom: S([[8, 1], [10, 1]]),
      openhat: NONE(), crash: S([[0, 1]]),
      shaker: S([[0, 1], [1, 2], [2, 1], [3, 2], [4, 1], [5, 2], [6, 1], [7, 2], [8, 1], [9, 2], [10, 1], [11, 2], [12, 1], [13, 2], [14, 1], [15, 2]]),
    },
  },
  {
    id: 'metal', nameEn: 'Metal', nameZh: '金属', kit: 'rock', swing: 0,
    steps: {
      kick: S([[0, 3], [2, 2], [4, 3], [6, 2], [8, 3], [10, 2], [12, 3], [14, 2]]),
      snare: S([[4, 2], [12, 2]]),
      hihat: H16(1),
      clap: S([]),
      tom: S([[9, 1], [11, 1]]), openhat: NONE(), crash: S([[0, 2], [8, 1]]), shaker: NONE(),
    },
  },

  // ── Funk · 放克 (funk kit) ───────────────────────────────────────
  {
    id: 'funk', nameEn: 'Funk', nameZh: '放克', kit: 'funk', swing: 8,
    steps: {
      kick: S([[0, 2], [6, 2], [10, 2], [14, 1]]),
      snare: S([[4, 2], [12, 2]]),
      hihat: S([[0, 1], [1, 1], [2, 2], [3, 1], [4, 1], [5, 1], [6, 2], [7, 1], [8, 1], [9, 1], [10, 2], [11, 1], [12, 1], [13, 1], [14, 2], [15, 1]]),
      clap: S([[4, 1], [12, 1]]),
      tom: S([[8, 1]]),
      openhat: S([[2, 1], [10, 1]]),
      crash: NONE(), shaker: NONE(),
    },
  },
  {
    id: 'samba', nameEn: 'Samba', nameZh: '桑巴', kit: 'funk', swing: 4,
    steps: {
      kick: S([[0, 3], [8, 2], [10, 2], [12, 2]]),
      snare: S([[4, 2]]),
      hihat: H16(1),
      clap: S([]),
      tom: S([[6, 1], [14, 1]]),
      openhat: NONE(), crash: NONE(),
      shaker: S([[0, 1], [1, 1], [2, 1], [3, 2], [4, 1], [5, 1], [6, 1], [7, 2], [8, 1], [9, 1], [10, 1], [11, 2], [12, 1], [13, 1], [14, 1], [15, 2]]),
    },
  },
  {
    id: 'dembow', nameEn: 'Dembow', nameZh: '雷鬼动', kit: 'funk', swing: 0,
    steps: {
      kick: S([[0, 3], [3, 2], [6, 2], [8, 2], [11, 2], [14, 2]]),
      snare: S([[8, 2]]),
      hihat: H16(1),
      clap: S([[8, 1]]),
      tom: NONE(), openhat: NONE(), crash: NONE(),
      shaker: S([[2, 1], [6, 1], [10, 1], [14, 1]]),
    },
  },
  {
    id: 'sonclave', nameEn: 'Son Clave', nameZh: '颂乐节拍', kit: 'funk', swing: 0,
    steps: {
      kick: S([[0, 2], [7, 2], [10, 1]]),
      snare: S([[4, 2], [11, 2]]),
      hihat: H16(1),
      clap: S([[12, 2]]),
      tom: S([[8, 1], [10, 1]]),
      openhat: NONE(), crash: NONE(),
      shaker: S([[2, 1], [6, 1], [10, 1], [14, 1]]),
    },
  },

  // ── Boom Bap (hiphop kit) ────────────────────────────────────────
  {
    id: 'boombap', nameEn: 'Boom Bap', nameZh: '嘻哈经典', kit: 'hiphop', swing: 12,
    steps: {
      kick: S([[0, 3], [9, 1], [11, 2]]),
      snare: S([[4, 2], [12, 2]]),
      hihat: H16(1),
      clap: S([[4, 1], [12, 1]]),
      tom: NONE(), openhat: NONE(), crash: NONE(), shaker: NONE(),
    },
  },

  // ── House 系 (house kit) ─────────────────────────────────────────
  {
    id: 'house', nameEn: 'House', nameZh: '浩室', kit: 'house', swing: 0,
    steps: {
      kick: S([[0, 3], [4, 3], [8, 3], [12, 3]]),
      snare: S([]),
      hihat: H16(1, [0, 4, 8, 12]),
      clap: S([[4, 2], [12, 2]]),
      tom: NONE(),
      openhat: S([[2, 2], [6, 2], [10, 2], [14, 2]]),
      crash: S([[0, 1]]), shaker: NONE(),
    },
  },
  {
    id: 'fourfloor', nameEn: 'Four on the Floor', nameZh: '四落地鼓', kit: 'house', swing: 0,
    steps: {
      kick: S([[0, 3], [4, 3], [8, 3], [12, 3]]),
      snare: S([]),
      hihat: H16(1, [0, 4, 8, 12]),
      clap: S([[4, 2], [12, 2]]),
      tom: NONE(),
      openhat: S([[2, 2], [6, 2], [10, 2], [14, 2]]),
      crash: S([[0, 1]]),
      shaker: S([[2, 1], [6, 1], [10, 1], [14, 1]]),
    },
  },
  {
    id: 'techno', nameEn: 'Techno', nameZh: '科技舞曲', kit: 'house', swing: 0,
    steps: {
      kick: S([[0, 3], [2, 2], [4, 3], [6, 2], [8, 3], [10, 2], [12, 3], [14, 2]]),
      snare: S([]),
      hihat: H16(1, [0, 2, 4, 6, 8, 10, 12, 14]),
      clap: S([]),
      tom: NONE(),
      openhat: S([[1, 2], [3, 2], [5, 2], [7, 2], [9, 2], [11, 2], [13, 2], [15, 2]]),
      crash: S([[0, 1]]), shaker: NONE(),
    },
  },
  {
    id: 'ukgarage', nameEn: 'UK Garage', nameZh: '英伦车库', kit: 'house', swing: 12,
    steps: {
      kick: S([[0, 3], [4, 2], [8, 2], [11, 2]]),
      snare: S([[4, 2], [12, 2]]),
      hihat: H16(1, [0, 4, 8, 12]),
      clap: S([]),
      tom: NONE(),
      openhat: S([[6, 2], [14, 2]]),
      crash: S([[0, 1]]),
      shaker: S([[2, 1], [10, 1]]),
    },
  },
  {
    id: 'twostep', nameEn: 'Two-Step', nameZh: '两步舞曲', kit: 'house', swing: 18,
    steps: {
      kick: S([[0, 3], [7, 2], [8, 2], [10, 2], [14, 1]]),
      snare: S([[4, 2], [12, 2]]),
      hihat: H16(1, [0, 4, 8, 12]),
      clap: S([[4, 1], [12, 1]]),
      tom: NONE(),
      openhat: S([[2, 2], [6, 2], [10, 2], [14, 2]]),
      crash: S([[0, 1]]),
      shaker: NONE(),
    },
  },

  // ── Lo-fi / 爵士慢速 (lofi kit) ──────────────────────────────────
  {
    id: 'jazzswing', nameEn: 'Jazz Swing', nameZh: '爵士摇摆', kit: 'lofi', swing: 24,
    steps: {
      kick: S([[0, 2], [8, 1], [11, 1]]),
      snare: S([[4, 1], [12, 1]]),
      hihat: H16(1, [0, 4, 8, 12]),
      clap: S([]),
      tom: S([[6, 1], [14, 1]]),
      openhat: S([[10, 2]]),
      crash: S([[0, 2]]),
      shaker: S([[0, 1], [2, 1], [4, 1], [6, 1], [8, 1], [10, 1], [12, 1], [14, 1]]),
    },
  },
  {
    id: 'halftime', nameEn: 'Half-Time', nameZh: '半速重拍', kit: 'lofi', swing: 12,
    steps: {
      kick: S([[0, 3], [11, 2]]),
      snare: S([[8, 3]]),
      hihat: H16(1),
      clap: S([[8, 1]]),
      tom: S([[9, 1], [10, 1]]),
      openhat: S([[14, 2]]),
      crash: S([[0, 1]]),
      shaker: S([[2, 1], [10, 1]]),
    },
  },

  // ── Trap / Drill (808 kit) ───────────────────────────────────────
  {
    id: 'trap', nameEn: 'Trap', nameZh: '陷阱说唱', kit: '808', swing: 0,
    steps: {
      kick: S([[0, 3], [7, 1], [11, 2], [12, 1]]),
      snare: S([[8, 2]]),
      hihat: S([[0, 1], [2, 1], [4, 1], [6, 1], [8, 1], [10, 1], [12, 1], [14, 1], [3, 2], [7, 2], [11, 2], [15, 2]]),
      clap: S([[8, 1]]),
      tom: NONE(), openhat: S([[14, 1]]), crash: S([[0, 1]]), shaker: NONE(),
    },
  },
  {
    id: 'drill', nameEn: 'Drill', nameZh: '钻头说唱', kit: '808', swing: 0,
    steps: {
      kick: S([[0, 3], [3, 1], [6, 2], [10, 2], [12, 1]]),
      snare: S([[8, 3]]),
      hihat: H16(1, [3, 7, 11, 15]),
      clap: S([[8, 1]]),
      tom: NONE(), openhat: S([[14, 1]]), crash: S([[0, 1]]), shaker: NONE(),
    },
  },
];
