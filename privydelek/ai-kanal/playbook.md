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
- **Struktura se zápletkou (povinná, 14. 10.):**
  1. Nevinný začátek, který problém ještě neprozradí.
  2. Skutečná chyba AI a eskalace.
  3. **Zdánlivé vyřešení nebo poučení**: divák si myslí, že je po problému.
  4. **Zvrat**: oprava nebo poučení se obrátí proti zadavateli. Je to překvapivé, ale zpětně logické.
  5. Poslední věta má dvojí význam. Aspoň jeden následek je vidět na vlastním záběru.
  Samotná eskalace bez zvratu = zamítnuto.
- **Aspoň 3 smíchy** v každém videu, ne jeden na konci. U každého beatu napiš, kde je smích.
- **Kontrolní seznam** (≥ 8/10, jinak přepsat): háček bez zvuku · smích do 6 s · jedna jasná hra · eskalace · konkrétní detaily · zápletka (zdánlivé vyřešení → zvrat) · aspoň 3 smíchy · překvapivá, ale logická pointa · Orbo sympatický · rozpoznatelná pravda · zní dobře v AI hlase · originalita.

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

## 5b. Motor (orbo_engine.py)
- Barvy postav jsou pevné (Jen fialová, Greg oranžový, Pete zelený, Linda růžová, Mark modrý).
- Chat: `*slovo*` = zvýraznění, `reshow: true` = opakovaná zpráva (nepočítá se do pravidla čtení).
- Beat: `bg`, `bg_blur`, Orbo `x/y/scale/hidden`. Vlastní pozadí scény generovat skriptem `episodes/NN/make_assets.py`.

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
| 13. 10. | „Framed“ schváleno napoprvé (dobré) | postup napady → scénář + 3 agenti → engine funguje; každý nesmysl musí mít doslovný původ v zadání; pointa = špatně naučené pravidlo obrácené proti zadavateli; uživatel u pointy volí variantu s callbackem/smyčkou |

| 13. 10. noc | autonomní várka 5 videí, nezávislý schvalovatel místo uživatele | schvalovatel byl přísný: v 1. kole schválil 1/5. Nejčastější vady: (a) prozrazená pointa dřív, (b) sitcomový beat bez funkce („breathe“), (c) umělá konstrukce místo reálné chyby AI (HR cíl) – zamítnuto, (d) úvod > 2 s bez akce, (e) opakující se pointa. Opraveno a schváleno 5/5 (8,0–8,3). |
| 14. 10. | „1. řekne problém, 2.–3. jen eskalace, žádná zápletka“; „udělej ze zápletky nové pravidlo“; „3 smíchy“ | sekce 2: struktura se zápletkou + 3 smíchy |
| 14. 10. | noční videa 04–08: slabé, předvídatelné pointy a nepropracovaný skript. Mýval je super funny | schvalovatel dával 8/10 bez kalibrace, proto sekce 9: Mýval je měřítko 10/10 a srovnává se proti němu |
| 14. 10. | „STOP je rly funny“ (STOP v2) | potvrzuje strukturu se zápletkou: jedno pevné pravidlo AI → zdánlivé vyřešení (Pete běží odpojit) → stejné pravidlo zamkne zadavatele (karta smazána) → krátká věta s dvojím významem. Funguje: smazání zprávy „STOP“ jako smetí, vlastní záběry kamer s Petem. |

## 8. Lekce z noční várky
- Reálný příběh musí být jádro, ne kulisa. Kde AI chybu „zařídí“ vymyšlená instituce (HR cíl), skóre padá.
- Nejkratší cesta k háčku: první chat ≤ 2 s a hned akce (dokument/odhalení), ne úvodní karta s kontextem.
- Pointa nesmí zaznít dřív (např. „Good thing I'm here“ prozradí „Me!“).
- Pauza „…“ (0,9 s) od kolegy je levný a funkční beat před pointou.
- Délka 18–22 s vychází lépe než 26–30 s.

## 9. Laťka = Mýval (proč funguje a noční videa ne)
- **Vidíme to, o čem AI mluví.** Vlastní obrázky (CCTV pes, mýval, deratizátor honí Grega). Noční videa byla jen chaty na stejné fotce 17.jpg. Každá epizoda potřebuje aspoň 2 vlastní záběry, které ukážou následek.
- **Orbo má vlastní pevnou logiku, se kterou eskaluje.** „Exactly what a raccoon would want us to think.“ Každá replika je samostatný vtip z jeho přesvědčení, ne jen hlášení stavu.
- **Pointa je zvrat, který divák nečeká, ale zpětně dává smysl.** Deratizátor, kterého Orbo zavolal kvůli psovi, honí Grega. Starý setup se obrátí proti zadavateli. Pointa, kterou divák uhodne v půlce (smazaný login, smazaná záloha), nestačí.
- **Poslední replika má dvojí význam** („Biscuit is safe.“), nevysvětluje vtip znovu.
- **Aspoň 3 smíchy**, ne jeden na konci.
- **Schvalovatel:** srovnání naslepo s Mývalem. Video musí být „stejně dobré nebo lepší“, jinak se nepouští. Samotné skóre nestačí.
