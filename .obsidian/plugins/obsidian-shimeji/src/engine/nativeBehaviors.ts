import { findCeilingAt, findFloorBelow, findWallAt } from "./Ledges";
import type { EngineConfig, Ledge, MascotPhysics, PointerState, Vec2, WallLedge } from "./types";
import type { Random } from "./Random";

export interface TickArgs {
	physics: MascotPhysics;
	ledges: Ledge[];
	dt: number;
	config: EngineConfig;
}

/** Clamps horizontal position to whichever left/right wall ledges bound the current y, so a
 * hard throw can't send the mascot drifting off past the window edge into permanent freefall
 * (once x is outside every floor's x-range, nothing can ever land it again). */
export function clampToWalls(physics: MascotPhysics, ledges: Ledge[]): void {
	let minX = -Infinity;
	let maxX = Infinity;
	for (const ledge of ledges) {
		if (ledge.kind !== "wall") continue;
		if (physics.y < ledge.y1 || physics.y > ledge.y2) continue;
		if (ledge.side === "left" && ledge.x > minX) minX = ledge.x;
		if (ledge.side === "right" && ledge.x < maxX) maxX = ledge.x;
	}
	if (physics.x < minX) {
		physics.x = minX;
		physics.vx = 0;
	} else if (physics.x > maxX) {
		physics.x = maxX;
		physics.vx = 0;
	}
}

/** Same idea as clampToWalls but for the top edge: a hard upward throw had nothing at all
 * stopping it (only the floor was ever checked), so it could sail straight through the
 * ceiling into permanent invisible freefall above the window. */
export function clampToCeiling(physics: MascotPhysics, ledges: Ledge[]): void {
	let maxCeilingY = -Infinity;
	for (const ledge of ledges) {
		if (ledge.kind !== "ceiling") continue;
		if (physics.x < ledge.x1 || physics.x > ledge.x2) continue;
		if (ledge.y > maxCeilingY) maxCeilingY = ledge.y;
	}
	if (maxCeilingY > -Infinity && physics.y < maxCeilingY) {
		physics.y = maxCeilingY;
		if (physics.vy < 0) physics.vy = 0;
	}
}

const WALL_CEILING_ADHERENCE_REACH = 4;

/**
 * Keeps physics.currentWall/currentCeiling fresh every tick — mirroring how gravity/landing
 * already keeps currentFloor fresh via applyGravityAndLand below, which real packs lean on for
 * mascot.environment.floor.isOn(...). A mascot can be "against a wall" (or under a ceiling)
 * regardless of what specific action put it there — most commonly, simply having walked into
 * one during an ordinary Floor-bordered Walk — so this can't be limited to only running during
 * an already-Wall/Ceiling-bordered action; it has to run unconditionally, every tick, the same
 * way gravity's floor check does, or the real pack's own "On the Wall"/"On IE's Side"/etc.
 * conditions could never become true in the first place (nothing else would ever set them).
 */
export function updateWallCeilingAdherence(physics: MascotPhysics, ledges: Ledge[]): void {
	physics.currentWall =
		findWallAt(ledges, physics.x, physics.y, "left", WALL_CEILING_ADHERENCE_REACH) ??
		findWallAt(ledges, physics.x, physics.y, "right", WALL_CEILING_ADHERENCE_REACH);
	physics.currentCeiling = findCeilingAt(ledges, physics.x, physics.y, WALL_CEILING_ADHERENCE_REACH);
}

/** Integrates gravity and snaps to a floor if one is crossed. Shared safety net used by
 * every native behavior so a mascot never gets stuck floating if its platform disappears. */
export function applyGravityAndLand(args: TickArgs): boolean {
	const { physics, ledges, dt, config } = args;
	if (physics.grounded) {
		// Compare by value, not by reference: ledges are recomputed into fresh objects
		// periodically, so a stale currentFloor reference would never match again even while
		// legitimately still standing on the (unchanged) same floor.
		const stillThere = findFloorBelow(ledges, physics.x, physics.y - 0.5);
		if (stillThere) {
			physics.currentFloor = stillThere;
			return true;
		}
		physics.grounded = false;
	}

	// Find the candidate floor using the pre-step position: querying with the
	// post-step position would let a single large step (high dt, high vy) land past
	// floor.y + 0.5 and get excluded as "already behind us", falling through forever.
	const floor = findFloorBelow(ledges, physics.x, physics.y);

	physics.vy += config.gravity * dt;
	physics.x += physics.vx * dt;
	physics.y += physics.vy * dt;
	clampToWalls(physics, ledges);
	clampToCeiling(physics, ledges);

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

/**
 * Follows the grabbed point every tick — at the current tick rate and springPerSecond, `t`
 * clamps to 1, so this is an instant snap rather than a real lag/spring (bumped up from a
 * genuinely springy feel per "drag was better before... stiff" — see computeLeanPointer for
 * why a pack's own lean-pose logic needs a separately-computed, deliberately lagged reading
 * instead of reusing this position directly). Also clamps to the viewport: pointer capture
 * can keep delivering coordinates past the window edge (or even get stuck there if the OS
 * cursor leaves the window before releasing), and without a clamp here that reads back as the
 * mascot vanishing off the side while "stuck" mid-drag.
 */
export function tickDragged(
	physics: MascotPhysics,
	pointer: PointerState,
	grabOffset: { x: number; y: number },
	dt: number,
	viewport: { width: number; height: number },
	springPerSecond = 28,
): void {
	const targetX = pointer.x - grabOffset.x;
	const targetY = pointer.y - grabOffset.y;
	const t = Math.min(1, springPerSecond * dt);
	physics.x += (targetX - physics.x) * t;
	physics.y += (targetY - physics.y) * t;
	physics.x = Math.max(0, Math.min(viewport.width, physics.x));
	physics.y = Math.max(0, Math.min(viewport.height, physics.y));
	physics.grounded = false;
	physics.currentFloor = undefined;
}

/**
 * A pack's own held-pose logic during a drag (e.g. the real Pinched action's five lean poses)
 * compares the mascot's own anchor against `mascot.environment.cursor.x/y`, expecting some
 * real, swing-direction-consistent gap between the two — the same way native OS mouse
 * delivery naturally lags a fast-moving cursor by a frame or so. But tickDragged's own
 * position (physics.x/y) already tracks the pointer with near-zero lag by design, so handing
 * that same reading back as "cursor" would make the comparison read as ~0 always, and mixing
 * in a *different*, independently-sampled ambient pointer (e.g. one tracked window-wide by
 * Stage) is worse: two separately-timed samples of "the same" cursor can disagree in either
 * direction from one tick to the next, flipping which side a lean pose reads as even while the
 * actual drag never changed direction. Extrapolating the drag's own recent swing velocity
 * forward by a small fixed lag reproduces a real, sign-consistent gap — proportional to how
 * hard the mascot is actually being swung, never flip-flopping — without touching how
 * snappily tickDragged itself tracks the pointer.
 */
export function computeLeanPointer(pointer: Vec2, swing: { vx: number; vy: number }, lagSeconds: number): { x: number; y: number; dx: number; dy: number } {
	return {
		x: pointer.x + swing.vx * lagSeconds,
		y: pointer.y + swing.vy * lagSeconds,
		dx: swing.vx,
		dy: swing.vy,
	};
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
