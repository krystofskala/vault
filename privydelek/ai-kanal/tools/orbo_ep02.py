"""Orbo „Meeting Notes“ (launch vs lunch). python orbo_ep02.py <scratch_dir> <out> [--preview]"""
import sys, math, subprocess
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageEnhance
import imageio_ffmpeg

S = Path(sys.argv[1]); OUT = sys.argv[2]; PREVIEW = "--preview" in sys.argv
sys.path.insert(0, str(S / "drakula-tools"))
import orbo_char as oc

FF = imageio_ffmpeg.get_ffmpeg_exe()
W, H, FPS, SR = 1080, 1920, 30, 48000
O = S / "orbo"; AU = O / "ep02" / "audio"; ST = O / "stock"; MU = O / "music"
B = "C:/Windows/Fonts/segoeuib.ttf"; R = "C:/Windows/Fonts/segoeui.ttf"
f = lambda p, s: ImageFont.truetype(p, s)
ease = lambda x: 0.5 - 0.5 * math.cos(math.pi * min(1, max(0, x)))
def back_out(x):
    x = min(1, max(0, x)); c = 1.7; return 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2

# ------------------------------------------------------------ audio
def load(p, start=0.0, dur=None):
    a = ["-v", "error", "-ss", str(start)] + (["-t", str(dur)] if dur else []) + ["-i", str(p), "-f", "s16le", "-ac", "1", "-ar", str(SR), "-"]
    return np.frombuffer(subprocess.run([FF, *a], capture_output=True).stdout, np.int16).astype(np.float32) / 32768
def trim(x):
    nz = np.where(np.abs(x) > 0.012)[0]; return x[max(nz[0] - 400, 0): nz[-1] + 1500] if len(nz) else x
LINES = {k: trim(load(AU / f"{k}.mp3")) for k in ("L1", "L2", "L3", "L4", "L5")}
dl = lambda k: len(LINES[k]) / SR

seg = []
def add(name, dur, **kw): seg.append(dict(name=name, dur=round(dur, 3), **kw))
add("ask", 2.0)
add("done", dl("L1") + 0.1, line="L1")
add("doc1", 4.0)
add("launch", 1.3)
add("panic", dl("L2") + 0.1, line="L2")
add("fixing", dl("L3") + 0.05, line="L3")
add("doc2", 2.0)
add("dots", 0.6)
add("toomuch", dl("L4") + 0.2, line="L4")
add("greg", 1.9)
add("approved", dl("L5") + 0.1, line="L5")
add("marketing", 3.1)
t = 0.0
for s in seg: s["t0"] = t; t += s["dur"]
TOTAL = t; SEG = {s["name"]: s for s in seg}

y = np.zeros(int((TOTAL + 1) * SR)); rng = np.random.default_rng(5)
def put(x, at, g=1.0):
    i = int(at * SR); n = min(len(x), len(y) - i); y[i:i + n] += x[:n] * g
tt = lambda d: np.arange(int(d * SR)) / SR
lp = lambda x, k: np.convolve(x, np.ones(k) / k, "same")
def pop():
    t_ = tt(0.08); return 0.5 * np.sin(2 * np.pi * (900 - 4000 * t_) * t_) * np.exp(-t_ * 40)
def send():
    t_ = tt(0.35); return lp(rng.standard_normal(len(t_)), 12) * np.sin(np.pi * t_ / 0.35) ** 2 * 0.45
def tick():
    t_ = tt(0.05); return 0.22 * np.sin(2 * np.pi * 2000 * t_) * np.exp(-t_ * 70)
def clacks(d):
    out = np.zeros(int(d * SR))
    for k in np.arange(0, d - 0.05, 0.07):
        c = lp(rng.standard_normal(int(0.02 * SR)), 2) * 0.25 * np.exp(-np.arange(int(0.02 * SR)) / 150); i = int(k * SR); out[i:i + len(c)] += c
    return out
def ding():
    t_ = tt(0.6); return 0.25 * (np.sin(2 * np.pi * 1318 * t_) * (t_ < 0.1) + np.sin(2 * np.pi * 1760 * t_) * (t_ >= 0.1)) * np.exp(-t_ * 6)
def music(p, start, dur, fade_out=0.5, gain=0.5):
    x = load(p, start, dur); x = x / (np.abs(x).max() + 1e-6); t_ = np.arange(len(x)) / SR
    return x * np.minimum(1, t_ / 0.03) * np.minimum(1, (len(x) / SR - t_) / fade_out) * gain

for s in seg:
    if "line" in s: put(LINES[s["line"]], s["t0"] + 0.08)
