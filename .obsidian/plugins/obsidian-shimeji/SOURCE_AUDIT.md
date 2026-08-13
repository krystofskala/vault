# Source audit tracker

Working checklist for auditing this plugin's engine against the real shimeji-ee Java source
(`com.group_finity.mascot.*`), file by file. This is a working document for whoever (human or
Claude) picks this up next — it is not user-facing; see `README.md` for the polished narrative
of what's ported and why. Update this file as you go instead of re-deriving status from scratch
or from conversation memory each session.

**Golden rule established this session**: never guess/invent physics or timing. Pull the actual
Java source and read it before changing or claiming anything about "real" behavior.

## Getting the real source

`WebFetch` paraphrases/summarizes Java source instead of returning it verbatim — unusable for an
exact port. Fetch real bytes instead.

### Ground truth (updated 2026-08-13): `DalekCraft2/Shimeji-Desktop`

Kilkakon is the actual current maintainer of shimeji-ee — active as of an August 2025 Patreon
post — but has no public git repo of his own; he distributes via kilkakon.com/shimeji and
Patreon only. `logany20/shimeji-ee` (the source used for every audit pass through Pass 10, see
below) turned out to be from an **older, divergent lineage that stops before Kilkakon's
v1.0.14** — it is missing an entire subsystem (Affordances, Scan actions, BreedMove/BreedJump,
Transients — the real mechanism behind mascot-to-mascot targeting) that ships in Kilkakon's
actual current releases.

`DalekCraft2/Shimeji-Desktop` contains isolated, individually-verifiable commits that import
Kilkakon's own unmodified source, version by version. Use these as ground truth going forward:

| Commit    | Contents                                              |
|-----------|--------------------------------------------------------|
| `e5616e5` | "Import the source of the original Shimeji Desktop" — a pristine, zero-third-party-modification snapshot of Kilkakon's source at **v1.0.19** (280 files, all pure additions — confirmed via `git show --stat` and `kilkakon.txt` inside the commit) |
| `1fc2bf6` | Merge changes from version 1.0.20 |
| `025e49e` | Merge changes from versions 1.0.21 and 1.0.21.1 |
| `6f6ce4b` | Merge changes from 1.0.21.2 |
| `8eda881` | Merge changes from 1.0.21.3 |
| `16ee0e8` | Merge changes from 1.0.22 (current tip as of this audit) |

Each version-merge commit's diff-stat was checked against `kilkakon.txt`'s own changelog entry
for that version and touches only the files that entry describes — these are genuinely
Kilkakon's own diffs, not a third party's reinterpretation.

```bash
# Full tree, deep history (needed to find the isolated version-import commits above):
git clone --depth 1 --filter=blob:none --sparse https://github.com/DalekCraft2/Shimeji-Desktop.git <dest>
cd <dest> && git sparse-checkout set --no-cone '/*'
git fetch --deepen=500 origin main   # shallow clone only shows 1 commit until deepened

# One file at a specific version:
curl -sS "https://raw.githubusercontent.com/DalekCraft2/Shimeji-Desktop/<commit>/src/main/java/com/group_finity/mascot/<path>.java"
```

**Package root differs from the old fork**: `src/main/java/com/group_finity/mascot/` (Maven
layout), not `src/com/group_finity/mascot/`. 119 Java files at the current tip vs. 68 in
`logany20` — 39 action classes vs. 18. New top-level packages `platform/` (cross-platform OS
abstraction) and `sound/`. The in-tree `kilkakon.txt` is Kilkakon's own versioned changelog
(v1.0.5 through v1.0.22) — read it first when investigating what changed and when.

A clone lives in scratchpad at `shimeji-desktop-latest/` (827 commits on `main` after
deepening) — re-clone with the commands above if it's gone; ephemeral scratchpad doesn't
survive between sessions.

**What this means for prior audit passes**: everything ported through Pass 10 was verified
against `logany20/shimeji-ee`. That fork is a reasonably faithful mirror of Kilkakon's source
*up through where it diverges* (roughly v1.0.13-era) — classes it shares with the new source
(`Mascot.java`, `Move.java`, `Fall.java`, the core physics/behavior loop, etc.) don't need
re-verification just because the ground truth moved. But treat any *specific* claim from an old
pass as unverified against post-1.0.13 evolution until re-checked — e.g. `Breed.java`'s own API
changed shape (params like `BornBehavior` became `BornBehaviour`) between the two lineages. New
work should read from `DalekCraft2/Shimeji-Desktop` first; fall back to `logany20/shimeji-ee`
(still cloned at `shimeji-ee-full/` in scratchpad) only for cross-checking or history.

### Superseded: `logany20/shimeji-ee` (primary source through Pass 10)

```bash
curl -sS "https://raw.githubusercontent.com/logany20/shimeji-ee/master/src/com/group_finity/mascot/<path>.java"
git clone --depth 1 --filter=blob:none --sparse https://github.com/logany20/shimeji-ee.git <dest>
cd <dest> && git sparse-checkout set src/com/group_finity/mascot
```

