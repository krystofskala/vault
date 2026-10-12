# Pipeline pro kanál s AI postavou (návrh, 12. 10. 2026)

Navazuje na `../ai-postava.md` a `workflow-z-videa.md`.
**Ceny jsou snímek k 10/2026 a pocházejí hlavně ze srovnávacích webů, ne z oficiálních ceníků.** Před nákupem je ověřit na stránce poskytovatele. Vše označené [odhad] je můj odhad.

## Hlavní rozhodnutí
1. **Stylizovaná postava, ne realistický člověk.** Konzistence je snazší, „vypadá to jako AI“ nevadí a nehrozí záměna se skutečnou osobou.
2. **Postava bez nutnosti synchronizovat rty** (zobák, maska, kreslený obličej, vypravěč mimo obraz). Lip-sync je nejdražší a nejvíc se kazí. Viz `koncepty-postav.md`.
3. **Generuje se přes API, ne na vlastní GPU.** Proxmox jen řídí, stříhá a skladuje. Grafickou kartu nepotřebuju.
4. **Jazyk: angličtina** [odhad]: větší trh a vyšší výdělek z reklamy. Postavy s minimem textu jdou snadno přeložit (titulky, druhý hlas).
5. **Na začátku schvaluju každé video jedním klikem v Telegramu.** Automatické publikování až po 4–6 týdnech bez zásahů.

## Tok jedné epizody
```
já: nápad v chatu ──► backlog.md
        │
 1. Scénář (Claude) ──► script.md + shots.json (záběry, repliky, hudba, délka)
 2. Kontrola originality (Claude: liší se od posledních 30 epizod?)
 3. Obrázky (API) ──► klíčové snímky postavy podle referencí z bible
 4. Video (API) ──► 0–4 animované klipy po 5 s, zbytek statické snímky s pohybem kamery
 5. Hlas (ElevenLabs) + SFX/hudba z licencované knihovny
 6. Střih (Remotion/ffmpeg) ──► 1080×1920, titulky, intro háček, -14 LUFS
 7. QC (skripty + Claude se zrakem) ──► report
 8. Telegram: náhled + popisky + QC ──► [✅ Publikovat] [🔁 Přegenerovat záběr] [❌ Zahodit]
 9. Publikace YT / IG / TikTok přes API, s AI štítkem
10. Za 48 h a za 7 dní stáhnout statistiky ──► týdenní report ──► úprava backlogu
```

## Nástroje
### Scénář, řízení a kontrola: Claude
- Claude Code (předplatné Pro nebo Max) píše scénáře, generuje `shots.json`, kontroluje a reportuje.
- Bible postavy (`postava/bible.md`) = osobnost, svět, tabu, slovník, referenční obrázky. Claude ji čte před každým scénářem.

### Obraz (klíčové snímky postavy)
| Model | Cena za obrázek ~1K | Poznámka |
|---|---|---|
| Nano Banana 2 (Google, Gemini API) | ~0,067 USD (Lite ~0,034) | dobře drží postavu podle referenčních obrázků; placený tier kvůli datům |
| Nano Banana Pro | ~0,13–0,14 USD (2K) | nejvyšší kvalita a text v obraze |
| FLUX.2 (BFL / fal.ai) | ~0,014 (klein) – 0,07 (max) USD | levné, dobré pro výrazné styly |
| GPT Image 2 (OpenAI) | ~0,03–0,09 USD | dobrý text v obraze |
| Midjourney | předplatné | krásný styl, ale **bez oficiálního API** → jen na ruční vytvoření bible a referencí |

**Doporučení:** Nano Banana 2 jako hlavní (konzistence podle referencí), FLUX.2 jako levná záloha.

