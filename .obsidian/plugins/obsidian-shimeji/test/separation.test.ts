import { describe, expect, it } from "vitest";
import { applyMascotSeparation } from "../src/engine/separation";
import type { Mascot } from "../src/engine/Mascot";

function fakeMascot(x: number, opts: { grounded?: boolean; confined?: boolean } = {}) {
	return {
		physics: { x, y: 600, vx: 0, vy: 0, facing: 1, grounded: opts.grounded ?? true },
		confinement: opts.confined ? {} : undefined,
	} as unknown as Mascot;
}

/** Runs several fixed steps, the same way Stage.stepSimulation calls this every FIXED_DT. */
function runTicks(mascots: Mascot[], ticks: number, dtSeconds = 0.04): void {
	for (let i = 0; i < ticks; i++) applyMascotSeparation(mascots, dtSeconds);
}

describe("applyMascotSeparation", () => {
	it("drifts two too-close mascots apart over several ticks", () => {
		const a = fakeMascot(500);
		const b = fakeMascot(510); // 10px apart, well inside the minimum
		runTicks([a, b], 30);

		expect(Math.abs(b.physics.x - a.physics.x)).toBeGreaterThan(10);
		// Symmetric: pushed apart around their original midpoint, not one dragging the other.
		expect(a.physics.x).toBeLessThan(500);
		expect(b.physics.x).toBeGreaterThan(510);
	});

	it("eases toward the minimum gap without ever overshooting it", () => {
		const a = fakeMascot(500);
		const b = fakeMascot(510);
		runTicks([a, b], 400); // far more ticks than needed to approach 48px
		const clearedGap = b.physics.x - a.physics.x;
		// The push is proportional to the remaining gap, so it asymptotes toward — but never quite
		// reaches or exceeds — the minimum in finite discrete steps.
		expect(clearedGap).toBeGreaterThan(47.9);
		expect(clearedGap).toBeLessThanOrEqual(48);

		runTicks([a, b], 50);
		// Kept easing closer, but still never crossed the minimum.
		expect(b.physics.x - a.physics.x).toBeGreaterThanOrEqual(clearedGap);
		expect(b.physics.x - a.physics.x).toBeLessThanOrEqual(48);
	});

	it("leaves already-far-apart mascots untouched", () => {
		const a = fakeMascot(200);
		const b = fakeMascot(900);
		runTicks([a, b], 100);
		expect(a.physics.x).toBe(200);
		expect(b.physics.x).toBe(900);
	});

	it("never nudges a confined mascot, even if coincident with another", () => {
		const resident = fakeMascot(500, { confined: true });
		const bystander = fakeMascot(505);
		runTicks([resident, bystander], 100);
		expect(resident.physics.x).toBe(500);
		expect(bystander.physics.x).toBe(505);
	});

	it("never nudges an airborne (non-grounded) mascot", () => {
		const falling = fakeMascot(500, { grounded: false });
		const standing = fakeMascot(505);
		runTicks([falling, standing], 100);
		expect(falling.physics.x).toBe(500);
		expect(standing.physics.x).toBe(505);
	});

	it("resolves exact coincidence deterministically, not stuck or NaN", () => {
		const a = fakeMascot(500);
		const b = fakeMascot(500);
		runTicks([a, b], 200);

		expect(Number.isFinite(a.physics.x)).toBe(true);
		expect(Number.isFinite(b.physics.x)).toBe(true);
		expect(Math.abs(b.physics.x - a.physics.x)).toBeGreaterThan(0);
	});

	it("separates more than two mascots piled on the same spot", () => {
		const mascots = [fakeMascot(500), fakeMascot(500), fakeMascot(500), fakeMascot(500), fakeMascot(500)];
		runTicks(mascots, 400);

		const xs = mascots.map((m) => m.physics.x).sort((p, q) => p - q);
		for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeGreaterThan(0);
	});
});
