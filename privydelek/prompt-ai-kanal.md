Ahoj, navazuješ na plánování z jiné session. Tady je celý kontext.

## Kdo jsem a co chci
Jsem Kryštof. Neprogramuju, stavím věci tak, že řídím Claude Code (Opentify, Obsidian pluginy, weby, homelab na Proxmoxu). Chci rozjet **zábavný YouTube/TikTok/Instagram kanál s AI postavou**, ideálně Shorts, který bude skoro celý automatizovaný.

- Můj vstup = jen sypu kreativní nápady do chatu v Claude Code.
- Všechno ostatní automaticky: scénář, vizuál, hlas, střih, kontrola, publikace a vyhodnocení statistik.
- Kanál je **oddělený** od případného výukového kanálu o AI. Vlastní tvář ani jméno nechci ukazovat.
- Cíl: časem minimum mé pozornosti, monetizace (reklama, sponzoři, merch, licence postavy).

## Pravidla, se kterými počítej
- YouTube od 7/2025 nemonetizuje šablonovitý, hromadný, opakující se obsah („inauthentic content“). Postava, její svět a styl proto musí být originální a každá epizoda musí mít vlastní nápad. Trend je jen téma.
- AI obsah na TikToku a Instagramu označovat.
- Žádní skuteční lidé, žádné rady ve zdraví, financích nebo právu, žádné cizí chráněné postavy.
- Před jakoukoli změnou mimo pracovní složku se mě zeptej. Nesahej do mého živého Obsidian vaultu.

## Úkol 1: workflow z inspiračního videa
Inspirace: https://youtu.be/ODXdXJ322Qw („I let Claude Code take my job (it did better than me)“).
1. Stáhni přepis (např. `pip install yt-dlp` a pak `yt-dlp --skip-download --write-auto-subs --sub-langs en --sub-format vtt -o prepis "https://youtu.be/ODXdXJ322Qw"`, případně skill na YouTube přepisy). Když nejsou titulky, zkus `--write-subs` nebo jiný jazyk.
2. Sepiš její workflow **krok po kroku**: jaké nástroje a služby používá, co dělá Claude Code a co člověk, jak hledá trendy, jak vyrábí obsah, jak publikuje, jak vyhodnocuje, kolik to stojí a jaké měla výsledky.
3. Odliš, co je ověřené z videa a co je tvůj odhad.

## Úkol 2: návrh mé pipeline
Podle jejího workflow (a co z něj na mě sedí) navrhni pipeline pro můj kanál:
- konkrétní nástroje na obraz, video, hlas a střih: ceny, kvalita, API, licence k výstupům (komerční použití);
- jak to poběží automaticky (Claude Code routines, skripty, můj Proxmox server);
- publikace přes API platforem (YouTube Data API, TikTok, Instagram) a co z toho jde automatizovat;
- kontrola kvality a schválení jedním klikem, než to jde ven (na začátku chci schvalovat);
- měsíční rozpočet: varianta levná a varianta kvalitní.

## Úkol 3: tři koncepty postav
3 originální koncepty: jméno, osobnost, svět, výtvarný styl (s ukázkovým promptem na obrázek), formát epizody (15–45 s), 5 nápadů na první epizody, proč by to mohlo fungovat. Mám rád výrazný vizuální styl a humor.

## Výstup
- Naklonuj `https://github.com/krystofskala/vault` do dočasné složky (ne do mého Obsidian vaultu), větev `claude/privydelek-plan`.
- Výsledky zapiš do `privydelek/ai-kanal/`: `workflow-z-videa.md`, `pipeline.md`, `koncepty-postav.md`. Navazuje na existující `privydelek/ai-postava.md`, přečti si ho.
- Commitni a pushni do `claude/privydelek-plan`. Žádný pull request.
- Na konci mi dej krátké shrnutí (max. 10 řádků) a doporučení, čím začít.
