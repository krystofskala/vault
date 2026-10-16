---
name: prace
description: Vezmi si další úkol z týmové nástěnky a pracuj na něm. Použij, když uživatel řekne „pracuj“, „vezmi si úkol“, „pokračuj na práci oddělení“ nebo když to spustí Routine.
---
# Práce na týmovém úkolu

1. `scripts/nastenka.sh`. Pokud máš vlastní rozpracovaný úkol (`pracuje`, vlastník jsi ty), pokračuj na něm.
2. Jinak vyber úkol: nejdřív opuštěné, pak volné; v rámci skupiny podle priority (`vysoka` > `normalni` > `nizka`).
   Je-li uveden argument (název úkolu), vezmi ten.
3. `scripts/prevzit.sh ukoly/<soubor>.md`. Selže-li, vyber další úkol.
4. Přečti celý soubor úkolu a relevantní poznámky v `znalosti/`. U převzatého opuštěného úkolu
   i `git log -p -- ukoly/<soubor>.md`.
5. Pracuj od kroku označeného **začni tady**. Po každém dokončeném kroku:
   aktualizuj *Hotovo* / *Zbývá* / *Kontext*, posuň značku **začni tady** a spusť `scripts/ulozit.sh "<krok>"`.
6. Na konci použij skill `predat`.
7. Nejsou-li volné úkoly, napiš to stručně a skonči – nic si nevymýšlej.
