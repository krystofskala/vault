# Ukázkový web s editorem (fiktivní Studio Lípa)

Šablona pro klienty, kteří odcházejí z Wixu nebo Webnode a chtějí si obsah dál měnit sami.

- `content/` je obsah, který mění klient v editoru (aktuality, rozvrh, ceník, základní údaje).
- `src/template.html` a `static/styl.css` jsou vzhled, ten měním já.
- `build.mjs` sestaví web do `dist/`. Je bez závislostí, stačí `node build.mjs`.
- `.pages.yml` je konfigurace editoru [Pages CMS](https://app.pagescms.org).

## Nasazení pro klienta
1. Repo na GitHubu (u klienta nebo převoditelné).
2. **Cloudflare Pages** → Connect to Git → build command `node build.mjs`, output `dist`. Každé uložení v editoru = nový commit = web se sám přestaví (do minuty).
3. **Pages CMS** → přihlásit se GitHubem, nainstalovat GitHub App na repo → v nastavení přidat klienta jako *collaborator* (pozvánka e-mailem, klient nepotřebuje GitHub).
4. Doména klienta → Cloudflare Pages custom domain.

## Co klient umí / neumí
- Umí: přidat aktualitu, upravit rozvrh, ceník, texty a kontakty.
- Neumí (záměrně): rozložení a vzhled. To dělám já, aby se web nerozbil.
