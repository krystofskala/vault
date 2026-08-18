import { describe, expect, it } from "vitest";
import { nearestCrowderX } from "../src/engine/crowding";
import type { Mascot } from "../src/engine/Mascot";

function fakeMascot(x: number, opts: { grounded?: boolean; confined?: boolean } = {}) {
	return {
		physics: { x, y: 600, vx: 0, vy: 0, facing: 1, grounded: opts.grounded ?? true },
		confinement: opts.confined ? {} : undefined,
	} as unknown as Mascot;
}

describe("nearestCrowderX", () => {
	it("returns undefined when no other mascot is within crowding distance", () => {
		const a = fakeMascot(200);
		const b = fakeMascot(900);
		expect(nearestCrowderX([a, b], a)).toBeUndefined();
	});

	it("returns the other mascot's x when within crowding distance", () => {
		const a = fakeMascot(500);
		const b = fakeMascot(520);
		expect(nearestCrowderX([a, b], a)).toBe(520);
		expect(nearestCrowderX([a, b], b)).toBe(500);
	});

	it("picks the closest of several nearby mascots", () => {
		const a = fakeMascot(500);
		const near = fakeMascot(515);
		const far = fakeMascot(540);
		expect(nearestCrowderX([a, near, far], a)).toBe(515);
	});

	it("ignores a mascot outside crowding distance even if it's the only other one", () => {
		const a = fakeMascot(500);
		const b = fakeMascot(560);
		expect(nearestCrowderX([a, b], a)).toBeUndefined();
	});

	it("never reports itself as its own crowder", () => {
		const a = fakeMascot(500);
		expect(nearestCrowderX([a], a)).toBeUndefined();
	});

	it("ignores an airborne mascot, whether it's the subject or the neighbour", () => {
		const falling = fakeMascot(500, { grounded: false });
		const standing = fakeMascot(505);
		expect(nearestCrowderX([falling, standing], falling)).toBeUndefined();
		expect(nearestCrowderX([falling, standing], standing)).toBeUndefined();
	});

	it("ignores a confined (room resident) mascot, whether it's the subject or the neighbour", () => {
		const resident = fakeMascot(500, { confined: true });
		const bystander = fakeMascot(505);
		expect(nearestCrowderX([resident, bystander], resident)).toBeUndefined();
		expect(nearestCrowderX([resident, bystander], bystander)).toBeUndefined();
	});
});
