import { describe, expect, it } from "vitest";
import { computeLedgesFromRects, findCeilingAt, findFloorBelow, findNearestFloorAt, findWallAt, withoutLedgesTooCloseToTop } from "../src/engine/Ledges";

const PANE_RECT = { left: 100, top: 300, right: 400, bottom: 580 };

describe("computeLedgesFromRects", () => {
	it("always includes the four window edges", () => {
		const ledges = computeLedgesFromRects({ width: 800, height: 600 }, []);
		expect(ledges).toContainEqual({ kind: "floor", y: 600, x1: 0, x2: 800, source: "window" });
		expect(ledges).toContainEqual({ kind: "ceiling", y: 0, x1: 0, x2: 800, source: "window" });
		expect(ledges).toContainEqual({ kind: "wall", side: "left", x: 0, y1: 0, y2: 600, source: "window" });
		expect(ledges).toContainEqual({ kind: "wall", side: "right", x: 800, y1: 0, y2: 600, source: "window" });
	});

	it("adds a floor ledge along the top of a platform rect", () => {
		const ledges = computeLedgesFromRects({ width: 800, height: 600 }, [{ rect: PANE_RECT, source: "pane" }]);
		expect(ledges).toContainEqual({ kind: "floor", y: 300, x1: 100, x2: 400, source: "pane", rect: PANE_RECT });
	});

	it("also adds a ceiling (its underside) and left/right walls for a pane, unlike a plain floor-only source", () => {
		const ledges = computeLedgesFromRects({ width: 800, height: 600 }, [{ rect: PANE_RECT, source: "pane" }]);
		expect(ledges).toContainEqual({ kind: "ceiling", y: 580, x1: 100, x2: 400, source: "pane", rect: PANE_RECT });
		expect(ledges).toContainEqual({ kind: "wall", side: "left", x: 100, y1: 300, y2: 580, source: "pane", rect: PANE_RECT });
		expect(ledges).toContainEqual({ kind: "wall", side: "right", x: 400, y1: 300, y2: 580, source: "pane", rect: PANE_RECT });
	});

	it("does not add walls/ceiling for a non-pane source (e.g. the status bar) — only its top as a floor", () => {
		const rect = { left: 0, top: 590, right: 800, bottom: 600 };
		const ledges = computeLedgesFromRects({ width: 800, height: 600 }, [{ rect, source: "statusbar" }]);
		const statusbarLedges = ledges.filter((l) => l.source === "statusbar");
		expect(statusbarLedges).toHaveLength(1);
		expect(statusbarLedges[0].kind).toBe("floor");
	});

	it("skips a pane's own wall/ceiling when it would exactly coincide with the window's edge", () => {
		// A pane flush against the left edge and reaching the bottom of the window: its left
		// wall and bottom-as-ceiling would just duplicate the window's own left wall / floor.
		const rect = { left: 0, top: 200, right: 300, bottom: 600 };
		const ledges = computeLedgesFromRects({ width: 800, height: 600 }, [{ rect, source: "pane" }]);
		const paneLedges = ledges.filter((l) => l.source === "pane");
		expect(paneLedges.some((l) => l.kind === "wall" && l.side === "left")).toBe(false);
		expect(paneLedges.some((l) => l.kind === "ceiling")).toBe(false);
		expect(paneLedges.some((l) => l.kind === "wall" && l.side === "right")).toBe(true);
	});

	it("every ledge derived from the same pane rect carries a back-reference to that exact rect", () => {
		const ledges = computeLedgesFromRects({ width: 800, height: 600 }, [{ rect: PANE_RECT, source: "pane" }]);
		const paneLedges = ledges.filter((l) => l.source === "pane");
		expect(paneLedges).toHaveLength(4); // floor, ceiling, left wall, right wall
		for (const ledge of paneLedges) expect(ledge.rect).toEqual(PANE_RECT);
	});

	it("ignores degenerate (hidden/zero-size) platform rects", () => {
		const ledges = computeLedgesFromRects({ width: 800, height: 600 }, [
			{ rect: { left: 0, top: 0, right: 0, bottom: 0 }, source: "pane" },
			{ rect: { left: 10, top: 0, right: 20, bottom: 600 }, source: "pane" },
		]);
		expect(ledges.filter((l) => l.source === "pane")).toHaveLength(0);
	});

	// Obsidian's custom title bar/tab strip sits above y=0 in raw window terms but is real app
	// chrome, not open space — worldTop is how Environment.getWorldTop() tells this function
	// where the actual usable area begins. Without it, autonomous wall-climbing/ceiling-walking
	// (entirely authentic shimeji-ee behavior) had nothing stopping it before the literal top of
	// the Electron window, landing mascots on top of that chrome and blocking clicks meant for it.
	describe("worldTop", () => {
		it("moves the window ceiling and the top of both window walls down to worldTop instead of 0", () => {
			const ledges = computeLedgesFromRects({ width: 800, height: 600, top: 40 }, []);
			expect(ledges).toContainEqual({ kind: "ceiling", y: 40, x1: 0, x2: 800, source: "window" });
			expect(ledges).toContainEqual({ kind: "wall", side: "left", x: 0, y1: 40, y2: 600, source: "window" });
			expect(ledges).toContainEqual({ kind: "wall", side: "right", x: 800, y1: 40, y2: 600, source: "window" });
			// The window floor (bottom) is untouched — only the top of the world moved.
			expect(ledges).toContainEqual({ kind: "floor", y: 600, x1: 0, x2: 800, source: "window" });
		});

		it("clamps a pane's own side walls to worldTop even when the pane's rect starts above it", () => {
			// A pane whose measured top (10) sits above worldTop (40) shouldn't let a mascot climb
			// its left/right wall on up past worldTop into the chrome above — same bug, different
			// path (via a pane's own wall instead of the window's).
			const rect = { left: 100, top: 10, right: 400, bottom: 300 };
			const ledges = computeLedgesFromRects({ width: 800, height: 600, top: 40 }, [{ rect, source: "pane" }]);
			const leftWall = ledges.find((l) => l.kind === "wall" && l.side === "left" && l.source === "pane");
			expect(leftWall).toMatchObject({ y1: 40, y2: 300 });
		});

		it("does not add a floor for a pane whose top is at or above worldTop", () => {
			const rect = { left: 100, top: 20, right: 400, bottom: 300 };
			const ledges = computeLedgesFromRects({ width: 800, height: 600, top: 40 }, [{ rect, source: "pane" }]);
			expect(ledges.some((l) => l.kind === "floor" && l.source === "pane")).toBe(false);
		});

		it("omitting top behaves exactly as before (defaults to 0)", () => {
			const withDefault = computeLedgesFromRects({ width: 800, height: 600 }, []);
			const withExplicitZero = computeLedgesFromRects({ width: 800, height: 600, top: 0 }, []);
			expect(withDefault).toEqual(withExplicitZero);
		});
	});
});

