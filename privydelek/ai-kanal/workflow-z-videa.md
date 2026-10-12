# Workflow z inspiračního videa (12. 10. 2026)

**Video:** [I let Claude Code take my job (it did better than me)](https://youtu.be/ODXdXJ322Qw), kanál Alberta Tech, vydáno 4. 5. 2026, 9:21 min, cca 139 tis. zhlédnutí (stav 12. 10. 2026).
**Zdroj:** automatický anglický přepis (yt-dlp). Video je sponzorované firmou Higgsfield.

Značení: **[video]** = řečeno nebo ukázáno ve videu. **[odhad]** = můj odhad nebo doplnění, ve videu není.

## O co jí šlo
- [video] Tvoří satiru a skeče o tech. Ptá se, jestli Claude Code dokáže vyrobit *její* typ videa (ne „tančící ovoce“), a to opakovatelně a automatizovatelně, ne jedno video za 12 hodin.
- [video] Její publikum se v AI vyzná, takže když video vypadá „moc AI“, odscrollují.

## Nástroje
| Nástroj | K čemu | Zdroj |
|---|---|---|
| Claude Code | orchestrace: skill, rozdělení scénáře, paralelní generování, stažení B-rollu | [video] |
| Higgsfield MCP server (+ jejich web) | přístup k videomodelům z Claude Code | [video] |
| Seedance 2.0 (ByteDance) | generování videa, limit 15 s na klip | [video] |
| Pexels | zdarma stažitelný stock B-roll | [video] |
| CapCut | ruční střih, filtr, hudba z její šablony | [video] |
| Instagram Trial Reels | test publikace mimo hlavní feed | [video] |

## Postup krok po kroku
1. **Nejdřív slepá ulička.** [video] Skeč s dalšími tvůrci (podle jejich fotek): obličeje poznatelné, ale je to jasně AI. Závěr: potřebuje formát, ve kterém se chyby AI ztratí.
2. **Volba formátu.** [video] Její starší úspěšná série „hope core“: jen ona, výrazný filtr, hudba, hodně B-rollu. Filtr, hudba a B-roll schovají chyby generování.
3. **Proof of concept ve webovém UI Higgsfieldu.** [video] Vstupy: 3 screenshoty, na kterých mluví (ne pózované fotky) + krátká audio nahrávka jejího hlasu ve správném tónu. Když dala jako referenci celé video, postava mluvila vymyšleným jazykem. Obrázky + audio zvlášť fungovaly líp. Sama říká, že je to „umění, ne věda“.
4. **Skill v Claude Code.** [video] Nechala Claude vytvořit skill, aby šel postup opakovat:
   - nahraje referenční obrázky a audio do Higgsfieldu,
   - rozdělí scénář na 20–30 s do úseků po zhruba 5 s,
   - vygeneruje všechny úseky **paralelně**,
   - stáhne B-roll z Pexels (šetří kredity za generování),
   - uloží všechno do jedné složky.
5. **Scénář.** [video] Dodala ho člověk. Použila svůj starší scénář („proč nejde vycentrovat div“), aby mohla porovnat s originálem. Claude scénář nepsal.
6. **Střih.** [video] Ručně v CapCutu podle šablony ze starších hope core videí (filtr, hudba). B-roll dala hlavně tam, kde se jí generovaný záběr nelíbil („trochu jsem podváděla“).
7. **Publikace.** [video] Ručně na Instagram Trial Reels (video se ukazuje lidem, kteří ji nesledují, a nejde na profil).
8. **Vyhodnocení.** [video] Ručně, podle čísel v aplikaci druhý den.

## Co dělal Claude Code a co člověk
- **Claude Code:** napsal skill, rozsekal scénář, volal generování, stáhl B-roll, roztřídil soubory. [video]
- **Člověk:** volba formátu, referenční materiály, scénář, střih, výběr záběrů, publikace, vyhodnocení. [video]
- [odhad] Automatizovaná byla jen výroba surových záběrů, zhruba třetina práce. Kreativní a „kurátorská“ část zůstala na ní.

## Trendy
- [video] Trendy nehledala. Použila vlastní osvědčený formát a starý scénář.
- [odhad] Trendy tedy z videa převzít nejde. Pro můj kanál je musím navrhnout zvlášť (viz `pipeline.md`).

## Náklady
- [video] Konkrétní částky neuvádí. Přístup k MCP jí dal Higgsfield (sponzoring). Zmiňuje jen, že B-roll ze stocku šetří kredity.
- [odhad] Video na 25–30 s = asi 5–6 klipů po 5 s, tedy 25–30 s Seedance 2.0. Při cenách přes API zhruba 0,09–0,30 USD/s (podle poskytovatele) to je **3–9 USD za jednu sadu záběrů**, s opakovaným generováním spíš 5–20 USD. Přes předplatné Higgsfieldu (19–129 USD/měs.) se to platí kredity.

## Výsledky
- [video] Po 11 hodinách na Trial Reels: **6 000 zhlédnutí, 228 lajků, 2 komentáře, 9 repostů, 83 sdílení.** Konečná čísla ukazuje až v grafice, z přepisu je nevyčtu.
- [video] V komentářích si nikdo nevšiml, že jde o AI. Jedinou chybou byla špatná výslovnost slova „Schrödinger“.
- [video] Pro srovnání: její skutečné video s jinými tvůrci, publikované taky jako Trial Reel, mělo asi 100 lajků.
- [video] Její závěr: **výkon táhne hlavně scénář a koncept**, ne produkce.
- [video] Etika: necítí se dobře, když publikum klame. Kdyby to dělala znovu, AI by přiznala.

## Co si z toho beru
1. **Koncept a scénář jsou nejdůležitější.** Na to jde moje kreativní energie (nápady v chatu), všechno ostatní se automatizuje.
2. **Formát, který maskuje slabiny AI:** výrazný stylizovaný vizuál, hudba, střih. U mě ještě líp: postava, která *není* realistický člověk, takže „poznám, že je to AI“ nevadí. Navíc AI obsah stejně označuju.
3. **Skill v Claude Code jako jádro opakovatelnosti.** Pevný postup, referenční obrázky, rozsekání na krátké klipy, paralelní generování.
4. **Generovat jen to, co je nutné.** Levnější zdroje (stock, statické obrázky s pohybem kamery) tam, kde stačí.
5. **Testovat mimo hlavní feed** (Trial Reels) a srovnávat s kontrolní skupinou.
6. **Nepřebírám:** klonování skutečného člověka (u mě nedává smysl a nechci to), ruční střih v CapCutu (nemá API, nejde automatizovat) a skrývání AI (pravidla platforem i moje zásady říkají označovat).