### Video (animace klíčových snímků)
| Model | Cena za sekundu (API) | Poznámka |
|---|---|---|
| Seedance 2.0 (ByteDance) | ~0,09–0,30 USD podle poskytovatele (Atlas ~0,11, fal ~0,18–0,30) | top kvalita, model z videa, max. 15 s na klip |
| Kling 3.0 | ~0,084 (720p) / 0,112 (1080p), se zvukem ~0,13–0,17 | dobrý poměr cena/výkon |
| Veo 3.1 (Google) | Fast ~0,15–0,20, Standard ~0,40–0,52, Lite ~0,03 | nativní zvuk; Lite pro levnou variantu |
| Higgsfield (MCP pro Claude Code) | předplatné 19 / 47 / 99 USD (ročně), kredity nepřecházejí | pohodlné MCP jako ve videu, ale kredity místo transparentní ceny |

**Doporučení:** volat přes jednoho agregátora (fal.ai nebo podobný), jeden klíč a modely se dají přepínat. Výchozí Kling 3.0 nebo Seedance 2.0 Fast, pro „hero“ záběry Seedance 2.0.

### Hlas
- **ElevenLabs:** Starter ~5–6 USD/měs. = nejnižší tarif s komerčním použitím. Creator 22 USD/měs. ≈ 100 min TTS. API je v obou. Hlas postavy vytvořit přes **Voice Design** (syntetický, ne klon skutečného člověka). Free tarif **nemá** komerční licenci.
- [odhad] Záloha: OpenAI TTS nebo open-source TTS na Proxmoxu. Kvalita a výraz jsou slabší a pro komedii na hlasu záleží.

### Hudba a zvuky
- [odhad] Epidemic Sound nebo Artlist (~10–20 USD/měs., licence pro YT/IG/TikTok), případně YouTube Audio Library (zdarma, ověřit podmínky pro ostatní platformy). Trendy zvuky z aplikací přes API vložit **nejdou**.
- Pro znělku/podpis postavy: vlastní krátký motiv vygenerovaný jednou (ověřit licenci daného hudebního AI nástroje).

### Střih
- **Remotion** (video z kódu v Reactu): šablona epizody = komponenta, Claude vyplní data. Zdarma pro jednotlivce a firmy do 3 lidí [ověřit aktuální licenci].
- **ffmpeg:** skládání, loudnorm na -14 LUFS, náhledy.
- **Titulky:** faster-whisper nebo whisper.cpp na Proxmoxu (časování po slovech, běží i na CPU).
- CapCut nemá API, takže pro automat se nehodí.

### Licence výstupů (komerční použití)
- Placené tarify uvedených služeb komerční použití výstupů obecně dovolují. **Free tarify často ne** (ElevenLabs, často i video nástroje).
- Postavu chránit jako vlastní dílo: bible, referenční obrázky a datované commity v repu jsou důkaz autorství. [odhad] Čistě AI výstup nemusí být chráněný autorským právem (USA), chráněná je spíš lidská tvůrčí část: postava, scénáře, svět. Pro budoucí licencování postavy je to důležité, ale **není to právní rada**. Před licenčním obchodem konzultovat právníka.
- Do promptů nikdy jména skutečných lidí, značek ani cizích postav. Hlídá to QC.

## Kde a jak to poběží
| Část | Kde | Proč |
|---|---|---|
| Repo `ai-kanal` (soukromý GitHub) | GitHub | jediný zdroj pravdy: bible, backlog, epizody, reporty |
| Studio VM (Debian, 4 vCPU, 8 GB RAM, ~200 GB disk) | Proxmox | Python, Node/Remotion, ffmpeg, whisper, Telegram bot, `claude -p` (headless) |
| Plánování | systemd timery na VM | výroba v noci, statistiky denně |
| Claude Code routines (cloud) | volitelně | týdenní report a úprava backlogu. Limit 5 běhů/den (Pro) nebo 15 (Max). Na domácí server nevidí, komunikují přes repo |
| API klíče | `.env` na VM, mimo git | |

**Skills v Claude Code** (stejný princip jako ve videu):
- `/napad`: zapíše můj nápad do backlogu, doplní háček a pointu, zkontroluje pravidla.
- `/epizoda <id>`: scénář + `shots.json`.
- `/vyroba <id>`: obrázky → video → hlas → střih (paralelně, s rozpočtovým stropem na epizodu).
- `/kontrola <id>`: QC report.
- `/report`: týdenní statistiky a doporučení.