put(pop(), SEG["ask"]["t0"] + 0.1)
put(send(), SEG["done"]["t0"] + dl("L1") * 0.6)
for k in range(4): put(tick(), SEG["doc1"]["t0"] + 0.1 + k * 0.55)
put(pop(), SEG["launch"]["t0"] + 0.05)
put(music(MU / "toccata.mp3", 0.3, 3.0, fade_out=0.8, gain=0.5), SEG["panic"]["t0"] + 0.15)
put(clacks(SEG["fixing"]["dur"]), SEG["fixing"]["t0"], 0.9)
put(tick(), SEG["doc2"]["t0"] + 0.2)
put(pop(), SEG["dots"]["t0"] + 0.05)
put(ding(), SEG["greg"]["t0"] + 0.05)
put(pop(), SEG["marketing"]["t0"] + 0.05)
put(music(MU / "fluffing.mp3", 0.0, 2.9, fade_out=0.6, gain=0.4), SEG["marketing"]["t0"] + 0.1)
y = y[: int(TOTAL * SR)]; y = y / np.abs(y).max() * 0.9
mix = O / "ep02" / "mix.wav"
subprocess.run([FF, "-v", "error", "-y", "-f", "f32le", "-ac", "1", "-ar", str(SR), "-i", "-", "-ac", "2", str(mix)], input=y.astype(np.float32).tobytes(), check=True)
voice = np.zeros_like(y)
for s in seg:
    if "line" in s:
        i = int((s["t0"] + 0.08) * SR); x = LINES[s["line"]]; voice[i:i + len(x)] += x[: len(voice) - i]
hop = SR // FPS; nfr = int(TOTAL * FPS)
env = np.array([np.sqrt(np.mean(voice[i * hop:(i + 1) * hop] ** 2) + 1e-9) for i in range(nfr)]); env /= env.max()
amp = np.zeros_like(env)
for i in range(1, nfr): amp[i] = amp[i - 1] + (0.6 if env[i] > amp[i - 1] else 0.15) * (env[i] - amp[i - 1])

# ------------------------------------------------------------ grafika
def crop916(path, cx=0.5):
    im = Image.open(path).convert("RGB"); w, h = im.size; tw = int(h * W / H)
    if tw <= w: x = int((w - tw) * cx); im = im.crop((x, 0, x + tw, h))
    return im.resize((W, H), Image.LANCZOS)
OFFICE = ImageEnhance.Brightness(crop916(ST / "17.jpg", 0.45).filter(ImageFilter.GaussianBlur(4))).enhance(0.85)
OFFICE_DARK = ImageEnhance.Brightness(OFFICE.filter(ImageFilter.GaussianBlur(8))).enhance(0.5)

AV = {"Jen": ((120, 90, 200), "J"), "Greg (CEO)": ((220, 120, 40), "G")}
def chat_card(name, text, sub=""):
    fn = f(R, 54); lines, cur = [], ""
    d0 = ImageDraw.Draw(Image.new("RGB", (1, 1)))
    for wd in text.split():
        if d0.textlength((cur + " " + wd).strip(), font=fn) > 680: lines.append(cur); cur = wd
        else: cur = (cur + " " + wd).strip()
    lines.append(cur)
    h = 120 + 66 * len(lines) + (40 if sub else 0)
    c = Image.new("RGBA", (920, h + 12), (0, 0, 0, 0)); d = ImageDraw.Draw(c)
    d.rounded_rectangle([6, 10, 920, h + 10], 34, fill=(0, 0, 0, 60)); d.rounded_rectangle([0, 0, 910, h], 34, fill=(255, 255, 255, 246))
    col, ini = AV[name]; d.ellipse([28, 30, 128, 130], fill=col); d.text((78 - d.textlength(ini, font=f(B, 56)) / 2, 40), ini, font=f(B, 56), fill="white")
    d.text((160, 24), name, font=f(B, 40), fill=(40, 40, 50))
    yy = 78
    if sub: d.text((160, 76), sub, font=f(R, 30), fill=(120, 120, 130)); yy += 40
    for i, ln in enumerate(lines): d.text((160, yy + i * 66), ln, font=fn, fill=(20, 20, 30))
    if text.endswith("Approved"):  # zelená fajfka místo emoji
        lx = 160 + d.textlength(lines[-1] + " ", font=fn); ly = yy + (len(lines) - 1) * 66 + 6
        d.rounded_rectangle([lx, ly, lx + 52, ly + 52], 10, fill=(40, 170, 80)); d.line([(lx + 12, ly + 27), (lx + 23, ly + 39), (lx + 41, ly + 14)], fill="white", width=7)
    return c

