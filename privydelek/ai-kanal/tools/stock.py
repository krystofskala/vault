"""Cílené stahování stock fotek z Pixabay podle scén scénáře.
python stock.py <out_dir> "scena1=dotaz A|dotaz B" "scena2=dotaz C" ... [--people] [--n 8]
Výstup: <out_dir>/<scena>/NN.jpg, index.json se zdrojem a licenční stránkou, a náhled <scena>/nahled.png.
Bez --people se vyřadí fotky, které mají v tazích lidi."""
import json, sys, subprocess, urllib.request, urllib.parse
from pathlib import Path

ENV = Path(__file__).resolve().parent.parent / "drakula" / ".env"
KEY = next(l.split("=", 1)[1].strip() for l in ENV.read_text().splitlines() if l.startswith("PIXABAY_API_KEY="))
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"}
PEOPLE = {"woman", "man", "people", "person", "girl", "boy", "businessman", "businesswoman", "team", "women", "men", "child", "face", "portrait", "worker", "employee"}
BRANDS = {"apple", "imac", "macbook", "iphone", "hp", "epson", "canon", "samsung", "microsoft", "google", "dell", "lenovo", "nike", "starbucks", "coca-cola"}

def get(u): return urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=60).read()

args = sys.argv[2:]
out = Path(sys.argv[1]); people = "--people" in args
n = int(args[args.index("--n") + 1]) if "--n" in args else 8
scenes = [a for a in args if "=" in a]
FF = None
try:
    import imageio_ffmpeg; FF = imageio_ffmpeg.get_ffmpeg_exe()
except ImportError: pass

for sc in scenes:
    name, queries = sc.split("=", 1)
    d = out / name; d.mkdir(parents=True, exist_ok=True)
    hits, seen = [], set()
    for q in queries.split("|"):
        for orient in ("vertical", "horizontal"):
            url = "https://pixabay.com/api/?" + urllib.parse.urlencode({"key": KEY, "q": q, "image_type": "photo", "orientation": orient,
                                                                         "safesearch": "true", "per_page": 30, "order": "popular"})
            for h in json.loads(get(url)).get("hits", []):
                tags = {t.strip().lower() for t in h["tags"].split(",")}
                if h["id"] in seen or (not people and tags & PEOPLE) or tags & BRANDS: continue
                seen.add(h["id"]); hits.append({"id": h["id"], "q": q, "orient": orient, "tags": h["tags"], "url": h["largeImageURL"], "page": h["pageURL"]})
    hits = sorted(hits, key=lambda h: h["orient"] != "vertical")[:n]  # vertikální napřed
    for i, h in enumerate(hits, 1):
        h["file"] = f"{i:02d}.jpg"; (d / h["file"]).write_bytes(get(h["url"]))
    (d / "index.json").write_text(json.dumps(hits, indent=1))
    if FF and hits:
        ins, fc, vs, lay = [], "", "", []
        for i, h in enumerate(hits):
            ins += ["-i", str(d / h["file"])]
            fc += (f"[{i}]scale=270:480:force_original_aspect_ratio=increase,crop=270:480,"
                   f"drawtext=text='{i+1:02d}':x=6:y=6:fontsize=28:fontcolor=yellow:borderw=2:fontfile='C\\:/Windows/Fonts/arialbd.ttf'[v{i}];")
            vs += f"[v{i}]"; lay.append(f"{(i % 4) * 270}_{(i // 4) * 480}")
        mix = f"{fc}{vs}xstack=inputs={len(hits)}:layout={'|'.join(lay)}:fill=black" if len(hits) > 1 else f"{fc}[v0]null"
        subprocess.run([FF, "-v", "error", "-y", *ins, "-filter_complex", mix, str(d / "nahled.png")], check=True)
    print(name, len(hits), "fotek")
