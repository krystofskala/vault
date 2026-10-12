"""Orbo engine: epizoda = episode.json -> hlas, časování, render, kontrolní report.

python orbo_engine.py <episode_dir> [--preview] [--no-render]

episode.json:
{
  "title": "Meeting Notes",
  "background": "17.jpg", "bg_cx": 0.45,          # soubor v assets/stock
  "voice": "uq0HIbNZKn11Hs5ifEdd",                 # ElevenLabs (Harry)
  "beats": [
    {"id": "ask",  "type": "chat", "who": "Jen", "text": "...", "orbo": {"mood": "normal", "gaze": [0.2, -0.9]}},
    {"id": "done", "type": "line", "text": "[excited] Done! Sent to everyone!", "orbo": {"mood": "happy"}, "sfx": [["send", 0.6]]},
    {"id": "doc1", "type": "doc", "title": "LUNCH MEETING: NOTES", "bullets": ["...", "..."]},
    {"id": "dots", "type": "chat", "who": "Jen", "text": "…", "dur": 0.6},
    {"id": "beat", "type": "pause", "dur": 0.5, "orbo": {"mood": "worried"}}
  ],
  "music": [{"track": "toccata.mp3", "beat": "panic", "offset": 0.15, "start": 0.3, "dur": 3.0, "gain": 0.5}]
}
Typy beatů: chat (karta zůstává viditelná i v dalších beatech, dokud nepřijde další chat/doc), line (Orbo mluví,
titulky automaticky), doc (dokument s postupně naskakujícími body), note (lísteček), pause.
Nálady Orba: normal, happy, worried, panic, working, small, proud, dim.
Časování se počítá samo: text musí být vidět >= znaky/15 + 0,5 s (pravidlo z playbooku), délka repliky = délka hlasu.
"""
import sys, json, math, re, hashlib, subprocess, urllib.request
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageEnhance
import imageio_ffmpeg

TOOLS = Path(__file__).resolve().parent; ROOT = TOOLS.parent
sys.path.insert(0, str(TOOLS))
import orbo_char as oc

EP = Path(sys.argv[1]).resolve(); PREVIEW = "--preview" in sys.argv; NORENDER = "--no-render" in sys.argv
SPEC = json.loads((EP / "episode.json").read_text(encoding="utf-8"))
FF = imageio_ffmpeg.get_ffmpeg_exe()
W, H, FPS, SR = 1080, 1920, 30, 48000
STOCK, MUSIC = ROOT / "assets" / "stock", ROOT / "assets" / "music"
AUD = EP / "audio"; RENDER = EP / "render"; AUD.mkdir(exist_ok=True); RENDER.mkdir(exist_ok=True)
B = "C:/Windows/Fonts/segoeuib.ttf"; R = "C:/Windows/Fonts/segoeui.ttf"; HAND = "C:/Windows/Fonts/segoeprb.ttf"
fnt = lambda p, s: ImageFont.truetype(p, s)
ease = lambda x: 0.5 - 0.5 * math.cos(math.pi * min(1, max(0, x)))
def back_out(x):
    x = min(1, max(0, x)); c = 1.7; return 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2
READ_CPS, READ_PAD = 15.0, 0.5
need_read = lambda txt: len(txt) / READ_CPS + READ_PAD
BRANDS = ["apple", "iphone", "google", "gemini", "chatgpt", "openai", "microsoft", "copilot", "slack", "teams", "zoom", "hp ", "amazon", "meta"]

# ---------------------------------------------------------------- TTS (s cache)
ENV = dict(l.split("=", 1) for l in (ROOT / ".env").read_text().splitlines() if "=" in l)
def tts(text, voice, out):
    key = hashlib.sha1((voice + "|" + text).encode()).hexdigest()[:10]; tag = out.with_suffix(".key")
    if out.exists() and tag.exists() and tag.read_text() == key: return
    req = urllib.request.Request(f"https://api.elevenlabs.io/v1/text-to-speech/{voice}?output_format=mp3_44100_128", method="POST",
                                 data=json.dumps({"text": text, "model_id": "eleven_v3"}).encode(),
                                 headers={"xi-api-key": ENV["ELEVENLABS_API_KEY"].strip(), "Content-Type": "application/json"})
    out.write_bytes(urllib.request.urlopen(req, timeout=180).read()); tag.write_text(key); print("TTS:", text)

