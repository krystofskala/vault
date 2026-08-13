# Shimeji Desktop Mascot (for Obsidian)

An animated mascot that lives inside the Obsidian window — it walks, sits, falls, gets
dragged around, and climbs the window edges — skinned with your own Shimeji-ee-compatible
artwork. The *platform* is necessarily different from the original: Obsidian plugins run
sandboxed inside the app's own window, so unlike the original Shimeji-ee (which overlays your
whole screen and detects other OS windows natively via JNA), this mascot is confined to the
Obsidian window and reads Obsidian's own panes instead of a tracked external window. But the
*physics and behavior algorithms* are, wherever that platform difference doesn't force a
change, direct ports of the real engine's actual Java source (`com.group_finity.mascot.*`),
not reinventions — see "Ported directly from the real engine's source" below for specifics
and exactly where the two necessarily diverge. See `SOURCE_AUDIT.md` for the working, per-file
checklist that pass was tracked against — useful if you're picking this up to continue the audit
rather than just reading about the outcome.

## Status

### Ported directly from the real engine's source, not reinvented

A full pass through the actual Java source
([`logany20/shimeji-ee`](https://github.com/logany20/shimeji-ee/tree/master/src/com/group_finity/mascot),
a direct mirror of the engine this plugin's own bundled `actions.xml`/`behaviors.xml` target —
`Mascot.java`, `action/*.java`, `behavior/*.java`, `config/*.java`, `environment/*.java`), after
several rounds of physics that turned out to be invented approximations rather than the real
thing (see the drag section below for how that went wrong). Found and fixed:

- **Weighted behavior selection had a real bug**: a `NextBehavior` reference was being gated by
  *both* its own condition *and* the target's separate top-level `<Behavior Condition="...">` —
  but the real engine's `Configuration.buildBehavior()` never re-checks the top-level entry for
  a reference at all, only the reference's own (inherited-plus-own) condition. This made some
  real transitions unreachable whenever the target's top-level definition happened to be
  condition-gated in a way the reference site didn't share.
- **A mascot could freeze forever**: if a tick ever landed on a state where nothing was
  eligible (candidates empty, or all present ones weight-0), `pickNextBehavior` returned
  `undefined` and nothing happened — forever, since the next tick would hit the exact same
  state again. The real engine's `Configuration.buildBehavior()` has an explicit recovery for
  this: teleport to a random x, drop in from `screenTop - 256` (definitely off-screen, so it
  visibly falls into view), and force `Fall`. Ported exactly, replacing an invented "prefer
  Fall in the tiebreak" heuristic that only covered a narrower case than the real one.
- **A second, separate recovery** (`UserBehavior.next()`'s own bounds check): every tick, if a
  mascot has drifted entirely past the left/right/bottom edge, the real engine recovers the
  same way — random x, `screenTop - 256`, forced `Fall`. Added as a general defensive net.
- **`Fall` only ever ended by landing on a floor** — the real `Fall.hasNext()` checks
  `floor.isOn(pos) || wall.isOn(pos)`: touching a wall ends a fall too. Without this, falling
  into the side of a pane just clamped horizontally and kept falling straight past it, and the
  real Fall sequence's own `Select` step (`Bounce+Stand` if landed on a floor, `GrabWall`
  otherwise) could never actually reach the `GrabWall` branch from an ordinary fall.
- **`Fall` never updated facing** — real `Fall.tick()`: `if (velocityX != 0)
  setLookRight(velocityX > 0)`, every tick. Ours left facing at whatever it was before the fall
  started.
- **Resistance/gravity silently defaulted to zero/wrong instead of the real engine's own
  defaults** — `Fall.java`'s `getRegistanceX/Y()`/`getGravity()` fall back to real, nonzero
  constants (0.05 / 0.1 / 2) when the action's XML omits the attribute; ours defaulted to no
  resistance at all, and had `Fall` fall back to the pack-wide `config.gravity` instead of the
  real engine's own default of 2 (the real engine has no "pack-wide gravity" concept — every
  `Fall` reads only its own `Gravity` attribute).
- **`LostGroundException`, ported as a `lostGround` flag**: the real engine aborts a
  Wall/Ceiling-bordered `Move` immediately (straight to `Fall`) if its border vanishes
  mid-climb (a tracked window closing, in the original). Ours never checked, so a pane closing
  mid-climb left the mascot moving against a wall/ceiling that was no longer there. `tickMove`
  now re-validates and flags it; `BehaviorAI` consumes the flag and forces `Fall`, mirroring
  `UserBehavior.next()`'s own `catch (LostGroundException)`.
