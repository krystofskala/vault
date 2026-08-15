import type { RoomDef, RoomFixture } from "./roomDef";

/**
 * The apartment: a supplied piece of isometric pixel art, with collision geometry authored on top
 * of it.
 *
 * **The art is not drawn by this plugin.** It is an image the user drops into the vault, and this
 * file is only the surfaces that go with it — which is a different arrangement from the painted
 * fallback room, where `paint` and `surfaces` are the same declaration and cannot drift. Here they
 * can, so the coordinates below are the one thing in the room feature that needs looking at rather
 * than reasoning about: run "Show plant room surfaces" and they are drawn over the artwork.
 *
 * Coordinates are **percentages of the room square**, 0–100 on both axes with y downward, so they
 * hold at any pane width and for any source resolution. The art is square (1:1) and is fitted
 * inside that square without distortion; the dark surround is the pane's own background, which is
 * the only thing that stretches.
 *
 * ## Isometric art, side-on physics
 *
 * The engine's world is a side elevation: floors are horizontal lines and walls vertical ones. The
 * artwork is isometric, so its floor is a diamond that recedes rather than a line. There is no
 * honest way to reconcile those, and rewriting the physics for isometric movement would mean
 * abandoning everything the pack's own behaviours assume about which way is down.
 *
 * So each surface is a horizontal line placed where a mascot standing on it *reads* as standing on
 * that piece of furniture. The floor line is set where the floor diamond is at its widest, which is
 * its back edge rather than its front point — that is the placement that spans nearly the whole
 * room while still looking like floor.
 */

/** Everything in the room is authored against this square, in percent. */
const SIZE = 100;

/** The walkable box. Every furniture surface below sits inside it, and the walls at its ends are
 * what stop a resident walking out into the dark surround — the artwork's own floor has sloping
 * edges that no horizontal line can follow. */
const FLOOR_Y = 71;
const CEILING_Y = 16;
const LEFT_X = 22;
const RIGHT_X = 78;

/** Purely geometric: the artwork supplies the picture, so nothing here paints. */
function surfacesOnly(id: string, fixture: Omit<RoomFixture, "id" | "paint">): RoomFixture {
	return { id, paint: () => {}, ...fixture };
}

export const APARTMENT: RoomDef = {
	width: SIZE,
	height: SIZE,
	ceilingY: CEILING_Y,
	floorY: FLOOR_Y,
	// The artwork is a fixed image with no drawn door, so there is nothing to mirror *for* — and
	// flipping somebody's illustration to suit a sidebar would be taking a liberty with it. The
	// threshold still moves to whichever side faces the workspace; see RoomGeometry.
	mirrorable: false,
	// Fitted to the pane rather than snapped to whole pixels: a sidebar is narrower than the source
	// art, so the useful scales are all below 1 and integer steps would mean 1x or nothing.
	integerScale: false,
	background: "image",
	door: { x1: LEFT_X, x2: LEFT_X + 8, y: FLOOR_Y },
	fixtures: [
		surfacesOnly("room", {
			surfaces: [
				{ kind: "floor", y: FLOOR_Y, x1: LEFT_X, x2: RIGHT_X, label: "floor" },
				// Narrow, and deliberately so. The artwork is an open-topped box whose wall tops slope
				// away from the corner, so a ceiling spanning the full width would have a mascot
				// hanging in the dark surround at either end. Only the span near the corner reads as
				// the top of the room.
				{ kind: "ceiling", y: CEILING_Y, x1: 40, x2: 60, label: "ceiling" },
			],
			walls: [
				{ side: "left", x: LEFT_X, y1: CEILING_Y, y2: FLOOR_Y, label: "room edge" },
				{ side: "right", x: RIGHT_X, y1: CEILING_Y, y2: FLOOR_Y, label: "room edge" },
			],
		}),
		surfacesOnly("bed", {
			surfaces: [{ kind: "floor", y: 53, x1: 43, x2: 61, label: "bed" }],
			// The face a mascot climbs to get up here. Every raised surface has one, so nothing in the
			// room depends on a jump being long enough — jump reach is in screen pixels while the
			// room's own scale follows the pane, so a room that needed jumps would come apart at some
			// sidebar widths and hold together at others.
			walls: [{ side: "left", x: 43, y1: 53, y2: FLOOR_Y, label: "bed side" }],
		}),
		surfacesOnly("bookshelf", {
			surfaces: [
				{ kind: "floor", y: 34, x1: 53, x2: 66, label: "bookshelf top" },
				{ kind: "floor", y: 40, x1: 54, x2: 65, label: "upper shelf" },
				{ kind: "floor", y: 46, x1: 54, x2: 65, label: "lower shelf" },
				{ kind: "ceiling", y: 42, x1: 54, x2: 65, label: "under upper shelf" },
				{ kind: "ceiling", y: 48, x1: 54, x2: 65, label: "under lower shelf" },
			],
			walls: [
				{ side: "left", x: 53, y1: 34, y2: 53, label: "bookshelf side" },
				{ side: "right", x: 66, y1: 34, y2: 53, label: "bookshelf side" },
			],
		}),
		surfacesOnly("desk", {
			surfaces: [{ kind: "floor", y: 60, x1: 61, x2: 73, label: "desk" }],
			walls: [{ side: "left", x: 61, y1: 60, y2: FLOOR_Y, label: "desk side" }],
		}),
		surfacesOnly("tv-stand", {
			surfaces: [{ kind: "floor", y: 62, x1: LEFT_X, x2: 31, label: "TV stand" }],
			walls: [{ side: "right", x: 31, y1: 62, y2: FLOOR_Y, label: "TV stand side" }],
		}),
		surfacesOnly("nightstand", {
			surfaces: [{ kind: "floor", y: 65, x1: 71, x2: RIGHT_X, label: "nightstand" }],
			walls: [{ side: "left", x: 71, y1: 65, y2: FLOOR_Y, label: "nightstand side" }],
		}),
		surfacesOnly("coffee-table", {
			surfaces: [{ kind: "floor", y: 67, x1: 40, x2: 58, label: "coffee table" }],
			walls: [{ side: "left", x: 40, y1: 67, y2: FLOOR_Y, label: "coffee table side" }],
		}),
		surfacesOnly("air-conditioner", {
			// Stretched right to meet the corner wall. Left at its drawn width it would sit a few
			// percent clear of the only climb that reaches it, and the router's join tolerance is in
			// pixels — so it would connect at a wide sidebar and be marooned at a narrow one.
			surfaces: [
				{ kind: "floor", y: 31, x1: 36, x2: 50, label: "air conditioner" },
				{ kind: "ceiling", y: 33, x1: 36, x2: 50, label: "under the air conditioner" },
			],
		}),
		surfacesOnly("back-corner", {
			// The inside corner where the two walls meet: the room's only full-height climb, and how
			// anything gets from the bed up to the ceiling.
			walls: [{ side: "right", x: 50, y1: CEILING_Y, y2: 53, label: "corner" }],
		}),
	]
};