def load(p, start=0.0, dur=None):
    a = ["-v", "error", "-ss", str(start)] + (["-t", str(dur)] if dur else []) + ["-i", str(p), "-f", "s16le", "-ac", "1", "-ar", str(SR), "-"]
    return np.frombuffer(subprocess.run([FF, *a], capture_output=True).stdout, np.int16).astype(np.float32) / 32768
def trim(x):
    nz = np.where(np.abs(x) > 0.012)[0]; return x[max(nz[0] - 400, 0): nz[-1] + 1500] if len(nz) else x
clean = lambda t: re.sub(r"\[[^\]]*\]\s*", "", t).strip()

beats = SPEC["beats"]; LINES = {}
for b in beats:
    if b["type"] == "line":
        p = AUD / f"{b['id']}.mp3"; tts(b["text"], SPEC.get("voice", "uq0HIbNZKn11Hs5ifEdd"), p); LINES[b["id"]] = trim(load(p))

# ---------------------------------------------------------------- časování
def base_dur(b):
    if "dur" in b: return b["dur"]
    t = b["type"]
    if t == "line": return len(LINES[b["id"]]) / SR + b.get("pad", 0.12)
    if t == "chat": return 0.9
    if t == "doc":
        n = len(b["bullets"]); allt = " ".join(b["bullets"])
        return 0.1 + 0.55 * (n - 1) + need_read(b["bullets"][-1])  # body se čtou průběžně, jak naskakují
    if t == "note": return need_read(b["text"]) + 0.3
    return 0.5
for b in beats: b["d"] = round(base_dur(b), 3)
def chat_spans():
    """Index chatu -> indexy beatů, kde je karta vidět (do dalšího chatu/doc/note)."""
    spans = {}
    for i, b in enumerate(beats):
        if b["type"] != "chat": continue
        j = i + 1
        while j < len(beats) and beats[j]["type"] not in ("chat", "doc", "note") and not b.get("no_hold"): j += 1
        spans[i] = list(range(i, j))
    return spans
for _ in range(3):  # prodloužit chat, pokud text nestihne být vidět dost dlouho
    for i, idx in chat_spans().items():
        vis = sum(beats[k]["d"] for k in idx); req = need_read(beats[i]["text"])
        if vis < req and "dur" not in beats[i]: beats[i]["d"] = round(beats[i]["d"] + (req - vis), 3)
t = 0.0
for b in beats: b["t0"] = t; t += b["d"]
TOTAL = t; BYID = {b["id"]: b for b in beats}; SPANS = chat_spans()
CHAT_AT = {}
for i, idx in SPANS.items():
    for k in idx: CHAT_AT[k] = i

# ---------------------------------------------------------------- zvuk
y = np.zeros(int((TOTAL + 1) * SR)); rng = np.random.default_rng(5)
def put(x, at, g=1.0):
    i = int(at * SR); n = min(len(x), len(y) - i)
    if n > 0: y[i:i + n] += x[:n] * g
tt = lambda d: np.arange(int(d * SR)) / SR
lp = lambda x, k: np.convolve(x, np.ones(k) / k, "same")
def s_pop(): t_ = tt(0.08); return 0.5 * np.sin(2 * np.pi * (900 - 4000 * t_) * t_) * np.exp(-t_ * 40)
def s_send(): t_ = tt(0.35); return lp(rng.standard_normal(len(t_)), 12) * np.sin(np.pi * t_ / 0.35) ** 2 * 0.45
def s_whoosh(): t_ = tt(0.45); return lp(rng.standard_normal(len(t_)), 18) * np.sin(np.pi * t_ / 0.45) ** 2 * 0.5
def s_tick(): t_ = tt(0.05); return 0.22 * np.sin(2 * np.pi * 2000 * t_) * np.exp(-t_ * 70)
def s_ding(): t_ = tt(0.6); return 0.25 * (np.sin(2 * np.pi * 1318 * t_) * (t_ < 0.1) + np.sin(2 * np.pi * 1760 * t_) * (t_ >= 0.1)) * np.exp(-t_ * 6)
def s_beep(): t_ = tt(0.12); b_ = 0.18 * np.sign(np.sin(2 * np.pi * 1000 * t_)) * np.exp(-t_ * 8); return np.concatenate([b_, np.zeros(int(0.08 * SR)), b_])
def s_clacks(d=1.0):
    out = np.zeros(int(d * SR))
    for k in np.arange(0, d - 0.05, 0.07):
        c = lp(rng.standard_normal(int(0.02 * SR)), 2) * 0.25 * np.exp(-np.arange(int(0.02 * SR)) / 150); i = int(k * SR); out[i:i + len(c)] += c
    return out
