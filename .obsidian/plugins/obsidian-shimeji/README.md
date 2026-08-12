# Shimeji Desktop Mascot (for Obsidian)

An animated mascot that lives inside the Obsidian window — it walks, sits, falls, gets
dragged around, and climbs the window edges — skinned with your own Shimeji-ee-compatible
artwork. This is a from-scratch TypeScript reimplementation of the "desktop mascot" idea,
not a port of shimeji-ee's Java code: Obsidian plugins run sandboxed inside the app's own
window, so unlike the original Shimeji-ee (which overlays your whole screen and detects
other OS windows natively), this mascot is confined to the Obsidian window by design.

## Status

- **A real `actions.xml`/`behaviors.xml` interpreter**, verified directly against the actual
  standard shimeji-ee conf files (checked into `Shimeji/conf/`) — Sequence/Select/Animate/
  Move/Embedded actions, condition-gated Animation variants (e.g. ClimbWall's up-vs-down
  poses), `TargetX`/`TargetY`-driven walking, the `#{...}`/`${...}` condition language
  including the `mascot.environment.floor.isOn(...)`-style predicate API almost every
  standard behavior is gated on, and weighted random behavior selection with the
  additive/exclusive `NextBehavior` semantics real packs rely on.
- **Ticks/units matter**: shimeji-ee's own engine runs a fixed 40ms-tick loop, and
  Duration/Velocity/InitialVX/VY in actions.xml are all in *ticks*, not real time — converted
  once at parse time (`src/shimeji/constants.ts`) so the rest of the engine works in plain ms
  and px/second.
- **Approximated, not literal**: the original engine tracks a specific external OS window
  ("activeIE" in its own naming, from its IE-integration history) that mascots can climb on;
  here that concept maps to whichever open pane/status-bar ledge the mascot is currently
  standing on. Side/underneath tracking of that pane, and the mascot-splitting ("Breed")
  actions, aren't implemented — a split action just plays its poses without spawning a
  second mascot (single-mascot by design). Ceiling-*standing* physics isn't modeled (Move
  actions like ClimbCeiling still work fine, since they're pure position-from-velocity with
  no gravity involved either way).
- **Not visually tested in a live Obsidian window** — this was built in a headless
  container with no GUI, verified via `tsc`/`vitest`/`esbuild` only. Please try it in your
  real vault and report anything that looks wrong — pane/status-bar ledge geometry is the
  most layout-sensitive part, and this is where hand-tuning against a real window is likely
  needed most.

## Using your own artwork

The default pack folder (`Shimeji/`, alongside this README) already has the real, standard
`conf/actions.xml` + `conf/behaviors.xml` checked in. Drop your 46 images into
`Shimeji/img/`, named `shime1.png` … `shime46.png` (see `Shimeji/img/DROP_YOUR_PNGS_HERE.txt`),
then in **Settings → Shimeji Desktop Mascot**: click **Rescan**, pick **Shimeji** from
**Active pack**.

For a different or multi-character pack, point **Pack folder** at any vault-relative folder
laid out the same way:

```
<PackFolder>/
  img/
    shime1.png, shime2.png, ...
  conf/
    actions.xml
    behaviors.xml
```

Multi-character packs work too, using the same convention shimeji-ee uses: a folder per
character under `img/<Name>/`, with either `img/<Name>/conf/` or `conf/<Name>/` providing
that character's `actions.xml`/`behaviors.xml` (falling back to the top-level `conf/` if not
present).

Every pack must define `ChaseMouse`, `Fall`, `Dragged`, and `Thrown` actions/behaviors
(shimeji-ee itself requires this). Missing ones log a console warning but won't crash the
mascot — `Fall`/`Dragged`/`Thrown` in particular have native physics fallbacks regardless of
what's declared.

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
npm test        # vitest — expression engine, XML parsers, ledge geometry, action runner,
                # plus a sanity check that parses the real Shimeji/conf/*.xml directly
```

`main.js` is committed (this plugin lives directly inside a vault's `.obsidian/plugins/`,
not a separate publish repo) — run `npm run build` after changing `src/` and commit the
rebuilt `main.js` alongside your change.
