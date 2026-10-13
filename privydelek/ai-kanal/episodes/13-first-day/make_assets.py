"""Záběry pro První den."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter
ROOT = Path(__file__).resolve().parents[2]; GEN = Path(__file__).parent / "gen"
W, H = 1080, 1920
fb = lambda s: ImageFont.truetype("C:/Windows/Fonts/segoeuib.ttf", s)
exec((ROOT / "episodes" / "11-stop-v2" / "make_assets.py").read_text(encoding="utf-8").split("a = cam(")[0])  # fit, cam, tag
OUT = ROOT / "assets" / "stock" / "day1"

def unbrand(im, boxes):  # rozmaže loga aut
    for (cx, cy, r) in boxes:
        reg = im.crop((cx - r, cy - r, cx + r, cy + r)).filter(ImageFilter.GaussianBlur(10)); im.paste(reg, (cx - r, cy - r))
    return im

lot = fit(Image.open(GEN / "lot_1.png").convert("RGB"))
lot = cam(lot, "PARKING CAM 02", "2026-10-14  09:31:40"); dl = ImageDraw.Draw(lot); dl.rectangle((560, 600, 1060, 1000), outline=(225, 40, 40), width=9); dl.rectangle((560, 1000, 1000, 1100), fill=(225, 40, 40)); dl.text((575, 1008), "GREG'S CAR", font=f(66), fill="white"); lot.save(OUT / "cam_lot.jpg", quality=92)
door = unbrand(fit(Image.open(GEN / "door_0.png").convert("RGB")), [(960, 810, 45)])
door = cam(door, "LOBBY CAM 01", "2026-10-14  09:38:02"); door.save(OUT / "cam_door.jpg", quality=92)

bg = fit(Image.open(ROOT / "assets" / "stock" / "17.jpg").convert("RGB")).filter(ImageFilter.GaussianBlur(4))
d = ImageDraw.Draw(bg, "RGBA"); y = 600
d.rounded_rectangle([170, y, W - 170, y + 170], 28, fill=(15, 15, 20, 230))
d.text((215, y + 18), "ORBO · INTERN", font=fb(48), fill=(255, 255, 255))
d.text((215, y + 82), "DAY 1", font=fb(56), fill=(90, 210, 255))
bg.save(OUT / "office_day1.jpg", quality=92)
print("ok")
