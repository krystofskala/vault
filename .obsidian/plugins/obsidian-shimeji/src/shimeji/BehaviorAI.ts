import type { Mascot } from "../engine/Mascot";
import type { Random } from "../engine/Random";
import type { EngineConfig, Ledge } from "../engine/types";
import { ActionRunner } from "./ActionRunner";
import { evaluateCondition, type ExprContext } from "./Expression";
import { createRuntimeContext } from "./RuntimeContext";
import type { BehaviorDef, MascotPack } from "./types";

/** Shimeji-ee requires every pack to define these four; ChaseMouse/Fall have real declarative
 * fallbacks in most packs, but Dragged/Thrown are reached via Mascot's own pointer handling
 * rather than through this random-selection loop. */
const REQUIRED_BEHAVIOR_NAMES = ["ChaseMouse", "Fall", "Dragged", "Thrown"];

export class BehaviorAI {
	private runner: ActionRunner;
	private currentBehavior?: BehaviorDef;

	constructor(private pack: MascotPack, private rng: Random) {
		this.runner = new ActionRunner(pack);
		this.warnIfIncomplete();
	}

	private warnIfIncomplete(): void {
		for (const name of REQUIRED_BEHAVIOR_NAMES) {
			if (!this.pack.behaviors.has(name) || !this.pack.actions.has(name)) {
				console.warn(`[obsidian-shimeji] pack "${this.pack.name}" is missing the required "${name}" behavior/action`);
			}
		}
	}

	tick(mascot: Mascot, dt: number, ledges: Ledge[], ambient: { x: number; y: number }, config: EngineConfig): void {
		const ctx = createRuntimeContext(
			mascot.physics,
			{ viewportWidth: window.innerWidth, viewportHeight: window.innerHeight },
			mascot.stateElapsedMs,
			this.rng,
		);

		if (!this.runner.isRunning) this.startBehavior(this.pickNextBehavior(ctx));

		const done = this.runner.isRunning ? this.runner.tick(mascot, dt, ledges, ambient, ctx, config) : true;
		if (done) this.startBehavior(this.pickNextBehavior(ctx));
	}

	/** Used for a mouse-drag release: jump straight to the pack's own Fall/Thrown action. */
	forceBehavior(name: string): void {
		const behavior = this.pack.behaviors.get(name);
		this.currentBehavior = behavior;
		if (!this.runner.start(name)) this.currentBehavior = undefined;
	}

	private startBehavior(behavior: BehaviorDef | undefined): void {
		this.currentBehavior = behavior;
		if (behavior && !this.runner.start(behavior.name)) this.currentBehavior = undefined;
	}

	private pickNextBehavior(ctx: ExprContext): BehaviorDef | undefined {
		const transitions = this.currentBehavior?.nextBehaviors ?? [];
		if (transitions.length > 0) {
			const candidates = transitions
				.map((t) => this.pack.behaviors.get(t.name))
				.filter((b): b is BehaviorDef => !!b && evaluateCondition(b.condition, ctx));
			const picked = this.rng.weightedPick(candidates.map((b) => ({ item: b, weight: b.frequency || 1 })));
			if (picked) return picked;
		}
		const pool = Array.from(this.pack.behaviors.values()).filter((b) => !b.hidden && evaluateCondition(b.condition, ctx));
		return this.rng.weightedPick(pool.map((b) => ({ item: b, weight: b.frequency })));
	}
}
