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
- **Physics glue that isn't in the XML at all, but the pack's own design assumes it**:
  Floor-bordered actions (Stand/Walk/Sit/...) are kept glued to whatever floor is actually
  beneath them — falling to reach it if needed — because real transitions like
  `FallFromWall` are just a 1px `Offset` then a plain `Stand`, with no explicit falling step;
  that only works if the engine treats "on the floor" as a continuously-enforced background
  state, not something each action has to arrange itself. Wall/Ceiling-bordered actions
  (ClimbWall, ...) correctly clear that floor-grounded state instead of leaving it stale.
  Fall/Thrown also now respect the window's side walls *and* ceiling (originally only the
  floor was checked, so a hard throw could sail off the edge or through the top into
  permanent invisible freefall), and apply the Falling action's own `Gravity`/`RegistanceX`/
  `RegistanceY` instead of one constant global gravity with no air drag.
- **Behaviors the engine triggers directly, not through weighted selection**: `Fall` (physics
  event), `Dragged`/`Thrown` (mouse input) — and, it turns out, `ChaseMouse` too: it's
  declared `Frequency="0"` like the other three but is never referenced by any other
  behavior's `NextBehavior`, so it's orphaned from the weighted-pool graph entirely in the
  real pack. Approximated with a periodic, cooldown-gated eligibility while grounded; there's
  no ground truth available for the original's exact cadence, so treat the numbers as a
  starting guess rather than a verified value.
- **Approximated, not literal**: the original engine tracks a specific external OS window
  ("activeIE" in its own naming, from its IE-integration history) that mascots can climb on;
  here that concept maps to whichever open pane/status-bar ledge the mascot is currently
  standing on. Side/underneath tracking of that pane isn't implemented, only its top as a
  floor.
- **Real multiple mascots, including real `Breed`**: `Stage` now runs any number of
  independent mascots (capped by a settings limit) instead of just one. A pack's own Breed
  actions (`PullUpShimeji1`/`Divide1` in the real pack, verified against the actual XML) spawn
  a genuinely new sibling mascot offset by `BornX`/`BornY`, started directly on
  `BornBehavior` — bypassing weighted selection entirely, the same way Fall/Dragged/Thrown/
  ChaseMouse do, since `PullUp`/`Divided` are `Frequency="0"` and never any other behavior's
  `NextBehavior` target either. `mascot.totalCount` (the real pack gates breeding on
  `totalCount < 50`) now reflects the actual live mascot count instead of always being 1.
- **The simulation core no longer touches `window`/`document` directly**: `Stage`/`Mascot`/
  `BehaviorAI` go through an injectable `Environment` interface for viewport size and
  platform-ledge geometry, and `Stage`'s loop is a fixed-timestep accumulator at the same
  40ms tick the original engine itself runs, instead of scaling behavior speed with whatever
  the display's framerate happens to be.
- **Settings and a right-click menu roughly matching shimeji-ee's own preferences**: which
  characters are active (multiple at once — each spawn picks one at random), max mascots on
  screen, auto-spawn count, allow dragging, allow breeding, and chase-the-mouse are all
  settings now, alongside the original size/pane-ledges/debug-ledges controls. Right-clicking
  a mascot opens a menu to switch its character, jump it to a specific behavior, duplicate or
  remove it, remove everyone, or add another.
- **Not visually tested in a live Obsidian window** — this was built in a headless
  container with no GUI; every fix so far has been verified via `tsc`/`vitest`/`esbuild` plus
  tests that exercise the real conf files in `Shimeji/conf/` directly (not just synthetic
  fixtures), including one that drives a full BehaviorAI simulation from a fresh spawn and
  DOM-level smoke tests that construct a real `Mascot` in jsdom and check its rendered
  transform/visibility. That catches logic bugs but not "does this look/feel right" —
  pane/status-bar ledge geometry, drag feel, and animation timing are exactly the kind of
  thing that needs a real window to tune, so please keep reporting anything that looks or
  feels off.

## Using your own artwork

The default pack folder (`Shimeji/`, alongside this README) already has the real, standard
`conf/actions.xml` + `conf/behaviors.xml` checked in. Drop your 46 images into
`Shimeji/img/`, named `shime1.png` … `shime46.png` (see `Shimeji/img/DROP_YOUR_PNGS_HERE.txt`),
then in **Settings → Shimeji Desktop Mascot**: click **Rescan**. Everything found is turned
on automatically the first time (see the **Characters** section to change that).

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

- Ribbon icon (cat): removes every mascot if any are on screen, otherwise spawns the
  auto-spawn count.
- Commands: "Spawn mascot", "Remove mascot" (the most recently spawned one), "Remove all
  mascots", "Rescan pack folder" (re-reads the pack folder after you add/change files).
- Right-click a mascot for its own menu: switch its character, jump it straight to a named
  behavior, duplicate it, remove it, remove everyone, add another, or open plugin settings.
- Settings: pack folder + rescan; per-character on/off toggles under **Characters** (a new
  mascot picks randomly among the ones turned on); population controls (spawn/remove-all
  buttons, max mascots on screen, auto-spawn on startup and how many); behavior toggles
  (allow dragging, allow breeding, chase-the-mouse); size; whether panes/status bar count as
  extra ledges; and a debug overlay that draws the ledges mascots currently think they can
  stand on.

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
