Úkol: vyčistit z Opentify kód odvozený z PixelPlayeru (licenční problém). Vzhled zůstane stejný, změní se jen původ kódu.

## Proč
PixelPlayer (github.com/brendmung/PixelPlayer, © Theo Vilardo) má **proprietární licenci**: smí se jen osobně a nekomerčně, **šíření odvozených děl je zakázané**. Naše repo je veřejné a `client/lib/widgets/wavy_seek_bar.dart` je podle svého komentáře port jeho `WavySliderExpressive.kt` + `PlayerSeekBar.kt`. Squircle tvary a design tokeny (`client/lib/theme/shapes.dart`, `client/lib/theme/app_theme.dart`, `client/lib/theme/design_tokens.dart`) se na PixelPlayer taky odkazují.

Co je v pořádku: samotná vlnka je Google `LinearWavyProgressIndicator` (Jetpack Compose Material 3 Expressive, **Apache 2.0**, komerční použití povolené s uvedením autora). Vzhled a design guide autorské právo nechrání. Problém je jen kód převzatý z PixelPlayeru.

## Pravidla (clean-room)
- **PixelPlayer vůbec neotevírej**: ani repo, ani web, ani lokální klon.
- Z `wavy_seek_bar.dart` čti jen **veřejné API** (konstruktor, parametry, callbacky) a místa, kde se používá (`player_bar.dart`, `now_playing_screen.dart`). Vnitřní implementaci nečti ani nekopíruj.
- Jako zdroj pro vlnku použij **Google zdroj** `LinearWavyProgressIndicator` / `WavyProgressIndicatorDefaults` z androidx (compose/material3, Apache 2.0) a specifikaci Material 3 Expressive.
- Platí moje běžná pravidla pro Opentify: nejdřív návrh ke schválení, pak práce na `dev`, zápis do rollback poznámky, živá verze až po otestování.

## Specifikace chování (od Kryštofa, podle toho implementuj)
1. Odehraná část se vlní (sinusoida), neodehraná je vždy rovná čára.
2. U puku vlna plynule doběhne do roviny, žádný skok.
3. Když nic nehraje nebo uživatel táhne, amplituda plynule doběhne na nulu. Při přehrávání se plynule vrátí.
4. Puk je v klidu kolečko, při tažení se protáhne do svislé čárky a po puštění se vrátí.
5. Vlna se pomalu posouvá (fáze), jen když hraje.
6. `interactive: false` vypne všechna gesta, zůstane jen vizuál (kvůli PlayerBar, ať nekrade tapy).
7. Ťuknutí i tažení posouvá pozici. `onChanged` / `onChangeEnd` zůstanou stejné jako v současném API.
8. Výkon: žádný rebuild celého stromu na snímek, kreslit přes `CustomPainter` s `repaint`.

## Postup
1. **Návrh (čekej na schválení):** seznam všech souborů a míst, která se odkazují na PixelPlayer (`git grep -n -i "pixelplay"`), a u každého rozhodnutí: přepsat / jen přejmenovat komentář / beze změny (čistě vizuální inspirace, žádný kód). Plus plán API nového posuvníku.
2. **Nový posuvník** podle specifikace výše a Google zdroje. Stejné veřejné API, aby se volající místa neměnila.
3. **Squircle:** nahradit vlastní tvar vestavěným `RoundedSuperellipseBorder` (podle verze Flutteru, jinak `ContinuousRectangleBorder`). Vizuálně porovnat screenshotem před a po.
4. **NOTICE:** přidat soubor `NOTICE` (nebo sekci v README) s atribucí Apache 2.0 pro Google Material Components / Jetpack Compose, ze kterých vychází vlnka.
5. **Komentáře:** odstranit odkazy „port z PixelPlayeru“ a nahradit je pravdivým původem („podle Material 3 Expressive LinearWavyProgressIndicator, Apache 2.0“). Vizuální inspiraci smíš zmínit slovy („vzhled inspirovaný aplikací PixelPlay“), ale jen tam, kde není převzatý kód.
6. **Ověření:** `flutter analyze`, testy, a vizuální kontrola na webu i v telefonu (přehrávání, pauza, tažení, PlayerBar neinteraktivní). Krátké video nebo screenshoty před a po.
7. **Shrnutí pro mě:** co se změnilo, co zůstalo, a jestli je v repu ještě něco z cizího kódu s nejasnou licencí. Na konci ještě `git grep -n -i -E "pixelplay|ported from|port z|převzat"`.

Nic nepushuj na main bez mého schválení.