describe("findCeilingAt", () => {
	const ledges = computeLedgesFromRects({ width: 800, height: 600 }, [{ rect: PANE_RECT, source: "pane" }]);

	it("finds a pane's underside within reach and x-range", () => {
		const ceiling = findCeilingAt(ledges, 200, 580, 4);
		expect(ceiling?.source).toBe("pane");
		expect(ceiling?.y).toBe(580);
	});

	it("does not match outside the pane's x-range", () => {
		expect(findCeilingAt(ledges, 700, 580, 4)).toBeUndefined();
	});

	it("still finds the window's own ceiling at y=0", () => {
		expect(findCeilingAt(ledges, 400, 1, 4)?.source).toBe("window");
	});
});

describe("findFloorBelow", () => {
	const ledges = computeLedgesFromRects({ width: 800, height: 600 }, [
		{ rect: { left: 100, top: 300, right: 400, bottom: 580 }, source: "pane" },
	]);

	it("finds the nearest floor at a given x within range", () => {
		const floor = findFloorBelow(ledges, 200, 250);
		expect(floor?.y).toBe(300);
	});

	it("does not match a floor outside the x range", () => {
		const floor = findFloorBelow(ledges, 700, 250);
		expect(floor?.y).toBe(600);
	});
});

describe("findNearestFloorAt", () => {
	it("finds the window floor even when it's above the query y (e.g. a stale position after the window shrank)", () => {
		// Window shrunk from 600 to 400: the mascot's stale y=600 is now *below* the only floor
		// there is, which findFloorBelow (an "at or below" search) would treat as "no floor
		// here" and let it fall through forever. findNearestFloorAt has to find it anyway.
		const shrunkLedges = computeLedgesFromRects({ width: 800, height: 400 }, []);
		const floor = findNearestFloorAt(shrunkLedges, 100, 600);
		expect(floor?.y).toBe(400);
	});

	it("picks the closer of two floors spanning the same x, whether above or below", () => {
		const ledges = computeLedgesFromRects({ width: 800, height: 600 }, [
			{ rect: { left: 0, top: 200, right: 800, bottom: 600 }, source: "pane" },
		]);
		// Pane floor at y=200, window floor at y=600; querying from y=250 the pane floor (50px
		// away) is closer than the window floor (350px away), even though it's *above* the query.
		expect(findNearestFloorAt(ledges, 400, 250)?.y).toBe(200);
	});

	it("returns undefined when no floor at all spans this x", () => {
		const onlyPaneFloor = [{ kind: "floor" as const, y: 300, x1: 100, x2: 400, source: "pane" as const }];
		expect(findNearestFloorAt(onlyPaneFloor, 700, 250)).toBeUndefined();
	});
});

