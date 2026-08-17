/**
 * The plant room, declared once.
 *
 * **Invented.** shimeji-ee has no equivalent and could not have one: its mascots live on the desktop
 * with tracked application windows, and there is nowhere for a mascot to *be* other than that
 * desktop. Obsidian gives us a pane we control completely, so a mascot can have somewhere of its own.
 *
 * The point of this file is that a fixture's picture and its collision geometry are the same
 * declaration. The engine already builds a mascot's world out of rectangles — it measures pane edges
 * from the DOM and turns them into floors, walls and ceilings (see engine/Ledges.ts). A room is the
 * same thing with the rectangles hand-authored instead of measured, so `paint` and `surfaces` below
 * describe one object and cannot drift apart: nothing can look standable and not be, or the reverse.
 *
 * Coordinates are **room pixels** with y increasing downward, origin at the room's top-left. They are
 * transformed to viewport space at an integer scale by RoomGeometry, which is also what mirrors the
 * whole room when the pane sits on the other side of the window.
 */

/** A palette rather than ad-hoc colours: every entry below is used more than once, which is what
 * makes the room read as one drawing rather than a pile of shapes. */
export const PALETTE = {
	ink: "#241f2b",
	wall: "#e6ddc9",
	wallAlt: "#dcd2bb",
	wallDeep: "#c6b89c",
	rail: "#a89170",
	floorA: "#bb8b5e",
	floorB: "#a5764d",
	floorC: "#8b6140",
	floorD: "#6f4c31",
	woodL: "#a3764a",
	woodM: "#7f5937",
	woodD: "#5a3d25",
	sofaL: "#8f84ad",
	sofaM: "#75699a",
	sofaD: "#574c76",
	leafD: "#2f5a38",
	leafM: "#457a49",
	leafL: "#6da05e",
	potL: "#c07049",
	potD: "#8f4d2d",
	potR: "#d18a63",
	skyDay: "#b8dce5",
	skyDusk: "#4b5580",
	sun: "#f2dda8",
	star: "#e8e2c8",
	paper: "#f5f0e3",
	bookA: "#a8443c",
	bookB: "#3f6a8a",
	bookC: "#c08a3e",
	bookD: "#5d7a45",
	bookE: "#7b5a8c",
	duskWash: "rgba(40,44,80,0.22)",
	nightWash: "rgba(30,28,60,0.28)",
	lampGlow: "rgba(216,169,79,0.16)",
	glassGlint: "rgba(255,255,255,0.5)",
	bookGlint: "rgba(255,255,255,0.25)",
	rugGlint: "rgba(255,255,255,0.2)",
	soilShade: "rgba(192,112,73,0.55)",
} as const;

/** The one drawing primitive. Everything in the room is axis-aligned rectangles of whole room
 * pixels, which is what makes it pixel art rather than a vector illustration that happens to be
 * small. */
export interface Painter {
	px(x: number, y: number, w: number, h: number, color: string): void;
	/** Non-rectangular fills, used only for the lamp's light pool. */
	polygon(points: Array<[number, number]>, color: string): void;
}

/**
 * What the room's light is doing right now.
 *
 * Was a single `dusk` boolean, which gave a room exactly two states and a hard switch between them
 * at 7pm. A day has more than two states, and the interesting ones are the transitions — so this
 * carries the light as continuous quantities and lets each room decide what to do with them.
 */
export interface RoomMood {
	/** Kept for the rooms that only want to know whether it is dark out. Derived from `daylight`. */
	dusk: boolean;
	/** Fractional hour, 0–24. */
	hour: number;
	/** How much light is coming in: 0 in the dead of night, 1 at midday. */
	daylight: number;
	/** The colour of that light: −1 cold blue, 0 neutral, +1 the deep amber of dawn and sunset. */
	warmth: number;
	/**
	 * Seconds, advancing continuously — the clock animation runs off.
	 *
	 * Separate from `hour` because they move at completely different rates: `hour` changes over
	 * minutes and drives the lighting, while this changes every frame and drives a flickering lamp.
	 * A room that used one for the other would either animate imperceptibly or strobe.
	 */
	t: number;
}

