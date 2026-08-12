import { debugLog } from "./debugLog";
import { findCeilingAt, findFloorBelow, findNearestFloorAt, findWallAt } from "./Ledges";
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
		// Direction-agnostic re-check, not findFloorBelow: ledges are recomputed into fresh
		// objects on every window/pane resize, and if the window *shrinks*, the floor moves up
		// past the mascot's still-stale y — findFloorBelow's "at or below" rule would then find
		// nothing "below" that stale position and read as the floor having vanished, when it
		// really just moved. findNearestFloorAt re-anchors to wherever it is now instead.
		const stillThere = findNearestFloorAt(ledges, physics.x, physics.y);
		if (stillThere) {
			if (Math.abs(stillThere.y - physics.y) > 1) {
				debugLog("re-grounded after a ledge change", { x: physics.x, fromY: physics.y, toY: stillThere.y, source: stillThere.source });
			}
			physics.y = stillThere.y;
			physics.currentFloor = stillThere;
			return true;
		}
		debugLog("floor gone out from under a grounded mascot, falling", { x: physics.x, y: physics.y });
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
		debugLog("landed", { x: physics.x, y: floor.y, source: floor.source, vyAtLanding: physics.vy });
		physics.y = floor.y;
		physics.vy = 0;
		physics.vx = 0;
		physics.grounded = true;
		physics.currentFloor = floor;
		return true;
	}

	// Faithful to the real engine's Fall.hasNext(): `floor.isOn(pos) || wall.isOn(pos)` — touching
	// a wall ends a fall too, not just landing on a floor. clampToWalls above already snapped
	// physics.x exactly onto a wall's x if this tick's fall drifted past it, so a tight reach
	// here only catches a genuine touch, not merely being nearby. Without this, hitting a wall
	// mid-fall was invisible to Fall, so the Select right after it in the real Fall sequence
	// (Bounce+Stand vs GrabWall) could never actually reach the GrabWall branch from an ordinary
	// fall — falling into the side of a pane just silently clamped and kept falling past it.
	const wall = findClingableWall(ledges, physics, 0.5);
	if (wall) {
		debugLog("landed on a wall while falling", { x: physics.x, y: physics.y, side: wall.side, source: wall.source });
		physics.vx = 0;
		physics.vy = 0;
		physics.currentWall = wall;
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
 * Faithful port of the real engine's Dragged.java `tick()`:
 * `getMascot().setAnchor(new Point(cursor.getX(), cursor.getY() + 120));` — every tick, no
 * spring, no lerp, no per-click grab offset. The anchor just *is* the cursor position, offset
 * 120px down (holding the sprite by the scruff of the neck rather than wherever you happened
 * to click) — any "lag" or swing feel in the original comes entirely from the separate FootX
 * simulation below, never from the mascot's own rendered position. 120 is scaled by the
 * mascot's own render scale, which the original has no equivalent of (no runtime scale
 * slider), so it still lands in a sensible spot if the sprite's been resized. Still clamped to
 * the viewport: pointer capture can keep delivering coordinates past the window edge (or get
 * stuck there if the OS cursor leaves the window before releasing), and without a clamp here
 * that reads back as the mascot vanishing off the side while "stuck" mid-drag.
 */
export function tickDragged(physics: MascotPhysics, pointer: Vec2, anchorOffsetY: number, viewport: { width: number; height: number }): void {
	physics.x = Math.max(0, Math.min(viewport.width, pointer.x));
	physics.y = Math.max(0, Math.min(viewport.height, pointer.y + anchorOffsetY));
	physics.grounded = false;
	physics.currentFloor = undefined;
}

/**
 * Faithful port of Dragged.java's own FootX tracking:
 * `footDx = (footDx + (cursor.x - footX) * 0.1) * 0.8; footX += footDx;` — a *separate*,
 * independently-lagging simulation of "where the foot/anchor appears to trail from",
 * decoupled from the mascot's own (instant, unlagged — see tickDragged) position. The real
 * Pinched action's five lean poses compare this against the live, un-lagged cursor.x
 * (`mascot.environment.cursor.x`) to gauge how hard the mascot is being swung; this recurrence
 * is the entire source of that effect in the original, not any property of the rendered
 * position itself. Units are screen pixels per tick, at the real engine's own fixed tick rate.
 */
export function tickDragFootX(footX: number, footDx: number, cursorX: number): { footX: number; footDx: number } {
	const nextFootDx = (footDx + (cursorX - footX) * 0.1) * 0.8;
	return { footX: footX + nextFootDx, footDx: nextFootDx };
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
