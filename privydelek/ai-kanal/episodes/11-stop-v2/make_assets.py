"""Záběry kamer a úvodní pozadí pro STOP v2."""
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageEnhance, ImageFilter

ROOT = Path(__file__).resolve().parents[2]; GEN = Path(__file__).parent / "gen"; OUT = ROOT / "assets" / "stock" / "stop2"
W, H = 1080, 1920
f = lambda s: ImageFont.truetype("C:/Windows/Fonts/consolab.ttf", s)
fb = lambda s: ImageFont.truetype("C:/Windows/Fonts/segoeuib.ttf", s)

def fit(im):
    s = max(W / im.width, H / im.height); im = im.resize((int(im.width * s + 1), int(im.height * s + 1)), Image.LANCZOS)
    x, y = (im.width - W) // 2, (im.height - H) // 2; return im.crop((x, y, x + W, y + H))

def cam(img, name, ts):
    im = ImageEnhance.Color(fit(img)).enhance(0.55); im = ImageEnhance.Contrast(im).enhance(1.1)
    a = np.asarray(im).astype(np.float32); a += np.random.default_rng(2).normal(0, 7, a.shape)
    yy, xx = np.mgrid[0:H, 0:W]; v = 1 - 0.4 * (((xx - W / 2) / (W / 1.2)) ** 2 + ((yy - H / 2) / (H / 1.2)) ** 2)
    a = np.clip(a * v[..., None], 0, 255); a[::4] *= 0.94
    im = Image.fromarray(a.astype(np.uint8)); d = ImageDraw.Draw(im)
    d.rectangle([0, 0, W, 200], fill=(0, 0, 0))  # překryje timestamp z generátoru
    d.text((50, 70), name, font=f(52), fill=(235, 235, 235)); d.text((50, 132), ts, font=f(40), fill=(220, 220, 220))
    d.ellipse([W - 230, 75, W - 195, 110], fill=(230, 30, 30)); d.text((W - 180, 68), "REC", font=f(52), fill=(235, 235, 235))
    return im

def tag(im, xy, label, color=(225, 40, 40)):
    d = ImageDraw.Draw(im); x0, y0, x1, y1 = xy; d.rectangle(xy, outline=color, width=9)
    tw = d.textlength(label, font=f(66)); d.rectangle([x0, y0 - 100, x0 + tw + 30, y0], fill=color); d.text((x0 + 15, y0 - 92), label, font=f(66), fill="white")

a = cam(Image.open(GEN / "behind_0.png").convert("RGB"), "HALL CAM 03", "2026-10-14  10:41:12")
tag(a, (320, 690, 780, 1580), "PETE"); a.save(OUT / "cam_sprint.jpg", quality=92)
b = cam(Image.open(GEN / "squash_1.png").convert("RGB"), "SERVER ROOM CAM", "2026-10-14  10:41:19")
b.save(OUT / "cam_glass.jpg", quality=92)

# úvodní pozadí: kancelář + ukazatel plného disku
o = fit(Image.open(ROOT / "assets" / "stock" / "17.jpg").convert("RGB")).filter(ImageFilter.GaussianBlur(4))
d = ImageDraw.Draw(o, "RGBA"); y = 600
d.rounded_rectangle([90, y, W - 90, y + 190], 28, fill=(15, 15, 20, 225))
d.text((130, y + 22), "SHARED DRIVE", font=fb(44), fill=(255, 255, 255))
d.text((W - 330, y + 22), "99% FULL", font=fb(44), fill=(255, 80, 80))
d.rounded_rectangle([130, y + 100, W - 130, y + 160], 16, fill=(70, 70, 80))
d.rounded_rectangle([130, y + 100, 130 + int((W - 260) * 0.99), y + 160], 16, fill=(225, 45, 45))
o.save(OUT / "office_full.jpg", quality=92)
print("ok")
