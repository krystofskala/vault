"""Střih epizody 1: python edit_ep01.py <v2_dir> <master.wav> <out.mp4>"""
import sys, random, subprocess
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import imageio_ffmpeg

V, MASTER, OUT = Path(sys.argv[1]), sys.argv[2], sys.argv[3]
FF = imageio_ffmpeg.get_ffmpeg_exe()
W, H, FPS = 1080, 1920, 30
TMP = V / "edit"; TMP.mkdir(exist_ok=True)
B = "C:/Windows/Fonts/segoeuib.ttf"; SYM = "C:/Windows/Fonts/seguisym.ttf"
f = lambda p, s: ImageFont.truetype(p, s)

def run(args):
    subprocess.run([FF, "-v", "error", "-y", *args], check=True)

# ---------- obrazovky telefonu (lokální render) ----------------------------
def phone_bg():
    g = np.linspace(0, 1, H)[:, None]
    a = (np.array([18, 18, 28]) * (1 - g) + np.array([8, 8, 14]) * g)[:, None, :].repeat(W, 1)
    return Image.fromarray(a.astype(np.uint8))

def center(d, y, text, font, fill):
    d.text(((W - d.textlength(text, font=font)) / 2, y), text, font=font, fill=fill)

def screen_face(variant):
    im = phone_bg(); d = ImageDraw.Draw(im)
    # obrys obličeje (Face unlock) přeškrtnutý
    cx, cy = W // 2, 700
    for (x0, y0, x1, y1) in [(-170, -170, -90, -170), (-170, -170, -170, -90), (170, -170, 90, -170), (170, -170, 170, -90),
                             (-170, 170, -90, 170), (-170, 170, -170, 90), (170, 170, 90, 170), (170, 170, 170, 90)]:
        d.line([(cx + x0, cy + y0), (cx + x1, cy + y1)], fill=(255, 70, 70), width=14)
    d.ellipse([cx - 60, cy - 40, cx - 30, cy - 10], fill=(255, 70, 70)); d.ellipse([cx + 30, cy - 40, cx + 60, cy - 10], fill=(255, 70, 70))
    d.arc([cx - 70, cy + 10, cx + 70, cy + 110], 200, 340, fill=(255, 70, 70), width=12)
    center(d, 960, "Face not recognized", f(B, 72), (255, 255, 255))
    center(d, 1060, "Try again" if variant < 2 else "Still nobody.", f(B, 52), (170, 170, 190))
    return im

def screen_password(stage, prog):
    im = phone_bg(); d = ImageDraw.Draw(im)
    center(d, 420, "Create password", f(B, 80), (255, 255, 255))
    typed = "Dracula1897"[: max(1, int(len("Dracula1897") * min(1, prog * 1.6)))] if stage == 0 else "Dracula1897"
    d.rounded_rectangle([110, 600, W - 110, 760], 30, fill=(40, 40, 58))
    d.text((150, 640), "•" * len(typed) + ("|" if int(prog * 8) % 2 == 0 else ""), font=f(B, 70), fill=(255, 255, 255))
    rules = [("Capital letter", True), ("Number", True), ("Special character", False)]
    for i, (r, ok) in enumerate(rules):
        y = 880 + i * 120
        hl = stage == 1 and not ok
        col = (90, 220, 120) if ok else ((255, 80, 80) if hl else (150, 150, 170))
        d.text((150, y), "✓" if ok else "✗", font=f(SYM, 70), fill=col)
        d.text((250, y + 4), r, font=f(B, 62 if not hl else 70), fill=(255, 255, 255) if not hl else (255, 90, 90))
    return im

def screen_weak():
    im = screen_password(1, 1.0); d = ImageDraw.Draw(im)
    d.rounded_rectangle([90, 1350, W - 90, 1560], 40, fill=(200, 40, 50))
    center(d, 1405, "Password too weak", f(B, 80), (255, 255, 255))
    return im

