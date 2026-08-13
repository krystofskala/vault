import { debugLog } from "./debugLog";
import { findCeilingAt, findFloorBelow, findNearestFloorAt, findWallAt } from "./Ledges";
import type { EngineConfig, Ledge, MascotPhysics, Vec2, WallLedge } from "./types";
import type { Random } from "./Random";

export interface TickArgs {
	physics: MascotPhysics;
	ledges: Ledge[];
	dt: number;
	config: EngineConfig;
}

/**
 * Clamps horizontal position to the *screen's* own left/right edges, so a hard throw can't send
 * the mascot drifting off past the window edge into permanent freefall (once x is outside every
 * floor's x-range, nothing can ever land it again).
 *
 * **Window-sourced walls only.** This used to consider every wall ledge, pane sides included, by
 * taking `max(all left walls)` / `min(all right walls)` — which is only meaningful for walls that
 * genuinely bound the whole world. A *pane's* side is a local feature, not a boundary: with
 * Obsidian's ordinary side-by-side layout, the left sidebar's own right wall sits somewhere in the
 * middle of the screen, so `maxX` collapsed to that x for every mascot in the *entire* window,
 * including ones far to its right with nothing actually in their way. A mascot released anywhere
 * right of it got yanked to that exact coordinate on its very first falling tick, `vx` zeroed,
 * then immediately "caught" the pane wall it had just been teleported onto. Confirmed from a live
 * trace 2026-08-13: four separate releases from x=808, x=978 and two respawns all landed at
 * *precisely* `x: 482.16668701171875` — one shared pane edge, reached instantly, every time. That
 * is the "mascot doesn't trace any fall, it just teleports and snaps to a wall" report, and it
 * also explains why several earlier attempts (all aimed at window walls and worldTop) changed
 * nothing about it.
 *
 * Pane walls remain fully functional for what they're actually for — being climbed, grabbed and
 * detected (`findWallAt`/`findClingableWall`/`updateWallCeilingAdherence`, all untouched) — which
 * is also how the real engine treats a tracked window's edges: something to *land on* via border
 * detection, never something that rewrites the mascot's position from across the screen. The
 * window's own walls apply regardless of `y`, since this safety net must not have a gap above
 * `worldTop` (see Ledges.ts, where window walls start at `worldTop` for climbing purposes).
 */
