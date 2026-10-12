# Lichess Blunder Trainer: připravenost na Obsidian Community Plugins

> Audit 12. 10. 2026, pouze čtení. Repo `krystofskala/obsidian-blunder-trainer`, HEAD `1e00007`, verze 0.8.0.
> Kontroloval jsem podle aktuálních docs (`obsidianmd/obsidian-developer-docs`: *Submit your plugin*, *Submission requirements for plugins*, *Developer policies*, *Community directory FAQ*, *Manifest*), podle pravidel oficiálního `obsidianmd/eslint-plugin`, kterým automatická revize hodnotí kód, a podle `lichess-org/lila/COPYING.md`, kde jsou licence sad figur.
> Neověřeno: jestli je repo veřejné (GitHub API zde vrací 403). `git ls-remote --tags origin` nevrací žádné tagy, takže na GitHubu zatím **není žádný release**.

**Verdikt: zatím nepodávat.** Kód je jinak v dobrém stavu: používá `requestUrl`, nemá výchozí hotkeys ani `console.log`, uklízí po sobě přes `MarkdownRenderChild`, timery se ruší v `destroy()`, nepoužívá Node API, takže `isDesktopOnly: false` sedí, a `main.js` jde reprodukovat přes `node build.mjs`. Brání ale **licence sad figur** a několik věcí, které automatický review označí jako **error**: manifest, `innerHTML`, `<h3>` v nastavení, chybějící release a chybějící build skript.

Pozn.: proces podání se v roce 2026 změnil. PR do `obsidianmd/obsidian-releases` se už nedělá, plugin se podává přes **community.obsidian.md**. Následuje automatický review se sekcemi Manifest / Releases / Source code / Build verification.

---

## A. BLOCKERY (bez nich review neprojde nebo hrozí porušení licence)

### A1. Licence sad figur: `vendor/CREDITS.md` uvádí chybné údaje a část sad není svobodná
`vendor/CREDITS.md:20-25`, `vendor/pieces.js:1`, `vendor/make-pieces.mjs:3,13`, `README.md:73,178,185` tvrdí, že všech 10 sad z lily je pod GPL-2.0. Podle `lila/COPYING.md` je skutečnost tato:

| sada | autor | skutečná licence | verdikt |
|---|---|---|---|
| cburnett | Colin M.L. Burnett | GPLv2+ | OK, jen při GPL licenci pluginu |
| merida | Armando H. Marroquin | GPLv2+ | OK, jen při GPL licenci pluginu |
| shapes | flugsio | CC BY-SA 4.0 | OK s GPLv3 (jednosměrně kompatibilní), nutná atribuce |
| firi | James Faure | CC BY 4.0 | OK, nutná atribuce |
| pixel | therealqtpi | **AGPLv3+** | buď celý plugin AGPL, nebo sadu vyhodit |
| alpha | Eric Bentzen | **„free for personal non commercial use“** (není open source) | **vyhodit** |
| staunty | sadsnake1 | **CC BY-NC-SA 4.0** | **vyhodit** |
| maestro | sadsnake1 | **CC BY-NC-SA 4.0** | **vyhodit** |
| anarcandy | caderek | **CC BY-NC-SA 4.0** | **vyhodit** |
| horsey | cham, michael1241 | **CC BY-NC-SA 4.0** | **vyhodit** |

Proč je to problém:
- **MIT × GPL.** `main.js` vkládá GPL SVG (cburnett, merida) přímo do jednoho souboru s MIT kódem a šíří se jako celek. Podmínky GPLv2+ se tím vztahují na celý `main.js`, takže MIT `LICENSE` u release assetu neodpovídá skutečnosti. (Chessground se nepoužívá, deska je vlastní. Jeho GPL-3.0 se tedy netýká, problém je jen v SVG.)
- **NC licence (CC BY-NC-SA) a „non commercial“ (alpha)** nejsou kompatibilní s MIT ani s GPL. Developer policies vyžadují „comply with the original licenses … including attribution“, a to současný stav nesplňuje: licence jsou uvedené špatně a u staunty/maestro/anarcandy/horsey/firi/shapes chybí jména autorů.

