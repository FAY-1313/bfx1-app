/**
 * BFX1 · 25+25 参数导出
 *
 * 输出面向预设制作：
 *  - 当前箱头 / 当前箱体：从设备回读缓存取寄存器，同时带基础参数
 *  - 全部 25 + 25：新数据层的完整基础参数（word + 解码后的 type/freq/gain/Q/S）
 *  - JSON + CSV 同时落盘，Android 走原生「下载/BFX1/」，Web 调试回退为下载。
 */
import {
  PEQ_FREQ_TABLE,
  PEQ_Q_TABLE,
  PEQ_S_TABLE,
  parsePEQData,
  peqGainToDb,
} from '../data/peqCodec';
import {
  TONE25_CABS,
  TONE25_HEADS,
  type Tone25CabSpec,
  type Tone25HeadSpec,
} from '../data/_def/tone25';
import { saveFilesNative, type FilePayload } from '../services/fileSaver';

const TYPE_NAME: Record<number, string> = {
  0: 'PEAK',
  1: 'LOW',
  2: 'HIGH',
  3: 'PASS',
  4: 'HPF2',
  5: 'LPF2',
  6: 'HPF1',
  7: 'LPF1',
};

export interface DecodedBand {
  type: string;
  typeId: number;
  freqHz: number;
  gainDb: number;
  q: number | null;
  s: number | null;
  word: number;
  wordHex: string;
}

export function decodeBand(word: number): DecodedBand {
  const p = parsePEQData(word >>> 0);
  const shelf = p.type === 1 || p.type === 2;
  return {
    type: TYPE_NAME[p.type] ?? String(p.type),
    typeId: p.type,
    freqHz: PEQ_FREQ_TABLE[p.freq] ?? 0,
    gainDb: Number(peqGainToDb(p.gain).toFixed(1)),
    q: shelf ? null : (PEQ_Q_TABLE[p.q] ?? null),
    s: shelf ? (PEQ_S_TABLE[p.s] ?? null) : null,
    word: word >>> 0,
    wordHex: `0x${(word >>> 0).toString(16).toUpperCase().padStart(8, '0')}`,
  };
}

const AMP_PARAM_ADDRS = [
  57,
  ...Array.from({ length: 4 }, (_, i) => 59 + i),
  64, 65, 66,
  ...Array.from({ length: 4 }, (_, i) => 68 + i),
  72,
  ...Array.from({ length: 4 }, (_, i) => 74 + i),
  79, 80, 81,
  ...Array.from({ length: 16 }, (_, i) => 83 + i),
  239,
];

const CAB_PARAM_ADDRS = [
  107, 253,
  ...Array.from({ length: 35 }, (_, i) => 108 + i),
  254, 255, 256, 257, 258, 259,
];

function regsOf(regs: Record<number, number>, addrs: number[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const a of addrs) {
    const v = regs[a];
    if (typeof v === 'number' && Number.isFinite(v)) out[String(a)] = v;
  }
  return out;
}

function headBlock(h: Tone25HeadSpec, live?: Record<string, number>) {
  return {
    code: h.code,
    key: h.key,
    display: h.display,
    category: h.category,
    power: h.power,
    sourceTag: h.sourceTag,
    topology: h.topology,
    gainLimitDb: h.gainLimit,
    n1Hz: h.n1Hz,
    n5Hz: h.n5Hz,
    n8MaeDb: h.n8Mae,
    clip: h.clip,
    n1: h.n1.map(decodeBand),
    n4: h.n4.map(decodeBand),
    n5: h.n5.map(decodeBand),
    n8: h.n8.map(decodeBand),
    baseRegs: h.baseRegs,
    ...(live ? { liveRegs: live } : {}),
  };
}

function cabBlock(c: Tone25CabSpec, live?: Record<string, number>) {
  return {
    code: c.code,
    key: c.key,
    top: c.top,
    sub: c.sub,
    category: c.category,
    sourceTag: c.sourceTag,
    fitMaeDb: c.mae,
    f0Hz: c.f0Hz,
    bands: c.bands.map(decodeBand),
    ...(live ? { liveRegs: live } : {}),
  };
}

