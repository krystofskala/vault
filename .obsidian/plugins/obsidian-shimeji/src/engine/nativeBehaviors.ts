import { findFloorBelow, findWallAt } from "./Ledges";
import type { EngineConfig, Ledge, MascotPhysics, PointerState, WallLedge } from "./types";
import type { Random } from "./Random";

export interface TickArgs {
	physics: MascotPhysics;
	ledges: Ledge[];
	dt: number;
	config: EngineConfig;
}

/** Integrates gravity and snaps to a floor if one is crossed. Shared safety net used by
 * every native behavior so a mascot never gets stuck floating if its platform disappears. */
export function applyGravityAndLand(args: TickArgs): boolean {
	const { physics, ledges, dt, config } = args;
	if (physics.grounded) {
		const stillThere = physics.currentFloor
			? findFloorBelow(ledges, physics.x, physics.y - 0.5) === physics.currentFloor
			: false;
		if (stillThere) return true;
		physics.grounded = false;
	}

	// Find the candidate floor using the pre-step position: querying with the
	// post-step position would let a single large step (high dt, high vy) land past
	// floor.y + 0.5 and get excluded as "already behind us", falling through forever.
	const floor = findFloorBelow(ledges, physics.x, physics.y);

	physics.vy += config.gravity * dt;
	physics.x += physics.vx * dt;
	physics.y += physics.vy * dt;

	if (floor && physics.y >= floor.y) {
		physics.y = floor.y;
		physics.vy = 0;
		physics.vx = 0;
		physics.grounded = true;
		physics.currentFloor = floor;
		return true;
	}
	return false;
}

export function tickFall(args: TickArgs): { landed: boolean } {
	const landed = applyGravityAndLand(args);
	return { landed };
}

export interface WalkState {
	direction: 1 | -1;
	remaining: number;
}

export function pickWalk(rng: Random): WalkState {
	return { direction: rng.chance(0.5) ? 1 : -1, remaining: rng.range(0.6, 2.5) };
}

/** Returns false once the walk should end (ran out of time or hit the edge of its floor). */
export function tickWalk(args: TickArgs, walk: WalkState, speedScale = 1): boolean {
	const { physics, config, dt } = args;
	if (!applyGravityAndLand(args)) return true;

	const floor = physics.currentFloor;
	physics.vx = walk.direction * config.walkSpeed * speedScale;
	physics.facing = walk.direction;
	physics.x += physics.vx * dt;
	walk.remaining -= dt;

	if (floor && floor.kind === "floor") {
		if (physics.x <= floor.x1) {
			physics.x = floor.x1;
			return false;
		}
		if (physics.x >= floor.x2) {
			physics.x = floor.x2;
			return false;
		}
	}
	return walk.remaining > 0;
}

export function tickChaseMouse(args: TickArgs, pointer: { x: number; y: number }, dashScale = 1.4): boolean {
	const { physics, config, dt } = args;
	applyGravityAndLand(args);
	const dx = pointer.x - physics.x;
	const reached = Math.abs(dx) < 6;
	if (!reached) {
		physics.facing = dx > 0 ? 1 : -1;
		physics.x += physics.facing * config.walkSpeed * dashScale * dt;
	}
	return reached;
}

export function tickDragged(physics: MascotPhysics, pointer: PointerState, grabOffset: { x: number; y: number }): void {
	physics.x = pointer.x - grabOffset.x;
	physics.y = pointer.y - grabOffset.y;
	physics.grounded = false;
	physics.currentFloor = undefined;
}

/** Average velocity over the pointer's recent history, used to launch a Thrown action on release. */
export function computeReleaseVelocity(pointer: PointerState, config: EngineConfig): { vx: number; vy: number } {
	const samples = pointer.history;
	if (samples.length < 2) return { vx: 0, vy: 0 };
	const first = samples[0];
	const last = samples[samples.length - 1];
	const dtMs = last.t - first.t;
	if (dtMs <= 0) return { vx: 0, vy: 0 };
	const vx = ((last.x - first.x) / dtMs) * 1000 * config.dragThrowScale;
	const vy = ((last.y - first.y) / dtMs) * 1000 * config.dragThrowScale;
	return { vx, vy };
}

export function tickThrown(args: TickArgs): { landed: boolean } {
	return tickFall(args);
}

export type ClimbDirection = "up" | "down";

/** Climbs the given wall ledge; returns false once it reaches the top/bottom of the wall span. */
export function tickClimbWall(args: TickArgs, wall: WallLedge, direction: ClimbDirection): boolean {
	const { physics, config, dt } = args;
	physics.grounded = false;
	physics.x = wall.x;
	const dy = direction === "up" ? -config.climbSpeed : config.climbSpeed;
	physics.y += dy * dt;
	if (direction === "up" && physics.y <= wall.y1) {
		physics.y = wall.y1;
		return false;
	}
	if (direction === "down" && physics.y >= wall.y2) {
		physics.y = wall.y2;
		return false;
	}
	return true;
}

export function findClingableWall(ledges: Ledge[], physics: MascotPhysics, reach: number): WallLedge | undefined {
	return (
		findWallAt(ledges, physics.x, physics.y, "left", reach) ??
		findWallAt(ledges, physics.x, physics.y, "right", reach)
	);
}
