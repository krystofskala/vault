# Ověření: konkurence, právo, pracovní smlouva, sazby

*Rešerše 12. 10. 2026. Zdroje jsou jen výsledky webového vyhledávání: přímé stahování stránek (cak.cz, zakonyprolidi.cz, edpb.europa.eu, incogni.com) v tomto prostředí blokoval proxy. Citace zákonů jsou proto převzaté z úryvků a sekundárních zdrojů. Před rozhodnutím je ověř v e-Sbírce. Značení: **[ověřeno]** = potvrzeno zdrojem, **[neověřeno]** = odhad, úvaha nebo údaj z jediného komerčního zdroje.*

---

## 1. Konkurence v CZ/SK

### Závěr
- **Českou ani slovenskou placenou službu**, která by spotřebitelům posílala GDPR žádosti (výmaz nebo přístup) u data brokerů a firem, jsem **nenašel**. Na SK vyhledávání vrací jen návody a Incogni. **[ověřeno jen negativně: nenalezeno ≠ neexistuje]**
- **Hlavní reálná konkurence je Incogni (Surfshark).** Podle oficiální podpory je dostupný rezidentům celé EU **včetně Česka** a Slovenska. Uvádí, že rozsah výmazu se může lišit podle země. **[ověřeno: support.incogni.com, přes výsledek vyhledávání]**
  - Česky se propaguje: článek na Mobilizujeme.cz (komerční, affiliate) uvádí cenu od **7,29 €/měsíc** a „více než 270 společností“. **[ověřeno, komerční zdroj]**
  - **Zda má Incogni česky lokalizovaný web nebo ceny v Kč, jsem nepotvrdil.** **[neověřeno]**
  - **Zda Incogni seznam brokerů obsahuje české firmy, jsem nepotvrdil.** Veřejná tabulka na blog.incogni.com/data-brokers-incogni-covers/ má sloupec US/CA/EU, ale její obsah jsem nemohl stáhnout. Doporučení: otevřít ji ručně a hledat domény .cz. **[neověřeno]**
- **dTest** (český spotřebitelský test) testoval Optery, DeleteMe, EasyOptOuts, Kanary a další. Za 4 měsíce byla v průměru odstraněna jen **35 %** údajů (nejlépe Optery 68 %, EasyOptOuts 65 %). Ruční odhlášení bylo úspěšnější, ale i u něj nevyšlo asi 30 % údajů. Pro positioning to znamená, že čeští spotřebitelé o těchto službách už slyšeli, jde ale převážně o US služby a US brokery. **[ověřeno]**
- **Optery, DeleteMe a podobné** jsou zaměřené na USA. Optery v nejvyšším tarifu nabízí „custom removals“ i u nepodporovaných brokerů. **[ověřeno, obecně]**
- **Mine/Saymine** (Izrael) skenovala inbox a posílala žádosti. Dnes se přeorientovala na B2B (MineOS). Podle recenze na Trustpilotu jsou data přenášena do Izraele. **[částečně ověřeno, data o aktuálním B2C produktu chybí]**
- **Bezplatné generátory:** datarequests.org (DE, open-source, generuje žádosti lokálně v prohlížeči; Czech jsem nepotvrdil), Rightso (Timelex, BE), paperweight (open-source, generuje e-mail v jazyce uživatele, Reddit 2026, neověřeno). YourDigitalRights.org, noyb tools, Rightly a Redact vyhledávání nezachytilo. Jejich stav a češtinu je třeba **[neověřeno]** ověřit ručně.
- **Vzory žádostí česky zdarma** jsou běžné: TOP.CZ, dostupnyadvokat.cz (advokát), slovenské ddadsstornala.sk, ÚOOÚ. **Samotný vzor tedy nemá velkou prodejní hodnotu.** Hodnotu může mít **seznam českých firem a brokerů s kontakty a postupy**, sledování odpovědí a eskalace na ÚOOÚ.
- **Iuridicum Remedium:** vyhledávání nenašlo žádný jejich aktuální nástroj ani generátor GDPR žádostí. **[neověřeno, zkontrolovat iure.org ručně]**

