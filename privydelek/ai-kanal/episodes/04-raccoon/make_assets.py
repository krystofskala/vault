"""Záběry bezpečnostní kamery pro epizodu Raccoon."""
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageEnhance, ImageOps

ROOT = Path(__file__).resolve().parents[2]; ST = ROOT / "assets" / "stock" / "raccoon"; OUT = ST
W, H = 1080, 1920
B = "C:/Windows/Fonts/consolab.ttf"
f = lambda s: ImageFont.truetype(B, s)

def crop916(im, cx=0.5):
    w, h = im.size; tw = int(h * W / H)
    if tw <= w: x = int((w - tw) * cx); im = im.crop((x, 0, x + tw, h))
    else:
        th = int(w * H / W); y = (h - th) // 2; im = im.crop((0, y, w, y + th))
    return im.resize((W, H), Image.LANCZOS)

def cctv(img):
    g = ImageOps.grayscale(img); g = ImageEnhance.Contrast(g).enhance(1.25)
    a = np.asarray(g).astype(np.float32)
    a += np.random.default_rng(1).normal(0, 9, a.shape)
    yy, xx = np.mgrid[0:H, 0:W]; v = 1 - 0.45 * (((xx - W / 2) / (W / 1.2)) ** 2 + ((yy - H / 2) / (H / 1.2)) ** 2)
    a = np.clip(a * v, 0, 255); a[::4] *= 0.93  # řádkování
    im = Image.fromarray(a.astype(np.uint8)).convert("RGB")
    im = Image.blend(im, Image.new("RGB", (W, H), (40, 70, 60)), 0.12)
    d = ImageDraw.Draw(im)
    d.text((50, 250), "KITCHEN CAM 02", font=f(52), fill=(235, 235, 235))
    d.text((50, 315), "2026-10-14  09:12:07", font=f(40), fill=(220, 220, 220))
    d.ellipse([W - 230, 255, W - 195, 290], fill=(230, 30, 30)); d.text((W - 180, 248), "REC", font=f(52), fill=(235, 235, 235))
    return im

def raccoon_icon(sz):
    ic = Image.new("RGBA", (sz, sz), (0, 0, 0, 0)); d = ImageDraw.Draw(ic); s = sz / 100
    d.polygon([(15 * s, 40 * s), (25 * s, 5 * s), (40 * s, 30 * s)], fill=(120, 120, 125)); d.polygon([(85 * s, 40 * s), (75 * s, 5 * s), (60 * s, 30 * s)], fill=(120, 120, 125))
    d.ellipse([10 * s, 20 * s, 90 * s, 95 * s], fill=(150, 150, 155))
    d.rounded_rectangle([14 * s, 42 * s, 86 * s, 64 * s], 10 * s, fill=(30, 30, 35))
    d.ellipse([28 * s, 47 * s, 40 * s, 59 * s], fill="white"); d.ellipse([60 * s, 47 * s, 72 * s, 59 * s], fill="white")
    d.ellipse([44 * s, 72 * s, 56 * s, 82 * s], fill=(20, 20, 20))
    return ic

def box(im, xy, label, color, icon=False):
    d = ImageDraw.Draw(im); x0, y0, x1, y1 = xy
    d.rectangle(xy, outline=color, width=9)
    fl = f(66); tw = d.textlength(label, font=fl) + (96 if icon else 0)
    lx = min(x0, W - 20 - (tw + 30))  # popisek nesmí přetéct okraj
    d.rectangle([lx, y0 - 100, lx + tw + 30, y0], fill=color)
    tx = lx + 15
    if icon: im.paste(raccoon_icon(86), (int(tx), int(y0 - 94)), raccoon_icon(86)); tx += 96
    d.text((tx, y0 - 92), label, font=fl, fill="white")

dog = crop916(Image.open(ST / "pes2" / "06.jpg").convert("RGB"), 0.45)
base = cctv(dog)
DOGBOX = (60, 470, 1040, 1720)

a = base.copy(); box(a, DOGBOX, "RACCOON 97%", (225, 40, 40), icon=True); a.save(OUT / "cctv_97.jpg", quality=92)
b = base.copy(); box(b, DOGBOX, "RACCOON (friendly) 98%", (225, 40, 40), icon=True); b.save(OUT / "cctv_friendly.jpg", quality=92)

# finální záběr: pes zmenšený vlevo, muž v saku (vyříznutý podle jasu) vpravo
man = Image.open(ST / "sako" / "02.jpg").convert("RGB"); mw, mh = man.size
man = man.crop((int(mw * 0.36), int(mh * 0.08), int(mw * 0.98), mh))
lum = np.asarray(ImageOps.grayscale(man)).astype(np.float32)
mask = Image.fromarray(((lum < 95) * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.MinFilter(7)).filter(ImageFilter.GaussianBlur(3))
scale = 1500 / man.height; man = man.resize((int(man.width * scale), 1500)); mask = mask.resize(man.size)
mg = ImageOps.grayscale(man).convert("RGB")
c = cctv(crop916(Image.open(ST / "pes2" / "06.jpg").convert("RGB"), 0.15))  # pes vlevo, vpravo místo pro muže
c.paste(mg, (W - man.width + 120, H - 1500 + 60), mask)
c = Image.fromarray(np.asarray(c)); d = ImageDraw.Draw(c)
box(c, (40, 960, 620, 1760), "DOG 99%", (40, 170, 80))
box(c, (W - man.width + 220, 700, W - 30, 1880), "RACCOON (large) 96%", (225, 40, 40), icon=True)
c.save(OUT / "cctv_final.jpg", quality=92)
# deratizace v hale (stříbrné obleky)
pc = cctv(crop916(Image.open(ST / "derat2" / "02.jpg").convert("RGB"), 0.55))
dd = ImageDraw.Draw(pc); dd.rectangle([0, 240, 600, 380], fill=(0, 0, 0)); dd.text((50, 250), "LOBBY CAM 01", font=f(52), fill=(235, 235, 235)); dd.text((50, 315), "2026-10-14  09:19:44", font=f(40), fill=(220, 220, 220))
box(pc, (120, 700, 980, 1800), "PEST CONTROL", (225, 140, 30))
pc.save(OUT / "cctv_pest.jpg", quality=92)
print("ok")