export function clampToWalls(physics: MascotPhysics, ledges: Ledge[]): void {
	let minX = -Infinity;
	let maxX = Infinity;
	for (const ledge of ledges) {
		if (ledge.kind !== "wall" || ledge.source !== "window") continue;
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
	// Same idea, for the wall-catch check below: captured *before* this tick's own movement, so
	// it reflects whether the mascot was already sitting at a wall walking in versus this tick's
	// own motion being what brought it there. See that check's own comment for why the
	// distinction matters.
	const alreadyAtWall = findClingableWall(ledges, physics, 0.5) !== undefined;
	const prevX = physics.x;

	physics.vy += config.gravity * dt;
	physics.x += physics.vx * dt;
	physics.y += physics.vy * dt;
	clampToWalls(physics, ledges);
	clampToCeiling(physics, ledges);

	// Pane walls are deliberately *not* position-clamps (see clampToWalls — treating them as
	// global bounds is what teleported mascots across the screen), so catching one has to be a
	// genuine swept test: did this tick's own horizontal movement actually carry the mascot
	// across that wall's x, while its y was within the wall's real span? That's the same thing
	// clampToWalls used to provide here as a side effect, minus the part where a wall nowhere
	// near the mascot could still rewrite its position.
	const crossedWall = findCrossedWall(ledges, prevX, physics.x, physics.y);
	if (crossedWall) physics.x = crossedWall.x;

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
	// here only catches a genuine touch, not merely being nearby — *except* when the mascot was
	// already sitting at that exact wall before this tick even started (alreadyAtWall, captured
	// above): real bug found 2026-08-13 — a drag release right at the screen edge leaves
	// physics.x already pinned there by tickDragged's own clamp, before Fall/Thrown even begins,
	// so without this check the very first falling tick "caught" a wall it was never actually
	// flying into, reading as an instant catch with no visible fall at all. Skipping the catch
	// when it was already there lets gravity keep pulling it straight down (clampToWalls still
	// keeps x pinned, vx stays zeroed) until it reaches a real floor, same as the real engine's
	// own "slides down the side of a window" case. A genuine "flew diagonally into the side of a
	// window" case still crosses into reach fresh this tick (alreadyAtWall is false) and still
	// catches correctly, including when the approach was fast enough to need clamping — this
	// doesn't reopen the original bug that comment above describes.
	const wall = alreadyAtWall ? undefined : crossedWall ?? findClingableWall(ledges, physics, 0.5);
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

/**
 * Faithful port of the real engine's Jump.tick() — not a ballistic gravity arc (which is what
 * this used to be here): a constant-speed straight-line move toward the target, its own
 * direction vector recomputed fresh every tick from the *current* position, not a one-shot
 * initial velocity set once at the start. The real trick that makes it look like a hop despite
 * being dead straight-line motion at constant speed: `dy` subtracts half the remaining
 * horizontal distance, biasing the direction steeply upward while there's still a lot of ground
 * to cover left/right, and leveling out as it closes in — never any actual acceleration
 * involved. Snaps exactly onto the target and reports done once within one step of it.
 */
export function tickJump(physics: MascotPhysics, targetX: number, targetY: number, speed: number): boolean {
	physics.facing = physics.x < targetX ? 1 : -1;
	const dx = targetX - physics.x;
	const dy = targetY - physics.y - Math.abs(dx) / 2;
	const distance = Math.hypot(dx, dy);
	if (distance !== 0) {
		physics.x += (speed * dx) / distance;
		physics.y += (speed * dy) / distance;
	}
	physics.grounded = false;
	physics.currentFloor = undefined;
	if (distance <= speed) {
		physics.x = targetX;
		physics.y = targetY;
		return true;
	}
	return false;
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

/**
 * Faithful port of Location.set() (environment/Location.java), the real engine's own
 * `mascot.environment.cursor.dx/dy`: `dx = (dx + (newX - x)) / 2` — an exponential smoothing of
 * the raw per-tick pixel delta, with no explicit time base (it's implicitly per-Environment.tick,
 * i.e. per fixed 40ms simulation step, matching how this is meant to be called: once per fixed
 * tick with that tick's start/end ambient positions, not once per real mousemove event or render
 * frame). This same value is what the real pack's Thrown action reads directly as its release
 * velocity (`InitialVX="${mascot.environment.cursor.dx}"` in actions.xml) — not a separately
 * tuned "throw feel" heuristic, so getting this smoothing shape right matters beyond just
 * cursor.dx/dy expression lookups.
 */
export function smoothCursorVelocity(prevDelta: Vec2, prevPos: Vec2, newPos: Vec2): Vec2 {
	return {
		x: (prevDelta.x + (newPos.x - prevPos.x)) / 2,
		y: (prevDelta.y + (newPos.y - prevPos.y)) / 2,
	};
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

/**
 * Swept horizontal collision: the wall (if any) whose x lies between `fromX` and `toX` — i.e. one
 * this tick's own movement actually carried the mascot *through* — with `y` inside that wall's own
 * vertical span. Returns the first one encountered along the direction of travel, so a fast move
 * across several panes stops at the nearest rather than the furthest.
 *
 * Exists because pane walls are no longer position-clamps (see clampToWalls): they must still stop
 * a mascot that genuinely flies into them, but must never affect one that merely happens to be
 * elsewhere on the same row. A pure "am I near a wall right now" test can't distinguish those and
 * also tunnels straight through at speed; a swept test does both correctly.
 */
export function findCrossedWall(ledges: Ledge[], fromX: number, toX: number, y: number): WallLedge | undefined {
	if (fromX === toX) return undefined;
	const movingRight = toX > fromX;
	const lo = Math.min(fromX, toX);
	const hi = Math.max(fromX, toX);
	let best: WallLedge | undefined;
	for (const ledge of ledges) {
		if (ledge.kind !== "wall") continue;
		if (y < ledge.y1 || y > ledge.y2) continue;
		if (ledge.x < lo || ledge.x > hi) continue;
		// Strictly crossed, not merely "started exactly on it" — a mascot already resting against
		// a wall (vx pushing into it) would otherwise re-trigger a catch every single tick.
		if (ledge.x === fromX) continue;
		if (!best || (movingRight ? ledge.x < best.x : ledge.x > best.x)) best = ledge;
	}
	return best;
}

export function findClingableWall(ledges: Ledge[], physics: MascotPhysics, reach: number): WallLedge | undefined {
	return (
		findWallAt(ledges, physics.x, physics.y, "left", reach) ??
		findWallAt(ledges, physics.x, physics.y, "right", reach)
	);
}