- **`weightedPick` simplified to match the real, much simpler algorithm**: a plain weighted
  roll (`random -= weight; if (random < 0) return`) with no special-casing — the "what if
  nothing has positive weight" question the old version tried to answer internally is now
  answered upstream, exactly where the real engine answers it (the respawn recovery above),
  not inside the picker itself.

**Deliberately not ported (documented, not silently skipped)**: `Fall.java`'s exact pixel-stepping
sub-tick collision loop (an 80px look-back "HACK IE" specifically for tunneling through a
*fast-moving tracked window* — our floors/walls are stable Obsidian panes, so the tunneling case
it guards against is far less likely to matter, and continuous per-tick checks already catch a
touch within the same tick); `Wall`/`FloorCeiling.move()`'s exact proportional-rescale-relative-
to-a-moving-border math (a resizing/moving *tracked window* redistributes a mascot's relative
position along it — ours just re-snaps to the nearest current ledge, see the resize-fall-through
fix below, a simpler approximation of the same intent); `Move.tick()`'s exact
target-overshoot timing (the real engine snaps position but still finishes the tick's own
duration bookkeeping normally, only ending on the *next* `hasNext()` check — ours ends the frame
immediately on overshoot, a minor animation-completeness difference, not a position error).
(An earlier version of this section also listed "ChaseMouse's real trigger cadence" as an
unresolved approximation — that one turned out to be findable after all, see the fifth pass
below: it has no autonomous trigger at all, so there was never a cadence to match.)

**A second pass, going past the pieces that had visible bugs into the rest of the source**
(`action/Look.java`, `action/Jump.java`, `action/Breed.java`, and `BorderedAction`/
`UserBehavior.next()`'s `LostGroundException` handling) turned up four more real divergences:

- **`Look` had the wrong default entirely**: ours picked `LookRight` by comparing the mascot to
  the ambient pointer ("face the cursor") whenever a `<Look/>` step omitted the attribute. The
  real `Look.apply()` is `setLookRight(eval("LookRight", Boolean.class,
  !mascot.isLookRight()))` — the default is *toggle whichever way I'm currently facing*, nothing
  to do with the cursor. Scripted sequences place a bare `<Look/>` between segments specifically
  to rely on that toggle for their own authored turns (e.g. `ClimbAlongWall` switching from
  climbing up to moving along the ceiling); with the invented cursor-facing default, that turn
  silently did nothing whenever the mascot already happened to be facing the cursor's side.
- **`Jump` was a reinvented ballistic arc, not the real algorithm**: ours gave it one initial
  velocity, same as `Fall`, and let gravity take over. The real `Jump.java` isn't gravity-driven
  at all — every tick it recomputes a fresh vector straight at the target (`dx = targetX - x;
  dy = targetY - y - abs(dx) / 2`; that `-abs(dx)/2` term fakes an arc shape with a fixed
  vertical bias, not real gravity) and moves at a constant speed along it, snapping exactly onto
  the target once within one step's distance. Ported as `tickJump`, now called every tick with
  the live `TargetX`/`TargetY` locals (previously only read once, as a start effect, so the
  target could never track anything moving) and `VelocityParam` (default 20).
- **`Breed` had three real gaps**: `BornX` never flipped sign with facing, so a pack authored
  assuming "spawn slightly behind me" (`lookRight ? x - BornX : x + BornX` in the real
  `breed()`) spawned every sibling on a fixed screen side regardless of which way the parent was
  actually facing. The sibling never inherited the parent's current facing
  (`setLookRight(getMascot().isLookRight())` in the same method) so it always started at the
  engine's default instead. And breeding fired the instant the behavior started rather than
  `getTime() == getAnimation().getDuration() - 1` — one tick before the whole birth animation
  finishes — so the sibling used to appear before its parent had even finished playing the birth
  pose.
- **The `LostGroundException` recovery from the first pass only covered `Move`**: the real
  `BorderedAction` base class behind `Move`, `Stay`, *and* `Animate` checks
  `getBorder().isOn(anchor)` identically in all three, so a `Stay`/`Animate` step glued to a
  wall or ceiling (e.g. `GrabWall`'s own `Stay`) can lose its border and should fall exactly
  like a climbing `Move` can — only `tickMove` had the check. `tickHold` (the `Stay`/`Animate`
  path) now shares the same check, run *before* advancing the pose rather than after, matching
  the real check-then-tick order.

Also confirmed, while reading `Regist.java` (`Resisting`, nested inside `Dragged`) for the above:
it has its own `hasNext()` (ends once the cursor moves more than 5px from the drag anchor) and
throws `LostGroundException` into a forced `Fall` once its own animation completes while the
cursor still hasn't moved. Left unported — this engine renders Dragged/Pinched/Resisting through
a separate live-preview path (`PackDriver.renderState`) that doesn't run the action interpreter
during an actual drag at all, so neither mechanic has a tick loop to hook into without a
structural change to how dragging is rendered. `Resisting` stays effectively unreachable, same
as before this pass — a documented gap, not a new one.

**A third pass, going systematically file-by-file through the entire real source tree** (not just
the pieces already touched — see `SOURCE_AUDIT.md` for the full per-file checklist this was
tracked against) turned up the single largest bug found so far:

- **Every multi-Pose `Stay`/`Animate` action was silently self-ending after one pass through its
  poses, ignoring any `Duration` override that was supposed to make it hold or cycle for
  longer.** The previous `tickHold` walked a `poseIndex` forward and stopped the instant it ran
  off the end of the array unless the action's XML had `Loop="true"` — but real packs *never* put
  `Loop=` on a `Stay`/`Animate` action (it's exclusively a `Sequence` concept, confirmed via a
  full-pack grep), so that check was always false and every multi-Pose hold ended after one
  linear pass no matter what `Duration` said. The real engine's rule (`ActionBase.hasNext()`:
  `time < Duration`, `Animate` adds `time < animation.getDuration()` on top; `Animation` itself
  always cycles by `time % totalDuration`) ties *termination* to elapsed time, completely
  decoupled from how many poses got shown. The real pack's own `SitAndDangleLegs` (4 poses,
  ~1.6s combined) is referenced with `Duration="500-600"` (20-24 seconds) expecting to cycle
  those 4 poses on a loop for the whole stretch — the old code played them once and moved on,
  roughly a 12-15x undershoot. `tickHold` now tracks total elapsed time and reuses the same
  `pickLoopingPose` modulo-cycling helper `tickEmbedded` already used, instead of a one-shot
  `poseIndex` walk.
