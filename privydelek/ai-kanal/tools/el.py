"""ElevenLabs helper: python el.py models | design <out_dir> | tts <voice_id> <model_id> <text_file> <out_mp3>"""
import json, sys, base64, urllib.request, urllib.error
from pathlib import Path
ENV = Path(__file__).resolve().parent.parent / ".env"
KEY = next(l.split("=", 1)[1].strip() for l in ENV.read_text().splitlines() if l.startswith("ELEVENLABS_API_KEY="))
API = "https://api.elevenlabs.io"

def req(method, path, body=None, raw=False):
    r = urllib.request.Request(API + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                               headers={"xi-api-key": KEY, "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(r, timeout=180) as resp:
            data = resp.read()
            return data if raw else json.loads(data)
    except urllib.error.HTTPError as e:
        sys.exit(f"HTTP {e.code} {path}: {e.read().decode()[:600]}")

cmd = sys.argv[1]
if cmd == "models":
    for m in req("GET", "/v1/models"):
        print(m["model_id"], "|", m.get("name"), "| tts:", m.get("can_do_text_to_speech"))
elif cmd == "design":
    out = Path(sys.argv[2]); out.mkdir(parents=True, exist_ok=True)
    body = {
        "voice_description": "A very old aristocratic Eastern European count, deep resonant baritone, slow and theatrical delivery, "
                             "dry wit, dignified but slightly offended by everything, subtle Transylvanian accent, intimate close microphone, studio quality.",
        "text": "Day one of the twenty-first century. I have purchased... a telephone. It wants my face. "
                "I have no reflection. The telephone thinks I am... nobody. And a special character? I. AM. A special character.",
    }
    try:
        res = req("POST", "/v1/text-to-voice/design", body)
    except SystemExit as e:
        print(e); res = req("POST", "/v1/text-to-voice/create-previews", body)
    for i, p in enumerate(res["previews"]):
        (out / f"hlas_{i+1}.mp3").write_bytes(base64.b64decode(p["audio_base_64"]))
        print(f"hlas_{i+1}.mp3", p["generated_voice_id"])
    (out / "previews.json").write_text(json.dumps([{"i": i + 1, "id": p["generated_voice_id"]} for i, p in enumerate(res["previews"])]))
elif cmd == "tts":
    voice, model, text_file, out = sys.argv[2:6]
    audio = req("POST", f"/v1/text-to-speech/{voice}?output_format=mp3_44100_128",
                {"text": Path(text_file).read_text(encoding="utf-8"), "model_id": model, "voice_settings": {"speed": float(sys.argv[6]) if len(sys.argv) > 6 else 1.0}}, raw=True)
    Path(out).write_bytes(audio); print(out)
elif cmd == "save":
    gid, name = sys.argv[2], sys.argv[3]
    r = req("POST", "/v1/text-to-voice", {"voice_name": name, "generated_voice_id": gid,
            "voice_description": "A very old aristocratic Eastern European count, deep resonant baritone, slow theatrical delivery, dry wit, slightly offended by everything."})
    print(r["voice_id"])
elif cmd == "design2":
    out = Path(sys.argv[2]); out.mkdir(parents=True, exist_ok=True)
    body = {"voice_description": Path(sys.argv[3]).read_text(encoding="utf-8"), "text": Path(sys.argv[4]).read_text(encoding="utf-8")}
    res = req("POST", "/v1/text-to-voice/design", body)
    for i, p in enumerate(res["previews"]):
        (out / f"hlas_{i+1}.mp3").write_bytes(base64.b64decode(p["audio_base_64"]))
        print(f"hlas_{i+1}.mp3", p["generated_voice_id"])
    (out / "previews.json").write_text(json.dumps([{"i": i + 1, "id": p["generated_voice_id"]} for i, p in enumerate(res["previews"])]))
