---
name: orbo-scenar
description: Napíše scénář epizody Orba z vybrané premisy, nechá ho prověřit třemi agenty (punch-up, test na divácích, retence) a uživateli pošle vylepšenou verzi s českým překladem. Po schválení vytvoří episode.json. Použij po výběru premisy nebo na /orbo-scenar.
---

# Orbo: scénář

1. Přečti `C:\Users\Admin\ai-kanal\playbook.md` (sekce 2 a 3) a jako vzor nejlepší epizodu `C:\Users\Admin\ai-kanal\episodes\02-meeting-notes\episode.json`.
2. Napiš scénář pro 18–28 s jako tabulku **čas | obraz | anglicky | česky**. Pravidla:
   - háček v 1. sekundě i bez zvuku,
   - první smích do ~6 s,
   - Orbovy repliky max ~8 slov,
   - kolegové (Jen, Greg) jen v chatu,
   - AI se opravdu splete a pointa plyne z následku,
   - **zápletka:** nevinný začátek → chyba a eskalace → zdánlivé vyřešení → zvrat proti zadavateli → poslední věta s dvojím významem (samotná eskalace = zamítnuto),
   - **aspoň 3 smíchy** (u každého beatu označ, kde je smích),
   - aspoň jeden vlastní záběr následku (měřítko je Mýval).
3. **Než scénář ukážeš uživateli**, pusť paralelně 3 agenty (general-purpose, background). Každý dostane celý scénář a kontext Orba (AI stážista, pohled AI, nadšený a úzkostný, hlas Harry, stock fotky kanceláře, chat):
   - **Punch-up:** zhodnoť každý beat, u 5 nejslabších míst dej po 5 alternativ, navrhni 3 verze konce a výsledný vylepšený scénář. Zachovej premisu, AI musí zůstat opravdu hloupá podle reálného příběhu.
   - **Test na divácích:** 6 různých diváků (16letá s vypnutým zvukem, kancelářský pracovník, manažerka bez AI, cynický programátor, fanoušek roztomilých postav, 60letý nerodilý mluvčí). U každého kde odscrolluje, kde se zasměje, co nepochopí, a 6 doporučení podle dopadu.
   - **Retence:** riziko odscrollování sekundu po sekundě, síla háčku, doba čtení textů (znaky / 15 + 0,5 s), hluchá místa, max 8 úprav.
4. Zapracuj shody agentů. Ohodnoť scénář podle kontrolního seznamu z playbooku (natočit až od 8/10).
5. Pošli uživateli finální tabulku EN + CZ, krátké „proč to funguje“ a 2–3 alternativy ke klíčovým místům. Výslovně ho požádej, ať přečte **český sloupec**.
6. Po schválení vytvoř `C:\Users\Admin\ai-kanal\episodes\NN-slug\episode.json` podle formátu v hlavičce `tools\orbo_engine.py`:
   - typy beatů: chat, line, doc, note, pause,
   - nálady: normal, happy, worried, panic, working, small, proud, dim,
   - hudba jen na pointách: toccata (panika), gymnopedie (smutek), clairdelune (dojetí), fluffing (pointa).
   Pak pokračuj `/orbo-video`.
7. Každou připomínku uživatele zapiš do feedback logu v playbooku.
