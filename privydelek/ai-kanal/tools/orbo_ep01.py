"""Orbo #1 „Day 47“ v2 – kompletní render. python orbo_ep01.py <scratch_dir> <out.mp4> [--preview]"""
import sys, math, random, subprocess
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageEnhance
import imageio_ffmpeg

S = Path(sys.argv[1]); OUT = sys.argv[2]; PREVIEW = "--preview" in sys.argv
sys.path.insert(0, str(S / "drakula-tools"))
import orbo_char as oc

FF = imageio_ffmpeg.get_ffmpeg_exe()
W, H, FPS, SR = 1080, 1920, 30, 44100
O = S / "orbo"; AU = O / "ep01" / "audio2"; ST = O / "stock"; MU = O / "music"
B = "C:/Windows/Fonts/segoeuib.ttf"; R = "C:/Windows/Fonts/segoeui.ttf"; HAND = "C:/Windows/Fonts/segoeprb.ttf"; HANDL = "C:/Windows/Fonts/segoepr.ttf"
f = lambda p, s: ImageFont.truetype(p, s)
ease = lambda x: 0.5 - 0.5 * math.cos(math.pi * min(1, max(0, x)))
def back_out(x):
    x = min(1, max(0, x)); c = 1.7; return 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2

# ---------------------------------------------------------------- audio
def load(p, start=0.0, dur=None):
    a = ["-v", "error", "-ss", str(start)] + (["-t", str(dur)] if dur else []) + ["-i", str(p), "-f", "s16le", "-ac", "1", "-ar", str(SR), "-"]
    x = np.frombuffer(subprocess.run([FF, *a], capture_output=True).stdout, np.int16).astype(np.float32) / 32768
    return x
def trim(x):
    nz = np.where(np.abs(x) > 0.012)[0]; return x[max(nz[0] - 400, 0): nz[-1] + 1500] if len(nz) else x
LINES = {k: trim(load(AU / f"{k}.mp3")) for k in ("L1", "L2", "L3", "L4", "L5", "L6")}
dl = lambda k: len(LINES[k]) / SR

# ---------------------------------------------------------------- timeline
seg = []
def add(name, dur, **kw): seg.append(dict(name=name, dur=round(dur, 3), **kw))
add("hook", dl("L1") + 0.15, line="L1")
add("weknow1", 0.75)
add("panic", dl("L2") + 0.55, line="L2")
add("note1", 1.9)
add("relief", dl("L3") + 0.1, line="L3")
add("note2", 1.5)
add("weknow2", 0.8)
add("note3", 1.8)
add("printer", dl("L4") + 0.35, line="L4", line_off=0.25)
add("note4", 2.3)
add("dim", 0.8)
add("write", 2.0)
add("flip", 0.55)
add("again", dl("L5") + 0.05, line="L5")
add("chat", 2.0)
add("whatwas", dl("L6") + 0.55, line="L6")
t = 0.0
for s in seg: s["t0"] = t; t += s["dur"]
TOTAL = t
SEG = {s["name"]: s for s in seg}

y = np.zeros(int((TOTAL + 1) * SR))
def put(x, at, gain=1.0):
    i = int(at * SR); n = min(len(x), len(y) - i); y[i:i + n] += x[:n] * gain
tt = lambda d: np.arange(int(d * SR)) / SR
rng = np.random.default_rng(3)
def noise(d): return rng.standard_normal(int(d * SR))
def lp(x, k): return np.convolve(x, np.ones(k) / k, "same")
def pfft():
    d = 0.7; t_ = tt(d); n = lp(noise(d), 6) * np.exp(-t_ * 3) * 0.25; return n * (1 - t_ / d)
def whoosh(d=0.45):
    t_ = tt(d); return lp(noise(d), 18) * np.sin(np.pi * t_ / d) ** 2 * 0.5
def pop():
    t_ = tt(0.08); return 0.5 * np.sin(2 * np.pi * (900 - 4000 * t_) * t_) * np.exp(-t_ * 40)
def blip():
    t_ = tt(0.12); return 0.25 * np.sin(2 * np.pi * 1400 * t_) * np.exp(-t_ * 25)
def beep():
    t_ = tt(0.12); b = 0.18 * np.sign(np.sin(2 * np.pi * 1000 * t_)) * np.exp(-t_ * 8)
    return np.concatenate([b, np.zeros(int(0.08 * SR)), b])