def doc(title, bullets, n_shown, hl_word=None):
    D = Image.new("RGBA", (920, 1000), (0, 0, 0, 0)); d = ImageDraw.Draw(D)
    d.rounded_rectangle([10, 14, 920, 1000], 26, fill=(0, 0, 0, 70)); d.rounded_rectangle([0, 0, 905, 985], 26, fill=(255, 255, 255, 255))
    d.rounded_rectangle([0, 0, 905, 120], 26, fill=(66, 110, 230, 255)); d.rectangle([0, 90, 905, 120], fill=(66, 110, 230, 255))
    d.text((40, 30), "📄", font=f("C:/Windows/Fonts/seguiemj.ttf", 50), fill="white", embedded_color=True)
    d.text((115, 34), "Shared with: everyone", font=f(R, 40), fill=(230, 235, 255))
    fs = 64
    while d.textlength(title, font=f(B, fs)) > 800: fs -= 2
    tf = f(B, fs); x = 50; yy = 170
    for wd in title.split():
        colr = (220, 40, 50) if hl_word and wd.startswith(hl_word) else (25, 25, 35)
        d.text((x, yy), wd, font=tf, fill=colr); x += d.textlength(wd + " ", font=tf)
    d.line([(50, 260), (855, 260)], fill=(220, 220, 225), width=3)
    bf = f(R, 52); yy = 300
    for b in bullets[:n_shown]:
        words, cur, out = b.split(), "", []
        for wd in words:
            if d.textlength((cur + " " + wd).strip(), font=bf) > 740: out.append(cur); cur = wd
            else: cur = (cur + " " + wd).strip()
        out.append(cur)
        d.ellipse([55, yy + 24, 75, yy + 44], fill=(66, 110, 230))
        for i, ln in enumerate(out): d.text((100, yy + i * 64), ln, font=bf, fill=(30, 30, 40))
        yy += 64 * len(out) + 30
    return D

DOC1 = ("LUNCH MEETING: NOTES", ["Jen has a new thermos.", "It is green.", "Keeps coffee hot for 24 hours.", "Next steps: Jen refills thermos."])
DOC2 = ("LAUNCH MEETING: NOTES (v2)", ["Jen's thermos launches Friday."])

def caption(img, text):
    d = ImageDraw.Draw(img); fn = f(B, 72); tw = d.textlength(text, font=fn)
    d.text(((W - tw) / 2, 1420), text, font=fn, fill=(255, 255, 255), stroke_width=8, stroke_fill=(0, 0, 0))
CAPS = {"L1": ["Done!", "Sent to everyone!"], "L2": ["Oh no. Oh no.", "There's a difference?!"], "L3": ["Got it!", "Fixing!"],
        "L4": ["…Too much thermos?"], "L5": ["Approved!"]}

def place_orbo(canvas, x, y, scale, red=0.0, **p):
    o = oc.render(**p)
    if red > 0:
        r, g, b, al = o.split()
        o = Image.merge("RGBA", (r.point(lambda v: min(255, int(v * (1 + 0.9 * red) + 60 * red))), g.point(lambda v: int(v * (1 - 0.55 * red))), b.point(lambda v: int(v * (1 - 0.65 * red))), al))
    if scale != 1.0: o = o.resize((int(oc.SIZE * scale), int(oc.SIZE * scale)), Image.BILINEAR)
    sh = oc.shadow(); sh = sh.resize((int(sh.width * scale), int(sh.height * scale)))
    canvas.alpha_composite(sh, (int(x - sh.width / 2), int(y + 210 * scale * p.get("sy", 1) + 20 * scale)))
    canvas.alpha_composite(o, (int(x - o.width / 2), int(y - o.height / 2)))

def pop_in(card, lt):
    k = back_out(lt / 0.22); return card.resize((max(1, int(card.width * k)), max(1, int(card.height * k))))

