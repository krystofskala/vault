import type { Mascot } from "../engine/Mascot";
import type { EngineConfig, Ledge } from "../engine/types";
import { evaluateCondition, type ExprContext } from "./Expression";
import { applyNativeEmbedded } from "./nativeAdapter";
import { pickLoopingPose } from "./poseUtil";
import type { ActionDef, MascotPack, PoseDef } from "./types";

interface Frame {
	action: ActionDef;
	childIndex: number;
	childStarted: boolean;
	poseIndex: number;
	poseElapsedMs: number;
	embeddedElapsedMs: number;
}

function makeFrame(action: ActionDef): Frame {
	return { action, childIndex: 0, childStarted: false, poseIndex: 0, poseElapsedMs: 0, embeddedElapsedMs: 0 };
}

/** Frame-by-frame interpreter for a single named Action (and whatever it references),
 * following the actions.xml tree: Sequence runs children in order, Select runs the first
 * child whose Condition passes, Animate/Move/Stay step poses on a timer, and Embedded
 * delegates physics to nativeAdapter while still cycling the pack's own art for it. */
export class ActionRunner {
	private stack: Frame[] = [];

	constructor(private pack: MascotPack) {}

	get isRunning(): boolean {
		return this.stack.length > 0;
	}

	get currentActionName(): string | undefined {
		return this.stack[this.stack.length - 1]?.action.name;
	}

	start(actionName: string): boolean {
		this.stack = [];
		return this.pushAction(actionName);
	}

	private pushAction(name: string): boolean {
		const def = this.pack.actions.get(name);
		if (!def) {
			console.warn(`[obsidian-shimeji] unknown action "${name}" referenced, skipping`);
			return false;
		}
		this.stack.push(makeFrame(def));
		return true;
	}

	/** Advances one frame. Returns true once the whole action tree has completed. */
	tick(mascot: Mascot, dt: number, ledges: Ledge[], ambient: { x: number; y: number }, ctx: ExprContext, config: EngineConfig): boolean {
		for (let guard = 0; guard < 64; guard++) {
			if (this.stack.length === 0) return true;
			const frame = this.stack[this.stack.length - 1];
			const done = this.tickFrame(frame, mascot, dt, ledges, ambient, ctx, config);
			if (!done) return false;
			this.stack.pop();
		}
		console.warn(`[obsidian-shimeji] action chain exceeded iteration guard on "${this.pack.name}", aborting`);
		this.stack = [];
		return true;
	}

	private tickFrame(
		frame: Frame,
		mascot: Mascot,
		dt: number,
		ledges: Ledge[],
		ambient: { x: number; y: number },
		ctx: ExprContext,
		config: EngineConfig,
	): boolean {
		switch (frame.action.type) {
			case "Sequence":
				return this.tickSequence(frame);
			case "Select":
				return this.tickSelect(frame, ctx);
			case "Embedded":
				return this.tickEmbedded(frame, mascot, dt, ledges, ambient, config);
			case "Move":
				return this.tickPoseSequence(frame, mascot, dt, true);
			case "Stay":
			case "Animate":
			default:
				return this.tickPoseSequence(frame, mascot, dt, false);
		}
	}

	private tickSequence(frame: Frame): boolean {
		if (frame.childStarted) {
			frame.childStarted = false;
			frame.childIndex++;
		}
		while (frame.childIndex < frame.action.children.length) {
			const ref = frame.action.children[frame.childIndex];
			if (this.pushAction(ref.name)) {
				frame.childStarted = true;
				return false;
			}
			frame.childIndex++;
		}
		return true;
	}

	private tickSelect(frame: Frame, ctx: ExprContext): boolean {
		if (frame.childStarted) return true;
		for (const ref of frame.action.children) {
			if (evaluateCondition(ref.condition, ctx) && this.pushAction(ref.name)) {
				frame.childStarted = true;
				return false;
			}
		}
		return true;
	}

	private tickPoseSequence(frame: Frame, mascot: Mascot, dt: number, applyVelocity: boolean): boolean {
		const poses = frame.action.poses;
		if (poses.length === 0) return true;
		const pose = poses[frame.poseIndex];
		this.showPose(mascot, pose);
		if (applyVelocity && pose.velocity) {
			mascot.physics.x += pose.velocity.x * dt;
			mascot.physics.y += pose.velocity.y * dt;
		}
		frame.poseElapsedMs += dt * 1000;
		if (frame.poseElapsedMs < pose.durationMs) return false;
		frame.poseElapsedMs = 0;
		frame.poseIndex++;
		if (frame.poseIndex < poses.length) return false;
		if (frame.action.loop) {
			frame.poseIndex = 0;
			return false;
		}
		return true;
	}

	private tickEmbedded(
		frame: Frame,
		mascot: Mascot,
		dt: number,
		ledges: Ledge[],
		ambient: { x: number; y: number },
		config: EngineConfig,
	): boolean {
		if (frame.action.poses.length > 0) {
			this.showPose(mascot, pickLoopingPose(frame.action.poses, frame.embeddedElapsedMs));
			frame.embeddedElapsedMs += dt * 1000;
		}
		return applyNativeEmbedded(frame.action.embeddedName ?? frame.action.name, mascot, dt, ledges, ambient, config);
	}

	private showPose(mascot: Mascot, pose: PoseDef): void {
		mascot.setVisualImage(this.pack.resolveImage(pose.image), pose.anchor);
	}
}
