import type { Painter, RoomDef, RoomFixture } from "./roomDef";

/**
 * The office after everything else stopped: a desk still running, in a room the outside is coming
 * back into.
 *
 * **Invented**, and drawn by this plugin rather than supplied — so, like the plant nook, each
 * fixture's picture and its collision geometry are one declaration and cannot drift apart.
 *
 * Three things make this room different from the others, and all three come from what it is for.
 *
 * **The resident is behind the furniture.** The desk and everything on it are on the `foreground`
 * layer, painted onto a canvas above the mascot instead of below it, so the desktop crosses its body
 * the way sitting at a real desk does.
 *
 * **We are behind the monitor, not in front of it.** The mascot faces us across the desk, which puts
 * the screen's back to us — so what shows is the case, its vents, and whatever has been stuck on it.
 * Drawing the screen would put the viewer and the mascot on the same side of it.
 *
 * **It does not wander.** Not by a rule and not by a leash: the room contains one short floor, at
 * chair height behind the desk, with a wall at either end. There is nowhere else to be. The pack's
 * own selection is also pinned to a single sitting behaviour — in a room the size of a seat, the
 * full repertoire reads as jittering rather than idling.
 */

const W = 88;
const H = 72;

/** The ground. Only the skirting and debris live down here; the resident is up on the chair. */
const GROUND_Y = 56;

/**
 * The chair seat — the resident's floor, and the reason it is visible at all.
 *
 * It sat on the ground at first, which put a 128px sprite's head a couple of pixels above the
 * desktop and showed a scalp. Sitting is what the room depicts, so the seat is where the seat is.
 */
const SEAT_Y = 47;

/**
 * The desktop. Together with SEAT_Y and the resident's height this is the room's one real
 * constraint — too high and the mascot is hidden, too low and it is a mascot standing behind a
 * plank. Exported so a test reads it rather than restating it.
 */
export const OFFICE_DESK_Y = 38;
const DESK_Y = OFFICE_DESK_Y;

/** Sized for a portrait, not a dollhouse: this room is built around the figure. */
const RESIDENT_FRACTION = 0.3;
/**
 * Allowed well above natural size, unlike every other room, and set high enough that it effectively
 * never binds here.
 *
 * The default cap of 1 silently overrode the fraction above in any pane wide enough to matter — a
 * 128px sprite in an 860px-tall room is 15%, not 30% — which is exactly how this room shipped with
 * only a scalp showing above the desk. Left merely *raised*, the cap would still bind in a wide pane
 * and not in a narrow one, so the mascot would sit at a different height depending on how the
 * sidebar happened to be dragged.
 */
const RESIDENT_MAX_SCALE = 2.5;

/** A short run behind the desk, left of the monitor so head and shoulders are clear of it. */
const SEAT_X1 = 24;
const SEAT_X2 = 44;

/**
 * Desaturated green-greys, damp concrete, one warm lamp.
 *
 * The whole palette sits in a narrow band of cold desaturated colour so that the two things that are
 * *not* cold — the lamp and the screen-glow leaking round the monitor — carry the picture. A brighter
 * or more varied palette would leave nothing for them to be brighter than.
 */
const P = {
	wall: "#3d4844",
	wallLit: "#47534e",
	wallDamp: "#333d3a",
	wallStain: "#2c3633",
	plasterGone: "#4a463d",
	brick: "#524a41",
	brickLine: "#3e382f",
	skirting: "#2b3431",
	floor: "#333b39",
	floorAlt: "#2c3432",
	floorDebris: "#404845",
	deskTop: "#6b5a44",
	deskTopLit: "#7d6a51",
	deskEdge: "#4e412f",
	deskPanel: "#5a4c39",
	deskDark: "#3b3125",
	caseBody: "#39413f",
	caseLit: "#454e4b",
	caseDark: "#2a3130",
	vent: "#232928",
	metal: "#6e7a76",
	chair: "#2f3634",
	chairLit: "#3a423f",
	glass: "#7d968f",
	glassPale: "#93aaa2",
	sky: "#8fa8a0",
	skyDusk: "#3c4a52",
	lamp: "#d9a05a",
	leaf: "#4d6b45",
	leafDark: "#37502f",
	leafLight: "#6c8a55",
	moss: "#415a3a",
	rust: "#7a4a30",
	sticker1: "#b5563f",
	sticker2: "#5d7f9c",
	sticker3: "#c2a052",
	sticker4: "#7a6390",
	screenSpill: "#5f8fa8",
	dust: "rgba(180,200,190,0.05)",
	gloom: "rgba(14,20,20,0.32)",
	lampGlow: "rgba(226,178,96,0.13)",
} as const;

