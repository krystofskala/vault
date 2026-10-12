# Seznam firem pro žádosti GDPR (přístup / výmaz), verze 1

**Datum sestavení:** 12. 10. 2026
**Účel:** základní seznam správců, kteří pravděpodobně zpracovávají osobní údaje běžných obyvatel ČR (registry, databáze, adtech, panely, lead-gen). Slouží jako podklad pro český DIY balíček žádostí podle čl. 15 a 17 GDPR.

## Metoda

- Rešerše proběhla pouze přes webové vyhledávání. Přímé načítání stránek (WebFetch/curl) v tomto prostředí blokovala síťová politika, takže **žádnou stránku jsem neotevřel celou**. Kontakty pocházejí z úryvků výsledků vyhledávání, nejčastěji s omezením na doménu dané firmy.
- Sloupec **Stav ověření**:
  - **OV**: e-mail nebo formulář se objevil v úryvku z oficiální domény firmy (zásady ochrany osobních údajů apod.). Před ostrým použitím ho přesto zkontrolujte na živé stránce.
  - **3S**: zdroj je třetí strana (datarequests.org, kalifornský registr data brokerů, obchodní podmínky apod.).
  - **neověřeno**: kontakt jsem nenašel, nebo vychází jen z mé obecné znalosti. Uvedená URL je jen výchozí bod k dohledání.
- **Pokrytí Incogni**: veřejný seznam brokerů Incogni (blog.incogni.com/data-brokers-incogni-covers) se nepodařilo načíst, protože doména je blokovaná. Sloupec je proto **jen odhad** podle typu firmy (velcí globální brokeři ano, české firmy téměř jistě ne). Je třeba ho ručně ověřit.
- Nic nebylo odesláno a žádný formulář nebyl vyplněn.

## Hlavní upozornění

1. **Úřední registry dlužníků (SOLUS, BRKI/NRKI, CRIF, SBCB/NBCB)** zpracovávají údaje převážně na základě zákona (§ 20z zákona o ochraně spotřebitele, zákon o bankách) nebo oprávněného zájmu. Žádost o **výpis** (čl. 15) má smysl vždy. **Výmaz** (čl. 17) typicky projde jen u neaktuálních nebo chybných záznamů. V balíčku to tak formulujte, ať klient nečeká zázraky.
2. **Ověření totožnosti:** registry (SOLUS, Česká pošta, pravděpodobně i CBCB) běžně vyžadují **úředně ověřený podpis**, **datovou schránku** nebo osobní návštěvu a výpisy e-mailem neposílají. Adtech firmy naopak nemají jméno, ale **cookie ID nebo reklamní ID (MAID)**. Žádost jen se jménem a e-mailem u nich často skončí odpovědí „nemáme o vás údaje“. Balíček by měl vysvětlit, jak cookie ID nebo MAID zjistit (Android: Nastavení → Google → Reklamy; iOS: IDFA není uživateli přímo dostupné).
3. **Zpracovatel vs. správce:** u řady firem (Merk, STEM/MARK, Kantar, LiveRamp, Lotame) firma tvrdí, že je pouze zpracovatel a správcem je její klient. Žádost i tak pošlete, protože zpracovatel ji musí předat nebo sdělit, kdo je správcem.
4. **Úplnost:** nejslabším místem je **trh s pronájmem spotřebitelských adresních databází v ČR**. Konkrétní „list brokery“ pro fyzické osoby (ne firmy) se přes vyhledávání najít nepodařilo. Pravděpodobně jde o malé agentury, které se veřejně neprezentují. Viz sekce „Mezery“ na konci.
5. Některé zdroje jsou starší (Rixo PDF cca 6 let, některé stránky Nielsen Admosphere si odporují). Kontakty se mění a před vydáním balíčku je potřeba druhé kolo ověření přímo na webech.

## Tabulka

