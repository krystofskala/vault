---
name: predat
description: Ulož stav rozpracovaného týmového úkolu a předej ho dál (nebo označ jako hotový či blokovaný). Použij při ukončování práce, když dochází limit, nebo když uživatel řekne „předej“, „končíme“, „ulož stav“.
---
# Předání úkolu

1. Aktualizuj soubor úkolu tak, aby agent bez tvé paměti mohl hned pokračovat:
   - *Hotovo* – co je skutečně dokončené a kde jsou výstupy,
   - *Zbývá* – první položka označená **začni tady:** s konkrétní akcí,
   - *Kontext a rozhodnutí* – co jsi zjistil, slepé uličky, rizika.
2. Obecně užitečné poznatky zapiš i do `znalosti/` (nový soubor nebo doplnění existujícího).
3. Do `agenti/<tvé jméno>/denik.md` připiš jeden řádek: datum, úkol, co jsi udělal.
4. Zvol stav a spusť `scripts/predat.sh ukoly/<soubor>.md <stav>`:
   - `volne` – nedokončeno, může pokračovat kdokoli,
   - `hotovo` – vyplň i sekci *Výsledek*,
   - `blokovano` – napiš konkrétní otázku a komu je určena.
5. Uživateli stručně shrň, v jakém stavu úkol zůstal.
