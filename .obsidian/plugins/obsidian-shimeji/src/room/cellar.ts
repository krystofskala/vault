import type { RoomDef, RoomFixture } from "./roomDef";

/**
 * The cellar: a second piece of supplied isometric artwork — a timber grow-room with a hydroponic
 * rack, a tank of seedlings, a heater and an armchair.
 *
 * Same arrangement as the apartment (see apartment.ts): the picture is a file the user drops in, and
 * this is only the collision geometry that goes with it. What differs is the shape. The apartment is
 * square; this one is landscape, so the room's coordinate space is 100 x 70 to match.
 *
 * Coordinates are **percent of the room's width** on *both* axes — not percent of each axis
 * separately. That keeps one unit the same size horizontally and vertically, which every distance in
 * the engine assumes: a climb of 10 and a walk of 10 have to cover the same ground, or the router
 * would cost vertical travel wrongly and the surfaces would sit at the wrong heights.
 */

const WIDTH = 100;
/** 896/1280 of the width, so the room's box matches the artwork and the picture fills it exactly. */
const HEIGHT = 70;

/** The walkable box. The floor line is set across the widest part of the floorboards, in front of
 * the furniture rather than at the diamond's front point — that is the placement that spans most of
 * the room while still reading as floor. */
const FLOOR_Y = 55;
const CEILING_Y = 15;
const LEFT_X = 14;
const RIGHT_X = 86;

function surfacesOnly(id: string, fixture: Omit<RoomFixture, "id" | "paint">): RoomFixture {
	return { id, paint: () => {}, ...fixture };
}

export const CELLAR: RoomDef = {
	width: WIDTH,
	height: HEIGHT,
	ceilingY: CEILING_Y,
	floorY: FLOOR_Y,
	mirrorable: false,
	integerScale: false,
	background: "image",
	door: { x1: LEFT_X, x2: LEFT_X + 8, y: FLOOR_Y },
	fixtures: [
		surfacesOnly("room", {
			surfaces: [
				{ kind: "floor", y: FLOOR_Y, x1: LEFT_X, x2: RIGHT_X, label: "floor" },
				// Only the span where the ceiling is actually overhead. The artwork's ceiling recedes
				// towards both side walls, so a full-width one would have a mascot hanging in the
				// surround at either end.
				{ kind: "ceiling", y: CEILING_Y, x1: 30, x2: 70, label: "ceiling" },
			],
			walls: [
				{ side: "left", x: LEFT_X, y1: CEILING_Y, y2: FLOOR_Y, label: "room edge" },
				{ side: "right", x: RIGHT_X, y1: CEILING_Y, y2: FLOOR_Y, label: "room edge" },
			],
		}),
		surfacesOnly("dresser", {
			surfaces: [{ kind: "floor", y: 43, x1: LEFT_X, x2: 30, label: "dresser" }],
			walls: [{ side: "right", x: 30, y1: 43, y2: FLOOR_Y, label: "dresser side" }],
		}),
		surfacesOnly("grow-rack", {
			surfaces: [
				{ kind: "floor", y: 24, x1: 27, x2: 51, label: "rack top" },
				{ kind: "floor", y: 35, x1: 26, x2: 51, label: "rack bench" },
				{ kind: "ceiling", y: 26, x1: 27, x2: 51, label: "under the rack top" },
			],
			// Full height, floor to top shelf: the rack is this room's main climb, the way the
			// bookshelf is the apartment's.
			walls: [
				{ side: "left", x: 26, y1: 24, y2: FLOOR_Y, label: "rack side" },
				{ side: "right", x: 51, y1: 24, y2: 35, label: "rack side" },
			],
		}),
		surfacesOnly("bench", {
			// The heater and the table beside it are drawn at the same height and touching, so they
			// are one surface rather than two. Two abutting floors would leave the router with no
			// edge between them — floors do not connect to each other sideways, only through a wall,
			// a jump or a drop — and the mascot could walk across the join but never plan to.
			surfaces: [
				{ kind: "floor", y: 38, x1: 43, x2: 71, label: "heater and table" },
				{ kind: "ceiling", y: 40, x1: 43, x2: 71, label: "under the table" },
			],
			walls: [{ side: "left", x: 51, y1: 38, y2: FLOOR_Y, label: "table side" }],
		}),
		surfacesOnly("tank", {
			surfaces: [{ kind: "floor", y: 28, x1: 54, x2: 68, label: "tank" }],
			walls: [{ side: "left", x: 54, y1: 28, y2: 38, label: "tank side" }],
		}),
		surfacesOnly("armchair", {
			surfaces: [
				{ kind: "floor", y: 44, x1: 66, x2: 78, label: "armchair seat" },
				{ kind: "floor", y: 36, x1: 72, x2: 80, label: "armchair back" },
			],
			walls: [
				{ side: "left", x: 66, y1: 44, y2: FLOOR_Y, label: "armchair side" },
				{ side: "left", x: 72, y1: 36, y2: 44, label: "armchair back" },
			],
		}),
		surfacesOnly("bucket", {
			surfaces: [{ kind: "floor", y: 49, x1: 77, x2: RIGHT_X, label: "bucket" }],
			walls: [{ side: "left", x: 77, y1: 49, y2: FLOOR_Y, label: "bucket side" }],
		}),
	],
};
