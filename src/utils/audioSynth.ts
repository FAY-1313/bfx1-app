// ─── Web Audio 合成引擎: 节拍器 click + 鼓机音色 ─────────────────────
// 鼓机: 808 为纯合成套件; rock/funk/hiphop/house/lofi 为 CC0 真实采样套件
// (src/assets/drum/<kit>/<piece>.wav, Vite ?url 独立资产), 运行期懒 fetch +
// decodeAudioData 并按套缓存; 套件缺失鼓件 → 该件走合成兜底.
// 全部按时间参数排程到 AudioContext 时钟上 → 音头毫秒级准时, 无 setTimeout 抖动.
// 支持力度 (velocity): 控制音量与亮度, 鼓机 3 档力度(重/轻/幽灵)依赖此.

let _ctx: AudioContext | null = null;

/** 获取共享 AudioContext (懒创建; 被外部 close 后自动重建). */
export function getSynthCtx(): AudioContext {
  if (!_ctx || _ctx.state === 'closed') _ctx = new AudioContext();
  if (_ctx.state === 'suspended') _ctx.resume().catch(() => {});
  return _ctx;
}

/** 关闭并释放 (面板关闭时调用). */
export function closeSynthCtx(): void {
  if (_ctx) { _ctx.close().catch(() => {}); _ctx = null; }
}

let _noise: AudioBuffer | null = null;
function noiseBuf(ac: AudioContext): AudioBuffer {
  if (_noise && _noise.sampleRate === ac.sampleRate) return _noise;
  const len = ac.sampleRate; // 1s
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  _noise = buf;
  return buf;
}

function expGain(ac: AudioContext, t0: number, peak: number, dur: number, target = 0.001): GainNode {
  const g = ac.createGain();
  g.gain.setValueAtTime(Math.max(0.0001, peak), t0);
  g.gain.exponentialRampToValueAtTime(target, t0 + dur);
  return g;
}

/** 软饱和曲线 (tanh), 用于 808 底鼓谐波失真. */
function softClipCurve(k = 12): Float32Array<ArrayBuffer> {
  const n = 1024;
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = Math.tanh(k * x) / Math.tanh(k);
  }
  return c;
}

/** 短噪声瞬态 (打击乐音头). */
function noiseHit(ac: AudioContext, t0: number, dur: number, vol: number, filterType: BiquadFilterType, freq: number, q = 1, dest?: AudioNode): void {
  const src = ac.createBufferSource();
  src.buffer = noiseBuf(ac);
  const f = ac.createBiquadFilter();
  f.type = filterType; f.frequency.value = freq; f.Q.value = q;
  const g = expGain(ac, t0, vol, dur);
  src.connect(f).connect(g).connect(dest ?? ac.destination);
  src.start(t0); src.stop(t0 + dur + 0.02);
}

/** 正弦扫频 (鼓身/贝斯下沉). */
function toneSweep(ac: AudioContext, t0: number, dur: number, vol: number, f0: number, f1: number, curve = 'exp', dest?: AudioNode): void {
  const o = ac.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(Math.max(1, f0), t0);
  if (curve === 'exp') o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
  else o.frequency.linearRampToValueAtTime(Math.max(1, f1), t0 + dur);
  const g = expGain(ac, t0, vol, dur);
  o.connect(g).connect(dest ?? ac.destination);
  o.start(t0); o.stop(t0 + dur + 0.02);
}

/* ══════════════ 节拍器母带增益（v3.68） ══════════════
 * 用户反馈「节拍器声音太小」，要求可调，且最大音量要比原来响 10 dB。
 *
 * 做法：click 不再直连 destination，而是先过一条 **click 总线**
 *   gain（0 dB 基准）→ DynamicsCompressor（阈值 −6 dB / 比 12:1）→ destination
 * 这样 +10 dB（约 ×3.16）时峰值会被压缩器收住，听感更响但不削成方波。
 * 只作用于节拍器 click，不影响鼓机/循环/录音等其他 synth 输出。
 */
export const CLICK_GAIN_MIN_DB = -20;
export const CLICK_GAIN_MAX_DB = 10;

let _clickGainDb = 0;
let _clickBus: { ac: AudioContext; gain: GainNode } | null = null;