- **`ThrowIE` was mapped to plain `Fall`, alongside `FallWithIE`, which was wrong**: unlike
  `FallWithIE` (which really does extend `Fall`), `ThrowIE.java` extends `Animate` — its own
  `tick()` never touches the mascot's position at all (`BorderType="Floor"`, a single
  `Velocity="0,0"` pose); in the real engine it only throws the *tracked window* out from under a
  mascot that stays put. Mapping it to `Fall` ran real falling physics on the mascot, which
  immediately "landed" again since it was already standing on the floor, cutting the held "threw
  it" pose short instead of holding it for its full duration. Now routed through `tickHold` like
  `Regist`, holding in place like the real class hierarchy says it should.

**A fourth pass through `script/`** — the real `#{...}`/`${...}` expression evaluator, the one
remaining subsystem that had never been checked against source (`Expression.ts` was originally
built from *observed patterns* in the XML rather than a source read) — found that the two
wrappers aren't just stylistic. Real conditions/values are compiled and run as actual JavaScript
(`Script.java`, via the JVM's own script engine), and `#{...}` re-evaluates fresh every tick while
`${...}` evaluates once and caches for the rest of the action's lifetime — a distinction our own
code had explicitly (and wrongly) written off as not mattering in practice. It didn't matter for
ActionReference parameters (Duration, TargetX, BornX, ...), which our engine already only
resolves once per action-start regardless of wrapper syntax — but it did matter for **which
Animation variant is showing**: the real `ActionBase.getAnimation()` re-picks the effective
(condition-true) variant fresh every tick, so an Animation-selection condition tied to live state
can swap poses mid-action without restarting it. The real pack's `SitAndLookAtMouse` does exactly
this — it picks "looking up" vs "looking down" by live cursor position, held for several hundred
milliseconds, long enough for the mouse to cross the threshold mid-hold. Our `chooseAnimation` was
only ever called once, at push time. Fixed by re-running it every tick in `tickHold`/`tickBreed`/
`tickEmbedded` (`tickMove` deliberately keeps its one-time selection — see its own comment for
why: no real pack's multi-variant `Move` needs live re-selection, and splicing mid-gait-cycle has
no obviously-correct answer).

**A fifth pass, prompted by a direct question — "if anything's still synthesized instead of a
real port, go rewrite it"** — went back through every remaining place the code admitted to
*guessing* rather than *knowing*, and found exactly one: a comment in `BehaviorAI.ts` next to
ChaseMouse's trigger logic, saying outright that there was "no ground truth available" for its
real cadence and that the periodic-cooldown eligibility there was an approximation. Rather than
leave that as accepted, went back to `Main.java` — which an earlier pass had written off entirely
as "Java-desktop-only, out of scope," itself a mistake — and found the actual mechanism:
**ChaseMouse has no autonomous trigger in the real engine at all.** It's exclusively bound to a
"Follow Mouse!" system-tray menu item (`getManager().setBehaviorAll("ChaseMouse")`), which forces
*every* mascot onto it at once, on demand — the same kind of manual, all-mascots command as
"Another One!"/"Reduce to One!" (both already ported faithfully as menu items, which is what made
the inconsistency worth chasing). The invented periodic/cooldown eligibility has been removed
entirely; a "Make all Shimejis follow the mouse" command and context-menu item now does the real
thing, forcing every mascot straight onto its pack's ChaseMouse behavior — the same primitive the
existing per-mascot "Set behavior" menu already used for one mascot at a time.

**A sixth pass finished reading the handful of files this tracker still had marked "not yet
audited"** (`environment/{Area,ComplexArea,Location,Environment}.java`, `config/Entry.java`) and
turned up the second-largest bug of the whole audit. `Location.java`'s `set()` — `dx = (dx +
(newX-x)) / 2`, an exponential smoothing of the raw per-tick cursor delta — **is**
`mascot.environment.cursor.dx/dy`, and the real pack's `Thrown` action reads it *directly* as its
release velocity (`InitialVX="${mascot.environment.cursor.dx}"`). Drag release here computed a
completely unrelated windowed average of the *drag's own* recent pointer samples, with a
`dragThrowScale` tuning constant the real engine has no equivalent of at all — replaced with a
faithful port of the real smoothing formula, computed once per fixed simulation tick against the
same ambient cursor tracker `cursor.x/y` and ChaseMouse already use, rather than a second,
independently-sampled one. The same file also settled something adjacent: real
`UserBehavior.mouseReleased()` unconditionally forces the `Thrown` behavior — there's no speed
threshold in the original at all — while this plugin branched between forcing "Fall" or "Thrown"
by comparing release speed against a tunable minimum. Releasing a drag now always forces `Thrown`,
matching the real engine exactly; the *native fallback* placeholder (which has no real engine
counterpart to be faithful to in the first place) keeps its own simpler two-state distinction for
its own visual variety. Getting this right surfaced one more thing worth calling out: applying the
fix correctly required *not* pre-converting the cursor velocity to pixels-per-second the way
everything else in the engine's own physics is expressed — pack-authored per-tick quantities
(Velocity, Gravity, a Fall's InitialVX/VY, ...) flow through the condition/expression system in
their original tick units and only become pixels-per-second at each one's own point of
consumption, so the runtime-computed cursor velocity has to follow the identical convention or it
gets converted twice.

**A seventh pass, prompted by another direct challenge — "is every file actually checked, file by
file?"** — read every remaining file that had only ever been categorized by name and role and
never actually opened: the Swing character-picker dialog, the AWT image-loading/mirroring
classes, the JNA/OS-native dispatch factory, logging setup, and the rest of `Main.java` beyond the
tray-menu section an earlier pass had already read. Nearly all of it confirmed exactly as
expected — pure GUI/logging plumbing with no mascot-behavior logic hiding inside, the same shape
as everything the fifth pass's `Main.java` scare had already trained suspicion on. But the rest of
`Main.java` turned up one more real bug: `createMascot()` creates every new mascot off-screen at a
fixed anchor, `(-1000,-1000)` — nowhere near any real on-screen position. What actually puts a
freshly spawned mascot somewhere visible is `UserBehavior.next()`'s off-screen-bounds recovery,
firing on the very next tick: relocate to a random x, drop it in from just above the top of the
screen, force `Fall`. This plugin had already ported that exact mechanism faithfully — but only
for its role as a *recovery* path (a mascot that drifts entirely off-screen mid-behavior), without
recognizing it doubles as the *only* real spawn mechanism there is. There is no such thing, in the
real engine, as a mascot that simply appears already standing in view — every one of them is
falling in from off the top of the screen at a random x, every time. Spawning here instead dropped
a new mascot in already inside the window, horizontally centered, at a fixed height chosen purely
so it wouldn't look clipped — a reasonable-sounding invented default, picked before this file had
ever been read in full. A manual spawn (the command, the "Add another Shimeji" menu item,
auto-spawn-on-load) now falls in from off-screen exactly like the original; Breed/duplicate, which
always specify their own exact parent-relative position, are unaffected. With this file-by-file
sweep done, every file in the real engine's source tree has now actually been opened and read —
Swing/AWT/JNA GUI plumbing included, not just the core simulation subset.

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
  event), `Dragged`/`Thrown` (mouse input), and `ChaseMouse` — declared `Frequency="0"` like the
  other three and never referenced by any other behavior's `NextBehavior`, so it's orphaned from
  the weighted-pool graph entirely in the real pack, same as them. Unlike the other three,
  though, its real trigger isn't physics or mouse input at all: it's a "Follow Mouse!"
  system-tray menu item (`Main.java`: `getManager().setBehaviorAll("ChaseMouse")`), forcing
  every mascot onto it at once, on demand — no autonomous/spontaneous trigger exists in the real
  engine. The "Make all Shimejis follow the mouse" command and context-menu item are that,
  faithfully; see the fifth audit pass below for how an earlier, invented periodic-cooldown
  approximation here got replaced.
- **Approximated, not literal**: the original engine tracks a specific external OS window
  ("activeIE" in its own naming, from its IE-integration history) that mascots can climb on;
  here that concept maps to whichever open pane the mascot is currently against — its top,
  either side, or its underside all count, matching a real pane's full bounding box (see the
  next point). The status bar only ever contributes a floor, not a climbable rect, since it's
  a thin strip rather than a tracked "window."
- **A pane's sides and underside are climbable too, not just its top**: auditing the real
  files for this turned up an entire category of authored behaviors —
  `HoldOntoIEWall`/`ClimbIEWall` (a pane's side), `ClimbIEBottom`/`GrabIEBottomLeftWall`/
  `GrabIEBottomRightWall` (hanging off its underside), plus pane-aware variants of
  `HoldOntoWall`/`FallFromWall`/`HoldOntoCeiling`/`FallFromCeiling` — that reference
  `mascot.environment.activeIE.leftBorder`/`rightBorder`/`bottomBorder.isOn(...)`, which were
  all hardcoded to `false`, so none of them could ever be selected. `computeLedgesFromRects`
  now emits wall/ceiling ledges for a pane's own left/right/bottom edges (not just its top as a
  floor), each carrying a back-reference to that pane's full rect so `activeIE.left/right/top/
  bottom/width/height` all resolve consistently to whichever *one* pane the mascot is
  currently against — floor takes precedence, then wall, then ceiling. A new
  `updateWallCeilingAdherence` keeps `currentWall`/`currentCeiling` fresh every tick,
  unconditionally (mirroring how gravity already keeps `currentFloor` fresh), since a mascot
  can end up against a wall from simply walking into one during an ordinary Floor-bordered
  action — it can't be limited to only running during an already-Wall/Ceiling-bordered action,
  or the condition that triggers climbing in the first place could never become true.
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
- **Settings-based authoring, not just XML editing**: a "Custom animations & reactions" editor
  (Settings → pick a character → **Edit...**) adds or overrides a character's own actions and
  behaviors — poses, Sequence/Select steps, Embedded handlers (Fall/Breed/Regist/Look/Jump/
  Offset/Dragged), and behavior transitions — without touching `actions.xml`/`behaviors.xml`
  directly. A custom entry with the same name as a standard one replaces it, and it's built
  into the exact same `ActionDef`/`BehaviorDef` shape the real XML parser produces (see
  `CustomContentBuilder`), so it runs through the identical interpreter rather than a separate
  code path. Auditing the real schema for this surfaced a small interpreter gap, now fixed: an
  unrecognized `Regist` embedded class (the real pack's struggle animation nested inside
  `Dragged`) was falling back to gravity instead of just holding its pose in place. (`Jump` was
  also flagged here as unrecognized at the time; that's fixed too, but as part of the physics
  rewrite below, not this interpreter-recognition pass — see the second audit pass above.)
- **Mobile**: dragging is already built on Pointer Events, which cover touch, and pack loading
  already goes through the cross-platform vault adapter API rather than Node's `fs`, so most
  of this needed no changes. The one real gap — no right-click on a touchscreen — is closed
  with a long-press: holding a mascot still opens its context menu the same way Obsidian's own
  mobile UI already uses touch-and-hold elsewhere, while an actual drag (the pointer moving
  before the hold fires) is unaffected and still starts immediately, matching desktop.
  `touch-action: none` and `-webkit-touch-callout: none` stop the browser's own scroll/pan
  gesture recognition and iOS's image-callout from competing with either gesture. ChaseMouse
  is force-disabled on `Platform.isMobile` regardless of its own setting — there's no ambient
  pointer between touches for it to dash toward, so it would just be heading for a stale,
  meaningless position; the setting itself is untouched and still applies normally if the same
  vault is later opened on desktop. Untested on a real device so far — the timer/event-lifecycle
  wiring here specifically couldn't be covered by the test suite (this repo's jsdom has no
  `PointerEvent`/`setPointerCapture` at
  all), unlike the drag mechanics below, which do have regression tests.
- **Fixed a real "fall through the floor" bug**: the check for "is the floor I'm standing on
  still there" only accepted a floor at-or-below the mascot's current position
  (`findFloorBelow`) — correct for catching an active fall, but wrong for re-validating an
  already-grounded mascot after the ledges change. Shrinking the Obsidian window (dragging its
  bottom edge up) moves the floor *up* past a mascot standing near the old bottom edge, so
  nothing qualified as "below" its stale position anymore and it fell through and kept falling
  forever, off-screen. `findNearestFloorAt` (direction-agnostic — closest floor at this x,
  above or below) is now used specifically for that re-validation, so a grounded mascot
  re-anchors to wherever its floor actually is now instead of falling through it.
- **Live console diagnostics** (`window.shimejiDebug` in Obsidian's DevTools console) for
  issues that are easy to trigger interactively but hard to reproduce blind:
  `stageCount()` (catches a leaked `Stage` instance from a previous reload still running
  alongside a fresh one), `hideOverlay()`/`showOverlay()` (toggles the full-window overlay live,
  to test whether its mere DOM presence — not just its own CSS — interferes with the OS
  title-bar drag), `elementsAtTop()` (what `document.elementFromPoint` actually finds along the
  top edge, including computed `pointer-events`/`-webkit-app-region`), `mascotRects()` (every
  live mascot's current bounding box, to catch one sitting over the title bar mid
  ceiling-walk), `dumpLedges()` (every currently-computed floor/wall/ceiling, for "why did it
  land/climb there" reports), and `setVerbose(true)` (a live trace of every landing and every
  behavior transition, tagged `[obsidian-shimeji]`, for chasing a specific "drop from height did
  something odd" repro). One issue this tooling helped catch: the window's own ceiling/walls
  used to be anchored at the literal top of the app's viewport, so wall-climbing and
  ceiling-walking (both authentic behaviors) could carry a mascot up onto the title bar/tab
  strip itself, rendered on top of it and capturing the clicks meant to drag or resize the
  window. Fixed by anchoring the ceiling to the top of Obsidian's actual workspace area instead,
  now read from the real `app.workspace.containerEl` API rather than a guessed CSS selector (see
  `SOURCE_AUDIT.md` Passes 11-12) — needs a live window to fully confirm, same as anything else
  in this list. A second, more serious issue this tooling helped catch: dragging a mascot and
  releasing it could skip the fall animation entirely and teleport it somewhere far from the
  release point. Root cause: the mascot's own drag handler calls `preventDefault()` on
  `pointerdown` (needed so touch-drag doesn't also scroll the page), which — per the Pointer
  Events spec — suppresses the browser's synthetic `mousemove` events for the rest of that drag.
  The plugin's shared ambient-cursor tracker (used for both ChaseMouse and a released mascot's
  throw velocity) listened for exactly that suppressed event, so it froze at the grab point for
  the whole drag and then saw one giant single-tick jump the instant it unfroze after release —
  baked directly into release velocity, easily large enough to cross the window in a handful of
  physics ticks. Fixed by tracking `pointermove` instead, which is never suppressed by another
  element's own `preventDefault()` (see `SOURCE_AUDIT.md` Pass 12).
- **Drag is now a direct port of the real engine's own `Dragged.java`, not an invented
  approximation**: several rounds of home-grown drag heuristics here (a critically-damped
  spring for position, then an extrapolated-cursor "lean pointer", then exponential smoothing
  on top of that) each fixed one symptom while introducing another — culminating in a drag
  that consistently leaned toward one side regardless of which way it was actually pulled.
  Pulling the actual source
  ([`Dragged.java`](https://github.com/logany20/shimeji-ee/blob/master/src/com/group_finity/mascot/action/Dragged.java),
  the Java class the real pack's `Pinched` action names as its `Class`) showed the real
  mechanism is simpler than any of that and not what was being approximated:
    - **Position has no lag or lerp at all**: every tick, the anchor is set to exactly
      `(cursor.x, cursor.y + 120)` — a fixed offset below the cursor (holding the sprite by the
      scruff of the neck, not by whatever pixel you clicked), snapped instantly, every time.
      There's no spring constant to tune because the original doesn't have one.
    - **The swing/lean effect is a *separate* variable, not derived from the position at
      all**: a `FootX` value trails the cursor via `footDx = (footDx + (cursor.x - footX) *
      0.1) * 0.8; footX += footDx` — a small, specific recurrence, run once per tick — and it's
      *that* lagging value, compared against the live (unlagged) cursor.x, that the real
      Pinched action's five poses are conditioned on. `tickDragFootX` ports this formula
      exactly (regression tests assert hand-computed values tick-for-tick, not just "looks
      plausible").
    - **`lookRight` (facing) is forced `false` unconditionally, every tick, for the entire
      drag** — the mascot never mirrors while being dragged, full stop, because the five
      Pinched images already encode their own left/right and mirroring on top of them was
      exactly the "always leans one side" bug.
  All of the invented machinery this replaced — a spring-based `tickDragged`, the
  velocity-extrapolating `computeLeanPointer`, and the `smoothSwing` damping added on top of
  that — is gone; there's nothing left to smooth once the lag lives in the same place the
  original puts it.
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

## Custom animations & reactions

You don't have to hand-edit XML to add a new animation or reaction: in **Settings → Shimeji
Desktop Mascot → Custom animations & reactions**, click **Edit...** next to a character to open
its editor.

- **Actions** are the animations — pick a type (Stay/Move/Animate/Sequence/Select/Embedded),
  a border (Floor/Wall/Ceiling, if it should stay glued to a real ledge), and either a list of
  poses (image + anchor + velocity + duration — the same units as actions.xml: 25 ticks ≈ 1
  second) or, for Sequence/Select, an ordered/conditional list of steps referencing other
  actions by name (standard ones or your own).
- **Behaviors** are the reactions — a name, a weighted frequency, an optional condition, and a
  list of possible next behaviors once it finishes.
- Conditions and param overrides use the same `#{...}`/`${...}` expression syntax as the real
  files (e.g. `#{mascot.environment.floor.isOn(mascot.anchor)}`), validated as you type.
