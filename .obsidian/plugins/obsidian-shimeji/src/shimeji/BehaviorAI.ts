import { debugLog } from "../engine/debugLog";
import type { Mascot } from "../engine/Mascot";
import { updateWallCeilingAdherence } from "../engine/nativeBehaviors";
import type { PaneActions } from "../engine/PaneActions";
import type { Random } from "../engine/Random";
import { findRoute, type RouteVia } from "../engine/Routing";
import type { EngineConfig, Ledge, Vec2 } from "../engine/types";
import { ActionRunner, type PushEnv } from "./ActionRunner";
import { evaluateCondition } from "./Expression";
import { createRuntimeContext, type AmbientPointer } from "./RuntimeContext";
import type { BehaviorDef, MascotPack } from "./types";

/** Shimeji-ee requires every pack to define these four. None of them are ever reachable through
 * this class's own weighted random selection (all Frequency="0" and orphaned from every other
 * behavior's NextBehavior in the standard pack) — the real engine triggers each of them directly
 * instead: Fall from physics (falling with nothing underfoot), Dragged/Thrown from the mouse
 * (Mascot's own pointer handling), and ChaseMouse from a "Follow Mouse!" system-tray menu item
 * (`Main.java`: `getManager().setBehaviorAll("ChaseMouse")`, forcing every mascot onto it at
 * once — not an autonomous/spontaneous thing at all). An earlier version of this file invented a
 * periodic, cooldown-gated eligibility for ChaseMouse inside pickNextBehavior below, guessing at
 * a cadence with no real source to check it against — removed once the actual mechanism was
 * found; see main.ts's "Make all Shimejis follow the mouse" command/menu item and
 * Mascot.startNamedBehavior for the real, on-demand equivalent. */
const REQUIRED_BEHAVIOR_NAMES = ["ChaseMouse", "Fall", "Dragged", "Thrown"];

/** Close enough — measured as a straight-line distance, in both axes — to count as having caught the
 * pointer, at which point the pursuit is over and the pack's own behavior chain takes back over.
 *
 * This used to be horizontal-only, on the reasoning that a mascot is stuck on whatever surface it is
 * standing on so directly underneath was as close as it could get. That stopped being true once
 * pursuit started routing over the ledge graph: it can now climb and jump to a pointer above it, and
 * a purely horizontal test would have declared victory the moment it was underneath, never bothering
 * with the vertical half of the journey. */
const FOLLOW_ARRIVAL_PX = 32;

/**
 * The longest single leg a pursuit commits to before recomputing against the pointer's live
 * position. Pursuit is a chain of ordinary pack `Move` actions, and a Move runs to *its* target
 * before the next one can be issued, so this is what bounds how stale that target can get: at the
 * standard pack's 8px/tick dash speed, 160px is a fresh aim roughly every 20 ticks (~0.8s). Legs
 * shorter than this are used verbatim, so the final approach targets the pointer exactly rather
 * than in fixed hops.
 */
const FOLLOW_LEG_PX = 160;

/**
 * Which of the pack's own actions performs each kind of route step, best first. This mapping is the
 * whole reason `RouteVia` has exactly five members: a route the pack cannot animate is not a route.
 *
 * A `drop` is deliberately a floor Move aimed past the edge — walking off and letting gravity take
 * over is what a drop *is*, and the engine's own lost-ground handling turns it into a Fall without
 * any action needing to exist for it.
 */
/** Chance, each time a behaviour ends, of setting off somewhere new. Low on purpose: the pack's own
 * idling is most of a mascot's character, and a mascot permanently in transit would lose it. At the
 * standard pack's behaviour lengths this works out to an expedition every minute or two. */
/**
 * How far the pointer must travel before a pursuit leg planned against its old position is abandoned
 * and re-planned.
 *
 * Small enough that being led around the screen reads as continuous chasing; large enough that
 * ordinary hand jitter, and the pointer drift of simply using the app, don't restart the mascot's
 * animation several times a second. It is also what stops a mascot parking at "the closest reachable
 * point" and staying there: that conclusion is only allowed to stand for as long as the pointer it
 * was computed against does.
 */
const FOLLOW_REAIM_PX = 64;