Legenda kategorií: **REG** úvěrový / dlužnický registr · **FIR** firemní a osobní rejstříky a databáze · **ADT** adtech / měření publika · **PAN** výzkum, panely · **LEAD** lead-gen / srovnávače · **DM** direct mail, věrnostní programy, retail data · **GLOB** globální broker nebo adtech

### A. Česko a Slovensko

| # | Firma | Země | Kat. | Proč má pravděpodobně data o Češích | Kontakt (e-mail / formulář) | Stav ověření | Ověření totožnosti / poznámky | Incogni (odhad) | Zdroj |
|---|---|---|---|---|---|---|---|---|---|
| 1 | SOLUS, zájmové sdružení právnických osob (IČ 69346925); zpracovatel Společnost pro informační databáze, a.s. | CZ | REG | Registr FO a Pozitivní registr: platební morálka klientů telco, energetik a nebankovních věřitelů | poverenec@solus.cz | OV | Výpis jen na písemnou žádost s **úředně ověřeným podpisem** (formulář FO/FOP na webu), výpisy neposílají e-mailem. Info linka 840 140 120. Adresa Antala Staška 510/38, Praha 4 | ne | https://www.solus.cz/en/zasady-ochrany-soukromi-solus/ ; formulář https://www.solus.cz/wp-content/uploads/2016/12/Formular_FO_a_FOP_20181008.pdf |
| 2 | CBCB – Czech Banking Credit Bureau, a.s. (BRKI) | CZ | REG | Bankovní registr klientských informací: úvěry od všech velkých bank | poverenec@cbcb.cz (pověřenec); primárně Klientské centrum | OV | Výpis přes Klientské centrum (provozuje CRIF), pravděpodobně s ověřeným podpisem nebo přes datovou schránku (neověřeno). Štětkova 1638/18, Praha 4 | ne | https://cbcb.cz/gdpr/ |
| 3 | LLCB, z.s.p.o. (NRKI, Nebankovní registr klientských informací) | CZ | REG | Úvěry od nebankovních věřitelů a leasingových společností | Klientské centrum: klient@crif.com, tel. 844 111 777 (podle úryvku zásad LLCB) | 3S/OV (úryvek nejasný) | Stejné Klientské centrum jako BRKI. Ověřit, zda NRKI nemá vlastního pověřence | ne | https://www.llcb.cz/ochrana-osobnich-udaju/ ; https://www.llcb.cz/kontakt-nrki/ |
| 4 | CRIF – Czech Credit Bureau, a.s. (CRIBIS.cz) | CZ | REG/FIR | Operátor klientského centra BRKI/NRKI; CRIBIS = databáze firem a podnikatelů (OSVČ = fyzické osoby) | poverenec@crif.com | OV | IČ 26212242, Štětkova 1638/18, Praha 4 | ne | https://www3.cribis.cz/personal-data-rights |
| 5 | Creditinfo CEE a.s. | CZ | FIR/REG | Firemní a úvěrové informace, OSVČ, vymáhání | neověřeno (datová schránka ddpwurt) | neověřeno | IČ 27600297. Kontakt dohledat na creditinfo.cz | ne | https://rejstrik-firem.kurzy.cz/27600297/creditinfo-cee-as/datove-schranky/ |
| 6 | SBCB – Slovak Banking Credit Bureau, s.r.o. | SK | REG | Slovenský bankovní registr; Češi s úvěrem v SK | dpo.sk@crif.com | OV | Mlynské Nivy 14, Bratislava | ne | https://www.sbcb.sk/sk/ochrana-osobnych-udajov |
| 7 | NBCB – Non Banking Credit Bureau, z.z.p.o. | SK | REG | Slovenský nebankovní registr | dpo@nbcb.sk | OV | | ne | https://www.nbcb.sk/sk/ochrana-osobnych-udajov |
| 8 | Dun & Bradstreet Czech Republic, a.s. (ex Bisnode; Albertina, MagnusWeb) | CZ | FIR | Databáze firem, statutárů a OSVČ; marketingové seznamy kontaktních osob | gdpr.cz@dnb.com ; pověřenec dpo.cz@dnb.com ; tel. +420 274 000 240 | OV | Má i formulář (SK verze: dnb.com/sk-sk/preco-dnb/privacy/form.html). Podle dokumentace poskytuje kopii uložených údajů | pravděpodobně ano (D&B globálně) | https://www.dnb.com/cs-cz/proc-dnb/privacy.html ; https://www.dnb.com/cs-cz/proc-dnb/privacy/osobni-udaje.html |
| 9 | Kurzy.cz, spol. s r.o. (rejstrik-firem.kurzy.cz) | CZ | FIR | Veřejně zobrazuje osoby z obchodního a živnostenského rejstříku (jméno, adresa, funkce, vazby) a indexuje se ve vyhledávačích | info@kurzy.cz | OV | IČ 26192454, Na poříčí 19, Praha 1. Pro identifikaci doporučují přidat adresu nebo datum narození a **odkaz na konkrétní stránku** | ne | https://eng.kurzy.cz/?cwOchranaUdaju.htm= |
| 10 | Imper CZ s.r.o. (Merk.cz) | CZ | FIR/DM | Prodává databáze firem i živnostníků včetně kontaktních osob („Databáze živnostníků“, datové balíčky) | info@imper.cz (z obchodních podmínek) | 3S | Tvrdí, že vůči zákazníkům je zpracovatel. Oddělený dokument „Informace o zpracování osobních údajů“ je na webu, nepodařilo se ho načíst | ne | https://www.merk.cz/media/documents/privacy_policy/Obchodni_podminky_Merk_7e3c2.pdf ; https://www.merk.cz/databaze-zivnostniku/ |
| 11 | FinStat s.r.o. (finstat.sk, i CZ verze) | SK | FIR | Rejstříková data o osobách a firmách | dpo@finstat.sk (pověřenec DataWitch); obecně podnety@finstat.sk | OV | | ne | https://finstat.sk/ochrana-osobnych-udajov/zodpovedna-osoba |
| 12 | Seznam.cz, a.s. (Firmy.cz, Sklik, Zboží.cz, Seznam reklamní ID) | CZ | ADT/FIR | Největší český adtech (Sklik, behaviorální cílení), profil přihlášených uživatelů, Firmy.cz | ochranaudaju@firma.seznam.cz ; pověřenec (Chronos Consulting) dpo@firma.seznam.cz | OV | Přihlášení uživatelé mají správu dat v účtu. Nepřihlášení potřebují ID ze cookie (sid) | ne | https://onas.seznam.cz/cz/ochrana-udaju ; https://napoveda.sklik.cz/en/processing-of-personal-data/ |
| 13 | Zlaté stránky s.r.o. (zlatestranky.cz) | CZ | FIR | Adresář firem včetně „kontaktních osob“ (jména, funkce, telefony) | neověřeno | neověřeno | Dohledat zásady na zlatestranky.cz | ne | https://www.zlatestranky.cz/ |
| 14 | Internet Info DG, a.s. (Podnikatel.cz – rejstřík) | CZ | FIR | Rejstřík OSVČ s adresami sídel podnikání (často bydliště) | neověřeno | neověřeno | Typicky vede na adresy bydliště OSVČ, vhodný kandidát na námitku podle čl. 21 | ne | https://www.podnikatel.cz/rejstrik/ |
| 15 | R2B2 a.s. | CZ | ADT | Česká SSP a reklamní síť, cookie ID napříč weby vydavatelů | partner@r2b2.cz (pověřence nejmenovali) | OV | Potřeba cookie ID | ne | https://r2b2.cz/zpracovani-osobnich-udaju |
| 16 | CPEx – Czech Publisher Exchange, z.s.p.o. | CZ | ADT | Konsorcium velkých vydavatelů (RTB, sdílený identifikátor a segmenty) | dpo@cpex.cz (stránka); lukas@cpex.cz pro námitky (PDF zásad) | OV | Potřeba cookie ID | ne | https://www.cpex.cz/pro-uzivatele/ochrana-soukromi/ ; https://www.cpex.cz/wp-content/uploads/CPEx_Za%CC%81sady-zpracova%CC%81ni%CC%81-osobni%CC%81ch-u%CC%81daju%CC%8A.pdf |
| 17 | Gemius SA (NetMonitor/SPIR, gemiusPrism, gemiusDirectEffect) | PL | ADT/PAN | Oficiální měření české internetové návštěvnosti (SPIR), panel i cookie na většině českých webů | privacy@gemius.com ; nástroj pro uplatnění práv privacypolicy.gemius.com | OV | Některá práva vyžadují platný e-mail. U cookie dat Gemius Privacy Tool | možná | https://privacypolicy.gemius.com/en/ ; https://gemius.com/privacy-policy/privacy-policy-for-the-use-of-gemius-products/ |
| 18 | Performax.cz s.r.o. | CZ | ADT | Česká reklamní síť (display a video) | neověřeno | neověřeno | | ne | https://www.performax.cz/obchodni-podminky-cs.pdf |
| 19 | Etarget SE | SK | ADT | Kontextová a behaviorální reklamní síť CZ/SK | neověřeno | neověřeno | | ne | https://www.etarget.sk/ |
| 20 | Heureka Group a.s. (Heureka.cz, Ověřeno zákazníky) | CZ | DM/ADT | Data o nákupech z dotazníků „Ověřeno zákazníky“ od e-shopů, cílení | gdpr@heureka.cz ; pověřenec dpo@heureka.cz | OV | | ne | https://www.heureka.cz/a/ochrana-osobnich-udaju-na-portalech-heureka-group-c-30247/ |
| 21 | Gen Digital / Avast Software s.r.o. | CZ | ADT (historicky) | Prodej dat o prohlížení přes Jumpshot; pokuta ÚOOÚ 351 mil. Kč (2024). Data milionů českých uživatelů | neověřeno (privacy formulář Gen Digital) | neověřeno | Vhodné hlavně pro žádost o přístup | ne | https://www.lupa.cz/n/uoou/ (zpráva o pokutě) |
| 22 | Nielsen Admosphere, a.s. | CZ | PAN/ADT | TV a internetový panel, měření sledovanosti, cookie měření na webech TV | optoutcz@nielsen.com (stránka „TV výzkum: GDPR“); OPTOUT@admosphere.cz (digitální měření) | OV (zdroje si částečně odporují) | Českobratrská 2778/1, Praha 3 | ne | https://www.nielsen-admosphere.cz/tv-vyzkum-gdpr ; https://www.admosphere.cz/prohlaseni-gdpr |
| 23 | MEDIAN, s.r.o. | CZ | PAN | Výzkumy, online panel, adMeter (měření rádií), Media projekt | osobniudaje@median.cz (zápis na webu: osobniudaje (at) median.cz) | OV | Pro členy panelu je samostatná adresa (dohledat) | ne | https://www.median.eu/cs/?page_id=1616 |
| 24 | STEM/MARK, a.s. | CZ | PAN | Telefonní a online průzkumy, panel, augmentace CRM databází | gdpr@stemmark.cz ; osobniudaje@stemmark.cz | OV | U projektů obvykle zpracovatel, správcem je zadavatel | ne | https://stemmark.cz/osobniudaje ; https://stemmark.cz/kontakt |
| 25 | Kantar CZ s.r.o. | CZ | PAN | Telefonní (CATI) a panelové výzkumy | cz.gdpr@kantar.com | OV | Kontaktní údaje z panelu drží 12 měsíců | ne | https://cz.kantar.com/volali/ ; https://cz.kantar.com/gdpr/en/ |
| 26 | IPSOS s.r.o. (IČ 26738902) | CZ | PAN | Výzkumy, panel, CATI | neověřeno (úryvek oříznutý) | neověřeno | | ne | https://www.ipsos.com/cs-cz/node/407211 |
| 27 | Český národní panel (Median, STEM/MARK, Nielsen Admosphere) | CZ | PAN | Společný online panel respondentů | neověřeno | neověřeno | Ověřit provozovatele a kontakt | ne | (dohledat narodnipanel.cz) |
| 28 | Ppm factum research s.r.o. | CZ | PAN | Telefonní a online výzkumy | neověřeno | neověřeno | | ne | (dohledat ppmfactum.cz) |
| 29 | NMS Market Research s.r.o. | CZ | PAN | Online panel („Názor.cz“?) | neověřeno | neověřeno | | ne | (dohledat nms.cz) |
| 30 | Behavio Labs s.r.o. | CZ | PAN | Mobilní/online panel | neověřeno | neověřeno | | ne | (dohledat behavio.cz) |
| 31 | Ušetřeno.cz s.r.o. | CZ | LEAD | Srovnávač energií a financí, předává kontakty (leady) partnerům, telemarketing | osobni-udaje@usetreno.cz ; pověřenec dataprotectionofficer@usetreno.cz ; tel. +420 226 289 029 | OV | | ne | https://www.usetreno.cz/zasady/ |
| 32 | Klik.cz / Srovnejto.cz | CZ | LEAD | Srovnávač pojištění a energií, soutěže o ceny (sběr souhlasů) | pověřenec Mgr. Bohdan Šulák: bohdan.sulak@srovnejto.cz | OV | | ne | https://leg.srovnejto.cz/poverenec-pro-ochranu-osobnich-udaju/ |
| 33 | ePojisteni.cz | CZ | LEAD | Srovnávač pojištění, předávání kontaktů pojišťovnám | legal@epojisteni.cz (pověřenec Mgr. Bohdan Šulák); odvolání souhlasu 800 44 44 33 | OV | | ne | https://www.epojisteni.cz/poverenec-pro-ochranu-osobnich-udaju/ |
| 34 | RIXO.cz (Rixo s.r.o.?) | CZ | LEAD | Srovnávač pojištění a hypoték | dpo@rixo.cz ; info@rixo.cz ; DS z9gsfu3 | OV (PDF cca 6 let staré) | Telefon na pověřence se ve zdrojích liší | ne | https://www.rixo.cz/zasady-ochrany-osobnich-udaju/ |
| 35 | Česká pošta, s.p. | CZ | DM | Adresné a neadresné direct mailové služby, adresní data, Zákaznická karta | gdpr@cpost.cz ; DS kr7cdry | OV | E-mailem jen s **uznávaným (ověřeným) podpisem**, jinak datová schránka. Formulář žádosti na webu | ne | https://www.ceskaposta.cz/en/o-spolecnosti/ochrana-osobnich-udaju-gdpr/prava-zakaznika-a-formular-pro-podani-zadosti |
| 36 | Sphere card (EFIN spol. s r.o.?) | CZ/SK | DM | Největší koaliční věrnostní program CZ/SK, nákupní data od partnerů | neověřeno | neověřeno | Provozovatele ověřit (App Store uvádí EFIN spol. s r.o.) | ne | https://apps.apple.com/cz/app/sphere/id1580538736?l=cs |
| 37 | Avis Marketing | CZ | DM | Inzeruje „vedení, prodej a pronájem databází adres“ a direct mailing | neověřeno | neověřeno | Typický malý list broker. Nejdřív žádost o přístup a zdroj údajů (čl. 15 odst. 1 písm. g) | ne | https://www.zivefirmy.cz/avis-marketing_f288579?cz=775 |

