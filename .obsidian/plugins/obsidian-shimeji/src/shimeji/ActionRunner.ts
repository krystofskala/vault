import type { Mascot } from "../engine/Mascot";
import type { EngineConfig, Ledge } from "../engine/types";
import { SHIMEJI_TICK_MS, SHIMEJI_TICKS_PER_SEC } from "./constants";
import { evaluate, evaluateCondition, parseParamValue, withLocals, type ExprContext, type ExprValue } from "./Expression";
import { applyNativeEmbedded } from "./nativeAdapter";
import { pickLoopingPose } from "./poseUtil";
import type { ActionDef, MascotPack, PoseDef } from "./types";

export interface PushEnv {
	mascot: Mascot;
	ctx: ExprContext;
	ambient: { x: number; y: number };
	config: EngineConfig;
}

interface Frame {
	action: ActionDef;
	poses: PoseDef[];
	locals: Record<string, ExprValue>;
	childIndex: number;
	childStarted: boolean;
	poseIndex: number;
	poseElapsedMs: number;
	embeddedElapsedMs: number;
	instantComplete: boolean;
}

const DEFERRED_PARAMS = new Set(["TargetX", "TargetY", "Duration"]);

/** Evaluates an ActionReference's paramOverrides into locals, two-phase so an expression like
 * `TargetX="#{cursor.x+Gap}" Gap="${...}"` can reference its own sibling parameter regardless
 * of attribute order (TargetX, TargetY and Duration are deferred until everything else is
 * resolved, see DEFERRED_PARAMS). */
function resolveLocals(overrides: Record<string, string> | undefined, baseCtx: ExprContext): Record<string, ExprValue> {
	if (!overrides) return {};
	const locals: Record<string, ExprValue> = {};
	for (const [key, raw] of Object.entries(overrides)) {
		if (DEFERRED_PARAMS.has(key)) continue;
		locals[key] = evaluate(parseParamValue(raw), baseCtx);
	}
	const ctxWithLocals = withLocals(baseCtx, locals);
	for (const key of DEFERRED_PARAMS) {
		if (overrides[key] === undefined) continue;
		locals[key] = evaluate(parseParamValue(overrides[key]), ctxWithLocals);
	}
	return locals;
}

function numOrUndefined(v: ExprValue): number | undefined {
	return typeof v === "number" ? v : undefined;
}

/** Frame-by-frame interpreter for a single named Action (and whatever it references). See
 * PackDriver/BehaviorAI for how this fits into the overall pack-driven mascot. */
export class ActionRunner {
	private stack: Frame[] = [];

	constructor(private pack: MascotPack) {}

	get isRunning(): boolean {
		return this.stack.length > 0;
	}

	start(name: string, env: PushEnv, overrides?: Record<string, string>): boolean {
		this.stack = [];
		return this.pushAction(name, env, overrides);
	}

	private pushAction(name: string, env: PushEnv, overrides?: Record<string, string>): boolean {
		const def = this.pack.actions.get(name);
		if (!def) {
			console.warn(`[obsidian-shimeji] unknown action "${name}" referenced, skipping`);
			return false;
		}

		const locals = resolveLocals(overrides, env.ctx);
		const ctxWithLocals = withLocals(env.ctx, locals);
		const poses = this.chooseAnimation(def, ctxWithLocals);
		const frame: Frame = {
			action: def,
			poses,
			locals,
			childIndex: 0,
			childStarted: false,
			poseIndex: 0,
			poseElapsedMs: 0,
			embeddedElapsedMs: 0,
			instantComplete: false,
		};

		if (def.type === "Move" && numOrUndefined(locals.TargetX) !== undefined) {
			env.mascot.physics.facing = (locals.TargetX as number) >= env.mascot.physics.x ? 1 : -1;
		}

		if (def.type === "Embedded") this.applyEmbeddedStartEffects(def, frame, env);

		this.stack.push(frame);
		return true;
	}

