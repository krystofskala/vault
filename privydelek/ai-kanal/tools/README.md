# Nástroje pro výrobu AI shorts

Skripty, ze kterých vznikly Drákula ep. 1–2 a Orbo „Day 47“ a „Meeting Notes“. API klíče nejsou v gitu. Čtou se ze souboru `drakula/.env` vedle složky s nástroji (FAL_KEY, ELEVENLABS_API_KEY, PIXABAY_API_KEY).

| Soubor | K čemu |
|---|---|
| `fal.py`, `fal_upload.py` | volání modelů na fal.ai (obrázky Nano Banana 2, video OmniHuman / Kling) a nahrání souborů |
| `el.py` | ElevenLabs: seznam modelů, Voice Design, TTS (`tts <voice> <model> <text> <out> [speed]`) |
| `stock.py` | cílené stahování stock fotek z Pixabay podle scén (+ náhled k výběru) |
| `orbo_char.py` | procedurální render Orba (emoce, natočení, jmenovka, lístečky, tužka) |
| `orbo_ep02.py` | „Meeting Notes“: zatím nejlepší šablona epizody (chat, dokument, Orbo, titulky, SFX, hudba) |
| `orbo_ep01.py` | „Day 47“ (zamítnutý scénář, výroba použitelná: lístečky, kalendář, tiskárna) |
| `edit_ep01.py`, `ep02b.py`, `animatic_audio.py` | střih Drákuly (animatik, punch-iny, víko rakve, CAPTCHA obrazovky) |
| `HUDBA-LICENCE.md` | licence a kredity hudby |

Python: numpy, pillow, imageio-ffmpeg (venv).
Pravidla výroby: `../playbook.md`.
