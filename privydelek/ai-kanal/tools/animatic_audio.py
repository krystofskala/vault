"""Složí repliky + zvukové efekty do zvukového animatiku: python animatic_audio.py <dir> <model> <out.wav>"""
import sys, subprocess, json, numpy as np, imageio_ffmpeg
from pathlib import Path
d, model, out = Path(sys.argv[1]), sys.argv[2], sys.argv[3]
SR = 44100
FF = imageio_ffmpeg.get_ffmpeg_exe()
def load(p):
    raw = subprocess.run([FF, "-v", "error", "-i", str(p), "-f", "s16le", "-ac", "1", "-ar", str(SR), "-"], capture_output=True).stdout
    x = np.frombuffer(raw, np.int16).astype(np.float32) / 32768
    nz = np.where(np.abs(x) > 0.01)[0]                   # ořez ticha na krajích
    return x[max(nz[0] - 800, 0): nz[-1] + 2000] if len(nz) else x
def sil(s): return np.zeros(int(s * SR))
def buzz(dur=0.32):                                      # „Face not recognized“ chybové bzučení
    t = np.arange(int(dur * SR)) / SR
    x = 0.35 * np.sign(np.sin(2 * np.pi * 140 * t)) * (np.sin(2 * np.pi * 9 * t) > -0.2)
    return x * np.minimum(1, (dur - t) * 30)
def thud():
    t = np.arange(int(0.5 * SR)) / SR
    return 0.9 * np.sin(2 * np.pi * 55 * t * (1 - t)) * np.exp(-t * 9)
L = {i: load(d / f"{model}_L{i}.mp3") for i in range(1, 7)}
seq = [("L1", L[1]), ("s", sil(0.15)), ("BUZZ1", buzz()), ("s", sil(0.1)), ("L2", L[2]), ("s", sil(0.1)),
       ("BUZZ2", buzz()), ("s", sil(0.15)), ("L3", L[3]), ("s", sil(0.05)), ("BUZZ3", buzz(0.25)),
       ("s", sil(1.1)), ("L4", L[4]), ("s", sil(0.5)), ("L5", L[5]), ("s", sil(0.1)), ("BUZZ4", buzz(0.45)),
       ("s", sil(0.4)), ("L6", L[6]), ("s", sil(0.15)), ("THUD", thud()), ("s", sil(0.6))]
t, marks = 0.0, []
for name, x in seq:
    if name != "s": marks.append((name, round(t, 2), round(t + len(x) / SR, 2)))
    t += len(x) / SR
y = np.concatenate([x for _, x in seq]); y = y / max(1e-6, np.abs(y).max()) * 0.9
subprocess.run([FF, "-v", "error", "-y", "-f", "f32le", "-ac", "1", "-ar", str(SR), "-i", "-", "-ac", "2", out], input=y.astype(np.float32).tobytes())
Path(out).with_suffix(".json").write_text(json.dumps(marks))
print(model, f"{t:.1f} s", marks)
