/**
 * IR Cabinet Engine — maps IR analysis to 35-band PEQ registers for cabinet simulation
 *
 * The 35-band PEQ uses registers 105–214 (one uint32 per band).
 * Each PEQ band bitfield: type(3) | freqIndex(9) | gainIndex(8) | Q(7) | S(5)
 *
 * Strategy:
 *   - Analyze IR file frequency response → extract 35 frequency bands
 *   - For each band, generate a PEQ register value that recreates the response curve
 *   - Write bands to hardware via BLE
 *
 * For NAM models, maps tone characteristics to all available module parameters:
 *   - Pre/Post EQ bands, compression, noise gate, gain staging
 */

import { buildPEQData, PEQ_TYPE, PEQ_FREQ_TABLE } from '../data/parameterMap';

// ─── 35-band ISO center frequencies ─────────────────────────────────
export const ISO_35_BAND_FREQS: number[] = [
  20, 25, 31.5, 40, 50, 63, 80, 100, 125, 160,
  200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600,
  2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000, 12500, 16000,
  20000,
];

// 35-band PEQ base register address
const PEQ_35_BASE = 105;

export interface IRBandConfig {
  bandIndex: number;
  frequency: number;
  /** 0-1 normalized gain */
  gain: number;
  /** 0-1 normalized Q */
  q: number;
  peqType: number;
}

export interface IRCabinetConfig {
  bands: IRBandConfig[];
  /** Cabinet bypass address (260, M1OutMute) */
  bypassAddr: number;
}

export interface NAMRegisterSuggestion {
  regAddr: number;
  value: number;
  label: string;
}

/**
 * Extract frequency response from an AudioBuffer (simplified FFT-based analysis)
 * Returns magnitude for each ISO 35-band frequency
 */
export function analyzeFrequencyResponse(audioBuffer: AudioBuffer): Float32Array {
  const sampleRate = audioBuffer.sampleRate;
  const channelData = audioBuffer.getChannelData(0);
  const fftSize = 2048;
  const magnitudes = new Float32Array(ISO_35_BAND_FREQS.length);

  // Use multiple FFT windows for averaging
  const numWindows = Math.min(32, Math.floor(channelData.length / fftSize));
  if (numWindows === 0) {
    // Not enough data — return flat response
    magnitudes.fill(0.5);
    return magnitudes;
  }

  const accum = new Float32Array(fftSize / 2);

  for (let w = 0; w < numWindows; w++) {
    const offset = Math.floor(w * (channelData.length - fftSize) / numWindows);
    // Simple FFT via DFT for target frequencies only (more efficient)
    for (let fi = 0; fi < ISO_35_BAND_FREQS.length; fi++) {
      const targetFreq = ISO_35_BAND_FREQS[fi];
      const binIndex = Math.round(targetFreq * fftSize / sampleRate);
      if (binIndex >= fftSize / 2) continue;

      // Goertzel algorithm for single-frequency DFT
      let s_prev = 0, s_prev2 = 0;
      const omega = 2 * Math.PI * targetFreq / sampleRate;
      const coeff = 2 * Math.cos(omega);
      for (let i = 0; i < fftSize; i++) {
        const sample = channelData[(offset + i) % channelData.length];
        const s = sample + coeff * s_prev - s_prev2;
        s_prev2 = s_prev;
        s_prev = s;
      }
      const power = s_prev2 * s_prev2 + s_prev * s_prev - coeff * s_prev * s_prev2;
      accum[fi] += power;
    }
  }

  // Average and normalize
  for (let i = 0; i < ISO_35_BAND_FREQS.length; i++) {
    const avg = accum[i] / numWindows;
    // Convert to dB-like scale, normalize to 0-1
    const db = 10 * Math.log10(Math.max(avg, 1e-10));
    // Normalize: assume -80dB to 0dB range
    magnitudes[i] = Math.max(0, Math.min(1, (db + 80) / 80));
  }

  return magnitudes;
}

/**
 * Generate 35-band PEQ config from frequency response magnitudes
 * Uses PEAK mode for each band to recreate the response curve
 */
export function generateIRConfig(
  magnitudes: Float32Array
): IRCabinetConfig {
  const bands: IRBandConfig[] = [];
  const M = Math.min(magnitudes.length, 35);

  // Find the peak magnitude for normalization
  let peakMag = 0.01;
  for (let i = 0; i < M; i++) {
    if (magnitudes[i] > peakMag) peakMag = magnitudes[i];
  }

  for (let i = 0; i < M; i++) {
    // Normalize gain relative to peak
    const normalizedGain = peakMag > 0 ? magnitudes[i] / peakMag : 0.5;
    // Convert to 0-1 with gentle curve for natural response
    const gain = Math.pow(normalizedGain, 0.7);

    // Wider Q at low frequencies, tighter at high
    const freq = ISO_35_BAND_FREQS[i] || 1000;
    const q = freq < 200 ? 0.6 : freq < 2000 ? 0.8 : 1.0;

    bands.push({
      bandIndex: i,
      frequency: freq,
      gain,
      q,
      peqType: PEQ_TYPE.PEAK,
    });
  }

  return {
    bands,
    bypassAddr: 260,
  };
}

/**
 * Convert IR cabinet config to register values for BLE write
 */
