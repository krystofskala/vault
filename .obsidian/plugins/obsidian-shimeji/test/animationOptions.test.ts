import { describe, expect, it } from "vitest";
import { Random } from "../src/engine/Random";
import { evaluateCondition, parseCondition } from "../src/shimeji/Expression";
import { createRuntimeContext } from "../src/shimeji/RuntimeContext";
import { randomVariantConditions } from "../src/wizard/animationOptions";

function ctxWithSeed(seed: number) {
	return createRuntimeContext(
		{ x: 0, y: 0, vx: 0, vy: 0, facing: 1, grounded: true },
		{ viewportWidth: 800, viewportHeight: 600, pointer: { x: 0, y: 0, dx: 0, dy: 0 }, totalMascotCount: 1 },
		0,
		new Random(seed),
	);
}

/** Mirrors ActionRunner.chooseAnimationVariant's own first-match-wins loop, reusing one ctx (and
 * so one advancing rng stream) across the whole scan — the same way one real action-start does. */
function pickVariant(conditions: (string | undefined)[], seed: number): number {
	const ctx = ctxWithSeed(seed);
	for (let i = 0; i < conditions.length; i++) {
		const raw = conditions[i];
		if (raw === undefined || evaluateCondition(parseCondition(raw), ctx)) return i;
	}
	return conditions.length - 1;
}

describe("randomVariantConditions", () => {
	it("returns nothing for zero options", () => {
		expect(randomVariantConditions(0)).toEqual([]);
	});

	it("a single option is unconditional — there's nothing to randomize between", () => {
		expect(randomVariantConditions(1)).toEqual([undefined]);
	});

	it("always ends unconditional, with one condition per option before it", () => {
		for (const count of [2, 3, 4, 5]) {
			const conditions = randomVariantConditions(count);
			expect(conditions).toHaveLength(count);
			expect(conditions[count - 1]).toBeUndefined();
			for (let i = 0; i < count - 1; i++) expect(typeof conditions[i]).toBe("string");
		}
	});

	it("every generated condition parses as a real #{...} expression, not a syntax fallback", () => {
		for (const count of [2, 3, 4, 5]) {
			for (const raw of randomVariantConditions(count).slice(0, -1)) {
				expect(parseCondition(raw as string)).toBeDefined();
			}
		}
	});

	it("distributes picks uniformly across many independent trials, for 2/3/4 options", () => {
		for (const count of [2, 3, 4]) {
			const conditions = randomVariantConditions(count);
			const counts = new Array(count).fill(0);
			const trials = 4000;
			for (let seed = 0; seed < trials; seed++) counts[pickVariant(conditions, seed)]++;

			const expected = trials / count;
			for (const c of counts) {
				// Generous tolerance (well beyond binomial noise for n=4000) — this is checking the
				// cascading-threshold math is right, not chasing exact statistical precision.
				expect(Math.abs(c - expected)).toBeLessThan(expected * 0.25);
			}
		}
	});

	it("without the cascade (the same uncascaded 1/N threshold reused on every variant), the spread fails the uniformity bar the cascade passes", () => {
		// Sanity check that the uniformity test above is actually discriminating: reusing a flat
		// 1/3 threshold on every non-last variant (instead of cascading 1/3, then 1/2) is NOT
		// uniform — the last (unconditional) variant ends up as a catch-all and over-represented,
		// not merely "earlier variants favored"; the point is just that it measurably skews.
		const naive = ["#{Math.random() < 0.3333333333333333}", "#{Math.random() < 0.3333333333333333}", undefined];
		const counts = [0, 0, 0];
		const trials = 4000;
		for (let seed = 0; seed < trials; seed++) counts[pickVariant(naive, seed)]++;
		const expected = trials / 3;
		expect(counts.some((c) => Math.abs(c - expected) >= expected * 0.25)).toBe(true);
	});
});
