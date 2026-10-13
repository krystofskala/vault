"""Záběry pro Depending v2."""

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter
ROOT = Path(__file__).resolve().parents[2]; GEN = Path(__file__).parent / "gen"; OUT = ROOT / "assets" / "stock" / "dep2"
W, H = 1080, 1920
fb = lambda s: ImageFont.truetype("C:/Windows/Fonts/segoeuib.ttf", s)
src = (ROOT / "episodes" / "11-stop-v2" / "make_assets.py").read_text(encoding="utf-8").split("a = cam(")[0]
exec(src)  # fit, cam, tag
OUT = ROOT / "assets" / "stock" / "dep2"

fit(Image.open(GEN / "stage_0.png").convert("RGB")).save(OUT / "stage.jpg", quality=92)
fit(Image.open(GEN / "error_0.png").convert("RGB")).save(OUT / "error.jpg", quality=92)
o = cam(Image.open(GEN / "outside_0.png").convert("RGB"), "ENTRANCE CAM 01", "2026-10-14  10:07:55")
tag(o, (300, 700, 800, 1650), "PETE"); o.save(OUT / "cam_outside.jpg", quality=92)

bg = fit(Image.open(ROOT / "assets" / "stock" / "17.jpg").convert("RGB")).filter(ImageFilter.GaussianBlur(4))
d = ImageDraw.Draw(bg, "RGBA"); y = 600
d.rounded_rectangle([190, y, W - 190, y + 170], 28, fill=(15, 15, 20, 230))
d.text((240, y + 40), "DEMO IN", font=fb(64), fill=(255, 255, 255))
d.text((W - 450, y + 28), "2:00", font=fb(88), fill=(255, 70, 70))
bg.save(OUT / "office_demo.jpg", quality=92)
print("ok")
