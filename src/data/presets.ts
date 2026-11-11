// ─── 甜点预设 (每子型号 3 个) ────────────────────────────────────────────
// values 为物理量 (显示单位), PedalPanel 经 physicalToNorm 转归一化后写寄存器。
// 仅收录子型号实际存在的旋钮; 未收录的旋钮保持当前值。

export interface FxPreset {
  name: string;
  values: Record<string, number>;
}

const PRESETS: Record<string, FxPreset[]> = {
  // ── 压缩器 (吉他) ─────────────────────────────────────────────────
  'mxr-dyna': [
    { name: 'Squish',   values: { SUSTAIN: 35, OUTPUT: 6 } },
    { name: 'Country',  values: { SUSTAIN: 22, OUTPUT: 8 } },
    { name: 'Heavy',    values: { SUSTAIN: 45, OUTPUT: 4 } },
  ],
  'boss-cs2': [
    { name: 'Smooth',   values: { SUSTAIN: 25, LEVEL: 6,  ATTACK: 30 } },
    { name: 'Punchy',   values: { SUSTAIN: 35, LEVEL: 4,  ATTACK: 10 } },
    { name: 'Gentle',   values: { SUSTAIN: 15, LEVEL: 8,  ATTACK: 60 } },
  ],
  'la2a': [
    { name: 'Optical',  values: { 'PEAK REDUCTION': 6, GAIN: 5 } },
    { name: 'Vocal',    values: { 'PEAK REDUCTION': 4, GAIN: 7 } },
    { name: 'Fat',      values: { 'PEAK REDUCTION': 8, GAIN: 3 } },
  ],
  'urei-1176': [
    { name: 'FET 4:1',  values: { INPUT: 8,  OUTPUT: 6, ATTACK: 20,  RELEASE: 200, RATIO: 4 } },
    { name: 'All In',   values: { INPUT: 12, OUTPUT: 4, ATTACK: 10,  RELEASE: 100, RATIO: 8 } },
    { name: 'Slow',     values: { INPUT: 6,  OUTPUT: 8, ATTACK: 50,  RELEASE: 400, RATIO: 4 } },
  ],
  'neve-33609': [
    { name: 'Bus',      values: { THRESHOLD: 12, ATTACK: 20, RECOVERY: 300, RATIO: 2, MAKEUP: 4 } },
    { name: 'Mix',      values: { THRESHOLD: 20, ATTACK: 10, RECOVERY: 200, RATIO: 4, MAKEUP: 6 } },
    { name: 'Master',   values: { THRESHOLD: 30, ATTACK: 30, RECOVERY: 500, RATIO: 2, MAKEUP: 3 } },
  ],
  'distressor': [
    { name: '2:1 Opto', values: { INPUT: 8,  ATTACK: 30, RELEASE: 300, RATIO: 2, OUTPUT: 6 } },
    { name: '6:1 FET',  values: { INPUT: 12, ATTACK: 10, RELEASE: 150, RATIO: 6, OUTPUT: 4 } },
    { name: '8:1 Crush',values: { INPUT: 15, ATTACK: 5,  RELEASE: 100, RATIO: 8, OUTPUT: 3 } },
  ],

  // ── 压缩器 (贝斯) ─────────────────────────────────────────────────
  'dbx-163-b': [
    { name: 'Even',     values: { COMPRESSION: 25, GAIN: 5 } },
    { name: 'Squash',   values: { COMPRESSION: 40, GAIN: 3 } },
    { name: 'Light',    values: { COMPRESSION: 12, GAIN: 7 } },
  ],
  'summit-tla': [
    { name: 'Tube Glue', values: { THRESHOLD: 20, ATTACK: 30, RELEASE: 300, RATIO: 3, GAIN: 5 } },
    { name: 'Gentle',   values: { THRESHOLD: 30, ATTACK: 50, RELEASE: 500, RATIO: 2, GAIN: 4 } },
    { name: 'Tight',    values: { THRESHOLD: 15, ATTACK: 10, RELEASE: 200, RATIO: 6, GAIN: 6 } },
  ],
  'keeley-bass': [
    { name: 'Knee',     values: { THRESHOLD: 25, RATIO: 3, GAIN: 5 } },
    { name: 'Squash',   values: { THRESHOLD: 40, RATIO: 8, GAIN: 3 } },
    { name: 'Open',     values: { THRESHOLD: 15, RATIO: 2, GAIN: 6 } },
  ],
  'manley-vari': [
    { name: 'Vari',     values: { THRESHOLD: 18, ATTACK: 20, RELEASE: 250, RATIO: 3, GAIN: 5 } },
    { name: 'Lift',     values: { THRESHOLD: 30, ATTACK: 40, RELEASE: 400, RATIO: 2, GAIN: 4 } },
    { name: 'Glue',     values: { THRESHOLD: 12, ATTACK: 10, RELEASE: 150, RATIO: 6, GAIN: 6 } },
  ],
  'ebs-multi': [
    { name: 'Sustain',  values: { THRESHOLD: 20, RATIO: 4, GAIN: 5 } },
    { name: 'Lim',      values: { THRESHOLD: 45, RATIO: 8, GAIN: 3 } },
    { name: 'Light',    values: { THRESHOLD: 12, RATIO: 2, GAIN: 6 } },
  ],

  // ── 合唱 ──────────────────────────────────────────────────────────
  'ce-2': [
    { name: 'Slow',     values: { RATE: 0.6, DEPTH: 3, LEVEL: -6 } },
    { name: 'Classic',  values: { RATE: 1.0, DEPTH: 5, LEVEL: -4 } },
    { name: 'Deep',     values: { RATE: 1.6, DEPTH: 8, LEVEL: -2 } },
  ],
  'ce-1': [
    { name: 'Vintage Slow', values: { RATE: 0.5, DEPTH: 4, LEVEL: -6 } },
    { name: 'Vintage', values: { RATE: 1.2, DEPTH: 6, LEVEL: -4 } },
    { name: 'Swirl',    values: { RATE: 1.8, DEPTH: 9, LEVEL: -2 } },
  ],
  'dim-c': [
    { name: 'D1',       values: { RATE: 0.4, WIDTH: 4, DEPTH: 3, LEVEL: -5 } },
    { name: 'D2',       values: { RATE: 0.8, WIDTH: 6, DEPTH: 5, LEVEL: -4 } },
    { name: 'D3',       values: { RATE: 1.2, WIDTH: 8, DEPTH: 7, LEVEL: -3 } },
  ],
  'leslie': [
    { name: 'Slow',     values: { SPEED: 2, DEPTH: 4, LEVEL: -4 } },
    { name: 'Fast',     values: { SPEED: 8, DEPTH: 6, LEVEL: -3 } },
    { name: 'Wobble',   values: { SPEED: 5, DEPTH: 8, LEVEL: -2 } },
  ],

  // ── 延迟 (模拟范围减半, 由 SUB_MODEL_FORMULAS 决定; 这里给满量程物理值) ──
  'delay-analog': [
    { name: 'Slap',     values: { TIME: 90,  REPEAT: 15 } },
    { name: 'Echo',     values: { TIME: 160, REPEAT: 25 } },
    { name: 'Space',    values: { TIME: 230, REPEAT: 33 } },
  ],
  'delay-digital': [
    { name: 'Slap',     values: { TIME: 100, REPEAT: 20 } },
    { name: 'Echo',     values: { TIME: 350, REPEAT: 55 } },
    { name: 'Long',     values: { TIME: 500, REPEAT: 65 } },
  ],

  // ── 混响 (吉他) ───────────────────────────────────────────────────
  'spring': [
    { name: 'Drip',     values: { DWELL: 6, MIX: 40 } },
    { name: 'Surf',     values: { DWELL: 8, MIX: 55 } },
    { name: 'Snap',     values: { DWELL: 4, MIX: 30 } },
  ],
  'hall': [
    { name: 'Concert',  values: { DECAY: 3000, MIX: 35, PRE: 20, TONE: 3 } },
    { name: 'Large Hall', values: { DECAY: 4500, MIX: 40, PRE: 40, TONE: 2 } },
    { name: 'Room',     values: { DECAY: 2000, MIX: 25, PRE: 10, TONE: 5 } },
  ],
  'plate': [
    { name: 'Vocal',    values: { DECAY: 1800, MIX: 30, TONE: 4 } },
    { name: 'Snare',    values: { DECAY: 1200, MIX: 45, TONE: 3 } },
    { name: 'Wide',     values: { DECAY: 2500, MIX: 35, TONE: 6 } },
  ],
  'room': [
    { name: 'Small',    values: { SIZE: 3, MIX: 25 } },
    { name: 'Medium',   values: { SIZE: 5, MIX: 35 } },
    { name: 'Large',    values: { SIZE: 8, MIX: 45 } },
  ],
  'ambient': [
    { name: 'Pad',      values: { DECAY: 4000, MIX: 50, SPREAD: 7 } },
    { name: 'Dream',    values: { DECAY: 4800, MIX: 60, SPREAD: 9 } },
    { name: 'Wash',     values: { DECAY: 3500, MIX: 40, SPREAD: 5 } },
  ],
  'cathedral': [
    { name: 'Choir',    values: { DECAY: 4200, MIX: 45, PRE: 50 } },
    { name: 'Abyss',    values: { DECAY: 5000, MIX: 60, PRE: 80 } },
    { name: 'Sacred',   values: { DECAY: 3800, MIX: 35, PRE: 30 } },
  ],

  // ── 混响 (贝斯) ───────────────────────────────────────────────────
  'bass-room': [
    { name: 'Small',    values: { SIZE: 3, MIX: 25 } },
    { name: 'Medium',   values: { SIZE: 5, MIX: 35 } },
    { name: 'Large',    values: { SIZE: 8, MIX: 45 } },
  ],
  'bass-hall': [
    { name: 'Concert',  values: { DECAY: 3000, MIX: 35, PRE: 20, TONE: 3 } },
    { name: 'Large Hall', values: { DECAY: 4500, MIX: 40, PRE: 40, TONE: 2 } },
    { name: 'Room',     values: { DECAY: 2000, MIX: 25, PRE: 10, TONE: 5 } },
  ],
};

// delay bass 型号与吉他共享同一组预设
const DELAY_ALIAS: Record<string, string> = {
  'delay-analog': 'delay-analog',
  'delay-analog-b': 'delay-analog',
  'delay-digital': 'delay-digital',
  'delay-digital-b': 'delay-digital',
};

export function getFxPresets(subModelId: string): FxPreset[] {
  const key = DELAY_ALIAS[subModelId] ?? subModelId;
  return PRESETS[key] ?? [];
}