def s_hum(d=1.0): t_ = tt(d); return 0.05 * (np.sin(2 * np.pi * 120 * t_) + 0.5 * np.sin(2 * np.pi * 240 * t_)) * np.minimum(1, t_ * 5) * np.minimum(1, (d - t_) * 5)
SFX = {"pop": s_pop, "send": s_send, "whoosh": s_whoosh, "tick": s_tick, "ding": s_ding, "beep": s_beep}
for b in beats:
    if b["type"] == "line": put(LINES[b["id"]], b["t0"] + 0.08)
    if b["type"] == "chat" and b.get("sfx_default", True): put(s_pop(), b["t0"] + 0.05)
    if b["type"] == "doc":
        for k in range(len(b["bullets"])): put(s_tick(), b["t0"] + 0.1 + k * 0.55)
    if b.get("orbo", {}).get("mood") == "working": put(s_clacks(b["d"]), b["t0"], 0.9)
    for name, off in b.get("sfx", []):
        if name in SFX: put(SFX[name](), b["t0"] + off)
        elif name == "hum": put(s_hum(b["d"]), b["t0"] + off)
for m in SPEC.get("music", []):
    x = load(MUSIC / m["track"], m.get("start", 0), m["dur"]); x = x / (np.abs(x).max() + 1e-6); t_ = np.arange(len(x)) / SR
    x *= np.minimum(1, t_ / m.get("fade_in", 0.03)) * np.minimum(1, (len(x) / SR - t_) / m.get("fade_out", 0.5))
    put(x, BYID[m["beat"]]["t0"] + m.get("offset", 0), m.get("gain", 0.5))
y = y[: int(TOTAL * SR)]; y = y / (np.abs(y).max() + 1e-6) * 0.9
mix = RENDER / "mix.wav"
subprocess.run([FF, "-v", "error", "-y", "-f", "f32le", "-ac", "1", "-ar", str(SR), "-i", "-", "-ac", "2", str(mix)], input=y.astype(np.float32).tobytes(), check=True)
voice = np.zeros_like(y)
for b in beats:
    if b["type"] == "line":
        i = int((b["t0"] + 0.08) * SR); x = LINES[b["id"]]; n = min(len(x), len(voice) - i); voice[i:i + n] += x[:n]
hop = SR // FPS; nfr = int(TOTAL * FPS)
env = np.array([np.sqrt(np.mean(voice[i * hop:(i + 1) * hop] ** 2) + 1e-9) for i in range(nfr)]); env /= env.max() + 1e-9
amp = np.zeros_like(env)
for i in range(1, nfr): amp[i] = amp[i - 1] + (0.6 if env[i] > amp[i - 1] else 0.15) * (env[i] - amp[i - 1])

# ---------------------------------------------------------------- grafika
def crop916(path, cx=0.5):
    im = Image.open(path).convert("RGB"); w, h = im.size; tw = int(h * W / H)
    if tw <= w: x = int((w - tw) * cx); im = im.crop((x, 0, x + tw, h))
    return im.resize((W, H), Image.LANCZOS)
BGS = {}
def bg(name, cx):
    if (name, cx) not in BGS:
        base = crop916(STOCK / name, cx)
        BGS[(name, cx)] = (ImageEnhance.Brightness(base.filter(ImageFilter.GaussianBlur(4))).enhance(0.85),
                           ImageEnhance.Brightness(base.filter(ImageFilter.GaussianBlur(12))).enhance(0.45))
    return BGS[(name, cx)]
AVATARS = {}
PALETTE = [(120, 90, 200), (220, 120, 40), (40, 150, 120), (200, 60, 110), (60, 120, 210)]
def wrap(d, text, font, maxw):
    lines, cur = [], ""
    for wd in text.split():
        if d.textlength((cur + " " + wd).strip(), font=font) > maxw: lines.append(cur); cur = wd
        else: cur = (cur + " " + wd).strip()
    lines.append(cur); return lines