function headCsv(): string {
  const rows = [
    ['code', 'key', 'display', 'category', 'power', 'gain_limit_db', 'n1_hpf_hz', 'n5_lpf_hz',
      'bass_type', 'bass_hz', 'mid_type', 'mid_hz', 'treble_type', 'treble_hz',
      'presence_type', 'presence_hz', 'n8_mae_db'],
  ];
  for (const h of TONE25_HEADS) {
    const n4 = h.n4.map(decodeBand);
    rows.push([
      h.code, h.key, h.display, h.category, String(h.power), String(h.gainLimit),
      String(h.n1Hz), String(h.n5Hz),
      n4[1].type, String(n4[1].freqHz), n4[2].type, String(n4[2].freqHz),
      n4[0].type, String(n4[0].freqHz), n4[3].type, String(n4[3].freqHz),
      String(h.n8Mae),
    ]);
  }
  return rows.map((r) => r.map((v) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(',')).join('\n');
}

function cabCsv(): string {
  const rows = [
    ['code', 'key', 'config', 'name', 'category', 'f0_hz', 'mae_db', 'band', 'type', 'freq_hz', 'gain_db', 'q', 's', 'word_hex'],
  ];
  for (const c of TONE25_CABS) {
    for (let i = 0; i < c.bands.length; i++) {
      const b = decodeBand(c.bands[i]);
      rows.push([
        c.code, c.key, c.top, c.sub, c.category, String(c.f0Hz), String(c.mae),
        String(i + 1), b.type, String(b.freqHz), String(b.gainDb),
        b.q === null ? '' : String(b.q), b.s === null ? '' : String(b.s), b.wordHex,
      ]);
    }
  }
  return rows.map((r) => r.map((v) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(',')).join('\n');
}

function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

export interface ParamExportOptions {
  scope: 'current' | 'all';
  ampKey?: string;
  cabKey?: string;
  regs: Record<number, number>;
}

export async function exportParams(opts: ParamExportOptions): Promise<{ ok: boolean; message: string }> {
  const amp = TONE25_HEADS.find((h) => h.key === opts.ampKey) ?? TONE25_HEADS[0];
  const cab = TONE25_CABS.find((c) => c.key === opts.cabKey) ?? TONE25_CABS[0];
  const all = opts.scope === 'all';
  const liveAmp = regsOf(opts.regs, AMP_PARAM_ADDRS);
  const liveCab = regsOf(opts.regs, CAB_PARAM_ADDRS);
  const payload = {
    schema: 'bfx1.tone25.params.v1',
    exportedAt: new Date().toISOString(),
    scope: opts.scope,
    devices: {
      amp: headBlock(amp, liveAmp),
      cab: cabBlock(cab, liveCab),
    },
    heads: all ? TONE25_HEADS.map((h) => headBlock(h)) : [headBlock(amp, liveAmp)],
    cabs: all ? TONE25_CABS.map((c) => cabBlock(c)) : [cabBlock(cab, liveCab)],
  };
  const ts = stamp();
  const prefix = all ? 'BFX1_tone25_all' : 'BFX1_tone25_current';
  const files: FilePayload[] = [
    { filename: `${prefix}_${ts}.json`, content: JSON.stringify(payload, null, 1), mime: 'application/json' },
    { filename: `${prefix}_heads_${ts}.csv`, content: headCsv(), mime: 'text/csv' },
    { filename: `${prefix}_cabs_${ts}.csv`, content: cabCsv(), mime: 'text/csv' },
  ];

  const res = await saveFilesNative(files, 'BFX1/params');
  if (res.ok) return { ok: true, message: res.message };

  /* Web 调试回退：浏览器直接下载；不做假的成功提示。 */
  try {
    for (const f of files) {
      const blob = new Blob([f.content], { type: f.mime || 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = f.filename;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.setTimeout(() => URL.revokeObjectURL(url), 4000);
    }
    return { ok: true, message: `已触发 ${files.length} 个文件下载` };
  } catch (e: any) {
    return { ok: false, message: res.message || `导出失败：${e?.message || e}` };
  }
}
