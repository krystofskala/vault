"""Orbo: procedurální 3D čuček s očima (numpy + PIL). render(**p) -> RGBA PIL obrázek SIZE x SIZE.

Parametry:
  t        čas (s) pro vlnění
  amp      hlasitost 0..1 (pulz při mluvení)
  sx, sy   zploštění / protažení
  glow     jas 0..1.5
  dim      0..1 (pohasnutí: desaturace a ztmavnutí)
  yaw      natočení kolem svislé osy v radiánech (0 = čelem, pi = zády)
  gaze     (gx, gy) posun pohledu -1..1
  blink    0..1 (1 = zavřené oči)
  eye_shape "normal" | "happy" | "worried"
  tag      True = jmenovka na hrudi
  notes    True = lístečky na zádech
  pencil   0..1 morf na tužku
"""
import math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

SIZE = 720
B = "C:/Windows/Fonts/segoeuib.ttf"; HAND = "C:/Windows/Fonts/segoepr.ttf"
_yy, _xx = np.mgrid[0:SIZE, 0:SIZE].astype(np.float32)
L = np.array([-0.45, -0.65, 0.62]); L /= np.linalg.norm(L)
Hh = (L + np.array([0, 0, 1.0])); Hh /= np.linalg.norm(Hh)
CORE = np.array([0.20, 0.78, 0.95]); RIM = np.array([0.55, 0.35, 1.0])  # tyrkys + fialový okraj

def _smooth(e0, e1, x):
    x = np.clip((x - e0) / (e1 - e0), 0, 1); return x * x * (3 - 2 * x)

