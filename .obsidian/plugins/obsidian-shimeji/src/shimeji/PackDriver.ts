import type { Mascot, MascotDriver } from "../engine/Mascot";
import { Random } from "../engine/Random";
import type { AmbientPointer, EngineConfig, Ledge, NativeStateName } from "../engine/types";
import { BehaviorAI } from "./BehaviorAI";
import { evaluateCondition, withLocals, type ExprContext } from "./Expression";
import { pickLoopingPose } from "./poseUtil";
import { createRuntimeContext } from "./RuntimeContext";
import type { MascotPack, PoseDef } from "./types";

const STATE_TO_ACTION: Partial<Record<NativeStateName, string>> = {
	dragged: "Dragged",
	thrown: "Thrown",
	fall: "Fall",
	"chase-mouse": "ChaseMouse",
};

/** Adapts a parsed MascotPack (running through BehaviorAI/ActionRunner) to the MascotDriver
 * interface Mascot expects, so a real Shimeji-compatible pack can drive the same Mascot the
 * native placeholder state machine otherwise would. */
export class PackDriver implements MascotDriver {
	private readonly ai: BehaviorAI;

	constructor(private pack: MascotPack, private config: EngineConfig, private rng: Random) {
		this.ai = new BehaviorAI(pack, rng);
	}

	tick(mascot: Mascot, dt: number, ledges: Ledge[], ambientPointer: AmbientPointer): void {
		this.ai.tick(mascot, dt, ledges, ambientPointer, this.config);
	}

	renderState(mascot: Mascot, state: NativeStateName, elapsedMs: number, ambientPointer: AmbientPointer): boolean {
		const actionName = STATE_TO_ACTION[state];
		if (!actionName) return false;
		// Real packs pick between several poses for e.g. Dragged based on how far the mascot
		// is being swung relative to the pointer (Pinched's FootX-vs-cursor.x conditions), so
		// this needs a live context, not just a static "first pose found" fallback.
		const viewport = mascot.getViewportSize();
		const baseCtx = createRuntimeContext(
			mascot.physics,
			{ viewportWidth: viewport.width, viewportHeight: viewport.height, pointer: ambientPointer, totalMascotCount: mascot.getTotalMascotCount() },
			elapsedMs,
			this.rng,
		);
		const ctx = withLocals(baseCtx, { FootX: mascot.physics.x });
		const poses = this.resolveDisplayPoses(actionName, ctx);
		if (poses.length === 0) return false;
		const pose = pickLoopingPose(poses, elapsedMs);
		mascot.setVisualImage(this.pack.resolveImage(pose.image), pose.anchor);
		return true;
	}

	notifyReleased(mascot: Mascot, wasThrown: boolean, ambientPointer: AmbientPointer): void {
		this.ai.forceBehavior(wasThrown ? "Thrown" : "Fall", mascot, ambientPointer, this.config);
	}

	startNamedBehavior(mascot: Mascot, name: string, ambientPointer: AmbientPointer): void {
		this.ai.forceBehavior(name, mascot, ambientPointer, this.config);
	}

	listBehaviorNames(): string[] {
		return Array.from(this.pack.behaviors.keys()).sort((a, b) => a.localeCompare(b));
	}

	/** "Dragged"/"Thrown" etc. are Sequences composed of other named actions, not leaves with
	 * their own poses; this is a static preview used outside the normal per-frame interpreter
	 * (which the driver runs instead once actually falling/thrown), so it walks the reference
	 * chain evaluating each step's own conditions (e.g. Pinched's FootX-vs-cursor.x variants)
	 * rather than always taking the first branch. */
	private resolveDisplayPoses(actionName: string, ctx: ExprContext, depth = 0): PoseDef[] {
		if (depth > 4) return [];
		const action = this.pack.actions.get(actionName);
		if (!action) return [];
		for (const variant of action.animations) {
			if (evaluateCondition(variant.condition, ctx) && variant.poses.length > 0) return variant.poses;
		}
		for (const child of action.children) {
			if (!evaluateCondition(child.condition, ctx)) continue;
			const poses = this.resolveDisplayPoses(child.name, ctx, depth + 1);
			if (poses.length > 0) return poses;
		}
		return [];
	}
}
