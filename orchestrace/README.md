# Orchestrace – Claude Code přes všechna zařízení

Konfigurace a skripty jsou v gitu (tento adresář). **Stav** (úkoly, inbox, pravidla, runbook)
je v Obsidian trezoru `jojojo` ve složce `claude/orchestrace/`.

## Architektura

```
Kryštof (PC / mobil přes Remote Control)
  │
  ▼
ORCHESTRÁTOR – Fedora VM 120 (Proxmox), terminál v tmuxu, Remote Control
  │  čte stav z ~/Obsidian/jojojo/claude/orchestrace/ (Obsidian Sync)
  │  nečte kód, jen zadání a shrnutí; každý běh začíná čistě ze stav.md
  │
  ├─► WORKERY (claude -p) – opentify-vm přes ssh, vlastní worktree + větev ukol/<ID>
  │     výstup = větev + krátká zpráva; žádný push na main, žádné sahání na prod
  │
  ├─► TESTER LINUX – session `tester-linux` na Fedoře, Claude in Chrome
  │     úkoly přes SendMessage (stejný stroj → socket, umí notify_when_idle)
  │
  ├─► TESTER WIN – session `tester-win` na PC, Claude in Chrome, Remote Control
  │     úkoly přes SendMessage (jiný stroj → přes Remote Control); když je PC vypnuté, testuje se jen na Linuxu
  │
  └─► DEPLOY – jen orchestrátor, jen po schválení, skript skripty/deploy.sh se zámkem (flock)
```

Denně (cron na Fedoře) běží `skripty/denni-beh.sh`: roztřídí inbox, zkontroluje
„nasazeno → ověřeno“, připomene měření algoritmů a pošle přehled přes ntfy.

## Proč Fedora a ne LXC

| | LXC kontejner | Fedora VM 120 |
|---|---|---|
| Prostředky | malé (sdílí jádro hostitele) | víc (celý desktop) |
| Chrome + Claude in Chrome | ne (bez GUI, rozšíření se páruje s CLI přes native messaging) | ano |
| Obsidian Sync (stav úkolů) | ne bez aplikace | ano |
| Riziko | izolované, levné | musí běžet desktop, obrazovka nesmí zhasnout (Sunshine) |

Protože orchestrátor potřebuje Chrome i trezor, vyhrává Fedora.

## Soubory

| Soubor | Kam patří |
|---|---|
| `orchestrator/CLAUDE.md` | Fedora: `~/vault/orchestrace/orchestrator/` (pracovní složka orchestrátora) |
| `orchestrator/.claude/settings.json` | totéž – deny pravidla pro citlivé části trezoru |
| `worker-pravidla.md` | předává se workerům přes `--append-system-prompt` |
| `tester-pravidla.md` | vloží se do CLAUDE.md / prvního promptu testerů |
| `sablony/ukol.md` | šablona souboru úkolu (v trezoru `claude/orchestrace/ukoly/`) |
| `skripty/spust-workera.sh` | Fedora – spustí workera na opentify-vm |
| `skripty/deploy.sh` | opentify-vm – nasazení se zámkem |
| `skripty/denni-beh.sh` | Fedora – denní běh z cronu |
| `NASAZENI.md` | jednorázová instalace, krok za krokem |