/** Close enough to count as having carried out a spot order. Looser than a pixel-perfect landing —
 * the mascot stands *on* surfaces, and a divider placed at the requested y puts its feet there. */
const SPOT_ARRIVAL_PX = 40;

/** How many times a single order may reshape the layout. Each attempt splits a real pane, so a spot
 * that can never be reached (inside chrome, or in a pane too small to split usefully) must not turn
 * into an endless run of new panes. */
const MAX_SPOT_SURGERIES = 2;

const ROAM_CHANCE = 0.06;

/** Roaming is not a precision exercise — anywhere near the chosen spot is a destination reached. */
const ROAM_ARRIVAL_PX = 48;

const ROUTE_ACTIONS: Record<RouteVia, string[]> = {
	walk: ["Dash", "Walk"],
	climb: ["ClimbWall"],
	traverse: ["ClimbCeiling"],
	jump: ["Jumping"],
	drop: ["Dash", "Walk"],
};

export class BehaviorAI {
	private runner: ActionRunner;
	private currentBehavior?: BehaviorDef;

	/** Names the user has switched off via a mascot's own menu (real `Toggleable` behaviors, and
	 * real `Main.setMascotBehaviorEnabled`). Excluded from *autonomous* selection only — forcing a
	 * behavior by name still works, exactly as the real engine's own "set behavior" item does. */
	private disabledBehaviors: ReadonlySet<string> = new Set();

	setDisabledBehaviors(names: ReadonlySet<string>): void {
		this.disabledBehaviors = names;
	}

	/**
	 * **Invented.** Real "Follow Cursor" is a one-shot `Manager.setBehaviorAll(..., "ChaseMouse")`
	 * — a single `setBehavior` call, verified in Manager.java — after which the pack's own
	 * NextBehavior chain takes over and never comes back to it: the standard pack sends ChaseMouse
	 * to SitAndFaceMouse, which references *itself* at Frequency="100" under `Add="false"`, so the
	 * mascot sits watching the pointer indefinitely. That is the real, correct outcome, and
	 * forceBehavior/the faithful command still do exactly it.
	 *
	 * This is a genuine pursuit rather than a repeat of that: it runs until the mascot is actually
	 * within FOLLOW_ARRIVAL_PX of the pointer, or until it is cancelled (any touch on the mascot, or
	 * the stop command). It deliberately does *not* re-run ChaseMouse to get there, because
	 * ChaseMouse structurally cannot close the last stretch — its final Dash targets
	 * `cursor.x + Gap` where `Gap` is `-Math.min(distance, Math.random()*200)`, so once the pointer
	 * is inside 200px that target collapses onto the mascot's own position and it stops dead. A mode
	 * built on re-triggering it would either stall short or oscillate forever.
	 *
	 * Instead each leg is an ordinary pack `Move` (`Dash`, real physics, real animation) aimed at
	 * the pointer's live x, capped at FOLLOW_LEG_PX so the aim stays fresh. Still strictly additive:
	 * it only intercepts the moment a behavior *ends*, substituting its own target for the weighted
	 * pick, and touches nothing about how actions themselves run.
	 */
	setFollowingMouse(following: boolean): void {
		this.followingMouse = following;
		if (!following) this.pursuitAimedAt = undefined;
		if (following) this.orderedSpot = undefined;
	}

	get isFollowingMouse(): boolean {
		return this.followingMouse;
	}

	private followingMouse = false;

	/** Where an autonomous expedition is currently headed, if one is under way — see maybeRoam. */
	private roamTarget?: Vec2;

	/** An explicit "get to this spot" order, and how many times the layout has been reshaped trying
	 * to satisfy it — see goToSpot. */
	private orderedSpot?: Vec2;
	private spotSurgeries = 0;

	/**
	 * **Invented.** An explicit order to reach a specific point, outranking everything else the mascot
	 * might be doing and — unlike following or roaming — willing to *change the layout* to succeed.
	 *
	 * Following deliberately stops at the nearest surface, because a pointer sweeping across the
	 * editor is not a request to rearrange anyone's workspace. An order is: it is given deliberately,
	 * at one specific spot, so "there is nothing to stand on there" becomes a problem to solve rather
	 * than a reason to stop. See PaneActions.makeSurfaceAt.
	 */
	orderToSpot(point: Vec2): void {
		this.orderedSpot = { x: point.x, y: point.y };
		this.spotSurgeries = 0;
		this.followingMouse = false;
		this.roamTarget = undefined;
	}