def chat_card(who, text, sub=""):
    if who not in AVATARS: AVATARS[who] = PALETTE[len(AVATARS) % len(PALETTE)]
    fn = fnt(R, 54); d0 = ImageDraw.Draw(Image.new("RGB", (1, 1))); lines = wrap(d0, text, fn, 680)
    h = 120 + 66 * len(lines) + (40 if sub else 0)
    c = Image.new("RGBA", (920, h + 12), (0, 0, 0, 0)); d = ImageDraw.Draw(c)
    d.rounded_rectangle([6, 10, 920, h + 10], 34, fill=(0, 0, 0, 60)); d.rounded_rectangle([0, 0, 910, h], 34, fill=(255, 255, 255, 246))
    d.ellipse([28, 30, 128, 130], fill=AVATARS[who]); ini = who[0].upper()
    d.text((78 - d.textlength(ini, font=fnt(B, 56)) / 2, 40), ini, font=fnt(B, 56), fill="white")
    d.text((160, 24), who, font=fnt(B, 40), fill=(40, 40, 50)); yy = 78
    if sub: d.text((160, 76), sub, font=fnt(R, 30), fill=(120, 120, 130)); yy += 40
    for i, ln in enumerate(lines): d.text((160, yy + i * 66), ln.replace(" ✓", "").replace("✓", ""), font=fn, fill=(20, 20, 30))
    if text.rstrip().endswith("✓"):  # zelená fajfka (emoji fonty v PIL nefungují spolehlivě)
        last = lines[-1].replace(" ✓", "").replace("✓", ""); lx = 160 + d.textlength(last + " ", font=fn); ly = yy + (len(lines) - 1) * 66 + 6
        d.rounded_rectangle([lx, ly, lx + 52, ly + 52], 10, fill=(40, 170, 80)); d.line([(lx + 12, ly + 27), (lx + 23, ly + 39), (lx + 41, ly + 14)], fill="white", width=7)
    return c
def doc_img(title, bullets, n_shown):
    D = Image.new("RGBA", (920, 1000), (0, 0, 0, 0)); d = ImageDraw.Draw(D)
    d.rounded_rectangle([10, 14, 920, 1000], 26, fill=(0, 0, 0, 70)); d.rounded_rectangle([0, 0, 905, 985], 26, fill=(255, 255, 255, 255))
    d.rounded_rectangle([0, 0, 905, 120], 26, fill=(66, 110, 230, 255)); d.rectangle([0, 90, 905, 120], fill=(66, 110, 230, 255))
    d.text((40, 34), "Shared with: everyone", font=fnt(R, 40), fill=(230, 235, 255))
    fs = 64
    while d.textlength(title, font=fnt(B, fs)) > 800: fs -= 2
    d.text((50, 170), title, font=fnt(B, fs), fill=(25, 25, 35)); d.line([(50, 260), (855, 260)], fill=(220, 220, 225), width=3)
    bf = fnt(R, 52); yy = 300
    for bl in bullets[:n_shown]:
        out = wrap(d, bl, bf, 740); d.ellipse([55, yy + 24, 75, yy + 44], fill=(66, 110, 230))
        for i, ln in enumerate(out): d.text((100, yy + i * 64), ln, font=bf, fill=(30, 30, 40))
        yy += 64 * len(out) + 30
    return D
def note_img(text):
    n = Image.new("RGBA", (820, 820), (0, 0, 0, 0)); nd = ImageDraw.Draw(n)
    nd.rectangle([18, 22, 818, 818], fill=(0, 0, 0, 70)); nd.rectangle([0, 0, 800, 800], fill=(255, 232, 110, 255))
    font = fnt(HAND, 88); lines = wrap(nd, text, font, 700); lh = font.size * 1.25; y0 = 400 - lh * len(lines) / 2
    for i, ln in enumerate(lines): nd.text((400 - nd.textlength(ln, font=font) / 2, y0 + i * lh), ln, font=font, fill=(35, 35, 70))
    return n.rotate(-3, expand=True, resample=Image.BICUBIC)
def caption_chunks(text):
    parts = [p.strip() for p in re.split(r"(?<=[.!?…])\s+", clean(text)) if p.strip()]
    out = []
    for p in parts:
        w = p.split()
        while len(w) > 5: out.append(" ".join(w[:4])); w = w[4:]
        out.append(" ".join(w))
    return out or [clean(text)]
def caption(img, text):
    d = ImageDraw.Draw(img); fn = fnt(B, 72)
    for i, ln in enumerate(wrap(d, text, fn, 940)):
        d.text(((W - d.textlength(ln, font=fn)) / 2, 1420 + i * 86), ln, font=fn, fill=(255, 255, 255), stroke_width=8, stroke_fill=(0, 0, 0))

MOODS = {"normal": {}, "happy": {"eye_shape": "happy", "glow": 1.15}, "worried": {"eye_shape": "worried"},
         "panic": {"eye_shape": "worried", "glow": 1.25}, "working": {"glow": 1.2}, "small": {"eye_shape": "worried", "glow": 0.85},
         "proud": {"eye_shape": "happy", "glow": 1.4, "sy": 1.05}, "dim": {"eye_shape": "worried"}}