### B. EU a globální adtech / data brokeři (zkráceně)

| # | Firma | Země | Kat. | Proč relevantní pro ČR | Kontakt | Stav ověření | Ověření totožnosti / poznámky | Incogni (odhad) | Zdroj |
|---|---|---|---|---|---|---|---|---|---|
| 38 | Acxiom (Deutschland GmbH / Ltd.) | DE/UK | GLOB | Marketingová data a segmenty v EU; v ČR méně | datenschutz@acxiom.com (DE); dataprotection@acxiom.com (UK) | 3S | Privacy International má vzorový dopis | ano | https://www.datarequests.org/company/acxiom/ |
| 39 | Experian | UK/IE | GLOB | Marketingová a úvěrová data, EU operace | uk.dpo@experian.com ; DSAR portál | OV (pro UK) | V ČR Experian přímo registr nevede, relevance je nižší | ano | https://www.experian.co.uk/consumer/dsar/privacy.html |
| 40 | Tapad (Experian) | US | GLOB | Cross-device graf; **podle vlastního oznámení už v EU/UK nepůsobí** | privacy@tapad.com ; Consumer Rights Request Portal | OV | Nízká priorita | ano | https://www.tapad.com/global-privacy-notice |
| 41 | Equifax | US/UK/ES | GLOB | V ČR nepůsobí, zařazeno jen pro úplnost | neověřeno | neověřeno | Nízká priorita | ano | – |
| 42 | LiveRamp | US/UK | GLOB | Identity graph (RampID), EU klienti | DPO přes formulář na liveramp.uk/privacy (e-mail v úryvcích chyběl) | neověřeno | Často tvrdí, že je zpracovatel | ano | https://liveramp.uk/privacy/your-rights/ |
| 43 | Criteo S.A. | FR | GLOB | Retargeting na většině českých e-shopů | dpo@criteo.com ; Attn: Data Protection, 32 Rue Blanche, 75009 Paris | 3S | Potřeba cookie ID (Criteo má vlastní nástroj na stránce soukromí) | ano | https://datarequests.org/company/criteo |
| 44 | The Trade Desk (UID2 / EUID) | US | GLOB | Největší nezávislý DSP; EUID je e-mailový identifikátor pro EU | Opt-out přes adsrvr.org a EUID/UID2 portál; e-mail neověřen | neověřeno | | možná | https://www.thetradedesk.com/legal/privacy |
| 45 | Microsoft (Xandr / Microsoft Invest, Microsoft Advertising) | US/IE | GLOB | Xandr SSP a DSP s velkým dosahem v ČR | Microsoft privacy formulář (aka.ms/privacyresponse), neověřeno | neověřeno | | ne (velké platformy obvykle ne) | – |
| 46 | Google (Ireland) Ltd. | IE | GLOB | Ads, Analytics, DoubleClick | data-access-requests@google.com ; dpo-google@google.com ; Takeout | 3S | Pro přihlášené Takeout a Moje aktivita | ne | https://www.datarequests.org/company/google/ |
| 47 | Meta Platforms Ireland Ltd. | IE | GLOB | Facebook/Instagram, pixel na českých webech, Custom Audiences nahrávané firmami | webový formulář v Centru nápovědy (neověřeno) | neověřeno | Užitečné „Přehled o reklamách / kdo nahrál váš kontakt“ | ne | – |
| 48 | Quantcast International Ltd. | IE | GLOB | Měření a CMP na evropských webech | privacy.qil@quantcast.com ; formulář quantcast.com/privacy/data-subject-rights/ | 3S | | ano | https://www.datarequests.org/company/quantcast/ |
| 49 | Lotame (Publicis / Epsilon) | US | GLOB | DMP, data marketplace | formulář legal.epsilon.com/dsr (podle třetí strany) ; Privacy Center | 3S | Mazání jen behaviorálního profilu | ano | https://www.lotame.com/privacy |
| 50 | Eyeota (Dun & Bradstreet) | SG/DE | GLOB | Audience data marketplace, silný v EU | privacy@eyeota.com ; formulář eyeota.com/subject-access-request | OV/3S | Opt-out cookie i hash e-mailu | ano | https://www.datarequests.org/company/eyeota/ ; https://www.eyeota.com/how-to-opt-out |
| 51 | adsquare GmbH | DE | GLOB | Lokační data z mobilních aplikací | privacy@adsquare.com ; Saarbrücker Str. 36, Berlin | OV | Vyžaduje **MAID + e-mail**, nic dalšího neposílat | ano | https://adsquare.com/privacy |
| 52 | zeotap GmbH | DE | GLOB | Telco-based identity a segmenty v EU | privacy@zeotap.com ; opt-out privacy.zeotap.com/optout | OV (CA registr) | Ad ID přes aplikaci „Data Protection Rights“ | ano | https://oag.ca.gov/node/186755 |
| 53 | LiveIntent, Inc. | US | GLOB | Identita z e-mailových newsletterů (hash e-mailu) | privacy@liveintent.com | 3S | | ano | https://www.datarequests.org/company/liveintent/ |
| 54 | Adform A/S | DK | GLOB/ADT | Silná přítomnost v ČR (DSP/SSP pro české vydavatele a agentury) | dpo@adform.com | OV | Vyžaduje **kopii dokladu totožnosti** a pro cookie ID podepsaný „DSAR Identity Verification Form“ | možná | https://site.adform.com/privacy-center/corporate-privacy/data-subject-rights/ |
| 55 | Oracle Advertising (BlueKai / Datalogix) | US | GLOB | **Ukončeno 30. 9. 2024**, zařazeno jen jako historická poznámka; žádost má smysl nanejvýš kvůli potvrzení výmazu | neověřeno | neověřeno | Nízká priorita | (dříve ano) | – |

