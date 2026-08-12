import { describe, expect, it } from "vitest";
import { Random } from "../src/engine/Random";

describe("Random", () => {
	it("is deterministic for a given seed", () => {
		const a = new Random(42);
		const b = new Random(42);
		const seqA = Array.from({ length: 5 }, () => a.next());
		const seqB = Array.from({ length: 5 }, () => b.next());
		expect(seqA).toEqual(seqB);
	});

	it("produces values in [0, 1)", () => {
		const rng = new Random(7);
		for (let i = 0; i < 200; i++) {
			const v = rng.next();
			expect(v).toBeGreaterThanOrEqual(0);
			expect(v).toBeLessThan(1);
		}
	});

	it("weightedPick respects zero-weight exclusion when a positive-weight option exists", () => {
		const rng = new Random(1);
		for (let i = 0; i < 50; i++) {
			const picked = rng.weightedPick([
				{ item: "never", weight: 0 },
				{ item: "always", weight: 10 },
			]);
			expect(picked).toBe("always");
		}
	});

	it("weightedPick converges to roughly the given proportions", () => {
		const rng = new Random(123);
		const counts = { a: 0, b: 0 };
		for (let i = 0; i < 10000; i++) {
			const picked = rng.weightedPick([
				{ item: "a" as const, weight: 75 },
				{ item: "b" as const, weight: 25 },
			]);
			if (picked) counts[picked]++;
		}
		const ratio = counts.a / (counts.a + counts.b);
		expect(ratio).toBeGreaterThan(0.7);
		expect(ratio).toBeLessThan(0.8);
	});
});