function clickBus(ac: AudioContext): GainNode {
  if (_clickBus && _clickBus.ac === ac) return _clickBus.gain;
  const gain = ac.createGain();
  gain.gain.value = Math.pow(10, _clickGainDb / 20);
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -6;
  comp.knee.value = 6;
  comp.ratio.value = 12;
  comp.attack.value = 0.002;
  comp.release.value = 0.12;
  gain.connect(comp).connect(ac.destination);
  _clickBus = { ac, gain };
  return gain;
}

/** 设置节拍器增益（dB，-20…+10）；播放中调用立即生效 */
export function setClickGainDb(db: number): void {
  _clickGainDb = Math.max(CLICK_GAIN_MIN_DB, Math.min(CLICK_GAIN_MAX_DB, db));
  if (_clickBus) _clickBus.gain.gain.value = Math.pow(10, _clickGainDb / 20);
}

export function getClickGainDb(): number { return _clickGainDb; }

// ─── 节拍器 click ───────────────────────────────────────────────────
export type ClickSound = 'tick' | 'accent' | 'sub' | 'quiet';

/**
 * 合成节拍器点击声.
 * - accent: 重拍 (高音 ping, 稍长), tick: 普通拍, sub: 弱拍 (6/8 后半), quiet: 静音占位.
 */
export function scheduleClick(time: number, type: ClickSound): void {
  if (type === 'quiet') return;
  const ac = getSynthCtx();
  const bus = clickBus(ac);              // ★ v3.68：过母带增益 + 压缩器
  const isAccent = type === 'accent';
  const freq = isAccent ? 1760 : type === 'sub' ? 660 : 880;
  const dur = isAccent ? 0.05 : 0.035;
  const vol = isAccent ? 0.5 : type === 'sub' ? 0.22 : 0.32;
  // 正弦 ping (主体)
  toneSweep(ac, time, dur, vol, freq, freq * 0.98, 'lin', bus);
  // 噪声"嗒"音头 (攻击感)
  noiseHit(ac, time, 0.008, vol * 0.6, 'bandpass', freq * 2.4, 1.2, bus);
}

// ─── 鼓音色 ─────────────────────────────────────────────────────────
export type DrumId = 'kick' | 'snare' | 'hihat' | 'clap' | 'tom' | 'openhat' | 'crash' | 'shaker';
/** 2026-09-03: 仅 808 为合成; 其余 5 套均为 CC0 真实采样 (rock 原声 / funk 电鼓 / hiphop 嘻哈 / house 舞曲 / lofi 低保真). */
export type DrumKit = '808' | 'rock' | 'funk' | 'hiphop' | 'house' | 'lofi';

/** v39 及以前旧鼓组 → 新 CC0 体系映射: real(真实)/studio(录音室)→rock 原声, tape(磁带)→lofi; 未知值回退 rock.
 *  用于 drumPatterns/自定义槽等持久化数据按新体系安全加载. */
export function normalizeKit(k: string | null | undefined): DrumKit {
  if (k === 'rock' || k === 'funk' || k === 'hiphop' || k === 'house' || k === 'lofi' || k === '808') return k;
  if (k === 'studio') return 'house';
  if (k === 'tape') return 'lofi';
  return 'rock'; // 'real' 与其它未知值 → rock 原声
}

export interface DrumDef { id: DrumId; label: string; shortLabel: string; color: string }

export const DRUM_DEFS: DrumDef[] = [
  { id: 'kick',    label: 'Kick',     shortLabel: 'KK', color: 'rgb(255,80,80)' },
  { id: 'snare',   label: 'Snare',    shortLabel: 'SN', color: 'rgb(255,160,40)' },
  { id: 'hihat',   label: 'Hi-Hat',   shortLabel: 'HH', color: 'rgb(60,220,100)' },
  { id: 'clap',    label: 'Clap',     shortLabel: 'CL', color: 'rgb(60,180,255)' },
  { id: 'tom',     label: 'Tom',      shortLabel: 'TM', color: 'rgb(180,120,255)' },
  { id: 'openhat', label: 'Open Hat', shortLabel: 'OH', color: 'rgb(255,220,60)' },
  { id: 'crash',   label: 'Crash',    shortLabel: 'CR', color: 'rgb(80,200,220)' },
  { id: 'shaker',  label: 'Shaker',   shortLabel: 'SH', color: 'rgb(255,140,180)' },
];

