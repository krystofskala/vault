import { PALETTE, type Painter, type RoomDef, type RoomFixture } from "./roomDef";

/**
 * The office: a desk, a PC, and a mascot sitting at it.
 *
 * **Invented**, and drawn by this plugin rather than supplied — so, like the plant nook, each
 * fixture's picture and its collision geometry are one declaration and cannot drift apart.
 *
 * Two things make this room different from the others, and both come straight from what it is for.
 *
 * **The resident is behind the furniture.** The desk, monitor and keyboard are on the `foreground`
 * layer, which is painted onto a canvas above the mascot instead of below it. That is what makes the
 * mascot read as sitting *at* the desk rather than in front of it — the desktop crosses its body and
 * hides everything from the chest down, the way sitting at a real desk does.
 *
 * **It does not wander.** Not by a rule, and not by a leash: the room simply contains one short
 * floor, behind the desk, with a wall at either end. There is nowhere else to be, so the pack's own
 * idling plays out on the spot. That is the same mechanism confinement already uses one level up —
 * substitute the world rather than police the movement — applied once more, in the small.
 */

const W = 88;
const H = 72;
const FLOOR_Y = 52;
/**
 * The desktop. The resident stands behind it on the floor below, so this line is also what crosses
 * its body — see RESIDENT_FRACTION.
 *
 * Exported because the relationship between this, the floor and the mascot's height is the room's
 * one real constraint, and a test that re-stated the number instead of reading it would go on
 * passing while the desk moved above the mascot's head.
 */
export const OFFICE_DESK_Y = 43;
const DESK_Y = OFFICE_DESK_Y;

/** Large on purpose. A mascot sized for a whole apartment would be a thumbnail here; this room is
 * built around the figure, so it takes up nearly a third of the height and the desk crosses it at
 * roughly chest height. */
const RESIDENT_FRACTION = 0.3;

/** Where it sits — a short run behind the desk, clear of the monitor so head and shoulders show. */
const SEAT_X1 = 26;
const SEAT_X2 = 46;

const OFFICE_PALETTE = {
	wall: "#9aa7b4",
	wallAlt: "#909dab",
	wallTrim: "#6f7d8c",
	skirting: "#5d6a78",
	carpet: "#5a6472",
	carpetAlt: "#525c69",
	deskTop: "#a8794e",
	deskEdge: "#8a6039",
	deskPanel: "#7d5734",
	deskDark: "#5f4227",
	screen: "#1f3550",
	screenGlow: "#4f86b8",
	screenText: "#8fc2e6",
	plastic: "#3a4048",
	plasticLight: "#4c545e",
	metal: "#b7bec7",
	chair: "#3d4450",
	chairLight: "#4d5563",
	sky: "#bcd8e8",
	skyDusk: "#3f4a6b",
	mug: "#c2603f",
	paper: "#efe9dc",
	leaf: "#4f8a4d",
	leafDark: "#356038",
	lamp: "#e8c46a",
} as const;

const wallAndFloor: RoomFixture = {
	id: "shell",
	paint(p, mood) {
		p.px(0, 0, W, FLOOR_Y, OFFICE_PALETTE.wall);
		// A faint vertical stripe, so a large flat wall does not read as an empty rectangle.
		for (let x = 0; x < W; x += 8) p.px(x, 0, 1, FLOOR_Y, OFFICE_PALETTE.wallAlt);
		p.px(0, 0, W, 2, OFFICE_PALETTE.wallTrim);
		p.px(0, FLOOR_Y - 4, W, 4, OFFICE_PALETTE.skirting);
		p.px(0, FLOOR_Y - 4, W, 1, OFFICE_PALETTE.wallTrim);

		p.px(0, FLOOR_Y, W, H - FLOOR_Y, OFFICE_PALETTE.carpet);
		for (let x = 2; x < W; x += 5) p.px(x, FLOOR_Y, 1, H - FLOOR_Y, OFFICE_PALETTE.carpetAlt);
		p.px(0, FLOOR_Y, W, 1, OFFICE_PALETTE.carpetAlt);
		if (mood.dusk) p.px(0, 0, W, H, PALETTE.duskWash);
	},
	surfaces: [{ kind: "floor", y: FLOOR_Y, x1: SEAT_X1, x2: SEAT_X2, label: "the seat" }],
	// The two ends of that short floor. Nowhere else to go is the whole design — see the file
	// comment — so these are what keep it at the desk without anything having to enforce it.
	walls: [
		{ side: "left", x: SEAT_X1, y1: 20, y2: FLOOR_Y, label: "seat end" },
		{ side: "right", x: SEAT_X2, y1: 20, y2: FLOOR_Y, label: "seat end" },
	],
};

const window_: RoomFixture = {
	id: "window",
	paint(p, mood) {
		p.px(6, 8, 26, 20, OFFICE_PALETTE.wallTrim);
		p.px(8, 10, 22, 16, mood.dusk ? OFFICE_PALETTE.skyDusk : OFFICE_PALETTE.sky);
		p.px(18, 10, 2, 16, OFFICE_PALETTE.wallTrim);
		p.px(8, 17, 22, 2, OFFICE_PALETTE.wallTrim);
		if (mood.dusk) {
			p.px(12, 13, 1, 1, PALETTE.star);
			p.px(24, 21, 1, 1, PALETTE.star);
		} else {
			p.px(10, 12, 6, 2, PALETTE.glassGlint);
		}
	},
};

