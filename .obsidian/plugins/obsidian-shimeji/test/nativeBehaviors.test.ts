import { describe, expect, it } from "vitest";
import { applyGravityAndLand, clampToWalls, type TickArgs } from "../src/engine/nativeBehaviors";
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