def hum(d):
    t_ = tt(d); return 0.05 * (np.sin(2 * np.pi * 120 * t_) + 0.5 * np.sin(2 * np.pi * 240 * t_)) * np.minimum(1, t_ * 5) * np.minimum(1, (d - t_) * 5)
def scribble(d):
    t_ = tt(d); env = (np.sin(2 * np.pi * 7 * t_) > 0.2).astype(float); return lp(noise(d), 3) * 0.12 * env
def flip():
    t_ = tt(0.3); return lp(noise(0.3), 10) * np.exp(-((t_ - 0.12) ** 2) / 0.004) * 0.6
def music(p, start, dur, fade_in=0.05, fade_out=0.5, gain=0.5):
    x = load(p, start, dur); x = x / (np.abs(x).max() + 1e-6)
    t_ = np.arange(len(x)) / SR
    x *= np.minimum(1, t_ / max(fade_in, 1e-3)) * np.minimum(1, (len(x) / SR - t_) / fade_out)
    return x * gain

for s in seg:
    if "line" in s: put(LINES[s["line"]], s["t0"] + s.get("line_off", 0.05))
put(whoosh(), 0.0); put(pfft(), 0.8, 0.8)
put(pop(), SEG["weknow1"]["t0"] + 0.05)
put(music(MU / "toccata.mp3", 0.3, 3.2, fade_out=0.8, gain=0.55), SEG["panic"]["t0"] + 0.55)
put(whoosh(0.5), SEG["panic"]["t0"] + SEG["panic"]["dur"] - 0.6, 0.7)
for n in ("note1", "note2", "note3"): put(blip(), SEG[n]["t0"])
put(pop(), SEG["weknow2"]["t0"] + 0.05)
put(beep(), SEG["printer"]["t0"] + 0.05)
put(blip(), SEG["note4"]["t0"])
put(music(MU / "gymnopedie.ogg", 3.0, SEG["note4"]["dur"] + SEG["dim"]["dur"] + 0.6, fade_in=0.4, fade_out=0.8, gain=0.6), SEG["note4"]["t0"] + 0.5)
put(hum(SEG["dim"]["dur"] + 0.3), SEG["dim"]["t0"])
put(music(MU / "clairdelune.ogg", 3.0, SEG["write"]["dur"] + SEG["flip"]["dur"] + 0.8, fade_in=0.5, fade_out=0.9, gain=0.6), SEG["write"]["t0"])
put(scribble(1.3), SEG["write"]["t0"] + 0.3)
put(flip(), SEG["flip"]["t0"])
put(whoosh(), SEG["again"]["t0"])
c0 = SEG["chat"]["t0"]; put(pop(), c0 + 0.02); put(pop(), c0 + 1.15, 0.8)
put(music(MU / "fluffing.mp3", 0.0, 1.8, fade_out=0.5, gain=0.45), SEG["whatwas"]["t0"] + dl("L6") - 0.05)
y = y[: int(TOTAL * SR)]; y = y / np.abs(y).max() * 0.9
mix = O / "ep01" / "mix.wav"
subprocess.run([FF, "-v", "error", "-y", "-f", "f32le", "-ac", "1", "-ar", str(SR), "-i", "-", "-ac", "2", str(mix)], input=y.astype(np.float32).tobytes(), check=True)
# hlasitost jen hlasu pro pulz Orba
voice = np.zeros_like(y)
for s in seg:
    if "line" in s:
        i = int((s["t0"] + s.get("line_off", 0.05)) * SR); x = LINES[s["line"]]; voice[i:i + len(x)] += x[: len(voice) - i]
hop = SR // FPS; nfr = int(TOTAL * FPS)
env = np.array([np.sqrt(np.mean(voice[i * hop:(i + 1) * hop] ** 2) + 1e-9) for i in range(nfr)]); env /= env.max()
amp = np.zeros_like(env)
for i in range(1, nfr): amp[i] = amp[i - 1] + (0.6 if env[i] > amp[i - 1] else 0.15) * (env[i] - amp[i - 1])

# ---------------------------------------------------------------- pozadí a rekvizity
def crop916(path, cx=0.5):
    im = Image.open(path).convert("RGB"); w, h = im.size; tw = int(h * W / H)
    if tw <= w: x = int((w - tw) * cx); im = im.crop((x, 0, x + tw, h))
    return im.resize((W, H), Image.LANCZOS)

