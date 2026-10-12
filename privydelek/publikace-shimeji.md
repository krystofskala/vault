# Publikace obsidian-shimeji do Obsidian Community Plugins

Audit k 2026-10-12, větev `main` @ `ff5db06` (repo `krystofskala/obsidian-shimeji`, 70 commitů, jediná větev, žádné tagy).
Repo se při auditu neměnilo. GitHub Releases nebylo možné ověřit (session nemá API přístup k repu), ale lokálně nejsou žádné tagy, takže release pravděpodobně ještě neexistuje.

**Verdikt: zatím nepřipraveno.** Kód je v dobrém stavu (úklid při unload, `requestUrl`, žádné `innerHTML` s uživatelským vstupem, žádná telemetrie, žádné výchozí zkratky, žádné Node moduly v `main.js`). Blokuje to ale 5 věcí: ID v manifestu, chybějící licenční upozornění Shimeji-ee/Shimeji, dvě funkce závislé na souborech, které instalátor Obsidianu nestáhne, a stahování a spouštění JS z CDN.

---

## Co se v pluginu skutečně distribuuje (autorská práva)

| Položka | V repu / release? | Licence / stav |
|---|---|---|
| **Character packy (Naruto, Rick and Morty, Yakuza, Deadpool, Charmander… ~44 ks)** | **NE.** V repu ani v historii gitu nejsou žádné PNG/GIF/WAV (ověřeno přes `git log --all --name-only`, pack má 2,27 MB). `Shimeji/img/` obsahuje jen `DROP_YOUR_PNGS_HERE.txt`. Packy má uživatel jen lokálně ve svém vaultu. | Fanouškovské sprity chráněných postav. **Nesmí se dostat do repa, release, README, screenshotů ani demo GIFu.** Názvy `Shimeji_Itachi`, `Charmander`, `deadpool2` jsou jen v komentářích testu `test/japaneseSchema.test.ts:12,111,134`, což je v pořádku. |
| Výchozí sprite (placeholder) | ano, v kódu (`src/placeholder/placeholderSprite.ts`), vlastní SVG | vlastní tvorba, MIT |
| Místnost („plant room“) | ano, kreslená kódem (`src/room/office.ts`, `roomArt.ts`) | vlastní tvorba, MIT |
| `Shimeji/conf/actions.xml`, `behaviors.xml` | v repu ano, v release **ne** | Odvozené z výchozí konfigurace Shimeji-ee. Platí **BSD-2 (© Shimeji-ee Group) + zlib (© 2009–2011 Yuki Yamada)**. |
| `test/fixtures/ja-*.xml` | jen testy | původní japonská konfigurace Shimeji (zlib, Yuki Yamada) |
| Engine (port Java zdrojů `com.group_finity.mascot.*`) | v `main.js` | Podle README (ř. 10, 21, 447) jde o přímý port zdrojového kódu, tedy odvozené dílo. Platí stejné licence BSD-2 + zlib (zdroj: `DalekCraft2/Shimeji-Desktop/LICENSE.txt`, import Kilkakonova kódu). **V repu není žádné upozornění na ně.** |
| Fonty | žádné nejsou přibalené, `styles.css:481,1024,1042` jen odkazuje na systémové (Comic Sans MS, Comic Neue…) | v pořádku |
| Zvuky | žádné nejsou přibalené, `SoundPlayer.ts` přehrává jen soubory z packu uživatele | v pořádku |
| `@huggingface/transformers` 4.2.0 | v `vault-search.js` (564 KB, v repu, v release ne) | Apache-2.0, vyžaduje NOTICE nebo atribuci |
| onnxruntime-web `1.26.0-dev.20260416…` (WASM + `.mjs`) | stahuje se z jsDelivr za běhu (`src/ai/embeddings.ts:79`) | MIT, ale připnutá je **dev** verze |
| Model `Xenova/all-MiniLM-L6-v2` | stahuje se z Hugging Face za běhu | Apache-2.0 |

---

## 1. BLOCKERY (bez nich neodesílat)

### B1. ID pluginu obsahuje „obsidian“
- `manifest.json:2`: `"id": "obsidian-shimeji"`. Pravidla i review bot zakazují slovo „obsidian“ v ID. ID se po publikaci už nedá změnit.
- **Oprava:** `"id": "shimeji"`. Pokud je obsazené (zkontrolovat `community-plugins.json` v `obsidianmd/obsidian-releases`, případně adresář na community.obsidian.md), pak `"shimeji-mascot"` nebo `"desktop-mascot"`. Stejné jméno dát do `package.json:2`.
- Kód s ID počítá dynamicky přes `manifest.dir`/`manifest.id` (`src/main.ts:832,1457`). Při vývoji se ale změní složka v `.obsidian/plugins/`, takže je potřeba přesunout lokální `data.json` a packy.

