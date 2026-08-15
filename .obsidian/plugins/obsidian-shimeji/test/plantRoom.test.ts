import { describe, expect, it } from "vitest";
import { layoutRoom, shouldMirror } from "../src/room/RoomGeometry";
import { LIVING_ROOM, roomSurfaces, roomWalls } from "../src/room/roomDef";
import { APARTMENT } from "../src/room/apartment";
import { CELLAR } from "../src/room/cellar";
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

/**
 * The apartment is supplied artwork with geometry authored on top, so unlike the painted room its
 * picture and its surfaces *can* disagree — an image knows nothing about the lines drawn over it.
 * Nothing here can check the lines are in the right place on the picture (that is what the surface
 * overlay is for). What it can check is that they form a coherent world: closed, connected, and
 * reachable without depending on a jump whose reach changes with the pane's width.
 */
describe.each([
	["the apartment", APARTMENT],
	["the cellar", CELLAR],
])("%s", (_name, ROOM) => {
	const layout = layoutRoom(ROOM, RIGHT_SIDEBAR, VIEWPORT_W)!;
	const ledges = layout.ledges();

	it("fills the pane without distorting the artwork", () => {
		// The user's one requirement about how it is drawn: 1:1, with only the dark surround giving.
		for (const pane of [RIGHT_SIDEBAR, LEFT_SIDEBAR, { left: 0, top: 0, right: 900, bottom: 400 }]) {
			const l = layoutRoom(ROOM, pane, VIEWPORT_W)!;
			const drawnW = l.rect.right - l.rect.left;
			const drawnH = l.rect.bottom - l.rect.top;
			expect(drawnW / drawnH, "the room square came out non-square").toBeCloseTo(ROOM.width / ROOM.height, 6);
			expect(drawnW).toBeLessThanOrEqual(pane.right - pane.left + 0.001);
			expect(drawnH).toBeLessThanOrEqual(pane.bottom - pane.top + 0.001);
		}
	});

	it("is never flipped, but still puts the threshold on the side facing the workspace", () => {
		// Supplied artwork is not mirrored — there is no drawn door to mirror for, and flipping
		// somebody's illustration to suit a sidebar takes a liberty with it.
		const right = layoutRoom(ROOM, RIGHT_SIDEBAR, VIEWPORT_W)!;
		const left = layoutRoom(ROOM, LEFT_SIDEBAR, VIEWPORT_W)!;
		expect(right.mirrored).toBe(false);
		expect(left.mirrored).toBe(false);
		// The threshold still moves, so a mascot always arrives at the near side.
		expect(right.doorOutside().x).toBe(RIGHT_SIDEBAR.left);
		expect(left.doorOutside().x).toBe(LEFT_SIDEBAR.right);
		expect(right.doorInside().x).toBeLessThan((right.rect.left + right.rect.right) / 2);
		expect(left.doorInside().x).toBeGreaterThan((left.rect.left + left.rect.right) / 2);
	});

	it("has floor under every part a mascot can be in", () => {
		// The drawn square is wider than the floor — an isometric room's corners are surround — so
		// this is the walkable box, which is exactly the distinction that keeps a resident dropped
		// near the edge from falling out of the world.
		for (let x = layout.walkable.left + 2; x < layout.walkable.right - 2; x += 2) {
			expect(findFloorBelow(ledges, x, layout.walkable.top + 2), `nothing under x=${Math.round(x)}`).toBeDefined();
		}
		expect(layout.walkable.right - layout.walkable.left).toBeLessThan(layout.rect.right - layout.rect.left);
	});

	it("connects the floor to every piece of furniture without needing a jump", () => {
		// Jump reach is a fixed number of screen pixels while the room's own scale follows the pane,
		// so a room that depended on jumps would connect at a wide sidebar and come apart at a
		// narrow one. Routing with jumps disabled proves every surface has a climbable face.
		const noJumping = { arriveWithin: 12, travelTimeWeight: 0.05, maxJumpDx: 0, maxJumpUp: 0 };
		const start = layout.doorInside();
		const floors = ledges.filter((l): l is Extract<Ledge, { kind: "floor" }> => l.kind === "floor");
		expect(floors.length).toBeGreaterThan(5);
		for (const floor of floors) {
			const target = { x: (floor.x1 + floor.x2) / 2, y: floor.y };
			const route = findRoute(ledges, start, target, undefined, noJumping);
			const end = route.length > 0 ? route[route.length - 1] : start;
			const miss = Math.hypot(end.x - target.x, end.y - target.y);
			expect(miss, `cannot climb to the surface at y=${Math.round(floor.y)} without jumping`).toBeLessThan(24);
		}
	});

	it("holds together at any sidebar width", () => {
		// The same reachability, across the range of widths a sidebar actually takes. The point is
		// that nothing about the room's connectivity may depend on how big it happens to be drawn —
		// which is exactly what would happen if any surface were reachable only by jumping.
		const noJumping = { arriveWithin: 12, travelTimeWeight: 0.05, maxJumpDx: 0, maxJumpUp: 0 };
		for (const width of [200, 260, 320, 420, 560]) {
			const l = layoutRoom(ROOM, { left: 1420, top: 120, right: 1420 + width, bottom: 1360 }, VIEWPORT_W)!;
			const ls = l.ledges();
			for (const floor of ls.filter((x): x is Extract<Ledge, { kind: "floor" }> => x.kind === "floor")) {
				const target = { x: (floor.x1 + floor.x2) / 2, y: floor.y };
				const route = findRoute(ls, l.doorInside(), target, undefined, noJumping);
				const end = route.length > 0 ? route[route.length - 1] : l.doorInside();
				expect(Math.hypot(end.x - target.x, end.y - target.y), `the surface at room y=${Math.round(l.toRoom(0, floor.y).y)} is unreachable at a ${width}px sidebar`).toBeLessThan(24);
			}
		}
	});

	it("cannot be left", () => {
		const start = layout.doorInside();
		for (const target of [
			{ x: 0, y: 200 },
			{ x: VIEWPORT_W, y: 200 },
			{ x: 700, y: 1390 },
			{ x: 700, y: 40 },
		]) {
			const route = findRoute(ledges, start, target, undefined, { arriveWithin: 40, travelTimeWeight: 0.05 });
			for (const step of route) {
				expect(step.x).toBeGreaterThanOrEqual(layout.rect.left - 1);
				expect(step.x).toBeLessThanOrEqual(layout.rect.right + 1);
				expect(step.y).toBeGreaterThanOrEqual(layout.rect.top - 1);
				expect(step.y).toBeLessThanOrEqual(layout.rect.bottom + 1);
			}
		}
	});

	it("keeps every authored surface inside the walkable box", () => {
		// A surface outside the containing walls is a place the resident can be pulled back from but
		// never legitimately stand, which reads as furniture that cannot be climbed onto.
		const box = ROOM.fixtures.find((f) => f.id === "room")!;
		const floor = box.surfaces!.find((s) => s.label === "floor")!;
		for (const fixture of ROOM.fixtures) {
			for (const s of fixture.surfaces ?? []) {
				expect(s.x1, `${fixture.id}/${s.label} starts outside the room`).toBeGreaterThanOrEqual(floor.x1);
				expect(s.x2, `${fixture.id}/${s.label} ends outside the room`).toBeLessThanOrEqual(floor.x2);
				expect(s.y, `${fixture.id}/${s.label} is below the floor`).toBeLessThanOrEqual(floor.y);
			}
			for (const w of fixture.walls ?? []) {
				expect(w.x, `${fixture.id}/${w.label} is outside the room`).toBeGreaterThanOrEqual(floor.x1);
				expect(w.x).toBeLessThanOrEqual(floor.x2);
			}
		}
	});
});

