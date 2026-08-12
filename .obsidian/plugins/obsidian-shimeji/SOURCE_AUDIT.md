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
exact port. Two options that return real bytes:

```bash
# One file:
curl -sS "https://raw.githubusercontent.com/logany20/shimeji-ee/master/src/com/group_finity/mascot/<path>.java"

# The whole tree (does a full, authoritative file listing — use this first when unsure
# whether a file has been fetched before):
git clone --depth 1 --filter=blob:none --sparse https://github.com/logany20/shimeji-ee.git <dest>
cd <dest> && git sparse-checkout set src/com/group_finity/mascot
```

A prior partial checkout lives in scratchpad at `shimeji-src/` (hand-picked files, curl'd one at
a time). A full sparse clone was done 2026-08-12 at `shimeji-ee-full/` in the same scratchpad —
prefer that one going forward, it has every file including the ones nobody thought to fetch
individually (that's how the `Move.java`/`Behavior.java`/`IActionBuilder.java` gaps below got
closed). Both paths are inside the session's ephemeral scratchpad, not the repo — re-clone if
they're gone.

`logany20/shimeji-ee` is a direct mirror of the schema this plugin's bundled
`Shimeji/conf/actions.xml`/`behaviors.xml` target (confirmed via `AnimationBuilder.java` and
cross-checked against `gil/shimeji-ee`).

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
| `Breed.java` | ✅ | Extends `Animate` (self-caps). `breed()` at `time == animation.duration-1`, BornX sign-flips by facing, sibling inherits parent's facing. All ported. |
| `ComplexAction.java` / `Select.java` / `Sequence.java` | ✅ | `seek()`-driven child selection confirmed structurally equivalent to `tickSequence`/`tickSelect`. Per-child `Condition` comes from `ActionBase.hasNext()`, not a separate mechanism — matches `evaluateCondition(ref.condition, ctx)`. `Loop=` is a **Sequence-only** XML attribute in every real usage (confirmed via full-pack grep) — never used on Stay/Animate, which is exactly the wrong assumption the old `tickHold` was making before the 2026-08-12 fix. |
| `Dragged.java` | ✅ | Fully ported earlier this session (`tickDragFootX`, fixed anchor offset, no lerp). |
| `Fall.java` | ✅ | Wall-termination, per-tick facing update, real resistance/gravity defaults (0.05/0.1/2) all ported. Sub-pixel "HACK IE" stepping loop deliberately not ported (guards against a fast-moving *tracked window*, not applicable to stable panes). |
| `FallWithIE.java` | ✅ | Extends `Fall`, only adds IE-window-drag side effects (`moveActiveIE`) we have no analog for. Mapping to plain `Fall` confirmed correct. |
| `InstantAction.java` | ✅ | `apply()` once at `init()`, `hasNext()` permanently false after. Matches `frame.instantComplete` (Look/Offset). |
| `Jump.java` | ✅ | Constant-speed direction-vector recomputed every tick, not gravity. Ported as `tickJump`. |
| `Look.java` | ✅ | Default `LookRight` is *toggle current facing*, not face-the-cursor. Fixed. |
| `Move.java` | ✅ | Confirmed via direct read 2026-08-12 (previously only inferred). Per-tick facing re-check while moving toward TargetX is a no-op for us since TargetX is fixed for a Move's lifetime (facing can't flip back mid-move) — start-once is equivalent. Target-snap-then-continue-one-more-tick vs our immediate-stop-on-crossing: already documented as a deliberate minor timing difference in README. |
| `Offset.java` | ✅ | Plain unconditional `(x+X, y+Y)`, never flipped by facing. Confirmed matches. |
| `Regist.java` | ✅ | Extends `ActionBase` directly (not Animate) — real "hold forever absent Duration" default is actually *correct* for it, unlike Breed/ThrowIE. Own `hasNext()` (cursor within 5px) and tick()-thrown `LostGroundException` are architecturally unreachable here (Dragged/Resisting render via a separate live-preview path with no interpreter tick during a drag) — documented dead path, not silently dropped. |
| `Stay.java` | ✅ | No extra cap beyond ActionBase — holds/cycles until Duration/Condition end it. This is the half of the 2026-08-12 tickHold bug that mattered most (multi-Pose Stay actions were self-ending after one pass instead of holding). |
| `ThrowIE.java` | 🐛 | **Extends `Animate`, not Fall.** Its own `tick()` never touches the mascot's position — `BorderType="Floor"`, single `Velocity="0,0"` pose — it only throws the *tracked window*. Was wrongly mapped to plain `Fall` (ran real falling physics on the mascot, which immediately "landed" again since it was already grounded, cutting the held pose short). Fixed 2026-08-12: routed through `tickHold` like Regist, added to the `selfCapsAtOneCycle` check like Breed. |
| `WalkWithIE.java` | ✅ | Extends `Move`, adds IE-window-drag + IE-position-consistency `LostGroundException` checks. Mapping to plain `Move` (dropping the window-drag side effect) confirmed correct — same reasoning as FallWithIE. |

