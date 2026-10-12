// Sestaví web z obsahu v content/ do dist/. Bez závislostí: node build.mjs
import { readFileSync, writeFileSync, readdirSync, mkdirSync, cpSync, rmSync, existsSync } from 'node:fs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const json = (p) => JSON.parse(read(p));
const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Odstavce oddělené prázdným řádkem, **tučně**, [odkaz](url)
const md = (text = '') =>
  text.trim().split(/\n\s*\n/).map((p) =>
    '<p>' + esc(p.trim())
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\[(.+?)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2">$1</a>')
      .replace(/\n/g, '<br>') + '</p>'
  ).join('\n');

const frontmatter = (raw) => {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { data: {}, body: raw };
  const data = Object.fromEntries(m[1].split('\n').filter(Boolean).map((l) => {
    const i = l.indexOf(':');
    return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
  }));
  return { data, body: m[2] };
};

const datum = (iso) => {
  const d = new Date(iso);
  return isNaN(d) ? esc(iso) : `${d.getDate()}. ${d.getMonth() + 1}. ${d.getFullYear()}`;
};

const web = json('./content/web.json');
const rozvrh = json('./content/rozvrh.json');
const cenik = json('./content/cenik.json');

const aktDir = new URL('./content/aktuality/', import.meta.url);
const aktuality = readdirSync(aktDir).filter((f) => f.endsWith('.md'))
  .map((f) => frontmatter(readFileSync(new URL(f, aktDir), 'utf8')))
  .sort((a, b) => String(b.data.datum).localeCompare(String(a.data.datum)))
  .slice(0, 6);

const html = {
  aktuality: aktuality.length
    ? aktuality.map(({ data, body }) => `
      <article class="post">
        <time datetime="${esc(data.datum)}">${datum(data.datum)}</time>
        <h3>${esc(data.nadpis)}</h3>
        ${md(body)}
      </article>`).join('')
    : '<p class="muted">Zatím žádné novinky.</p>',
  rozvrh: (rozvrh.lekce || []).map((l) => `
      <tr><th scope="row">${esc(l.den)}</th><td>${esc(l.cas)}</td><td>${esc(l.nazev)}</td><td class="muted">${esc(l.lektor)}</td></tr>`).join(''),
  cenik: (cenik.polozky || []).map((p) => `
      <li><div><strong>${esc(p.nazev)}</strong>${p.popis ? `<span class="muted">${esc(p.popis)}</span>` : ''}</div><span class="price">${esc(p.cena)}</span></li>`).join(''),
  socialni: [['instagram', 'Instagram'], ['facebook', 'Facebook']]
    .filter(([k]) => web[k]).map(([k, n]) => `<a href="${esc(web[k])}">${n}</a>`).join(' · '),
};

const tel = (web.telefon || '').replace(/\s+/g, '');
const vars = {
  ...Object.fromEntries(Object.entries(web).map(([k, v]) => [k, esc(v)])),
  uvod_html: md(web.uvod),
  o_nas_html: md(web.o_nas),
  rozvrh_poznamka: esc(rozvrh.poznamka || ''),
  tel_odkaz: esc(tel),
  rok: String(new Date().getFullYear()),
  aktuality_html: html.aktuality,
  rozvrh_html: html.rozvrh,
  cenik_html: html.cenik,
  socialni_html: html.socialni,
};

const out = read('./src/template.html').replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '');

const dist = new URL('./dist/', import.meta.url);
if (existsSync(dist)) rmSync(dist, { recursive: true });
mkdirSync(dist, { recursive: true });
cpSync(new URL('./static/', import.meta.url), dist, { recursive: true });
writeFileSync(new URL('index.html', dist), out);
console.log(`Hotovo: dist/index.html (${aktuality.length} aktualit, ${(rozvrh.lekce || []).length} lekcí, ${(cenik.polozky || []).length} položek ceníku)`);
