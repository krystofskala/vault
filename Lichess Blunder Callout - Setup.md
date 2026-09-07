Návod na zprovoznění funkce, která do daily note vloží callout s jedním tvým
blunderem z Lichess partie (stejná myšlenka jako lichess "Poučte se ze svých
chyb"), s náhledem partie přes Chesser a odkazem přímo na daný tah na Lichess.

## Jak to funguje

1. Script stáhne z Lichess API tvoje **analyzované** partie (`analysed=true`).
2. V nich najde tahy, které Lichess ohodnotil jako `Blunder`, odehrané tebou
   (ne soupeřem).
3. Vybere náhodně jeden z tahů, které ještě nejsou v `_data/lichess-blunders-used.json`,
   a ten soubor si po výběru zapíše — takže se stejný blunder ze stejné partie
   už nikdy nezopakuje. Jiný blunder ze stejné partie se ale znovu objevit může,
   to je v pořádku.
4. Pokud nemáš žádné nové blundery (nebo žádné analyzované partie), vypíše se
   místo toho informační/varovný callout — nic nespadne.

Pozn.: Chesser v callout bloku ukáže celou partii (můžeš si v ní procházet
tahy), ale needitovat/needituje se rovnou na konkrétní tah blunderu — na to
slouží odkaz "Otevřít přesně tento tah na Lichess", který tě přenese rovnou na
danou pozici v Lichess analýze (tam uvidíš i doporučený lepší tah).

## 1. Instalace pluginů

V Community plugins nainstaluj a zapni:

- **Templater**
- **Chesser**

## 2. Nastavení Templateru

Settings → Templater → *Script files folder location* → nastav na `Scripts`
(složka `Scripts/lichessBlunderCallout.js` už je ve vaultu).

## 3. Konfigurace (Lichess username)

Zkopíruj `_data/lichess-config.example.json` do `_data/lichess-config.json`
(tenhle soubor je v `.gitignore`, takže se nikdy nedostane do gitu) a vyplň:

```json
{
	"username": "tvuj-lichess-nick",
	"token": "",
	"gamesPerFetch": 50,
	"maxFetchRounds": 4
}
```

- `username` — tvůj Lichess nick přesně jak je na profilu (case-insensitive,
  ale ať se neplete).
- `token` — nepovinné. Veřejné partie jde číst i bez tokenu. Token (Lichess →
  Nastavení účtu → API access tokens, žádný scope netřeba) se hodí hlavně kvůli
  vyšším rate limitům. Necháš-li prázdné, chodí se anonymně.
- `gamesPerFetch` — kolik partií se stáhne v jedné dávce (default 50).
- `maxFetchRounds` — kolikrát se sáhne pro další (starší) dávku partií, pokud
  jsou všechny blundery v aktuální dávce už použité (default 4).

## 4. Šablona

V `Templates/Daily Note.md` (nebo ve své vlastní daily note šabloně) je/přidej:

```
<%* tR += await tp.user.lichessBlunderCallout(tp) %>
```

Nastav v Core plugin **Daily notes** (nebo Periodic Notes), ať se používá
tahle šablona.

## 5. Volitelné: vzhled callout bloku

Callout má typ `blunder`, což Obsidian bez definice stylu zobrazí s výchozí
ikonou. Pro hezčí vzhled si vytvoř CSS snippet (Settings → Appearance →
CSS snippets), např. `lichess-blunder-callout.css`:

```css
.callout[data-callout="blunder"] {
	--callout-color: 220, 50, 47;
	--callout-icon: lucide-flame;
}
```

## Řešení problémů

- **"Chybí nebo je neplatný soubor..."** → `_data/lichess-config.json`
  neexistuje nebo v něm chybí `username`. Zkontroluj krok 3.
- **"Chyba při komunikaci s Lichess API"** → zkontroluj připojení k internetu
  a že `username` v configu odpovídá skutečnému Lichess účtu.
- **"Nenašel jsem žádný nový blunder"** → buď nemáš na Lichess žádné
  analyzované partie (partie musí projít computer analysis), nebo jsi už
  probral všechny dostupné blundery z posledních `gamesPerFetch *
  maxFetchRounds` partií — zvyš tato čísla v configu.
