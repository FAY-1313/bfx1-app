# -*- coding: utf-8 -*-
"""BFX1 鼓机 CC0 采样预处理: 5 套 -> mono 16-bit WAV (保持原采样率), 去静音头尾 + 短淡出封顶.
输出到 UI03/src/assets/drum/<kit>/<piece>.wav  (piece 名与 DRUM_DEFS 对齐).
缺失鼓件(映射表内无文件)不生成 -> App 端对该件自动走合成兜底.
"""
import os, wave, soundfile as sf
import numpy as np

SRC = os.path.join(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(os.path.dirname(SRC), 'src', 'assets', 'drum')

# 每套的映射: 鼓件 -> 源文件名; 未列的鼓件 = 无真实采样(合成兜底)
MAPS = {
    'rock': {
        'kick': 'kick.flac', 'snare': 'snare.flac', 'hihat': 'hihat.flac',
        'openhat': 'openhat.flac', 'tom': 'floortom.flac', 'crash': 'crash.flac',
    },
    'hiphop': {
        'kick': 'kick.wav', 'snare': 'snare.wav', 'hihat': 'hihat.wav',
        'openhat': 'openhat.wav', 'clap': 'clap.wav',
    },
    'funk': {
        'kick': 'kick.wav', 'snare': 'snare.wav', 'hihat': 'hihat.wav',
        'openhat': 'openhat.wav', 'clap': 'clap.wav', 'tom': 'tom.wav',
        'crash': 'crash.wav', 'shaker': 'tambourine.wav',
    },
    'house': {
        'kick': 'kick.wav', 'snare': 'snare.wav', 'hihat': 'hihat.wav',
        'openhat': 'openhat.wav', 'clap': 'clap.wav', 'tom': 'tom.wav',
        'crash': 'crash.wav', 'shaker': 'shaker.wav',
    },
    'lofi': {
        'kick': 'kick.flac', 'snare': 'snare.flac', 'hihat': 'hihat.flac',
        'openhat': 'openhat.flac', 'tom': 'floortom.flac', 'crash': 'crash.flac',
        'shaker': 'shaker.wav',
    },
}

# 每个鼓件的最长保留秒数 (打击衰减尾封顶, 超长尾做 12ms 淡出防爆音)
MAXDUR = {'kick': 1.2, 'snare': 1.0, 'hihat': 0.5, 'openhat': 1.4, 'clap': 1.0,
          'tom': 1.4, 'crash': 3.2, 'shaker': 1.0}
GATE = 0.004      # 去静音阈值 (相对峰值)
PAD_S, PAD_E = 0.005, 0.02  # 头/尾保留小段

def process(kit, piece, fn, out_dir):
    data, sr = sf.read(os.path.join(SRC, kit, fn), dtype='float32', always_2d=True)
    if data.ndim > 1 and data.shape[1] > 1:
        data = data.mean(axis=1)
    else:
        data = data[:, 0]
    data = np.asarray(data, dtype=np.float32)
    peak = float(np.max(np.abs(data))) or 1.0
    data = data / peak * 0.95                      # 归一 0.95
    # 去静音
    idx = np.where(np.abs(data) > GATE)[0]
    if idx.size == 0:
        print('  !! 全静音, 跳过', kit, piece, fn); return
    a = max(0, int(idx[0]) - int(PAD_S * sr))
    b = min(len(data), int(idx[-1]) + int(PAD_E * sr))
    data = data[a:b]
    # 封顶
    cap = int(MAXDUR.get(piece, 1.5) * sr)
    if len(data) > cap:
        tail = int(0.012 * sr)
        fade = np.linspace(1.0, 0.0, tail, dtype=np.float32)
        data = data[:cap].copy()
        data[cap - tail:] *= fade
    # 写 16-bit PCM WAV
    os.makedirs(out_dir, exist_ok=True)
    pcm = (np.clip(data, -1, 1) * 32767).astype('<i2')
    with wave.open(os.path.join(out_dir, piece + '.wav'), 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr)
        w.writeframes(pcm.tobytes())
    return len(data) / sr

total = 0
for kit, mp in MAPS.items():
    out_dir = os.path.join(OUT, kit)
    print(f'== {kit} ==')
    for piece, fn in mp.items():
        try:
            dur = process(kit, piece, fn, out_dir)
            sz = os.path.getsize(os.path.join(out_dir, piece + '.wav'))
            total += sz
            print(f'  {piece:8s} <- {fn:22s} {dur:.2f}s  {sz//1024}KB')
        except Exception as e:
            print('  !! 失败', kit, piece, fn, repr(e))
print(f'完成, 总 {total/1024:.0f} KB')