## Souhrn počtů

| Kategorie | Počet |
|---|---|
| Úvěrové / dlužnické registry CZ+SK (1–7) | 7 |
| Firemní a osobní rejstříky a databáze (8–14) | 7 |
| Český / regionální adtech a měření (12, 15–21; Seznam započten zde) | 7 (+ Seznam) |
| Výzkum a panely (22–30) | 9 |
| Lead-gen / srovnávače (31–34) | 4 |
| Direct mail, věrnostní programy (35–37; Heureka u adtech) | 3 |
| Globální / EU (38–55) | 18 |
| **Celkem** | **55** |

Stav ověření: zhruba 32 položek má kontakt alespoň z úryvku oficiálního webu (OV), 9 z třetích stran (3S) a asi 14 je neověřených.

## Mezery a další kroky

- **Spotřebitelští list brokeři v ČR**: konkrétní firmy, které pronajímají adresy nebo telefony domácností (pro telemarketing energií apod.), se přes vyhledávání najít nepodařilo. Doporučení: projít rozhodnutí a výroční zprávy ÚOOÚ (uoou.gov.cz), rozhodnutí ČTÚ k nevyžádaným hovorům, členy asociací (ČMS – Česká marketingová společnost, SIMAR, APEK) a inzeráty typu „prodej databáze kontaktů“.
- **Médea, Inizio, mediální agentury** jsem nezařadil, protože pravděpodobně drží hlavně agregovaná data. Stojí za ověření, zda nevedou vlastní DMP.
- **Telemarketing / call centra** (Teleperformance CZ, Comdata apod.) jsou typicky zpracovatelé. Užitečnější je ptát se správců (energetiky, operátoři) na zdroj údajů.
- **Věrnostní programy retailu** (Kaufland Card, Lidl Plus, Albert, Tesco Clubcard, dm) jsou first-party správci. Patří spíš do rozšířeného balíčku.
- **Vymáhací agentury a soukromé registry dlužníků** (např. registr-dluzniku.cz) zatím chybí.
- Před vydáním: **ručně otevřít každou zdrojovou URL** a ověřit kontakt, doplnit IČO, adresu, datovou schránku a ověřit pokrytí Incogni / DeleteMe / Optery proti jejich aktuálním veřejným seznamům.