const LAMP = "#e2b260";

/** Ragged edge: a run of pixels whose height wobbles, for broken plaster and torn material. */
function ragged(p: Painter, x: number, y: number, w: number, depth: number, color: string, seed: number): void {
	for (let i = 0; i < w; i++) {
		const d = 1 + Math.abs(Math.round(Math.sin((i + seed) * 1.7) * depth));
		p.px(x + i, y, 1, d, color);
	}
}

const shell: RoomFixture = {
	id: "shell",
	paint(p) {
		p.px(0, 0, W, GROUND_Y, P.wall);
		// Damp creeping up from the floor, and a lit band where the window falls on the wall.
		p.px(0, GROUND_Y - 14, W, 14, P.wallDamp);
		p.px(30, 0, 26, GROUND_Y - 14, P.wallLit);
		for (let x = 5; x < W; x += 13) p.px(x, 6, 1, GROUND_Y - 20, P.wallStain);

		// Plaster gone in two patches, exposing brick.
		p.px(58, 4, 24, 18, P.plasterGone);
		p.px(60, 6, 20, 14, P.brick);
		for (let by = 7; by < 20; by += 3) p.px(60, by, 20, 1, P.brickLine);
		ragged(p, 58, 22, 24, 2, P.plasterGone, 3);
		p.px(4, 26, 12, 10, P.plasterGone);
		p.px(5, 27, 10, 8, P.brick);
		ragged(p, 4, 36, 12, 2, P.plasterGone, 8);

		p.px(0, GROUND_Y - 3, W, 3, P.skirting);
		p.px(0, GROUND_Y, W, H - GROUND_Y, P.floor);
		for (let x = 1; x < W; x += 7) p.px(x, GROUND_Y, 1, H - GROUND_Y, P.floorAlt);
		// Rubble on the ground, and a crack running across it.
		p.px(6, GROUND_Y + 4, 5, 2, P.floorDebris);
		p.px(66, GROUND_Y + 7, 7, 2, P.floorDebris);
		p.px(30, GROUND_Y + 9, 3, 2, P.floorDebris);
		for (let i = 0; i < 20; i++) p.px(14 + i * 3, GROUND_Y + 5 + (i % 3), 2, 1, P.floorAlt);
	},
	surfaces: [{ kind: "floor", y: SEAT_Y, x1: SEAT_X1, x2: SEAT_X2, label: "the chair" }],
	// The two ends of that short floor. Nowhere else to go is the whole design, so these are what
	// keep the resident at the desk without anything having to enforce it.
	walls: [
		{ side: "left", x: SEAT_X1, y1: 18, y2: SEAT_Y, label: "seat end" },
		{ side: "right", x: SEAT_X2, y1: 18, y2: SEAT_Y, label: "seat end" },
	],
};

const brokenWindow: RoomFixture = {
	id: "window",
	paint(p, mood) {
		p.px(30, 4, 26, 22, P.caseDark);
		p.px(32, 6, 22, 18, mood.dusk ? P.skyDusk : P.sky);
		// What is left of the glass: two panes intact, one starred, one gone entirely.
		p.px(32, 6, 10, 8, mood.dusk ? P.skyDusk : P.glassPale);
		p.px(44, 6, 10, 8, P.glass);
		p.px(32, 16, 10, 8, P.glass);
		p.px(46, 17, 2, 2, P.caseDark);
		p.px(49, 20, 3, 1, P.caseDark);
		p.px(42, 6, 2, 18, P.caseDark);
		p.px(32, 14, 22, 2, P.caseDark);
		ragged(p, 44, 16, 10, 2, P.caseDark, 5);
		// Growth coming in through the missing pane — the outside taking the room back.
		for (let i = 0; i < 7; i++) {
			p.px(45 + i, 20 + ((i * 3) % 5), 2, 4, i % 2 ? P.leaf : P.leafDark);
			p.px(46 + i, 24 + ((i * 2) % 4), 1, 3, P.moss);
		}
		p.px(30, 26, 26, 1, P.moss);
	},
};

