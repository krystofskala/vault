import { describe, expect, it } from "vitest";
import { ActionRunner, type PushEnv } from "../src/shimeji/ActionRunner";
import { BehaviorAI } from "../src/shimeji/BehaviorAI";
import { createRuntimeContext } from "../src/shimeji/RuntimeContext";
import { parseCondition } from "../src/shimeji/Expression";
import { Random } from "../src/engine/Random";
import { DEFAULT_ENGINE_CONFIG } from "../src/engine/types";
import type { Mascot } from "../src/engine/Mascot";
import type { ActionDef, AnimationVariant, BehaviorDef, MascotPack } from "../src/shimeji/types";

/** A minimal object satisfying the parts of Mascot that ActionRunner/BehaviorAI actually use,
 * so the interpreter can be exercised without a real DOM-backed Mascot instance. */
function makeFakeMascot() {
	return {
		physics: { x: 0, y: 0, vx: 0, vy: 0, facing: 1 as 1 | -1, grounded: false },
		stateElapsedMs: 0,
		shownImages: [] as string[],
		setVisualImage(src: string) {
			this.shownImages.push(src);
		},
	};
}

const AMBIENT = { x: 0, y: 0, dx: 0, dy: 0 };

function action(partial: Partial<ActionDef> & { name: string; animations?: AnimationVariant[] }): ActionDef {
	return {
		type: "Stay",
		loop: false,
		animations: [],
		children: [],
		params: {},
		...partial,
	};
}

function animOf(images: Array<{ image: string; durationMs?: number; velocity?: { x: number; y: number } }>): AnimationVariant[] {
	return [
		{
			condition: undefined,
			poses: images.map((i) => ({ image: i.image, anchor: { x: 0, y: 0 }, durationMs: i.durationMs ?? 10, velocity: i.velocity })),
		},
	];
}

const NOOP_PACK: MascotPack = {
	id: "test",
	name: "Test Pack",
	actions: new Map(),
	behaviors: new Map(),
	resolveImage: (p) => `resolved:${p}`,
};

function envFor(pack: MascotPack, mascot: ReturnType<typeof makeFakeMascot>): PushEnv {
	const ctx = createRuntimeContext(mascot.physics, { viewportWidth: 1000, viewportHeight: 1000, pointer: AMBIENT }, 0, new Random(1));
	return { mascot: mascot as unknown as Mascot, ctx, ambient: AMBIENT, config: DEFAULT_ENGINE_CONFIG };
}