### B2. Popis v manifestu obsahuje „Obsidian“
- `manifest.json:6`: „…inside the **Obsidian** window…“. Validace zakazuje slovo „Obsidian“ i obraty typu „This plugin“. Popis musí končit tečkou a doporučená délka je do 250 znaků.
- **Oprava:** například `"description": "Animated Shimeji-style mascots that walk, climb and sit on your panes, using your own Shimeji-compatible artwork."` Stejný text dát do PR nebo formuláře.

### B3. Chybí licenční upozornění Shimeji / Shimeji-ee (BSD-2 + zlib)
- `LICENSE:1-21` obsahuje jen MIT © Krystof Skala. README nemá sekci s licencí ani poděkováním.
- BSD-2 vyžaduje, aby binární distribuce (`main.js`) reprodukovala copyright a podmínky v dokumentaci. zlib vyžaduje zachovat upozornění a výslovně označit upravenou verzi.
- **Oprava:**
  1. Do `LICENSE` přidat pod MIT oddíl „Third-party notices“ s doslovným textem obou licencí z `https://github.com/DalekCraft2/Shimeji-Desktop/blob/main/LICENSE.txt`: zlib © 2009–2011 Yuki Yamada a BSD-2 © Shimeji-ee Group. Alternativně vytvořit `THIRD_PARTY_NOTICES.md` a odkázat na něj z README.
  2. Na začátek README přidat sekci **Credits & license**: „Engine is a TypeScript port of Shimeji (Yuki Yamada, Group Finity) and Shimeji-ee (Shimeji-ee Group, Kilkakon). This is a modified, unofficial port and is not affiliated with them.“
  3. Hlavičku `Shimeji/conf/*.xml` doplnit komentářem s původem a licencí.
  4. Přidat atribuci pro transformers.js (Apache-2.0) a pro model all-MiniLM-L6-v2 (Apache-2.0), pokud vyhledávání ve vaultu zůstane.
  5. Volitelně banner v `esbuild.config.mjs` (`banner.js`) doplnit o „includes code derived from Shimeji (zlib) and Shimeji-ee (BSD-2)“.

### B4. Vyhledávání ve vaultu: `vault-search.js` se nedostane k uživatelům a stahuje a spouští JS z CDN
- Instalátor Obsidianu stahuje z release **jen** `main.js`, `manifest.json` a `styles.css`. Plugin ale importuje `vault-search.js` ze své složky (`src/main.ts:1533`), takže u instalace z Community Plugins funkce vždy selže.
- `src/ai/embeddings.ts:79,121-129,154` stahuje z `cdn.jsdelivr.net` soubory `ort-wasm-simd-threaded.wasm` a `ort-wasm-simd-threaded.mjs`, ukládá je do `.obsidian/shimeji-cache/` a spouští je. To je načítání vzdáleného kódu. Recenzenti i nové automatické review (scorecard na community.obsidian.md) to berou jako závažný problém a politika zakazuje mechanismy, které plugin nebo jeho závislosti aktualizují nebo instalují.
- Je připnutá **dev** verze onnxruntime-web (`embeddings.ts:72`).
- **Oprava (doporučeno pro v1):** vyhledávání ve vaultu z první verze vyřadit. Skrýt nastavení `vaultSearchEnabled` a související „Related notes“, nebuildovat `vault-search.js` (`esbuild.config.mjs`, kontext `vaultSearchContext`) a závislost `@huggingface/transformers` přesunout z `dependencies`. Do druhé verze pak buď
  - (a) embeddings přes API zvoleného AI backendu (OpenAI-compatible `/embeddings`, Ollama) přes `requestUrl`, bez spouštění cizího kódu, nebo
  - (b) všechno přibalit přímo do `main.js` včetně WASM jako base64. `main.js` ale naroste o ~13 MB, což je pro mobil nevhodné.

