# Co jsem dělal s Claude Code a jak z toho udělat přivýdělek

Stav k 12. 10. 2026. Zdroj: 30 sessions v Claude Code (srpen až říjen 2026), 7 GitHub repozitářů a kontext z chatu v Claude app.

---

## 1. Všechno, co jsem s Claude Code dělal

### Opentify: vlastní Spotify (zdaleka největší projekt)
- Self-hosted hudební server s vlastními appkami: web (PWA), iOS, Android a Windows. Postavené na FastAPI, Redis, Flutteru a Dockeru, běží na Proxmoxu a jde ven přes Tailscale Funnel.
- **792 commitů za 3 týdny** (27. 9. – 12. 10.), přes 100 tisíc řádků kódu.
- Katalog z MusicBrainz a Deezeru, párování vlastní knihovny (úspěšnost jsem zvedl ze 45 % na 96,5 %), Wrapped, mixy, rádio, texty písní, podcasty, audioknihy, scrobbling, import ze Spotify a YouTube, filtr na AI hudební spam, Liquid Glass UI.
- **Reální uživatelé**: táta (iOS na pomalých mobilních datech), Anton (měsíc to zkouší místo Apple Music), rodina a kamarádi.
- Provoz: stabilní větev pro uživatele a dev/test zvlášť, logování rage-tapů, upozornění přes ntfy, noční buildy pro iOS v GitHub Actions, auto-update s rollbackem a zálohy.
- Komerčně nepoužitelné: stahování přes Soulseek a torrenty je právně šedá zóna. Zůstává jako hobby a ukázka, co umím.

### Homelab a self-hosting
- Koupě serveru přes bazary (ThinkCentre M720s, 32 GB RAM za 4 700 Kč, se smlouváním).
- Proxmox s VM a LXC: AdGuard Home jako DNS pro všechna zařízení, zálohy přes vzdump, Tailscale.
- Předtím na notebooku: Debrid Media Manager (import 12,8 milionu titulů z IMDb), Zurg a rclone, Jellyfin (pro tátu a babičku), Navidrome, ErsatzTV.
- Sunshine a Moonlight: streamování her a desktopu na iPhone (Fedora VM, PaperWM, Liquid Glass téma, mapování myši).
- Cíl: zrušit předplatná a mít vlastní data na vlastním železe.

### Weby
- **aikidoricany.cz** (dojo, rodinný projekt): jednostránkový web s horizontálním scrollováním.
  - Obnovil jsem ztracenou historii z 54 snapshotů na Wayback Machine (66 původních příspěvků do kroniky).
  - Lokální editor obsahu, komiksy Petra Friedla.
  - Spuštění: přesun DNS z Wixu na GitHub Pages, Search Console a Seznam Webmaster, sitemap, 404 přesměrování starých Wix odkazů, GoatCounter, SEO audit a alt texty u 88 obrázků.
  - **Nedokončeno:** přesun DNS z Wixu na Forpsi a zrušení Wixu.
- **Yogic Blue Life**: PWA pro tátu na sledování jógové praxe (Foglarův Modrý život a osm stupňů rádža jógy), offline, s exportem a importem.

### Obsidian
- **obsidian-shimeji**: plugin s maskoty na ploše, port Java enginu Shimeji-ee.
  - Přes 45 tisíc řádků kódu, zhruba 1 100 testů, 44 balíčků postav.
  - Editor postav a slicer spritesheetů.
  - **AI asistent** s řetězcem záložních backendů (Anthropic, OpenAI-kompatibilní nebo lokální), lokální sémantické hledání ve vaultu (ONNX/WASM), „pokoj“ se dnem, nocí a deštěm.
  - MIT licence je připravená. **Nedokončeno:** zveřejnění v Community plugins.
- **obsidian-blunder-trainer**: šachový trenažér z vlastních blunderů na Lichessu, se spaced repetition (3× po sobě čistě), frontou blunderů a 11 sadami figur.
- **Vlastní systém vaultu**: daily notes s tlačítky, slidery a logem času, trackery filmů, her a knih (OMDb, RAWG, Steam), meetingy. Kamarádovi jsem z něj udělal zdokumentovanou startovací verzi s tutoriály.