const vines: RoomFixture = {
	id: "vines",
	paint(p) {
		// Trailing down the right-hand wall, over the exposed brick.
		for (let i = 0; i < 22; i++) {
			const x = 78 + Math.round(Math.sin(i / 3) * 2);
			p.px(x, 2 + i, 1, 1, P.leafDark);
			if (i % 4 === 1) p.px(x - 2, 2 + i, 2, 2, P.leaf);
			if (i % 7 === 3) p.px(x + 1, 3 + i, 2, 2, P.leafLight);
		}
		p.px(56, 2, 30, 2, P.moss);
		for (let i = 0; i < 10; i++) p.px(58 + i * 3, 4, 2, 2 + (i % 3), P.moss);
	},
};

const deskLamp: RoomFixture = {
	id: "lamp",
	paint(p, mood) {
		// The one warm thing in the room. Clamped to the wall, still working.
		p.px(20, 12, 2, 14, P.metal);
		p.px(14, 10, 10, 3, P.caseBody);
		p.px(15, 13, 8, 2, mood.dusk ? LAMP : P.caseLit);
		if (mood.dusk) {
			p.px(16, 15, 6, 2, P.lampGlow);
			p.px(13, 15, 12, 8, P.lampGlow);
		}
	},
};

const chair: RoomFixture = {
	id: "chair",
	paint(p) {
		// Behind the resident, so it stays on the background layer and the mascot sits in front of it.
		p.px(26, 26, 16, SEAT_Y - 26, P.chair);
		p.px(26, 26, 16, 2, P.chairLit);
		p.px(28, 28, 12, 16, P.chairLit);
		ragged(p, 28, 30, 12, 2, P.chair, 2);
		// Post and base, below the seat.
		p.px(33, SEAT_Y, 2, GROUND_Y - SEAT_Y - 2, P.caseDark);
		p.px(29, GROUND_Y - 2, 10, 2, P.caseDark);
	},
};

const tower: RoomFixture = {
	id: "tower",
	paint(p, mood) {
		p.px(6, 38, 11, GROUND_Y - 38, P.caseBody);
		p.px(6, 38, 11, 1, P.caseLit);
		for (let i = 0; i < 4; i++) p.px(8, 41 + i * 2, 7, 1, P.vent);
		p.px(8, 51, 2, 2, mood.dusk ? P.screenSpill : P.leaf);
		p.px(6, 44, 1, 8, P.rust);
	},
};

const desk: RoomFixture = {
	id: "desk",
	layer: "foreground",
	paint(p) {
		p.px(8, DESK_Y, 72, 3, P.deskTop);
		p.px(8, DESK_Y, 72, 1, P.deskTopLit);
		p.px(8, DESK_Y + 3, 72, 1, P.deskEdge);
		// The modesty panel is what does the hiding: without it the mascot's legs would show between
		// the desk's legs and it would read as standing behind a plank.
		p.px(11, DESK_Y + 4, 66, GROUND_Y - DESK_Y - 4, P.deskPanel);
		p.px(11, DESK_Y + 4, 66, 1, P.deskDark);
		p.px(11, GROUND_Y - 1, 66, 1, P.deskDark);
		p.px(9, DESK_Y + 4, 2, GROUND_Y - DESK_Y - 4, P.deskDark);
		p.px(77, DESK_Y + 4, 2, GROUND_Y - DESK_Y - 4, P.deskDark);
		// Water damage down the panel, and a gouge out of the front edge.
		p.px(30, DESK_Y + 6, 8, GROUND_Y - DESK_Y - 8, P.deskDark);
		p.px(58, DESK_Y + 9, 4, 6, P.deskDark);
		p.px(46, DESK_Y + 2, 6, 2, P.deskEdge);
	},
};