	cancelSpotOrder(): void {
		this.orderedSpot = undefined;
	}

	get hasSpotOrder(): boolean {
		return this.orderedSpot !== undefined;
	}

	/**
	 * Drives an outstanding spot order. Routes there like anything else; when the router reports
	 * there is nowhere nearer to go and the mascot still isn't at the spot, asks for a surface to be
	 * built and tries again.
	 *
	 * `spotSurgeries` bounds that: each attempt splits a real pane in the user's layout, and a spot
	 * that stays unreachable — inside chrome the mascot can never occupy, or a pane too small to
	 * split usefully — must not turn into an endless sequence of new panes. Two attempts is enough
	 * for the realistic case (split the pane, then place the divider) while making a runaway
	 * impossible.
	 */
	private driveSpotOrder(env: PushEnv, ledges: Ledge[]): boolean {
		const spot = this.orderedSpot;
		if (!spot) return false;
		const { physics } = env.mascot;

		if (Math.hypot(spot.x - physics.x, spot.y - physics.y) <= SPOT_ARRIVAL_PX) {
			debugLog("spot order complete", { x: Math.round(physics.x), y: Math.round(physics.y) });
			this.orderedSpot = undefined;
			return false;
		}

		const attached = physics.currentFloor ?? physics.currentWall ?? physics.currentCeiling;
		// travelTimeWeight near zero: an order's promise is reaching the point, so a surface that gets
		// there is worth a long climb. Following uses the default, where it is not — see RouteOptions.
		const route =
			ledges.length > 0
				? findRoute(ledges, { x: physics.x, y: physics.y }, spot, attached, { arriveWithin: SPOT_ARRIVAL_PX, travelTimeWeight: 0.05 })
				: [];

		// Judge the layout by where the route *ends up*, not by whether one exists. The router almost
		// always finds somewhere to go — a wall, the ceiling — and an earlier version only considered
		// surgery once the route came back empty, which meant the mascot first climbed all the way to
		// whatever distant surface happened to be nearest the spot, and only then decided the layout
		// could not deliver. Checking the shortfall up front makes it split the pane immediately and
		// walk to the real destination, which is what "get there no matter what" should look like.
		const end = route.length > 0 ? route[route.length - 1] : physics;
		const shortfall = Math.hypot(end.x - spot.x, end.y - spot.y);

		if (shortfall > SPOT_ARRIVAL_PX && this.spotSurgeries < MAX_SPOT_SURGERIES && env.paneActions?.makeSurfaceAt) {
			this.spotSurgeries++;
			const created = env.paneActions.makeSurfaceAt(spot);
			debugLog("spot order: reshaping the layout to reach it", { attempt: this.spotSurgeries, shortfall: Math.round(shortfall) });
			// The new geometry only reaches this class on the next tick, once Stage has recomputed
			// ledges from the changed layout — so yield rather than routing against stale ones.
			if (created !== undefined) return false;
		}

		const next = route[0];
		if (next) return this.startRouteAction(env, next.via, next.x, next.y, route.length);

		// Standing at the closest the layout can be persuaded to get. Give the order up rather than
		// holding the mascot hostage to a spot it will never reach.
		debugLog("spot order abandoned (unreachable)", spot);
		this.orderedSpot = undefined;
		return false;
	}

	/** The pointer position the current pursuit leg was aimed at, so a leg can be abandoned once that
	 * aim goes stale. Cleared whenever following stops. */
	private pursuitAimedAt?: Vec2;

	/**
	 * Whether the pointer has moved far enough since the current leg was planned to be worth
	 * abandoning it and re-planning.
	 *
	 * Deliberately does *not* interrupt Fall, Thrown or Dragged: those are the engine's own physics
	 * behaviours, not something the mascot chose, and cutting a fall short to go chasing would leave
	 * it moving under its own power in mid-air.
	 */
	private shouldReaimAt(pointer: Vec2): boolean {
		if (!this.followingMouse || !this.pursuitAimedAt) return false;
		const current = this.currentBehavior?.name;
		if (current === "Fall" || current === "Thrown" || current === "Dragged") return false;
		return Math.hypot(pointer.x - this.pursuitAimedAt.x, pointer.y - this.pursuitAimedAt.y) > FOLLOW_REAIM_PX;
	}