def frame(fi):
    tg = fi / FPS
    s = next((x for x in seg if x["t0"] <= tg < x["t0"] + x["dur"]), seg[-1])
    lt = tg - s["t0"]; nm = s["name"]; a = float(amp[min(fi, nfr - 1)])
    blink = 1.0 if (tg % 3.3) < 0.09 else 0.0
    pr = dict(t=tg, amp=a, blink=blink)
    if nm in ("doc1", "doc2"):
        img = OFFICE_DARK.copy().convert("RGBA")
        title, bl = DOC1 if nm == "doc1" else DOC2
        n = min(len(bl), int((lt - 0.1) / 0.55) + 1) if nm == "doc1" else (1 if lt > 0.2 else 0)
        dc = doc(title, bl, max(0, n)); k = back_out(lt / 0.25); sc = 0.92 + 0.08 * k
        dc = dc.resize((int(dc.width * sc), int(dc.height * sc))); img.alpha_composite(dc, (int(W / 2 - dc.width / 2), 300))
        place_orbo(img, 860, 1560, 0.42, **pr, eye_shape="happy", glow=1.1)  # Orbo hrdě kouká zpoza dokumentu
    else:
        img = OFFICE.copy().convert("RGBA"); x, yy, sc = W / 2, 1060, 1.0
        if nm == "ask": pr.update(gaze=(0.2, -0.9))
        elif nm == "done": pr.update(eye_shape="happy" if a > 0.25 else "normal", glow=1.15, sy=1 + 0.06 * math.sin(lt * 12))
        elif nm == "launch": pr.update(gaze=(0.2, -0.9))
        elif nm == "panic":
            red = min(1, lt / 0.25); pr.update(eye_shape="worried", glow=1.25, red=red * (0.6 + 0.4 * math.sin(lt * 25)), sx=1 + 0.04 * math.sin(lt * 55)); x += 12 * math.sin(lt * 60)
        elif nm == "fixing": pr.update(yaw=0.35 * math.sin(lt * 18), gaze=(0.6 * math.sin(lt * 9), 0.4), glow=1.2)
        elif nm == "dots": pr.update(gaze=(0.2, -0.9), eye_shape="worried")
        elif nm == "toomuch": sc = 0.82 + 0.05 * math.sin(lt * 2); yy = 1120; pr.update(eye_shape="worried", glow=0.85, gaze=(-0.4, 0.3))
        elif nm == "greg": pr.update(gaze=(0.2, -0.9), glow=0.9 + 0.4 * ease(lt / 1.2))
        elif nm == "approved": sc = 1.1; pr.update(eye_shape="happy", glow=1.4, sy=1.05)
        elif nm == "marketing": sc = 1.1; pr.update(eye_shape="happy", glow=1.3)
        place_orbo(img, x, yy + 14 * math.sin(tg * 2.1), sc, **pr)
        card = None
        if nm in ("ask", "done"): card = chat_card("Jen", "Orbo, send everyone the launch meeting notes.")
        if nm in ("launch", "panic"): card = chat_card("Jen", "orbo. LAUNCH. not lunch.")
        if nm in ("dots", "toomuch"): card = chat_card("Jen", "…")
        if nm == "greg" or (nm == "approved"): card = chat_card("Greg (CEO)", "Great notes. Love the energy. Approved", sub="replied to all")
        if nm == "marketing": card = chat_card("Jen", "why is marketing asking for photos of my thermos")
        if card is not None:
            cl = lt if nm in ("ask", "launch", "dots", "greg", "marketing") else 1
            card = pop_in(card, cl); img.alpha_composite(card, (int(W / 2 - card.width / 2), 300))
    if "line" in s:
        p = (lt - 0.08) / dl(s["line"])
        if -0.02 < p < 1.05:
            ch = CAPS[s["line"]]; caption(img, ch[min(len(ch) - 1, int(max(0, p) * len(ch)))])
    ImageDraw.Draw(img).text((W - 200, H - 300), "AI-made", font=f(B, 30), fill=(255, 255, 255, 150))
    return np.asarray(img.convert("RGB"))

if PREVIEW:
    ts = [0.8, SEG["done"]["t0"] + 0.6, SEG["doc1"]["t0"] + 3.0, SEG["launch"]["t0"] + 0.7, SEG["panic"]["t0"] + 1.0, SEG["fixing"]["t0"] + 0.5,
          SEG["doc2"]["t0"] + 1.5, SEG["toomuch"]["t0"] + 0.8, SEG["greg"]["t0"] + 1.2, SEG["approved"]["t0"] + 0.4, SEG["marketing"]["t0"] + 1.0, TOTAL - 0.1]
    tiles = [Image.fromarray(frame(int(x * FPS))).resize((270, 480)) for x in ts]
    sheet = Image.new("RGB", (270 * 6, 960))
    for i, tl in enumerate(tiles): sheet.paste(tl, ((i % 6) * 270, (i // 6) * 480))
    sheet.save(OUT); print(f"náhled, délka {TOTAL:.1f} s"); sys.exit()

gen = imageio_ffmpeg.write_frames(OUT, (W, H), fps=FPS, codec="libx264", audio_path=str(mix), audio_codec="aac", macro_block_size=1,
                                  output_params=["-pix_fmt", "yuv420p", "-crf", "20", "-af", "loudnorm=I=-14:TP=-1.5", "-ar", "48000", "-shortest"])
gen.send(None)
for fi in range(nfr):
    gen.send(frame(fi).tobytes())
    if fi % 150 == 0: print(f"{fi}/{nfr}", flush=True)
gen.close(); print(f"hotovo {OUT} ({TOTAL:.1f} s)")
