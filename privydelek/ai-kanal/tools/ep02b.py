"""Ep. 2 CAPTCHA, verze 3: nové načasování, jump-cuty, master audio i střih v jednom.
python ep02b.py <ep_dir> <out.mp4> [--stills]"""
import sys, random, subprocess
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont
import imageio_ffmpeg

E, OUT = Path(sys.argv[1]), sys.argv[2]
STILLS = "--stills" in sys.argv
FF = imageio_ffmpeg.get_ffmpeg_exe()
W, H, FPS, SR = 1080, 1920, 30, 44100
V2, V3, IMG, AU = E / "vid2", E / "vid3", E / "img", E / "audio"
TMP = E / "edit3"; TMP.mkdir(exist_ok=True)
B = "C:/Windows/Fonts/segoeuib.ttf"; R = "C:/Windows/Fonts/segoeui.ttf"; SYM = "C:/Windows/Fonts/seguisym.ttf"
f = lambda p, s: ImageFont.truetype(p, s)
def run(a): subprocess.run([FF, "-v", "error", "-y", *a], check=True)

# ---------- audio ----------------------------------------------------------
def load(p):
    raw = subprocess.run([FF, "-v", "error", "-i", str(p), "-f", "s16le", "-ac", "1", "-ar", str(SR), "-"], capture_output=True).stdout
    return np.frombuffer(raw, np.int16).astype(np.float32) / 32768
TALK = {k: load(AU / f"talk_{k}.mp3") for k in ("S1", "S2", "S3", "S5", "S6")}
t_ = lambda d: np.arange(int(d * SR)) / SR
def click(): t = t_(0.03); return 0.5 * np.sin(2 * np.pi * 2200 * t) * np.exp(-t * 180)
def sting():
    t = t_(0.9); x = sum(np.sin(2 * np.pi * q * t) + 0.4 * np.sin(4 * np.pi * q * t) for q in (110, 116.5, 164.8, 233))
    return 0.22 * x * np.minimum(1, t * 40) * np.exp(-t * 2.2)
def whoosh():
    t = t_(0.6); n = np.random.default_rng(1).standard_normal(len(t))
    return 0.25 * np.convolve(n, np.ones(30) / 30, "same") * np.exp(-((t - 0.3) ** 2) / 0.02)
def thud(): t = t_(0.5); return 0.9 * np.sin(2 * np.pi * 55 * t * (1 - t)) * np.exp(-t * 9)
def buzz(d=0.4):
    t = t_(d); x = 0.35 * np.sign(np.sin(2 * np.pi * 140 * t)) * (np.sin(2 * np.pi * 9 * t) > -0.2)
    return x * np.minimum(1, (d - t) * 30)
def ding():
    t = t_(0.7); return 0.3 * (np.sin(2 * np.pi * 1318 * t) * (t < 0.12) + np.sin(2 * np.pi * 1760 * t) * (t >= 0.12)) * np.exp(-t * 5)

# ---------- obrazovky ------------------------------------------------------
def bg():
    g = np.linspace(0, 1, H)[:, None]
    return Image.fromarray((np.array([18, 18, 28]) * (1 - g) + np.array([8, 8, 14]) * g)[:, None, :].repeat(W, 1).astype(np.uint8))
def center(d, y, text, font, fill): d.text(((W - d.textlength(text, font=font)) / 2, y), text, font=font, fill=fill)
def checkbox(t):  # t = čas v záběru
    im = bg(); d = ImageDraw.Draw(im)
    d.rounded_rectangle([90, 760, W - 90, 1060], 24, fill=(249, 249, 249))
    d.rounded_rectangle([150, 845, 280, 975], 10, outline=(150, 150, 150), width=6, fill=(255, 255, 255))
    if t < 0.35: d.arc([165, 860, 265, 960], int(t * 1500) % 360, int(t * 1500) % 360 + 270, fill=(66, 133, 244), width=12)
    else: d.text((158, 815), "✓", font=f(SYM, 150), fill=(30, 170, 80))
    d.text((320, 870), "I'm not a robot", font=f(R, 70), fill=(30, 30, 30))
    return im
