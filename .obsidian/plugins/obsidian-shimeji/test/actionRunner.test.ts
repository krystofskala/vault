import { describe, expect, it } from "vitest";
import { ActionRunner } from "../src/shimeji/ActionRunner";
import { BehaviorAI } from "../src/shimeji/BehaviorAI";
import { createRuntimeContext } from "../src/shimeji/RuntimeContext";
import { parseCondition } from "../src/shimeji/Expression";
import { Random } from "../src/engine/Random";
import { DEFAULT_ENGINE_CONFIG } from "../src/engine/types";
import type { Mascot } from "../src/engine/Mascot";
import type { ActionDef, BehaviorDef, MascotPack } from "../src/shimeji/types";

/** A minimal object satisfying the parts of Mascot that ActionRunner/BehaviorAI actually use,
 * so the interpreter can be exercised without a real DOM-backed Mascot instance. */
function makeFakeMascot() {
	return {
		physics: { x: 0, y: 0, vx: 0, vy: 0, facing: 1 as const, grounded: false },
		stateElapsedMs: 0,
		shownImages: [] as string[],
		setVisualImage(src: string) {
			this.shownImages.push(src);
		},
	};
}

function action(partial: Partial<ActionDef> & { name: string }): ActionDef {
	return {
		type: "Stay",
		loop: false,
		poses: [],
		children: [],
		params: {},
		...partial,
	};
}

const NOOP_PACK: MascotPack = {
	id: "test",
	name: "Test Pack",
	actions: new Map(),
	behaviors: new Map(),
	resolveImage: (p) => `resolved:${p}`,
};

describe("ActionRunner", () => {
	it("steps through Animate poses by duration and completes", () => {
		const pack: MascotPack = {
			...NOOP_PACK,
			actions: new Map([
				["Stand", action({ name: "Stand", type: "Animate", poses: [{ image: "/a.png", anchor: { x: 1, y: 2 }, durationMs: 50 }] })],
			]),
		};
		const runner = new ActionRunner(pack);
		const mascot = makeFakeMascot();
		runner.start("Stand");

		const ctx = createRuntimeContext(mascot.physics, { viewportWidth: 100, viewportHeight: 100 }, 0, new Random(1));
		expect(runner.tick(mascot as unknown as Mascot, 0.02, [], { x: 0, y: 0 }, ctx, DEFAULT_ENGINE_CONFIG)).toBe(false);
		expect(mascot.shownImages).toContain("resolved:/a.png");
		expect(runner.tick(mascot as unknown as Mascot, 0.04, [], { x: 0, y: 0 }, ctx, DEFAULT_ENGINE_CONFIG)).toBe(true);
	});

	it("runs a Sequence's children in order", () => {
		const pack: MascotPack = {
			...NOOP_PACK,
			actions: new Map([
				["A", action({ name: "A", type: "Animate", poses: [{ image: "/a.png", anchor: { x: 0, y: 0 }, durationMs: 10 }] })],
				["B", action({ name: "B", type: "Animate", poses: [{ image: "/b.png", anchor: { x: 0, y: 0 }, durationMs: 10 }] })],
				["Seq", action({ name: "Seq", type: "Sequence", children: [{ name: "A", paramOverrides: {} }, { name: "B", paramOverrides: {} }] })],
			]),
		};
		const runner = new ActionRunner(pack);
		const mascot = makeFakeMascot();
		runner.start("Seq");
		const ctx = createRuntimeContext(mascot.physics, { viewportWidth: 100, viewportHeight: 100 }, 0, new Random(1));

		for (let i = 0; i < 10; i++) {
			runner.tick(mascot as unknown as Mascot, 0.02, [], { x: 0, y: 0 }, ctx, DEFAULT_ENGINE_CONFIG);
		}
		// A pushed child isn't ticked until the *next* tick() call, so each 10ms-duration
		// leaf (which completes on its very first internal tick) is shown exactly once.
		expect(mascot.shownImages).toEqual(["resolved:/a.png", "resolved:/b.png"]);
	});

	it("Select picks the first child whose condition passes", () => {
		const pack: MascotPack = {
			...NOOP_PACK,
			actions: new Map([
				["Near", action({ name: "Near", type: "Animate", poses: [{ image: "/near.png", anchor: { x: 0, y: 0 }, durationMs: 10 }] })],
				["Far", action({ name: "Far", type: "Animate", poses: [{ image: "/far.png", anchor: { x: 0, y: 0 }, durationMs: 10 }] })],
				[
					"Pick",
					action({
						name: "Pick",
						type: "Select",
						children: [
							{ name: "Near", condition: parseCondition("#{mascot.anchor.x < 50}"), paramOverrides: {} },
							{ name: "Far", paramOverrides: {} },
						],
					}),
				],
			]),
		};
		const runner = new ActionRunner(pack);
		const mascot = makeFakeMascot();
		mascot.physics.x = 10;
		runner.start("Pick");
		const ctx = createRuntimeContext(mascot.physics, { viewportWidth: 100, viewportHeight: 100 }, 0, new Random(1));
		// First call resolves the Select branch and pushes it; the pushed child is
		// only ticked (and its pose shown) starting from the next call.
		runner.tick(mascot as unknown as Mascot, 0.01, [], { x: 0, y: 0 }, ctx, DEFAULT_ENGINE_CONFIG);
		runner.tick(mascot as unknown as Mascot, 0.01, [], { x: 0, y: 0 }, ctx, DEFAULT_ENGINE_CONFIG);
		expect(mascot.shownImages).toEqual(["resolved:/near.png"]);
	});

	it("Embedded Fall integrates gravity via the native adapter until it lands", () => {
		const pack: MascotPack = {
			...NOOP_PACK,
			actions: new Map([["Fall", action({ name: "Fall", type: "Embedded", embeddedName: "Fall" })]]),
		};
		const runner = new ActionRunner(pack);
		const mascot = makeFakeMascot();
		mascot.physics.y = 0;
		runner.start("Fall");
		const ledges = [{ kind: "floor" as const, y: 100, x1: -1000, x2: 1000, source: "window" as const }];
		const ctx = createRuntimeContext(mascot.physics, { viewportWidth: 100, viewportHeight: 100 }, 0, new Random(1));

		let done = false;
		for (let i = 0; i < 200 && !done; i++) {
			done = runner.tick(mascot as unknown as Mascot, 0.016, ledges, { x: 0, y: 0 }, ctx, DEFAULT_ENGINE_CONFIG);
		}
		expect(done).toBe(true);
		expect(mascot.physics.y).toBe(100);
		expect(mascot.physics.grounded).toBe(true);
	});
});