### Implikace
DIY balíček (a) konkuruje hlavně **bezplatným vzorům** a **Incogni** (cca 7–16 USD/EUR měsíčně). Diferenciace musí stát na tom, co Incogni pravděpodobně nemá: české firmy (např. marketingové databáze, věrnostní programy, telemarketing, realitní a úvěrové registry), český jazyk a podpora při eskalaci.

---

## 2. Právní otázky

### 2.1 Zastoupení na plnou moc (OZ § 441 a násl.)
- § 441 odst. 2 OZ: rozsah oprávnění se uvádí v plné moci. **Netýká-li se zastoupení jen určitého právního jednání, plná moc se uděluje písemně.** Pro služba „podáme za vás žádosti u desítek firem“ tedy **písemná plná moc**. Úředně ověřený podpis zákon obecně nevyžaduje, pokud ho nevyžaduje forma samotného jednání. GDPR formu žádosti nepředepisuje. **[ověřeno: text § 441 přes podnikatel.cz / pravniprostor.cz]**
- **GDPR samo zastoupení nevylučuje.** Podle EDPB Guidelines 01/2022 (v2.0/2.1), oddíl „Requests made via third parties / proxies“ (bod cca 80–90), může subjekt uplatnit právo na přístup přes třetí osobu. Správce si ale smí ověřit, že je zástupce **řádně zmocněn**. Pokud zástupce nabízí vlastní portál, správce ho nemusí použít a může data poslat přímo subjektu. **[ověřeno přes sekundární shrnutí (Freshfields, White & Case); přesná čísla bodů neověřena]**
- **Čl. 12 odst. 6 GDPR:** správce smí žádat dodatečné informace k ověření totožnosti **jen při oprávněných pochybnostech** a přiměřeně. EDPB: žádost nemá předepsanou formu. Kopie OP nemá být standardem. **[ověřeno: ÚOOÚ poradna, EDPB]**
- **Praxe českých správců je přísnější než GDPR.** Řada (hlavně veřejných) správců požaduje **plnou moc s úředně ověřeným podpisem**, uznávaný elektronický podpis nebo datovou schránku. Příklady: MUNI, SZPI, MŽP. Soukromé subjekty to mají ve vzorech také (Europ Assistance). **To je hlavní praktická překážka služby (b):** část firem si vyžádá ověřený podpis (Czech POINT, cca 50–60 Kč za podpis, **[částka neověřena]**) a odpovědi pošle přímo klientovi. **[ověřeno]**
- Čl. 12 odst. 4 GDPR: odmítnutí se sděluje subjektu nebo zástupci, s poučením o stížnosti u ÚOOÚ.

### 2.2 Je to „právní služba“? (zákon o advokacii) — **největší riziko**
- § 1 odst. 2 ZoA (dle úryvků): právní službou je **zastupování v řízení před soudy a jinými orgány, obhajoba, udělování právních porad, sepisování listin, zpracování právních rozborů a další právní pomoc, jsou-li vykonávány soustavně a za úplatu.** **[ověřeno přes úryvky z ČAK/epravo]**
- § 2: právní služby smí poskytovat advokáti a osoby, které k tomu opravňuje zvláštní zákon (notáři, daňoví poradci, patentoví zástupci, exekutoři…) nebo zaměstnanci pro svého zaměstnavatele. **Výjimka pro „GDPR agenty“ neexistuje.** **[ověřeno, obecně]**
- **Přestupek § 52d ZoA:** neoprávněné poskytování právních služeb (**pokuta až 3 000 000 Kč**). Od 1. 2. 2022 je postižitelné i **nabízení**. Novela **73/2025 Sb.** (účinná od 1. 4. 2025) rozšiřuje zákaz i na **obstarání a zprostředkování**. **[ověřeno: epravo.cz, pravniprostor.cz; přesné znění § 52d po novele 73/2025 neověřeno]**
- **Analogický precedens ČAK:** podnikatel (nikoli advokát) **na základě plné moci podával za úplatu za více osob přihlášky pohledávek do insolvenčního řízení**. ČAK to posoudila jako neoprávněné poskytování právních služeb. Jinde ČAK dosáhla pokuty 72 000 Kč. **[ověřeno: cak.cz/neopravnene-poskytovani-pravnich-sluzeb]**
- **Úvaha [neověřeno, žádný komentář přímo ke GDPR žádostem jsem nenašel]:**
  - **(a) DIY balíček** (obecné vzory + návod + seznam firem, které si zákazník sám vyplní a odešle) je **nízké riziko**. Prodej obecných formulářů a příruček se v ČR běžně děje i mimo advokacii a nejde o službu „pro konkrétního klienta“. Nedávat individuální právní posouzení (např. „máte nárok na výmaz u firmy X, protože…“).
  - **(b) „Podáme za vás“ na plnou moc, soustavně a za úplatu** je **reálné riziko**. Podání žádosti u správce je sepis listiny a právní jednání za klienta. Případná stížnost k ÚOOÚ je **zastupování před jiným orgánem**, což je jádro definice. Insolvenční precedens je velmi blízký („podání za úplatu na plnou moc za více osob“).
  - **Možné zmírnění (k ověření s advokátem):** (i) provozovat (b) **ve spolupráci s advokátem** (advokát je zástupce, firma dodává technologii a administraci); (ii) model, kdy **klient podává sám**, např. předvyplněné žádosti odesílané z jeho e-mailu nebo datové schránky jedním klikem, a služba je jen software a tracking; (iii) neposkytovat stížnosti k ÚOOÚ jako službu. Incogni sice v EU funguje jako „authorised agent“, to ale nic neříká o české regulaci advokacie (nikdo ji zjevně netestoval).
  - **Doporučení:** před spuštěním (b) si zaplatit 1 hodinu konzultace u advokáta (cca 2–4 tis. Kč, **[neověřeno]**) nebo se dotázat ČAK.