describe("findWallAt", () => {
	const ledges = computeLedgesFromRects({ width: 800, height: 600 }, []);

	it("finds a wall within reach", () => {
		expect(findWallAt(ledges, 3, 300, "left", 8)).toBeDefined();
		expect(findWallAt(ledges, 50, 300, "left", 8)).toBeUndefined();
	});
});

// Regression coverage for a real report: a mascot's own anchor could be correctly bounded by
// worldTop and still visually poke into Obsidian's title-bar/tab-strip chrome, because a pane's
// own floor can legitimately sit just a few pixels below worldTop and floor-standing poses are
// bottom-anchored (the sprite extends *upward* from its feet) — and, separately, because a
// climbing pose grips a wall roughly mid-body rather than at the sprite's own top edge, so a
// mascot climbing all the way to a wall's own top end (which starts right at worldTop) has the
// same problem. See withoutLedgesTooCloseToTop's own comment.
describe("withoutLedgesTooCloseToTop", () => {
	it("excludes a floor within standingHeight of worldTop", () => {
		const rect = { left: 100, top: 45, right: 400, bottom: 300 }; // top=45, only 5px below worldTop=40
		const ledges = computeLedgesFromRects({ width: 800, height: 600, top: 40 }, [{ rect, source: "pane" }]);
		const filtered = withoutLedgesTooCloseToTop(ledges, 40, 120); // a 120px-tall mascot
		expect(filtered.some((l) => l.kind === "floor" && l.y === 45)).toBe(false);
	});

	it("keeps a floor that's far enough below worldTop for this mascot's own height", () => {
		const rect = { left: 100, top: 200, right: 400, bottom: 400 };
		const ledges = computeLedgesFromRects({ width: 800, height: 600, top: 40 }, [{ rect, source: "pane" }]);
		const filtered = withoutLedgesTooCloseToTop(ledges, 40, 120); // 40+120=160 < 200, so this floor is fine
		expect(filtered.some((l) => l.kind === "floor" && l.y === 200)).toBe(true);
	});

	it("a shorter mascot (smaller pack, or scaled down) can stand on a floor a taller one can't", () => {
		const rect = { left: 100, top: 60, right: 400, bottom: 300 }; // 20px below worldTop=40
		const ledges = computeLedgesFromRects({ width: 800, height: 600, top: 40 }, [{ rect, source: "pane" }]);
		expect(withoutLedgesTooCloseToTop(ledges, 40, 120).some((l) => l.kind === "floor" && l.y === 60)).toBe(false);
		expect(withoutLedgesTooCloseToTop(ledges, 40, 15).some((l) => l.kind === "floor" && l.y === 60)).toBe(true);
	});

	it("never touches ceiling ledges — ceiling-hanging is unaffected", () => {
		const ledges = computeLedgesFromRects({ width: 800, height: 600, top: 40 }, []);
		const filtered = withoutLedgesTooCloseToTop(ledges, 40, 120);
		const ceilingsBefore = ledges.filter((l) => l.kind === "ceiling");
		const ceilingsAfter = filtered.filter((l) => l.kind === "ceiling");
		expect(ceilingsAfter).toEqual(ceilingsBefore);
	});

	it("the window's own bottom floor is never excluded (far from worldTop in any normal layout)", () => {
		const ledges = computeLedgesFromRects({ width: 800, height: 600, top: 40 }, []);
		const filtered = withoutLedgesTooCloseToTop(ledges, 40, 120);
		expect(filtered.some((l) => l.kind === "floor" && l.y === 600)).toBe(true);
	});

	it("trims a wall's climbable span to end standingHeight short of worldTop, keeping it below that", () => {
		const ledges = computeLedgesFromRects({ width: 800, height: 600, top: 40 }, []);
		const filtered = withoutLedgesTooCloseToTop(ledges, 40, 120); // a 120px-tall mascot, worldTop=40
		const left = filtered.find((l) => l.kind === "wall" && l.side === "left");
		expect(left).toMatchObject({ y1: 160, y2: 600 }); // was y1: 40 before trimming
	});

	it("leaves a wall untouched when its climbable span already starts well below the buffer", () => {
		const ledges = computeLedgesFromRects({ width: 800, height: 600, top: 40 }, [{ rect: PANE_RECT, source: "pane" }]);
		const filtered = withoutLedgesTooCloseToTop(ledges, 40, 120); // 40+120=160, well above this pane's own top=300
		const paneWall = filtered.find((l) => l.kind === "wall" && l.source === "pane" && l.side === "left");
		expect(paneWall).toMatchObject({ y1: 300 });
	});

	it("drops a wall entirely when its whole climbable span falls within the buffer", () => {
		// A short pane hugging worldTop: its own wall spans only 40->70, nowhere near clear of a
		// 120px-tall mascot's buffer (up to y=160) — nothing left to climb near the top at all.
		const rect = { left: 100, top: 45, right: 400, bottom: 70 };
		const ledges = computeLedgesFromRects({ width: 800, height: 600, top: 40 }, [{ rect, source: "pane" }]);
		const filtered = withoutLedgesTooCloseToTop(ledges, 40, 120);
		expect(filtered.some((l) => l.kind === "wall" && l.source === "pane")).toBe(false);
	});
});