const monitorBack: RoomFixture = {
	id: "monitor",
	layer: "foreground",
	paint(p, mood) {
		// The *back* of the screen. The mascot faces us across the desk, so this is the side we get:
		// case, vents, cable, and the stickers somebody put on it.
		p.px(50, 17, 24, 19, P.caseBody);
		p.px(50, 17, 24, 1, P.caseLit);
		p.px(50, 17, 1, 19, P.caseLit);
		p.px(73, 17, 1, 19, P.caseDark);
		p.px(50, 35, 24, 1, P.caseDark);
		// Vent grille.
		for (let i = 0; i < 5; i++) p.px(64, 21 + i * 2, 8, 1, P.vent);
		// Stand and its foot, plus the cable trailing off the back of the desk.
		p.px(59, 36, 6, 2, P.caseDark);
		p.px(56, DESK_Y - 1, 12, 1, P.caseDark);
		p.px(74, 27, 1, 8, P.caseDark);
		p.px(74, 34, 5, 1, P.caseDark);

		// Stickers. Deliberately the brightest things on this side of the desk after the lamp — a
		// blank grey rectangle facing the viewer is what the first version of this room got wrong.
		p.px(53, 20, 7, 5, P.sticker1);
		p.px(54, 21, 5, 1, P.caseDark);
		p.px(53, 27, 5, 5, P.sticker2);
		p.px(55, 29, 1, 1, P.caseLit);
		p.px(60, 29, 6, 4, P.sticker3);
		p.px(61, 24, 4, 4, P.sticker4);
		p.px(62, 25, 2, 2, P.caseDark);
		// Screen light spilling round the edges, which is the only clue it is still on.
		if (mood.dusk) {
			p.px(49, 18, 1, 17, P.screenSpill);
			p.px(74, 18, 1, 17, P.screenSpill);
			p.px(50, 16, 24, 1, P.screenSpill);
		}
	},
};

const deskThings: RoomFixture = {
	id: "desk-things",
	layer: "foreground",
	paint(p) {
		// Keyboard in side elevation — a thin sliver on the desktop, not the plan view an isometric
		// room would show.
		p.px(20, DESK_Y - 2, 22, 2, P.caseBody);
		p.px(20, DESK_Y - 2, 22, 1, P.metal);
		p.px(44, DESK_Y - 2, 5, 2, P.caseBody);

		// A mug, long since finished with.
		p.px(12, DESK_Y - 5, 5, 5, P.rust);
		p.px(17, DESK_Y - 4, 2, 2, P.rust);
		p.px(12, DESK_Y - 5, 5, 1, P.metal);

		// Paper, curled and damp.
		p.px(76, DESK_Y - 2, 8, 2, P.plasterGone);
		p.px(78, DESK_Y - 3, 5, 1, P.plasterGone);

		// Something growing in what used to be a pen pot.
		p.px(80, DESK_Y - 7, 5, 5, P.rust);
		for (let i = 0; i < 3; i++) p.px(81 + i, DESK_Y - 12 + (i % 2) * 2, 1, 6, i % 2 ? P.leafDark : P.leaf);
	},
};

const atmosphere: RoomFixture = {
	id: "atmosphere",
	layer: "foreground",
	paint(p, mood) {
		// Painted last and over everything, resident included: gloom is in the air of the room, not
		// behind the things in it.
		p.px(0, 0, W, H, P.gloom);
		if (mood.dusk) p.px(0, 0, W, H, P.gloom);
		// Dust in the window's light.
		for (let i = 0; i < 14; i++) p.px(30 + ((i * 7) % 26), 6 + ((i * 11) % 46), 1, 1, P.dust);
	},
};

export const OFFICE: RoomDef = {
	width: W,
	height: H,
	ceilingY: 2,
	floorY: SEAT_Y,
	mirrorable: true,
	integerScale: true,
	background: "painted",
	residentHeightFraction: RESIDENT_FRACTION,
	residentMaxScale: RESIDENT_MAX_SCALE,
	// Facing one way and staying there. Shimeji artwork is side-on and the real engine has no
	// front-facing pose at all, so this settles which side rather than turning it to camera.
	residentFacing: 1,
	// Held sitting. `SitDown` is a Sequence around the pack's own `Sit` pose, re-applied whenever it
	// ends — which is what stops the twitching, since the alternative is the pack picking freely from
	// walks and stands in a room twenty pixels wide.
	residentBehavior: "SitDown",
	door: { x1: SEAT_X1, x2: SEAT_X1 + 6, y: SEAT_Y },
	fixtures: [shell, brokenWindow, vines, deskLamp, chair, tower, desk, monitorBack, deskThings, atmosphere],
};
