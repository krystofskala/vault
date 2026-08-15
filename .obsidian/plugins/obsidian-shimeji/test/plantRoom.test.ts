import { describe, expect, it } from "vitest";
import { layoutRoom, shouldMirror } from "../src/room/RoomGeometry";
import { LIVING_ROOM, roomSurfaces, roomWalls } from "../src/room/roomDef";
import { findRoute } from "../src/engine/Routing";
import { findFloorBelow } from "../src/engine/Ledges";
import type { Ledge, Rect } from "../src/engine/types";

/**
 * The plant room: a hand-authored world small enough to reason about exactly, which makes it a good
 * place to check the properties the whole feature rests on.
 *
 * The one that matters most is the last group: confinement is not a rule anyone enforces, it is the
 * absence of an edge in the graph. That only holds if the room's ledges genuinely do not reach the
 * workspace, so it is asserted rather than assumed.
 */

/** A right-hand sidebar on a 1748x1392 window — the layout the movement work was done against. */
const RIGHT_SIDEBAR: Rect = { left: 1420, top: 120, right: 1740, bottom: 1360 };
const LEFT_SIDEBAR: Rect = { left: 8, top: 120, right: 328, bottom: 1360 };
const VIEWPORT_W = 1748;

describe("plant room geometry", () => {
	it("scales by a whole number only", () => {
		// A fractional scale is what makes pixel art mush, so this is a hard requirement rather
		// than a nicety.
		for (let width = 150; width < 700; width += 7) {
			const layout = layoutRoom(LIVING_ROOM, { left: 0, top: 0, right: width, bottom: 1240 }, VIEWPORT_W);
			expect(layout, `no layout at pane width ${width}`).toBeDefined();
			expect(Number.isInteger(layout!.scale), `scale ${layout!.scale} at width ${width}`).toBe(true);
			expect(layout!.scale).toBeGreaterThanOrEqual(2);
		}
	});

	it("fits inside the pane it is given", () => {
		const layout = layoutRoom(LIVING_ROOM, RIGHT_SIDEBAR, VIEWPORT_W)!;
		expect(layout.rect.left).toBeGreaterThanOrEqual(RIGHT_SIDEBAR.left);
		expect(layout.rect.right).toBeLessThanOrEqual(RIGHT_SIDEBAR.right);
		expect(layout.rect.bottom).toBe(RIGHT_SIDEBAR.bottom);
	});

	it("puts the door on the side facing the rest of the window, in either sidebar", () => {
		// The whole reason mirroring exists: whichever sidebar the room is kept in, the mascot
		// arrives from the workspace and should find a door on that side rather than having to walk
		// around the room.
		expect(shouldMirror(RIGHT_SIDEBAR, VIEWPORT_W)).toBe(false);
		expect(shouldMirror(LEFT_SIDEBAR, VIEWPORT_W)).toBe(true);

		const right = layoutRoom(LIVING_ROOM, RIGHT_SIDEBAR, VIEWPORT_W)!;
		const left = layoutRoom(LIVING_ROOM, LEFT_SIDEBAR, VIEWPORT_W)!;
		expect(right.doorOutside().x).toBe(RIGHT_SIDEBAR.left);
		expect(left.doorOutside().x).toBe(LEFT_SIDEBAR.right);
		// And the drawn door follows: in a right sidebar it is on the room's left half.
		expect(right.doorInside().x).toBeLessThan((right.rect.left + right.rect.right) / 2);
		expect(left.doorInside().x).toBeGreaterThan((left.rect.left + left.rect.right) / 2);
	});

	it("mirrors walls' sides along with their positions", () => {
		// A mirrored left-hand face is a right-hand face. Get this wrong and the pack's own
		// `lookRight ? leftBorder : rightBorder` checks answer about the wrong face, which leaves
		// nothing eligible and ends in the respawn safety net.
		const left = layoutRoom(LIVING_ROOM, LEFT_SIDEBAR, VIEWPORT_W)!;
		const walls = left.ledges().filter((l): l is Extract<Ledge, { kind: "wall" }> => l.kind === "wall");
		const authored = roomWalls(LIVING_ROOM);
		expect(walls).toHaveLength(authored.length);
		// The room's own left wall is at room x=0, which after mirroring is the rightmost edge.
		const rightmost = walls.reduce((a, b) => (b.x > a.x ? b : a));
		expect(rightmost.side).toBe("right");
		expect(Math.round(rightmost.x)).toBe(Math.round(left.rect.right));
	});

	it("round-trips a point through the transform, mirrored or not", () => {
		for (const rect of [RIGHT_SIDEBAR, LEFT_SIDEBAR]) {
			const layout = layoutRoom(LIVING_ROOM, rect, VIEWPORT_W)!;
			for (const [rx, ry] of [
				[0, 0],
				[36, 70],
				[LIVING_ROOM.width, LIVING_ROOM.height],
			]) {
				const v = layout.toViewport(rx, ry);
				const back = layout.toRoom(v.x, v.y);
				expect(back.x).toBeCloseTo(rx, 6);
				expect(back.y).toBeCloseTo(ry, 6);
			}
		}
	});

	it("keeps every ledge span ordered left-to-right after mirroring", () => {
		// `x1 > x2` reads as a zero-width surface to every span test in the engine, so a mirrored
		// room would silently have no floors at all.
		const layout = layoutRoom(LIVING_ROOM, LEFT_SIDEBAR, VIEWPORT_W)!;
		for (const ledge of layout.ledges()) {
			if (ledge.kind === "wall") expect(ledge.y1).toBeLessThan(ledge.y2);
			else expect(ledge.x1).toBeLessThan(ledge.x2);
		}
	});
});

