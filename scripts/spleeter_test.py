# Validate the spleeter ONNX model contract + layout before porting to JS.
# Builds a small test mix, runs the 4 mask models, resynthesizes stems and
# checks sum(stems) ~= mix (the author's key assertion).

import os
import numpy as np
import onnxruntime as ort

N_FFT = 4096
HOP = 1024
BINS = N_FFT // 2 + 1  # 2049
PAD = N_FFT - HOP      # 3072
T = 512                # frames per split
F = 1024               # bins the net models
WINDOW = np.hanning(N_FFT + 1)[:-1].astype(np.float64)

BASE = os.path.expanduser("C:/Users/FAY/AppData/Local/Temp/spleeter_onnx")
STEMS = ["vocals", "drums", "bass", "other"]
EPS = 1e-10


def n_frames_for(n):
    return int(np.ceil((PAD + n) / HOP))


def stft(x):
    n = len(x)
    n_frames = n_frames_for(n)
    padded = np.zeros((n_frames - 1) * HOP + N_FFT, dtype=np.float64)
    padded[PAD:PAD + n] = x
    idx = np.arange(N_FFT)[None, :] + HOP * np.arange(n_frames)[:, None]
    return np.fft.rfft(padded[idx] * WINDOW, axis=-1)


def istft(spec, length):
    frames = np.fft.irfft(spec, n=N_FFT, axis=-1)
    n_frames = frames.shape[0]
    total = (n_frames - 1) * HOP + N_FFT
    out = np.zeros(total, dtype=np.float64)
    wsum = np.zeros(total, dtype=np.float64)
    for i in range(n_frames):
        at = i * HOP
        out[at:at + N_FFT] += frames[i] * WINDOW
        wsum[at:at + N_FFT] += WINDOW ** 2
    out = np.divide(out, wsum, out=np.zeros_like(out), where=wsum > 1e-8)
    return out[PAD:PAD + length]


def test_layout():
    """Feed [1,2,512,1024] and a dynamic-time variant; report what works."""
    sess = ort.InferenceSession(
        os.path.join(BASE, "spleeter-5stem-vocals-logits-fp16.onnx"),
        providers=["CPUExecutionProvider"],
    )
    for shape in ([1, 2, 512, 1024], [1, 2, 128, 1024], [2, 512, 1024]):
        try:
            x = np.random.rand(*shape).astype(np.float32)
            out = sess.run(["y"], {"x": x})[0]
            print(f"shape {shape} -> ok out {out.shape} range [{out.min():.3f},{out.max():.3f}]")
        except Exception as e:
            print(f"shape {shape} -> FAIL {str(e)[:120]}")


def separate(wave):
    """wave: [n, 2] float64."""
    n = len(wave)
    spec = np.stack([stft(wave[:, c]) for c in range(wave.shape[1])])  # [2, frames, 2049]
    frames = spec.shape[1]
    splits = int(np.ceil(frames / T))
    mag = np.zeros((2, splits * T, F), dtype=np.float32)
    mag[:, :frames] = np.abs(spec[:, :, :F])
    net_in = mag.reshape(2, splits, T, F).transpose(1, 0, 2, 3)  # -> [splits,2,T,F]? or keep [2,splits,T,F]

    # Try model as [batch, channels, time, freq] with batch=1 per split
    estimates = {}
    for stem in STEMS:
        sess = ort.InferenceSession(
            os.path.join(BASE, f"spleeter-5stem-{stem}-logits-fp16.onnx"),
            providers=["CPUExecutionProvider"],
        )
        out_list = []
        for s in range(splits):
            chunk = net_in[s] if net_in.ndim == 4 and net_in.shape[0] == splits else net_in[:, s]
            # chunk shape should be [2, T, F]
            inp = chunk[np.newaxis, ...]  # [1,2,T,F]
            o = sess.run(["y"], {"x": inp})[0]
            out_list.append(o)
        out = np.concatenate(out_list, axis=2)  # [1,2, splits*T, F]
        estimates[stem] = out[0, :, :frames, :]  # [2, frames, F]

    total = sum(np.abs(e) ** 2 for e in estimates.values()) + EPS
    stems = {}
    for stem, e in estimates.items():
        m = (np.abs(e) ** 2 + EPS / len(estimates)) / total
        extra = BINS - F
        pad = np.concatenate([m, np.repeat(m.mean(axis=-1, keepdims=True), extra, axis=-1)], axis=-1)
        masked = spec * pad
        stems[stem] = np.stack([istft(masked[c], n) for c in range(2)], axis=-1)
    return stems


def main():
    print("== layout probe ==")
    test_layout()

    print("\n== full pipeline on 2.5s test mix ==")
    sr = 44100
    n = int(sr * 2.5)
    t = np.arange(n) / sr
    mix = np.zeros((n, 2), dtype=np.float64)
    mix[:, 0] = 0.4 * np.sin(2 * np.pi * 440 * t) + 0.3 * np.sin(2 * np.pi * 110 * t) + 0.2 * np.random.randn(n)
    mix[:, 1] = 0.4 * np.sin(2 * np.pi * 523 * t) + 0.3 * np.sin(2 * np.pi * 82 * t) + 0.2 * np.random.randn(n)
    stems = separate(mix)
    total = sum(stems.values())
    err = np.abs(total - mix).max()
    rms = 10 * np.log10(np.mean((total - mix) ** 2) / np.mean(mix ** 2) + 1e-20)
    print(f"sum(stems) vs mix: max err {err:.2e}  residual {rms:.1f} dB")
    for k, v in stems.items():
        print(f"  {k:<7} peak {np.abs(v).max():.3f}")


if __name__ == "__main__":
    main()