	/**
	 * **Invented.** Occasionally sets off across the window on its own, using the same router the
	 * pointer pursuit uses.
	 *
	 * Without this the router only ever runs while you are actively making the mascot follow you,
	 * which is a small fraction of its life; the rest of the time the pack's own behaviours apply,
	 * and those are authored per-surface ("walk to a random x on *this* floor", "climb *this* wall")
	 * with no notion of going somewhere else entirely. That is why a mascot otherwise tends to settle
	 * on one ledge and stay there. Picking a destination anywhere in the layout and routing to it is
	 * what produces the wandering — climbing, dropping and hopping between panes — as a side effect
	 * of simply having somewhere to be.
	 *
	 * Deliberately built on the same "intercept the moment a behaviour ends" seam as sticky follow,
	 * so it never interrupts anything and never changes how an action runs. A roam is abandoned the
	 * instant something else wants the mascot: pursuit is checked first, and any forced behaviour
	 * clears the target.
	 */
	private maybeRoam(env: PushEnv, ledges: Ledge[]): boolean {
		if (!env.config.roamEnabled || ledges.length === 0) return false;

		if (!this.roamTarget) {
			if (!this.rng.chance(ROAM_CHANCE)) return false;
			// Aim at a random point on a random surface. Unreachable picks are simply dropped rather
			// than retried in a loop — the next behaviour ending rolls again a moment later, which is
			// cheaper than searching for a guaranteed-reachable destination every time.
			const ledge = this.rng.pick(ledges);
			const spot = ledge.kind === "wall" ? { x: ledge.x, y: this.rng.range(ledge.y1, ledge.y2) } : { x: this.rng.range(ledge.x1, ledge.x2), y: ledge.y };
			this.roamTarget = spot;
		}

		const { physics } = env.mascot;
		const attached = physics.currentFloor ?? physics.currentWall ?? physics.currentCeiling;
		const route = findRoute(ledges, { x: physics.x, y: physics.y }, this.roamTarget, attached, { arriveWithin: ROAM_ARRIVAL_PX });
		const next = route[0];
		if (!next) {
			// Arrived, or nothing connects. Either way this expedition is over; the pack's own
			// behaviours take back over until the next roll.
			this.roamTarget = undefined;
			return false;
		}
		return this.startRouteAction(env, next.via, next.x, next.y, route.length);
	}

	/**
	 * One leg of a pursuit. Routes across the ledge graph rather than walking the floor, so following
	 * the pointer is a two-dimensional business: the mascot climbs walls, crosses ceilings, jumps
	 * between panes and drops off edges to get to you, instead of only ever pacing back and forth
	 * underneath you.
	 *
	 * Only the *first* step of the route is executed, and the route is recomputed on the next leg.
	 * That is what keeps it responsive — a pointer that moves mid-climb changes the plan at the next
	 * junction rather than after the mascot has finished walking to somewhere you no longer are.
	 *
	 * Returns false if nothing could be started, so the caller can fall back to ordinary selection
	 * rather than leaving the runner idle.
	 */
	private startPursuitLeg(env: PushEnv, cursor: Vec2, ledges: Ledge[]): boolean {
		const { physics } = env.mascot;
		// Recorded even when no leg ends up being started: the mascot is then already as near as the
		// geometry allows, and re-testing that same conclusion on every tick until the pointer happens
		// to move would be pure churn.
		this.pursuitAimedAt = { x: cursor.x, y: cursor.y };
		const attached = physics.currentFloor ?? physics.currentWall ?? physics.currentCeiling;
		const route = ledges.length > 0 ? findRoute(ledges, { x: physics.x, y: physics.y }, cursor, attached, { arriveWithin: FOLLOW_ARRIVAL_PX }) : [];
		const next = route[0];

		// With surfaces present, an empty route means the router has nothing left to offer — the
		// mascot is already as near the pointer as the geometry permits. Stop, and let the pack take
		// over. (With no surfaces at all there is no graph to route over, so fall back to the flat
		// walk this used to be rather than refusing to move.)
		if (!next) {
			if (ledges.length > 0) return false;
			const flatX = physics.x + Math.sign(cursor.x - physics.x) * Math.min(Math.abs(cursor.x - physics.x), FOLLOW_LEG_PX);
			if (Math.abs(cursor.x - physics.x) <= FOLLOW_ARRIVAL_PX) return false;
			return this.startRouteAction(env, "walk", flatX, undefined, 0, this.pack.behaviors.get("ChaseMouse"));
		}

		return this.startRouteAction(env, next.via, next.x, next.y, route.length, this.pack.behaviors.get("ChaseMouse"));
	}