def _tag_img():
    im = Image.new("RGBA", (220, 130), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    d.rounded_rectangle([0, 0, 219, 129], 14, fill=(225, 40, 50, 255))
    d.rounded_rectangle([10, 52, 209, 119], 8, fill=(255, 255, 255, 255))
    f1 = ImageFont.truetype(B, 22); f2 = ImageFont.truetype(B, 15); f3 = ImageFont.truetype(HAND, 34)
    d.text((110 - d.textlength("HELLO", font=f1) / 2, 4), "HELLO", font=f1, fill="white")
    d.text((110 - d.textlength("my name is", font=f2) / 2, 30), "my name is", font=f2, fill="white")
    d.text((110 - d.textlength("ORBO", font=f3) / 2, 58), "ORBO", font=f3, fill=(20, 20, 60))
    return im
TAG = _tag_img()

def _notes_img():
    im = Image.new("RGBA", (300, 300), (0, 0, 0, 0)); rnd = np.random.default_rng(7)
    cols = [(255, 236, 110), (255, 214, 120), (190, 240, 160), (255, 180, 200), (255, 236, 110), (180, 220, 255)]
    for i in range(9):
        n = Image.new("RGBA", (92, 92), cols[i % len(cols)] + (255,)); dn = ImageDraw.Draw(n)
        for k in range(3): dn.line([(12, 26 + k * 18), (80 - rnd.integers(0, 30), 26 + k * 18)], fill=(90, 90, 110, 200), width=4)
        n = n.rotate(rnd.uniform(-18, 18), expand=True)
        im.alpha_composite(n, (int(20 + (i % 3) * 82 + rnd.uniform(-8, 8)), int(18 + (i // 3) * 82 + rnd.uniform(-8, 8))))
    return im
NOTES = _notes_img()

def render(t=0.0, amp=0.0, sx=1.0, sy=1.0, glow=1.0, dim=0.0, yaw=0.0, gaze=(0.0, 0.0), blink=0.0,
           eye_shape="normal", tag=False, notes=False, pencil=0.0):
    R = 210.0 * (1 + 0.10 * amp)
    sx = sx * (1 - 0.55 * pencil); sy = sy * (1 + 0.45 * pencil)
    sy *= (1 - 0.18 * dim); sx *= (1 + 0.06 * dim)                          # pohasnutí = splasknutí
    cx, cy = SIZE / 2, SIZE / 2 + 30 * dim
    dx, dy = (_xx - cx) / sx, (_yy - cy) / sy
    d = np.sqrt(dx ** 2 + dy ** 2) + 1e-6; th = np.arctan2(dy, dx)
    wob = 0.030 * np.sin(3 * th + t * 1.6) + 0.020 * np.sin(5 * th - t * 2.2) + amp * 0.05 * np.sin(6 * th + t * 11)
    wob += dim * 0.05 * np.clip(np.sin(th), 0, 1)                           # sag dole
    r = R * (1 + wob); q = d / r
    inside = _smooth(1.0, 0.975, q)
    z = np.sqrt(np.clip(1 - q ** 2, 0, 1)); nx, ny = dx / r, dy / r
    nl = np.sqrt(nx ** 2 + ny ** 2 + z ** 2) + 1e-6; nx, ny, nz = nx / nl, ny / nl, z / nl
    diff = np.clip(nx * L[0] + ny * L[1] + nz * L[2], 0, 1)
    spec = np.clip(nx * Hh[0] + ny * Hh[1] + nz * Hh[2], 0, 1) ** 70
    fres = (1 - nz) ** 2.5
    swirl = 0.5 + 0.5 * np.sin(5 * nx + 3 * ny + t * 0.9 + yaw)
    core = CORE * (1 - 0.6 * dim) + np.array([0.45, 0.45, 0.5]) * 0.6 * dim
    rim = RIM * (1 - 0.6 * dim) + np.array([0.35, 0.35, 0.4]) * 0.6 * dim
    col = core[None, None] * (0.30 + 0.75 * diff[..., None]) * (0.85 + 0.25 * swirl[..., None])
    col += rim[None, None] * fres[..., None] * 1.1
    col += np.array([1, 1, 1])[None, None] * spec[..., None] * (0.9 - 0.5 * dim)
    col *= glow * (1 - 0.35 * dim)
    if pencil > 0.01:  # tuha tužky dole
        tip = (_yy > cy + r * sy * 0.62) & (np.abs(_xx - cx) < (cy + r * sy * 1.25 - _yy) * 0.55)
        col = np.where(tip[..., None], np.array([0.25, 0.22, 0.2]) * (0.6 + 0.4 * diff[..., None]), col)
    rgb = (np.clip(col, 0, 1) * 255).astype(np.uint8)
    alpha = (inside * 255).astype(np.uint8)
    body = Image.fromarray(np.dstack([rgb, alpha]), "RGBA")

    # záře kolem
    halo = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0)); hd = ImageDraw.Draw(halo)
    gr = R * 1.18; gcol = tuple(int(c * 255) for c in (core * 0.9)) + (int(110 * glow * (1 - 0.7 * dim)),)
    hd.ellipse([cx - gr * sx, cy - gr * sy, cx + gr * sx, cy + gr * sy], fill=gcol)
    halo = halo.filter(ImageFilter.GaussianBlur(38))
    out = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0)); out.alpha_composite(halo); out.alpha_composite(body)
    od = ImageDraw.Draw(out)

    # jmenovka a lístečky (natáčí se s yaw)
    def place(img, ang, yoff, scale):
        c = math.cos(yaw - ang)
        if c < 0.15: return
        w = max(2, int(img.width * scale * c * sx)); h = int(img.height * scale * sy)
        im2 = img.resize((w, h)); px = cx + math.sin(yaw - ang) * -R * 0.85 * sx - w / 2
        out.alpha_composite(im2, (int(px), int(cy + yoff * sy - h / 2)))
    if tag: place(TAG, 0.0, R * 0.42, 0.85)
    if notes: place(NOTES, math.pi, R * 0.05, 1.05)

    # oči (dvě tečky na kouli, natočené s yaw)
    gx, gy = gaze
    for side in (-1, 1):
        a = yaw * -1 + side * 0.34
        c = math.cos(a)
        if c < 0.05: continue
        ex = cx + math.sin(a) * R * 0.88 * sx + gx * 14 * c
        ey = cy - R * 0.18 * sy + gy * 12
        ew, eh = 26 * c * (1 - 0.3 * pencil), 46 * (1 - blink) + 3
        if eye_shape == "happy":
            od.arc([ex - ew, ey - eh * 0.5, ex + ew, ey + eh * 0.9], 200, 340, fill=(15, 20, 55, 255), width=11)
        else:
            od.ellipse([ex - ew, ey - eh, ex + ew, ey + eh], fill=(15, 20, 55, 255))
            if blink < 0.6:
                od.ellipse([ex - ew * 0.15 + 6 * c, ey - eh * 0.55, ex + ew * 0.45 + 6 * c, ey - eh * 0.1], fill=(255, 255, 255, 230))
            if eye_shape == "worried":
                od.line([ex - ew * 1.2, ey - eh - 18 - side * 8, ex + ew * 1.2, ey - eh - 18 + side * 8], fill=(15, 20, 55, 255), width=8)
    return out

def shadow(w_scale=1.0, dim=0.0):
    im = Image.new("RGBA", (SIZE, 160), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    w = 190 * w_scale * (1 + 0.1 * dim); d.ellipse([SIZE / 2 - w, 50, SIZE / 2 + w, 110], fill=(0, 0, 0, 120))
    return im.filter(ImageFilter.GaussianBlur(18))
