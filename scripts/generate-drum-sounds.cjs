/**
 * Generates tiny WAV + MP3 files for metronome clicks and drum sounds.
 *
 * Output: public/assets/sounds/ and android/app/src/main/assets/sounds/
 * Usage: node scripts/generate-drum-sounds.cjs
 */

const fs = require('fs');
const path = require('path');

const SAMPLE_RATE = 44100;
const BIT_DEPTH = 16;

function floatToInt16(samples) {
  const arr = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    arr[i] = Math.round(clamped < 0 ? clamped * 32768 : clamped * 32767);
  }
  return arr;
}

function writeWav(samples, filePath) {
  const numChannels = 1;
  const byteRate = SAMPLE_RATE * numChannels * (BIT_DEPTH / 8);
  const blockAlign = numChannels * (BIT_DEPTH / 8);
  const dataSize = samples.length * (BIT_DEPTH / 8);
  const headerSize = 44;
  const buffer = Buffer.alloc(headerSize + dataSize);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(BIT_DEPTH, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    const intVal = clamped < 0 ? clamped * 32768 : clamped * 32767;
    buffer.writeInt16LE(Math.round(intVal), headerSize + i * 2);
  }

  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, buffer);
  console.log(`  WAV ${path.basename(filePath)} (${buffer.length} bytes)`);
}

// --- Sound generators ---

function genMetronomeAccent() {
  const len = Math.floor(SAMPLE_RATE * 0.05);
  const samples = [];
  for (let i = 0; i < len; i++) {
    const t = i / SAMPLE_RATE;
    samples.push(Math.sin(2 * Math.PI * 1000 * t) * Math.exp(-(i / len) * 8) * 0.9);
  }
  return samples;
}

function genMetronomeNormal() {
  const len = Math.floor(SAMPLE_RATE * 0.05);
  const samples = [];
  for (let i = 0; i < len; i++) {
    const t = i / SAMPLE_RATE;
    samples.push(Math.sin(2 * Math.PI * 700 * t) * Math.exp(-(i / len) * 8) * 0.3);
  }
  return samples;
}

function genKick() {
  const len = Math.floor(SAMPLE_RATE * 0.15);
  const samples = [];
  for (let i = 0; i < len; i++) {
    const p = i / len;
    samples.push(
      Math.sin(6.28 * (150 * Math.pow(0.27, p)) * i / SAMPLE_RATE) * Math.exp(-p * 8) * 0.95 +
      (Math.random() * 2 - 1) * Math.exp(-p * 25) * 0.05
    );
  }
  return samples;
}

function genSnare() {
  const len = Math.floor(SAMPLE_RATE * 0.15);
  const samples = [];
  for (let i = 0; i < len; i++) {
    const p = i / len;
    samples.push(
      Math.sin(6.28 * 200 * i / SAMPLE_RATE) * Math.exp(-p * 5) * 0.5 +
      (Math.random() * 2 - 1) * Math.exp(-p * 10) * 0.45
    );
  }
  return samples;
}

function genHihat() {
  const len = Math.floor(SAMPLE_RATE * 0.06);
  const samples = [];
  for (let i = 0; i < len; i++) {
    const p = i / len;
    samples.push(
      (Math.random() * 2 - 1) * (1 - Math.exp(-p * 30)) * Math.exp(-p * 15) * 0.85
    );
  }
  return samples;
}

function genClap() {
  const len = Math.floor(SAMPLE_RATE * 0.15);
  const samples = [];
  for (let i = 0; i < len; i++) {
    const p = i / len;
    let v = 0;
    for (let j = 0; j < 4; j++) {
      const dp = p - j * 0.012;
      if (dp >= 0) v += (Math.random() * 2 - 1) * Math.exp(-dp * 25) * 0.9;
    }
    samples.push(v * Math.exp(-p * 4));
  }
  return samples;
}

// --- Generate all files ---
const ROOT = path.resolve(__dirname, '..');
const OUT_DIRS = [
  path.join(ROOT, 'public', 'assets', 'sounds'),
  path.join(ROOT, 'android', 'app', 'src', 'main', 'assets', 'sounds'),
];

console.log('Generating drum/metronome WAV files...\n');

const sounds = [
  { name: 'metronome_accent', gen: genMetronomeAccent },
  { name: 'metronome_normal', gen: genMetronomeNormal },
  { name: 'kick', gen: genKick },
  { name: 'snare', gen: genSnare },
  { name: 'hihat', gen: genHihat },
  { name: 'clap', gen: genClap },
];

for (const outDir of OUT_DIRS) {
  for (const sound of sounds) {
    const s = sound.gen();
    writeWav(s, path.join(outDir, `${sound.name}.wav`));
  }
}

console.log('\nDone!');