def frames_to_clip(frames_fn, dur, name, shake=0.0, zoom=(1.0, 1.0)):
    n = max(1, round(dur * FPS)); d = TMP / name; d.mkdir(exist_ok=True)
    rnd = random.Random(name)
    for i in range(n):
        p = i / max(1, n - 1)
        im = frames_fn(p)
        z = zoom[0] + (zoom[1] - zoom[0]) * p
        if z != 1.0:
            w2, h2 = int(W / z), int(H / z); im = im.crop(((W - w2) // 2, (H - h2) // 2, (W + w2) // 2, (H + h2) // 2)).resize((W, H))
        if shake:
            amp = shake * (1 - p) * 40
            im = im.transform((W, H), Image.AFFINE, (1, 0, rnd.uniform(-amp, amp), 0, 1, rnd.uniform(-amp, amp)), fillcolor=(10, 10, 16))
        im.save(d / f"{i:04d}.png")
    out = TMP / f"{name}.mp4"
    run(["-framerate", str(FPS), "-i", str(d / "%04d.png"), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-r", str(FPS), str(out)])
    return out

# ---------- video záběry ----------------------------------------------------
def video_clip(src, ss, dur, name, zooms=None, lid=False):
    """zooms: [(t_rel, faktor)] skokové přiblížení (rytmické punch-iny)"""
    if zooms:  # rozdělit na podzáběry se skokovým zoomem a spojit
        cuts = [(0.0, 1.0)] + list(zooms)
        parts = []
        for k, (t0, z) in enumerate(cuts):
            t1 = cuts[k + 1][0] if k + 1 < len(cuts) else dur
            zw, zh = int(W * z) // 2 * 2, int(H * z) // 2 * 2
            vf = (f"scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},scale={zw}:{zh},"
                  f"crop={W}:{H}:{(zw - W) // 2}:{(zh - H) // 3},fps={FPS},setsar=1")
            p = TMP / f"{name}_{k}.mp4"
            run(["-ss", str(ss + t0), "-i", str(src), "-t", str(round(t1 - t0, 3)), "-an", "-vf", vf,
                 "-c:v", "libx264", "-pix_fmt", "yuv420p", "-r", str(FPS), str(p)])
            parts.append(p)
        l = TMP / f"{name}.txt"; l.write_text("".join(f"file '{p.as_posix()}'\n" for p in parts))
        out = TMP / f"{name}.mp4"
        run(["-f", "concat", "-safe", "0", "-i", str(l), "-c", "copy", str(out)])
        return out
    vf = f"scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},fps={FPS},setsar=1"
    out = TMP / f"{name}.mp4"
    if lid:  # víko rakve (černá plocha) sjede shora v posledních 0,45 s
        t0 = dur - 0.32
        run(["-ss", str(ss), "-i", str(src), "-f", "lavfi", "-i", f"color=c=black:s={W}x{H}:r={FPS}", "-t", str(dur), "-an",
             "-filter_complex", f"[0:v]{vf}[b];[b][1:v]overlay=x=0:y='min(0,-{H}+max(0,t-{t0})*{H}/0.3)':shortest=1",
             "-c:v", "libx264", "-pix_fmt", "yuv420p", "-r", str(FPS), str(out)])
        return out
    run(["-ss", str(ss), "-i", str(src), "-t", str(dur), "-an", "-vf", vf, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-r", str(FPS), str(out)])
    return out

def black(dur, name):
    out = TMP / f"{name}.mp4"
    run(["-f", "lavfi", "-i", f"color=c=black:s={W}x{H}:r={FPS}:d={dur}", "-c:v", "libx264", "-pix_fmt", "yuv420p", str(out)])
    return out

total = float(subprocess.run([FF, "-i", MASTER], capture_output=True, text=True).stderr.split("Duration: ")[1].split(",")[0].split(":")[2])
segs = [
    video_clip(V / "vid_A1_0.mp4", 0.6, 1.36, "s01"),
    video_clip(V / "vid_A2n_0.mp4", 0.3, 3.64, "s02"),
    video_clip(V / "A3vid_0.mp4", 0.0, 1.92, "s03"),
    frames_to_clip(lambda p: screen_face(0), 0.48, "s04", shake=1.0),
    video_clip(V / "vid_A4_0.mp4", 0.0, 2.15, "s05", zooms=[(0.05, 1.12)]),
    frames_to_clip(lambda p: screen_face(1), 0.40, "s06", shake=1.0, zoom=(1.15, 1.25)),
    video_clip(V / "vid_A5_0.mp4", 0.0, 3.56, "s07", zooms=[(1.56, 1.35)]),
    frames_to_clip(lambda p: screen_face(2), 0.29, "s08", shake=1.4, zoom=(1.4, 1.5)),
    video_clip(V / "vid_A6_0.mp4", 0.5, 1.97, "s09"),
    video_clip(V / "vid_A7_0.mp4", 0.3, 2.53, "s10"),
    frames_to_clip(lambda p: screen_password(0, p), 1.91, "s11"),
    frames_to_clip(lambda p: screen_password(1, 1.0), 2.16, "s12", zoom=(1.0, 1.35)),
    video_clip(V / "vid_A9_0.mp4", 0.0, 4.35, "s13", zooms=[(1.37, 1.3), (2.01, 1.7), (2.85, 1.0)]),
    frames_to_clip(lambda p: screen_weak(), 0.48, "s14", shake=1.0),
    video_clip(V / "vid_A10_0.mp4", 0.05, 1.02, "s15a"),
    video_clip(V / "vid_A10_0.mp4", 1.45, 2.25, "s15", lid=True),
]
# zrychlený konec: vystřihnout pauzy z master audia
CUTS = [(27.20, 27.45), (28.47, 28.85)]; END = 31.70
keep, prev = [], 0.0
for a, b in CUTS: keep.append((prev, a)); prev = b
keep.append((prev, END))
fc = "".join(f"[0:a]atrim={a}:{b},asetpts=PTS-STARTPTS[a{i}];" for i, (a, b) in enumerate(keep))
fc += "".join(f"[a{i}]" for i in range(len(keep))) + f"concat=n={len(keep)}:v=0:a=1[out]"
cut_master = TMP / "master_cut.wav"
run(["-i", MASTER, "-filter_complex", fc, "-map", "[out]", str(cut_master)])
MASTER = str(cut_master); total = END - sum(b - a for a, b in CUTS)
used = 30.47
segs.append(black(round(total - used, 2), "s16"))
lst = TMP / "list.txt"; lst.write_text("".join(f"file '{p.as_posix()}'\n" for p in segs))
silent = TMP / "silent.mp4"
run(["-f", "concat", "-safe", "0", "-i", str(lst), "-c", "copy", str(silent)])

# ---------- titulky ----------------------------------------------------------
CAPS = [  # (od, do, text, zvýraznit)
    (0.00, 0.75, "DAY ONE.", False), (1.36, 2.12, "I bought…", False), (2.82, 3.83, "…a telephone.", False),
    (5.15, 6.80, "It wants my face.", False), (7.45, 9.45, "This IS my face.", True),
    (10.02, 10.55, "Look…", False), (11.51, 12.96, "…into my eyes.", True),
    (14.98, 15.77, "…Ah.", False), (16.78, 17.79, "No reflection.", True),
    (18.32, 19.70, "Fine. A password.", False),
    (23.74, 24.24, "I.", True), (24.38, 24.99, "AM.", True), (25.22, 26.59, "A SPECIAL CHARACTER.", True),
    (27.33, 28.18, "Day one.", False), (28.25, 29.57, "The telephone wins.", False),
]
inputs, chain, last = [], "", "[0:v]"
for i, (a, b, text, hl) in enumerate(CAPS):
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    font = f(B, 96 if len(text) < 14 else 80)
    tw = d.textlength(text, font=font)
    d.text(((W - tw) / 2, H * 0.70), text, font=font, fill=(255, 214, 60) if hl else (255, 255, 255), stroke_width=9, stroke_fill=(0, 0, 0))
    p = TMP / f"cap{i:02d}.png"; im.save(p)
    inputs += ["-i", str(p)]
    chain += f"{last}[{i + 2}:v]overlay=enable='between(t,{a},{b})'[c{i}];"; last = f"[c{i}]"
# AI štítek v rohu po celou dobu
tag = Image.new("RGBA", (W, H), (0, 0, 0, 0)); ImageDraw.Draw(tag).text((W - 210, H - 90), "AI-made", font=f(B, 34), fill=(200, 200, 210, 150))
tp = TMP / "tag.png"; tag.save(tp)
inputs += ["-i", str(tp)]; chain += f"{last}[{len(CAPS) + 2}:v]overlay[vout]"
run(["-i", str(silent), "-i", MASTER, *inputs, "-filter_complex", chain, "-map", "[vout]", "-map", "1:a",
     "-c:v", "libx264", "-crf", "19", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-ar", "44100",
     "-af", "loudnorm=I=-14:TP=-1.5", "-shortest", OUT])
print("hotovo", OUT)