## `animation/`

| File | Status | Notes |
|---|---|---|
| `Animation.java` | ✅ | `getPoseAt(time % totalDuration)` — always cycles by construction; termination is entirely the outer Action's job. This is the other half of the tickHold rewrite (`pickLoopingPose` already did this correctly for tickEmbedded; tickHold now uses it too instead of a linear poseIndex walk). |
| `Pose.java` | ✅ | `anchor.x += (lookRight ? -dx : dx); anchor.y += dy`. Confirmed matches our `physics.x += velocity.x * -facing * dt` sign convention. |

## `behavior/`

| File | Status | Notes |
|---|---|---|
| `Behavior.java` | 📖 | Bare interface, also declares `mousePressed`/`mouseReleased` (real engine routes mouse events through the active Behavior, not Mascot directly — we wire pointer events at the Mascot/PackDriver level instead, a reasonable adaptation). |
| `UserBehavior.java` | ✅ | `next()`'s off-screen recovery (respawn + forced Fall), `catch (LostGroundException)` → forced Fall. Both ported. |

## `config/`

| File | Status | Notes |
|---|---|---|
| `ActionBuilder.java` | ✅ | `createVariables`: own params first, ActionReference-site overrides second (override wins). Matches our `locals` merge order. Type dispatch table (Move/Stay/Animate/Sequence/Select/Embedded) matches `KNOWN_TYPES`. |
| `ActionRef.java` | 📖 | `buildAction(params)` lets a ref's own params override an incoming caller map, but every real call site (`createActions()`) always passes an empty map — no observable effect in any real pack. Config-loader-internal, not user-visible. |
| `AnimationBuilder.java` | ✅ | Confirmed schema match (Velocity/ImageAnchor parsing) — this is what resolved the early `NextBehaviorList` vs `NextBehavior` naming worry. |
| `BehaviorBuilder.java` | ✅ | `Add` attribute default (false if the wrapper element exists, true if it doesn't) — confirmed our `BehaviorsParser.ts` already modeled this correctly. |
| `Configuration.java` | ✅ | `buildBehavior()`: NextBehavior gated only by its own condition (not the target's top-level condition — this was the pickNextBehavior bug, fixed), `totalFrequency==0` respawn recovery (fixed). |
| `Entry.java` | ❓ | Generic XML-node wrapper (`getAttribute`/`getChildren`/`selectChildren`). Almost certainly a thin DOM wrapper with no behavioral logic of its own — not yet directly read, but every consumer of it (`ActionBuilder`, `ActionRef`, `AnimationBuilder`, `BehaviorBuilder`) has been, and their usage patterns are already reflected in our parsers. Low priority to close. |
| `IActionBuilder.java` | 📖 | Bare interface (`validate`/`buildAction`). |

## `environment/`

| File | Status | Notes |
|---|---|---|
| `Area.java` / `ComplexArea.java` / `Location.java` | ❓ | Supporting geometry types behind `MascotEnvironment`. Not read directly this session — reviewed only via `MascotEnvironment.java`'s own audit (below) and `Border`/`Wall`/`FloorCeiling`'s. Believed fully subsumed by that decision but not line-by-line confirmed. Low priority: this whole subtree was already judged too architecturally different to chase further (single tracked-window + OS multi-monitor model vs our N-Obsidian-panes model). |
| `Border.java` | ✅ | Two-method interface (`isOn`/`move`) — matches our `Ledge` predicate + (deliberately unported) `move` proportional-rescale concept. |
| `Environment.java` | ❓ | The non-Mascot-specific half of environment (screen/work-area geometry, presumably). Not read directly — believed subsumed by the `MascotEnvironment`/activeIE decision but not confirmed. |
| `FloorCeiling.java` / `Wall.java` | ✅ | `move()`'s proportional-rescale-relative-to-a-moving-border math, deliberately not ported (our `findNearestFloorAt` re-snap approximates the same intent for a fundamentally different multi-pane model). |
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
| `Manager.java` | ✅ | Fixed 40ms tick (matches `ENGINE_FIXED_TICK_MS`), pending-add/remove buffering (Java concurrent-collection safety, irrelevant to single-threaded JS), two-phase tick-then-apply over all mascots. One confirmed-harmless divergence: a Breed-spawned sibling pushed onto `Stage.mascots` mid-iteration gets its own `simulate()` call in the *same* tick it's born (JS `for...of` observes live array growth; real Manager defers new mascots to the next tick via its `added` set). Fully-initialized by the time this happens, so not a crash risk — just one 40ms-early tick for a newborn. Not worth chasing. |
| `Mascot.java` | ✅ | `tick()`/`catch (LostGroundException)`, breed/facing plumbing all previously audited and ported. |
| `Main.java` | 🐛 | **Wrongly written off wholesale as "Java-desktop-only" on the first pass — it isn't.** Its AWT/Swing tray-icon *construction* is out of scope (no Obsidian analog needed), but the menu-item wiring inside it is the real ground truth for how several behaviors actually get triggered, and was never read before this pass. `getManager().setBehaviorAll("ChaseMouse")`, bound to a "Follow Mouse!" tray item, is the *only* way ChaseMouse ever runs in the real engine — no autonomous/spontaneous trigger exists at all. See Pass 5. (`remainOne()`/`createMascot()`, bound to "Reduce to One!"/"Another One!", already have faithful analogs in our own "Remove all Shimejis"/"Add another Shimeji" menu items — confirms those were right, not just convenient.) |

## Out of scope (⛔ — Java-desktop-only, no Obsidian analog)

`NativeFactory.java`, `LogFormatter.java` (JNA-OS-native bridge / logging setup — no menu-wiring
logic like `Main.java` has, safe to skip entirely), `editor/action/ActionEditorFrame.java` (a
*separate* Swing GUI tool for authoring packs — our `CustomContentModal` is the analog, not a
port target), `image/*.java` (AWT/Swing image loading — we use `<img>`/CSS),
`imagesetchooser/*.java` (Swing character picker — our settings UI is the analog), `menu/*.java`
(Swing right-click/scrollable-menu widgetry — our Obsidian-native context menu is the analog),
`exception/*.java` (plain exception classes, no logic to port).

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
5. **Pass 5** (2026-08-12, not yet committed as of writing) — prompted by a direct challenge
   ("if we've still got synthesized code instead of a real port, go rewrite it"): re-examined
   every remaining *invented* (not source-verified) piece of behavior, which turned up exactly
   one, clearly self-flagged in this file's own `script/` table row before this pass: ChaseMouse's
   "no ground truth for its trigger cadence, so this is a periodic-cooldown guess" comment in
   `BehaviorAI.ts`. Went back to `Main.java` — previously written off wholesale as
   "Java-desktop-only, out of scope," which was itself a mistake (see its own row above) — and
   found the real mechanism: `getManager().setBehaviorAll("ChaseMouse")`, bound to a "Follow
   Mouse!" system-tray item. **ChaseMouse has no autonomous trigger in the real engine at all** —
   it's exclusively a manual, all-mascots-at-once command, structurally identical to "Another
   One!"/"Reduce to One!" (both of which we'd already ported faithfully as menu items, which is
   what made this inconsistency worth chasing down). Removed the invented periodic/cooldown
   eligibility from `BehaviorAI.pickNextBehavior` entirely; added the real equivalent — a
   `followMouseAllMascots()` command and context-menu item in `main.ts` that forces every mascot
   onto ChaseMouse directly, the same primitive the existing per-mascot "Set behavior" menu
   already used. The `realPack.test.ts` test that used to assert the invented cooldown fired was
   inverted (now asserts ChaseMouse is *never* autonomously reached) and a new test added for the
   real forced-trigger path.

## Open live-bug reports (need user diagnostics, not more audit)

Both have `window.shimejiDebug` tooling ready (see README) but no repro data gathered yet:

- Window title-bar can't be reliably dragged while the plugin is enabled (confirmed the plugin is
  the cause; not yet which part).
- A mascot dropped from a height was reported to visually skip most of the fall. Nothing in
  Passes 3-5 obviously explains this (Fall doesn't go through tickHold, and this isn't a
  ChaseMouse-adjacent path either), so still needs a live repro with `setVerbose(true)` rather
  than more speculation from the audit alone.

## Next steps, in priority order

1. Test/verify/commit/push Pass 5 (this file + the ChaseMouse trigger fix).
2. Re-test the two open live-bug reports now that Passes 3-5 have landed.
3. `config/Entry.java`, `environment/{Area,ComplexArea,Location,Environment}.java` — lower
   priority, believed subsumed, would close out 100% file coverage if desired. Nothing else is
   a known-synthesized/unverified gap as of this pass — everything left in the tracker is
   believed-fine plumbing, not a live suspect. Worth a periodic skeptical re-read anyway (Pass 5
   itself came from doubting an earlier "no ground truth available" claim rather than trusting
   it), but there's no *specific* next target the way there was going into Passes 4-5.