	private applyEmbeddedStartEffects(def: ActionDef, frame: Frame, env: PushEnv): void {
		const { mascot, ambient, config } = env;
		const initialVX = numOrUndefined(frame.locals.InitialVX);
		const initialVY = numOrUndefined(frame.locals.InitialVY);
		if (initialVX !== undefined) mascot.physics.vx = initialVX * SHIMEJI_TICKS_PER_SEC;
		if (initialVY !== undefined) mascot.physics.vy = initialVY * SHIMEJI_TICKS_PER_SEC;
		if (initialVX !== undefined || initialVY !== undefined) mascot.physics.grounded = false;

		switch (def.embeddedName) {
			case "Offset":
				mascot.physics.x += numOrUndefined(frame.locals.X) ?? 0;
				mascot.physics.y += numOrUndefined(frame.locals.Y) ?? 0;
				frame.instantComplete = true;
				break;
			case "Look": {
				const lookRight = frame.locals.LookRight;
				mascot.physics.facing = typeof lookRight === "boolean" ? (lookRight ? 1 : -1) : ambient.x >= mascot.physics.x ? 1 : -1;
				frame.instantComplete = true;
				break;
			}
			case "Jump": {
				const targetX = numOrUndefined(frame.locals.TargetX) ?? mascot.physics.x;
				const targetY = numOrUndefined(frame.locals.TargetY) ?? mascot.physics.y;
				const dx = targetX - mascot.physics.x;
				const dy = targetY - mascot.physics.y;
				const flightSeconds = Math.max(0.25, Math.sqrt((2 * Math.max(40, Math.abs(dy))) / config.gravity));
				mascot.physics.vx = dx / flightSeconds;
				mascot.physics.vy = (dy - 0.5 * config.gravity * flightSeconds * flightSeconds) / flightSeconds;
				mascot.physics.grounded = false;
				break;
			}
		}
	}

	private chooseAnimation(def: ActionDef, ctx: ExprContext): PoseDef[] {
		for (const variant of def.animations) {
			if (evaluateCondition(variant.condition, ctx)) return variant.poses;
		}
		return def.animations[0]?.poses ?? [];
	}

	/** Advances one frame. Returns true once the whole action tree has completed. */
	tick(env: PushEnv, dt: number, ledges: Ledge[]): boolean {
		for (let guard = 0; guard < 64; guard++) {
			if (this.stack.length === 0) return true;
			const frame = this.stack[this.stack.length - 1];
			const done = this.tickFrame(frame, env, dt, ledges);
			if (!done) return false;
			this.stack.pop();
		}
		console.warn(`[obsidian-shimeji] action chain exceeded iteration guard on "${this.pack.name}", aborting`);
		this.stack = [];
		return true;
	}

	private tickFrame(frame: Frame, env: PushEnv, dt: number, ledges: Ledge[]): boolean {
		switch (frame.action.type) {
			case "Sequence":
				return this.tickSequence(frame, env);
			case "Select":
				return this.tickSelect(frame, env);
			case "Move":
				return this.tickMove(frame, env, dt);
			case "Embedded":
				if (frame.action.embeddedName === "WalkWithIE") return this.tickMove(frame, env, dt);
				return this.tickEmbedded(frame, env, dt, ledges);
			case "Stay":
			case "Animate":
			default:
				return this.tickHold(frame, env, dt);
		}
	}

	private frameCtx(frame: Frame, env: PushEnv): ExprContext {
		return withLocals(env.ctx, frame.locals);
	}

	private tickSequence(frame: Frame, env: PushEnv): boolean {
		if (frame.childStarted) {
			frame.childStarted = false;
			frame.childIndex++;
		}
		const ctx = this.frameCtx(frame, env);
		while (frame.childIndex < frame.action.children.length) {
			const ref = frame.action.children[frame.childIndex];
			if (evaluateCondition(ref.condition, ctx) && this.pushAction(ref.name, env, ref.paramOverrides)) {
				frame.childStarted = true;
				return false;
			}
			frame.childIndex++;
		}
		return true;
	}