**Oprava (doporučená varianta, nejmenší ztráta):**
1. Relicencovat plugin na **GPL-3.0-or-later**: nahradit `LICENSE` plným textem GPLv3 s řádkem `Copyright (C) 2026 Krystof Skala` a v README napsat „GPL-3.0-or-later“. Pokud kód zatím nikdo jiný nepřispěl, smíš to udělat sám.
2. Z `vendor/make-pieces.mjs:13` (`LICHESS = [...]`) odebrat `alpha`, `staunty`, `maestro`, `anarcandy`, `horsey`, `pixel` a pustit `node vendor/make-pieces.mjs`. Ze `src/plugin.js:75-88` (`PIECE_SETS`) odebrat stejné klíče. Fallback na cburnett už existuje (`src/plugin.js:426-427`), takže uživatelům s odebranou sadou se nic nerozbije.
3. Volitelně doplnit svobodné náhrady z lily: `fantasy`, `spatial`, `celtic` (Maurizio Monge, **MIT**), `chessnut` (Alexis Luengas, **Apache-2.0**, s GPLv3 OK), `rhosgfx` (**CC0**), `papercut` / `totoy` / `kiwen-suwi` (**CC BY 4.0**).
4. Přepsat `vendor/CREDITS.md`: u každé sady autor, licence s odkazem a zdroj. U CC BY / BY-SA uvést i „changes: whitespace minified, inlined into main.js“. Stejnou tabulku dát do README (sekce *Credits / Third-party assets*).
5. Opravit hlavičky `vendor/pieces.js:1` a `vendor/make-pieces.mjs:3`, kde je teď nepravdivé „GPL-2.0“.

*Alternativa:* ponechat MIT a dávat jen permisivní sady (neo, firi, fantasy/spatial/celtic, chessnut, rhosgfx, CC BY sady, unicode). V tom případě musí ven i cburnett a merida, takže by zmizela výchozí „klasická“ sada. Nedoporučuji.

### A2. Sada „neo“ je původní, ale má kolizní název
`vendor/make-pieces.mjs:15-48` kreslí figury z jednoduchých geometrických primitiv (kruh, lichoběžníky, kříž), přidáno v commitu `d8938c5`. S rastrovou sadou **Neo od chess.com** nemá vizuálně ani technicky nic společného, převzetí tedy nehrozí. Název „neo“ je ale u šachových sad spojený s chess.com a recenzent nebo uživatel může nabýt dojmu, že jde o kopii.
**Oprava:** přejmenovat na např. `geo` nebo `flat`: `make-pieces.mjs:43-48`, `src/plugin.js:76`, `README.md`, `CREDITS.md:19`. V `onload` přidat migraci `if (this.settings.pieceSet === "neo") this.settings.pieceSet = "geo";`. Formálně to není blocker, ale stojí to pět minut, tak to udělej rovnou.

### A3. `manifest.json`: popis neprojde validací
`manifest.json:6` je česky, obsahuje diakritiku, dvojtečku a pomlčku „–“. Validátor (`eslint-plugin/lib/rules/validateManifest.ts`) vyžaduje regex `^[A-Za-z0-9\s.,!?'"-]+$`, velké písmeno na začátku, tečku na konci, nejvýš 250 znaků a nesmí obsahovat slova „obsidian“ ani „plugin“.
**Oprava** (ASCII, 183 znaků):
```json
"description": "Train on your own Lichess blunders and puzzles on an interactive board inside your notes. Play a move, get instant feedback, reveal the solution with an arrow and step through the line.",
```
Ostatní pole: `id` `lichess-blunder-trainer` je v pořádku (malá písmena a pomlčky, bez „obsidian“, nekončí na „plugin“, v `community-plugins.json` je unikátní). `name` je v pořádku (Basic Latin, bez „Plugin/Obsidian“). `minAppVersion` 1.4.0 je v pořádku (použitá API jsou starší). Doporučuji `"author": "Krystof Skala"` místo `krystof.skala` a přidat `"authorUrl": "https://github.com/krystofskala"`. `fundingUrl` nepřidávat, pokud nepřijímáš dary.