### B5. Editor postav potřebuje `Shimeji/conf/*.xml`, které release neobsahuje
- `src/wizard/scaffoldCharacter.ts:121-122` čte `${bundledPackFolder}/conf/actions.xml` a `behaviors.xml`. `bundledPackFolder()` (`src/main.ts:831-832`) ukazuje do složky pluginu, kam instalátor tyto soubory nestáhne. U čisté instalace proto **Create character** selže a výchozí `packsFolder` (`src/main.ts:307-309`) ukazuje do neexistující složky.
- **Oprava:**
  1. Obě XML přibalit do `main.js` jako text (`import actionsXml from "../../Shimeji/conf/actions.xml"` a v esbuildu `loader: { ".xml": "text" }`).
  2. `scaffoldCharacter` bude psát z těchto konstant.
  3. Výchozí `packsFolder` dát do vaultu (např. `Shimeji`) místo `.obsidian/plugins/<id>/Shimeji`. Packy ve složce pluginu se smažou při odinstalaci nebo přeinstalaci a Obsidian Sync je ve výchozím stavu nesynchronizuje.
  4. Otestovat čistou instalaci: do prázdného vaultu zkopírovat jen tři soubory z release.

---

## 2. SHOULD-FIX (recenzent nebo bot to s velkou pravděpodobností vrátí)

1. **README nemá blok „Network use / Privacy“ na začátku.** Politika vyžaduje jasně popsat vzdálené služby a důvod jejich použití. README (108 KB) je má rozházené v sekcích AI (ř. 828–1050). **Oprava:** hned pod úvod přidat krátký seznam:
   - AI chat posílá zprávy, vložené obrázky, volitelně obsah aktivní poznámky a úryvky z vaultu na uživatelem zvolený backend: Anthropic `api.anthropic.com`, Groq, OpenRouter, Cloudflare, Google Gemini (`src/ai/backends.ts:60-81`) nebo lokální server. Ve výchozím stavu je vypnuto (`aiEnabled: false`).
   - API klíče se ukládají v plain textu do `.obsidian/plugins/<id>/data.json`. Pole jsou typu password (`src/settings.ts:425`). Uživatele upozornit, že se `data.json` synchronizuje.
   - Žádná telemetrie.
   - Zápis mimo složku pluginu: `.obsidian/shimeji-cache/` (`src/main.ts:1474`), poznámka „Shimeji speech.md“ a složka „Shimeji reports/“ ve vaultu.
2. **Při prvním spuštění vznikne bez dotazu poznámka ve vaultu.** `src/main.ts:652` volá `ensureSpeechFile()` vždy, `speechEnabled: true` (`src/settings.ts:269`), a soubor „Shimeji speech.md“ se vytvoří v kořeni nebo ve složce pro nové poznámky (`src/main.ts:1789-1806`). **Oprava:** vytvářet soubor až při akci uživatele (příkaz „Open the speech-lines file“), nebo používat vestavěné výchozí hlášky a soubor jen nabídnout.
3. **Nadpis v nastavení se jménem pluginu:** `src/settings.ts:502` `containerEl.createEl("h2", { text: "Shimeji Desktop Mascot" })`. Bot to hlásí. **Oprava:** řádek smazat. Pro podnadpisy používat `new Setting(el).setName(...).setHeading()`, což se týká i `<h4>/<h5>` v modálech (`CharacterEditorModal.ts:432,1007,1019,1024,1287,1467`, `SpriteSheetModal.ts:147,177`), i když tam je to méně kritické.
4. **Inline styly přes `el.style.x = …` (89×).** Hlavně `src/room/ChatBubble.ts` (21), `engine/Mascot.ts` (13), `room/RoomOcclusion.ts` (10), `engine/Stage.ts` (10), `sprites/AtlasSlicer.ts` (8). Bot (eslint-plugin-obsidianmd, „no-static-styles-assignment“) je hlásí. **Oprava:** statické hodnoty přesunout do CSS tříd. Dynamické pozice a transformace nastavovat přes `el.setCssProps({ "--x": … })` a CSS proměnné, případně `setCssStyles`.
5. **Neveřejné API:** `src/main.ts:2517` `(this.app as unknown as { setting … }).setting.open()/openTabById()`. Recenzenti to tolerují, ale hlásí. **Oprava:** obalit do `try/catch` s fallbackem na `Notice` („Open Settings → Shimeji“), nebo vynechat.
6. **Konzolové výpisy při běžném běhu.** Pravidlo zní, že ve výchozím stavu se vypisují jen chyby.
   - `src/debugApi.ts:479` při každém načtení vypíše `console.info` a vytvoří global `window.shimejiDebug` (`debugApi.ts:75`). Uklízí se správně (`:485`).
   - `src/shimeji/PackLoader.ts:66,208,370`, `src/main.ts:823` (`console.log(body)`), `:883`, `:1506`.
   - **Oprava:** výpisy podmínit nastavením „Debug logging“ (už existuje `setVerboseLogging`). `installDebugApi` volat jen se zapnutým debug přepínačem.
