import { describe, expect, it } from "vitest";
import {
	applyGravityAndLand,
	clampToCeiling,
	clampToWalls,
	tickDragFootX,
	updateWallCeilingAdherence,
	type TickArgs,
} from "../src/engine/nativeBehaviors";
import { computeLedgesFromRects } from "../src/engine/Ledges";
import { DEFAULT_ENGINE_CONFIG, type MascotPhysics } from "../src/engine/types";

function physicsAt(x: number, y: number): MascotPhysics {
	return { x, y, vx: 0, vy: 0, facing: 1, grounded: false };
}

describe("clampToWalls", () => {
	const ledges = computeLedgesFromRects({ width: 800, height: 600 }, []);

	it("stops a mascot drifting past the right edge (e.g. a hard throw) instead of letting it escape", () => {
		const physics = physicsAt(850, 300);
		physics.vx = 500;
		clampToWalls(physics, ledges);
		expect(physics.x).toBe(800);
		expect(physics.vx).toBe(0);
	});

	it("stops a mascot drifting past the left edge", () => {
		const physics = physicsAt(-50, 300);
		clampToWalls(physics, ledges);
		expect(physics.x).toBe(0);
		expect(physics.vx).toBe(0);
	});

	it("never traps a mascot mid-air off-screen: gravity + wall clamp always keeps it landable", () => {
		const physics = physicsAt(0, 0);
		physics.vx = 4000; // an extreme throw
		physics.vy = -200;
		const ledges2 = computeLedgesFromRects({ width: 800, height: 600 }, []);
		const args: TickArgs = { physics, ledges: ledges2, dt: 0.05, config: DEFAULT_ENGINE_CONFIG };
		let landed = false;
		for (let i = 0; i < 500 && !landed; i++) landed = applyGravityAndLand(args);
		expect(landed).toBe(true);
		expect(physics.x).toBeGreaterThanOrEqual(0);
		expect(physics.x).toBeLessThanOrEqual(800);
	});
});

describe("clampToCeiling", () => {
	const ledges = computeLedgesFromRects({ width: 800, height: 600 }, []);

	it("stops a mascot thrown upward from sailing through the top of the window", () => {
		const physics = physicsAt(400, -50);
		physics.vy = -300;
		clampToCeiling(physics, ledges);
		expect(physics.y).toBe(0);
		expect(physics.vy).toBe(0);
	});

	it("a hard upward throw still lands instead of escaping through the ceiling", () => {
		const physics = physicsAt(400, 300);
		physics.vy = -5000; // an extreme upward throw
		const args: TickArgs = { physics, ledges: computeLedgesFromRects({ width: 800, height: 600 }, []), dt: 0.05, config: DEFAULT_ENGINE_CONFIG };
		let landed = false;
		for (let i = 0; i < 500 && !landed; i++) landed = applyGravityAndLand(args);
		expect(landed).toBe(true);
		expect(physics.y).toBeGreaterThanOrEqual(0);
		expect(physics.y).toBeLessThanOrEqual(600);
	});
});

describe("tickDragFootX", () => {
	// Faithful port of the real engine's Dragged.java: footDx = (footDx + (cursorX-footX)*0.1)*0.8;
	// footX += footDx. Values below are hand-computed from that exact recurrence so a
	// transcription slip would actually fail the test, not just "look plausible".
	it("matches the real recurrence tick-for-tick for a held cursor step", () => {
		let footX = 0;
		let footDx = 0;
		({ footX, footDx } = tickDragFootX(footX, footDx, 1000));
		expect(footDx).toBeCloseTo(80, 5);
		expect(footX).toBeCloseTo(80, 5);

		({ footX, footDx } = tickDragFootX(footX, footDx, 1000));
		expect(footDx).toBeCloseTo(137.6, 5);
		expect(footX).toBeCloseTo(217.6, 5);

		({ footX, footDx } = tickDragFootX(footX, footDx, 1000));
		expect(footDx).toBeCloseTo(172.672, 5);
		expect(footX).toBeCloseTo(390.272, 5);
	});

	it("stays put once footX has caught up to a steady cursor (no gap, no drift)", () => {
		const { footX, footDx } = tickDragFootX(500, 0, 500);
		expect(footX).toBe(500);
		expect(footDx).toBe(0);
	});

	it("lags behind rather than snapping — never reaches the cursor in a single tick", () => {
		const { footX } = tickDragFootX(0, 0, 1000);
		expect(footX).toBeGreaterThan(0);
		expect(footX).toBeLessThan(1000);
	});

	it("converges toward a sustained cursor position over many ticks", () => {
		// The real recurrence is slightly underdamped (a small overshoot before settling, not a
		// monotonic approach) — a genuine property of the original's own tuning, not something
		// to round away, so the tolerance here is deliberately loose rather than exact.
		let footX = 0;
		let footDx = 0;
		for (let i = 0; i < 60; i++) ({ footX, footDx } = tickDragFootX(footX, footDx, 1000));
		expect(footX).toBeGreaterThan(990);
		expect(footX).toBeLessThan(1010);
	});

	it("lags in the correct direction on both sides (never leads the cursor)", () => {
		const movingRight = tickDragFootX(0, 0, 500);
		expect(movingRight.footX).toBeGreaterThan(0);
		expect(movingRight.footX).toBeLessThan(500);

		const movingLeft = tickDragFootX(0, 0, -500);
		expect(movingLeft.footX).toBeLessThan(0);
		expect(movingLeft.footX).toBeGreaterThan(-500);
	});
});