export function irConfigToRegisters(config: IRCabinetConfig): NAMRegisterSuggestion[] {
  const regs: NAMRegisterSuggestion[] = [];

  // Enable cabinet (write 0 to bypass addr = enabled)
  regs.push({
    regAddr: config.bypassAddr,
    value: 0,
    label: 'Cabinet Enable',
  });

  // Write each PEQ band
  for (const band of config.bands) {
    const regAddr = PEQ_35_BASE + band.bandIndex;

    // Map gain 0-1 to gainIndex 0-255
    const gainIndex = Math.round(band.gain * 240);

    // Find closest frequency in PEQ frequency table
    let freqIndex = 60; // default ~1kHz
    let minDiff = Infinity;
    for (let fi = 0; fi < PEQ_FREQ_TABLE.length; fi++) {
      const diff = Math.abs(PEQ_FREQ_TABLE[fi] - band.frequency);
      if (diff < minDiff) { minDiff = diff; freqIndex = fi; }
    }

    // Map Q 0-1 to Q index 0-100
    const qIndex = Math.round(band.q * 100);

    const peqData = buildPEQData(band.peqType, freqIndex, gainIndex, qIndex, 10);

    regs.push({
      regAddr,
      value: peqData,
      label: `PEQ Band ${band.bandIndex + 1} (${Math.round(band.frequency)}Hz)`,
    });
  }

  return regs;
}

/**
 * Generate comprehensive NAM register configuration from file analysis
 * Maps the identified model characteristics to all available hardware parameters
 */
export function generateNAMConfig(
  confidence: number,
  ampType: string
): NAMRegisterSuggestion[] {
  const regs: NAMRegisterSuggestion[] = [];

  // Noise gate
  regs.push({ regAddr: 0, value: 1, label: 'Noise Gate Bypass' });
  regs.push({ regAddr: 1, value: 3, label: 'Gate Threshold' });

  // Compressor — reg4=Enable/reg5=Mode 硬件默认 0 (MODE1) 不写入
  regs.push({ regAddr: 8, value: Math.round(20 + confidence * 15), label: 'Comp Threshold' });
  regs.push({ regAddr: 9, value: Math.round(2 + confidence * 10), label: 'Comp Attack' });
  regs.push({ regAddr: 10, value: Math.round(50 + confidence * 200), label: 'Comp Release' });
  regs.push({ regAddr: 13, value: Math.round(6 + confidence * 4), label: 'Comp Gain' });

  // Overdrive section (block 1) — Pre EQ
  const preEQGain = Math.round(60 + confidence * 40);
  // Low shelf — boost low end
  regs.push({ regAddr: 45, value: buildPEQData(PEQ_TYPE.LOW_SHELF, 30, preEQGain, 16, 10), label: 'PreEQ Bass' });
  // Peak — mids
  regs.push({ regAddr: 46, value: buildPEQData(PEQ_TYPE.PEAK, 100, preEQGain, 16, 10), label: 'PreEQ Mid' });
  // High shelf — presence
  regs.push({ regAddr: 44, value: buildPEQData(PEQ_TYPE.HIGH_SHELF, 250, preEQGain, 16, 10), label: 'PreEQ Treble' });
  regs.push({ regAddr: 47, value: buildPEQData(PEQ_TYPE.HIGH_SHELF, 300, Math.round(40 + confidence * 30), 16, 10), label: 'PreEQ Presence' });

  // OD Drive & Volume based on amp type
  let driveValue = 50;
  let volValue = 120;
  if (ampType.includes('clean')) { driveValue = 20; volValue = 180; }
  else if (ampType.includes('crunch')) { driveValue = 45; volValue = 140; }
  else if (ampType.includes('lead')) { driveValue = 75; volValue = 160; }
  else if (ampType.includes('bass')) { driveValue = 35; volValue = 150; }

  regs.push({ regAddr: 49, value: Math.round(driveValue * (0.8 + confidence * 0.4)), label: 'Drive' });
  regs.push({ regAddr: 51, value: Math.round(volValue * (0.85 + confidence * 0.3)), label: 'Volume' });

  // Post OD PEQ (5-band GEQ style)
  const postEQBase = 85;
  const postGains = [0.5, 0.6, 0.7, 0.8, 1.0]; // Low to high
  for (let i = 0; i < 5; i++) {
    const gain = Math.round(60 + postGains[i] * confidence * 80);
    regs.push({
      regAddr: postEQBase + i,
      value: buildPEQData(PEQ_TYPE.PEAK, 30 + i * 50, gain, 16, 10),
      label: `PostEQ Band ${i + 1}`,
    });
  }

  // 35-band PEQ — apply subtle shaping based on confidence
  const peq35Start = 105;
  for (let i = 0; i < 35; i++) {
    const freq = ISO_35_BAND_FREQS[i] || (20 * Math.pow(1.26, i));
    // Natural cabinet rolloff: slight highs attenuation
    const rolloff = i > 25 ? 1.0 - (i - 25) * 0.04 : 1.0;
    const shapedGain = Math.round(100 + (confidence * 80 * rolloff));
    regs.push({
      regAddr: peq35Start + i,
      value: buildPEQData(PEQ_TYPE.PEAK, Math.round(i * 10.3), shapedGain, 16, 10),
      label: `35EQ Band ${i + 1}`,
    });
  }

  // Speaker output
  regs.push({ regAddr: 260, value: 0, label: 'M1 Output Unmute' });

  return regs;
}