7. **Výchozí chování, které mění rozložení workspace:** `allowPaneWrangling: true` a `allowLayoutSurgery: true` (`src/settings.ts:257,262`). Maskoti ve výchozím stavu manipulují s panely. Recenzent i uživatel to mohou vnímat jako nečekané zásahy. **Oprava:** výchozí hodnota `false` a v nastavení uvést „opt-in“. Případně jasně popsat v README nahoře.
8. **`package.json:18` `"obsidian": "latest"`:** připnout verzi (např. `"obsidian": "1.8.7"`) a ověřit, že `minAppVersion` (`manifest.json:5`, `1.4.0`) odpovídá použitému API. `setSubmenu` je řešený přes runtime probe (`main.ts:2348-2356`), což je v pořádku.
9. **README sekce Development (≈ř. 1464–1480)** tvrdí, že `main.js` se commituje, protože plugin žije přímo ve vaultu. Pro komunitní plugin: `main.js` a `vault-search.js` vyřadit z gitu (`.gitignore`) a distribuovat jen přes GitHub Release. Commitnutý build recenzenti nemají rádi, protože nejde ověřit proti zdroji.
10. **Instalační návod v README chybí.** Doplnit „Installation“ (Community Plugins / BRAT / ruční) a hlavně „Kde vzít artwork“: vlastní kresby, nebo packy, ke kterým má uživatel práva. Neodkazovat na stažení fanouškovských packů chráněných postav.
11. **Screenshoty a GIF v README** jen s vlastním placeholderem nebo vlastní či CC0 grafikou, ne s 44 lokálními packy.
12. **Název:** „Shimeji Desktop Mascot“ je v pořádku, neobsahuje „Obsidian“ ani „Plugin“. Do README ale přidat větu „unofficial, not affiliated with Group Finity / Shimeji-ee“.

---

## 3. NICE-TO-HAVE

1. Zkrátit README ze 108 KB na stránku pro uživatele. Interní detaily portu přesunout do `docs/` a `SOURCE_AUDIT.md` (160 KB, interní pracovní dokument) přesunout do `docs/` nebo z repa odstranit.
2. Předpony `shimeji-` v ID příkazů (`src/main.ts:431-516`) jsou zbytečné, protože Obsidian ID prefixuje sám. Před první publikací je zkrátit (např. `spawn`, `remove-all`). Později by to rozbilo uživatelské zkratky.
3. Ribbon tooltip „Toggle Shimeji mascots“ (`main.ts:463`) a názvy příkazů převést do sentence case a nepoužívat v nich jméno pluginu (bot: „no-plugin-name-in-command-name“).
4. Testy obsahují absolutní cestu `/Users/Admin/Documents/jojojo/Shimeji/img` (`test/appPack.test.ts:9`, `appPackRuntime.test.ts:19`, `transform.test.ts:71`). Neškodí, ale působí neuhlazeně.
5. Přidat GitHub Action pro build a release (tag, pak `npm ci && npm run build` a upload tří souborů) a provenance (`actions/attest-build-provenance`). Nový adresář zobrazuje bezpečnostní scorecard.
6. Lokálně spustit `eslint-plugin-obsidianmd` (`npx eslint` s configem `obsidianmd/recommended`) a opravit vše, co nahlásí, ještě před odesláním.
7. Zvážit, zda `isDesktopOnly: false` (`manifest.json:9`) je opravdu otestované na iOS a Androidu. Bundle neobsahuje `require` Node modulů (ověřeno, jen `require("obsidian")`), takže technicky to sedí.
8. Vlastní přepínač „Store API key per device“: ukládat klíč do `localStorage` nebo SecretStorage (Obsidian 1.11+), aby se nesynchronizoval přes `data.json`.

---

## 4. Co je OK (není potřeba řešit)
- `innerHTML` je jen se statickými SVG literály (`src/placeholder/placeholderSprite.ts:21,28,35`), žádný uživatelský vstup. Ostatní DOM se tvoří přes `createEl` a `createDiv` (216×).
- Síťové požadavky jdou všude přes `requestUrl` (žádný `fetch` ani `XMLHttpRequest`).
- Žádné výchozí hotkeys. Žádný globální `app`, používá se `this.app`.
- `onunload` (`src/main.ts:704-717`) ruší timery, rAF, stage, zvuky i debug global. Eventy a intervaly jdou přes `registerEvent`, `registerDomEvent` a `registerInterval`.
- Žádná telemetrie, reklamy ani obfuskace. `main.js` je minifikovaný esbuildem, což je povoleno, zdroj je v repu.
- Velikost `main.js` je 403 KB, rozumné.
- `LICENSE` (MIT) i `versions.json` (`{"0.1.0": "1.4.0"}`) existují. `manifest.json` má všechna povinná pole včetně `author` a `authorUrl`.
- AI je ve výchozím stavu vypnuté, poslání obsahu poznámky je opt-in (`activeNoteContextEnabled: false`) a úpravy poznámek se před zápisem potvrzují.