export interface RoomSurface {
	kind: "floor" | "ceiling";
	y: number;
	x1: number;
	x2: number;
	/** Named so a debug overlay and a failing test can both say *which* surface. */
	label: string;
}

export interface RoomWall {
	side: "left" | "right";
	x: number;
	y1: number;
	y2: number;
	label: string;
}

export interface RoomFixture {
	id: string;
	paint(p: Painter, mood: RoomMood): void;
	surfaces?: RoomSurface[];
	walls?: RoomWall[];
	/**
	 * Which side of the resident this fixture is drawn on. Everything defaults to `background`, and
	 * `foreground` is what puts a mascot genuinely *behind* something — a desk it is sitting at, a
	 * counter it is standing behind.
	 *
	 * It cannot be done by draw order alone: mascots are not drawn into the room's canvas at all,
	 * they live on the stage's own full-window overlay above the workspace. So a foreground fixture
	 * is painted onto a second canvas that sits above that overlay in turn — see RoomForeground.
	 */
	layer?: "background" | "foreground";
}

export interface RoomDef {
	width: number;
	height: number;
	ceilingY: number;
	floorY: number;
	/**
	 * Whether flipping the whole room is allowed when the pane sits on the other side of the window.
	 * True for a room this plugin draws, whose door is part of the drawing and has to face the
	 * workspace. False for supplied artwork: there is nothing to mirror *for*, and flipping somebody
	 * else's illustration to suit a sidebar takes a liberty with it. The threshold moves either way.
	 * Defaults to true.
	 */
	mirrorable?: boolean;
	/** Whether the room must be drawn at a whole-number scale. True for pixel art this plugin paints
	 * pixel by pixel, where a fractional scale is mush. False for a supplied image, which is larger
	 * than a sidebar and so only ever has useful scales below 1. Defaults to true. */
	integerScale?: boolean;
	/** `painted` draws the fixtures below; `image` fits supplied artwork into the room square and
	 * treats the fixtures as geometry only. Defaults to painted. */
	background?: "painted" | "image";
	/**
	 * Leaves the pane around the room in the theme's own colour instead of painting it from the
	 * room's palette.
	 *
	 * For a room that reads as a scene rather than as a picture hung on a wall: the office is a
	 * view *into* somewhere, so a slab of invented wall colour around it just looks like the pane
	 * failed to fill. Letting Obsidian's own sidebar colour run right up to the art makes the room
	 * sit in the workspace instead of on top of it.
	 */
	paneBackdrop?: boolean;
	/**
	 * How tall the resident stands, in the room's *own* coordinate units.
	 *
	 * Preferred over `residentHeightFraction` for any room whose furniture the mascot has to line
	 * up with, because it is stated in the same units as that furniture. The office's desktop is at
	 * y=38 and its chair at y=47, so a resident 20 units tall puts its head at 27 — eleven units
	 * clear of the desk — and that stays true at every pane size, which a fraction-of-pixels
	 * derivation does not.
	 */
	residentHeightUnits?: number;
	/**
	 * How wide the resident is allowed to render, in the room's *own* coordinate units — the other
	 * half of `residentHeightUnits`.
	 *
	 * Sizing by height alone assumes there is always room to spare sideways, which is only true of a
	 * room with nothing standing next to the seat. The office does not have that: the resident is
	 * centred on its own anchor, so it grows both wider and taller as it is scaled up, and a seat
	 * boxed in by a tower on one side and a monitor on the other runs out of *width* well before it
	 * runs out of height. A sprite sized purely to clear the desk can still be wide enough to reach
	 * the furniture beside it — reported as the resident overlapping the monitor, with a screenshot
	 * to prove it.
	 *
	 * Whichever of the two caps binds wins; a room that only cares about height simply leaves this
	 * unset.
	 */
	residentMaxWidthUnits?: number;
	/**
	 * How tall the resident stands here, as a fraction of the room's drawn height. Per-room because
	 * the right answer depends on what the room is: a whole flat wants a small figure, while a scene
	 * built around the mascot itself wants it large enough to read. Defaults to Residency's own.
	 */
	residentHeightFraction?: number;
	/**
	 * Pins which way the resident faces. Set only by rooms where the pose is the point — a mascot
	 * sitting at a desk should not turn its back on you every few seconds.
	 *
	 * Worth being plain about the limit: shimeji artwork is drawn in side elevation and the real
	 * engine has no front-facing pose at all (`setLookRight` mirrors horizontally and that is the
	 * whole of its orientation). So this settles *which side*, and cannot conjure a view the pack
	 * does not contain.
	 */
	residentFacing?: 1 | -1;
	/**
	 * A behaviour to hold the resident in, re-applied whenever the pack's own chain moves off it.
	 *
	 * For rooms where the mascot is part of the composition rather than a thing wandering through it.
	 * Left to itself the pack keeps selecting from its whole repertoire — walks, sits, stands, looks —
	 * and in a room the size of a seat that reads as jittering on the spot rather than as idling.
	 */
	residentBehavior?: string;
	/**
	 * How far the resident may be scaled *up* from its natural size here. Defaults to 1: a mascot
	 * larger indoors than out looks wrong at the threshold, which is the one moment both sizes are on
	 * screen together.
	 *
	 * A room the mascot never leaves has no such moment, and needs the freedom — the cap otherwise
	 * silently overrides `residentHeightFraction` in any pane big enough to matter, which is how the
	 * office ended up with only a scalp showing above its desk.
	 */
	residentMaxScale?: number;
	/**
	 * Whether this room's picture changes on its own, and so has to be repainted continuously rather
	 * than only when the pane moves.
	 *
	 * Opt-in because most rooms are still pictures: repainting a supplied photograph sixty times a
	 * second to no visible effect is pure waste, and the room canvas is otherwise redrawn perhaps
	 * once a minute.
	 */
	animated?: boolean;
	/**
	 * The threshold. Both directions pass through it: a mascot moving in appears here, and one
	 * called away walks here before the workspace becomes its world again.
	 *
	 * It is drawn on the room's **left**, and RoomGeometry mirrors the entire room when the pane is
	 * on the left-hand side of the window — so the door always faces the workspace the mascot came
	 * from, whichever sidebar you keep the room in.
	 */
	door: { x1: number; x2: number; y: number };
	fixtures: RoomFixture[];
}