describe("plant room as a world", () => {
	const layout = layoutRoom(LIVING_ROOM, RIGHT_SIDEBAR, VIEWPORT_W)!;
	const ledges = layout.ledges();

	it("declares its art and its collision geometry together", () => {
		// The design's central claim. Every fixture that contributes a surface must also paint, so
		// nothing can be standable and invisible.
		for (const fixture of LIVING_ROOM.fixtures) {
			if (!fixture.surfaces?.length && !fixture.walls?.length) continue;
			expect(typeof fixture.paint, `${fixture.id} has geometry but no artwork`).toBe("function");
		}
		expect(roomSurfaces(LIVING_ROOM).length).toBeGreaterThanOrEqual(10);
	});

	it("has somewhere to stand under every point of the room", () => {
		// A room where a mascot can fall into a gap and keep going is a room with a hole in it.
		for (let rx = 1; rx < LIVING_ROOM.width; rx += 1) {
			const v = layout.toViewport(rx, LIVING_ROOM.ceilingY + 1);
			expect(findFloorBelow(ledges, v.x, v.y), `nothing under room x=${rx}`).toBeDefined();
		}
	});

	it("connects the floor to every standable surface", () => {
		// Furniture that cannot be reached is scenery. Routing from the doormat to each floor
		// surface has to produce a plan that actually arrives.
		const start = layout.doorInside();
		const floors = ledges.filter((l): l is Extract<Ledge, { kind: "floor" }> => l.kind === "floor");
		for (const floor of floors) {
			const target = { x: (floor.x1 + floor.x2) / 2, y: floor.y };
			const route = findRoute(ledges, start, target, undefined, { arriveWithin: 40, travelTimeWeight: 0.05 });
			const end = route.length > 0 ? route[route.length - 1] : start;
			const miss = Math.hypot(end.x - target.x, end.y - target.y);
			expect(miss, `no route from the door to the surface at y=${Math.round(floor.y)}`).toBeLessThan(48);
		}
	});

	it("cannot be left: no route reaches outside the room", () => {
		// Confinement is the absence of an edge, not a rule that gets checked — so what has to hold
		// is that the graph itself is closed. Aiming far outside in every direction must still land
		// on a surface inside the room.
		const start = layout.doorInside();
		const outside = [
			{ x: 0, y: 200 },
			{ x: VIEWPORT_W, y: 200 },
			{ x: 700, y: 1390 },
			{ x: 700, y: 40 },
			{ x: RIGHT_SIDEBAR.left - 300, y: RIGHT_SIDEBAR.top - 80 },
		];
		for (const target of outside) {
			const route = findRoute(ledges, start, target, undefined, { arriveWithin: 40, travelTimeWeight: 0.05 });
			for (const step of route) {
				expect(step.x, `route escaped to x=${Math.round(step.x)}`).toBeGreaterThanOrEqual(layout.rect.left - 1);
				expect(step.x).toBeLessThanOrEqual(layout.rect.right + 1);
				expect(step.y).toBeGreaterThanOrEqual(layout.rect.top - 1);
				expect(step.y).toBeLessThanOrEqual(layout.rect.bottom + 1);
			}
		}
	});

	it("puts the threshold on both sides of the same wall", () => {
		// The two door points are what the move-in and move-out transitions test proximity against.
		// They must be at the same height and on opposite sides of the pane edge, or a mascot can
		// arrive at one without ever being near the other.
		expect(layout.doorInside().y).toBe(layout.doorOutside().y);
		expect(layout.contains(layout.doorInside())).toBe(true);
		expect(layout.contains(layout.doorOutside())).toBe(false);
	});
});