/**
 * Card-style themes inset every pane, so neighbours sit a few pixels apart instead of sharing an
 * edge. The rects below are the real ones from a user's live recording (6px gaps), where a mascot
 * walking along the first floor stepped off at x=496, found nothing at 497 because the neighbour
 * starts at 502, and fell 731px past three panes it appeared to be standing on.
 */
describe("card layouts: panes that don't touch", () => {
	const CARDS = [
		{ left: 50, top: 661, right: 496, bottom: 1347 },
		{ left: 502, top: 661, right: 1120, bottom: 1227 },
		{ left: 1126, top: 661, right: 1433, bottom: 1227 },
		{ left: 1439, top: 661, right: 1745, bottom: 1227 },
	];
	const build = () => computeLedgesFromRects({ width: 1748, height: 1392, top: 40 }, CARDS.map((rect) => ({ rect, source: "pane" as const, paneRef: rect })));

	it("joins the row into one continuous floor rather than four with cracks between them", () => {
		const floors = build().filter((l) => l.kind === "floor" && l.source === "pane");
		expect(floors).toHaveLength(1);
		expect(floors[0]).toMatchObject({ y: 661, x1: 50, x2: 1745 });
	});

	it("a mascot over a 6px gap is still standing on the bridged floor, not falling", () => {
		// x=499 sits inside a gap between two cards. Before bridging there was no floor here at all,
		// so a mascot walking across it lost its footing mid-stride.
		expect(findNearestFloorAt(build(), 499, 661)?.y).toBe(661);
	});

	it("and a mascot falling down that gap lands on it rather than the window floor 731px below", () => {
		// Queried from just above the line, which is where a mascot mid-fall actually is.
		expect(findFloorBelow(build(), 499, 655)?.y).toBe(661);
	});

	it("does not merge floors at genuinely different heights", () => {
		const stepped = computeLedgesFromRects({ width: 1748, height: 1392, top: 40 }, [
			{ rect: { left: 50, top: 661, right: 496, bottom: 1347 }, source: "pane" as const },
			{ rect: { left: 502, top: 400, right: 1120, bottom: 1227 }, source: "pane" as const },
		]);
		const ys = stepped.filter((l) => l.kind === "floor" && l.source === "pane").map((l) => (l.kind === "floor" ? l.y : 0));
		expect(ys.sort((a, b) => a - b)).toEqual([400, 661]);
	});

	it("leaves a genuinely wide gap alone — that one is a real hole", () => {
		const spaced = computeLedgesFromRects({ width: 1748, height: 1392, top: 40 }, [
			{ rect: { left: 50, top: 661, right: 496, bottom: 1347 }, source: "pane" as const },
			{ rect: { left: 700, top: 661, right: 1120, bottom: 1227 }, source: "pane" as const },
		]);
		expect(spaced.filter((l) => l.kind === "floor" && l.source === "pane")).toHaveLength(2);
	});
});
