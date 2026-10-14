# HANDOFF — Prague Street Tracker

Předáno z relace, která projekt nastartovala. Navazující session (na Fedoře)
by měla mít z tohoto souboru dost k pokračování bez nutnosti číst celou
historii konverzace.

## Co aplikace dělá a jaký je cíl

iPhone aplikace, která na pozadí sleduje chůzi uživatele, mapuje její trasu
na skutečné ulice Prahy (map matching) a na mapě vybarvuje "prošlé" ulice —
čím víckrát je uživatel prošel, tím tlustší je čára. Cíl: dát uživateli
nástroj, jak postupně prošlapat *všechny* chodníkově dostupné ulice Prahy a
sledovat progres (celkově i po katastrálních čtvrtích).

**Tvrdý požadavek od zadání**: žádná lokace nikdy neopustí telefon. Appka
nemá backend, žádnou telemetrii, žádné síťové volání za běhu — jen lokální
JSON soubor na disku.

## Technologie

- **Swift/SwiftUI** (ne Flutter/React Native) + **MapKit** (vykreslování
  polylines) + **CoreLocation** (tracking na pozadí) + **CoreMotion**
  (filtr chůze vs. auto/kolo).
- **XcodeGen** (`project.yml`) generuje `.xcodeproj` — ten samotný se
  necommituje (je v `.gitignore`), generuje se při buildu.
- Doménová logika je oddělená do **Swift Package** `Packages/StreetTrackerCore`
  — čistý Swift bez Apple frameworků (žádný UIKit/CoreLocation/Combine),
  takže jde testovat i na Linuxu/v CI bez Xcode.
- Perzistence: zatím prostý JSON soubor (`CoveragePersistence`), ne SQLite
  — vědomé zjednodušení pro MVP, viz `docs/ARCHITECTURE.md`.

## Co je hotové

- `StreetTrackerCore`: model grafu ulic, parser Overpass API JSON (OSM dat),
  prostorový grid index, map matcher (nejbližší segment, ne plný HMM),
  sledování "pass count" / coverage, návrh nejbližších neprošlých ulic,
  tagování segmentů katastrální čtvrtí (sestavení polygonů z OSM boundary
  relací + point-in-polygon). Vše s unit testy.
- App target: SwiftUI obrazovka s mapou, tlačítko start/stop trackingu,
  procento prošlých ulic, nejméně prošlá čtvrť, sheet s návrhy nejbližších
  neprošlých ulic. `LocationTracker` nastavený na background tracking,
  `WalkingActivityMonitor` filtruje jízdu autem/kolem pomocí CoreMotion.
- **CI přes GitHub Actions už existuje** (`.github/workflows/ci.yml`) a dělá
  přesně to, co se má dělat i dál — tj. stejný princip jako u iOS klienta
  Opentify:
  - job `core-tests`: `swift test` na `ubuntu-latest` (rychlé, bez Xcode).
  - job `app-build`: na `macos-latest` runneru nainstaluje XcodeGen,
    vygeneruje projekt a buildne appku pro iOS Simulator
    (`CODE_SIGNING_ALLOWED=NO`, takže bez signing certifikátů).
  - Oba joby byly při posledním push zelené.
- Demo fixture (`App/Resources/prague_streets.json`,
  `prague_districts.json`) — pár vymyšlených ulic a jedna čtvrť, aby appka
  nebyla prázdná bez reálných dat.
- Fetch skripty (`Scripts/fetch_prague_streets.sh`,
  `fetch_prague_districts.sh`) — stáhnou reálná data z Overpass API. Nejde
  spustit z této sandboxované session (outbound síť na overpass-api.de je
  blokovaná), nutno pustit z běžného stroje s internetem.

## Co není hotové

- **Appka nikdy neběžela na simulátoru ani fyzickém zařízení interaktivně**
  — jen se ověřilo, že se zkompiluje (CI build pro simulator, bez spuštění).
  Žádný manuální UI test.
