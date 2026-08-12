import type { Mascot } from "../engine/Mascot";
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
		const env = this.buildEnv(mascot, ambientPointer, config);

		if (!this.runner.isRunning) this.startBehavior(this.pickNextBehavior(mascot, env), env);

		const done = this.runner.isRunning ? this.runner.tick(env, dt, ledges) : true;
		if (done) this.startBehavior(this.pickNextBehavior(mascot, env), env);
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
		if (behavior && !this.runner.start(behavior.name, env)) this.currentBehavior = undefined;
	}

	/** Combines any explicit NextBehavior transitions from the behavior that just finished
	 * with the general top-level pool — additively (both count) when every transition edge is
	 * Add="true", exclusively (only the transitions count) otherwise, matching real packs
	 * where e.g. ChaseMouse always leads to SitAndFaceMouse but SitDown can *also* fall back
	 * to the general pool. */
	private pickNextBehavior(mascot: Mascot, env: PushEnv): BehaviorDef | undefined {
		const ctx = env.ctx;
		const transitions = this.currentBehavior?.nextBehaviors ?? [];
		const additive = transitions.length === 0 || transitions.every((t) => t.add);

		const candidates: Array<{ item: BehaviorDef; weight: number }> = [];
		for (const t of transitions) {
			const target = this.pack.behaviors.get(t.name);
			if (target && evaluateCondition(t.condition, ctx) && evaluateCondition(target.condition, ctx)) {
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

		// Real packs gate almost every positive-weight behavior behind "on the floor/wall/
		// ceiling" — while genuinely unsupported (freshly spawned, or nothing else applies)
		// every candidate here can end up weight-0, and picking among those is really just a
		// tiebreak on whatever order the pack happened to declare them in. Prefer Fall in that
		// case: falling is always the physically correct thing to do when ungrounded, not an
		// arbitrary choice.
		if (!mascot.physics.grounded && candidates.length > 0 && candidates.every((c) => c.weight <= 0)) {
			const fallIndex = candidates.findIndex((c) => c.item.name === "Fall");
			if (fallIndex > 0) candidates.unshift(candidates.splice(fallIndex, 1)[0]);
		}

		const picked = this.rng.weightedPick(candidates);
		if (picked?.name === "ChaseMouse") this.chaseMouseCooldownMs = this.rng.range(15000, 30000);
		return picked;
	}
}