def place_orbo(canvas, x, y, scale, red=0.0, **p):
    o = oc.render(**p)
    if red > 0:
        r, g, b_, al = o.split()
        o = Image.merge("RGBA", (r.point(lambda v: min(255, int(v * (1 + 0.9 * red) + 60 * red))), g.point(lambda v: int(v * (1 - 0.55 * red))), b_.point(lambda v: int(v * (1 - 0.65 * red))), al))
    if scale != 1.0: o = o.resize((int(oc.SIZE * scale), int(oc.SIZE * scale)), Image.BILINEAR)
    sh = oc.shadow(); sh = sh.resize((int(sh.width * scale), int(sh.height * scale)))
    canvas.alpha_composite(sh, (int(x - sh.width / 2), int(y + 210 * scale * p.get("sy", 1) + 20 * scale)))
    canvas.alpha_composite(o, (int(x - o.width / 2), int(y - o.height / 2)))

def frame(fi):
    tg = fi / FPS
    bi = next((i for i, b in enumerate(beats) if b["t0"] <= tg < b["t0"] + b["d"]), len(beats) - 1)
    b = beats[bi]; lt = tg - b["t0"]; a = float(amp[min(fi, nfr - 1)])
    bgn = b.get("bg", SPEC.get("background", "17.jpg")); light, dark = bg(bgn, b.get("bg_cx", SPEC.get("bg_cx", 0.5)))
    ob = dict(b.get("orbo", {})); mood = ob.pop("mood", "normal")
    pr = dict(t=tg, amp=a, blink=1.0 if (tg % 3.3) < 0.09 else 0.0); pr.update(MOODS.get(mood, {}))
    if "gaze" in ob: pr["gaze"] = tuple(ob["gaze"])
    if b["type"] in ("doc", "note"):
        img = dark.copy().convert("RGBA")
        if b["type"] == "doc":
            n = min(len(b["bullets"]), int((lt - 0.1) / 0.55) + 1); dc = doc_img(b["title"], b["bullets"], max(0, n))
        else:
            dc = note_img(b["text"])
        sc = 0.92 + 0.08 * back_out(lt / 0.25); dc = dc.resize((int(dc.width * sc), int(dc.height * sc)))
        img.alpha_composite(dc, (int(W / 2 - dc.width / 2), 300 if b["type"] == "doc" else int(H / 2 - dc.height / 2 - 60)))
        place_orbo(img, 860, 1560, 0.42, **{**pr, **MOODS["happy"]})
    else:
        img = light.copy().convert("RGBA"); x, yy, sc = W / 2, 1060, ob.get("scale", 1.0); red = 0.0
        if mood == "happy": pr["eye_shape"] = "happy" if a > 0.25 or b["type"] != "line" else "normal"
        if mood == "panic":
            k = min(1, lt / 0.25); red = k * (0.6 + 0.4 * math.sin(lt * 25)); pr["sx"] = 1 + 0.04 * math.sin(lt * 55); x += 12 * math.sin(lt * 60)
        if mood == "working": pr.update(yaw=0.35 * math.sin(lt * 18), gaze=(0.6 * math.sin(lt * 9), 0.4))
        if mood == "small": sc *= 0.82; yy += 60
        if mood == "proud": sc *= 1.1
        if mood == "dim": pr.update(dim=ease(lt / b["d"]), glow=1 - 0.25 * ease(lt / b["d"]))
        if ob.get("enter"):  # vlétnutí zprava
            x += (1 - back_out(lt / 0.45)) * 700
        place_orbo(img, x, yy + 14 * math.sin(tg * 2.1), sc, red=red, **pr)
        if bi in CHAT_AT:
            ci = CHAT_AT[bi]; cb = beats[ci]; card = chat_card(cb["who"], cb["text"], cb.get("sub", ""))
            if ci == bi:
                k = back_out(lt / 0.22); card = card.resize((max(1, int(card.width * k)), max(1, int(card.height * k))))
            img.alpha_composite(card, (int(W / 2 - card.width / 2), 300))
    if b["type"] == "line":
        p = (lt - 0.08) / (len(LINES[b["id"]]) / SR)
        if -0.02 < p < 1.05:
            ch = caption_chunks(b["text"]); caption(img, ch[min(len(ch) - 1, int(max(0, p) * len(ch)))])
    ImageDraw.Draw(img).text((W - 200, H - 300), "AI-made", font=fnt(B, 30), fill=(255, 255, 255, 150))
    return np.asarray(img.convert("RGB"))

