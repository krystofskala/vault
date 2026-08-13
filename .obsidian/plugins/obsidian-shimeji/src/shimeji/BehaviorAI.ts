import { debugLog } from "../engine/debugLog";
import type { Mascot } from "../engine/Mascot";
import { updateWallCeilingAdherence } from "../engine/nativeBehaviors";
import type { PaneActions } from "../engine/PaneActions";
import type { Random } from "../engine/Random";
import type { EngineConfig, Ledge } from "../engine/types";
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