### 2.3 Správce, nebo zpracovatel?
- Vůči **klientům** je provozovatel služby **správcem** jejich osobních údajů. Sám určuje účel a prostředky (plnění smlouvy, čl. 6 odst. 1 písm. b). Nejedná podle pokynů jiného správce, takže **nejde o zpracovatele** a smlouva podle čl. 28 se neuzavírá s klientem. **[úvaha podle obecných kritérií zpracovatel/správce; žádný zdroj konkrétně k removal službám nenalezen]**
- Povinnosti správce:
  - **informační povinnost** (čl. 13, privacy policy);
  - **záznamy o činnostech zpracování** (čl. 30). Výjimka pro <250 zaměstnanců **neplatí**, protože zpracování není příležitostné (a mohou se objevit i citlivé údaje);
  - **zabezpečení** (čl. 32): šifrování, řízení přístupu, MFA, minimalizace (neuchovávat kopie OP);
  - **doba uložení** (Incogni např. uvádí max. 12 měsíců po zrušení);
  - **smlouvy o zpracování (čl. 28)** se **svými** zpracovateli: e-mail hosting, CRM, platební brána, AI nástroje. U služeb mimo EU řešit předávání (SCC/DPF);
  - hlášení incidentů (čl. 33/34).
  - DPIA je spíš nepovinná, ale u rozsáhlé služby s doklady totožnosti je vhodná **[neověřeno]**.
- Odpovědi od firem (výpisy dat podle čl. 15) jsou citlivý obsah, takže je minimalizovat a předávat klientovi přímo.

### 2.4 Živnost
- **Volná živnost „Výroba, obchod a služby neuvedené v přílohách 1 až 3 ŽZ“**, obory podle přílohy 4 NV 278/2008 Sb.:
  - **č. 56** Poskytování software, poradenství v oblasti IT, zpracování dat, hostingové a související činnosti a webové portály (digitální produkt, web, nástroj);
  - **č. 60** Poradenská a konzultační činnost, zpracování odborných studií a posudků (obsahová náplň ale **nezahrnuje činnosti vyhrazené zvláštním zákonům**, tedy ani právní služby, **[neověřeno přesné znění]**);
  - **č. 70** Služby v oblasti administrativní správy a služby organizačně hospodářské povahy (administrativa pro klienty);
  - vydavatelské činnosti (e-book/příručka); číslo oboru jsem neověřil;
  - maloobchod (prodej přes e-shop) **[číslo oboru neověřeno]**.
- **Živnostenské oprávnění neopravňuje k poskytování právních služeb.** Riziko v bodě 2.2 živnost neřeší.

