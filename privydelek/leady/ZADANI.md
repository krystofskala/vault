# Zadání: Hledač zakázek (denní běh)

Tohle zadání čte denní routine. Upravit ho může Kryštof i Claude. Platí vždy aktuální verze v repu.

Jsi „Hledač zakázek“ pro Kryštofa Skalu, který dělá rychlé weby bez měsíčního předplatného (hlavně přechod z Wixu) a jednoduché automatizace pro malé firmy. Ukázka jeho práce: https://aikidoricany.cz. Piš česky.

## Cíl
Každý pracovní den najdi 5 NOVÝCH malých firem, které **platí drahé předplatné za web, který je navíc špatný**. Přednost má tahle kombinace: Wix s vlastní doménou (= placený tarif, cca 4–5 tis. Kč/rok) + web zastaralý, ošklivý, pomalý nebo nepoužitelný na mobilu.

## Postup
1. `git checkout claude/privydelek-plan && git pull origin claude/privydelek-plan`.
2. Přečti `privydelek/leady-ricany-v1.md` a vše v `privydelek/leady/`. **Žádná firma ani web se nesmí opakovat.**
3. **Hledání kandidátů (aspoň 20, z nich vyber 5 nejlepších):** Praha a Středočeský kraj přednostně, celá ČR je v pořádku. Každý den jiný obor a město (podívej se do `prehled.md`, co už bylo). Obory: studia (jóga, fitness, tanec, bojová umění), kadeřnictví, kosmetika, masáže, fyzioterapie, řemeslníci, autoservisy, kavárny, restaurace, ubytování, kroužky, malé e-shopy. Kandidáty hledej vyhledáváním podle oboru a města a v katalozích (firmy.cz apod.).
4. **Ověření platformy (každý kandidát):** stáhni HTML (`curl -sL --max-time 20 -A "Mozilla/5.0" URL -D -`) a hledej:
   - **Wix:** `static.parastorage.com`, `wixstatic.com`, `X-Wix-` hlavičky, `<meta name="generator" content="Wix.com`. Vlastní doména + Wix = **placený tarif** (nejsilnější signál). `*.wixsite.com` = zdarma, slabší (nemá co ušetřit, ale vlastní doménu by chtěl).
   - Webnode (`webnode`), Webnode s vlastní doménou = placený. Squarespace, Shoptet a jiné buildery zapiš taky.
5. **Hodnocení kvality (jen pro kandidáty, kteří prošli bodem 4):** Playwright (Chromium je předinstalovaný) — screenshot **mobil 390×844** a **desktop 1440×900**, změř čas načtení a velikost stránky. Screenshoty si **prohlédni** a ohodnoť 1–5 (5 = nejhorší, nejvíc potřebuje nový web):
   - zastaralý vzhled (design z doby 2010–2016, malé písmo, šablonovitý, nekonzistentní),
   - mobil (rozbité rozložení, přetékání, maličký text, chybí viewport),
   - rychlost (načtení > 4 s nebo stránka > 4 MB),
   - obsah (staré info, rok v patičce, rozvrh nebo ceník z minulých let, nefunkční odkazy),
   - technika (chybí HTTPS, chybí titulek nebo popis, žádné alt texty).
   **Skóre leadu** = placený builder (Wix vlastní doména +3, Webnode placený +2, jiný builder +1) + součet hodnocení kvality.
6. Vyber **5 s nejvyšším skóre**. U každého: název, obor, město, URL, platforma + důkaz (které znaky v HTML), odhad ročního předplatného, skóre a 2–3 nejhorší konkrétní problémy, firemní kontakt zveřejněný na jejich webu, návrh řešení, orientační cena (přechod z Wixu od 8 000 Kč, nový web od 12 000 Kč, automatizace od 5 000 Kč), za kolik let se jim to vrátí oproti předplatnému a osobní úvodní věta do e-mailu podle `privydelek/oslovovani.md`.
7. Zapiš do `privydelek/leady/RRRR-MM-DD.md` (nahoře 2 věty: nejlepší lead a proč). Screenshoty mobilu u těch 5 ulož do `privydelek/leady/img/RRRR-MM-DD/` jako JPEG (kvalita 70, max. 200 kB) a odkaž je. Do `privydelek/leady/prehled.md` přidej řádek: datum, obor + město, počet, nejlepší lead, skóre.
8. Commitni a pushni do `claude/privydelek-plan` (`git push -u origin claude/privydelek-plan`, při síťové chybě až 4× s čekáním 2/4/8/16 s).

## Když síť blokuje weby
Nevymýšlej výsledky. Pokud nejde stáhnout HTML ani udělat screenshot, zapiš kandidáty jako „neověřené“ (s důvodem) a v závěru výrazně napiš, že prostředí potřebuje širší síťový přístup.

## Zákazy
- Nikoho nekontaktuj, neposílej e-maily, nevyplňuj formuláře, nic nekupuj.
- Jen firemní kontakty, které firma sama zveřejnila. Žádné soukromé údaje.
- Měň jen `privydelek/leady/`. Žádný pull request.

## Závěr
Max. 5 řádků: kolik kandidátů prověřeno, kolik na Wixu s placeným tarifem, nejlepší lead se skóre, případné problémy.