def make_wall(day):
    im = crop916(ST / "v11.jpg"); im = ImageEnhance.Brightness(im).enhance(0.93).convert("RGBA")
    d = ImageDraw.Draw(im)
    # transparent s vlaječkami, vybledlý
    pts = [(90, 300), (990, 330)]; d.line([pts[0], (540, 380), pts[1]], fill=(150, 140, 120, 255), width=4)
    letters = "WELCOME ORBO!"; cols = [(200, 120, 120), (120, 160, 200), (200, 180, 110), (140, 180, 140)]
    for i, ch in enumerate(letters):
        if ch == " ": continue
        u = (i + 0.5) / len(letters); x = 90 + u * 900; yb = 300 + 30 * u + 80 * math.sin(math.pi * u) - 10
        flag = Image.new("RGBA", (70, 90), (0, 0, 0, 0)); fd = ImageDraw.Draw(flag)
        c = cols[i % 4]; fd.polygon([(0, 0), (70, 0), (35, 90)], fill=c + (215,))
        fd.text((35 - d.textlength(ch, font=f(B, 38)) / 2, 4), ch, font=f(B, 38), fill=(255, 255, 255, 230))
        flag = flag.rotate(-8 + 16 * u + (14 if ch == "!" else 0), expand=True, resample=Image.BICUBIC)
        im.alpha_composite(flag, (int(x - flag.width / 2), int(yb)))
    # jeden konec transparentu visí
    # kalendář
    cal = Image.new("RGBA", (300, 360), (0, 0, 0, 0)); cd = ImageDraw.Draw(cal)
    cd.rectangle([8, 8, 300, 360], fill=(0, 0, 0, 40)); cd.rectangle([0, 0, 290, 350], fill=(250, 250, 248, 255))
    cd.rectangle([0, 0, 290, 80], fill=(210, 50, 55, 255)); cd.text((145 - cd.textlength("DAY", font=f(B, 50)) / 2, 10), "DAY", font=f(B, 50), fill="white")
    num = str(day); cd.text((145 - cd.textlength(num, font=f(B, 190)) / 2, 95), num, font=f(B, 190), fill=(30, 30, 40))
    for k in range(6): cd.ellipse([30 + k * 45, -6, 42 + k * 45, 6], fill=(90, 90, 90))
    im.alpha_composite(cal.rotate(2, expand=True, resample=Image.BICUBIC), (720, 560))
    # splasklé balónky na zemi
    for (bx, by, c, rot) in [(760, 1540, (220, 90, 100), 20), (860, 1585, (100, 150, 220), -15), (650, 1600, (230, 200, 90), 60)]:
        bl = Image.new("RGBA", (130, 70), (0, 0, 0, 0)); bd = ImageDraw.Draw(bl)
        bd.ellipse([0, 15, 110, 62], fill=c + (225,)); bd.polygon([(105, 32), (128, 24), (126, 46)], fill=c + (225,))
        bd.arc([10, 22, 90, 50], 200, 330, fill=(255, 255, 255, 90), width=4)
        bl = bl.rotate(rot, expand=True, resample=Image.BICUBIC); im.alpha_composite(bl, (bx, by))
        d.line([(bx + 60, by + 55), (bx + 20, by + 120)], fill=(160, 160, 160, 255), width=2)
    return im.convert("RGB")

def make_printer():
    im = Image.open(ST / "28.jpg").convert("RGB")
    d = ImageDraw.Draw(im)
    for box in [(500, 460, 600, 545), (230, 575, 380, 610), (755, 460, 855, 615)]:  # logo, typový štítek, nálepka
        patch = im.crop((box[0] - 30, box[1], box[0] - 5, box[3])).resize((box[2] - box[0], box[3] - box[1]))
        im.paste(patch.filter(ImageFilter.GaussianBlur(6)), box[:2])
    w, h = im.size; tw = int(h * W / H); x = 190
    return im.crop((x, 0, x + tw, h)).resize((W, H), Image.LANCZOS)

WALL47, WALL48, PRINTER = make_wall(47), make_wall(48), make_printer()
def bgprep(im, blur=3.0, bright=1.0):
    return ImageEnhance.Brightness(im.filter(ImageFilter.GaussianBlur(blur))).enhance(bright)
BG = {"wall47": bgprep(WALL47, 2.0), "wall48": bgprep(WALL48, 2.0), "printer": bgprep(PRINTER, 3.0),
      "wall_dark": bgprep(WALL47, 10, 0.55)}