const W = 72;
const H = 140;
const CEIL = 6;
const FLOOR = 116;

/** A leaf: a tapering run of pixels, mirrored by `dir`. Shared by every plant so they look like
 * they grew in the same room. */
function leaf(p: Painter, x: number, y: number, len: number, dir: 1 | -1, light: string, dark: string): void {
	for (let i = 0; i < len; i++) {
		const t = i / len;
		const thick = Math.max(1, Math.round(3 * (1 - Math.abs(t - 0.45) * 1.6)));
		p.px(x + dir * i, y - Math.round(t * len * 0.55), 1, thick, i < len * 0.6 ? light : dark);
	}
}

const shell: RoomFixture = {
	id: "shell",
	paint(p, mood) {
		p.px(0, 0, W, H, PALETTE.wall);
		p.px(0, 0, W, CEIL, PALETTE.wallDeep);
		p.px(0, CEIL - 1, W, 1, PALETTE.rail);
		for (let x = 3; x < W; x += 6) p.px(x, CEIL, 1, FLOOR - CEIL, PALETTE.wallAlt);
		p.px(0, 12, W, 1, PALETTE.rail);
		if (mood.dusk) p.px(0, CEIL, W, FLOOR - CEIL, PALETTE.duskWash);
	},
	surfaces: [{ kind: "ceiling", y: CEIL, x1: 0, x2: W, label: "ceiling" }],
	// The room's own side walls. Climbable exactly like a pane's, which is what lets a mascot get
	// from the floor up to the windowsill without a jump.
	walls: [
		{ side: "left", x: 0, y1: CEIL, y2: FLOOR, label: "room wall" },
		{ side: "right", x: W, y1: CEIL, y2: FLOOR, label: "room wall" },
	],
};