# ---------------------------------------------------------------- kontrolní report
def qc(loud=None):
    rows, warn = [], []
    for i, b in enumerate(beats):
        if b["type"] == "chat":
            vis = sum(beats[k]["d"] for k in SPANS[i]); req = need_read(b["text"]); ok = vis + 1e-3 >= req or len(b["text"]) <= 2
            rows.append(f"| chat {b['id']} | {b['text'][:40]} | {vis:.1f} s | {req:.1f} s | {'OK' if ok else 'KRÁTKÉ'} |")
            if not ok: warn.append(f"chat {b['id']} je vidět jen {vis:.1f} s, potřeba {req:.1f} s")
        if b["type"] in ("doc", "note"):
            txt = b.get("text") or (b["title"] + " " + " ".join(b["bullets"])); req = need_read(b.get("text") or b["bullets"][-1])
            rows.append(f"| {b['type']} {b['id']} | {txt[:40]} | {b['d']:.1f} s | {req:.1f} s+ | {'OK' if b['d'] >= req else 'KRÁTKÉ'} |")
        if b["type"] == "pause" and b["d"] > 0.8 and bi_has_no_text(i): warn.append(f"hluché místo {b['id']} {b['d']:.1f} s")
    alltext = " ".join(clean(b.get("text", "")) + " " + b.get("title", "") + " " + " ".join(b.get("bullets", [])) for b in beats).lower()
    for br in BRANDS:
        if re.search(r"\b" + re.escape(br.strip()) + r"\b", alltext): warn.append(f"značka v textu: {br.strip()}")
    if not (18 <= TOTAL <= 32): warn.append(f"délka {TOTAL:.1f} s mimo 18–32 s")
    first = beats[0]
    if first["type"] == "pause": warn.append("video nezačíná textem ani replikou (háček)")
    rep = [f"# QC: {SPEC.get('title', EP.name)}", f"Délka: **{TOTAL:.1f} s**" + (f" · hlasitost {loud}" if loud else ""), "",
           "| Prvek | Text | Vidět | Potřeba | Stav |", "|---|---|---|---|---|", *rows, "", "## Upozornění", *(f"- {w}" for w in warn or ["žádná"]), "",
           "## Časová osa", *(f"- {b['t0']:5.1f} s · {b['type']:5} · {b['id']} ({b['d']:.1f} s)" for b in beats)]
    (RENDER / "qc.md").write_text("\n".join(rep), encoding="utf-8"); print("\n".join(rep[:2] + ["Upozornění:"] + (warn or ["žádná"])))
def bi_has_no_text(i): return i not in CHAT_AT

if PREVIEW or NORENDER:
    qc()
    if PREVIEW:
        ts = [b["t0"] + min(b["d"] * 0.7, b["d"] - 0.05) for b in beats]
        tiles = [Image.fromarray(frame(int(x * FPS))).resize((216, 384)) for x in ts]
        cols = 8; rows_n = math.ceil(len(tiles) / cols); sheet = Image.new("RGB", (216 * cols, 384 * rows_n))
        for i, tl in enumerate(tiles): sheet.paste(tl, ((i % cols) * 216, (i // cols) * 384))
        sheet.save(RENDER / "preview.png"); print("náhled:", RENDER / "preview.png")
    sys.exit()

out = RENDER / f"{EP.name}.mp4"
gen = imageio_ffmpeg.write_frames(str(out), (W, H), fps=FPS, codec="libx264", audio_path=str(mix), audio_codec="aac", macro_block_size=1,
                                  output_params=["-pix_fmt", "yuv420p", "-crf", "20", "-af", "loudnorm=I=-14:TP=-1.5", "-ar", "48000", "-shortest"])
gen.send(None)
for fi in range(nfr):
    gen.send(frame(fi).tobytes())
    if fi % 150 == 0: print(f"{fi}/{nfr}", flush=True)
gen.close()
e = subprocess.run([FF, "-hide_banner", "-i", str(out), "-af", "ebur128", "-f", "null", "-"], capture_output=True, text=True).stderr
m = re.findall(r"I:\s+(-?[\d.]+) LUFS", e); loud = f"{m[-1]} LUFS" if m else None
qc(loud)
subprocess.run([FF, "-v", "error", "-y", "-i", str(out), "-vf", "fps=1,scale=180:-1,tile=10x3", "-frames:v", "1", str(RENDER / "sheet.png")])
print("hotovo:", out)