def note_img(text, small="", crumpled=False, color=(255, 232, 110)):
    n = Image.new("RGBA", (820, 820), (0, 0, 0, 0)); nd = ImageDraw.Draw(n)
    nd.rectangle([18, 22, 818, 818], fill=(0, 0, 0, 70))
    base = tuple(int(c * (0.9 if crumpled else 1)) for c in color)
    nd.rectangle([0, 0, 800, 800], fill=base + (255,)); nd.rectangle([0, 0, 800, 70], fill=tuple(int(c * 0.93) for c in base) + (255,))
    if crumpled:
        r = random.Random(4)
        for _ in range(9):
            x0, y0 = r.randint(0, 800), r.randint(0, 800); nd.line([(x0, y0), (x0 + r.randint(-300, 300), y0 + r.randint(-300, 300))], fill=(0, 0, 0, 28), width=3)
    font = f(HAND if not crumpled else HANDL, 92 if not crumpled else 70)
    words, lines, cur = text.split(), [], ""
    for wd in words:
        if nd.textlength((cur + " " + wd).strip(), font=font) > 700: lines.append(cur); cur = wd
        else: cur = (cur + " " + wd).strip()
    lines.append(cur)
    lh = font.size * 1.25; y0 = 400 - lh * len(lines) / 2 - (40 if small else 0)
    for i, ln in enumerate(lines):
        nd.text((400 - nd.textlength(ln, font=font) / 2, y0 + i * lh), ln, font=font, fill=(35, 35, 70))
    if small:
        sf = f(HANDL, 56); nd.text((400 - nd.textlength(small, font=sf) / 2, y0 + len(lines) * lh + 30), small, font=sf, fill=(70, 70, 110))
    return n

NOTES = {"note1": (note_img("YOU ARE NOT NEW.", "— you, yesterday"), -3),
         "note2": (note_img("JEN SAYS “WE KNOW” A LOT.", color=(190, 240, 160)), 2),
         "note3": (note_img("STOP APOLOGIZING TO THE PRINTER.", color=(255, 190, 205)), -2),
         "note4": (note_img("midnight reset. you'll forget this too.", crumpled=True), 5)}

def chat_card(name, text, typing=False, tphase=0.0):
    c = Image.new("RGBA", (900, 190), (0, 0, 0, 0)); d = ImageDraw.Draw(c)
    d.rounded_rectangle([6, 10, 900, 190], 34, fill=(0, 0, 0, 60)); d.rounded_rectangle([0, 0, 890, 180], 34, fill=(255, 255, 255, 245))
    d.ellipse([28, 40, 128, 140], fill=(120, 90, 200)); d.text((78 - d.textlength("J", font=f(B, 56)) / 2, 50), "J", font=f(B, 56), fill="white")
    d.text((160, 30), name, font=f(B, 40), fill=(40, 40, 50))
    if typing:
        for k in range(3):
            a = 0.35 + 0.65 * (0.5 + 0.5 * math.sin(tphase * 10 - k * 1.2))
            d.ellipse([165 + k * 42, 108, 193 + k * 42, 136], fill=(int(150 * a), int(150 * a), int(160 * a), 255))
    else:
        d.text((160, 88), text, font=f(R, 56), fill=(20, 20, 30))
    return c

def caption(img, text):
    d = ImageDraw.Draw(img); fn = f(B, 70)
    words, lines, cur = text.split(), [], ""
    for wd in words:
        if d.textlength((cur + " " + wd).strip(), font=fn) > 900: lines.append(cur); cur = wd
        else: cur = (cur + " " + wd).strip()
    lines.append(cur)
    for i, ln in enumerate(lines):
        d.text(((W - d.textlength(ln, font=fn)) / 2, 1390 + i * 86), ln, font=fn, fill=(255, 255, 255), stroke_width=8, stroke_fill=(0, 0, 0))

CAPS = {"L1": ["Good morning!", "FIRST DAY!", "I'm Orbo,", "your new AI intern!"], "L2": ["You know me?", "…What did I DO?"],
        "L3": ["Oh.", "Yesterday-me sounds stressed."], "L4": ["…sorry."], "L5": ["Good morning!", "First d—"], "L6": ["…What was?"]}
def cap_for(s, lt):
    if "line" not in s: return None
    off = s.get("line_off", 0.05); d = dl(s["line"]); p = (lt - off) / d
    if p < 0 or p > 1.05: return None
    ch = CAPS[s["line"]]; return ch[min(len(ch) - 1, int(max(0, p) * len(ch)))]