const window_: RoomFixture = {
	id: "window",
	paint(p, mood) {
		p.px(4, 16, 30, 34, PALETTE.woodM);
		p.px(6, 18, 26, 30, mood.dusk ? PALETTE.skyDusk : PALETTE.skyDay);
		if (mood.dusk) {
			for (const [sx, sy, s] of [
				[11, 23, 1],
				[19, 21, 1],
				[26, 27, 1],
				[15, 33, 1],
				[24, 38, 2],
			] as const) {
				p.px(sx, sy, s, s, PALETTE.star);
			}
		} else {
			p.px(22, 21, 5, 5, PALETTE.sun);
			p.px(8, 30, 7, 2, PALETTE.glassGlint);
			p.px(20, 36, 9, 2, PALETTE.glassGlint);
		}
		p.px(18, 18, 2, 30, PALETTE.woodM);
		p.px(6, 32, 26, 2, PALETTE.woodM);
		p.px(4, 16, 30, 2, PALETTE.woodL);

		// Sill, and the two pots on it — the sunniest spot in the room, so this is where the
		// plants that want light live.
		p.px(2, 50, 32, 3, PALETTE.woodL);
		p.px(2, 53, 32, 1, PALETTE.woodD);
		p.px(5, 44, 6, 6, PALETTE.potL);
		p.px(4, 43, 8, 2, PALETTE.potR);
		p.px(6, 50, 5, 1, PALETTE.potD);
		leaf(p, 8, 43, 6, -1, PALETTE.leafL, PALETTE.leafM);
		leaf(p, 8, 43, 6, 1, PALETTE.leafL, PALETTE.leafM);
		p.px(8, 38, 1, 5, PALETTE.leafD);
		p.px(25, 45, 6, 5, PALETTE.potL);
		p.px(24, 44, 8, 2, PALETTE.potR);
		for (let b = 0; b < 4; b++) p.px(25 + b * 2, 39 + (b % 2), 2, 6, b % 2 ? PALETTE.leafM : PALETTE.leafL);
	},
	surfaces: [
		{ kind: "floor", y: 50, x1: 2, x2: 34, label: "windowsill" },
		{ kind: "ceiling", y: 53, x1: 2, x2: 34, label: "sill underside" },
	],
};

const pothos: RoomFixture = {
	id: "pothos",
	paint(p) {
		p.px(50, CEIL, 1, 8, PALETTE.woodD);
		p.px(45, 14, 11, 8, PALETTE.potL);
		p.px(44, 13, 13, 2, PALETTE.potR);
		p.px(45, 20, 11, 2, PALETTE.potD);
		const vines = [
			{ x: 46, len: 20 },
			{ x: 50, len: 26 },
			{ x: 54, len: 16 },
		];
		vines.forEach((vine, v) => {
			for (let k = 0; k < vine.len; k++) {
				const wob = Math.round(Math.sin(k / 3.2 + v) * 1.4);
				p.px(vine.x + wob, 22 + k, 1, 1, PALETTE.leafD);
				if (k % 5 === 2) p.px(vine.x + wob + (v % 2 ? 1 : -2), 22 + k, 2, 2, k % 10 === 2 ? PALETTE.leafL : PALETTE.leafM);
			}
		});
	},
	surfaces: [{ kind: "ceiling", y: 22, x1: 45, x2: 56, label: "hanging pot" }],
};