describe("ActionRunner", () => {
	it("steps through Animate poses by duration and completes", () => {
		const pack: MascotPack = { ...NOOP_PACK, actions: new Map([["Stand", action({ name: "Stand", type: "Animate", animations: animOf([{ image: "/a.png", durationMs: 50 }]) })]]) };
		const runner = new ActionRunner(pack);
		const mascot = makeFakeMascot();
		const env = envFor(pack, mascot);
		runner.start("Stand", env);

		expect(runner.tick(env, 0.02, [])).toBe(false);
		expect(mascot.shownImages).toContain("resolved:/a.png");
		expect(runner.tick(env, 0.04, [])).toBe(true);
	});

	it("runs a Sequence's children in order", () => {
		const pack: MascotPack = {
			...NOOP_PACK,
			actions: new Map([
				["A", action({ name: "A", type: "Animate", animations: animOf([{ image: "/a.png", durationMs: 10 }]) })],
				["B", action({ name: "B", type: "Animate", animations: animOf([{ image: "/b.png", durationMs: 10 }]) })],
				["Seq", action({ name: "Seq", type: "Sequence", children: [{ name: "A", paramOverrides: {} }, { name: "B", paramOverrides: {} }] })],
			]),
		};
		const runner = new ActionRunner(pack);
		const mascot = makeFakeMascot();
		const env = envFor(pack, mascot);
		runner.start("Seq", env);

		for (let i = 0; i < 10; i++) runner.tick(env, 0.02, []);
		// A pushed child isn't ticked until the *next* tick() call, and each 10ms-duration leaf
		// completes on its own first internal tick, so each is shown exactly once.
		expect(mascot.shownImages).toEqual(["resolved:/a.png", "resolved:/b.png"]);
	});

	it("Select picks the first child whose condition passes", () => {
		const pack: MascotPack = {
			...NOOP_PACK,
			actions: new Map([
				["Near", action({ name: "Near", type: "Animate", animations: animOf([{ image: "/near.png", durationMs: 10 }]) })],
				["Far", action({ name: "Far", type: "Animate", animations: animOf([{ image: "/far.png", durationMs: 10 }]) })],
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
		const env = envFor(pack, mascot);
		runner.start("Pick", env);
		// First call resolves the branch and pushes it; the pushed child is only ticked
		// (and its pose shown) starting from the next call.
		runner.tick(env, 0.01, []);
		runner.tick(env, 0.01, []);
		expect(mascot.shownImages).toEqual(["resolved:/near.png"]);
	});

	it("Embedded Fall integrates gravity via the native adapter until it lands", () => {
		const pack: MascotPack = { ...NOOP_PACK, actions: new Map([["Fall", action({ name: "Fall", type: "Embedded", embeddedName: "Fall" })]]) };
		const runner = new ActionRunner(pack);
		const mascot = makeFakeMascot();
		mascot.physics.y = 0;
		const env = envFor(pack, mascot);
		runner.start("Fall", env);
		const ledges = [{ kind: "floor" as const, y: 100, x1: -1000, x2: 1000, source: "window" as const }];

		let done = false;
		for (let i = 0; i < 200 && !done; i++) done = runner.tick(env, 0.016, ledges);
		expect(done).toBe(true);
		expect(mascot.physics.y).toBe(100);
		expect(mascot.physics.grounded).toBe(true);
	});

	it("a Floor-bordered Stay settles onto the real floor instead of freezing mid-air (FallFromWall's pattern: no explicit Falling step)", () => {
		const pack: MascotPack = {
			...NOOP_PACK,
			actions: new Map([
				["Stand", action({ name: "Stand", type: "Stay", borderType: "Floor", animations: animOf([{ image: "/stand.png", durationMs: 100000 }]) })],
			]),
		};
		const runner = new ActionRunner(pack);
		const mascot = makeFakeMascot();
		// Simulate having just left a wall partway up: well above the real floor, not grounded.
		mascot.physics.y = 20;
		mascot.physics.grounded = false;
		const env = envFor(pack, mascot);
		runner.start("Stand", env);
		const ledges = [{ kind: "floor" as const, y: 300, x1: -1000, x2: 1000, source: "window" as const }];

		for (let i = 0; i < 200; i++) runner.tick(env, 0.016, ledges);
		expect(mascot.physics.y).toBe(300);
		expect(mascot.physics.grounded).toBe(true);
	});

	it("a Floor-bordered action already resting on the floor does not drift or lose grounded state", () => {
		const pack: MascotPack = {
			...NOOP_PACK,
			actions: new Map([
				["Stand", action({ name: "Stand", type: "Stay", borderType: "Floor", animations: animOf([{ image: "/stand.png", durationMs: 100000 }]) })],
			]),
		};
		const runner = new ActionRunner(pack);
		const mascot = makeFakeMascot();
		mascot.physics.y = 300;
		mascot.physics.grounded = true;
		const env = envFor(pack, mascot);
		runner.start("Stand", env);
		const ledges = [{ kind: "floor" as const, y: 300, x1: -1000, x2: 1000, source: "window" as const }];

		for (let i = 0; i < 30; i++) runner.tick(env, 0.016, ledges);
		expect(mascot.physics.y).toBe(300);
		expect(mascot.physics.grounded).toBe(true);
	});

	it("a targeted Move walks toward TargetX, facing it, and loops its gait until it arrives", () => {
		const pack: MascotPack = {
			...NOOP_PACK,
			actions: new Map([
				[
					"Walk",
					action({
						name: "Walk",
						type: "Move",
						animations: animOf([
							{ image: "/w1.png", durationMs: 40, velocity: { x: -50, y: 0 } },
							{ image: "/w2.png", durationMs: 40, velocity: { x: -50, y: 0 } },
						]),
					}),
				],
			]),
		};
		const runner = new ActionRunner(pack);
		const mascot = makeFakeMascot();
		mascot.physics.x = 0;
		mascot.physics.facing = -1;
		const env = envFor(pack, mascot);
		runner.start("Walk", env, { TargetX: "200" });

		// Facing should immediately flip to point at the target (which is to the right).
		expect(mascot.physics.facing).toBe(1);

		let done = false;
		for (let i = 0; i < 2000 && !done; i++) done = runner.tick(env, 0.02, []);
		expect(done).toBe(true);
		expect(mascot.physics.x).toBeCloseTo(200, 5);
	});
});

describe("BehaviorAI", () => {
	function behavior(partial: Partial<BehaviorDef> & { name: string }): BehaviorDef {
		return { frequency: 0, nextBehaviors: [], ...partial };
	}

	it("only ever selects the one non-zero-frequency behavior in the pool", () => {
		const pack: MascotPack = {
			...NOOP_PACK,
			actions: new Map([
				["Fall", action({ name: "Fall", type: "Embedded", embeddedName: "Fall" })],
				["ChaseMouse", action({ name: "ChaseMouse", type: "Embedded", embeddedName: "ChaseMouse" })],
				["Dragged", action({ name: "Dragged", type: "Embedded", embeddedName: "Dragged" })],
				["Thrown", action({ name: "Thrown", type: "Embedded", embeddedName: "Thrown" })],
				["Stand", action({ name: "Stand", type: "Animate", animations: animOf([{ image: "/stand.png", durationMs: 10 }]) })],
			]),
			behaviors: new Map([
				["Fall", behavior({ name: "Fall" })],
				["ChaseMouse", behavior({ name: "ChaseMouse" })],
				["Dragged", behavior({ name: "Dragged" })],
				["Thrown", behavior({ name: "Thrown" })],
				["Stand", behavior({ name: "Stand", frequency: 100 })],
			]),
		};
		const ai = new BehaviorAI(pack, new Random(5));
		const mascot = makeFakeMascot();
		const ledges = [{ kind: "floor" as const, y: 0, x1: -1000, x2: 1000, source: "window" as const }];
		mascot.physics.grounded = true;

		for (let i = 0; i < 20; i++) {
			ai.tick(mascot as unknown as Mascot, 0.02, ledges, AMBIENT, DEFAULT_ENGINE_CONFIG);
		}
		expect(mascot.shownImages.every((src) => src === "resolved:/stand.png")).toBe(true);
		expect(mascot.shownImages.length).toBeGreaterThan(0);
	});
});