	private tickSelect(frame: Frame, env: PushEnv): boolean {
		if (frame.childStarted) return true;
		const ctx = this.frameCtx(frame, env);
		for (const ref of frame.action.children) {
			if (evaluateCondition(ref.condition, ctx) && this.pushAction(ref.name, env, ref.paramOverrides)) {
				frame.childStarted = true;
				return false;
			}
		}
		return true;
	}

	private tickHold(frame: Frame, env: PushEnv, dt: number): boolean {
		const poses = frame.poses;
		if (poses.length === 0) return true;
		const pose = poses[frame.poseIndex];
		this.showPose(env.mascot, pose);

		const durationOverride = numOrUndefined(frame.locals.Duration);
		const effectiveDuration = durationOverride !== undefined && poses.length === 1 ? durationOverride * SHIMEJI_TICK_MS : pose.durationMs;

		frame.poseElapsedMs += dt * 1000;
		if (frame.poseElapsedMs < effectiveDuration) return false;
		frame.poseElapsedMs = 0;
		frame.poseIndex++;
		if (frame.poseIndex < poses.length) return false;
		if (frame.action.loop) {
			frame.poseIndex = 0;
			return false;
		}
		return true;
	}

	private tickMove(frame: Frame, env: PushEnv, dt: number): boolean {
		const poses = frame.poses;
		if (poses.length === 0) return true;
		const pose = poses[frame.poseIndex];
		this.showPose(env.mascot, pose);
		const physics = env.mascot.physics;

		const targetX = numOrUndefined(frame.locals.TargetX);
		const targetY = numOrUndefined(frame.locals.TargetY);

		if (pose.velocity) {
			// Authored velocities assume the sprite faces left; -physics.facing flips the sign
			// so the same pose data works walking either direction (facing is pre-set to point
			// at the target when one is given, see pushAction).
			if (targetX !== undefined) {
				const prev = physics.x;
				physics.x += pose.velocity.x * -physics.facing * dt;
				if ((prev - targetX) * (physics.x - targetX) <= 0) {
					physics.x = targetX;
					return true;
				}
			} else {
				physics.x += pose.velocity.x * -physics.facing * dt;
			}

			if (targetY !== undefined) {
				const prev = physics.y;
				physics.y += pose.velocity.y * dt;
				if ((prev - targetY) * (physics.y - targetY) <= 0) {
					physics.y = targetY;
					return true;
				}
			} else {
				physics.y += pose.velocity.y * dt;
			}
		}

		frame.poseElapsedMs += dt * 1000;
		if (frame.poseElapsedMs < pose.durationMs) return false;
		frame.poseElapsedMs = 0;
		frame.poseIndex++;
		if (frame.poseIndex < poses.length) return false;
		// Exhausted the gait cycle: loop back around while a Target still hasn't been reached
		// (a long walk repeats the 4-pose cycle many times), otherwise this was a single
		// untargeted cycle and we're done.
		if (targetX !== undefined || targetY !== undefined || frame.action.loop) {
			frame.poseIndex = 0;
			return false;
		}
		return true;
	}

	private tickEmbedded(frame: Frame, env: PushEnv, dt: number, ledges: Ledge[]): boolean {
		if (frame.instantComplete) return true;
		if (frame.poses.length > 0) {
			this.showPose(env.mascot, pickLoopingPose(frame.poses, frame.embeddedElapsedMs));
			frame.embeddedElapsedMs += dt * 1000;
		}
		const raw = frame.action.embeddedName ?? frame.action.name;
		const mapped = raw === "FallWithIE" || raw === "ThrowIE" ? "Fall" : raw;
		return applyNativeEmbedded(mapped, env.mascot, dt, ledges, env.ambient, env.config, frame.action.params);
	}

	private showPose(mascot: Mascot, pose: PoseDef): void {
		mascot.setVisualImage(this.pack.resolveImage(pose.image), pose.anchor);
	}
}
