"""Nahraje soubor do fal CDN a vypíše URL: python fal_upload.py <file>"""
import json, sys, mimetypes, urllib.request, urllib.error
from pathlib import Path
ENV = Path(__file__).resolve().parent.parent / ".env"
KEY = next(l.split("=", 1)[1].strip() for l in ENV.read_text().splitlines() if l.startswith("FAL_KEY="))
p = Path(sys.argv[1]); ct = mimetypes.guess_type(p.name)[0] or "application/octet-stream"
r = urllib.request.Request("https://rest.alpha.fal.ai/storage/upload/initiate?storage_type=fal-cdn-v3", method="POST",
    data=json.dumps({"content_type": ct, "file_name": p.name}).encode(),
    headers={"Authorization": f"Key {KEY}", "Content-Type": "application/json"})
try:
    init = json.loads(urllib.request.urlopen(r, timeout=60).read())
except urllib.error.HTTPError as e:
    sys.exit(f"HTTP {e.code}: {e.read()[:300]}")
put = urllib.request.Request(init["upload_url"], method="PUT", data=p.read_bytes(), headers={"Content-Type": ct})
urllib.request.urlopen(put, timeout=120).read()
print(init["file_url"])
