# Opentify: audit cizího kódu a licencí (12. 10. 2026)

Kontrolováno: celá historie `krystofskala/Opentify` (793 commitů, větve main, dev, altstore, fix/navbar-lens, claude/…).

## Výsledky
| Co | Nález | Riziko |
|---|---|---|
| Rust kód | **Nikdy v repu nebyl** (žádný `.rs` ani `Cargo.toml` v celé historii). Pokud se převzal, je jen lokálně nebo v jiném projektu. | zjistit kde |
| Musify (GPL-3.0, Dart) | Naklonovaný lokálně jen jako reference (`.gitignore:14`). Porovnání všech řádků: 20 shodných řádků, všechno běžné Flutter konstrukce (`padding: EdgeInsets…`, `addPostFrameCallback`). **Kód převzatý nebyl**, jen UX nápady. | nízké |
| Finamp (MPL-2.0) | „Vzor“ pro normalizaci hlasitosti, uspávač, prefetch. Komentáře uvádějí vlastní implementaci. | nízké |
| **PixelPlayer** (brendmung / Theo Vilardo) | `client/lib/widgets/wavy_seek_bar.dart` je **přímý port** `WavySliderExpressive.kt` + `PlayerSeekBar.kt`. Squircle tvary a design tokeny jsou výslovně podle PixelPlayeru (`theme/shapes.dart`, `theme/app_theme.dart`). **Licence PixelPlayeru je proprietární:** jen osobní nekomerční použití, šíření odvozených děl je zakázáno. | **vysoké**, platí i teď, protože repo je veřejné |
| Licence repa | 4. 10. nastavena AGPL-3.0, o 3 minuty později odstraněna. Teď „all rights reserved“. | rozhodnout |

## Co udělat
1. **Hned:** přepsat `wavy_seek_bar.dart` a squircle tvary znovu od nuly (clean-room). Nový Claude dostane jen popis chování, ne originál ani současný port. Do té doby zvážit, jestli repo nepřepnout na soukromé.
2. Smazat zmínky „podle PixelPlayeru“ až **po** přepsání. Do té doby slouží jako poctivá stopa.
3. Vzhled „jako PixelPlay“ (barvy z obalu, zaoblení, písmo) autorské právo obecně nechrání. Chráněný je kód.
4. Zjistit, kde je Rust kód, o kterém byla řeč, a v jakém projektu.
5. Licenci zvolit až podle obchodního modelu:
   - **AGPL-3.0** pro server (open source, kdo ho provozuje jako službu, musí zveřejnit úpravy) + vlastní placené aplikace;
   - nebo zdrojový kód viditelný, ale komerční použití vyhrazené;
   - nebo vše uzavřené.
