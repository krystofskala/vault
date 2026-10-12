# Oslovování firem: šablony

Zásady:
- Oblast: celá ČR online. Praha a Středočeský kraj i s osobní schůzkou (ve zprávě nabídnout „klidně se zastavím“).
- **Vždy osobně.** Jedna konkrétní věc, kterou jsem na jejich webu viděl, ne hromadný mail.
- Max. 5–6 vět. Žádné „AI“ v prvním mailu, to až při hovoru.
- Nabídnout něco zdarma a bez závazku: krátký rozbor webu.
- Psát na firemní kontakt ze stránek. Na B2B oslovení s jasnou možností odmítnutí se v ČR zpravidla vztahuje oprávněný zájem. Max. 1 připomínka, pak dost.
- Každé oslovení zapsat do tabulky v `leady-ricany-v1.md`: datum, reakce.

---

## Šablona A: web na Wixu nebo Webnode s vlastní doménou

**Předmět:** Váš web {firma} – krátký postřeh

Dobrý den,

jmenuji se Kryštof Skala a dělám weby pro malé firmy. Díval jsem se na váš web {url} a všiml jsem si, že {konkrétní postřeh – např. „se na mobilu načítá přes 5 sekund“ / „na Seznamu ho při hledání ‚{obor} Říčany‘ nenajdu na první stránce“ / „rozvrh je z roku 2024“}.

Nedávno jsem podobně převedl z Wixu web dojo v Říčanech: https://aikidoricany.cz. Teď je rychlejší, je vidět na Googlu i na Seznamu a nemusí platit předplatné.

Jestli chcete, pošlu vám zdarma krátký rozbor, co bych na vašem webu zlepšil a kolik by to stálo. Bez závazků.

Hezký den
Kryštof Skala
krystofskala.com · {telefon}

---

## Šablona B: web na podadrese (*.wixsite.com, *.webnode.cz) nebo s reklamním pruhem

**Předmět:** {firma} – vlastní adresa webu

Dobrý den,

při hledání „{obor} {město}“ jsem narazil na váš web {url}. Běží na adrese {wixsite/webnode}, a to zákazníkům i vyhledávačům působí méně důvěryhodně než vlastní doména typu {navrh}.cz.

Pomáhám malým firmám s rychlými weby bez měsíčního předplatného, třeba https://aikidoricany.cz. Vlastní doména stojí pár set korun ročně a hosting nic.

Mám vám zdarma poslat, jak by to u vás mohlo vypadat?

Kryštof Skala
krystofskala.com · {telefon}

---

## Připomínka (po 7–10 dnech, jen jednou)

Dobrý den, jen se připomínám s nabídkou rozboru vašeho webu. Kdyby to teď nebylo aktuální, stačí odepsat „ne“ a už se neozvu. Díky! Kryštof

---

## Co poslat jako „rozbor zdarma“ (připraví Claude za 10 minut)

1. Rychlost: PageSpeed Insights pro mobil (skóre a 2–3 hlavní problémy).
2. Vyhledatelnost: pozice na Googlu a Seznamu pro „{obor} {město}“, stav titulku a popisu.
3. Mobil: screenshot, co je rozbité nebo nečitelné.
4. Obsah: zastaralé informace.
5. Návrh: co bych udělal, pevná cena, termín.

---

## Námitka: „Na Wixu si to můžu upravit sám“

Odpověď: „U mě taky. Texty, fotky, aktuality, rozvrh a ceník upravíte v jednoduchém editoru, kam se přihlásíte e-mailem. Nepotřebujete žádný účet navíc. Co nejde: přetahovat bloky a měnit rozložení. To udělám já, když budete chtít.“

Technicky: **Pages CMS** (pagescms.org, open source, hostovaný zdarma, dá se i self-hostovat). Klienta pozvu jako *collaborator* e-mailem a nepotřebuje účet na GitHubu. Obsah je v JSON nebo Markdownu v repu a web se po uložení sám přestaví (GitHub Actions).
Záloha: Sveltia CMS + Cloudflare Worker na přihlášení.

Cenové srovnání pro klienta: Wix Light stojí asi 17 USD/měsíc při roční platbě, tedy kolem 4–5 tis. Kč ročně (aktuální ceny v Kč ověřit na wix.com). Jednorázový web za 8–12 tis. Kč se tak vrátí za 2–3 roky. Volitelný paušál za správu (např. 200–300 Kč/měsíc) je pořád levnější než Wix a pro mě znamená opakovaný příjem.