const bookshelf: RoomFixture = {
	id: "bookshelf",
	paint(p) {
		p.px(46, 56, 24, FLOOR - 56, PALETTE.woodM);
		p.px(48, 58, 20, FLOOR - 60, PALETTE.woodD);
		p.px(45, 54, 26, 2, PALETTE.woodL);
		p.px(48, 76, 20, 2, PALETTE.woodL);
		p.px(48, 98, 20, 2, PALETTE.woodL);

		const books = [PALETTE.bookA, PALETTE.bookB, PALETTE.bookC, PALETTE.bookD, PALETTE.bookE];
		const shelfTops = [76, 98, FLOOR - 2];
		shelfTops.forEach((top, s) => {
			let x = 49;
			let n = 0;
			while (x < 66) {
				const bw = 2 + (n % 2);
				const bh = 9 + ((n * 3) % 4);
				p.px(x, top - bh, bw, bh, books[(n + s) % books.length]);
				p.px(x, top - bh, bw, 1, PALETTE.bookGlint);
				x += bw + 1;
				n++;
				if (n > 5 && s === 1) break; // a gap on the middle shelf, so it reads as lived-in
			}
		});

		p.px(55, 48, 6, 6, PALETTE.potL);
		p.px(54, 47, 8, 2, PALETTE.potR);
		leaf(p, 58, 47, 7, -1, PALETTE.leafL, PALETTE.leafM);
		leaf(p, 58, 47, 7, 1, PALETTE.leafM, PALETTE.leafD);
	},
	surfaces: [
		{ kind: "floor", y: 56, x1: 46, x2: 70, label: "bookshelf top" },
		{ kind: "floor", y: 76, x1: 48, x2: 68, label: "upper shelf" },
		{ kind: "floor", y: 98, x1: 48, x2: 68, label: "lower shelf" },
		{ kind: "ceiling", y: 58, x1: 48, x2: 68, label: "under bookshelf top" },
		{ kind: "ceiling", y: 78, x1: 48, x2: 68, label: "under upper shelf" },
		{ kind: "ceiling", y: 100, x1: 48, x2: 68, label: "under lower shelf" },
	],
	// Both faces, full height: the bookshelf is the room's climbing route.
	walls: [
		{ side: "left", x: 46, y1: 56, y2: FLOOR, label: "bookshelf side" },
		{ side: "right", x: 70, y1: 56, y2: FLOOR, label: "bookshelf side" },
	],
};

const sofa: RoomFixture = {
	id: "sofa",
	paint(p) {
		p.px(12, 84, 26, 16, PALETTE.sofaM);
		p.px(12, 84, 26, 1, PALETTE.sofaL);
		p.px(12, 100, 26, 12, PALETTE.sofaM);
		p.px(12, 100, 26, 2, PALETTE.sofaL);
		p.px(12, 94, 4, 18, PALETTE.sofaD);
		p.px(34, 94, 4, 18, PALETTE.sofaD);
		p.px(12, 94, 4, 1, PALETTE.sofaL);
		p.px(34, 94, 4, 1, PALETTE.sofaL);
		p.px(25, 100, 1, 12, PALETTE.sofaD);
		p.px(18, 88, 5, 5, PALETTE.sofaL);
		p.px(14, 112, 3, 4, PALETTE.woodD);
		p.px(33, 112, 3, 4, PALETTE.woodD);
	},
	surfaces: [
		{ kind: "floor", y: 84, x1: 12, x2: 38, label: "sofa back" },
		{ kind: "floor", y: 94, x1: 12, x2: 16, label: "sofa arm" },
		{ kind: "floor", y: 94, x1: 34, x2: 38, label: "sofa arm" },
		{ kind: "floor", y: 100, x1: 16, x2: 34, label: "sofa seat" },
	],
};