- Žádný **code signing / provisioning / TestFlight** pipeline. CI build je
  jen `CODE_SIGNING_ALLOWED=NO` pro simulator — pro instalaci na reálný
  iPhone (lokálně nebo přes TestFlight) bude potřeba Apple Developer
  Program účet ($99/rok) a buď fastlane+match, nebo manuální
  cert/provisioning profile uložený jako GitHub Actions secret.
- Žádná app ikona, žádný custom launch screen (jen prázdný
  `UILaunchScreen: {}`).
- Reálná OSM data pro Prahu nejsou v repu (jen demo fixtures) — nutno
  spustit fetch skripty odjinud.
- Map matching je zjednodušený (nejbližší segment, ne Hidden Markov Model)
  — může se špatně chytit na úzkých paralelních ulicích.
- Segmenty = celé OSM "ways", ne rozdělené na úseky mezi křižovatkami —
  coverage je tedy po celých ulicích, ne po blocích.
- Návrh trasy (`RouteSuggester`) vrací jen seznam nejbližších neprošlých
  ulic, ne skutečnou vygenerovanou trasu (to by byl "Chinese Postman"
  problém — vyšší komplexita, zatím neřešeno).

## Jak se builduje / co chybí pro GitHub Actions macOS build

Lokálně (na Macu): `brew install xcodegen && xcodegen generate`, otevřít
`.xcodeproj` v Xcode, Run na zařízení.

**Přes GitHub Actions macOS runner** — základ už běží (viz výše), takže
"oživit projekt a buildovat jako Opentify" je z velké části hotové. Co
případně chybí/rozšířit:
1. Pokud je cíl dostat appku na reálný iPhone (ne jen ověřit, že se
   zkompiluje pro simulator), je potřeba:
   - Apple Developer Program účet,
   - signing setup (fastlane match / manuální cert+profile jako secrets),
   - krok navíc ve workflow, co builduje `.ipa`/archive a uploaduje na
     TestFlight (podobně jako to zřejmě dělá Opentify — stojí za to se
     podívat, jak přesně má Opentify workflow nastavený signing, a
     zkopírovat ten vzor).
2. Reálná data z Overpass (`Scripts/fetch_*.sh`) nejsou spuštěná — appka
   běží jen na demo fixtures. Může se spustit jako samostatný krok mimo CI
   (Overpass API nemá rád masivní provoz z CI) a výsledek zkomitovat, nebo
   nechat jako manuální úkol pro uživatele.

## Otevřené otázky a rozhodnutí

- **Distribuce na telefon**: Kryštofův MacBook je mrtvý. Krátkodobě plánuje
  použít Mac kolegy v kanceláři na jednorázové nastavení. Dlouhodobě se měl
  řešit cloud build (GitHub Actions macOS, bez nutnosti vlastnit Mac) +
  TestFlight — to je teď explicitně to, co orchestrátor chce rozjet, stejně
  jako u Opentify. Rozhodnutí o signing strategii (fastlane match vs. ruční
  cert) ještě nepadlo.
- Jestli/kdy upgradovat map matching na HMM a rozdělovat ulice na úseky
  mezi křižovatkami — odloženo jako v2, dokud neukáže reálné použití, že to
  je potřeba.
- Jestli přejít z JSON perzistence na SQLite — odloženo, dokud nebude znát
  reálný výkon s plným grafem Prahy.
- Detaily, jak přesně má vypadat macOS Actions workflow pro signed build
  (jaké secrets, jaký bundle ID, jaký Apple Team) — nejspíš stojí za to se
  inspirovat tím, jak to má nastavené Opentify repo, pokud je k dispozici.

## Odkazy

- Repo: `krystofskala/vault`
- Větev: `claude/prague-street-tracker-app-ooiad7`
- PR: #1
- Architektura v detailu: `docs/ARCHITECTURE.md`
- README: `README.md`
