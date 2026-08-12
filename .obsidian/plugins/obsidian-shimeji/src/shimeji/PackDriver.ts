import type { Mascot, MascotDriver } from "../engine/Mascot";
import type { Random } from "../engine/Random";
import type { EngineConfig, Ledge, NativeStateName } from "../engine/types";
import { BehaviorAI } from "./BehaviorAI";
import { pickLoopingPose } from "./poseUtil";
import type { MascotPack } from "./types";

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

	constructor(private pack: MascotPack, private config: EngineConfig, rng: Random) {
		this.ai = new BehaviorAI(pack, rng);
	}

	tick(mascot: Mascot, dt: number, ledges: Ledge[], ambientPointer: { x: number; y: number }): void {
		this.ai.tick(mascot, dt, ledges, ambientPointer, this.config);
	}

	renderState(mascot: Mascot, state: NativeStateName, elapsedMs: number): boolean {
		const actionName = STATE_TO_ACTION[state];
		const action = actionName ? this.pack.actions.get(actionName) : undefined;
		if (!action || action.poses.length === 0) return false;
		const pose = pickLoopingPose(action.poses, elapsedMs);
		mascot.setVisualImage(this.pack.resolveImage(pose.image), pose.anchor);
		return true;
	}

	notifyReleased(_mascot: Mascot, wasThrown: boolean): void {
		this.ai.forceBehavior(wasThrown ? "Thrown" : "Fall");
	}
}
