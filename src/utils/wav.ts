// ─── WAV(PCM16) 编码器 (Looper/Recorder/Stem 共用) ──────────────────
export function encodeWavPCM16(channels: Float32Array[], sampleRate: number): ArrayBuffer {
  const n = channels[0].length;
  const numChannels = channels.length;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const dataLength = n * blockAlign;
  const buf = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buf);
  const ws = (o: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
  ws(0, 'RIFF'); view.setUint32(4, 36 + dataLength, true); ws(8, 'WAVE');
  ws(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true); view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true); view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); ws(36, 'data'); view.setUint32(40, dataLength, true);
  let off = 44;
  for (let i = 0; i < n; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const s = Math.max(-1, Math.min(1, channels[ch][i] ?? 0));
      view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
      off += 2;
    }
  }
  return buf;
}

/** 把 AudioBuffer 抽成交错 Float32Array (用于统一编码). */
export function audioBufferToFloatArray(buffer: AudioBuffer): Float32Array {
  const numChannels = buffer.numberOfChannels;
  const data = new Float32Array(buffer.length * numChannels);
  for (let ch = 0; ch < numChannels; ch++) {
    const channel = buffer.getChannelData(ch);
    for (let i = 0; i < buffer.length; i++) data[i * numChannels + ch] = channel[i];
  }
  return data;
}