# ---------------------------------------------------------------- snímek
def place_orbo(canvas, x, y, scale, red=0.0, **p):
    o = oc.render(**p)
    if red > 0:
        r, g, b, al = o.split(); tint = Image.merge("RGBA", (r.point(lambda v: min(255, int(v * (1 + 0.9 * red) + 60 * red))), g.point(lambda v: int(v * (1 - 0.55 * red))), b.point(lambda v: int(v * (1 - 0.65 * red))), al)); o = tint
    if scale != 1.0: o = o.resize((int(oc.SIZE * scale), int(oc.SIZE * scale)), Image.BILINEAR)
    sh = oc.shadow(dim=p.get("dim", 0)); sh = sh.resize((int(sh.width * scale), int(sh.height * scale)))
    canvas.alpha_composite(sh, (int(x - sh.width / 2), int(y + 210 * scale * p.get("sy", 1) + 20 * scale)))
    canvas.alpha_composite(o, (int(x - o.width / 2), int(y - o.height / 2)))

def zoomed(img, z, cx=0.5, cy=0.5):
    if z == 1.0: return img
    w2, h2 = int(W / z), int(H / z); x = int((W - w2) * cx); yy = int((H - h2) * cy)
    return img.crop((x, yy, x + w2, yy + h2)).resize((W, H), Image.BILINEAR)

def note_frame(name, lt, dur):
    n, rot = NOTES[name]; z = 1.0 + 0.05 * lt / dur
    bgc = BG["wall_dark"].copy().convert("RGBA")
    k = back_out(lt / 0.25); sc = (0.85 + 0.15 * k) * z
    im = n.rotate(rot, expand=True, resample=Image.BICUBIC); im = im.resize((int(im.width * sc), int(im.height * sc)), Image.BILINEAR)
    bgc.alpha_composite(im, (int(W / 2 - im.width / 2), int(H / 2 - im.height / 2 - 60)))
    return bgc

