---
name: orbo-video
description: Vyrobí video epizody Orba z episode.json (hlas ElevenLabs Harry, render lokálně, hudba, titulky), zkontroluje ho podle playbooku a pošle uživateli. Použij po schválení scénáře nebo na /orbo-video <složka epizody>.
---

# Orbo: výroba videa

Pracovní složka: `C:\Users\Admin\ai-kanal`. Python: `venv\Scripts\python`. Klíče jsou v `.env`, nikdy je nevypisuj.

1. **Náhled a kontrola:** `venv\Scripts\python -I tools\orbo_engine.py episodes\<epizoda> --preview`
   - Přečti `render\qc.md`. Všechna upozornění vyřeš úpravou episode.json, ne ručním zkracováním (pravidlo čtení: znaky / 15 + 0,5 s).
   - Prohlédni `render\preview.png`: useknuté texty, prázdné čtverečky místo emoji, překryvy, značky.
2. **Pozadí:** výchozí je kancelář `17.jpg`. Pro nové scény stáhni cílené fotky:
   `venv\Scripts\python -I tools\stock.py assets\stock\<scena> "scena=dotaz|dotaz"`
   Vyber bez log a pošli uživateli náhled k výběru.
3. **Render:** `venv\Scripts\python -I tools\orbo_engine.py episodes\<epizoda>`
4. **Kontrola po snímcích:**
   - Prohlédni `render\sheet.png` (1 snímek/s) a kritická místa (panika, pointa, každý text) vytáhni podrobněji přes ffmpeg.
   - Ověř hlasitost −14 ±1 LUFS.
5. Pošli video přes SendUserFile. Napiš, co bylo ověřeno a co ne (zvuk a načasování vtipů posoudí uživatel). Připoj název, popis a kredit hudby (Kevin MacLeod, CC BY), pokud byla použita.
6. Každou připomínku k tempu nebo vzhledu zapiš do feedback logu v `playbook.md` a pokud jde o obecné pravidlo, uprav i `tools\orbo_engine.py`.
