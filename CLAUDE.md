# Týmový harness oddělení – pravidla pro Claude

Jsi jeden z několika Claude agentů, kteří pracují pro **stejné oddělení**. Každý agent běží
na účtu jiného člověka z týmu a má vlastní limit tokenů. Práci si předáváte přes tento repozitář:
když jednomu dojde limit, jiný pokračuje přesně tam, kde skončil.

## Kdo jsi

Tvoje jméno agenta zjistíš příkazem `scripts/kdo-jsem.sh` (z proměnné `TEAM_AGENT`,
jinak z `git config user.name`). Tímto jménem podepisuješ převzetí úkolů a commity.
Pokud jméno chybí, zeptej se člověka a nastav `git config user.name "<jméno>-claude"`.

## Struktura

| Cesta | Co tam je |
|---|---|
| `ukoly/` | Jeden soubor = jeden úkol. Stav je ve frontmatteru. Šablona: `ukoly/_SABLONA.md` |
| `znalosti/` | Trvalé sdílené poznatky: postupy, rozhodnutí, slovníček, odkazy na data |
| `agenti/<jméno>/denik.md` | Tvůj vlastní deník – zapisuj jen do svého |
| `scripts/` | Nástroje pro nástěnku, převzetí, uložení a předání úkolu |

## Životní cyklus úkolu

```
volne ──prevzit──▶ pracuje ──predat──▶ volne   (nedokončeno, pokračuje kdokoli)
                      │
                      ├──hotovo──▶ hotovo
                      └──blokovano──▶ blokovano (čeká na člověka)
```

Frontmatter úkolu: `stav`, `vlastnik`, `aktualizovano`, `priorita`, `zadal`.

## Povinný postup

1. **Na začátku** si prohlédni nástěnku (`scripts/nastenka.sh` – běží i automaticky při startu session).
2. **Než začneš na úkolu pracovat, převezmi ho:** `scripts/prevzit.sh ukoly/<soubor>.md`.
   Skript úkol zamkne přes git push. Když selže, úkol má někdo jiný → vyber si jiný.
   **Nikdy nepracuj na úkolu, který jsi úspěšně nepřevzal.**
3. **Ukládej průběžně – limit tokenů přijde bez varování.** Po každém dokončeném
   kroku (cca každých 15–20 minut práce) aktualizuj v souboru úkolu sekce *Hotovo*,
   *Zbývá* a *Kontext* a spusť `scripts/ulozit.sh "<co jsi udělal>"`.
   Co není pushnuté, pro ostatní neexistuje.
4. **Předání:** když končíš a úkol není hotový: `scripts/predat.sh ukoly/<soubor>.md volne`.
   Do sekce *Zbývá* napiš první další krok tak konkrétně, aby agent bez tvé paměti
   mohl okamžitě pokračovat („začni tady: …“).
5. **Dokončení:** `scripts/predat.sh ukoly/<soubor>.md hotovo` + shrnutí výsledku v úkolu.
6. **Potřebuješ rozhodnutí člověka:** `scripts/predat.sh ukoly/<soubor>.md blokovano`
   a do úkolu napiš konkrétní otázku a komu je určena.

## Opuštěné úkoly

Úkol ve stavu `pracuje`, jehož `aktualizovano` je starší než **3 hodiny**, se považuje
za opuštěný (agentovi nejspíš došel limit uprostřed práce). `prevzit.sh` ho dovolí převzít.
Před pokračováním si přečti git historii úkolu (`git log -p -- ukoly/<soubor>.md`)
a zkontroluj, co předchozí agent stihl.

## Pravidla spolupráce

- Zapisuj jen do úkolů, které vlastníš, do svého deníku a do `znalosti/`.
  Cizí úkoly jen čti.
- Trvalé poznatky (jak se něco dělá, proč jsme se rozhodli pro X) patří do `znalosti/`,
  ne jen do úkolu – ať je najde i další agent u jiné práce.
- Velká data a binárky necommituj; do úkolu napiš, kde leží (cesta na disku nebo sdíleném úložišti).
- Žádná hesla, tokeny ani osobní údaje v repozitáři.
- Piš česky, stručně a věcně. Píšeš pro kolegu, který nemá tvoji paměť.
- Když `git push` selže kvůli konfliktu, udělej `git pull --rebase`, vyřeš konflikt
  (u cizích souborů ponech jejich verzi) a pushni znovu. Nikdy nepoužívej `--force`.
