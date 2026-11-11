/**
 * Replaces the synthesized (electronic) drum WAVs with real acoustic drum
 * samples from AVL Drumkits (Pearl 22" kick, Pearl snare, Sabian closed hihat,
 * hand clap).  Trims silence, fades the tail, normalizes peak, then rewrites:
 *   - public/assets/sounds/*.wav
 *   - android/app/src/main/assets/sounds/*.wav
 *   - android/app/src/main/assets/public/assets/sounds/*.wav
 * and regenerates src/data/audioData.ts from the final files.
 *
 * Usage: node scripts/process-real-drums.cjs
 */
const fs = require('fs');
const path = require('path');

const SRC_DIR = 'C:/Users/FAY/bfx_net/avl';
const MAP = {
  kick: '36-Pearl22Kick-1.wav',
  snare: '38-PearlSnare-1.wav',
  hihat: '42-SabianRockHatClosed-1.wav',
  clap: '39-HandClap-1.wav',
};
const TARGET_PEAK = 0.9;
const TAIL_TRIM = 0.01; // trim below 1% of peak
const FADE_MS = 8;

function readWavSamples(buf) {
  let off = 12;
  let fmt = null, dataOff = 0, dataSize = 0;
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4);
    const sz = buf.readUInt32LE(off + 4);
    if (id === 'fmt ') {
      fmt = {
        audioFormat: buf.readUInt16LE(off + 8),
        channels: buf.readUInt16LE(off + 10),
        rate: buf.readUInt32LE(off + 12),
        bits: buf.readUInt16LE(off + 22),
      };
    }
    if (id === 'data') { dataOff = off + 8; dataSize = sz; }
    off += 8 + sz + (sz % 2);
  }
  if (!fmt || fmt.audioFormat !== 1 || fmt.channels !== 1 || fmt.bits !== 16) {
    throw new Error('unsupported WAV (need mono 16-bit PCM)');
  }
  const n = dataSize / 2;
  const samples = new Float32Array(n);
  for (let i = 0; i < n; i++) samples[i] = buf.readInt16LE(dataOff + i * 2) / 32768;
  return { samples, rate: fmt.rate };
}

function process(samples, rate) {
  let peak = 0;
  for (const s of samples) peak = Math.max(peak, Math.abs(s));
  if (peak === 0) return new Float32Array(0);
  const thr = peak * TAIL_TRIM;

  let start = 0;
  while (start < samples.length && Math.abs(samples[start]) < thr) start++;
  let end = samples.length - 1;
  while (end > start && Math.abs(samples[end]) < thr) end--;

  const trimmed = samples.slice(start, end + 1);

  const fadeN = Math.min(Math.floor(FADE_MS / 1000 * rate), Math.floor(trimmed.length * 0.25));
  for (let i = 0; i < fadeN; i++) {
    const idx = trimmed.length - 1 - i;
    if (idx >= 0) trimmed[idx] *= i / fadeN;
  }

  let peak2 = 0;
  for (const s of trimmed) peak2 = Math.max(peak2, Math.abs(s));
  const gain = peak2 > 0 ? TARGET_PEAK / peak2 : 1;
  for (let i = 0; i < trimmed.length; i++) trimmed[i] *= gain;
  return trimmed;
}

function writeWav(samples, rate, filePath) {
  const dataSize = samples.length * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(v < 0 ? v * 32768 : v * 32767), 44 + i * 2);
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, buf);
  return { bytes: buf.length, seconds: samples.length / rate };
}

const ROOT = path.resolve(__dirname, '..');
const OUT_DIRS = [
  path.join(ROOT, 'public', 'assets', 'sounds'),
  path.join(ROOT, 'android', 'app', 'src', 'main', 'assets', 'sounds'),
  path.join(ROOT, 'android', 'app', 'src', 'main', 'assets', 'public', 'assets', 'sounds'),
];

const RATE = 44100;

// 1) Process + write real drum WAVs to every output dir
for (const [id, srcName] of Object.entries(MAP)) {
  const raw = fs.readFileSync(path.join(SRC_DIR, srcName));
  const { samples, rate } = readWavSamples(raw);
  const out = process(samples, rate);
  for (const dir of OUT_DIRS) {
    const r = writeWav(out, rate, path.join(dir, `${id}.wav`));
    console.log(`  ${id}.wav  ${r.bytes} bytes, ${r.seconds.toFixed(2)}s  <- ${srcName}`);
  }
}

// 2) Regenerate src/data/audioData.ts from the final public WAVs (all 6 ids)
const publicDir = path.join(ROOT, 'public', 'assets', 'sounds');
const ids = ['metronome_accent', 'metronome_normal', 'kick', 'snare', 'hihat', 'clap'];
const entries = [];
for (const id of ids) {
  const b = fs.readFileSync(path.join(publicDir, `${id}.wav`));
  const b64 = b.toString('base64');
  entries.push(`  "${id}": "data:audio/wav;base64,${b64}"`);
}
const out = `// Auto-generated audio data URIs
export const AUDIO_DATA: Record<string, string> = {\n${entries.join(',\n')}\n};\n`;
fs.writeFileSync(path.join(ROOT, 'src', 'data', 'audioData.ts'), out);
console.log(`\naudioData.ts regenerated (${out.length} bytes)`);
