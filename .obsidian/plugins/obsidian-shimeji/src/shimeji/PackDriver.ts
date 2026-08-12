import type { Mascot, MascotDriver } from "../engine/Mascot";
import type { Random } from "../engine/Random";
import type { AmbientPointer, EngineConfig, Ledge, NativeStateName } from "../engine/types";
import { BehaviorAI } from "./BehaviorAI";
import { pickLoopingPose } from "./poseUtil";
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

	constructor(private pack: MascotPack, private config: EngineConfig, rng: Random) {
		this.ai = new BehaviorAI(pack, rng);
	}

	tick(mascot: Mascot, dt: number, ledges: Ledge[], ambientPointer: AmbientPointer): void {
		this.ai.tick(mascot, dt, ledges, ambientPointer, this.config);
	}

	renderState(mascot: Mascot, state: NativeStateName, elapsedMs: number): boolean {
		const actionName = STATE_TO_ACTION[state];
		const poses = actionName ? this.resolveDisplayPoses(actionName) : [];
		if (poses.length === 0) return false;
		const pose = pickLoopingPose(poses, elapsedMs);
		mascot.setVisualImage(this.pack.resolveImage(pose.image), pose.anchor);
		return true;
	}

	notifyReleased(mascot: Mascot, wasThrown: boolean, ambientPointer: AmbientPointer): void {
		this.ai.forceBehavior(wasThrown ? "Thrown" : "Fall", mascot, ambientPointer, this.config);
	}

	/** "Dragged"/"Thrown" etc. are Sequences composed of other named actions, not leaves with
	 * their own poses; used only for a static drag/fall preview outside the normal per-frame
	 * interpreter (which resolves this properly via conditions), so a plain first-match walk
	 * down the reference chain is a reasonable stand-in. */
	private resolveDisplayPoses(actionName: string, depth = 0): PoseDef[] {
		if (depth > 4) return [];
		const action = this.pack.actions.get(actionName);
		if (!action) return [];
		for (const variant of action.animations) {
			if (variant.poses.length > 0) return variant.poses;
		}
		for (const child of action.children) {
			const poses = this.resolveDisplayPoses(child.name, depth + 1);
			if (poses.length > 0) return poses;
		}
		return [];
	}
}