- Saving takes effect immediately — every mascot currently wearing that character rebinds to
  the updated pack without needing to respawn.

A custom action/behavior with the same name as a standard one (or another custom one) replaces
it, exactly like editing that name's definition in `actions.xml`/`behaviors.xml` directly.

## Window mischief (experimental, off by default)

Real shimeji-ee mascots can grab the OS window they're standing next to, carry it along while
walking, and throw it — `WalkWithIE`/`RunWithIE`/`ThrowIE` in the real source, reachable
autonomously whenever a mascot ends up on the ground below and to the side of a recognized
window (real `Main.java`'s activeIE maps here to whichever pane the mascot is currently against —
see "Approximated, not literal" above). Obsidian panes aren't free-floating OS windows, so this
couldn't be a literal port, but it's not nothing either:

- **Carrying a window along while walking is reinterpreted as resizing the pane** instead of
  moving it — however far the mascot's own real walk physics moves it that tick is exactly how
  much the pane grows or shrinks, in whichever direction its own layout actually resizes (a
  side-by-side split resizes left/right, a stacked split resizes up/down — decided by the pane's
  real layout, not hardcoded). This leans on Obsidian internals that aren't part of the
  documented plugin API (confirmed working by reading the source of a real published plugin,
  [`obsidian-resize-split`](https://github.com/RyotaUshio/obsidian-resize-split), that does the
  same thing) — if a future Obsidian release changes them, resizing just quietly stops
  happening, nothing else breaks.
- **The throw itself is the real thing**: the pane pops into its own genuine OS window
  (`Workspace.moveLeafToPopout`, desktop only) and gets thrown with the *exact* real ballistic
  formula (`ThrowIE.java`'s own per-tick `InitialVX`/`InitialVY`/`Gravity`), driven by repeatedly
  moving that real window. A "Restore thrown windows" command/menu item (real `Main.java`'s
  "Restore IE!") brings every popped-out window back if one ends up somewhere inconvenient — the
  original has the exact same escape hatch for the exact same reason.
- **Off by default** (Settings → "Window mischief"), because unlike everything else this plugin
  does autonomously, this can resize your actual layout or spawn a separate OS window without
  asking first. Turn it on if you want the real chaos; the toggle is instant and reversible
  (resizing) or one click away from reversible (restore).
- **Genuinely untested, not just unverified-by-source** — see `SOURCE_AUDIT.md`'s "Open live-bug
  reports": both the undocumented resize API and whether Obsidian's Electron process actually
  lets a popped-out window be moved this way need a real desktop window to confirm, which this
  headless environment can't provide. Please report back if either one doesn't visibly do
  anything.

Alongside this, and *not* a port of anything — shimeji-ee has no concept of files or vaults at
all — **note mischief** (Settings → "Note mischief", also off by default) occasionally swaps in a
random other note from your vault while a mascot happens to be standing on the pane you're
actively working in. Purely for fun; nothing is lost (the file you were on is still there,
autosaved, one click of "back" away).

## Commands / UI

Real shimeji-ee actually has *two* separate menus, not one — the desktop tray icon (global,
every character) and each mascot's own right-click menu (`Mascot.java`'s own popup, scoped to
just that mascot's character for "Reduce to One!"/"Follow Mouse!" specifically — genuinely
different real methods, `Manager.remainOne()`/`setBehaviorAll(...)` vs. their `imageSet`-scoped
overloads, not the same feature duplicated). This plugin mirrors that split: commands are the
global/tray equivalent, the per-mascot context menu is character-scoped where the original is.

- Ribbon icon (cat): removes every mascot if any are on screen, otherwise spawns the
  auto-spawn count.
- Commands (global, matching the tray icon): "Spawn mascot" (random character, falling in from
  off-screen at a random x with random initial facing — real `Main.createMascot()`'s own
  `Math.random() < 0.5`, not always facing right), "Remove mascot" (the most recently spawned
  one), "Remove all mascots", "Reduce to one mascot" (keeps the *oldest* one, every character),
  "Make all mascots follow the mouse", "Restore thrown windows" (see "Window mischief" above),
  "Rescan pack folder" (re-reads the pack folder after you add/change files).
- Right-click a mascot for its own menu (matching the real per-mascot popup, plus "Switch
  character" — a plugin-only convenience with no real analog, since a real mascot's character is
  fixed for its lifetime): add another *of this character* (real per-mascot "Another One!" —
  an otherwise perfectly ordinary fresh spawn, off-screen/random-facing exactly like "Spawn
  mascot" above, just forced to this mascot's character instead of a random one — not an offset
  duplicate standing next to it, which was this menu slot's behavior until checking turned up
  that it didn't actually match anything real), remove it, remove everyone, reduce *this
  character* to one (keeps the *newest* mascot of that character — the real per-character
  overload keeps the opposite end from the global command above, confirmed by reading both, not
  assumed symmetric), make *this character* follow the mouse, switch its character, jump it straight to
  a named behavior, restore thrown windows, or open plugin settings.
- Settings: pack folder + rescan; per-character on/off toggles under **Characters** (a new
  mascot picks randomly among the ones turned on); a **Custom animations & reactions** editor
  per character (see above); population controls (spawn/remove-all buttons, max mascots on
  screen, auto-spawn on startup and how many); behavior toggles (allow dragging, allow
  breeding, chase-the-mouse, window mischief, note mischief — see above); size; whether
  panes/status bar count as extra ledges; and a debug overlay that draws the ledges mascots
  currently think they can stand on.

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