---

## 3. Pracovní smlouva (game dev) — krátce
- **§ 304 ZP:** zaměstnanec smí vedle zaměstnání vykonávat výdělečnou činnost **shodnou s předmětem činnosti zaměstnavatele** jen s **předchozím písemným souhlasem**. Rozhoduje **předmět činnosti zaměstnavatele**, ne pracovní náplň zaměstnance (NS 21 Cdo 1132/2014), a stačí shoda v části aktivit. Souhlas lze písemně s odůvodněním odvolat. Pak je nutné činnost bez zbytečného odkladu ukončit. **[ověřeno]**
- **GDPR služba vs. herní studio:** shoda předmětu činnosti je **nepravděpodobná**, takže souhlas podle § 304 obvykle není nutný. **Pozor:**
  - (i) **weby a automatizace pro firmy (bod 4)** se mohou překrývat, pokud má studio v předmětu podnikání obecně „software/IT“ (obor 56). **Zkontrolovat výpis z ObchRejstříku/ŽR zaměstnavatele**;
  - (ii) pracovní smlouva nebo vnitřní předpis může mít vlastní ujednání (oznamovací povinnost, IP klauzule). Zákonný zákaz nad rámec § 304 sjednat nelze, ale oznámení je zdvořilé a bezpečné;
  - (iii) nepoužívat pracovní čas, HW ani know-how zaměstnavatele;
  - (iv) konkurenční doložka (§ 310) platí až po skončení pracovního poměru.

---

## 4. Tržní sazby v CZ (weby, automatizace)

| Položka | Realistický rozsah | Poznámka / zdroj |
|---|---|---|
| Hodinová sazba freelancera, nejčastější pásmo (všechny obory) | **600–999 Kč/h** (27 %), dále 1 000–1 999 Kč/h (23 %) | Navolnenoze průzkum 2024 **[ověřeno]** |
| Freelance web/IT vývoj | **800–1 800 Kč/h**, senior 2 500+ | SHEAN (Brno, 2025), banky.cz 1 000–2 500 **[komerční zdroje]** |
| Agentura, hodinová sazba | 1 500–2 800 Kč/h | SHEAN **[komerční]** |
| Jednostránkový / jednoduchý prezentační web (freelancer) | **5 000–20 000 Kč** | matejboska.cz, zjanacova.cz, snaz.cz **[blogy tvůrců]** |
| Vícestránkový web s CMS (freelancer) | **15 000–50 000 Kč** | tamtéž |
| Agentura, prezentační web | **30 000–120 000 Kč** | justdigital.cz a další |
| Wix/Webnode „udělej si sám“ | 1 500–5 000 Kč/rok + doména | snaz.cz |
| **Migrace Wix → statický web** | **[neověřeno]** odhad 5 000–20 000 Kč podle počtu stránek | Žádný český ceník specificky pro migraci jsem nenašel. Odvozeno od cen jednoduchého webu. Argument pro klienta: úspora předplatného Wixu (cca 3–8 tis. Kč/rok) |
| Jednoduchá n8n/Make automatizace (1 proces) | **10 000–30 000 Kč** jednorázově | haxo.cz/comakers.cz: „Quick N8N“ od 9 990 Kč, jiný dodavatel od 15 000 Kč, 30 000 Kč za jednoúčelový workflow **[komerční]** |
| Komplexnější AI automatizace (OCR, chatbot) | od **50 000 Kč**, sady workflow až 150 000+ Kč | tamtéž |
| Freelance automatizátor, hodinová sazba | cca **1 000–2 000 Kč/h** | pavelszabo.cz uvádí 2 000 Kč/h **[jeden zdroj]** |
| Měsíční správa/provoz automatizací | 3 000–25 000 Kč/měsíc | jeden komerční zdroj |
| Upwork (globální) n8n/Make | 5–20 USD/h (low-end inzeráty) | Upwork inzeráty. Tlak na cenu od globální konkurence |

**Realistický start pro nového freelancera bez portfolia:** 600–1 000 Kč/h, weby 8–20 tis. Kč, jednoduchá automatizace 8–20 tis. Kč. Sazby agentur jsou horní hranice, ne startovní cena. Ceny z blogů dodavatelů jsou marketing a skutečně účtované ceny bývají nižší. **[úvaha]**