Still useful as a second, independently-sourced reference for the pre-1.0.14 core it does cover
(confirmed via `AnimationBuilder.java` and cross-checked against `gil/shimeji-ee`, itself
"based on Kilkakon's v1.0.13" per its own README). A prior partial checkout also lives in
scratchpad at `shimeji-src/` (hand-picked files, curl'd one at a time); the full sparse clone at
`shimeji-ee-full/` supersedes it.

## Status legend

- ✅ **Ported & verified** — read the real source, confirmed our TS matches (or matches with a
  deliberately-documented simplification).
- 🐛 **Bug found & fixed** — read the source, found a real divergence, fixed it, tested it.
- 📖 **Reviewed, no action** — read the source, it's pure structural/interface plumbing or dead
  code in the original with no behavioral consequence either way.
- ⛔ **Out of scope** — Java-desktop-only concern (Swing UI, JNA/OS native bridge, AWT image
  loading, app lifecycle) with no analog in an Obsidian plugin. Not a gap, just not applicable.
- ❓ **Not yet audited** — haven't read this file this project, or only inferred its behavior
  from callers/tests rather than reading it directly.

## `action/`

| File | Status | Notes |
|---|---|---|
| `Action.java` | 📖 | Bare interface (`init`/`hasNext`/`next`). Nothing to port. |
| `ActionBase.java` | ✅ | `hasNext()` = `Condition && time < Duration` (Duration default ≈ ∞) for *every* action. This is where the tickHold rewrite (2026-08-12) came from. Also: `getAnimation()` re-walks the variant list fresh *every single call* (called from inside `tick()`, i.e. every tick) rather than once — combined with `#{...}`'s per-tick cache-clear (see `script/Script.java`), this means condition-gated Animation variants can switch mid-action. Missed on the first read, caught on a second pass — see Pass 4. |
| `Animate.java` | ✅ | Adds `time < animation.getDuration()` on top of ActionBase — self-caps at one pose cycle. Now correctly modeled in `tickHold` (`selfCapsAtOneCycle`). |
| `BorderedAction.java` | ✅ | `LostGroundException` thrown identically by Move/Stay/Animate when their border vanishes mid-action. Ported as `isBorderLost`, shared by `tickMove` and `tickHold`. |
| `Breed.java` | ✅ | Extends `Animate` (self-caps). `breed()` at `time == animation.duration-1`, BornX sign-flips by facing, sibling inherits parent's facing. All ported. **Re-checked in Pass 10 specifically for proximity/distance dependence** (prompted by a direct question: does breeding depend on how close two *existing* mascots are?) — it doesn't. `breed()` only ever reads `getMascot().getAnchor()` (itself) and offsets by BornX/BornY; there is no `getMascots()`/distance/nearby concept anywhere in the condition or variable system (`VariableMap`/`MascotEnvironment`) at all. A new sibling is entirely self-generated by the breeding mascot, never gated on or aware of any other mascot's position. |
| `ComplexAction.java` / `Select.java` / `Sequence.java` | ✅ | `seek()`-driven child selection confirmed structurally equivalent to `tickSequence`/`tickSelect`. Per-child `Condition` comes from `ActionBase.hasNext()`, not a separate mechanism — matches `evaluateCondition(ref.condition, ctx)`. `Loop=` is a **Sequence-only** XML attribute in every real usage (confirmed via full-pack grep) — never used on Stay/Animate, which is exactly the wrong assumption the old `tickHold` was making before the 2026-08-12 fix. |
| `Dragged.java` | ✅ | Fully ported earlier this session (`tickDragFootX`, fixed anchor offset, no lerp). |
| `Fall.java` | ✅ | Wall-termination, per-tick facing update, real resistance/gravity defaults (0.05/0.1/2) all ported. Sub-pixel "HACK IE" stepping loop deliberately not ported (guards against a fast-moving *tracked window*, not applicable to stable panes). |
| `FallWithIE.java` | ✅ | Extends `Fall`. Its own `moveActiveIE` snaps the window to the mascot's current anchor every tick (an absolute "glue the window to my feet" recompute, not an accumulated delta) — this specific phase is a brief, `Velocity="0,0"` grab/attach pose, so that snap never actually moves anything in practice; the pane only starts changing once `WalkWithIE` begins actually walking (see its own row and Pass 8). Mapping the mascot's own physics to plain `Fall` remains correct. |
| `InstantAction.java` | ✅ | `apply()` once at `init()`, `hasNext()` permanently false after. Matches `frame.instantComplete` (Look/Offset). |
| `Jump.java` | ✅ | Constant-speed direction-vector recomputed every tick, not gravity. Ported as `tickJump`. |
| `Look.java` | ✅ | Default `LookRight` is *toggle current facing*, not face-the-cursor. Fixed. |
| `Move.java` | ✅ | Confirmed via direct read 2026-08-12 (previously only inferred). Per-tick facing re-check while moving toward TargetX is a no-op for us since TargetX is fixed for a Move's lifetime (facing can't flip back mid-move) — start-once is equivalent. Target-snap-then-continue-one-more-tick vs our immediate-stop-on-crossing: already documented as a deliberate minor timing difference in README. |
| `Offset.java` | ✅ | Plain unconditional `(x+X, y+Y)`, never flipped by facing. Confirmed matches. |
| `Regist.java` | ✅ | Extends `ActionBase` directly (not Animate) — real "hold forever absent Duration" default is actually *correct* for it, unlike Breed/ThrowIE. Own `hasNext()` (cursor within 5px) and tick()-thrown `LostGroundException` are architecturally unreachable here (Dragged/Resisting render via a separate live-preview path with no interpreter tick during a drag) — documented dead path, not silently dropped. |
| `Stay.java` | ✅ | No extra cap beyond ActionBase — holds/cycles until Duration/Condition end it. This is the half of the 2026-08-12 tickHold bug that mattered most (multi-Pose Stay actions were self-ending after one pass instead of holding). |
| `ThrowIE.java` | 🐛 | **Extends `Animate`, not Fall.** Its own `tick()` never touches the mascot's position — `BorderType="Floor"`, single `Velocity="0,0"` pose — it only throws the *tracked window*: `moveActiveIE(activeIE.left ± InitialVX, activeIE.top + InitialVY + time*Gravity)`, called every tick, sign of the x term by facing. Was wrongly mapped to plain `Fall` (ran real falling physics on the mascot, which immediately "landed" again since it was already grounded, cutting the held pose short). Fixed 2026-08-12: routed through `tickHold` like Regist, added to the `selfCapsAtOneCycle` check like Breed. The window-throwing side effect itself — genuinely absent at the time of that fix — is now ported too, see Pass 8: `tickThrowIE` runs this exact formula against a real popped-out Obsidian window via `PaneActions.beginThrow`, gated behind the (default-off) "Window mischief" setting. |
| `WalkWithIE.java` | ✅ | Extends `Move`, adds IE-window-drag + IE-position-consistency `LostGroundException` checks: every tick, `moveActiveIE` snaps the window's position to the mascot's current anchor (offset by IeOffsetX/Y) — an absolute recompute from live position, not an accumulated delta, "the window is glued to my feet as I walk." An Obsidian pane can't be freely repositioned like an OS window (no analog for *that* exact mechanic — confirmed, see NativeFactory's row below), so Pass 8 reinterprets "carrying" as resizing instead: `tickWalkWithIE` forwards the mascot's own per-tick walk delta (identical physics to plain `Move`, which the mascot-position mapping already correctly used) to `PaneActions.resizeBy`. This is a deliberate Obsidian-native adaptation, not a literal port — see PaneActions.ts's own comment. |

## `animation/`

| File | Status | Notes |
|---|---|---|
| `Animation.java` | ✅ | `getPoseAt(time % totalDuration)` — always cycles by construction; termination is entirely the outer Action's job. This is the other half of the tickHold rewrite (`pickLoopingPose` already did this correctly for tickEmbedded; tickHold now uses it too instead of a linear poseIndex walk). |
| `Pose.java` | ✅ | `anchor.x += (lookRight ? -dx : dx); anchor.y += dy`. Confirmed matches our `physics.x += velocity.x * -facing * dt` sign convention. |

## `behavior/`

| File | Status | Notes |
|---|---|---|
| `Behavior.java` | 📖 | Bare interface, also declares `mousePressed`/`mouseReleased` (real engine routes mouse events through the active Behavior, not Mascot directly — we wire pointer events at the Mascot/PackDriver level instead, a reasonable adaptation). |
| `UserBehavior.java` | 🐛 | `next()`'s off-screen recovery (respawn + forced Fall), `catch (LostGroundException)` → forced Fall. Both ported. Also: `mouseReleased()` is `buildBehavior(BEHAVIORNAME_THROWN)`, unconditionally — no speed threshold, ever. Ours branched between forcing "Fall" or "Thrown" by a `minThrowSpeed` comparison; fixed in Pass 6 — `PackDriver.notifyReleased` now always forces "Thrown" (the *native-fallback* placeholder state machine, which has no real equivalent to be faithful to, keeps its own simpler two-state distinction). |