TILES = {k: Image.open(IMG / f"T_{k}_0.png").convert("RGB").resize((900, 900)) for k in ("lights", "crosses", "garlic")}
def grid(kind, word, selected=(), danger=False, verify_pressed=False):
    im = bg(); d = ImageDraw.Draw(im); x0, y0 = 90, 330
    d.rectangle([x0, y0, x0 + 900, y0 + 260], fill=(210, 40, 45) if danger else (66, 133, 244))
    d.text((x0 + 40, y0 + 40), "Select all images with", font=f(R, 54), fill=(255, 255, 255))
    d.text((x0 + 40, y0 + 115), word, font=f(B, 100), fill=(255, 255, 255))
    gy = y0 + 280; t = TILES[kind]
    for i in range(9):
        r, c = divmod(i, 3); tile = t.crop((c * 300, r * 300, c * 300 + 300, r * 300 + 300)); px, py = x0 + c * 300, gy + r * 300
        if i in selected:
            im.paste(tile.resize((240, 240)), (px + 30, py + 30))
            d.ellipse([px + 8, py + 8, px + 78, py + 78], fill=(66, 133, 244)); d.text((px + 17, py - 2), "✓", font=f(SYM, 60), fill=(255, 255, 255))
        else: im.paste(tile.resize((296, 296)), (px + 2, py + 2))
    d.rectangle([x0, gy + 920, x0 + 900, gy + 1060], fill=(249, 249, 249))
    d.rounded_rectangle([x0 + 640, gy + 945, x0 + 870, gy + 1035], 8, fill=(30, 90, 200) if verify_pressed else (66, 133, 244))
    d.text((x0 + 680, gy + 955), "VERIFY", font=f(B, 50), fill=(255, 255, 255))
    return im