// 真实采样资产表: src/assets/drum/<kit>/<piece>.wav (由 sample_src/prep_drums.py 从 CC0 源生成)
const _sampleUrlMap = import.meta.glob('../assets/drum/*/*.wav', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const _sampleCache = new Map<string, { ctx: AudioContext; buf: AudioBuffer }>();
const _kitReady = new Set<DrumKit>();

const kitPiecesOf = (kit: DrumKit): string[] => {
  const out: string[] = [];
  for (const k of Object.keys(_sampleUrlMap)) {
    const seg = k.split('/');
    if (seg[seg.length - 3] === 'drum' && seg[seg.length - 2] === kit) {
      const piece = seg[seg.length - 1].replace(/\.wav$/, '');
      if (piece) out.push(piece);
    }
  }
  return out;
};

/**
 * 懒解码指定套件的真实采样 (逐件 fetch + decode, 失败单件跳过).
 * 返回是否至少解出 4 个核心件 (kick/snare/hihat/openhat) — 够一首基础 groove 发声.
 */
export async function ensureDrumSamples(kit: DrumKit): Promise<boolean> {
  const ac = getSynthCtx();
  const pieces = kitPiecesOf(kit);
  let ok = 0;
  await Promise.all(pieces.map(async (piece) => {
    const key = `${kit}:${piece}`;
    const hit = _sampleCache.get(key);
    if (hit && hit.ctx === ac) { if (isCore(piece)) ok++; return; }
    const url = _sampleUrlMap[`../assets/drum/${kit}/${piece}.wav`];
    if (!url) return;
    try {
      const res = await fetch(url);
      const ab = await res.arrayBuffer();
      const buf = await ac.decodeAudioData(ab);
      _sampleCache.set(key, { ctx: ac, buf });
      if (isCore(piece)) ok++;
    } catch { /* 单件失败忽略 */ }
  }));
  if (ok >= 2) _kitReady.add(kit);
  return ok >= 4;
}

function isCore(piece: string): boolean {
  return piece === 'kick' || piece === 'snare' || piece === 'hihat' || piece === 'openhat';
}

/** 套件是否已解码就绪 (供 UI 显示 loading/ready). */
export function isKitReady(kit: DrumKit): boolean {
  return _kitReady.has(kit);
}

/** 已就绪套件数缓存逐套清空 (kit 切换等场景可选择性使用). */
export function resetKitSampleCache(kit: DrumKit): void {
  _kitReady.delete(kit);
  for (const key of [..._sampleCache.keys()]) if (key.startsWith(`${kit}:`)) _sampleCache.delete(key);
}

/** 播采样 (命中缓存返回 true, 否则调用方走合成兜底). */
function playSample(time: number, drum: DrumId, kit: DrumKit, v: number): boolean {
  const hit = _sampleCache.get(`${kit}:${drum}`);
  if (!hit) return false;
  const ac = getSynthCtx();
  if (hit.ctx !== ac) { _sampleCache.delete(`${kit}:${drum}`); return false; }
  const src = ac.createBufferSource();
  src.buffer = hit.buf;
  const g = ac.createGain();
  const gk = kit === 'lofi' ? 0.9 : kit === 'hiphop' ? 0.92 : kit === 'house' ? 0.95 : kit === 'funk' ? 0.95 : 1.0;
  g.gain.setValueAtTime(Math.max(0.0001, gk * v), time);
  src.connect(g).connect(ac.destination);
  src.start(time);
  return true;
}

/**
 * 排程一次鼓击.
 * - 真实套件 (非 808): 该鼓件采样已解码 → 播采样; 未解码/缺失件 → 合成兜底.
 * - 808: 纯合成.
 * velocity: 0~1, 影响音量.
 */
export function scheduleDrum(time: number, drum: DrumId, kit: DrumKit, velocity = 1): void {
  const ac = getSynthCtx();
  const v = Math.max(0.05, Math.min(1, velocity));

  if (kit !== '808') {
    if (playSample(time, drum, kit, v)) return;
  }

  const is808 = kit === '808';
  switch (drum) {
    case 'kick': {
      if (is808) {
        toneSweep(ac, time, 0.5, 0.85 * v, 150, 38);
        noiseHit(ac, time, 0.006, 0.25 * v, 'highpass', 1500);
        // 谐波失真 (808 饱和)
        const o = ac.createOscillator();
        o.type = 'sine';
        o.frequency.setValueAtTime(150, time);
        o.frequency.exponentialRampToValueAtTime(38, time + 0.5);
        const sh = ac.createWaveShaper();
        sh.curve = softClipCurve();
        const g = expGain(ac, time, 0.25 * v, 0.5);
        o.connect(sh).connect(g).connect(ac.destination);
        o.start(time); o.stop(time + 0.55);
      } else {
        // 合成兜底底鼓 (真实风格中性: 短下沉 + 音头)
        toneSweep(ac, time, 0.28, 0.9 * v, 115, 42);
        noiseHit(ac, time, 0.008, 0.3 * v, 'highpass', 1800);
      }
      break;
    }
    case 'snare': {
      if (is808) {
        toneSweep(ac, time, 0.3, 0.4 * v, 210, 160);
        noiseHit(ac, time, 0.3, 0.55 * v, 'bandpass', 1900, 1);
      } else {
        toneSweep(ac, time, 0.16, 0.4 * v, 210, 160);
        noiseHit(ac, time, 0.18, 0.55 * v, 'bandpass', 1900, 1);
      }
      break;
    }
    case 'hihat': {
      const dur = is808 ? 0.16 : 0.055;
      const hp = is808 ? 8500 : 6500;
      noiseHit(ac, time, dur, (is808 ? 0.3 : 0.22) * v, 'highpass', hp);
      break;
    }
    case 'clap': {
      // 3 连噪声簇 (16ms 间隔)
      const bp = is808 ? 1200 : 1000;
      const dur = is808 ? 0.28 : 0.16;
      for (let i = 0; i < 3; i++) {
        noiseHit(ac, time + i * 0.014, dur, (is808 ? 0.22 : 0.18) * v * (i === 2 ? 1.1 : 0.8), 'bandpass', bp, 1);
      }
      break;
    }
    case 'tom': {
      const f0 = is808 ? 220 : 190;
      const f1 = is808 ? 65 : 95;
      toneSweep(ac, time, is808 ? 0.24 : 0.22, 0.5 * v, f0, f1);
      noiseHit(ac, time, 0.02, 0.16 * v, 'bandpass', 900, 1);
      break;
    }
    case 'openhat': {
      const dur = is808 ? 0.5 : 0.28;
      noiseHit(ac, time, dur, (is808 ? 0.24 : 0.2) * v, 'highpass', is808 ? 7200 : 6500);
      noiseHit(ac, time, dur * 0.6, 0.1 * v, 'bandpass', 4200, 2);
      break;
    }
    case 'crash': {
      const dur = is808 ? 1.4 : 1.0;
      noiseHit(ac, time, dur, (is808 ? 0.14 : 0.16) * v, 'highpass', 5500);
      noiseHit(ac, time, dur * 0.5, 0.12 * v, 'bandpass', 8500, 1.5);
      toneSweep(ac, time, 0.04, 0.08 * v, 6000, 9000, 'lin');
      break;
    }
    case 'shaker': {
      for (let i = 0; i < 3; i++) {
        noiseHit(ac, time + i * 0.007, 0.03, 0.12 * v, 'highpass', 6000);
      }
      break;
    }
  }
}

// ─── 提示音 (调音器参考音 / 应用成功) ──────────────────────────────
/** 播一个指定频率的提示音 (参考音 A4 等). */
export function scheduleRefTone(time: number, freq: number, dur = 0.6, vol = 0.25): void {
  const ac = getSynthCtx();
  const o = ac.createOscillator();
  o.type = 'sine';
  o.frequency.value = freq;
  const g = expGain(ac, time, vol, dur, 0.0001);
  o.connect(g).connect(ac.destination);
  o.start(time); o.stop(time + dur + 0.05);
}