## `config/`

| File | Status | Notes |
|---|---|---|
| `ActionBuilder.java` | ✅ | `createVariables`: own params first, ActionReference-site overrides second (override wins). Matches our `locals` merge order. Type dispatch table (Move/Stay/Animate/Sequence/Select/Embedded) matches `KNOWN_TYPES`. |
| `ActionRef.java` | 📖 | `buildAction(params)` lets a ref's own params override an incoming caller map, but every real call site (`createActions()`) always passes an empty map — no observable effect in any real pack. Config-loader-internal, not user-visible. |
| `AnimationBuilder.java` | ✅ | Confirmed schema match (Velocity/ImageAnchor parsing) — this is what resolved the early `NextBehaviorList` vs `NextBehavior` naming worry. |
| `BehaviorBuilder.java` | ✅ | `Add` attribute default (false if the wrapper element exists, true if it doesn't) — confirmed our `BehaviorsParser.ts` already modeled this correctly. |
| `Configuration.java` | ✅ | `buildBehavior()`: NextBehavior gated only by its own condition (not the target's top-level condition — this was the pickNextBehavior bug, fixed), `totalFrequency==0` respawn recovery (fixed). |
| `Entry.java` | ✅ | Confirmed: a thin, lazily-memoized DOM wrapper (`getAttribute` via `getAttributeNode` specifically, so a genuinely-missing attribute reads as `null` — a workaround for the old W3C Java DOM binding's own `getAttribute` returning `""` instead; the browser DOM's native `Element.getAttribute` already returns `null` for a missing attribute, so we get the same correct result for free, no workaround needed on our side). No behavioral logic beyond what its callers already assumed. |
| `IActionBuilder.java` | 📖 | Bare interface (`validate`/`buildAction`). |

## `environment/`

| File | Status | Notes |
|---|---|---|
| `Area.java` | ✅ | Confirmed: `left/top/right/bottom` plus `dleft/dtop/dright/dbottom` (how much each edge moved since the last `.set()`) — exactly what `Wall`/`FloorCeiling.move()`'s already-declined-to-port proportional-rescale math consumes. Confirms that earlier decision was based on accurate understanding, nothing new. |
| `Border.java` | ✅ | Two-method interface (`isOn`/`move`) — matches our `Ledge` predicate + (deliberately unported) `move` proportional-rescale concept. |
| `ComplexArea.java` | ✅ | Confirmed: purely multi-monitor plumbing (a named collection of `Area`s keyed by OS display device ID, with a genuinely clever cross-monitor continuity trick in `getLeftBorder`/`getRightBorder` — walking off one screen's edge onto an adjacent screen's matching edge treats them as one continuous surface). Zero analog in a single-viewport Obsidian plugin; confirms `MascotEnvironment`'s multi-monitor concepts are correctly out of scope, not an oversight. |
| `Environment.java` | ✅ | Confirmed load-bearing, not just geometry plumbing: `this.cursor = new Location(); ... tick() { ...; this.cursor.set(getCursorPos()); }` — this is the real source of `mascot.environment.cursor.dx/dy`, and it's genuinely used by the standard pack (`Thrown`'s `InitialVX="${mascot.environment.cursor.dx}"`), not dead. See `Location.java` below — this is where Pass 6 came from. |
| `FloorCeiling.java` / `Wall.java` | ✅ | `move()`'s proportional-rescale-relative-to-a-moving-border math, deliberately not ported (our `findNearestFloorAt` re-snap approximates the same intent for a fundamentally different multi-pane model). |
| `Location.java` | 🐛 | `set(Point)`: `dx = (dx + (newX-x)) / 2` — an exponential smoothing of the raw per-tick pixel delta, called once per `Environment.tick()` (40ms). This **is** `mascot.environment.cursor.dx/dy`, and real `Thrown` reads it directly as release velocity (see `action/Thrown`'s `ActionReference` in actions.xml). Our old `computeReleaseVelocity` used an unrelated windowed-average of the *drag's own* pointer history, with a `dragThrowScale` tuning knob the real engine has no equivalent of. Fixed — see Pass 6. |
| `MascotEnvironment.java` | ✅ | Facing-dependent activeIE-vs-workArea border selection with `ignoreSeparator`/multi-monitor concepts. Judged too architecturally different from our N-pane model to port further — accepted, documented simplification (see README "Approximated, not literal"). |
| `NotOnBorder.java` | ✅ | Null-object "no border" (`isOn` always false). Matches our `undefined`-returning conventions. |

## `script/` (the `#{...}`/`${...}` expression language)

| File | Status | Notes |
|---|---|---|
| `Constant.java` | ✅ | Trivial literal wrapper (`get()` always returns the same stored value). Matches `parseParamValue`'s literal branch (number/bool/string). |
| `Script.java` | 🐛 | **`#{...}` and `${...}` are not the same thing** — real conditions/values are compiled and run as actual JavaScript (`ScriptEngineManager`/`"text/javascript"`, i.e. Nashorn), not a custom mini-language. `#{...}` (`clearAtInitFrame=true`) re-evaluates fresh every tick (`initFrame()` clears its cached value); `${...}` (`clearAtInitFrame=false`) evaluates once and stays cached for the rest of the action's lifetime. Our `Expression.ts` treated the two wrappers as pure syntax sugar (see the now-corrected comment that used to sit above `EXPR_WRAPPER`) — for **locals** (Duration/TargetX/BornX/...) this was accidentally fine, since `resolveLocals` already only runs once per `pushAction` regardless of syntax, matching `${...}`'s semantics by construction. For **Animation-variant selection** it wasn't: real `ActionBase.getAnimation()` re-walks the condition list fresh every tick (see the `action/ActionBase.java` row), which is precisely what `#{...}`'s per-tick cache-clear is *for*. Fixed 2026-08-12 — see Pass 4 below. |
| `Variable.java` | ✅ | `Variable.parse()`: `${...}` → `Script(clearAtInitFrame=false)`, `#{...}` → `Script(clearAtInitFrame=true)`, anything else → `Constant`. This is the dispatch the Pass 4 fix is based on. |
| `VariableMap.java` | ✅ | Implements `javax.script.Bindings` — this *is* the scope object the compiled JS runs against, which is how `mascot.anchor.x` in a condition ends up calling the real `Mascot`/`MascotEnvironment` Java getters via Nashorn's JS↔JavaBean property bridging. Confirms our custom recursive-descent parser (`Expression.ts`) is a deliberate, security-motivated divergence, not just a stylistic one: literally `eval()`/`new Function()`-ing pack-supplied script text would be an arbitrary-code-execution surface here in a way it isn't for the original desktop app (a Java process already has full OS access; an Obsidian plugin evaluating untrusted third-party pack content does not currently, and shouldn't gain it just to save writing a parser). Our restricted grammar (literals/paths/calls/unary/binary/ternary — no statements, no assignment, no arbitrary global access) is the correct adaptation, not a corner cut. |

Cross-checked every function call actually used across `actions.xml`/`behaviors.xml`'s real conditions (`Math.abs`, `Math.min`, `Math.random`, and every `...isOn(...)` predicate on `floor`/`ceiling`/`workArea.*Border`/`activeIE.*Border`) against `RuntimeContext.ts`'s `call()` — all present. `Math.random` deliberately routes through the engine's own seeded `Random` instead of the real `Math.random()`, for reproducible tests — consistent with the rest of the engine.

## `Manager.java` / `Mascot.java` (root)

| File | Status | Notes |
|---|---|---|
| `Manager.java` | 🐛 | Fixed 40ms tick (matches `ENGINE_FIXED_TICK_MS`), pending-add/remove buffering (Java concurrent-collection safety, irrelevant to single-threaded JS), two-phase tick-then-apply over all mascots. One confirmed-harmless divergence: a Breed-spawned sibling pushed onto `Stage.mascots` mid-iteration gets its own `simulate()` call in the *same* tick it's born (JS `for...of` observes live array growth; real Manager defers new mascots to the next tick via its `added` set). Fully-initialized by the time this happens, so not a crash risk — just one 40ms-early tick for a newborn. Not worth chasing. **`remainOne()`/`remainOne(imageSet)` — found genuinely missing in Pass 9, not just "already covered" as Pass 5 had incorrectly claimed.** `remainOne()` (no filter, tray's "Reduce to One!") keeps the mascot at index 0 (oldest) and disposes every other mascot regardless of character — a *third*, distinct population primitive from `disposeAll()` ("Bye Everyone!", zero left) that had been conflated with it. `remainOne(imageSet)` (the per-mascot menu's own "Reduce to One!", see `Mascot.java` row) is scoped to that mascot's character *and keeps the opposite end* — it scans backward from the newest mascot and keeps the first (i.e. newest) one matching `imageSet`, disposing only older matches; non-matching mascots are untouched. Confirmed by reading both loop bodies literally — the asymmetry is real, not a misreading. Both now ported: `Stage.removeAllButOne(matches?)`. |
| `Mascot.java` | 🐛 | `tick()`/`catch (LostGroundException)`, breed/facing plumbing all previously audited and ported. **Missed until Pass 9: `showPopup()` builds a second, complete right-click menu**, separate from the tray's — "Another One!" (this character specifically, not random), "Bye Bye!", "Follow Mouse!", "Reduce to One!", "Restore IE!", a Behaviors submenu, "Bye Everyone!". The last four are shared verbatim with the tray menu *by name*, but "Follow Mouse!" and "Reduce to One!" here call character-scoped overloads (`setBehaviorAll(config, name, imageSet)`, `remainOne(imageSet)`) — genuinely different from the tray's own global ones, not the same feature shown twice. See `Manager.java` row and Pass 9. |
| `Main.java` | 🐛 | **Wrongly written off wholesale as "Java-desktop-only" on the first pass — it isn't.** Its AWT/Swing tray-icon *construction* is out of scope (no Obsidian analog needed), but the menu-item wiring inside it is the real ground truth for how several behaviors actually get triggered. `getManager().setBehaviorAll("ChaseMouse")`, bound to a "Follow Mouse!" tray item, is the *only* way ChaseMouse ever runs in the real engine — no autonomous/spontaneous trigger exists at all. See Pass 5. Read in full in Pass 7 (previously only the tray-menu slice had been read): `createMascot(String)` sets the fresh mascot's anchor to a fixed off-screen point `(-1000,-1000)`, never anything on-screen — it's `UserBehavior.next()`'s off-screen recovery (already ported, see `behavior/UserBehavior.java` row) that actually relocates it, on the mascot's very next tick, to a random x above the screen top and forces Fall. Every real mascot's first visible moment is falling in from off the top of the screen at a random x; there is no separate "appears already standing in view" spawn behavior at all. Our `Stage.spawnMascot` invented one anyway (fixed centered x, fixed y=160) before this file was read in full — fixed, see Pass 7. Also confirmed: the no-arg `createMascot()` random-pack-selection (`(int)(length*Math.random())`) already matches our pre-existing `pickPackId()` exactly — no change needed there. **Pass 5's claim that `remainOne()` "already has a faithful analog in our own 'Remove all Shimejis'" was wrong and went unchecked until Pass 9 — see `Manager.java` row.** **Pass 10: `createMascot(String)` also unconditionally randomizes facing — `mascot.setLookRight(Math.random() < 0.5)` — for *every* fresh top-level mascot, tray or per-mascot "Another One!" alike (both funnel through this exact method, just with a random vs. forced `imageSet`). Missed until directly challenged on it; every manual/auto spawn here had silently always defaulted to facing right. Now ported: `Stage.spawnMascot`'s fresh-spawn path (`spawningFresh`) randomizes `physics.facing` via the same `Random.chance(0.5)` used elsewhere.** |

## Out of scope (⛔ — Java-desktop-only, no Obsidian analog)

Every file below has now actually been opened and read (Pass 7 closed out the last batch that had
only been categorized by name/role — see the changelog). All confirmed harmless: pure Swing/AWT
GUI construction, JNA/OS-native bridging, or logging setup, with no mascot-behavior logic hiding
inside any of them the way `Main.java` turned out to have.

- `exception/*.java` (7 files) — plain `Exception` subclasses, message/cause constructors only, no
  fields, no logic; `LostGroundException` doesn't even have a message constructor, just a bare
  signal type, matching our own `lostGroundFlag` boolean.
- `NativeFactory.java` — reflection-based platform dispatch (`Class.forName(...".win."/".generic."
  + "NativeFactoryImpl")`) to the actual OS-specific `Environment`/native-window implementation.
  That implementation class **is not present anywhere in this source mirror** (sparse-checkout
  only pulls `com/group_finity/mascot/`, and the win/generic subpackages it dispatches to aren't
  under it) — there is genuinely nothing further to read here; this *strengthens* rather than
  weakens the already-documented decision that activeIE/tracked-window tracking is architecturally
  out of scope (`environment/MascotEnvironment.java` row), since the real mechanism isn't just
  "too different to port," it's unavailable to audit against at all in this mirror.
- `LogFormatter.java` — pure `java.util.logging.Formatter` subclass, string formatting only.
- `editor/action/ActionEditorFrame.java` — an empty `JFrame` stub for a *separate* Swing GUI tool
  for authoring packs; our `CustomContentModal` is the analog, not a port target.
- `image/NativeImage.java`, `image/TranslucentWindow.java` — bare marker/rendering interfaces, no
  logic.
- `image/ImagePair.java`, `image/ImagePairs.java`, `image/MascotImage.java` — plain data holders
  plus a static load-cache hashtable.
- `image/ImagePairLoader.java` — genuinely worth a note, not just "confirmed harmless": mirroring
  is a **one-time, load-time, per-pixel bitmap flip** (`flip(BufferedImage)`), cached alongside the
  original, with the anchor point recomputed for the flipped image as `width - center.x` (y
  unchanged). Cross-checked this is mathematically equivalent to our own approach in
  `Mascot.ts`'s `render()` (CSS `transform-origin` set to the anchor itself, then `scaleX(-1)`
  around that origin) — both keep the anchor pinned at `(physics.x, physics.y)` regardless of
  facing, just via a baked bitmap vs. a live CSS transform. No code change; a real confirmation,
  not an assumption.
- `imagesetchooser/ImageSetChooser.java`, `imagesetchooser/ImageSetChooserPanel.java`,
  `imagesetchooser/ShimejiList.java` — the startup "which packs to load" Swing dialog (two-column
  `JList` picker + a flat `./ActiveShimeji` config file for persisting the selection) and its
  supporting cell-renderer/panel classes. Our settings UI (`activePackIds`, persisted via
  Obsidian's own settings storage) is the direct functional analog — already existed, already
  correct, nothing to port.
- `menu/JLongMenu.java`, `menu/MenuScroller.java` — Swing popup-positioning and a well-known
  public-domain `JPopupMenu`/`JMenu` scroll utility. Our Obsidian-native context menu is the
  analog; zero mascot-behavior relevance in either (588-line `MenuScroller.java` read in full to
  be sure).

## Bugs found & fixed, by pass

1. **Pass 1** (commit `edcbbad`): pickNextBehavior double-condition bug, missing zero-eligibility
   respawn recovery, missing off-screen recovery, `weightedPick` over-complication, Fall not
   ending on wall contact, Fall not updating facing, Fall's wrong resistance/gravity defaults,
   missing LostGround-equivalent for Move.
2. **Pass 2** (commit `c7195ed`): Look's wrong default (face-cursor → toggle), Jump's wrong
   physics model (ballistic arc → constant-speed vector), Breed's missing BornX sign-flip /
   facing-inheritance / near-end timing, missing LostGround-equivalent for Stay/Animate.
3. **Pass 3** (commit `b73d80e`): `tickHold` rewritten from a linear poseIndex walk to a
   duration-driven, modulo-cycling model — fixes every multi-Pose Stay/Animate action that was
   self-ending after one pass instead of holding/cycling for its real Duration (e.g.
   SitAndDangleLegs: 4 poses ~1.6s combined, held open by a `Duration="500-600"` i.e. 20-24s
   override that was being silently ignored — a ~12-15x undershoot). `ThrowIE` was found mapped
   to plain Fall (wrong — it extends Animate and never touches the mascot's position at all); now
   holds its pose like Regist. This file (`SOURCE_AUDIT.md`) was created in this pass too.
4. **Pass 4** (commit `d46ffe8`): reading `Script.java`/`Variable.java` turned up the real
   `#{...}` (live, re-evaluated every tick) vs `${...}` (evaluated once, cached for the action's
   lifetime) distinction our `Expression.ts` had explicitly (and wrongly) documented as
   "nothing depends on the difference." It matters for Animation-variant selection: real
   `ActionBase.getAnimation()` re-picks the effective (condition-true) variant fresh every tick,
   so a condition depending on live state (e.g. SitAndLookAtMouse's `cursor.y < screen.height/2`,
   held for several hundred ms — long enough for the mouse to cross the threshold mid-hold) can
   swap poses mid-action without restarting it. `chooseAnimation` was only ever called once, at
   push time. Added a `currentPoses()` helper that re-runs it every tick, wired into
   `tickHold`/`tickBreed`/`tickEmbedded`; `tickMove` deliberately keeps its one-time selection
   (see its own comment — no real pack's multi-variant Move needs live re-selection, and
   splicing mid-gait-cycle has no obviously-correct answer). Locals (Duration/TargetX/BornX/...)
   were already correct by construction, since `resolveLocals` already only runs once per
   `pushAction` regardless of which wrapper the XML used.
5. **Pass 5** (commit `1c82883`) — prompted by a direct challenge ("if we've still got
   synthesized code instead of a real port, go rewrite it"): re-examined every remaining
   *invented* (not source-verified) piece of behavior, which turned up exactly one, clearly
   self-flagged in this file's own `script/` table row before this pass: ChaseMouse's "no ground
   truth for its trigger cadence, so this is a periodic-cooldown guess" comment in `BehaviorAI.ts`.
   Went back to `Main.java` — previously written off wholesale as "Java-desktop-only, out of
   scope," which was itself a mistake (see its own row above) — and found the real mechanism:
   `getManager().setBehaviorAll("ChaseMouse")`, bound to a "Follow Mouse!" system-tray item.
   **ChaseMouse has no autonomous trigger in the real engine at all** — it's exclusively a manual,
   all-mascots-at-once command, structurally identical to "Another One!"/"Reduce to One!" (both of
   which we'd already ported faithfully as menu items, which is what made this inconsistency
   worth chasing down). Removed the invented periodic/cooldown eligibility from
   `BehaviorAI.pickNextBehavior` entirely; added the real equivalent — a `followMouseAllMascots()`
   command and context-menu item in `main.ts` that forces every mascot onto ChaseMouse directly,
   the same primitive the existing per-mascot "Set behavior" menu already used. The
   `realPack.test.ts` test that used to assert the invented cooldown fired was inverted (now
   asserts ChaseMouse is *never* autonomously reached) and a new test added for the real
   forced-trigger path.
6. **Pass 6** (2026-08-12, not yet committed as of writing) — closed out the last four `❓` rows
   in this tracker (`config/Entry.java`, `environment/{Area,ComplexArea,Location,Environment}`),
   which turned up the second-largest bug of the whole audit. `Location.java`'s `set()` —
   `dx = (dx + (newX-x)) / 2`, an exponential smoothing of the raw per-tick cursor delta — **is**
   `mascot.environment.cursor.dx/dy`, and the real pack's `Thrown` reads it *directly* as its
   release velocity (`InitialVX="${mascot.environment.cursor.dx}"`). Our `computeReleaseVelocity`
   was an unrelated windowed-average of the *drag's own* recent pointer samples, with a
   `dragThrowScale` tuning constant the real engine has no equivalent of — replaced with a
   faithful `smoothCursorVelocity` port, computed once per fixed simulation tick in
   `Stage.updateAmbientVelocity` (previously this lived only inside `Mascot`'s per-drag pointer
   tracking, sampled independently of the general ambient tracker). Also found, from the same
   file: real `UserBehavior.mouseReleased()` unconditionally forces Thrown — no speed threshold
   at all — while ours branched between "Fall" and "Thrown" by a `minThrowSpeed` comparison;
   `PackDriver.notifyReleased` now always forces "Thrown" (the *native-fallback* placeholder,
   which has no real equivalent to be faithful to, keeps its own simpler two-state distinction).
   Getting this fully correct also required tracking down a **unit-conversion bug this fix would
   otherwise have introduced**: pack-authored per-tick constants (Velocity, Gravity, InitialVX/VY,
   ...) flow through the expression system *unconverted*, only becoming px/second at their one
   specific consumption point (`ActionRunner.applyEmbeddedStartEffects`, pre-existing code) — so
   `cursor.dx/dy` has to stay in the same raw per-tick units for that existing conversion to only
   apply once. `AmbientPointer.dx/dy` now deliberately expose the raw value; `Mascot.finishDrag()`
   (which sets `physics.vx/vy` directly, bypassing the expression system for the native-fallback
   physics) does its own conversion at that point of use instead.
7. **Pass 7** (2026-08-13) — prompted by another direct challenge ("is every file *actually*
   checked, file by file?"): read every remaining file that had only ever been categorized by
   name/role and never opened (`NativeFactory.java`, `LogFormatter.java`,
   `editor/action/ActionEditorFrame.java`, all six `image/*.java` files, all three
   `imagesetchooser/*.java` files, both `menu/*.java` files, and the rest of `Main.java` beyond
   the tray-menu slice Pass 5 had already read). Every one of them confirmed harmless as expected
   *except* the rest of `Main.java`, which turned up this pass's one real bug: `createMascot()`
   creates every new mascot off-screen at a fixed anchor `(-1000,-1000)`; the *actual* on-screen
   spawn position — a random x, dropped in from `screen.top - 256` — comes entirely from
   `UserBehavior.next()`'s off-screen-bounds recovery firing on the mascot's very next tick
   (already ported as `BehaviorAI.respawnAndFall`, from Pass 1/Pass 6-era work — we'd already
   faithfully ported this exact mechanism for the *recovery* case without recognizing it was also
   the *only* real spawn mechanism). There is no real "appears already standing in view" spawn
   behavior at all — every mascot's first visible moment is always falling in from off the top of
   the screen. `Stage.spawnMascot`'s default position (fixed centered x, fixed y=160, "so it's
   fully visible immediately") was an invented UX choice made before this file had been read in
   full. Fixed: a spawn with no explicit position (the command, the "Add another Shimeji" menu
   item, auto-spawn-on-load — every case except Breed/duplicate, which always pass an exact
   parent-relative position) now spawns at a random x across the viewport, `y=-256`, and is born
   directly into "Fall" — exactly mirroring `respawnAndFall`. Also confirmed (no change needed):
   `ImagePairLoader.java`'s load-time bitmap-flip mirroring is mathematically equivalent to our
   CSS-transform-origin approach, and `NativeFactory.java`'s actual platform implementation isn't
   present anywhere in this source mirror, which strengthens rather than weakens the existing
   activeIE-out-of-scope decision. See the "Out of scope" section below for the full per-file
   rundown — every file in the real source tree has now actually been opened and read, not just
   the core simulation subset.
8. **Pass 8** (2026-08-13) — a real feature request, not an audit finding, but landed the same
   way: read the actual `ThrowIE`/`WalkWithIE`/`FallWithIE` source precisely enough to port the
   window-manipulation side effect that Passes prior to this one had correctly identified but
   deliberately left unported ("no analog"). The user was explicit that resizing/popping out a
   real window is worth having if genuinely possible, not to be waved off again — so this time,
   instead of stopping at "no analog," went looking for the closest *real* Obsidian equivalent of
   each: `resizeBy` (WalkWithIE/RunWithIE's "carry the window along while walking," reinterpreted
   as resizing since a pane can't be freely repositioned the way a window can) leans on
   `WorkspaceItem.setDimension`/`WorkspaceSplit.getElSize`, confirmed real (not guessed) by
   reading a published plugin's own source
   ([`obsidian-resize-split`](https://github.com/RyotaUshio/obsidian-resize-split)) that already
   does the same undocumented-API trick. `beginThrow` (ThrowIE's actual window-fling) uses
   `Workspace.moveLeafToPopout` (real, documented) plus repeated `window.moveTo()` on the popout,
   which Electron intentionally lets a renderer drive on its own native window (confirmed against
   Electron's own documented `will-move` interception behavior, not assumed) — the one part of
   this pass that's a genuinely faithful, not reinterpreted, port. Also added `restoreThrown`
   (real `Main.java`'s "Restore IE!" tray item — needed for the first time now that there's
   something to restore) and an entirely new, honestly-not-a-port feature the user asked for
   alongside it: `openRandomNote`, a low-frequency "mischief" swap of the active pane's note,
   which has no real shimeji-ee analog at all (the original has zero vault/file awareness).
   All three gated behind new settings, off by default. See `engine/PaneActions.ts` and
   `ObsidianPaneActions.ts` for the full design reasoning, and the two new entries below this pass
   added to "Open live-bug reports" — the resize/throw mechanisms are the first things in this
   whole audit that couldn't be fully verified by reading source alone and need a live Obsidian
   window to confirm.
9. **Pass 9** (2026-08-13) — prompted directly by "are there other things like pane throwing we
   don't have ported?", asked right after Pass 8 landed. Rather than answer from memory, re-swept
   this file's own remaining hedge language (grepped for "no analog"/"approximated"/"out of
   scope") — that turned up nothing new beyond the two already-accepted multi-monitor exclusions
   — and then checked something the per-file table doesn't naturally cover at all: whether every
   *tray-menu item* actually has a correct, distinct mapping, not just *a* mapping. It didn't:
   `Manager.remainOne()` ("Reduce to One!") had been asserted in Pass 5's own commentary to
   already have "a faithful analog in our own 'Remove all Shimejis'" — never actually checked,
   and wrong. `remainOne()` keeps the *oldest* mascot and disposes the rest; "Remove all
   Shimejis" keeps *none* — a real engine feature had no implementation at all, hiding behind an
   unverified claim that it was already covered. Following that thread further turned up
   something bigger: `Mascot.java` has an entire *second* right-click menu (`showPopup()`,
   distinct from the tray's), previously never read as its own thing. Two of its five items
   share a name with the tray's but call *character-scoped* overloads instead — `remainOne(
   imageSet)` (keeps the *newest* mascot of that character, the opposite end from the no-filter
   version — confirmed by reading both loop bodies, not assumed symmetric) and `setBehaviorAll(
   config, "ChaseMouse", imageSet)` (only that character's mascots join ChaseMouse). This
   plugin's single context menu had been using the *global* semantics for both, since that's
   all "Reduce to One!"/"Follow Mouse!" had ever been checked against. Fixed:
   `Stage.removeAllButOne` now takes an optional filter (implementing both real overloads
   correctly, including the keep-oldest-vs-keep-newest asymmetry), and the context menu's
   versions are rescoped to the clicked mascot's own character (retitled "Reduce this character
   to one"/"Make this character follow the mouse" so the scope is honest at a glance) while the
   command palette keeps the global, tray-equivalent behavior. The real per-mascot "Another One!"
   (this character, but random fall-in position/facing, not offset-from-parent) was *not*
   changed to match exactly at the time — "Duplicate this Shimeji" already covers "spawn the same
   character" reasonably, and the position/facing difference was judged a minor, defensible UX
   choice rather than a missing feature. **Corrected in Pass 10 — see below: asserting that
   without checking whether it was actually safe to diverge was exactly the same mistake as
   Pass 5's unchecked `remainOne()` claim, just made and caught within the same conversation
   instead of across two.**
10. **Pass 10** (2026-08-13) — direct pushback on Pass 9's own closing claim ("do not deliberately
    leave changes against original just like that... is there a proximity-based breeding
    mechanic that would make this matter?"). Checked rather than re-asserted: `Breed.breed()`
    reads only its own mascot's anchor, and there is no mascot-to-mascot distance/proximity
    concept anywhere in the real condition/variable system at all (confirmed by grepping
    `VariableMap`/`Mascot.java`/`Configuration.java` for `getMascots`/`distance`/`nearby` —
    nothing). So breeding specifically isn't proximity-gated — but re-reading `createMascot()`
    carefully enough to answer that turned up a real, separate bug anyway: it also unconditionally
    randomizes facing (`Math.random() < 0.5`) for *every* fresh top-level mascot, a detail that
    had been sitting right there in a method already read and even partially quoted in this file
    since Pass 7, unnoticed until directly asked to re-verify it. Every manual/auto spawn here
    had silently defaulted to facing right always. Fixed: `Stage.spawnMascot`'s fresh-spawn path
    now randomizes facing via `Random.chance(0.5)`. Separately, "Duplicate this Shimeji" was
    replaced with a faithful port of real per-mascot "Another One!" (`spawnAnotherOfCharacter` —
    forces this mascot's character but is otherwise an entirely ordinary fresh spawn: off-screen,
    random facing, not an offset-and-inherit-facing duplicate), retitled "Add another of this
    character" to match. The lesson generalizes beyond this one item: a deviation from the real
    source is only safe to keep once actually checked against what depends on it, not just judged
    "probably fine" — see "Next steps" below.

## Open live-bug reports (need user diagnostics, not more audit)

`window.shimejiDebug` tooling ready (see README) but no repro data gathered yet:

- **Pane resizing** (`ObsidianPaneActions.resizeBy`): built entirely on undocumented internals
  (`WorkspaceItem.dimension`/`.setDimension`, `WorkspaceSplit.getElSize`,
  `Workspace.requestResize`) confirmed only by reading another plugin's source, never run against
  a live Obsidian window from this environment (headless, no GUI — see README's own testing
  caveat). Needs someone to actually enable "Window mischief" and watch a pane resize.
- **Window throwing** (`ObsidianPaneActions.beginThrow`): `moveLeafToPopout` itself is documented
  and should work; whether Obsidian's Electron main process actually *allows* the popout's own
  `window.moveTo()` calls to move it (vs. silently no-op'ing, or intercepting via `will-move`) is
  reasoned from Electron's own general documented behavior, not observed in this specific app.
  Needs a live desktop test to confirm the window actually visibly flies across the screen.

Two older items formerly listed here — "a mascot dropped from a height visually skips most of the
fall" and "drop-to-a-spot lands somewhere else, converging on a few hotspots" — turned out to be
a *real, confirmed* bug (Pass 13's wall-clamp gap: a mascot released near the screen edge with
`y` briefly above worldTop had no horizontal wall protection, so it could drift just past the
edge and trip the *separate* off-screen-recovery safety net, which resets position to a random
spot rather than falling — genuinely no animated fall at all, an instant reset). Pass 12's
ambient-pointer fix (mousemove going stale mid-drag) was real too but turned out not to be what
the user was actually hitting — flagged here so the next reader doesn't assume Pass 12 alone
settled this. Moved out of "open" since there's now a concrete, verified-in-code diagnosis, but
still needs the user's live confirmation like everything DOM-dependent in this file.

## Next steps, in priority order

1. Test/verify/commit/push Pass 10 (this file + Stage.spawnMascot's facing randomization +
   forcedPackId + spawnAnotherOfCharacter).
2. Live-test the Pass 8 "Window mischief" entries in "Open live-bug reports" above — enable it
   in a real desktop Obsidian window and confirm resize and throw both actually do something,
   then report back so this file can move them from "live-bug report" to "confirmed."
3. Re-test the two pre-existing open live-bug reports now that Passes 3-10 have landed.
4. **Every file in the real source tree has now actually been opened and read — not just the
   core simulation subset, the Swing/AWT/JNA GUI files too.** No `❓` rows remain anywhere, and
   the "out of scope" list is no longer split into "opened" vs. "inferred" tiers — it's just
   "opened." What's left is: re-auditing anything a *future* real source update changes, and
   staying skeptical of any comment (ours) that says "no ground truth found," "approximated,"
   "already has a faithful analog" (Pass 9's lesson), or "a minor, defensible UX choice" (Pass
   10's — the same unchecked-assertion mistake, just caught faster the second time), without the
   specific claim ever having been checked. Passes 5, 6, 7, 9, and 10 all came from doubting
   exactly one of these kinds of claims rather than trusting it, and all five turned up real,
   previously-unverified bugs. If another one ever turns up the same way, it's a sign to re-read
   this whole file's own status column with fresh suspicion rather than assume Pass 10 was really
   the last one — and, per Pass 10's own lesson, to treat "I chose not to match the original
   here" as a claim needing its own check, not a stopping point.
5. **Ground truth updated 2026-08-13** (see "Getting the real source" above) — the source tree
   moved from `logany20/shimeji-ee` to `DalekCraft2/Shimeji-Desktop`'s verified Kilkakon
   version-import commits (v1.0.19 through v1.0.22). This was triggered by investigating whether
   real shimeji-ee can "fire a projectile mascot that self-destructs on contact" (it can — via
   Affordances + ScanMove/ScanInteract + BreedMove/BreedJump + Transients + SelfDestruct, none of
   which exist in the old fork). A full feature inventory of everything in the new source newer
   than what's ported was produced and handed to the user as a standalone reference (not
   duplicated into this file) so they can pick what to build next — nothing from it has been
   built yet. Once specific items are chosen, audit and port them the same way as every other
   pass: read the real source at the commits above first, don't infer from the changelog text
   alone.
6. **Pass 11 (2026-08-13): fixed the world ceiling/walls being anchored at the literal top of the
   Electron viewport (y=0) instead of the top of Obsidian's actual usable workspace area.** User
   report: mascots spawning/climbing/ceiling-walking onto the title bar and tab strip (unwanted —
   "you cant see them there") and, separately, that this was blocking the user from dragging or
   resizing the Obsidian window itself. The second half is the same mechanism as the long-open
   "title-bar can't be reliably dragged" report above — the plugin's own ceiling/wall ledges had
   nothing stopping autonomous wall-climbing/ceiling-walking (both authentic shimeji-ee behavior)
   before the true top of the window, so mascots correctly performing that behavior ended up
   rendered on top of, and pointer-event-capturing over, the title bar/tab-header chrome
   underneath. Fixed: `Environment.getWorldTop()` (new) reads `.workspace`'s own bounding rect —
   the element `app.workspace.containerEl` points at, a sibling of the custom title bar and the
   left icon ribbon, not a descendant of either — and `computeLedgesFromRects` now anchors the
   window ceiling and the top of both window walls (plus clamps every pane's own side walls) to
   that instead of a hardcoded 0. This resolves the "spawns/climbs onto the title bar" and (very
   likely — same mechanism, previously unconfirmed for lack of repro data) the "can't drag the
   title bar" reports. Also added `shimejiDebug.dumpLedges()` for future geometry-related reports.
   This pass's own "drop lands somewhere else" speculation (ordinary Fall physics finding a
   different real floor) turned out to be wrong, or at least not the main story — see Pass 12,
   immediately below, which the user's live follow-up made possible to properly root-cause instead
   of guessing at. Needs live confirmation like every DOM-dependent fix in this file (headless dev
   environment, no GUI).
7. **Pass 12 (2026-08-13): fixed the shared ambient cursor tracker going stale for the entire
   duration of every drag, and switched `getWorldTop()` to the real `app.workspace.containerEl`
   API instead of a guessed selector.** User follow-up after live-testing Pass 11: mascots still
   ended up at the top after a reload, and — the more serious finding — dragging a mascot to a
   specific spot and releasing it never showed a fall at all; it instantly relocated to a wildly
   different spot in a single visible frame.
   - **Root cause of the teleport**: `Mascot`'s own `pointerdown` handler calls
     `ev.preventDefault()` (needed so touch-drag doesn't also scroll/select text). Per the Pointer
     Events spec, preventing a `pointerdown`'s default suppresses the *compatibility*
     `mousedown`/`mousemove`/`mouseup` events the browser synthesizes from that pointer for the
     rest of the interaction — real `pointer*` events are unaffected. `Stage`'s shared ambient
     cursor tracker (used for ChaseMouse *and* as a thrown/released mascot's velocity, matching
     the real engine's single `mascot.environment.cursor`) listened for `mousemove`, so it froze
     solid at the grab point for the whole drag. The instant it "unfroze" (the next real mouse
     movement after release), `smoothCursorVelocity` saw one giant single-tick jump instead of the
     drag's true gradual path, and `finishDrag()` baked that bogus jump straight into
     `physics.vx/vy` as release velocity — often large enough to cross the whole window in a
     handful of physics ticks, reading as an instant teleport with no visible fall. This is also
     almost certainly what the older "mascot dropped from a height visually skips most of the
     fall" report (see former "Open live-bug reports" entry, now folded into this one) actually
     was, not a Fall-specific bug. Fixed: `Stage` now listens for `pointermove` at the window
     level instead of `mousemove` — pointer events are never suppressed by another element's own
     `preventDefault()`, unlike the compatibility mouse events derived from them.
   - **Root cause of "still spawns on top" after Pass 11**: unconfirmed, but the likely culprit is
     that Pass 11's `.workspace` CSS selector either didn't match, or matched something with an
     unexpected rect, in the user's actual layout — a guess I had no way to verify without a live
     Obsidian window. Rather than keep guessing at selectors, `Environment`'s constructor now
     optionally takes Obsidian's own `Workspace` object, and `main.ts` passes `this.app.workspace`
     explicitly; `getWorldTop()` reads the real, documented `app.workspace.containerEl` directly
     when available, falling back to the old selector only if nothing was injected. This removes
     the guesswork entirely for real usage; the selector-based path now exists purely as a
     defensive fallback, not the primary mechanism.
   - Needs live confirmation, same as Pass 11 — this environment still has no GUI to test against.
8. **Pass 13 (2026-08-13): found the real cause of the teleport — a gap Pass 11 itself
   introduced — and fixed the "sprite still pokes into the title bar while standing" issue Pass
   12 didn't touch.** User follow-up after live-testing Pass 12: both issues were "absolutely
   the same" as before. Re-reading `BehaviorAI.isOffScreen()`/`respawnAndFall()` (the real
   engine's off-screen recovery, ported in an earlier pass) explained why: it does a *hard*
   position reset — random x, y=-256 — with no animation at all, unrelated to wherever the
   mascot actually was. Working backward from what could trigger it right after a drag release:
   - **Root cause**: Pass 11 clamped the *window's own* left/right wall ledges' `y1` to
     `worldTop`, so autonomous wall-*climbing* would correctly stop there. But `clampToWalls`
     (the unconditional screen-edge safety net — "a hard throw can't send the mascot drifting
     off past the window edge," from an earlier pass) shares that exact same `y1`/`y2` as a
     *containment* check, and now had a gap: a mascot whose `y` was briefly *above* worldTop —
     entirely possible right at a drag release, since `tickDragged` clamps to the raw viewport,
     not worldTop — had no horizontal wall protection at all until gravity pulled it back below
     worldTop. Released right at the edge of the window (matching "top right" in the report)
     with any residual velocity, `physics.x` could drift past the off-screen margin within a
     tick or two — tripping `respawnAndFall()`'s hard, random-position reset, which reads as
     exactly what was reported: no visible fall, an instant relocation to a spot with no
     relation to the release point. Pass 12's ambient-pointer fix was a real, separate bug (and
     stays fixed) but was never the dominant cause here — this is a *location*-triggered bug,
     not a velocity-magnitude one, so it didn't need a large/bogus velocity to reproduce, just
     "released near an edge," which is an entirely ordinary thing to do. Fixed:
     `clampToWalls` now applies window-sourced wall ledges regardless of `y` (only pane-sourced
     walls, and the separate wall-*climbing* detection path, still respect the worldTop-bounded
     range) — see nativeBehaviors.ts's own comment on the function.
   - **Root cause of the residual "still spawns on top"**: separate from the ceiling/wall fixes
     entirely. A pane's own floor can legitimately sit just a few pixels below worldTop — there's
     rarely much room between "top of the workspace" and "top of its topmost pane" — so a mascot
     standing there has a perfectly correct anchor (physics.y never crosses worldTop), but
     floor-standing poses are bottom-anchored, so the sprite's own rendered top edge still
     extends upward from that anchor and pokes above worldTop into the chrome above. Ceiling-hang
     poses don't have this problem (anchored near the sprite's *top*, extending downward). Fixed:
     new `withoutFloorsTooCloseToTop()` (Ledges.ts) excludes any floor within a specific mascot's
     own rendered height of worldTop from the ledges *that mascot* sees each tick (Stage's new
     per-mascot `ledgesFor()`) — it keeps falling past a floor too close to the top instead of
     settling there. Every mascot gets its own cutoff from its own height/scale, so a smaller
     pack isn't excluded from floors a taller one legitimately would be.
   - The honest framing for whoever reads this next: Pass 11 fixed a real bug (ceiling too high)
     while introducing a real regression (wall coverage gap) by sharing one field for two
     different jobs. Nothing here was reproducible without the user's own live testing — three
     rounds of it — which is exactly the discipline this file keeps asking for and exactly why
     guessing from the audit alone kept falling short. Needs live confirmation like everything
     else DOM-dependent in this file.