Telegram bot používá long polling, takže **nepotřebuje otevřený port** do domácí sítě.

## Kontrola kvality (před schválením)
**Automaticky skripty:**
- formát 1080×1920, délka 15–45 s, hlasitost -14 LUFS, žádné ticho na začátku;
- první snímek není černý ani rozmazaný (háček v první sekundě);
- přepis hlasu (whisper) = scénář, titulky sedí.

**Claude se zrakem** (snímek každou sekundu):
- postava odpovídá bibli (barvy, tvar, doplňky);
- artefakty: ruce, deformace, nesmyslný text v obraze;
- žádní skuteční lidé, loga, cizí postavy; žádné rady ve zdraví, financích ani právu;
- **originalita:** premisa a pointa se liší od posledních epizod (ochrana proti „inauthentic content“).

**Výstup:** QC report se semaforem do Telegramu. Červená = automaticky přegenerovat (max. 2×), potom až ke mně.

## Publikace přes API
| Platforma | Co jde automaticky | Háčky |
|---|---|---|
| **YouTube** (Data API v3, `videos.insert`) | nahrání, název, popis, tagy, `containsSyntheticMedia=true` (AI štítek), naplánování | Neověřené API projekty nahrávají jako **soukromé**, dokud neprojdou auditem → požádat o audit hned. Kvóta pro `videos.insert` má od 6/2026 vlastní limit (viz Cloud Console). |
| **Instagram** (Graph API, Content Publishing) | Reels, popisek, od 6/2026 `is_ai_generated=true` (AI štítek) | Profesionální účet (Creator/Business). Limit 50 příspěvků za 24 h. Trial Reels přes API [odhad: nejspíš ne, ověřit]. |
| **TikTok** (Content Posting API) | Direct Post, nebo Upload jako koncept do aplikace | Bez auditu jsou příspěvky jen **soukromé**. Audit trvá ~2–4 týdny a často se zamítá. AI štítek přes API [nenašel jsem, ověřit]. |

**Doporučený start:**
- YouTube a Instagram: přímo přes API.
- TikTok: nejdřív **Upload jako koncept**. V aplikaci zapnu AI štítek a ťuknu „Zveřejnit“ (je to stejně ten jeden klik). Mezitím požádat o audit.
- Alternativa: placený agregátor (Ayrshare, Blotato, Upload-Post apod., [odhad] 20–50 USD/měs.), který má audity za sebou.

## Vyhodnocení
- **YouTube Analytics API:** zhlédnutí, `averageViewPercentage` (dokoukanost), `subscribersGained`, sdílení.
- **Instagram Insights:** přehrání, dosah, sdílení, uložení, průměrná doba sledování Reels.
- **TikTok:** základní čísla videí (zhlédnutí, lajky, sdílení) přes API. Podrobnou analytiku [odhad] spíš ručně nebo z exportu.
- **Týdenní report** (`reporty/2026-Wxx.md`): top a flop epizody, co mají společného (háček, téma, délka), návrh 5 dalších epizod. Já jen odsouhlasím nebo dopíšu nápady.
- **Metriky testu** (z `ai-postava.md`): dokoukanost nad 50 %, přírůstek sledujících, sdílení.

## Monetizace: reálná očekávání
- **YouTube Partner Program** pro Shorts: 1 000 odběratelů + 10 mil. zhlédnutí Shorts za 90 dní (nebo 4 000 h sledování). Výdělek z reklamy u Shorts je nízký.
- **TikTok Creator Rewards** [odhad, ověřit]: vyžaduje videa delší než 1 minutu a není dostupný ve všech zemích (ČR pravděpodobně ne). Na TikToku jde spíš o dosah.
- Reálné příjmy: **sponzoři, merch, licence postavy.** Proto originální a „vlastnitelná“ postava.

## Měsíční rozpočet
Předpoklad: 4 videa týdně (~17 měsíčně), 30 s, koeficient opakovaného generování ×2.