### A4. `innerHTML` (no-unsanitized, úroveň **error**)
- `src/plugin.js:693`: `span.innerHTML = m.html;` (figury na desce)
- `src/plugin.js:1002`: `ghost.innerHTML = m.html;` (tažená figura)
- `src/plugin.js:1244`: `b.innerHTML = m.html;` (výběr promoce)

Obsah je sice statický (přibalené SVG), ale pravidlo `no-unsanitized/property` je v doporučené konfiguraci nastavené na `error` a guidelines `innerHTML` výslovně zakazují.
**Oprava:** jedna pomocná funkce a SVG naparsovat jednou při načtení:
```js
const SVG_CACHE = new Map();
function svgNode(markup) {
	let tpl = SVG_CACHE.get(markup);
	if (!tpl) {
		tpl = new DOMParser().parseFromString(markup, "image/svg+xml").documentElement;
		SVG_CACHE.set(markup, tpl);
	}
	return tpl.cloneNode(true);
}
// …
span.appendChild(svgNode(m.html));
```
Alternativa: `<img>` s `src = "data:image/svg+xml;utf8," + encodeURIComponent(svg)` (`createEl("img", { attr: { src, draggable: "false" } })`).

### A5. Nadpisy v nastavení přes `<h3>` (no-manual-html-headings, **error**)
`src/plugin.js:1680, 1702, 1760, 1837` obsahují `containerEl.createEl("h3", …)`.
**Oprava:** `new Setting(containerEl).setName("Lichess").setHeading();` a totéž pro „Trénink“, „Vzhled“ a „Šipky“. V nadpisech nepoužívat slovo „settings / nastavení“.

### A6. Chybí GitHub release a `package.json` s build skriptem
- Na remotu nejsou tagy, a tedy ani release. Obsidian stahuje `main.js`, `manifest.json` a `styles.css` z release, jehož **tag se přesně shoduje s `version`** v manifestu (bez „v“).
- Build verification v review spouští `npm run build` (případně `build:plugin` nebo `compile`). Repo **nemá `package.json`**, takže ověření buildu nebude mít co spustit.

**Oprava:** do kořene přidat:
```json
{
  "name": "lichess-blunder-trainer",
  "version": "1.0.0",
  "private": true,
  "license": "GPL-3.0-or-later",
  "scripts": { "build": "node build.mjs" }
}
```
Potom vydat release (postup v části D).

### A7. README: zveřejnění síťového provozu a jazyk
Developer policies: „Network use. Clearly explain which remote services are used and why“ a „Account required…“. README je jen česky (`README.md`), informace o síti jsou roztroušené a chybí přehledná sekce. Directory zobrazuje výňatek z README uživatelům z celého světa.
**Oprava:** README napsat **anglicky** a českou verzi dát do `README.cs.md` (odkaz nahoře) nebo jako sekci „Česky“ na konci. Povinně doplnit sekci:

```markdown
## Network use and privacy
- Puzzle blocks (`puzzle: daily | next | <id>`) call the public Lichess API
  (`https://lichess.org/api/puzzle/...`) to download puzzles. Blunder blocks work fully offline.
- No telemetry, no other servers. Nothing is sent except the request itself
  and, if you set one, your Lichess API token (as `Authorization: Bearer`) to lichess.org only.
- A Lichess account is NOT required. A token is optional (higher rate limits, personalised `next`).
- The token is stored in plain text in `.obsidian/plugins/lichess-blunder-trainer/data.json`.
  If you sync or share your vault, the token travels with it.
- The optional Templater script in `extras/` downloads your analysed games from
  `https://lichess.org/api/games/user/<username>`.
