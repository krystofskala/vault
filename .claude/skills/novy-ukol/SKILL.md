---
name: novy-ukol
description: Založ nový týmový úkol na nástěnce podle šablony. Použij, když uživatel chce zadat práci pro agenty oddělení („založ úkol“, „přidej na nástěnku“).
---
# Nový úkol

1. Zkopíruj `ukoly/_SABLONA.md` do `ukoly/<kratky-nazev-s-pomlckami>.md`.
2. Vyplň `zadal` (jméno člověka), `priorita` (`vysoka` / `normalni` / `nizka`), cíl, vstupy
   a první krok v *Zbývá* označený **začni tady:**. Rozsáhlou práci rozděl na víc menších úkolů.
3. Nevíš-li cíl nebo vstupy, zeptej se uživatele – nehádej.
4. `scripts/ulozit.sh "nový úkol: <název>"`.
5. Pokud má uživatel na úkolu hned pracovat, pokračuj skillem `prace` s tímto úkolem.