| Položka | Levná varianta | Kvalitní varianta |
|---|---|---|
| Styl výroby | statické snímky + pohyb kamery, 1–2 animované klipy na video | plně animované video (Seedance 2.0) |
| Obrázky | ~15 × 0,04 USD × 17 ≈ **10 USD** | ~25 × 0,10 USD × 17 ≈ **45 USD** |
| Video | ~10 s × 0,09 USD × 2 × 17 ≈ **30 USD** | ~30 s × 0,20 USD × 2 × 17 ≈ **205 USD** |
| Hlas (ElevenLabs) | Starter **6 USD** | Creator **22 USD** |
| Hudba | YouTube Audio Library **0 USD** | Epidemic/Artlist **~15 USD** |
| Publikace | přímá API + TikTok koncept **0 USD** | agregátor **~30 USD** |
| Server | Proxmox doma **0 USD** (elektřina) | **0 USD** |
| **Celkem bez Claude** | **≈ 45–60 USD/měs.** | **≈ 300–330 USD/měs.** |
| Claude Code | Pro 20 USD (pokud už ho nemám) | Max 100 USD (víc běhů a routines) |

[odhad] Prvních 3–4 týdnů testu (3 postavy × 5 videí) v levné variantě vyjde na ~30–50 USD za generování.

## Rizika
- **Inauthentic content:** každá epizoda vlastní nápad a QC kontroluje originalitu. Nikdy nedávkovat 20 variant jednoho vtipu.
- **Ceny a modely se mění měsíčně:** agregátor + `shots.json` nezávislý na modelu = výměna modelu je jeden řádek.
- **Rozpočet:** strop na epizodu (např. 3 USD levná / 20 USD kvalitní), při překročení se výroba zastaví.
- **Bezpečnost:** API klíče jen na VM a s limity útraty u poskytovatelů.

## Zdroje
- Seedance 2.0 ceny: [Higgsfield blog](https://higgsfield.ai/blog/seedance-2-0-pricing-2026), [Atlas Cloud](https://www.atlascloud.ai/blog/guides/seedance-2-cost-per-second)
- Srovnání videomodelů: [InVideo – AI video model pricing](https://invideo.io/blog/ai-video-model-pricing), [CometAPI](https://www.cometapi.com/ai-video-api-pricing/), [ModelsLab](https://modelslab.com/blog/api/veo-3-1-vs-kling-3-sora-2-ai-video-api-cost-2026)
- Higgsfield tarify a MCP: [Creatify – Higgsfield pricing](https://creatify.ai/blog/higgsfield-pricing-(2026)-plans-and-what-you-ll-actually-pay), [Creatify – Higgsfield MCP](https://creatify.ai/blog/what-is-higgsfield-mcp-what-it-does-what-it-costs-and-how-to-use-it)
- Obrázky: [CometAPI – image pricing](https://www.cometapi.com/de/ai-image-api-pricing/), [aireiter](https://aireiter.com/blog/cheapest-image-generation-api)
- ElevenLabs: [eesel.ai](https://eesel.ai/blog/elevenlabs-pricing), [bigvu](https://bigvu.tv/blog/elevenlabs-pricing-2026-plans-credits-commercial-rights-api-costs/)
- TikTok API: [Content Sharing Guidelines](https://developers.tiktok.com/doc/content-sharing-guidelines), [Direct Post reference](https://developers.tiktok.com/docs/en/content-posting-api-reference-direct-post), [bundle.social – audit](https://bundle.social/blog/tiktok-api-approval)
- Instagram API: [Changelog](https://developers.facebook.com/documentation/instagram-platform/changelog), [Content publishing](https://developers.secure.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/content-publishing)
- YouTube API: [Revision history](https://developers.google.com/youtube/v3/revision_history)
- Claude Code routines: [computingforgeeks](https://computingforgeeks.com/claude-code-routines-setup/), [claudeforoperators](https://claudeforoperators.com/workflows/cloud-routines/)