### Rešerše a analýzy
- **Audit oprav v médiích**: metodika v2.1, bodování důkazů (max. 27 bodů), dashboardy v Obsidian Bases, případy K001–K004 (Einbeck: 24/27, žádné z 9 médií o vyvrácení nenapsalo) a návrh změny tiskového zákona.
- **GDPR výmazová kampaň** proti data brokerům a adtechu. Podle chatu je rozběhnutá a poloautomatizovaná, ale v cloudových sessions jsem ji nenašel, takže asi běží jinde.

### Nápady, které leží
- **Hra „Petrovští“ s Petrem Friedlem**: 2.5D v Godotu, styl Don't Starve nebo Tim Burton, 40 loupežníků. Čeká na domluvu s Petrem a nechci to bez financování.
- **Prague Street Tracker**: iOS appka, která zaznamenává prošlé ulice. Kód je hotový a CI zelené, chybí Mac na sestavení.
- Fork Google Earth: zahozeno, nejde to.

### V čem jsem dobrý (podle toho, co reálně vzniklo)
1. **Produktový vlastník a orchestrátor AI.** Kód sám nepíšu, ale věci dotahuju až do provozu s reálnými uživateli. To umí málokdo.
2. **Cit pro UX a design.** Testuju na telefonu, odhalím nekonzistence a chci detail jako v originále.
3. **Systémové myšlení.** Stavové automaty, záložní řetězce, spaced repetition, metodika s bodováním.
4. **Provoz.** DNS, CI/CD, Docker, Proxmox, zálohy, rollbacky, podpora netechnických uživatelů (táta, babička).
5. **Rigorózní rešerše.** Metodika proti cherry-pickingu, české právo (tiskový zákon, GDPR).
6. **Soukromí a nezávislost** jako osobní hodnota, která se táhne vším.

**Slabina, se kterou je potřeba počítat:** hodně rozjetých věcí a málo dokončených „na veřejnost“. Shimeji, Wix, street tracker, hra, audit médií, nic z toho není venku. Přivýdělek proto musí mít **max. 2 směry** a jasný první výstup.

---

## 2. Srovnání všech směrů

| Směr | Náročnost | První peníze za | Pasivita | Využije hotové | Verdikt |
|---|---|---|---|---|---|
| **A. Výmaz dat CZ/SK: DIY balíček → služba** | střední | 3–5 týdnů (DIY) | vysoká u DIY, střední u předplatného | GDPR kampaň, automatizace | **HLAVNÍ** |
| **C. Obsah o GDPR kampani (YouTube, blog, sociální sítě)** | střední | měsíce (monetizace), ale hned dělá reklamu A | střední | vzniká z A sám | **SPOJIT S A** |
| **E. Weby a automatizace pro malé lokální firmy (odchod z Wixu, SEO, n8n)** | nízká až střední | 2–4 týdny | nízká (služba) | aikidoricany.cz jako hotová reference | **BOKEM PRO RYCHLÉ PENÍZE** (sloučit s B) |
| B. AI automatizace pro malé firmy | střední | 2–4 týdny | nízká | Claude Code skills | sloučit do E |
| F. Placené šablony a systém pro Obsidian (Gumroad) | nízká | 2–3 týdny | vysoká | startovací vault pro kamaráda | možná později, malé peníze |
| G. Shimeji a blunder trainer: open source + donate | nízká (dotáhnout) | prakticky nikdy | – | hotové | **zveřejnit jako portfolio**, ne kvůli penězům |
| H. Homelab „zrušte předplatná“ pro jiné | střední | týdny | nízká | Proxmox, Opentify | zahodit jako byznys (podpora lidí doma je žrout času) |
| I. Opentify jako produkt | vysoká | – | – | – | **zahodit** (právní šedá zóna) |
| J. Hra s Petrem | velmi vysoká | 1,5–2 roky | – | – | odložit, ověřit pracovní smlouvu |
| K. Prague Street Tracker / Yogic app v App Store | střední | měsíce | vysoká | kód hotový | odložit (malý trh, existuje CityStrides) |
| L. Road tripy po USA | střední | měsíce | vysoká | – | **zahodit** (překrývá se s prací, riziko u zaměstnavatele) |
| M. Audit médií | vysoká | – | – | – | není byznys, případně později jako obsah nebo grant |

