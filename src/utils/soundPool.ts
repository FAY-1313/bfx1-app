// ─── Sound engine: native-audio (Capacitor) with HTML5 audio fallback ─────
// Native path routes output to the media stream (speaker) instead of the
// earpiece; web/dev keeps the base64 HTML5 pool.

import { NativeAudio } from '@capacitor-community/native-audio';
import { AUDIO_DATA } from '../data/audioData';

const IDS = ['metronome_accent','metronome_normal','kick','snare','hihat','clap'];
const FILES: Record<string, string> = {
  metronome_accent: 'metronome_accent.wav',
  metronome_normal: 'metronome_normal.wav',
  kick: 'kick.wav',
  snare: 'snare.wav',
  hihat: 'hihat.wav',
  clap: 'clap.wav',
};
const POOL_SIZE = 4;

const pools: Record<string, HTMLAudioElement[]> = {};
const indices: Record<string, number> = {};
let initialized = false;
let nativeReady = false;

const isNative = (): boolean =>
  typeof window !== 'undefined' && 'Capacitor' in window;

export function initAudio(): void {
  if (initialized) return;
  initialized = true;

  // Always build the HTML5 pool as an immediate fallback.
  for (const id of IDS) {
    const dataUri = AUDIO_DATA[id];
    if (!dataUri) { console.warn('soundPool: no data for', id); continue; }
    pools[id] = [];
    indices[id] = 0;
    for (let i = 0; i < POOL_SIZE; i++) {
      const a = new Audio(dataUri);
      a.preload = 'auto';
      a.volume = 1.0;
      pools[id].push(a);
    }
    console.log('soundPool: loaded', id, 'x' + POOL_SIZE);
  }

  // Native path (preferred): preload into native audio, switch over when ready.
  if (isNative()) {
    (async () => {
      try {
        for (const id of IDS) {
          for (let i = 0; i < POOL_SIZE; i++) {
            await NativeAudio.preload({
              assetId: `${id}_${i}`,
              assetPath: `public/assets/sounds/${FILES[id]}`,
              volume: 1.0,
              audioChannelNum: 1,
              isUrl: false,
            });
          }
        }
        nativeReady = true;
        console.log('soundPool: native audio ready');
      } catch (e) {
        console.warn('soundPool: native preload failed, keeping HTML5', e);
      }
    })();
  }
}

export function playSound(id: string): void {
  if (!initialized) { initAudio(); }

  if (nativeReady) {
    const idx = (indices[id] || 0) % POOL_SIZE;
    indices[id] = idx + 1;
    NativeAudio.play({ assetId: `${id}_${idx}` })
      .catch(e => console.warn('soundPool: native play failed for', id, e));
    return;
  }

  const pool = pools[id];
  if (!pool || pool.length === 0) {
    console.warn('soundPool: no pool for', id);
    return;
  }

  const idx = (indices[id] || 0) % pool.length;
  indices[id] = idx + 1;
  const a = pool[idx];
  a.currentTime = 0;
  a.play().catch(e => console.warn('soundPool: play failed for', id, e));
}

export function stopSound(id: string): void {
  if (nativeReady) {
    for (let i = 0; i < POOL_SIZE; i++) {
      NativeAudio.stop({ assetId: `${id}_${i}` }).catch(() => {});
    }
  }
  const pool = pools[id];
  if (!pool) return;
  for (const a of pool) { a.pause(); a.currentTime = 0; }
}
