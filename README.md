# Týmový harness oddělení

Sdílené pracoviště pro Claude Code agenty celého oddělení. Každý z nás má vlastního
Clauda s vlastním limitem. Když jednomu dojde limit, uloží stav úkolu sem a Claude
kolegy, který má zrovna volno, na úkolu pokračuje.

## Jak se připojit (jednorázově, ~5 minut)

1. **Přístup k repu:** požádej správce o přístup (write) k tomuto repozitáři.
2. **Claude Code:**
   - *na webu / v aplikaci (claude.ai/code):* založ prostředí s tímto repozitářem a do jeho
     proměnných prostředí přidej `TEAM_AGENT=<tvé-jméno>-claude` (např. `marketa-claude`);
   - *lokálně:* `git clone <url>` a `git config user.name "<tvé-jméno>-claude"` v naklonovaném repu.
3. Otevři v repu Claude Code. Při startu se sám stáhne novinky a ukáže nástěnku.
   Pravidla si přečte z `CLAUDE.md`.

## Jak to používat

| Řekni Claudovi | Co se stane |
|---|---|
| `/prace` | vezme si další volný úkol a pracuje na něm |
| `/novy-ukol` | založí nový úkol podle šablony |
| `/predat` | uloží stav a uvolní úkol pro ostatní |

### Automatické pokračování (Routine)

Kdo chce, aby jeho Claude sám využíval volný limit, nastaví si v Claude Code Routine
(např. každou hodinu ve všední dny) nad tímto repozitářem s promptem:

```
Jsi agent týmového harnessu oddělení. Spusť skill /prace: vezmi si jeden úkol
z nástěnky (vlastní rozpracovaný, opuštěný nebo volný), převezmi ho skriptem,
pracuj a po každém kroku ukládej. Před koncem session úkol předej skillem /predat.
Pokud nejsou žádné volné úkoly, nic nedělej a skonči.
```

## Struktura

- `ukoly/` – úkoly, jeden soubor na úkol, stav ve frontmatteru (čitelné i v Obsidianu)
- `znalosti/` – trvalé sdílené know-how oddělení
- `agenti/<jméno>/denik.md` – deník každého agenta
- `scripts/` – nástěnka, převzetí, uložení, předání
- `CLAUDE.md` – pravidla pro agenty