**Proč A+C:** konkurence je hlavně americká. Incogni pokrývá EU, ale české firmy a češtinu ne. Českou spotřebitelskou službu jsem v prvním hledání nenašel, ověřuje se to v `gdpr/overeni-konkurence-a-pravo.md`. DIY balíček je čistý digitální produkt bez právních rizik plné moci. Obsah vzniká z kampaně, kterou dělám tak jako tak. A soukromí je téma, které mě reálně baví, což je u mě podmínka dotažení.

dTest navíc zjistil, že americké služby (Optery, DeleteMe) odstranily v průměru jen 35 % údajů. To je dobrý argument i dobré téma na video.

**Proč E bokem:** mám hotovou referenci. Na trhu stojí jednoduchý web od freelancera 5–20 tis. Kč, automatizace v n8n nebo Make 10–30 tis. Kč a běžná sazba je 600–1 800 Kč/h. Spousta malých firem platí Wix nebo Webnode několik tisíc ročně za pomalý web, takže nabídka „rychlejší web, lepší SEO, zrušíte předplatné“ se prodává sama. Je to práce za peníze, ne pasivní příjem, ale rychle zaplatí čas na A.

**Kontrola před startem:** podívat se do pracovní smlouvy a vnitřních předpisů (§ 304 zákoníku práce zakazuje výdělečnou činnost v oboru zaměstnavatele bez souhlasu). Výmaz dat ani weby s game devem nesouvisí. U hry s Petrem by to problém být mohl.

---

## 3. Plán na 4 týdny

> **Aktualizace 12. 10.:** GDPR projekt začíná od nuly, nic hotového k němu není. Pořadí se proto obrací:
> - **E (weby a automatizace) je první**, protože jen ten může přinést peníze během týdnů.
> - **GDPR běží na pozadí** jako vlastní kampaň (pár hodin týdně). Lhůta na odpověď je stejně měsíc, takže se čeká tak jako tak, a mezitím vzniká materiál na produkt i obsah.
>
> Body níže platí dál, jen u GDPR s menší intenzitou.
>
> **Startovní kapitál:**
> - pod 2 000 Kč: ohlášení živnosti asi 1 000 Kč, doména asi 300 Kč/rok;
> - hosting na GitHub Pages je zdarma;
> - platební brána (Lemon Squeezy, Gumroad) si bere procento z prodeje, nic se neplatí předem;
> - Claude už platím.
>
> Později případně konzultace s advokátem kvůli GDPR fázi b. Zálohy na pojištění pro vedlejší OSVČ si ověřit (při zaměstnání se zdravotní minimum neplatí, sociální až nad zákonnou hranici ročního zisku).

### Týden 1: základy a vlastní kampaň
- [ ] **Stáhnout datové exporty** z Facebooku, Instagramu a Googlu (Takeout). Trvá to dny, proto hned. → `gdpr/exporty/`
- [ ] Databáze firem v1: hotové, viz `gdpr/firmy-v1.md`. Projít a ověřit kontakty.
- [ ] Spustit vlastní kampaň na prvních 30–50 firem. Každou žádost evidovat (datum odeslání, lhůta +1 měsíc, odpověď).
- [ ] Začít natáčet hned, ne až potom: obrazovka s odesíláním, „den 0“.
- [ ] Mrknout do pracovní smlouvy.

### Týden 2: produkt a landing page
- [ ] Šablony v češtině: čl. 15 (přístup), čl. 17 (výmaz), čl. 21 (námitka proti marketingu), urgence po lhůtě a stížnost na ÚOOÚ.
- [ ] Návod „jak najít firmy ve vlastních exportech“ (sekce „Advertisers“ a „Off-Facebook activity“ ve FB exportu, Gmail: hledání podle odesílatelů newsletterů).
- [ ] Landing page s formulářem pro čekací listinu a cenovým testem (např. 249 / 490 Kč). Hosting na GitHub Pages stejně jako aikidoricany.cz.
- [ ] E: krátká případová studie aikidoricany.cz (dřív a teď: rychlost, SEO, kolik se ušetří za Wix).

