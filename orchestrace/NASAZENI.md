# Nasazení – krok za krokem

Každý zásah na Kryštofově hardwaru (Proxmox, VM, síť): **vysvětlit → Kryštof potvrdí → zapsat do
„Notebook a server – jak vše vrátit zpět.md“**. Tento postup neprovádět naslepo.

## 0. Trezor – citlivé soubory (PC, před vším ostatním)

1. ✅ Hotovo 14. 10.: citlivé soubory jsou ve složce `Soukromé/`, na PC deny v `~/.claude/settings.json`.
2. Na Fedoře v Obsidianu: Nastavení → Sync → **Vyloučené složky** → `Soukromé`. Vyloučené složky
   se nastavují **pro každé zařízení zvlášť** – nastavit hned při prvním připojení trezoru na Fedoře,
   ještě před první synchronizací, a ověřit, že složka na Fedoře neexistuje.
3. Totéž platí pro každé další zařízení, kde poběží agenti.
   Citlivé soubory se tak na stroj s agenty vůbec nedostanou. Deny pravidla v
   `orchestrator/.claude/settings.json` jsou jen druhá pojistka.

## 1. Fedora VM 120 (orchestrátor + tester-linux)

- Ověřit prostředky VM (doporučeno ≥ 8 GB RAM, Chrome + Obsidian + 2 sessions).
- Nainstalovat: `git`, `tmux`, Claude Code (přihlásit claude.ai účtem – nutné pro Remote Control
  a zprávy mezi stroji), Chrome + rozšíření Claude in Chrome, Obsidian + Sync (trezor `jojojo`).
- Vypnout zhasínání obrazovky / uspávání (už platí kvůli Sunshine – ověřit).
- `git clone https://github.com/krystofskala/vault ~/vault`
- Upravit `TREZOR` v `~/vault/orchestrace/orchestrator/.claude/settings.json` podle skutečné cesty.
- `~/.config/orchestrace.env` (mimo git):
  ```
  TREZOR=/home/<uživatel>/Obsidian/jojojo
  NTFY_URL=https://<ntfy server>/<téma>
  ```
- SSH na VM: klíč + alias `opentify-vm` v `~/.ssh/config` (přes Tailscale), ověřit `ssh opentify-vm true`.

## 2. opentify-vm (workery + deploy)

- Claude Code + přihlášení (stejný účet).
- Vývojový klon odděleně od produkce: `git clone <opentify repo> /srv/opentify-dev`, `mkdir /srv/opentify-wt`.
- `/opt/orchestrace/`: `worker-pravidla.md`, `worker-settings.json`, `test.sh`, `deploy.sh` (z `skripty/`), `chmod +x`.
- **Vyplnit `test.sh` podle runbooku** (testovací DB, Redis db 14, kód z worktree).
- `gh` CLI + přihlášení (pro stahování artefaktu webu, pilot P1).

## 3. Spuštění

Fedora:
```
tmux new -s orch
cd ~/vault/orchestrace/orchestrator
claude --name orchestrator --add-dir "$TREZOR/claude/orchestrace"
# v session: /remote-control  → orchestrátor je dostupný z mobilu i PC

tmux new -s tester
claude --chrome --name tester-linux
# první zpráva: obsah tester-pravidla.md
```
PC (volitelné, když je zapnuté): `claude --chrome --name tester-win`, `/remote-control`, první zpráva tester-pravidla.md.

Kontrola: v orchestrátoru `/list-agents` → musí vidět `tester-linux` (a `tester-win` se štítkem Remote Control).

Cron (Fedora): `12 7 * * * $HOME/vault/orchestrace/skripty/denni-beh.sh`

## 4. Pilot

- **P1** (schváleno): GitHub Actions workflow, který z `main` postaví web a nahraje artefakt `web-build`;
  ověřit `deploy.sh web <run-id>`.
- **P2** (ověřovací, přes tester-linux): živý web – obaly v2 se skutečnými fotkami na Domů,
  na stránce nálady „Smutné“ se objeví „Pro tebe“; screenshoty, 8c + 8d → `ověřeno`.

Po pilotu: co drhlo, zapsat do `pravidla.md` / upravit tyto soubory.