- Not affiliated with or endorsed by lichess.org.
```
Dále: „Není v obchodě“ (`README.md:34`) nahradit postupem „Settings → Community plugins → Browse → Lichess Blunder Trainer“ a BRAT ponechat jako alternativu pro betu. Opravit sekci licencí (`README.md:178-185`) podle A1. Přidat screenshot nebo GIF.

---

## B. SHOULD-FIX (review spíš dá warning, nebo to vytkne člověk či uživatelé)

1. **Token v code bloku** (`src/plugin.js:28`, `1465`, `README.md:88`): klíč `token:` v poznámce znamená tajemství v Markdownu, které se synchronizuje, publikuje a sdílí. Podporu `token:` v bloku zrušit (nebo ignorovat a vypsat varování) a token brát jen z nastavení. Pokud zůstane, napsat do README výrazné upozornění.
2. **API volání při každém vykreslení**: `src/plugin.js:1467` stahuje puzzle znovu při každém přepnutí Reading/Live Preview a při každém scrollu, kdy se blok znovu vykreslí. `daily` cachovat v paměti, např. `Map` podle data a specu, aby lichess.org nedostávalo zbytečné požadavky a nevracelo 429.
3. **Odkaz z bloku bez validace** (`src/plugin.js:899-906`): `href: this.opts.meta.url` pochází z uživatelského bloku a může obsahovat `javascript:…`. Povolit jen `^https?://` (ideálně `https://lichess.org/`).
4. **Neošetřený promise** (`src/plugin.js:920`): `navigator.clipboard.writeText(fen)` vrací promise a `try/catch` jeho zamítnutí nezachytí. Funkci udělat `async` a použít `await` uvnitř `try`.
5. **Jazyk UI je jen český** (nastavení `src/plugin.js:1680-1884`, tlačítka, hlášky). Pravidla to nezakazují, ale pro globální directory je to vážná bariéra. Doporučení: anglické výchozí texty a češtinu přes `getLanguage()` (pravidlo `prefer-get-language`), například malý slovník `{ en, cs }`. Texty psát v sentence case (pravidlo `ui/sentence-case`).
6. **Templater extras** (`extras/templater/lichessBlunderCallout.js`):
   - `:197` používá `fetch`, což pravidlo `no-restricted-globals` označí warningem. V Templater user scriptu je k dispozici `tp.obsidian.requestUrl`, stačí ho použít.
   - `:17`, `:33` odkazují na „Lichess Blunder Callout - Setup.md“, který v repu chybí. Návod přidat do README.
   - `:21-23` mají napevno cestu `Scripts/templater/…` a token v `lichess-config.json` leží v plain textu uvnitř vaultu. Popsat v README.
   - Složka `extras/` není ve scanner ignore listu, takže ji review lintuje. Buď ji vyčistit, nebo přesunout do `scripts/templater/` (`scripts` scanner ignoruje).
7. **Vendorované knihovny v lintu**: `vendor/chess.js` (1 905 řádků CJS) a `main.js` scanner lintuje, protože `vendor/` ani `main.js` nejsou v ignore listu. Lepší je `chess.js` jako npm dependency (soubor pak leží v `node_modules`, který se ignoruje) a bundlovat přes esbuild. Zároveň aktualizovat z `1.0.0-beta.8` na aktuální stabilní 1.x. BSD-2 hlavička je zachovaná (`vendor/chess.js:2-26`), to je v pořádku.
8. **`main.js` v gitu**: šablona Obsidian ho gitignoruje a v repu by měl být jen zdroj, `main.js` patří do release. Přidat `main.js` do `.gitignore` a `git rm --cached main.js`. Build je reprodukovatelný, takže build verification sedí.
9. **Ukládání na každý stisk klávesy**: textová pole v nastavení (token `src/plugin.js:1693` a HEX barvy) volají `saveSettings()` a tím překreslují všechny desky při každém znaku. Stačí debounce (`obsidian.debounce`, 300–500 ms).
10. **Obchodní značka Lichess**: název je v pořádku, ale do README přidat „Not affiliated with lichess.org“ (je už ve vzoru v A7). Lichess je nezisková organizace s otevřeným API, takže riziko je malé.

