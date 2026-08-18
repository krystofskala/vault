import { describe, expect, it } from "vitest";
import { createRuntimeContext } from "../src/shimeji/RuntimeContext";
import { evaluate, parseExpression } from "../src/shimeji/Expression";
import { Random } from "../src/engine/Random";
import type { LedgeSource, MascotPhysics } from "../src/engine/types";

function makePhysics(): MascotPhysics {
	return { x: 0, y: 0, vx: 0, vy: 0, facing: 1, grounded: false };
}

const ENV = { viewportWidth: 1000, viewportHeight: 800, pointer: { x: 0, y: 0, dx: 0, dy: 0 }, totalMascotCount: 1 };

// Regression coverage for a real bug: onWindowFloor used to be `floor.source !== "pane"`, a
// negative exclusion written before "room" existed as a LedgeSource — it silently absorbed room
// (and statusbar) floors too, so a room-confined mascot wrongly read as "on the window floor" and
// tried to run outside-only behaviors while trapped. mascot.environment.floor.isOn(...) resolves
// straight to this predicate (RuntimeContext.ts:113-114).
describe("floor.isOn", () => {
	function physicsOnFloor(source: LedgeSource): MascotPhysics {
		const floor = { kind: "floor" as const, y: 0, x1: 0, x2: 100, source };
		return { x: 0, y: 0, vx: 0, vy: 0, facing: 1, grounded: true, currentFloor: floor };
	}

	it("is true for a window floor", () => {
		const ctx = createRuntimeContext(physicsOnFloor("window"), ENV, 0, new Random(1));
		expect(evaluate(parseExpression("mascot.environment.floor.isOn(mascot.anchor)"), ctx)).toBe(true);
	});

	for (const source of ["pane", "statusbar", "room"] as const) {
		it(`is false for a ${source} floor (the regression case for "room")`, () => {
			const ctx = createRuntimeContext(physicsOnFloor(source), ENV, 0, new Random(1));
			expect(evaluate(parseExpression("mascot.environment.floor.isOn(mascot.anchor)"), ctx)).toBe(false);
		});
	}

	it("is false when not grounded, even on a window floor", () => {
		const physics = { ...physicsOnFloor("window"), grounded: false };
		const ctx = createRuntimeContext(physics, ENV, 0, new Random(1));
		expect(evaluate(parseExpression("mascot.environment.floor.isOn(mascot.anchor)"), ctx)).toBe(false);
	});
});

describe("createRuntimeContext — Math.random", () => {
	it("Math.random() called normally resolves through call(), in [0, 1)", () => {
		const ctx = createRuntimeContext(makePhysics(), ENV, 0, new Random(1));
		const v = evaluate(parseExpression("Math.random()"), ctx) as number;
		expect(v).toBeGreaterThanOrEqual(0);
		expect(v).toBeLessThan(1);
	});

	// Regression test for a real bug found 2026-08-13, present in this plugin's own bundled
	// reference pack — Shimeji/conf/actions.xml's ClimbCeiling and Walk both have a TargetX like
	// `mascot.lookRight ? workArea.left+Math.random()*100 : workArea.right-Math.random*100` — the
	// second branch is missing the call parens the first branch has. A bare "Math.random" parses
	// as a plain property path, not a call, so it used to fall through resolve()'s generic
	// "unknown identifier" branch and silently become 0 — turning a randomized edge offset into an
	// always-identical, deterministic coordinate instead of failing loudly. Invisible as a bug in
	// isolation; the reason a walk/climb target that should vary run to run looked perfectly
	// deterministic every single time facing one particular direction.
	it("a bare Math.random (no call parens — the real pack's own typo) still varies, instead of silently becoming 0", () => {
		const results = new Set<number>();
		for (let seed = 0; seed < 20; seed++) {
			const ctx = createRuntimeContext(makePhysics(), ENV, 0, new Random(seed));
			results.add(evaluate(parseExpression("100 - Math.random*100"), ctx) as number);
		}
		// "silently resolves to 0" would make every one of these exactly 100 - 0*100 = 100.
		expect(results.size).toBeGreaterThan(1);
		for (const v of results) {
			expect(v).toBeGreaterThan(0);
			expect(v).toBeLessThanOrEqual(100);
		}
	});

	it("a bare Math.random on its own resolves to [0, 1), the same range calling it would give", () => {
		const ctx = createRuntimeContext(makePhysics(), ENV, 0, new Random(1));
		const v = evaluate(parseExpression("Math.random"), ctx) as number;
		expect(v).toBeGreaterThanOrEqual(0);
		expect(v).toBeLessThan(1);
	});
});
