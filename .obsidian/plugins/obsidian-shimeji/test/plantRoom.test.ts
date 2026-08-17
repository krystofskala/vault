import { describe, expect, it } from "vitest";
import { layoutRoom, shouldMirror } from "../src/room/RoomGeometry";
import { LIVING_ROOM, roomSurfaces, roomWalls } from "../src/room/roomDef";
import { moodForHour } from "../src/room/roomArt";
import { ROOM_STYLES, ROOM_STYLE_IDS, roomStyle } from "../src/room/rooms";
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

	it("sits centred in the pane it is given", () => {
		// The geometry and the stylesheet place the room independently — one positions the ledges,
		// the other the canvas — so this is what keeps them agreeing. A room drawn centred with its
		// surfaces computed bottom-anchored would put the mascot on furniture that is not there.
		const layout = layoutRoom(LIVING_ROOM, RIGHT_SIDEBAR, VIEWPORT_W)!;
		expect(layout.rect.left).toBeGreaterThanOrEqual(RIGHT_SIDEBAR.left);
		expect(layout.rect.right).toBeLessThanOrEqual(RIGHT_SIDEBAR.right);
		expect(layout.rect.bottom).toBeLessThanOrEqual(RIGHT_SIDEBAR.bottom);
		const gapAbove = layout.rect.top - RIGHT_SIDEBAR.top;
		const gapBelow = RIGHT_SIDEBAR.bottom - layout.rect.bottom;
		expect(Math.abs(gapAbove - gapBelow), "the room is not centred vertically").toBeLessThanOrEqual(1);
		const gapLeft = layout.rect.left - RIGHT_SIDEBAR.left;
		const gapRight = RIGHT_SIDEBAR.right - layout.rect.right;
		expect(Math.abs(gapLeft - gapRight), "the room is not centred horizontally").toBeLessThanOrEqual(1);
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

describe("the walkable box", () => {
	it("is where the floor is", () => {
		// Derived from the room's own extremes rather than declared, so it cannot fall out of step
		// with the surfaces. The painted room's floor runs wall to wall, so its box is the full width.
		const painted = layoutRoom(LIVING_ROOM, RIGHT_SIDEBAR, VIEWPORT_W)!;
		expect(painted.walkable.left).toBe(painted.rect.left);
		expect(painted.walkable.right).toBe(painted.rect.right);
		// ...but still above the floorboards drawn below the floor line.
		expect(painted.walkable.bottom).toBeLessThan(painted.rect.bottom);
	});
});

describe("the rooms on offer", () => {
	it("names every style it lists, and falls back rather than throwing on an unknown one", () => {
		for (const id of ROOM_STYLE_IDS) {
			const style = ROOM_STYLES[id];
			expect(style, `${id} is listed but not defined`).toBeDefined();
			expect(style.id).toBe(id);
			expect(style.label.length).toBeGreaterThan(0);
		}
		// A settings file from a future version, or a hand-edited one, must not take the room down.
		// This also covers "office", the room this file used to name here before it was removed.
		expect(roomStyle("no-such-room").id).toBe("plant-room");
		expect(roomStyle("office").id).toBe("plant-room");
		expect(roomStyle(undefined).id).toBe("plant-room");
	});
});

describe("where the room sits in its pane", () => {
	it("is centred for every room, at every pane shape", () => {
		// Checked across shapes because a sidebar is far taller than any of these rooms while a room
		// dragged into the main area can be far wider — and the room should be in the middle of
		// whatever it is given, not pinned to an edge of it.
		const panes: Rect[] = [
			{ left: 1420, top: 120, right: 1740, bottom: 1360 },
			{ left: 8, top: 120, right: 328, bottom: 1360 },
			{ left: 200, top: 100, right: 1200, bottom: 500 },
			{ left: 0, top: 0, right: 400, bottom: 400 },
		];
		for (const id of ROOM_STYLE_IDS) {
			for (const pane of panes) {
				const l = layoutRoom(ROOM_STYLES[id].def, pane, VIEWPORT_W);
				if (!l) continue;
				expect(Math.abs(l.rect.top - pane.top - (pane.bottom - l.rect.bottom)), `${id} is off-centre vertically`).toBeLessThanOrEqual(1);
				expect(Math.abs(l.rect.left - pane.left - (pane.right - l.rect.right)), `${id} is off-centre horizontally`).toBeLessThanOrEqual(1);
			}
		}
	});
});

describe("the room's daylight", () => {
	it("moves continuously through the day rather than switching once", () => {
		// It was a boolean with a hard flip at 7pm. A day has more than two states, and the ones worth
		// looking at are the transitions.
		const samples = Array.from({ length: 48 }, (_, i) => moodForHour(i / 2).daylight);
		const distinct = new Set(samples.map((v) => v.toFixed(2)));
		expect(distinct.size, "the day only has a handful of light levels").toBeGreaterThan(12);
		// And it moves smoothly — no step bigger than a fifth between half-hours.
		for (let i = 1; i < samples.length; i++) {
			expect(Math.abs(samples[i] - samples[i - 1]), `a jump at ${i / 2}:00`).toBeLessThan(0.2);
		}
	});

	it("is brightest around midday and dark in the small hours", () => {
		expect(moodForHour(12).daylight).toBeGreaterThan(0.9);
		expect(moodForHour(3).daylight).toBeLessThan(0.05);
		expect(moodForHour(23).daylight).toBeLessThan(0.05);
	});

	it("is warm at dawn and sunset, and cold in between and after", () => {
		// The two moments the light is amber, which is what a single brightness value cannot express:
		// the blue hour is dim *and* cold, and looks nothing like the equally dim sunset before it.
		expect(moodForHour(6.5).warmth).toBeGreaterThan(0.5);
		expect(moodForHour(19).warmth).toBeGreaterThan(0.5);
		expect(moodForHour(12).warmth).toBeLessThan(0.2);
		expect(moodForHour(21.5).warmth, "the blue hour came out warm").toBeLessThan(0.1);
	});

	it("wraps, and survives an hour outside the day", () => {
		expect(moodForHour(24).daylight).toBeCloseTo(moodForHour(0).daylight, 5);
		expect(() => moodForHour(-3)).not.toThrow();
		expect(() => moodForHour(99)).not.toThrow();
		expect(moodForHour(-3).daylight).toBeGreaterThanOrEqual(0);
	});

	it("still answers the one question the older rooms ask", () => {
		// The painted nook and both photographed rooms only want to know whether it is dark out, and
		// their appearance should not have shifted when this became a curve.
		expect(moodForHour(2).dusk).toBe(true);
		expect(moodForHour(13).dusk).toBe(false);
		expect(moodForHour(21).dusk).toBe(true);
	});
});