### Týden 3: spuštění DIY
- [ ] Ohlásit živnost (volná). Fakturace přes Fakturoid nebo iDoklad, prodej přes Lemon Squeezy, Gumroad nebo převodem.
- [ ] Spustit DIY balíček. Distribuce: Reddit r/czech, FB skupiny o soukromí a spotřebitelích, Twitter/X, kamarádi.
- [ ] Video 1: „Poslal jsem žádost 50 firmám, které o mně mají data“ (proč, jak, které firmy).
- [ ] E: oslovit 5–10 lokálních firem na Wixu (Říčany a okolí) s konkrétní nabídkou.

### Týden 4: první odpovědi a rozhodnutí
- [ ] Odpovědi z vlastní kampaně → video 2: „Co o mně věděly“ (a kdo ignoroval lhůtu).
- [ ] Vyhodnotit: kolik lidí je na čekací listině, kolik prodejů a za jakou cenu.
- [ ] Rozhodnout o fázi b. **Pozor:** soustavné zastupování za úplatu na plnou moc může být „právní služba“ podle zákona o advokacii (přestupek, pokuta až 3 mil. Kč). ČAK už postihla podobný model u insolvenčních přihlášek. Proto místo plné moci:
  - **Varianta b1, doporučená:** webový nástroj, kde si klient vybere firmy, vygeneruje žádosti a **odešle je sám ze svého mailu**. Nástroj pak hlídá lhůty a připraví urgence a stížnosti. Neřeší se plná moc ani cizí data u mě, a je to pasivnější.
  - Varianta b2: služba na plnou moc jen ve spolupráci s advokátem. Nejdřív konzultace.
- Vzory žádostí jsou volně dostupné (ÚOOÚ, advokátní weby). Prodejní hodnota je **seznam českých firem s ověřenými kontakty a postupy**, návod k exportům, hlídání lhůt a pomoc s eskalací.

### Na co si dát pozor
- Žádné AI persony ani „AI radí v právu“. Vlastní tvář nebo hlas a vlastní reálná data, jinak YouTube vypne monetizaci (pravidlo „inauthentic content“).
- Do fáze b neshromažďovat cizí osobní údaje.
- Nerozjíždět nic nového, dokud není venku DIY balíček.

---

## Škálovatelný produkt (12. 10., viz produkty-overeni.md)
- **GDPR jako byznys: zahodit.** Zdarma už existuje datarequests.org (open source, víc jazyků, generátor žádostí a databáze firem) i YourDigitalRights (sleduje odpovědi a eskaluje). Mine na spotřebitelích nevydělal, uživí ho až B2B.
- GDPR nechat jako misi: přispět do datarequests.org českými firmami a překladem. Pomůže to reputaci a portfoliu.
- **Kandidát: software pro bojová umění, kroužky a spolky** (rozvrh, docházka, pásky a zkoušky, rodičovské účty, členské příspěvky, QR platby, web s editorem). Pilotní klient je dojo. Konkurence jsou levné obecné systémy (Zenamu, Reenio), takže je potřeba se trefit do úzké mezery.

## Hodnoty vs. peníze (12. 10.)
- **GDPR jako open source zdarma**: šablony, seznam firem a návod veřejně na GitHubu, pro všechny.
- Peníze z GDPR jen dobrovolně: donate (GitHub Sponsors, Buy Me a Coffee), YouTube, granty a spolupráce s neziskovkami, volitelný „hlídač lhůt“ pro pohodlné. Bez paywallu.
- **Hlavní příjem jsou weby a automatizace pro firmy.** Firma platí za práci, kterou by jinak platila Wixu. Je to férový obchod, ne vykořisťování.
- Hodnoty i tady: spolkům a neziskovkám sleva, případně jeden web za čtvrtletí zdarma.

## Značky (rozhodnuto 12. 10.)
- Jeden byznys: jedna živnost a jedno IČO.
- **krystofskala.com** = weby a automatizace, osobní značka.
- **GDPR** = vlastní produktová značka a doména (např. smazmojedata.cz, ověřit dostupnost). Koupit až s hotovým DIY balíčkem.
- Oblast webů: celá ČR online, osobně Praha a Středočeský kraj.

## Otevřené otázky (rozpracováno)
- Hlubší ověření české konkurence, právní stránka plné moci a sazby za weby a automatizace: `gdpr/overeni-konkurence-a-pravo.md`
- Databáze firem: `gdpr/firmy-v1.md`
