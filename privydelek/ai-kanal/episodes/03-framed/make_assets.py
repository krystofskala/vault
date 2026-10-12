"""Pozadí pro epizodu Framed: jeřáb za oknem a obří zlatý rám s tabulkou."""
import random
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageEnhance

ROOT = Path(__file__).resolve().parents[2]; ST = ROOT / "assets" / "stock"
W, H = 1080, 1920
def crop916(path, cx=0.5):
    im = Image.open(path).convert("RGB"); w, h = im.size; tw = int(h * W / H)
    if tw <= w: x = int((w - tw) * cx); im = im.crop((x, 0, x + tw, h))
    return im.resize((W, H), Image.LANCZOS)

# 1) jeřáb za oknem: fotka + rám okna, žaluzie nahoře a parapet
crane = crop916(ST / "framed" / "jerab" / "07.jpg", 0.5)
cv = Image.new("RGBA", (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(cv)
frame_c = (235, 235, 230, 255)
d.rectangle([0, 0, W, 110], fill=frame_c); d.rectangle([0, H - 360, W, H], fill=(225, 222, 215, 255))
d.rectangle([0, 0, 70, H], fill=frame_c); d.rectangle([W - 70, 0, W, H], fill=frame_c); d.rectangle([W // 2 - 22, 0, W // 2 + 22, H - 360], fill=frame_c)
for k in range(9): d.rectangle([70, 110 + k * 26, W - 70, 110 + k * 26 + 14], fill=(240, 240, 236, 235))  # vytažené žaluzie
d.rectangle([0, H - 380, W, H - 360], fill=(200, 196, 188, 255))
img = Image.alpha_composite(crane.convert("RGBA"), cv)
img.convert("RGB").save(ST / "framed" / "crane_window.jpg", quality=92)

# 2) obří zlatý rám s tabulkou, který mizí nad horní okraj (do stropu)
wall = ImageEnhance.Brightness(crop916(ST / "v11.jpg", 0.5)).enhance(0.95).convert("RGBA")
fx0, fx1, fy0, fy1 = 90, 990, -400, 1480
fr = Image.new("RGBA", (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(fr)
d.rectangle([fx0 + 20, fy0 + 30, fx1 + 30, fy1 + 40], fill=(0, 0, 0, 90))          # stín
for k, c in enumerate([(150, 110, 30), (212, 170, 60), (245, 210, 110), (200, 155, 45), (170, 125, 35)]):
    d.rectangle([fx0 + k * 14, fy0 + k * 14, fx1 - k * 14, fy1 - k * 14], outline=c + (255,), width=14)
px0, py0, px1, py1 = fx0 + 70, fy0 + 70, fx1 - 70, fy1 - 70
d.rectangle([px0, py0, px1, py1], fill=(252, 252, 250, 255))
f = ImageFont.truetype("C:/Windows/Fonts/consola.ttf", 17); fb = ImageFont.truetype("C:/Windows/Fonts/consolab.ttf", 17)
r = random.Random(3); cols = [90, 150, 105, 105, 105, 105, 110]; y = py1 - 30; row = 4812
while y > py0 + 10:  # od spodu: řádky až po 4812, nahoru mizí
    x = px0 + 10; d.line([(px0, y + 22), (px1, y + 22)], fill=(225, 225, 228, 255))
    vals = [str(row), r.choice(["Revenue", "Costs", "Q3 adj.", "EBITDA", "Margin", "Units"]), *(f"{r.randint(1000, 99999):,}" for _ in range(4)), f"{r.uniform(-9, 24):.1f}%"]
    for w_, v in zip(cols, vals): d.text((x, y), v, font=f, fill=(60, 60, 70, 255)); x += w_
    y -= 26; row -= 1
for xx in [px0 + sum(cols[:k]) + 4 for k in range(1, len(cols))]: d.line([(xx, py0), (xx, py1)], fill=(220, 220, 225, 255))
d.rectangle([px0, py1 - 60, px1, py1], fill=(66, 110, 230, 255)); d.text((px0 + 16, py1 - 46), "Q3 SPREADSHEET  ·  rows 1–4,812", font=fb, fill="white")
img = Image.alpha_composite(wall, fr)
img.convert("RGB").save(ST / "framed" / "frame_wall.jpg", quality=92)
print("ok")