	/**
	 * Starts whichever of the pack's actions performs `via`, aimed at the step's point.
	 *
	 * `attributeTo` is what `currentBehaviorName` reports for the duration, which decides what the
	 * pack picks *next* once the leg finishes. Pursuit attributes to ChaseMouse so the pack's own
	 * post-chase chain (SitAndFaceMouse) follows, exactly as it would after a real chase. Roaming
	 * passes nothing, and that distinction matters twice over: attributing a self-directed wander to
	 * ChaseMouse would both send it into sit-and-watch-the-pointer afterwards, which is nonsense for
	 * a mascot that was not following anything, and make the mascot appear to chase the mouse
	 * spontaneously — something real shimeji-ee never does and which this project pins with a test.
	 */
	private startRouteAction(
		env: PushEnv,
		via: RouteVia,
		targetX: number,
		targetY: number | undefined,
		remaining: number,
		attributeTo?: BehaviorDef,
	): boolean {
		const { physics } = env.mascot;

		for (const name of ROUTE_ACTIONS[via]) {
			if (!this.pack.actions.has(name)) continue;
			this.currentBehavior = attributeTo;
			// Each step gets *only* the axis its move actually travels along, which is exactly how the
			// pack references these actions itself (`<ActionReference Name="ClimbWall" TargetY="..."/>`
			// never passes a TargetX). This is not cosmetic: real Move treats a supplied target as a
			// completion condition, so handing a wall climb the TargetX it is already standing at made
			// it finish on its first tick. The mascot then re-planned, got the same instruction, and
			// stood at the foot of the wall forever — visibly identical to the routing not working.
			const overrides: Record<string, string> = {};
			if (via === "climb") overrides.TargetY = String(Math.round(targetY ?? 0));
			else if (via === "jump") {
				overrides.TargetX = String(Math.round(targetX));
				overrides.TargetY = String(Math.round(targetY ?? 0));
			} else overrides.TargetX = String(Math.round(targetX));
			debugLog("pursuit leg ->", `${via}/${name}`, {
				from: [Math.round(physics.x), Math.round(physics.y)],
				to: [Math.round(targetX), targetY === undefined ? undefined : Math.round(targetY)],
				remainingSteps: remaining,
			});
			if (this.runner.start(name, env, overrides)) return true;
		}

		const chase = this.pack.behaviors.get("ChaseMouse");
		if (!chase) return false;
		this.startBehavior(chase, env);
		return true;
	}

	/**
	 * Real `Configuration.isBehaviorEnabled(String name, Mascot)`, reproduced including both of its
	 * quirks:
	 *
	 *     if (behaviorBuilders.containsKey(name)) return isBehaviorEnabled(builders.get(name), mascot);
	 *     else return false;
	 *
	 *     isBehaviorEnabled(builder, mascot):
	 *         if (builder.isToggleable() && disabledBehaviors.containsKey(imageSet))
	 *             return !disabledBehaviors.get(imageSet).contains(builder.getName());
	 *         return true;
	 *
	 * So: an unknown name (including no name at all) is **false**, not true — the String overload
	 * is a "known and available" test, not just "not switched off". And a behavior that isn't
	 * `Toggleable` is always enabled regardless of the disabled list, which is why this can't just
	 * be `!disabled.has(name)`. Both matter on the hotspot path — see Mascot.hotspotAt.
	 */
	isBehaviorEnabled(name: string | undefined): boolean {
		if (name === undefined) return false;
		const behavior = this.pack.behaviors.get(name);
		if (!behavior) return false;
		if (behavior.toggleable) return !this.disabledBehaviors.has(name);
		return true;
	}