const clock: RoomFixture = {
	id: "clock",
	paint(p) {
		p.px(64, 8, 12, 12, OFFICE_PALETTE.plastic);
		p.px(65, 9, 10, 10, OFFICE_PALETTE.paper);
		p.px(70, 11, 1, 4, OFFICE_PALETTE.plastic);
		p.px(70, 14, 3, 1, OFFICE_PALETTE.plastic);
	},
};

const chair: RoomFixture = {
	id: "chair",
	paint(p) {
		// Behind the resident, so it stays on the background layer and the mascot sits in front of it.
		p.px(28, 28, 18, 20, OFFICE_PALETTE.chair);
		p.px(28, 28, 18, 2, OFFICE_PALETTE.chairLight);
		p.px(30, 30, 14, 16, OFFICE_PALETTE.chairLight);
		p.px(36, 48, 2, 4, OFFICE_PALETTE.chair);
	},
};

const tower: RoomFixture = {
	id: "tower",
	paint(p, mood) {
		p.px(76, 34, 10, 18, OFFICE_PALETTE.plastic);
		p.px(76, 34, 10, 1, OFFICE_PALETTE.plasticLight);
		p.px(78, 37, 6, 1, OFFICE_PALETTE.plasticLight);
		p.px(78, 39, 6, 1, OFFICE_PALETTE.plasticLight);
		// The one light in the room that is on whether or not anyone is.
		p.px(78, 43, 2, 2, mood.dusk ? OFFICE_PALETTE.screenGlow : OFFICE_PALETTE.leaf);
	},
};

const desk: RoomFixture = {
	id: "desk",
	layer: "foreground",
	paint(p) {
		p.px(10, DESK_Y, 68, 3, OFFICE_PALETTE.deskTop);
		p.px(10, DESK_Y, 68, 1, "rgba(255,255,255,0.18)");
		p.px(10, DESK_Y + 3, 68, 1, OFFICE_PALETTE.deskEdge);
		// The modesty panel is what actually does the hiding: without it the mascot's legs would show
		// through the gap between the desk's legs and it would read as standing behind a plank.
		p.px(13, DESK_Y + 4, 62, FLOOR_Y - DESK_Y - 4, OFFICE_PALETTE.deskPanel);
		p.px(13, DESK_Y + 4, 62, 1, OFFICE_PALETTE.deskDark);
		p.px(13, FLOOR_Y - 1, 62, 1, OFFICE_PALETTE.deskDark);
		p.px(11, DESK_Y + 4, 2, FLOOR_Y - DESK_Y - 4, OFFICE_PALETTE.deskDark);
		p.px(75, DESK_Y + 4, 2, FLOOR_Y - DESK_Y - 4, OFFICE_PALETTE.deskDark);
	},
};

const monitor: RoomFixture = {
	id: "monitor",
	layer: "foreground",
	paint(p, mood) {
		p.px(52, 22, 22, 18, OFFICE_PALETTE.plastic);
		p.px(54, 24, 18, 14, OFFICE_PALETTE.screen);
		// A few lines of "text", brighter after dark when the screen is the main light.
		const glow = mood.dusk ? OFFICE_PALETTE.screenText : OFFICE_PALETTE.screenGlow;
		for (let i = 0; i < 5; i++) p.px(56, 26 + i * 2, 4 + ((i * 5) % 12), 1, glow);
		p.px(54, 24, 18, 1, "rgba(255,255,255,0.12)");
		p.px(61, 40, 4, 3, OFFICE_PALETTE.plasticLight);
		p.px(57, DESK_Y - 1, 12, 1, OFFICE_PALETTE.plastic);
	},
};

const deskThings: RoomFixture = {
	id: "desk-things",
	layer: "foreground",
	paint(p) {
		// Keyboard and mouse, in side elevation — thin slivers on the desktop rather than the flat
		// plan view an isometric room would show.
		p.px(22, DESK_Y - 2, 20, 2, OFFICE_PALETTE.plasticLight);
		p.px(22, DESK_Y - 2, 20, 1, OFFICE_PALETTE.metal);
		p.px(45, DESK_Y - 2, 5, 2, OFFICE_PALETTE.plasticLight);

		p.px(15, DESK_Y - 5, 5, 5, OFFICE_PALETTE.mug);
		p.px(20, DESK_Y - 4, 2, 2, OFFICE_PALETTE.mug);
		p.px(15, DESK_Y - 5, 5, 1, "rgba(255,255,255,0.2)");

		p.px(76, DESK_Y - 6, 6, 6, PALETTE.potL);
		p.px(75, DESK_Y - 7, 8, 2, PALETTE.potR);
		for (let i = 0; i < 4; i++) p.px(76 + i, DESK_Y - 12 + (i % 2) * 2, 2, 6, i % 2 ? OFFICE_PALETTE.leafDark : OFFICE_PALETTE.leaf);
	},
};

export const OFFICE: RoomDef = {
	width: W,
	height: H,
	ceilingY: 2,
	floorY: FLOOR_Y,
	// Drawn by the plugin, so it flips cleanly and the threshold flips with it.
	mirrorable: true,
	integerScale: true,
	background: "painted",
	residentHeightFraction: RESIDENT_FRACTION,
	// Facing one way and staying there. Shimeji artwork is side-on and has no front-facing pose, so
	// this settles which side rather than turning it to camera — see RoomDef.residentFacing.
	residentFacing: 1,
	door: { x1: SEAT_X1, x2: SEAT_X1 + 6, y: FLOOR_Y },
	fixtures: [wallAndFloor, window_, clock, chair, tower, desk, monitor, deskThings],
};