const snakePlant: RoomFixture = {
	id: "snake-plant",
	paint(p) {
		p.px(39, 106, 6, 10, PALETTE.potL);
		p.px(38, 105, 8, 2, PALETTE.potR);
		p.px(39, 114, 6, 2, PALETTE.potD);
		for (let l = 0; l < 4; l++) {
			const height = 10 + l * 3;
			p.px(39 + l * 2, 106 - height, 1, height, l % 2 ? PALETTE.leafD : PALETTE.leafM);
			p.px(39 + l * 2, 106 - height, 1, 2, PALETTE.leafL);
		}
	},
	// The step between the floor and the bookshelf's lower shelf, which is otherwise a climb.
	surfaces: [{ kind: "floor", y: 106, x1: 39, x2: 45, label: "snake plant pot" }],
};

const skirtingAndDoor: RoomFixture = {
	id: "door",
	paint(p) {
		p.px(0, 112, W, 4, PALETTE.woodM);
		p.px(0, 112, W, 1, PALETTE.woodL);
		// A small arch rather than a hinged door: the mascot is half size in here, and a
		// person-sized door would make the room read as a cupboard.
		p.px(1, 100, 12, 16, PALETTE.woodM);
		p.px(2, 104, 10, 12, PALETTE.ink);
		p.px(3, 102, 8, 2, PALETTE.ink);
		p.px(5, 100, 4, 2, PALETTE.ink);
		p.px(2, 115, 10, 1, PALETTE.woodD);
		p.px(3, 94, 9, 4, PALETTE.paper);
		p.px(4, 96, 7, 1, PALETTE.rail);
	},
};

const floorAndRug: RoomFixture = {
	id: "floor",
	paint(p, mood) {
		p.px(0, FLOOR, W, H - FLOOR, PALETTE.floorB);
		p.px(0, FLOOR, W, 1, PALETTE.floorA);
		p.px(0, FLOOR + 7, W, 1, PALETTE.floorC);
		p.px(0, FLOOR + 15, W, 1, PALETTE.floorC);
		p.px(0, H - 4, W, 4, PALETTE.floorD);
		for (let x = 5; x < W; x += 11) {
			p.px(x, FLOOR + 1, 1, 6, PALETTE.floorC);
			p.px((x + 6) % W, FLOOR + 8, 1, 7, PALETTE.floorC);
		}

		p.px(14, FLOOR + 3, 28, 8, PALETTE.bookA);
		p.px(14, FLOOR + 3, 28, 1, PALETTE.rugGlint);
		p.px(18, FLOOR + 5, 20, 4, PALETTE.bookC);
		p.px(22, FLOOR + 6, 12, 2, PALETTE.paper);
		for (let f = 14; f < 42; f += 3) p.px(f, FLOOR + 11, 1, 2, PALETTE.bookA);

		if (mood.dusk) {
			p.px(0, CEIL, W, H - CEIL, PALETTE.nightWash);
			p.polygon(
				[
					[4, 50],
					[34, 50],
					[44, H],
					[0, H],
				],
				PALETTE.lampGlow,
			);
		}
	},
	surfaces: [{ kind: "floor", y: FLOOR, x1: 0, x2: W, label: "floor" }],
};

/**
 * Draw order is back-to-front, so a fixture later in this list paints over an earlier one — the
 * sofa in front of the wall, the floor's lamplight wash over everything.
 */
export const LIVING_ROOM: RoomDef = {
	width: W,
	height: H,
	ceilingY: CEIL,
	floorY: FLOOR,
	door: { x1: 1, x2: 13, y: FLOOR },
	fixtures: [shell, window_, pothos, bookshelf, skirtingAndDoor, sofa, snakePlant, floorAndRug],
};

/** Every standable and hangable surface in a room, flattened. */
export function roomSurfaces(def: RoomDef): RoomSurface[] {
	return def.fixtures.flatMap((f) => f.surfaces ?? []);
}

export function roomWalls(def: RoomDef): RoomWall[] {
	return def.fixtures.flatMap((f) => f.walls ?? []);
}
