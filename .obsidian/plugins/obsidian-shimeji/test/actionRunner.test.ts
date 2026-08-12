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
		bredOffsets: [] as Array<{ x: number; y: number; bornBehaviorName?: string }>,
		setVisualImage(src: string) {
			this.shownImages.push(src);
		},
		requestSibling(x: number, y: number, bornBehaviorName?: string) {
			this.bredOffsets.push({ x, y, bornBehaviorName });
		},
		getViewportSize() {
			return { width: 1000, height: 1000 };
		},
		getTotalMascotCount() {
			return 1;
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
	const ctx = createRuntimeContext(
		mascot.physics,
		{ viewportWidth: 1000, viewportHeight: 1000, pointer: AMBIENT, totalMascotCount: 1 },
		0,
		new Random(1),
	);
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

	it("aborts and flags lostGround if a Wall-bordered Move's wall vanishes mid-climb (LostGroundException equivalent)", () => {
		const pack: MascotPack = {
			...NOOP_PACK,
			actions: new Map([
				[
					"ClimbWall",
					action({
						name: "ClimbWall",
						type: "Move",
						borderType: "Wall",
						animations: animOf([{ image: "/climb.png", durationMs: 100000, velocity: { x: 0, y: -10 } }]),
					}),
				],
			]),
		};
		const runner = new ActionRunner(pack);
		const mascot = makeFakeMascot();
		mascot.physics.x = 500; // nowhere near any wall
		mascot.physics.y = 500;
		const env = envFor(pack, mascot);
		runner.start("ClimbWall", env, { TargetY: "0" });

		const done = runner.tick(env, 0.02, []); // no ledges at all -> no wall anywhere
		expect(done).toBe(true);
		expect(runner.lostGround).toBe(true);
	});

	it("does not flag lostGround while the wall being climbed is still there", () => {
		const pack: MascotPack = {
			...NOOP_PACK,
			actions: new Map([
				[
					"ClimbWall",
					action({
						name: "ClimbWall",
						type: "Move",
						borderType: "Wall",
						animations: animOf([{ image: "/climb.png", durationMs: 100000, velocity: { x: 0, y: -10 } }]),
					}),
				],
			]),
		};
		const runner = new ActionRunner(pack);
		const mascot = makeFakeMascot();
		mascot.physics.x = 0; // right at the window's left wall
		mascot.physics.y = 500;
		const env = envFor(pack, mascot);
		const ledges = [{ kind: "wall" as const, side: "left" as const, x: 0, y1: 0, y2: 1000, source: "window" as const }];
		runner.start("ClimbWall", env, { TargetY: "0" });

		const done = runner.tick(env, 0.02, ledges);
		expect(done).toBe(false);
		expect(runner.lostGround).toBe(false);
	});

	it("aborts and flags lostGround if a Wall-bordered Stay's wall vanishes (real GrabWall's own Stay+BorderType=Wall pairing)", () => {
		const pack: MascotPack = {
			...NOOP_PACK,
			actions: new Map([
				["GrabWall", action({ name: "GrabWall", type: "Stay", borderType: "Wall", animations: animOf([{ image: "/grab.png", durationMs: 100000 }]) })],
			]),
		};
		const runner = new ActionRunner(pack);
		const mascot = makeFakeMascot();
		mascot.physics.x = 500; // nowhere near any wall
		mascot.physics.y = 500;
		const env = envFor(pack, mascot);
		runner.start("GrabWall", env);

		const done = runner.tick(env, 0.02, []);
		expect(done).toBe(true);
		expect(runner.lostGround).toBe(true);
	});

	it("does not flag lostGround for a Wall-bordered Stay while its wall is still there", () => {
		const pack: MascotPack = {
			...NOOP_PACK,
			actions: new Map([
				["GrabWall", action({ name: "GrabWall", type: "Stay", borderType: "Wall", animations: animOf([{ image: "/grab.png", durationMs: 100000 }]) })],
			]),
		};
		const runner = new ActionRunner(pack);
		const mascot = makeFakeMascot();
		mascot.physics.x = 0;
		mascot.physics.y = 500;
		const env = envFor(pack, mascot);
		const ledges = [{ kind: "wall" as const, side: "left" as const, x: 0, y1: 0, y2: 1000, source: "window" as const }];
		runner.start("GrabWall", env);

		const done = runner.tick(env, 0.02, ledges);
		expect(done).toBe(false);
		expect(runner.lostGround).toBe(false);
	});

	it("Look with no LookRight override toggles current facing, not 'face the cursor' (real Look.apply()'s own default)", () => {
		const pack: MascotPack = { ...NOOP_PACK, actions: new Map([["Look", action({ name: "Look", type: "Embedded", embeddedName: "Look" })]]) };
		const runner = new ActionRunner(pack);
		const mascot = makeFakeMascot();
		mascot.physics.facing = 1;
		mascot.physics.x = 500;
		const env = envFor(pack, mascot);
		// Ambient cursor is far to the left — if the old "face the cursor" default were still in
		// effect, this would end up facing -1; the real default just flips whatever it already was.
		env.ambient.x = 0;
		runner.start("Look", env);
		runner.tick(env, 0.02, []);
		expect(mascot.physics.facing).toBe(-1);

		const mascot2 = makeFakeMascot();
		mascot2.physics.facing = -1;
		const env2 = envFor(pack, mascot2);
		runner.start("Look", env2);
		runner.tick(env2, 0.02, []);
		expect(mascot2.physics.facing).toBe(1);
	});

	it("Look with an explicit LookRight override still respects it directly", () => {
		const pack: MascotPack = { ...NOOP_PACK, actions: new Map([["Look", action({ name: "Look", type: "Embedded", embeddedName: "Look" })]]) };
		const runner = new ActionRunner(pack);
		const mascot = makeFakeMascot();
		mascot.physics.facing = 1;
		const env = envFor(pack, mascot);
		runner.start("Look", env, { LookRight: "false" });
		runner.tick(env, 0.02, []);
		expect(mascot.physics.facing).toBe(-1);
	});

	it("a Jump action reaches its TargetX/TargetY, moving in a straight line rather than a gravity arc", () => {
		const pack: MascotPack = {
			...NOOP_PACK,
			actions: new Map([["Jumping", action({ name: "Jumping", type: "Embedded", embeddedName: "Jump", params: { VelocityParam: "20" } })]]),
		};
		const runner = new ActionRunner(pack);
		const mascot = makeFakeMascot();
		mascot.physics.x = 0;
		mascot.physics.y = 0;
		const env = envFor(pack, mascot);
		runner.start("Jumping", env, { TargetX: "300", TargetY: "-50" });

		let done = false;
		for (let i = 0; i < 100 && !done; i++) done = runner.tick(env, 0.02, []);
		expect(done).toBe(true);
		expect(mascot.physics.x).toBe(300);
		expect(mascot.physics.y).toBe(-50);
		expect(mascot.physics.grounded).toBe(false);
	});

	// Real ActionBase.hasNext(): `time < Duration` (default effectively infinite), independent of
	// how many poses the action has; real Animation always cycles its poses by `time %
	// totalDuration`. A Stay with a Duration override that outlasts its own pose-cycle length
	// (e.g. the real pack's SitAndDangleLegs: 4 poses summing to ~1.6s, referenced with
	// Duration="500-600" i.e. 20-24s) must keep *cycling* those poses for the full override, not
	// stop the instant it's played through them once.
	it("a multi-Pose Stay cycles its poses for its full Duration override, not just one pass", () => {
		const pack: MascotPack = {
			...NOOP_PACK,
			actions: new Map([
				[
					"DangleLegs",
					action({
						name: "DangleLegs",
						type: "Stay",
						animations: animOf([
							{ image: "/a.png", durationMs: 40 },
							{ image: "/b.png", durationMs: 40 },
						]),
					}),
				],
			]),
		};
		const runner = new ActionRunner(pack);
		const mascot = makeFakeMascot();
		const env = envFor(pack, mascot);
		// Duration="20" ticks * 40ms/tick = 800ms — 10x the pose cycle's own 80ms, so a correct
		// port must visibly cycle back through both poses several times before finishing.
		runner.start("DangleLegs", env, { Duration: "20" });

		for (let i = 0; i < 10; i++) expect(runner.tick(env, 0.04, [])).toBe(false);
		expect(mascot.shownImages.filter((s) => s === "resolved:/a.png").length).toBeGreaterThan(1);
		expect(mascot.shownImages.filter((s) => s === "resolved:/b.png").length).toBeGreaterThan(1);

		let done = false;
		for (let i = 0; i < 15 && !done; i++) done = runner.tick(env, 0.04, []);
		expect(done).toBe(true);
	});

	it("a multi-Pose Stay with no Duration override holds indefinitely (real Duration default is effectively infinite)", () => {
		const pack: MascotPack = {
			...NOOP_PACK,
			actions: new Map([
				[
					"DangleLegs",
					action({
						name: "DangleLegs",
						type: "Stay",
						animations: animOf([
							{ image: "/a.png", durationMs: 40 },
							{ image: "/b.png", durationMs: 40 },
						]),
					}),
				],
			]),
		};
		const runner = new ActionRunner(pack);
		const mascot = makeFakeMascot();
		const env = envFor(pack, mascot);
		runner.start("DangleLegs", env);

		let done = false;
		for (let i = 0; i < 500; i++) done = done || runner.tick(env, 0.04, []);
		expect(done).toBe(false);
	});

	it("a multi-Pose Animate self-ends after exactly one pass through its poses, even with no Duration override (real Animate.hasNext()'s own time < animation.getDuration() cap)", () => {
		const pack: MascotPack = {
			...NOOP_PACK,
			actions: new Map([
				[
					"Reaction",
					action({
						name: "Reaction",
						type: "Animate",
						animations: animOf([
							{ image: "/a.png", durationMs: 40 },
							{ image: "/b.png", durationMs: 40 },
						]),
					}),
				],
			]),
		};
		const runner = new ActionRunner(pack);
		const mascot = makeFakeMascot();
		const env = envFor(pack, mascot);
		runner.start("Reaction", env);

		expect(runner.tick(env, 0.04, [])).toBe(false);
		expect(runner.tick(env, 0.04, [])).toBe(true);
		expect(mascot.shownImages.filter((s) => s === "resolved:/a.png").length).toBe(1);
	});

	it("an explicit Duration override shorter than an Animate's own pose-cycle still wins (the stricter of the two caps)", () => {
		const pack: MascotPack = {
			...NOOP_PACK,
			actions: new Map([
				[
					"Reaction",
					action({
						name: "Reaction",
						type: "Animate",
						animations: animOf([
							{ image: "/a.png", durationMs: 40 },
							{ image: "/b.png", durationMs: 40 },
						]),
					}),
				],
			]),
		};
		const runner = new ActionRunner(pack);
		const mascot = makeFakeMascot();
		const env = envFor(pack, mascot);
		runner.start("Reaction", env, { Duration: "1" });
		expect(runner.tick(env, 0.04, [])).toBe(true);
	});

	it("ThrowIE holds its single pose in place for its own Duration instead of running real Fall physics on the mascot (real ThrowIE.java extends Animate, not Fall — the window gets thrown, not the mascot)", () => {
		const pack: MascotPack = {
			...NOOP_PACK,
			actions: new Map([
				[
					"ThrowIe",
					action({
						name: "ThrowIe",
						type: "Embedded",
						embeddedName: "ThrowIE",
						borderType: "Floor",
						animations: animOf([{ image: "/shime37.png", durationMs: 40 * 40 }]),
					}),
				],
			]),
		};
		const runner = new ActionRunner(pack);
		const mascot = makeFakeMascot();
		mascot.physics.y = 300;
		mascot.physics.grounded = true;
		const env = envFor(pack, mascot);
		const ledges = [{ kind: "floor" as const, y: 300, x1: -1000, x2: 1000, source: "window" as const }];
		runner.start("ThrowIe", env);

		// Real Fall physics (the old, wrong mapping) would immediately re-detect the floor
		// already underfoot and complete within a tick or two; the real ThrowIE just holds its
		// one pose here for its full declared duration (40 ticks) without ever touching vy.
		for (let i = 0; i < 30; i++) {
			expect(runner.tick(env, 0.04, ledges)).toBe(false);
			expect(mascot.physics.vy).toBe(0);
			expect(mascot.physics.y).toBe(300);
		}
		let done = false;
		for (let i = 0; i < 15 && !done; i++) done = runner.tick(env, 0.04, ledges);
		expect(done).toBe(true);
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

	it("a NextBehavior reference is gated only by its own condition, never the target's separate top-level condition (matches Configuration.buildBehavior)", () => {
		const pack: MascotPack = {
			...NOOP_PACK,
			actions: new Map([
				["From", action({ name: "From", type: "Animate", animations: animOf([{ image: "/from.png", durationMs: 10 }]) })],
				["Gated", action({ name: "Gated", type: "Animate", animations: animOf([{ image: "/gated.png", durationMs: 100000 }]) })],
			]),
			behaviors: new Map([
				[
					"From",
					behavior({
						name: "From",
						frequency: 100,
						nextBehaviors: [{ name: "Gated", frequency: 100, condition: undefined, add: false }],
					}),
				],
				// "Gated"'s own top-level Condition is always false. The real engine's
				// Configuration.buildBehavior never re-checks this for a NextBehavior reference —
				// only the reference's own condition (here, none at all) — so this must still be
				// reachable via the transition above.
				["Gated", behavior({ name: "Gated", frequency: 0, condition: parseCondition("#{mascot.anchor.x > 999999}") })],
			]),
		};
		const ai = new BehaviorAI(pack, new Random(1));
		const mascot = makeFakeMascot();
		mascot.physics.grounded = true;
		const ledges: never[] = [];

		for (let i = 0; i < 5; i++) ai.tick(mascot as unknown as Mascot, 0.02, ledges, AMBIENT, DEFAULT_ENGINE_CONFIG);
		expect(ai.currentBehaviorName).toBe("Gated");
	});

	it("respawns (random x, off-screen above) and forces Fall when nothing at all is eligible, instead of freezing forever", () => {
		const pack: MascotPack = {
			...NOOP_PACK,
			actions: new Map([
				["Fall", action({ name: "Fall", type: "Embedded", embeddedName: "Fall" })],
				["Locked", action({ name: "Locked", type: "Animate", animations: animOf([{ image: "/locked.png", durationMs: 10 }]) })],
			]),
			behaviors: new Map([
				["Fall", behavior({ name: "Fall", frequency: 0 })],
				// The only other behavior's condition is always false, so nothing in the general
				// pool ever carries positive weight.
				["Locked", behavior({ name: "Locked", frequency: 100, condition: parseCondition("#{mascot.anchor.x > 999999}") })],
			]),
		};
		const ai = new BehaviorAI(pack, new Random(3));
		const mascot = makeFakeMascot();
		mascot.physics.x = 400;
		mascot.physics.y = 500;
		mascot.physics.grounded = true;
		const ledges: never[] = [];

		ai.tick(mascot as unknown as Mascot, 0.02, ledges, AMBIENT, DEFAULT_ENGINE_CONFIG);

		expect(ai.currentBehaviorName).toBe("Fall");
		// Respawns to exactly -256, but this same ai.tick() call also immediately advances the
		// freshly-started Fall by its own first tick's worth of gravity (this behavior selection
		// and the first physics tick of whatever gets selected always happen within the same
		// ai.tick() call whenever nothing was already running) — so "close to -256", not exact.
		expect(mascot.physics.y).toBeLessThan(-250);
		expect(mascot.physics.x).toBeGreaterThanOrEqual(0);
		expect(mascot.physics.x).toBeLessThanOrEqual(1000); // the fake mascot's own viewport width
		expect(mascot.physics.grounded).toBe(false);
	});

	it("recovers (respawns, forces Fall) if a mascot ever drifts entirely off-screen mid-action", () => {
		const pack: MascotPack = {
			...NOOP_PACK,
			actions: new Map([
				["Fall", action({ name: "Fall", type: "Embedded", embeddedName: "Fall" })],
				// A long-held Stay so the action is still "running" (not done) on every tick,
				// matching the real check only applying while hasNext() is still true afterward.
				["Stuck", action({ name: "Stuck", type: "Stay", animations: animOf([{ image: "/stuck.png", durationMs: 100000 }]) })],
			]),
			behaviors: new Map([
				["Fall", behavior({ name: "Fall", frequency: 0 })],
				["Stuck", behavior({ name: "Stuck", frequency: 100 })],
			]),
		};
		const ai = new BehaviorAI(pack, new Random(1));
		const mascot = makeFakeMascot();
		mascot.physics.grounded = true;
		const ledges: never[] = [];

		ai.tick(mascot as unknown as Mascot, 0.02, ledges, AMBIENT, DEFAULT_ENGINE_CONFIG);
		expect(ai.currentBehaviorName).toBe("Stuck");

		mascot.physics.x = -99999; // drifted somehow far off the left edge
		ai.tick(mascot as unknown as Mascot, 0.02, ledges, AMBIENT, DEFAULT_ENGINE_CONFIG);

		expect(ai.currentBehaviorName).toBe("Fall");
		expect(mascot.physics.y).toBe(-256);
	});
});