	constructor(private pack: MascotPack, private rng: Random) {
		this.runner = new ActionRunner(pack);
		this.warnIfIncomplete();
	}

	get currentBehaviorName(): string | undefined {
		return this.currentBehavior?.name;
	}

	private warnIfIncomplete(): void {
		for (const name of REQUIRED_BEHAVIOR_NAMES) {
			if (!this.pack.behaviors.has(name) || !this.pack.actions.has(name)) {
				console.warn(`[obsidian-shimeji] pack "${this.pack.name}" is missing the required "${name}" behavior/action`);
			}
		}
	}

	tick(mascot: Mascot, dt: number, ledges: Ledge[], ambientPointer: AmbientPointer, config: EngineConfig, paneActions?: PaneActions): void {
		// Before building this tick's context: a mascot can be "against a wall" (or under a
		// pane's underside) regardless of what action put it there, most commonly just having
		// walked into one — see updateWallCeilingAdherence.
		updateWallCeilingAdherence(mascot.physics, ledges);
		const env = this.buildEnv(mascot, ambientPointer, config, paneActions);

		// While following, re-aim as soon as the pointer has actually gone somewhere, rather than
		// waiting for whatever the mascot is currently doing to finish.
		//
		// Without this, sticky follow only ever reconsidered at the end of an action — so leading a
		// mascot around the screen meant it committed to a stale target, arrived where you *had* been,
		// settled into one of the pack's own idles (which can run for seconds), and only then noticed
		// you had moved. Fine for "come here"; useless for being led around for minutes, which is the
		// point of the mode. With it, the mascot re-plans continuously against wherever the pointer is
		// now, and stops only when you tell it to — by clicking it, or with the stop command.
		// An explicit order outranks everything: it was given deliberately, at one specific place.
		if (this.orderedSpot && !this.runner.isRunning && this.driveSpotOrder(env, ledges)) return;

		if (this.followingMouse) {
			// Arm the comparison the first time round. Turning the mode on kicks off the pack's own
			// ChaseMouse — a scripted sequence several seconds long — and without an aim recorded here
			// the first re-aim could not happen until that finished, which is precisely the window in
			// which someone switching the mode on is most likely to be moving the pointer.
			this.pursuitAimedAt ??= { x: ambientPointer.x, y: ambientPointer.y };
			if (this.shouldReaimAt(ambientPointer) && this.startPursuitLeg(env, ambientPointer, ledges)) return;
		}

		if (!this.runner.isRunning) this.startBehavior(this.pickNextBehavior(mascot, env), env);

		const done = this.runner.isRunning ? this.runner.tick(env, dt, ledges) : true;

		// Faithful to UserBehavior.next(): the off-screen recovery only applies while an action
		// is still *continuing* (not on the same tick it just finished, which goes through the
		// ordinary reselection below instead) and to the real engine's own LostGroundException
		// path — a Wall/Ceiling-bordered Move whose border vanished mid-climb.
		if (!done) {
			if (this.runner.lostGround) {
				this.startBehavior(this.forceFallBehavior(), env);
				return;
			}
			if (this.isOffScreen(mascot)) {
				this.startBehavior(this.respawnAndFall(mascot), env);
				return;
			}
			return;
		}

		// Sticky follow (invented — see setFollowingMouse) gets first refusal on the reselection.
		// The pursuit ends on arrival and nowhere else: it is not on a timer and does not expire
		// after some number of legs, so the mascot keeps coming as long as the pointer stays out of
		// reach — however long that takes, and however the pointer moves in the meantime.
		// Two separate lifetimes here, and conflating them is a bug I shipped once in this function:
		//  - a *pursuit* ends only by arriving. It is not on a timer, never gives up partway, and no
		//    number of legs exhausts it.
		//  - the *mode* ends only when cancelled — a touch on the mascot, or the stop command.
		// Arrival must therefore not disarm the mode, or "keep following" would be a single trip:
		// the mascot would catch up once, stand down, and then ignore the pointer for the rest of
		// the session. While arrived it simply stops issuing legs and lets the pack's own chain run
		// (SitAndFaceMouse — it sits and watches), staying armed so that a pointer moving back out of
		// reach picks the pursuit straight up again.
		// Arrival is decided by the router, not by distance to the pointer, and that distinction is
		// what keeps the mode terminating. A pointer hovering in the middle of the editor is not
		// somewhere a mascot can stand: it gets as close as the surfaces allow and then has nothing
		// further to do. Measuring against the raw pointer would leave it re-planning forever, never
		// settling into the pack's own sit-and-watch chain. startPursuitLeg returns false for exactly
		// that "nowhere nearer to go" case, and the mode stays armed so a pointer that moves back into
		// reach picks the pursuit straight up again.
		if (this.followingMouse && this.startPursuitLeg(env, ambientPointer, ledges)) return;

		if (this.orderedSpot && this.driveSpotOrder(env, ledges)) return;

		// Autonomous wandering, only ever considered when nothing more important is happening.
		if (!this.followingMouse && !this.orderedSpot && this.maybeRoam(env, ledges)) return;

		this.startBehavior(this.pickNextBehavior(mascot, env), env);
	}