describe("the walkable box", () => {
	it("is where the floor is, in both rooms", () => {
		// Derived from each room's own extremes rather than declared, so it cannot fall out of step
		// with the surfaces. The painted room's floor runs wall to wall, so its box is the full
		// width; the apartment's is narrower than its picture.
		const painted = layoutRoom(LIVING_ROOM, RIGHT_SIDEBAR, VIEWPORT_W)!;
		expect(painted.walkable.left).toBe(painted.rect.left);
		expect(painted.walkable.right).toBe(painted.rect.right);
		// ...but still above the floorboards drawn below the floor line.
		expect(painted.walkable.bottom).toBeLessThan(painted.rect.bottom);

		const flat = layoutRoom(APARTMENT, RIGHT_SIDEBAR, VIEWPORT_W)!;
		expect(flat.walkable.left).toBeGreaterThan(flat.rect.left);
		expect(flat.walkable.right).toBeLessThan(flat.rect.right);
		expect(flat.walkable.bottom).toBeLessThan(flat.rect.bottom);
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
		expect(roomStyle("no-such-room").id).toBe("apartment");
		expect(roomStyle(undefined).id).toBe("apartment");
	});

	it("gives each illustrated room its own file, and the painted one none", () => {
		// Two rooms sharing a filename would mean switching between them silently showed the wrong
		// picture over the other's geometry.
		const files = ROOM_STYLE_IDS.map((id) => ROOM_STYLES[id].imageBase).filter((f): f is string => f !== undefined);
		expect(new Set(files).size).toBe(files.length);
		expect(ROOM_STYLES.painted.imageBase).toBeUndefined();
	});

	it("matches each room's coordinate space to its artwork's shape", () => {
		// The room box has to be the artwork's aspect or the picture is letterboxed inside its own
		// room, leaving surround where the geometry says there is floor.
		expect(APARTMENT.width / APARTMENT.height).toBeCloseTo(1, 3);
		expect(CELLAR.width / CELLAR.height).toBeCloseTo(1280 / 896, 2);
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