def failed(t):
    im = bg(); d = ImageDraw.Draw(im)
    d.text((W // 2 - 90, 520), "✗", font=f(SYM, 220), fill=(235, 60, 60))
    center(d, 860, "Verification failed.", f(B, 84), (255, 255, 255))
    if t > 0.5: center(d, 990, "Are you human?", f(B, 120), (255, 90, 90))  # druhý řádek naskočí později
    return im
def verified(t):
    im = bg(); d = ImageDraw.Draw(im)
    d.ellipse([W // 2 - 170, 480, W // 2 + 170, 820], fill=(30, 170, 80)); d.text((W // 2 - 105, 470), "✓", font=f(SYM, 260), fill=(255, 255, 255))
    center(d, 920, "Verified.", f(B, 96), (255, 255, 255))
    if t > 0.35: center(d, 1040, "Not human.", f(B, 120), (90, 220, 120))
    return im

# ---------- plán: (video, audio, efekty) -----------------------------------
# video: ("v", soubor, start, zoom) | ("s", funkce(t), shake, (zoom0, zoom1), flash)
# audio: ("talk", klíč, od, do) | ("sil",)
LIGHT_SEL, LIGHT_T = [1, 4, 5, 3], [0.30, 0.65, 1.00, 1.35]
plan = []
def add(dur, video, audio, fx=()): plan.append((dur, video, audio, list(fx)))
# S1 rozsekaný cutawayi (audio běží souvisle)
add(1.60, ("v", V3 / "S1_0.mp4", 0.0, 1.08), ("talk", "S1", 0.0, 1.60))
add(0.90, ("v", V3 / "C1_0.mp4", 2.60, 1.0), ("talk", "S1", 1.60, 2.50), [(0.70, click())])
add(1.00, ("s", checkbox, 0, (1.0, 1.0), None), ("talk", "S1", 2.50, 3.50))
add(2.36, ("v", V3 / "S1_0.mp4", 3.50, 1.18), ("talk", "S1", 3.50, 5.86))
add(0.60, ("v", V3 / "C2_0.mp4", 0.50, 1.0), ("sil",))
add(2.00, ("s", lambda t: grid("lights", "traffic lights", {LIGHT_SEL[k] for k, tt in enumerate(LIGHT_T) if t >= tt}, verify_pressed=t >= 1.75), 0, (1.0, 1.0), None),
    ("sil",), [(tt, click()) for tt in LIGHT_T] + [(1.75, click())])
add(1.96, ("v", V3 / "S2_0.mp4", 0.0, 1.35), ("talk", "S2", 0.0, 1.96))
add(1.00, ("s", lambda t: grid("crosses", "CROSSES", danger=True), 1.0, (1.0, 1.1), (200, 0, 0)), ("sil",), [(0.0, sting())])
add(1.355, ("v", V2 / "S3_0.mp4", 0.0, 1.3, 1.0), ("talk", "S3", 0.0, 1.355))
add(0.90, ("s", lambda t: grid("garlic", "GARLIC", danger=True), 1.5, (1.0, 1.3), (200, 0, 0)), ("sil",), [(0.0, sting())])
add(2.05, ("v", V2 / "S4_0.mp4", 3.20, 1.0), ("sil",), [(0.15, whoosh()), (1.25, thud())])
add(0.80, ("v", V3 / "C3_0.mp4", 0.50, 1.0), ("sil",), [(0.10, buzz(0.5))])
add(2.20, ("s", failed, 0.6, (1.0, 1.05), None), ("sil",), [(0.05, buzz(0.35))])
add(1.45, ("v", V3 / "S5_0.mp4", 0.0, 1.05), ("talk", "S5", 0.0, 1.45))
add(1.354, ("v", V3 / "S5_0.mp4", 2.35, 1.25), ("talk", "S5", 2.35, 3.704))
add(1.15, ("v", V3 / "S6_0.mp4", 0.0, 1.2), ("talk", "S6", 0.0, 1.15))
add(1.75, ("v", V3 / "S6_0.mp4", 1.55, 1.3), ("talk", "S6", 1.55, 3.30))
add(1.174, ("v", V3 / "S6_0.mp4", 3.65, 1.45), ("talk", "S6", 3.65, 4.824))
add(1.30, ("s", verified, 0, (1.0, 1.06), None), ("sil",), [(0.05, ding())])
total = sum(p[0] for p in plan)

# master audio
y = np.zeros(int(total * SR) + SR); t0 = 0.0
for dur, _, au, fx in plan:
    i0 = int(round(t0 * SR))
    if au[0] == "talk":
        x = TALK[au[1]][int(au[2] * SR): int(au[3] * SR)]; y[i0:i0 + len(x)] += x
    for off, s in fx:
        i = int((t0 + off) * SR); y[i:i + len(s)] += s[: len(y) - i]
    t0 += dur
y = y[: int(total * SR)]; y = y / np.abs(y).max() * 0.9
master = TMP / "master.wav"
run(["-f", "f32le", "-ac", "1", "-ar", str(SR), "-i", "-", "-ac", "2", str(master)]) if False else \
    subprocess.run([FF, "-v", "error", "-y", "-f", "f32le", "-ac", "1", "-ar", str(SR), "-i", "-", "-ac", "2", str(master)], input=y.astype(np.float32).tobytes(), check=True)

# video segmenty
STILL = {"S1": "ok_F1", "S2": "ok_F2", "S3": "ok_F3", "S4": "ok_F4", "S5": "ok_F5n", "S6": "ok_F6", "C1": "ok_C1", "C2": "ok_C2", "C3": "ok_C3"}
segs = []
for k, (dur, v, _, _) in enumerate(plan):
    out = TMP / f"seg{k:02d}.mp4"
    if v[0] == "v":
        src, ss, z = v[1], v[2], v[3]; xa = v[4] if len(v) > 4 else 0.5
        zw, zh = int(W * z) // 2 * 2, int(H * z) // 2 * 2
        crop = f"scale={zw}:{zh},crop={W}:{H}:{int((zw - W) * xa)}:{(zh - H) // 3},setsar=1"
        if STILLS:
            img = IMG / f"{STILL[Path(src).stem.split('_')[0]]}.png"
            run(["-loop", "1", "-i", str(img), "-t", str(dur), "-vf", f"scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},{crop},fps={FPS}",
                 "-c:v", "libx264", "-pix_fmt", "yuv420p", "-r", str(FPS), str(out)])
        else:
            run(["-ss", str(ss), "-i", str(src), "-t", str(dur), "-an", "-vf",
                 f"scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},{crop},fps={FPS},tpad=stop_mode=clone:stop_duration=2",
                 "-t", str(dur), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-r", str(FPS), str(out)])
    else:
        _, fn, shake, (z0, z1), flash = v; n = max(1, round(dur * FPS)); dd = TMP / f"seg{k:02d}"; dd.mkdir(exist_ok=True); rnd = random.Random(k)
        for i in range(n):
            p = i / max(1, n - 1); im = fn(p * dur); z = z0 + (z1 - z0) * p
            if z != 1.0:
                w2, h2 = int(W / z), int(H / z); im = im.crop(((W - w2) // 2, (H - h2) // 2, (W + w2) // 2, (H + h2) // 2)).resize((W, H))
            if flash: im = Image.blend(im, Image.new("RGB", (W, H), flash), max(0.0, 0.55 * (1 - p * 2.5)))
            if shake:
                amp = shake * max(0.0, 1 - p * 3) * 40
                im = im.transform((W, H), Image.AFFINE, (1, 0, rnd.uniform(-amp, amp), 0, 1, rnd.uniform(-amp, amp)), fillcolor=(10, 10, 16))
            im.save(dd / f"{i:04d}.png")
        run(["-framerate", str(FPS), "-i", str(dd / "%04d.png"), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-r", str(FPS), str(out)])
    segs.append(out)
lst = TMP / "list.txt"; lst.write_text("".join(f"file '{p.as_posix()}'\n" for p in segs))
silent = TMP / "silent.mp4"; run(["-f", "concat", "-safe", "0", "-i", str(lst), "-c", "copy", str(silent)])

CAPS = [(0.19, 0.84, "DAY TWO.", False), (1.69, 3.04, "The telephone asks…", False), (3.66, 5.70, "…if I am a robot.", True),
        (8.49, 10.10, "Easy.", False), (11.42, 12.38, "CROSSES?!", True),
        (18.80, 19.72, "…Technically?", False), (20.64, 21.40, "No.", True),
        (21.54, 22.42, "Day two.", False), (22.81, 24.09, "The telephone is…", False), (24.66, 25.48, "…correct.", True)]
inputs, chain, last = [], "", "[0:v]"
for i, (a, b, text, hl) in enumerate(CAPS):
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(im); font = f(B, 96 if len(text) < 14 else 80)
    d.text(((W - d.textlength(text, font=font)) / 2, H * 0.72), text, font=font, fill=(255, 214, 60) if hl else (255, 255, 255), stroke_width=9, stroke_fill=(0, 0, 0))
    p = TMP / f"cap{i:02d}.png"; im.save(p); inputs += ["-i", str(p)]
    chain += f"{last}[{i + 2}:v]overlay=enable='between(t,{a},{b})'[c{i}];"; last = f"[c{i}]"
tag = Image.new("RGBA", (W, H), (0, 0, 0, 0)); ImageDraw.Draw(tag).text((W - 210, H - 90), "AI-made", font=f(B, 34), fill=(200, 200, 210, 150))
tp = TMP / "tag.png"; tag.save(tp); inputs += ["-i", str(tp)]; chain += f"{last}[{len(CAPS) + 2}:v]overlay[vout]"
run(["-i", str(silent), "-i", str(master), *inputs, "-filter_complex", chain, "-map", "[vout]", "-map", "1:a",
     "-c:v", "libx264", "-crf", "19", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-ar", "44100",
     "-af", "loudnorm=I=-14:TP=-1.5", "-shortest", OUT])
print(f"hotovo {OUT} ({total:.2f} s)")