---

## 5. Postup odeslání krok za krokem

1. **Opravit blockery B1–B5** a should-fix 1–3 a 6. ID zvolit definitivně, protože už nepůjde změnit.
2. Synchronizovat verze: `manifest.json` `"version": "1.0.0"` (nebo `0.1.0`), `package.json` `version` a `versions.json` `{"1.0.0": "<minAppVersion>"}`.
3. `npm ci && npm run build`. Ověřit, že `main.js` neobsahuje `require` mimo `obsidian` a že se nebuilduje `vault-search.js`.
4. **Test čisté instalace:** nový prázdný vault, do `.obsidian/plugins/<nové-id>/` dát jen `main.js`, `manifest.json` a `styles.css`. Zapnout plugin a ověřit placeholder maskota, Create character, nastavení a AI chat s klíčem. Totéž na mobilu (Obsidian mobile, plugin přes Sync nebo BRAT).
5. Lokálně spustit `eslint-plugin-obsidianmd` a opravit nálezy.
6. README: nahoře krátký popis, screenshot nebo GIF **s vlastní grafikou**, Installation, Network & privacy, Credits & license (Shimeji, Shimeji-ee, Kilkakon, transformers.js nebo model, pokud zůstanou).
7. Commit a push na `main` (repo musí být veřejné).
8. **GitHub Release:** tag přesně podle `manifest.json` `version`, **bez „v“** (např. `1.0.0`). Jako *binární přílohy* nahrát `main.js`, `manifest.json` a `styles.css`. Ne zip a ne jen zdroj.
   `gh release create 1.0.0 main.js manifest.json styles.css --title "1.0.0" --notes "Initial release"`
9. **Odeslání:**
   - Od května 2026 běží nový adresář a developer dashboard **community.obsidian.md** („Obsidian Community“, s automatickým review a scorecardem). Přihlásit se tam GitHubem, zvolit *Submit plugin* a vyplnit repo, ID, název, autora a popis (stejný text jako v manifestu).
   - Pokud dashboard stále odkazuje na GitHub: fork `obsidianmd/obsidian-releases`. Na **konec** `community-plugins.json` přidat
     `{ "id": "<id>", "name": "Shimeji Desktop Mascot", "author": "Krystof Skala", "description": "<stejný text jako manifest>", "repo": "krystofskala/obsidian-shimeji" }`
     a otevřít PR podle šablony, kde se zaškrtnou všechny checkboxy (testováno na Windows, macOS, Linux, Android a iOS podle `isDesktopOnly`, README, LICENSE, release assety).
   - *Aktuální postup ověřit v dokumentaci (docs.obsidian.md → Submit your plugin), protože se v roce 2026 měnil.*
10. **Počkat na automatickou kontrolu** (bot nebo scorecard). Chyby opravit novým release se **stejnou** verzí (přepsat assety) nebo s vyšší verzí, pak napsat do PR komentář „/skip“ nebo „rebased“ podle instrukcí bota.
11. **Manuální review** trvá typicky týdny. Na připomínky odpovídat v PR nebo dashboardu a každou opravu vydat jako nový release.
12. Po schválení: každá další verze znamená bump `manifest.json` a `versions.json`, tag a release se třemi soubory. Obsidian si aktualizace najde sám.

### Pravidla pro character packy (trvale)
- Do repa, release, issues, README ani na stránku v adresáři **nikdy** nedávat sprity z Naruta, Rick and Morty, Yakuzy, Deadpoola, Pokémonů a podobně. Plugin je „engine“ a artwork si dodává uživatel sám, což je pro takový software běžné a právně v pořádku.
- Pro demo nakreslit nebo vygenerovat vlastního maskota, nebo použít CC0 grafiku. Případně udělat jeden „oficiální“ starter pack s vlastní licencí (např. CC BY 4.0) jako samostatné stažení.
- Lokální vývojová složka s 44 packy ať zůstane mimo git, nejlépe mimo složku pluginu (viz B5).
