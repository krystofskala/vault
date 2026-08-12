# Shimeji Desktop Mascot (for Obsidian)

An animated mascot that lives inside the Obsidian window — it walks, sits, falls, gets
dragged around, and (best-effort) climbs the window edges — skinned with your own
Shimeji-ee-compatible artwork. This is a from-scratch TypeScript reimplementation of the
"desktop mascot" idea, not a port of shimeji-ee's Java code: Obsidian plugins run sandboxed
inside the app's own window, so unlike the original Shimeji-ee (which overlays your whole
screen and detects other OS windows natively), this mascot is confined to the Obsidian
window by design.

## Status

This is a staged build:

- **Working now:** the window-bound stage/physics engine, a built-in placeholder mascot
  (no artwork required), drag-and-throw, and a real interpreter for Shimeji's
  `actions.xml` / `behaviors.xml` format (Sequence/Select/Animate/Move/Embedded actions,
  weighted random behavior selection, the `#{...}` condition language).
- **Best-effort / needs tuning against real files:** the exact `actions.xml`/`behaviors.xml`
  schema was reconstructed from public documentation and a real sample file, not from
  shimeji-ee's source, so an unusual tag/attribute your pack uses may log a console warning
  and fall back gracefully (never crash) instead of being honored. Ceiling-walking
  (upside-down movement) isn't implemented; wall climbing is.
- **Not visually tested in a live Obsidian window** — this was built in a headless
  container with no GUI. Please try it in your real vault and report anything that looks
  wrong (especially pane/status-bar ledge geometry, which is the most layout-sensitive
  part).

## Using your own artwork

Point **Settings → Shimeji Desktop Mascot → Pack folder** at a vault-relative folder laid
out the same way a normal Shimeji-ee character is:

```
<PackFolder>/
  img/
    shime1.png, shime2.png, ...
  conf/
    actions.xml
    behaviors.xml
```

Multi-character packs also work, using the same convention shimeji-ee uses: a folder per
character under `img/<Name>/`, with either `img/<Name>/conf/` or `conf/<Name>/` providing
that character's `actions.xml`/`behaviors.xml` (falling back to the top-level `conf/` if
not present). Click **Rescan**, then pick the character from **Active pack**. Leave it
unset to keep the built-in placeholder.

Required by shimeji-ee itself (and by this plugin): every pack must define `ChaseMouse`,
`Fall`, `Dragged`, and `Thrown` actions/behaviors. Missing ones log a console warning but
won't crash the mascot — `Fall`/`Dragged`/`Thrown` in particular have native physics
fallbacks regardless of what's declared.

## Commands / UI

- Ribbon icon (cat) and the "Spawn mascot" / "Remove mascot" commands toggle the mascot.
- "Rescan pack folder" re-reads the pack folder after you add/change files.
- Settings: pack folder, active pack, size, whether panes/status bar count as extra ledges,
  a debug overlay that draws the ledges the mascot currently thinks it can stand on, and
  auto-spawn on startup.

## Development

```
npm install
npm run dev     # esbuild watch, rebuilds main.js on change
npm run build   # typecheck + production bundle
npm test        # vitest — expression engine, XML parsers, ledge geometry, action runner
```

`main.js` is committed (this plugin lives directly inside a vault's `.obsidian/plugins/`,
not a separate publish repo) — run `npm run build` after changing `src/` and commit the
rebuilt `main.js` alongside your change.