describe("updateWallCeilingAdherence", () => {
	const paneRect = { left: 100, top: 300, right: 400, bottom: 580 };
	const ledges = computeLedgesFromRects({ width: 800, height: 600 }, [{ rect: paneRect, source: "pane" }]);

	it("sets currentWall when standing right at a pane's side, regardless of what action is running", () => {
		// The mascot need not be doing anything wall-specific — it's enough to simply be
		// positioned there, e.g. having walked into it during an ordinary floor-bordered Walk.
		const physics = physicsAt(100, 400);
		updateWallCeilingAdherence(physics, ledges);
		expect(physics.currentWall?.kind).toBe("wall");
		expect(physics.currentWall && "side" in physics.currentWall ? physics.currentWall.side : undefined).toBe("left");
		expect(physics.currentWall?.source).toBe("pane");
	});

	it("sets currentCeiling when positioned right at a pane's underside", () => {
		const physics = physicsAt(200, 580);
		updateWallCeilingAdherence(physics, ledges);
		expect(physics.currentCeiling?.kind).toBe("ceiling");
		expect(physics.currentCeiling?.source).toBe("pane");
	});

	it("clears both when not near any wall or ceiling", () => {
		const physics = physicsAt(200, 400);
		physics.currentWall = ledges.find((l) => l.kind === "wall");
		physics.currentCeiling = ledges.find((l) => l.kind === "ceiling");
		updateWallCeilingAdherence(physics, ledges);
		expect(physics.currentWall).toBeUndefined();
		expect(physics.currentCeiling).toBeUndefined();
	});

	it("still finds the plain window walls/ceiling when no pane is nearby", () => {
		const physics = physicsAt(1, 1);
		updateWallCeilingAdherence(physics, ledges);
		expect(physics.currentWall?.source).toBe("window");
		expect(physics.currentCeiling?.source).toBe("window");
	});
});

describe("applyGravityAndLand grounded check", () => {
	it("stays grounded across a ledges recomputation even though the objects aren't the same reference", () => {
		const physics = physicsAt(100, 600);
		physics.grounded = true;
		physics.currentFloor = computeLedgesFromRects({ width: 800, height: 600 }, [])[0];

		// Simulate Stage's periodic ledge recompute: a brand-new array of brand-new objects
		// describing the exact same geometry.
		const freshLedges = computeLedgesFromRects({ width: 800, height: 600 }, []);
		const args: TickArgs = { physics, ledges: freshLedges, dt: 0.016, config: DEFAULT_ENGINE_CONFIG };
		const stillGrounded = applyGravityAndLand(args);

		expect(stillGrounded).toBe(true);
		expect(physics.y).toBe(600);
		expect(physics.vy).toBe(0);
	});

	it("re-anchors to the new floor position instead of falling through when the window shrinks under a grounded mascot", () => {
		// Mascot standing at the window's old floor (y=600). The window's bottom edge gets
		// dragged up to 400 — a real "resize the bottom edge, mascots near the bottom fall
		// through" scenario reported against the old findFloorBelow-based check.
		const physics = physicsAt(100, 600);
		physics.grounded = true;
		physics.currentFloor = computeLedgesFromRects({ width: 800, height: 600 }, [])[0];

		const shrunkLedges = computeLedgesFromRects({ width: 800, height: 400 }, []);
		const args: TickArgs = { physics, ledges: shrunkLedges, dt: 0.016, config: DEFAULT_ENGINE_CONFIG };
		const stillGrounded = applyGravityAndLand(args);

		expect(stillGrounded).toBe(true);
		expect(physics.grounded).toBe(true);
		expect(physics.y).toBe(400);
	});

	it("still falls (not stuck) once genuinely nothing spans its x — grounded is cleared, not force-kept", () => {
		const physics = physicsAt(100, 600);
		physics.grounded = true;
		const noFloors: TickArgs["ledges"] = [];
		const args: TickArgs = { physics, ledges: noFloors, dt: 0.016, config: DEFAULT_ENGINE_CONFIG };
		const landed = applyGravityAndLand(args);
		expect(landed).toBe(false);
		expect(physics.grounded).toBe(false);
	});
});

