#!/usr/bin/env python
"""生成 20 秒测试音频 (混合和弦+噪声+鼓点), 用于端到端验证 /split 分轨."""
import math
import random
import struct
import wave

SR = 44100
DUR = 20.0
OUT = "test_stem_input.wav"
random.seed(42)

FRAMES = int(SR * DUR)
samples_l = [0.0] * FRAMES
samples_r = [0.0] * FRAMES

def add(freq, amp, t0, t1, pan=0.0):
    """加一段正弦音 (pan: -1 左 1 右)."""
    for i in range(int(t0 * SR), min(int(t1 * SR), FRAMES)):
        v = amp * math.sin(2 * math.pi * freq * i / SR)
        samples_l[i] += v * (1.0 - max(0.0, pan)) * 0.5 + v * 0.5
        samples_r[i] += v * (1.0 + max(0.0, -pan)) * 0.5 + v * 0.5

def kick(t0):
    """底鼓: 50Hz 衰减."""
    for i in range(int(t0 * SR), int((t0 + 0.15) * SR)):
        if i >= FRAMES: break
        env = math.exp(-6 * (i - t0 * SR) / SR)
        v = 0.8 * env * math.sin(2 * math.pi * 50 * i / SR)
        samples_l[i] += v; samples_r[i] += v

def hihat(t0):
    """踩镲: 高频噪声衰减."""
    for i in range(int(t0 * SR), int((t0 + 0.08) * SR)):
        if i >= FRAMES: break
        env = math.exp(-30 * (i - t0 * SR) / SR)
        v = 0.25 * env * (random.random() * 2 - 1)
        samples_l[i] += v; samples_r[i] += v

# 简单和弦进行 (人声/钢琴类内容)
chords = [0, 3, 5, 7]  # 半音偏移
for bar in range(8):
    base = bar * 2.5
    for k, sem in enumerate(chords):
        freq = 220.0 * (2 ** (sem / 12.0))
        add(freq, 0.12, base + k * 0.4, base + k * 0.4 + 1.6)
        add(freq / 2, 0.15, base, base + 2.0, pan=0.3)

# 贝斯线 (低频)
for bar in range(8):
    freq = 110.0 * (2 ** ([0, 0, 3, 5][bar % 4] / 12.0))
    add(freq, 0.30, bar * 2.5, bar * 2.5 + 2.0, pan=-0.4)

# 鼓点 (底鼓 4 拍 + 踩镲 8 分)
for bar in range(8):
    for beat in range(4):
        kick(bar * 2.5 + beat * 0.625)
    for half in range(8):
        hihat(bar * 2.5 + half * 0.3125)

# 噪声垫底 ("other" 类内容)
for i in range(FRAMES):
    n = 0.03 * (random.random() * 2 - 1)
    samples_l[i] += n; samples_r[i] += n

# 限幅 + 写 wav
def clamp(x):
    return max(-0.95, min(0.95, x))

with wave.open(OUT, "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    frames = bytearray()
    for i in range(FRAMES):
        frames += struct.pack("<hh", int(clamp(samples_l[i]) * 32767), int(clamp(samples_r[i]) * 32767))
    w.writeframes(bytes(frames))

print(f"OK {OUT} {DUR}s {FRAMES} frames")