	/** Faithful to UserBehavior.next()'s own bounds check: entirely past the left/right edge or
	 * below the bottom (the real check compares the full sprite bounds; anchor plus a generous
	 * margin is a reasonable stand-in without plumbing sprite dimensions through here). No
	 * top-edge check, matching the original — gravity (or clampToCeiling) always brings it back
	 * down eventually, so it can only ever drift further off *below*, never permanently above. */
	private isOffScreen(mascot: Mascot): boolean {
		const viewport = mascot.getViewportSize();
		const margin = 100;
		return mascot.physics.x < -margin || mascot.physics.x > viewport.width + margin || mascot.physics.y > viewport.height + margin;
	}

	/** Faithful to Configuration.buildBehavior's own totalFrequency==0 branch and
	 * UserBehavior.next()'s off-screen recovery — both respawn the exact same way: a random x
	 * across the window, dropped in from off-screen above (definitely clear of anything it
	 * could spuriously already be "on"), then forced onto Fall. Without this, a mascot that
	 * ever reached a state with nothing eligible would simply freeze forever — pickNextBehavior
	 * would keep returning undefined every tick with nothing to show for it. */
	private respawnAndFall(mascot: Mascot): BehaviorDef | undefined {
		const viewport = mascot.getViewportSize();
		mascot.physics.x = this.rng.range(0, viewport.width);
		mascot.physics.y = -256;
		mascot.physics.vx = 0;
		mascot.physics.vy = 0;
		mascot.physics.grounded = false;
		mascot.physics.currentFloor = undefined;
		mascot.physics.currentWall = undefined;
		mascot.physics.currentCeiling = undefined;
		debugLog("respawn (nothing eligible, or drifted off-screen)", { x: mascot.physics.x, y: mascot.physics.y });
		return this.forceFallBehavior();
	}

	private forceFallBehavior(): BehaviorDef | undefined {
		return this.pack.behaviors.get("Fall");
	}

	/** Real UserBehavior's mouse-down path consults the *currently running action*'s own
	 * `Draggable` attribute before starting a drag — see ActionRunner.isCurrentActionDraggable. */
	isDraggable(mascot: Mascot, ambientPointer: AmbientPointer, config: EngineConfig): boolean {
		if (!this.runner.isRunning) return true;
		return this.runner.isCurrentActionDraggable(this.buildEnv(mascot, ambientPointer, config));
	}

	/** Used for a mouse-drag release (Fall/Thrown) and for manually jumping a mascot straight to
	 * a named behavior via Mascot.startNamedBehavior (ChaseMouse, or any behavior name at all via
	 * the per-mascot right-click menu — including a ThrowIE-carrying one, hence paneActions).
	 * Unlike startBehavior() below, this used to log nothing at all — meaning a verbose trace
	 * captured across a drag release never showed the single most relevant line, the moment Fall/
	 * Thrown actually starts and with what position/velocity. */
	forceBehavior(name: string, mascot: Mascot, ambientPointer: AmbientPointer, config: EngineConfig, paneActions?: PaneActions): void {
		const env = this.buildEnv(mascot, ambientPointer, config, paneActions);
		// Anything explicitly asking for a behaviour outranks an expedition the mascot chose itself.
		this.roamTarget = undefined;
		const behavior = this.pack.behaviors.get(name);
		this.currentBehavior = behavior;
		debugLog("behavior -> (forced)", name, {
			x: Math.round(mascot.physics.x),
			y: Math.round(mascot.physics.y),
			vx: Math.round(mascot.physics.vx),
			vy: Math.round(mascot.physics.vy),
		});
		if (!this.runner.start(name, env)) this.currentBehavior = undefined;
	}

