import { debugLog } from "../engine/debugLog";
import type { Mascot } from "../engine/Mascot";
import { updateWallCeilingAdherence } from "../engine/nativeBehaviors";
import type { Random } from "../engine/Random";
import type { EngineConfig, Ledge } from "../engine/types";
import { ActionRunner, type PushEnv } from "./ActionRunner";
import { evaluateCondition } from "./Expression";
import { createRuntimeContext, type AmbientPointer } from "./RuntimeContext";
import type { BehaviorDef, MascotPack } from "./types";

/** Shimeji-ee requires every pack to define these four; ChaseMouse/Fall have real declarative
 * fallbacks in most packs, but Dragged/Thrown are reached via Mascot's own pointer handling
 * rather than through this random-selection loop. */
const REQUIRED_BEHAVIOR_NAMES = ["ChaseMouse", "Fall", "Dragged", "Thrown"];

export class BehaviorAI {
	private runner: ActionRunner;
	private currentBehavior?: BehaviorDef;
	// ChaseMouse is never referenced by any other behavior's NextBehavior in the standard
	// pack and is declared Frequency="0" like Fall/Dragged/Thrown — it's one of the behaviors
	// the original engine triggers directly rather than through weighted selection (here,
	// physics-driven Fall and input-driven Dragged/Thrown are already handled that way).
	// There's no ground truth available for its exact real trigger cadence, so this is an
	// approximation: eligible again periodically, with a random cooldown after each run.
	private chaseMouseCooldownMs = 8000;

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

	tick(mascot: Mascot, dt: number, ledges: Ledge[], ambientPointer: AmbientPointer, config: EngineConfig): void {
		this.chaseMouseCooldownMs -= dt * 1000;
		// Before building this tick's context: a mascot can be "against a wall" (or under a
		// pane's underside) regardless of what action put it there, most commonly just having
		// walked into one — see updateWallCeilingAdherence.
		updateWallCeilingAdherence(mascot.physics, ledges);
		const env = this.buildEnv(mascot, ambientPointer, config);

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

	/** Used for a mouse-drag release: jump straight to the pack's own Fall/Thrown action. */
	forceBehavior(name: string, mascot: Mascot, ambientPointer: AmbientPointer, config: EngineConfig): void {
		const env = this.buildEnv(mascot, ambientPointer, config);
		const behavior = this.pack.behaviors.get(name);
		this.currentBehavior = behavior;
		if (!this.runner.start(name, env)) this.currentBehavior = undefined;
	}

	private buildEnv(mascot: Mascot, ambientPointer: AmbientPointer, config: EngineConfig): PushEnv {
		const viewport = mascot.getViewportSize();
		const ctx = createRuntimeContext(
			mascot.physics,
			{
				viewportWidth: viewport.width,
				viewportHeight: viewport.height,
				pointer: ambientPointer,
				totalMascotCount: mascot.getTotalMascotCount(),
			},
			mascot.stateElapsedMs,
			this.rng,
		);
		return { mascot, ctx, ambient: ambientPointer, config };
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
			if (target && evaluateCondition(t.condition, ctx)) {
				candidates.push({ item: target, weight: t.frequency });
			}
		}
		if (additive) {
			for (const behavior of this.pack.behaviors.values()) {
				if (evaluateCondition(behavior.condition, ctx)) candidates.push({ item: behavior, weight: behavior.frequency });
			}
			if (env.config.chaseMouseEnabled && mascot.physics.grounded && this.chaseMouseCooldownMs <= 0) {
				const chaseMouse = this.pack.behaviors.get("ChaseMouse");
				if (chaseMouse) candidates.push({ item: chaseMouse, weight: 30 });
			}
		}

		// Faithful to Configuration.buildBehavior's own totalFrequency==0 branch: when nothing
		// eligible carries any real weight (freshly spawned, or nothing else applies), the real
		// engine doesn't pick among the zero-weight leftovers at all — it respawns and forces
		// Fall. Without this, weightedPick would have nothing usable to roll against.
		const totalWeight = candidates.reduce((sum, c) => sum + c.weight, 0);
		if (totalWeight <= 0) return this.respawnAndFall(mascot);

		const picked = this.rng.weightedPick(candidates);
		if (picked?.name === "ChaseMouse") this.chaseMouseCooldownMs = this.rng.range(15000, 30000);
		return picked;
	}
}