Konkrétní poptávky na Navolnenoze, Jobs.cz nebo freelance.cz jsem procházet nemohl, protože stránky nešlo stáhnout. **[neověřeno]**

---

## Co je potřeba ověřit ručně (TODO)
1. blog.incogni.com/data-brokers-incogni-covers/: filtrovat EU/.cz, zda obsahuje české firmy. Incogni.com v češtině a ceny v Kč?
2. Aktuální znění § 1, § 2 a § 52d ZoA po novele 73/2025 Sb. (e-Sbírka). Ideálně dotaz na ČAK nebo konzultace s advokátem k modelu (b).
3. EDPB 01/2022 v2.1, přesná čísla bodů k „third parties/proxies“ (česká verze PDF na edpb.europa.eu).
4. Iuridicum Remedium (iure.org), YourDigitalRights.org, datarequests.org: podpora češtiny a seznam CZ firem.
5. Předmět podnikání zaměstnavatele v OR/ŽR, kvůli § 304 ZP u webů a automatizací.
6. Obsahová náplň oboru 60 a čísla oborů pro vydavatelství a maloobchod (NV 278/2008 Sb., příloha 4).

---

## Zdroje
- Incogni, dostupnost podle zemí: https://support.incogni.com/hc/en-us/articles/5285682832402-In-which-countries-is-Incogni-available
- Incogni, seznam brokerů: https://blog.incogni.com/data-brokers-incogni-covers/
- Incogni, about: https://incogni.com/about-us
- Mobilizujeme.cz, Incogni v češtině: https://mobilizujeme.cz/clanky/smazte-osobni-data-z-internetu-poradime-jak-to-udelat-jako-lusknutim-prstu
- dTest, test služeb k vymazání dat: https://www.dtest.cz/clanek-11080/sluzby-k-vymazani-osobnich-dat-z-internetu-nejsou-stoprocentni
- Security.org, recenze Incogni: https://www.security.org/data-removal/incogni/
- Webhostingcentrum.sk: https://www.webhostingcentrum.sk/ako-odstranit-osobne-udaje-z-internetu/
- TechCrunch, Mine: https://techcrunch.com/2020/10/21/mine-series-a/
- Trustpilot saymine: https://uk.trustpilot.com/review/saymine.com
- Optery help (custom removals): https://help.optery.com/en/article/ultimate-plan-offers-best-effort-removals-for-unsupported-data-brokers-through-custom-removals-requests-lchi5e
- Timelex Rightso: https://timelex.eu/en/blog/timelex-launches-rightso-free-tool-facilitating-gdpr-requests
- datarequests.org: https://www.datarequests.org/contribute/
- TOP.CZ, vzor žádosti o výmaz: https://www.top.cz/gdpr-vzor-zadosti-o-vymaz-osobnich-udaju
- Dostupný advokát, vzor: https://dostupnyadvokat.cz/stazeni/vzor-zadosti-o-vymaz-osobnich-udaju
- EDPB Guidelines 01/2022 v2 (EN): https://www.edpb.europa.eu/system/files/2023-04/edpb_guidelines_202201_data_subject_rights_access_v2_en.pdf
- EDPB Guidelines 01/2022 v2 (CS): https://www.edpb.europa.eu/system/files/2024-04/edpb_guidelines_202201_data_subject_rights_access_v2_cs.pdf
- Freshfields k EDPB a zástupcům: https://www.freshfields.com/en/our-thinking/blogs/technology-quotient/the-edpb-further-shapes-requirements-for-data-subject-access-requests-102hhua
- ÚOOÚ, práva subjektu údajů: https://uoou.gov.cz/poradna/poradna-gdpr/prava-subjektu-udaju
- MUNI, uplatnění práv: https://www.muni.cz/o-univerzite/uredni-deska/uplatneni-prav-subjektu-udaju
- SZPI, postup: https://www.szpi.gov.cz/clanek/postup-pri-vykonu-prav-subjektu-udaju-dle-cl-15-az-22-gdpr.aspx
- Europ Assistance, vzor žádosti: https://www.europ-assistance.cz/stahnout-soubor/108-20211103-yqgr-standardizovany-vzor-zadosti-subjektu-udaju-o-pristup-k-osobnim-udaju.pdf
- OZ, smluvní zastoupení (§ 441): https://www.podnikatel.cz/zakony/novy-obcansky-zakonik/f4580323/
- Forma plné moci: https://pravniprostor.cz/clanky/obcanske-pravo/forma-plne-moci-po-novele-obcanskeho-zakoniku
- ČAK, neoprávněné poskytování právních služeb: https://www.cak.cz/neopravnene-poskytovani-pravnich-sluzeb
- Zákon o advokacii (konsolidace ČAK): https://www.cak.cz/cs/download/Zakon%20o%20advokacii%20-%20zn%C4%9Bn%C3%AD%20od%201.4.2025;%201.7.2025%20a%201.1.2026.pdf
- epravo, vinklaření § 52d: https://www.epravo.cz/top/clanky/efektivnejsi-postih-vinklareni-neopravneneho-poskytovani-pravnich-sluzeb-odstrani-nekale-praktiky-realitnich-kancelari-106520.html
- Advokátní deník, novela 73/2025 Sb.: https://advokatnidenik.cz/2025/03/21/co-vsechno-prinasi-velka-novela-zakona-o-advokacii-c-73-2025-sb/
- Advokátní deník, přestupkové řízení: https://advokatnidenik.cz/2025/02/21/neopravnene-poskytovani-pravnich-sluzeb-v-prestupkovem-rizeni/
- Dr. Bacon, § 52d: https://www.drbacon.cz/blog/realitni-makler-vs-advokat-pravni-sluzba-52d
- Pravniprostor, novela ZoA: https://pravniprostor.cz/zmeny-v-legislative/vyslo-ve-sbirce-zakonu/novela-zakona-o-advokacii2
- BusinessInfo, příloha 4 ŽZ: https://www.businessinfo.cz/formulare/priloha-4-zakon-o-zivnostenskem/
- BusinessInfo, obsahová náplň (IT): https://www.businessinfo.cz/navody/nektere-cinnosti-v-oblasti-informacnich-technologii/
- BusinessInfo, obsahová náplň volné živnosti: https://www.businessinfo.cz/navody/obsahova-napln-zivnosti-volne-1/
- epravo, vedlejší činnost zaměstnance: https://www.epravo.cz/top/clanky/vedlejsi-cinnost-zamestnance-114841.html
- MPSV, judikát NS 21 Cdo 1132/2014: https://ppropo.mpsv.cz/judikatns21cdo11322014
- MPSV, omezení konkurenční činnosti: https://ppropo.mpsv.cz/pdf/IV2Omezenikonkurencnicinnostizam.pdf
- Navolnenoze, průzkum 2024: https://navolnenoze.cz/novinky/jaksedari/
- SHEAN, sazby 2025: https://www.shean.cz/blog/kolik-stoji-vyvoj-webu-a-e-shopu-v-roce-2025-srovnani-sazeb-freelanceru-a-agentur-nejen-v-brne
- Banky.cz, hodinová sazba: https://www.banky.cz/clanky/jak-stanovit-hodinovou-sazbu-jako-freelancer-nebo-osvc/
- Matěj Boška, ceny webů: https://matejboska.cz/kolik-stoji-webove-stranky
- Z. Janáčová, ceny webů: https://zjanacova.cz/blog/kolik-stoji-web.html
- Snáz.cz: https://www.snaz.cz/kolik-stoji-web
- JustDigital: https://www.justdigital.cz/blog/tvorba-webu-praha-jak-vybrat-agenturu/
- Haxo, AI automatizace: https://www.haxo.cz/sluzby/ai-automatizace/
- coMakers, ceny AI automatizace: https://www.comakers.cz/blog/kolik-stoji-ai-automatizace/
- Pavel Szabo, n8n: https://www.pavelszabo.cz/automatizace-procesu-ai-workflow-n8n/
- Upwork inzerát n8n/Make: https://www.upwork.com/freelance-jobs/apply/Automation-Developer-Freelance-hrs-week-n8n-Make-Integration_~022073007234761939229/