	private buildEnv(mascot: Mascot, ambientPointer: AmbientPointer, config: EngineConfig, paneActions?: PaneActions): PushEnv {
		const viewport = mascot.getViewportSize();
		const ctx = createRuntimeContext(
			mascot.physics,
			{
				viewportWidth: viewport.width,
				viewportHeight: viewport.height,
				worldTop: mascot.getWorldTop(),
				pointer: ambientPointer,
				totalMascotCount: mascot.getTotalMascotCount(),
				sameCharacterCount: mascot.getSameCharacterCount(),
			},
			mascot.stateElapsedMs,
			this.rng,
			mascot.variables,
		);
		return { mascot, ctx, ambient: ambientPointer, config, paneActions };
	}

	private startBehavior(behavior: BehaviorDef | undefined, env: PushEnv): void {
		this.currentBehavior = behavior;
		debugLog("behavior ->", behavior?.name, {
			x: Math.round(env.mascot.physics.x),
			y: Math.round(env.mascot.physics.y),
			grounded: env.mascot.physics.grounded,
			vx: Math.round(env.mascot.physics.vx),
			vy: Math.round(env.mascot.physics.vy),
		});
		if (behavior && !this.runner.start(behavior.name, env)) this.currentBehavior = undefined;
	}

	/** Combines any explicit NextBehavior transitions from the behavior that just finished
	 * with the general top-level pool — additively (both count) when every transition edge is
	 * Add="true", exclusively (only the transitions count) otherwise, matching real packs
	 * where e.g. ChaseMouse always leads to SitAndFaceMouse but SitDown can *also* fall back
	 * to the general pool. Faithful to Configuration.buildBehavior: a NextBehavior reference is
	 * gated *only* by its own condition (inherited from where it's declared), never by the
	 * target's separate top-level `<Behavior Condition="...">` — the real engine builds the
	 * chosen action directly from the reference site's own name/params/condition and never
	 * re-checks the top-level entry with that name at all. */
	private pickNextBehavior(mascot: Mascot, env: PushEnv): BehaviorDef | undefined {
		const ctx = env.ctx;
		const transitions = this.currentBehavior?.nextBehaviors ?? [];
		const additive = transitions.length === 0 || transitions.every((t) => t.add);

		const candidates: Array<{ item: BehaviorDef; weight: number }> = [];
		for (const t of transitions) {
			const target = this.pack.behaviors.get(t.name);
			if (target && this.disabledBehaviors.has(target.name)) continue;
			if (target && evaluateCondition(t.condition, ctx)) {
				candidates.push({ item: target, weight: t.frequency });
			}
		}
		if (additive) {
			// ChaseMouse is naturally part of this loop too (it's just another entry in
			// pack.behaviors), but real packs declare it Frequency="0" like Fall/Dragged/Thrown,
			// so weightedPick's roll never actually lands on it here — matching the real engine,
			// which has no autonomous path into ChaseMouse at all (see REQUIRED_BEHAVIOR_NAMES).
			for (const behavior of this.pack.behaviors.values()) {
				if (this.disabledBehaviors.has(behavior.name)) continue;
				if (evaluateCondition(behavior.condition, ctx)) candidates.push({ item: behavior, weight: behavior.frequency });
			}
		}

		// Faithful to Configuration.buildBehavior's own totalFrequency==0 branch: when nothing
		// eligible carries any real weight (freshly spawned, or nothing else applies), the real
		// engine doesn't pick among the zero-weight leftovers at all — it respawns and forces
		// Fall. Without this, weightedPick would have nothing usable to roll against.
		const totalWeight = candidates.reduce((sum, c) => sum + c.weight, 0);
		if (totalWeight <= 0) return this.respawnAndFall(mascot);

		return this.rng.weightedPick(candidates);
	}
}