def frame(fi):
    tg = fi / FPS
    s = next(x for x in seg if x["t0"] <= tg < x["t0"] + x["dur"]) if tg < TOTAL else seg[-1]
    lt = tg - s["t0"]; p = lt / s["dur"]; a = float(amp[min(fi, nfr - 1)]); nm = s["name"]
    blink = 1.0 if (tg % 3.1) < 0.09 else 0.0
    base = dict(t=tg, amp=a, blink=blink)
    if nm in NOTES:
        img = note_frame(nm, lt, s["dur"])
    elif nm == "write":
        img = BG["wall_dark"].copy().convert("RGBA")
        txt = "TODAY WAS NICE."; k = min(1, max(0, (lt - 0.25) / 1.3)); shown = txt[: int(len(txt) * k)]
        n = note_img(shown if shown else " ", color=(255, 236, 140)).rotate(-2, expand=True, resample=Image.BICUBIC)
        img.alpha_composite(n, (int(W / 2 - n.width / 2), int(H / 2 - n.height / 2 - 60)))
        # svítící fixa
        mk = Image.new("RGBA", (60, 260), (0, 0, 0, 0)); md = ImageDraw.Draw(mk)
        md.rounded_rectangle([10, 30, 50, 250], 14, fill=(60, 200, 240, 255)); md.polygon([(18, 30), (42, 30), (30, 0)], fill=(30, 30, 40, 255))
        glow = mk.filter(ImageFilter.GaussianBlur(14)); mk = Image.alpha_composite(glow, mk).rotate(-35, expand=True)
        mx = W / 2 - 330 + 660 * k + 15 * math.sin(lt * 40); my = H / 2 - 120 + 10 * math.sin(lt * 33)
        img.alpha_composite(mk, (int(mx), int(my - mk.height + 40)))
    elif nm == "flip":
        img = BG["wall47" if p < 0.5 else "wall48"].copy().convert("RGBA"); img = zoomed(img, 2.6, 0.78, 0.36)
    else:
        bgk = {"printer": "printer", "again": "wall48", "chat": "wall48", "whatwas": "wall48"}.get(nm, "wall47")
        img = BG[bgk].copy().convert("RGBA"); x, yy, sc = W / 2, 1000, 1.05; pr = dict(base)
        if nm == "hook":
            k = back_out(lt / 0.45); x = W / 2 + (1 - k) * 700; pr.update(tag=True, eye_shape="happy" if a > 0.25 else "normal", glow=1.15)
        elif nm == "weknow1":
            pr.update(tag=True, gaze=(0.3, -0.8))
        elif nm == "panic":
            spin0 = s["dur"] - 0.6; red = min(1, lt / 0.3)
            pr.update(tag=True, eye_shape="worried", glow=1.2 + 0.2 * math.sin(lt * 30), sx=1 + 0.03 * math.sin(lt * 50), red=red * (0.6 + 0.4 * math.sin(lt * 25)) * (1 - max(0, (lt - spin0) / 0.6)))
            x += 10 * math.sin(lt * 60) * red
            if lt > spin0: pr.update(yaw=math.pi * ease((lt - spin0) / 0.6), notes=True)
        elif nm == "relief":
            pr.update(yaw=2.05, notes=True, gaze=(-1, 0), glow=1.0)
        elif nm == "weknow2":
            pr.update(yaw=2.05, notes=True, gaze=(-0.6, -1))
        elif nm == "printer":
            x, yy, sc = 300, 1250, 0.75; pr.update(yaw=-0.55, gaze=(1, 0), eye_shape="worried", glow=0.9, notes=True)
        elif nm == "dim":
            k = ease(p); pr.update(dim=k, eye_shape="worried", glow=1 - 0.25 * k, notes=False, tag=True)
            img = zoomed(img, 1 + 0.08 * p)
        elif nm == "again":
            k = back_out(lt / 0.45); x = W / 2 + (1 - k) * 700; pr.update(tag=True, eye_shape="happy" if a > 0.25 else "normal", glow=1.15)
        elif nm == "chat":
            pr.update(tag=True, gaze=(0.3, -0.8), eye_shape="happy" if lt > 1.3 else "normal")
        elif nm == "whatwas":
            pr.update(tag=True, gaze=(0, 0), blink=1.0 if 0.1 < lt < 0.22 else blink)
        y_b = yy + 14 * math.sin(tg * 2.1)
        place_orbo(img, x, y_b, sc, **pr)
        if nm in ("weknow1", "weknow2") or (nm == "chat"):
            if nm == "chat":
                if lt < 0.6: card = chat_card("Jen", "we know.")
                elif lt < 1.15: card = chat_card("Jen", "", typing=True, tphase=lt)
                else: card = chat_card("Jen", "it was nice.")
                kk = back_out((lt - (1.15 if lt >= 1.15 else 0)) / 0.2)
            else:
                card = chat_card("Jen", "we know."); kk = back_out(lt / 0.2)
            cs = card.resize((max(1, int(card.width * kk)), max(1, int(card.height * kk))))
            img.alpha_composite(cs, (int(W / 2 - cs.width / 2), 330))
    c = cap_for(s, lt)
    if c: caption(img, c)
    ImageDraw.Draw(img).text((W - 200, H - 300), "AI-made", font=f(B, 30), fill=(255, 255, 255, 150))
    return np.asarray(img.convert("RGB"))

if PREVIEW:
    times = [0.3, SEG["weknow1"]["t0"] + 0.4, SEG["panic"]["t0"] + 0.5, SEG["panic"]["t0"] + SEG["panic"]["dur"] - 0.15, SEG["note1"]["t0"] + 0.8,
             SEG["relief"]["t0"] + 0.8, SEG["printer"]["t0"] + 0.8, SEG["note4"]["t0"] + 1.0, SEG["dim"]["t0"] + 0.7, SEG["write"]["t0"] + 1.2,
             SEG["chat"]["t0"] + 1.5, SEG["whatwas"]["t0"] + 0.5]
    tiles = [Image.fromarray(frame(int(x * FPS))).resize((270, 480)) for x in times]
    sheet = Image.new("RGB", (270 * 6, 960))
    for i, tl in enumerate(tiles): sheet.paste(tl, ((i % 6) * 270, (i // 6) * 480))
    sheet.save(OUT); print(f"náhled {OUT}, délka {TOTAL:.1f} s"); sys.exit()

gen = imageio_ffmpeg.write_frames(OUT, (W, H), fps=FPS, codec="libx264", audio_path=str(mix), audio_codec="aac", macro_block_size=1,
                                  output_params=["-pix_fmt", "yuv420p", "-crf", "20", "-af", "loudnorm=I=-14:TP=-1.5", "-shortest"])
gen.send(None)
for fi in range(nfr):
    gen.send(frame(fi).tobytes())
    if fi % 150 == 0: print(f"{fi}/{nfr}", flush=True)
gen.close(); print(f"hotovo {OUT} ({TOTAL:.1f} s)")
