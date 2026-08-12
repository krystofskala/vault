import { describe, expect, it } from "vitest";
import { computeLedgesFromRects, findFloorBelow, findWallAt } from "../src/engine/Ledges";

describe("computeLedgesFromRects", () => {
	it("always includes the four window edges", () => {
		const ledges = computeLedgesFromRects({ width: 800, height: 600 }, []);
		expect(ledges).toContainEqual({ kind: "floor", y: 600, x1: 0, x2: 800, source: "window" });
		expect(ledges).toContainEqual({ kind: "ceiling", y: 0, x1: 0, x2: 800, source: "window" });
		expect(ledges).toContainEqual({ kind: "wall", side: "left", x: 0, y1: 0, y2: 600, source: "window" });
		expect(ledges).toContainEqual({ kind: "wall", side: "right", x: 800, y1: 0, y2: 600, source: "window" });
	});

	it("adds a floor ledge along the top of a platform rect", () => {
		const ledges = computeLedgesFromRects({ width: 800, height: 600 }, [
			{ rect: { left: 100, top: 300, right: 400, bottom: 580 }, source: "pane" },
		]);
		expect(ledges).toContainEqual({ kind: "floor", y: 300, x1: 100, x2: 400, source: "pane" });
	});

	it("ignores degenerate (hidden/zero-size) platform rects", () => {
		const ledges = computeLedgesFromRects({ width: 800, height: 600 }, [
			{ rect: { left: 0, top: 0, right: 0, bottom: 0 }, source: "pane" },
			{ rect: { left: 10, top: 0, right: 20, bottom: 600 }, source: "pane" },
		]);
		expect(ledges.filter((l) => l.source === "pane")).toHaveLength(0);
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

describe("findWallAt", () => {
	const ledges = computeLedgesFromRects({ width: 800, height: 600 }, []);

	it("finds a wall within reach", () => {
		expect(findWallAt(ledges, 3, 300, "left", 8)).toBeDefined();
		expect(findWallAt(ledges, 50, 300, "left", 8)).toBeUndefined();
	});
});
