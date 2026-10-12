# Playbook výroby AI shorts (Orbo, Drákula) – verze 13. 10. 2026

Pravidla vzniklá z výroby a zpětné vazby uživatele. Číst před KAŽDOU epizodou. Každá nová připomínka se sem doplní jako pravidlo.

## 1. Nápad a premisa
- **Základ = skutečný příběh** (Reddit, X, články o AI fails), který lidi znají. Převzít jen situaci, ne text, autora neuvádět; ověřit, že to už není virální video jiného tvůrce. Žádná skutečná škoda (zdraví, peníze, právo).
- AI se **opravdu splete** (žádné „vlastně měla pravdu“) a následek **logicky eskaluje** (příčina → následek → horší následek).
- Pointa říká pravdu o firmách / AI (např. „zápisy nikdo nečte, šéf schválí nesmysl“).
- Témata ani vtipy nekopírovat od Alberty Tech (ta hraje lidi kolem AI). Naše značka: **pohled AI + postava Orba**.
- Uživateli nejdřív **3 premisy česky, každá 2–3 věty**. Teprve po výběru celý scénář.

## 2. Scénář
- Vždy **anglicky + český překlad vedle** (tabulka čas / obraz / EN / CZ). Upozornit uživatele, ať čte český sloupec.
- Než ho uživatel uvidí: projde **3 agenty** – punch-up (alternativy slabých míst), simulovaný test na 6 typech diváků, retence po sekundách. Zapracovat, pak poslat.
- Háček v **1. sekundě i bez zvuku**; první smích do ~6 s; 18–30 s celkem.
- Orbovy repliky krátké (max ~8 slov), pointa = nejkratší replika, klíčové slovo na konci.
- Orbo: nadšený + úzkostný (krátká panika, pak úleva/hrdost). Kolegové jen v chatu (Jen – suchá, Greg – CEO). Kolegové z fotek nikdy nemluví cizí repliky.
- **Kontrolní seznam** (≥ 8/10, jinak přepsat): háček bez zvuku · smích do 6 s · jedna jasná hra · eskalace · konkrétní detaily · překvapivá, ale logická pointa · Orbo sympatický · rozpoznatelná pravda · zní dobře v AI hlase · originalita.

## 3. Tempo (automaticky kontrolovat)
- **Čas textu na obrazovce ≥ znaky / 15 + 0,5 s** (chat, dokumenty, lístečky, titulky). Pokud nestačí, nechat text viset přes další záběr (např. zadání během Orbovy odpovědi).
- Zkracovat jen hluchá místa bez textu; komická pauza max ~0,6 s; ticho bez obrazu nikdy (vždy mrknutí/zvuk).
- Body dokumentu naskakovat po ~0,55 s, po posledním nechat ≥ 2 s.

## 4. Vizuál
- Pozadí: **skutečné stock fotky** (Pixabay API, nástroj `stock.py`), bez značek (logo vymazat). Lidi z fotek smí být kolegové/kulisa, ne zesměšňovaní.
- Orbo: procedurální render (`orbo_char.py`), stín, záře; panika = červený nádech + třes.
- Drahé video (Drákula / AI video): **snímky → přísná kontrola → schválení uživatelem → animatik → video → kontrola po snímcích**. U selfie promptů nikdy „phone/screen/arm toward lens“, ale „no hands, holds nothing“.
- Titulky všech replik ve videu, štítek AI-made.

## 5. Zvuk a hudba
- Hlas Orbo: ElevenLabs „Harry“ (`uq0HIbNZKn11Hs5ifEdd`), model eleven_v3, tagy emocí. Drákula: hlas 1 (`rPVseD6LFJcZXXBhRfZo`).
- Hudba **jen na pointách** (panika, smutek, dojetí, pointa), 1,5–3 s. Zdroje: volné dílo (Wikimedia Commons), Kevin MacLeod CC BY (uvést v popisu). Žádné chráněné trendy písně ve videu – trendující zvuk jen v aplikaci IG/TikTok.
- Hlasitost −14 LUFS (±1).

## 6. Kontrola před odesláním (vždy)
- Celé video po 1 s + kritická místa po 0,1–0,2 s: chyby postavy, objekty navíc, useknuté texty, prázdné čtverečky místo emoji, loga.
- Automatický report: doba čtení textů, hluchá místa, délka, hlasitost.
- Uživateli říct, co bylo ověřeno a co ne (zvuk/načasování vtipů posoudí on).

## 7. Feedback log (doplňovat)
| Datum | Připomínka | Pravidlo |
|---|---|---|
| 12. 10. | snímky měly chyby, video se generovalo dřív | sekce 4: schválení snímků před videem |
| 12. 10. | Mull nesrozumitelný | premisa srozumitelná do 2 s |
| 13. 10. | scénáře kopie Alberty / roztomilý sitcom | sekce 1: skutečný příběh, pohled AI |
| 13. 10. | „Day 47“ nesmyslný, schválený bez čtení | premisy česky + scénář s překladem |
| 13. 10. | AI má být opravdu hloupá podle reálu | sekce 1 |
| 13. 10. | tempo: úvodní prompt nešel přečíst | sekce 3: vzorec času čtení |