describe("BehaviorAI", () => {
	function behavior(partial: Partial<BehaviorDef> & { name: string }): BehaviorDef {
		return { frequency: 0, hidden: false, nextBehaviors: [], ...partial };
	}

	it("only ever selects the one visible, non-zero-frequency behavior", () => {
		const pack: MascotPack = {
			...NOOP_PACK,
			actions: new Map([
				["Fall", action({ name: "Fall", type: "Embedded", embeddedName: "Fall" })],
				["ChaseMouse", action({ name: "ChaseMouse", type: "Embedded", embeddedName: "ChaseMouse" })],
				["Dragged", action({ name: "Dragged", type: "Embedded", embeddedName: "Dragged" })],
				["Thrown", action({ name: "Thrown", type: "Embedded", embeddedName: "Thrown" })],
				["Stand", action({ name: "Stand", type: "Animate", poses: [{ image: "/stand.png", anchor: { x: 0, y: 0 }, durationMs: 10 }] })],
			]),
			behaviors: new Map([
				["Fall", behavior({ name: "Fall", hidden: true })],
				["ChaseMouse", behavior({ name: "ChaseMouse", hidden: true })],
				["Dragged", behavior({ name: "Dragged", hidden: true })],
				["Thrown", behavior({ name: "Thrown", hidden: true })],
				["Stand", behavior({ name: "Stand", frequency: 100 })],
			]),
		};
		const ai = new BehaviorAI(pack, new Random(5));
		const mascot = makeFakeMascot();
		const ledges = [{ kind: "floor" as const, y: 0, x1: -1000, x2: 1000, source: "window" as const }];
		mascot.physics.grounded = true;

		for (let i = 0; i < 20; i++) {
			ai.tick(mascot as unknown as Mascot, 0.02, ledges, { x: 0, y: 0 }, DEFAULT_ENGINE_CONFIG);
		}
		expect(mascot.shownImages.every((src) => src === "resolved:/stand.png")).toBe(true);
		expect(mascot.shownImages.length).toBeGreaterThan(0);
	});
});
