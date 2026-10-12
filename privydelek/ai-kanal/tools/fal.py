"""Minimal fal.ai klient: python fal.py <endpoint> <json_args_file> <out_dir> [prefix]
Klíč čte z ../drakula/.env, nikdy ho nevypisuje."""
import json, sys, time, urllib.request, urllib.error
from pathlib import Path

ENV = Path(__file__).resolve().parent.parent / ".env"
KEY = next(l.split("=", 1)[1].strip() for l in ENV.read_text().splitlines() if l.startswith("FAL_KEY="))

def call(method, url, body=None):
    req = urllib.request.Request(url, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Authorization": f"Key {KEY}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        sys.exit(f"HTTP {e.code} {url}: {e.read().decode()[:800]}")

endpoint, args_file, out_dir = sys.argv[1], sys.argv[2], Path(sys.argv[3])
prefix = sys.argv[4] if len(sys.argv) > 4 else "out"
out_dir.mkdir(parents=True, exist_ok=True)
args = json.loads(Path(args_file).read_text(encoding="utf-8"))

q = call("POST", f"https://queue.fal.run/{endpoint}", args)
status_url, resp_url = q["status_url"], q["response_url"]
t0 = time.time()
while True:
    s = call("GET", status_url)
    if s.get("status") == "COMPLETED":
        break
    if time.time() - t0 > 900:
        sys.exit("timeout")
    time.sleep(4)
res = call("GET", resp_url)
(out_dir / f"{prefix}.json").write_text(json.dumps(res, indent=2), encoding="utf-8")

media = []
for k in ("images", "video", "audio"):
    v = res.get(k)
    if isinstance(v, dict): v = [v]
    for m in v or []:
        if isinstance(m, dict) and m.get("url"): media.append(m["url"])
for i, url in enumerate(media):
    ext = url.split("?")[0].rsplit(".", 1)[-1][:4]
    p = out_dir / f"{prefix}_{i}.{ext}"
    urllib.request.urlretrieve(url, p)
    print(p)
print(f"hotovo za {time.time() - t0:.0f} s")
