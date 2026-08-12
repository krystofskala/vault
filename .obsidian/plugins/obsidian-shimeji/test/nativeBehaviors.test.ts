import { describe, expect, it } from "vitest";
import { applyGravityAndLand, clampToCeiling, clampToWalls, computeLeanPointer, updateWallCeilingAdherence, type TickArgs } from "../src/engine/nativeBehaviors";
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

describe("computeLeanPointer", () => {
	it("extrapolates ahead of the pointer in the swing's own direction, proportional to speed", () => {
		const rightward = computeLeanPointer({ x: 100, y: 50 }, { vx: 1000, vy: 0 }, 0.05);
		expect(rightward.x).toBe(100 + 1000 * 0.05);
		expect(rightward.y).toBe(50);
		expect(rightward.dx).toBe(1000);

		const leftward = computeLeanPointer({ x: 100, y: 50 }, { vx: -1000, vy: 0 }, 0.05);
		expect(leftward.x).toBe(100 - 1000 * 0.05);
	});

	it("collapses to the raw pointer position when not swinging at all", () => {
		const still = computeLeanPointer({ x: 42, y: 7 }, { vx: 0, vy: 0 }, 0.05);
		expect(still).toEqual({ x: 42, y: 7, dx: 0, dy: 0 });
	});

	it("never changes sign of the (pointer - result) gap while the swing direction is held constant", () => {
		// This is the crux of the drag lean-pose bug: as long as vx keeps the same sign, the
		// gap between "where the pointer is" and "the lean reading" must too, however much vx
		// itself fluctuates in magnitude tick to tick (real hand movement is never perfectly
		// smooth) — a real Pinched-style condition must never flip which side it reads as
		// while the actual drag never reversed.
		const speeds = [120, 400, 900, 1800, 260, 1500];
		let pointerX = 0;
		for (const vx of speeds) {
			pointerX += vx * 0.04;
			const lean = computeLeanPointer({ x: pointerX, y: 0 }, { vx, vy: 0 }, 0.05);
			expect(lean.x).toBeGreaterThan(pointerX); // always ahead, never behind, while vx > 0
		}
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
});