## C. NICE-TO-HAVE

1. Verzi pro první veřejné vydání zvednout na **1.0.0** (`manifest.json:4`, `versions.json`: `"1.0.0": "1.4.0"`).
2. `getSettingDefinitions()` pro vyhledávání v nastavení Obsidianu 1.13+ (pravidlo `prefer-setting-definitions`, jen warning). Při `minAppVersion` < 1.13 musí zůstat i `display()`.
3. `this.display()` po smazání SRS a progressu (`src/plugin.js:1727, 1755`) nechat, nebo na 1.13+ použít `update()`.
4. Načítání blunderů přesunout z Templater scriptu přímo do pluginu jako příkaz „Insert blunders from Lichess“ (bez výchozího hotkey). Odpadne tím závislost na Templateru a nastavení bude jen na jednom místě.
5. GitHub Action, která při pushnutí tagu sestaví plugin a vytvoří release s `main.js`, `manifest.json` a `styles.css`.
6. Lokálně si pustit oficiální `eslint-plugin-obsidianmd` (`npx eslint .` s `obsidianmd.configs.recommended`) a před podáním opravit všechny errory i warningy.
7. Komentáře v `src/plugin.js` jsou česky. Pro případné přispěvatele by pomohla angličtina, ale není to nutné.
8. Na desku přidat `aria-label` pro přístupnost.

---

## D. Postup podání krok za krokem

1. **Opravit A1–A7** (licence, figury, manifest, innerHTML, headings, package.json, README) a podle možností i B1–B9.
2. `npm run build` (tj. `node build.mjs`), otestovat na desktopu i na mobilu (Android/iOS) a v novém prázdném vaultu: puzzle bez tokenu i s tokenem, fronta blunderů, přepínání sad figur.
3. Volitelně spustit lokální lint: `npm i -D eslint eslint-plugin-obsidianmd` a `eslint.config.mjs` s `obsidianmd.configs.recommended`.
4. Bump verze: `manifest.json` `"version": "1.0.0"`, do `versions.json` přidat `"1.0.0": "1.4.0"`, commit a push na výchozí branch. Directory čte `manifest.json` z HEAD výchozí branche.
5. Ověřit, že repo je **veřejné**. Pokud má zdroj zůstat soukromý, použít veřejné repo s assety a nainstalovat GitHub App „Obsidian Community directory“ na soukromé repo.
6. **GitHub release:** tag **`1.0.0`** (přesně jako `version`, bez „v“), název libovolný, poznámky k vydání. Jako binární přílohy nahrát `main.js`, `manifest.json` a `styles.css`. Nesmí jít o draft ani prerelease.
   `gh release create 1.0.0 main.js manifest.json styles.css --title "1.0.0" --notes "First public release"`
7. Na **https://community.obsidian.md** se přihlásit Obsidian účtem, v *Profile → GitHub → Connect* propojit GitHub a zapnout „Action required notifications“.
8. *Plugins → New plugin*: zadat URL `https://github.com/krystofskala/obsidian-blunder-trainer` a Owner (já). Odsouhlasit Developer policies a závazek údržby, pak **Submit**.
9. Na stránce záznamu je možné před releasem pustit **Review branch** (náhledový scan libovolné branche, tagu nebo SHA). Projít výsledky v sekcích Manifest / Releases / Source code / Build verification.
10. Errory opravit, zvýšit verzi (1.0.1), vydat nový release a v menu **…** zvolit **Request review**. Plugin bude instalovatelný až po vyřešení všech errorů. Popis ve výpisu lze upravit a kdykoli kliknout **Publish**.
11. Pro kategorii plateb zvolit **Free** (Lichess i token jsou zdarma).
12. Po zveřejnění oznámit plugin na fóru (Share & showcase) a na Discordu v `#updates` (nutná role developer). Každá další verze je už jen nový GitHub release, znovu podávat se nemusí.
