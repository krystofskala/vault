import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseActionsXml } from "../src/shimeji/ActionsParser";
import { parseBehaviorsXml } from "../src/shimeji/BehaviorsParser";
import { BehaviorAI } from "../src/shimeji/BehaviorAI";
import { ActionRunner, type PushEnv } from "../src/shimeji/ActionRunner";
import { createRuntimeContext } from "../src/shimeji/RuntimeContext";
import { evaluateCondition, withLocals } from "../src/shimeji/Expression";
import { Random } from "../src/engine/Random";
import { computeLeanPointer } from "../src/engine/nativeBehaviors";
import { DEFAULT_ENGINE_CONFIG } from "../src/engine/types";
import type { Mascot } from "../src/engine/Mascot";
import type { MascotPack } from "../src/shimeji/types";

/**
 * Sanity check against the actual standard shimeji-ee conf files shipped in Shimeji/conf/
 * (paired with the user's own 46-image artwork, dropped into Shimeji/img/). This isn't a
 * fixture — catches real-world parsing regressions against the exact files this plugin will
 * actually be run with.
 */
const actionsXml = readFileSync(resolve(process.cwd(), "Shimeji/conf/actions.xml"), "utf-8");
const behaviorsXml = readFileSync(resolve(process.cwd(), "Shimeji/conf/behaviors.xml"), "utf-8");

describe("real standard Shimeji-ee pack", () => {
	const actions = parseActionsXml(actionsXml);
	const behaviors = parseBehaviorsXml(behaviorsXml);

	it("parses without throwing and finds a substantial number of actions/behaviors", () => {
		expect(actions.size).toBeGreaterThan(50);
		expect(behaviors.size).toBeGreaterThan(30);
	});

	it("has the four behaviors/actions required by shimeji-ee itself", () => {
		for (const name of ["ChaseMouse", "Fall", "Dragged", "Thrown"]) {
			expect(actions.has(name), `missing action "${name}"`).toBe(true);
			expect(behaviors.has(name), `missing behavior "${name}"`).toBe(true);
		}
	});

	it("Walk is a 4-pose Move cycle referencing the standard image set", () => {
		const walk = actions.get("Walk");
		expect(walk?.type).toBe("Move");
		expect(walk?.borderType).toBe("Floor");
		const poses = walk?.animations[0]?.poses ?? [];
		expect(poses).toHaveLength(4);
		expect(poses[0].image).toBe("/shime1.png");
	});

	it("ClimbWall has two condition-gated Animation variants (climbing up vs down)", () => {
		const climb = actions.get("ClimbWall");
		expect(climb?.animations.length).toBeGreaterThanOrEqual(2);
		expect(climb?.animations.every((v) => v.condition)).toBe(true);
	});

	it("Fall is a Sequence that references the Falling embedded action", () => {
		const fall = actions.get("Fall");
		expect(fall?.type).toBe("Sequence");
		const referenced = fall?.children.map((c) => c.name) ?? [];
		expect(referenced).toContain("Falling");
	});

	it("Falling is the Embedded leaf with a short embeddedName of Fall", () => {
		const falling = actions.get("Falling");
		expect(falling?.type).toBe("Embedded");
		expect(falling?.embeddedName).toBe("Fall");
	});

	it("Pinched (used by Dragged) resolves to the Dragged native handler", () => {
		expect(actions.get("Pinched")?.embeddedName).toBe("Dragged");
	});

	it("Pinched's lean poses never flip to the opposite extreme while a swing holds one direction (regression for the drag flip-flop bug)", () => {
		const pinched = actions.get("Pinched");
		expect(pinched).toBeDefined();

		function winningImage(footX: number, cursor: { x: number; y: number; dx: number; dy: number }): string | undefined {
			const ctx = withLocals(
				createRuntimeContext(
					{ x: footX, y: 0, vx: 0, vy: 0, facing: 1, grounded: false },
					{ viewportWidth: 800, viewportHeight: 900, pointer: cursor, totalMascotCount: 1 },
					0,
					new Random(1),
				),
				{ FootX: footX },
			);
			for (const variant of pinched!.animations) {
				if (evaluateCondition(variant.condition, ctx)) return variant.poses[0]?.image;
			}
			return undefined;
		}

		function classify(image: string | undefined): "extremeA" | "extremeB" | "neutral" {
			if (image === "/shime9.png" || image === "/shime7.png") return "extremeA";
			if (image === "/shime8.png" || image === "/shime10.png") return "extremeB";
			return "neutral";
		}

		// A real hand's swing speed fluctuates tick to tick even while moving one consistent
		// direction — this drives that fluctuation on purpose, at speeds that do cross Pinched's
		// real ±30/±50px thresholds, to prove the *sign* never depends on the noise.
		for (const speeds of [
			[150, 500, 1200, 2000, 300, 1800, 700],
			[-150, -500, -1200, -2000, -300, -1800, -700],
		]) {
			let footX = 400;
			const seen = new Set<string>();
			for (const vx of speeds) {
				footX += vx * 0.04;
				const lean = computeLeanPointer({ x: footX, y: 0 }, { vx, vy: 0 }, 0.05);
				seen.add(classify(winningImage(footX, lean)));
			}
			expect(seen.has("extremeA") && seen.has("extremeB")).toBe(false);
		}
	});

	it("SplitIntoTwo references the image set up to shime46", () => {
		const divide = actions.get("Divide1");
		const poses = divide?.animations[0]?.poses ?? [];
		expect(poses.some((p) => p.image === "/shime46.png")).toBe(true);
	});

	it("behaviors on the floor inherit the enclosing <Condition> wrapper", () => {
		expect(behaviors.get("StandUp")?.condition).toBeDefined();
	});

	it("a freshly spawned, ungrounded mascot reliably falls first, not some arbitrary zero-weight behavior", () => {
		const pack: MascotPack = { id: "real", name: "Real Shimeji", actions, behaviors, resolveImage: (p) => `resolved:${p}` };
		const ai = new BehaviorAI(pack, new Random(1));
		const mascot = {
			// y=160, matching Stage's actual spawn point — not y=0, which coincides with the
			// ceiling ledge's own y-coordinate and would make ceiling.isOn(anchor) look true.
			physics: { x: 400, y: 160, vx: 0, vy: 0, facing: 1 as const, grounded: false },
			stateElapsedMs: 0,
			setVisualImage: () => {},
			// Taller than the y=600 floor below: viewportHeight === floor.y would spuriously
			// satisfy workArea.bottomBorder.isOn (physics.y >= viewportHeight - EPS) too, which
			// has nothing to do with what these tests are actually exercising.
			getViewportSize: () => ({ width: 800, height: 900 }),
			getTotalMascotCount: () => 1,
		};
		const ledges = [{ kind: "floor" as const, y: 600, x1: 0, x2: 800, source: "window" as const }];

		for (let i = 0; i < 30; i++) {
			ai.tick(mascot as unknown as Mascot, 0.05, ledges, { x: 400, y: 300, dx: 0, dy: 0 }, DEFAULT_ENGINE_CONFIG);
		}
		// Falling for 1.5s of sim time should have made real downward progress, not left the
		// mascot stuck sliding around at its spawn height.
		expect(mascot.physics.y).toBeGreaterThan(170);
	});

	it("eventually chases the mouse even though ChaseMouse's own Frequency is 0 and it's never a NextBehavior target", () => {
		// ChaseMouse is orphaned from the weighted-selection graph in the real pack (like
		// Fall/Dragged/Thrown, the original engine must trigger it directly); BehaviorAI
		// approximates that with a periodic, cooldown-gated eligibility — this drives long
		// enough simulated time to confirm it actually fires at least once.
		const pack: MascotPack = { id: "real", name: "Real Shimeji", actions, behaviors, resolveImage: (p) => `resolved:${p}` };
		const ai = new BehaviorAI(pack, new Random(7));
		const mascot = {
			physics: { x: 400, y: 600, vx: 0, vy: 0, facing: 1 as const, grounded: true },
			stateElapsedMs: 0,
			setVisualImage: () => {},
			// Taller than the y=600 floor below: viewportHeight === floor.y would spuriously
			// satisfy workArea.bottomBorder.isOn (physics.y >= viewportHeight - EPS) too, which
			// has nothing to do with what these tests are actually exercising.
			getViewportSize: () => ({ width: 800, height: 900 }),
			getTotalMascotCount: () => 1,
		};
		const ledges = [{ kind: "floor" as const, y: 600, x1: 0, x2: 800, source: "window" as const }];

		let sawChaseMouse = false;
		for (let i = 0; i < 2000 && !sawChaseMouse; i++) {
			ai.tick(mascot as unknown as Mascot, 0.1, ledges, { x: 700, y: 300, dx: 0, dy: 0 }, DEFAULT_ENGINE_CONFIG);
			if (ai.currentBehaviorName === "ChaseMouse") sawChaseMouse = true;
		}
		expect(sawChaseMouse).toBe(true);
	});

	it("PullUpShimeji1 (a real Breed action) requests exactly one sibling at its BornX/BornY/BornBehavior, then completes", () => {
		const pack: MascotPack = { id: "real", name: "Real Shimeji", actions, behaviors, resolveImage: (p) => `resolved:${p}` };
		const runner = new ActionRunner(pack);
		const bred: Array<{ x: number; y: number; bornBehaviorName?: string }> = [];
		const mascot = {
			physics: { x: 400, y: 600, vx: 0, vy: 0, facing: 1 as const, grounded: true },
			stateElapsedMs: 0,
			setVisualImage: () => {},
			getViewportSize: () => ({ width: 800, height: 900 }),
			getTotalMascotCount: () => 1,
			requestSibling: (x: number, y: number, bornBehaviorName?: string) => bred.push({ x, y, bornBehaviorName }),
		};
		const env: PushEnv = {
			mascot: mascot as unknown as Mascot,
			ctx: createRuntimeContext(
				mascot.physics,
				{ viewportWidth: 800, viewportHeight: 900, pointer: { x: 0, y: 0, dx: 0, dy: 0 }, totalMascotCount: 1 },
				0,
				new Random(1),
			),
			ambient: { x: 0, y: 0 },
			config: DEFAULT_ENGINE_CONFIG,
		};
		runner.start("PullUpShimeji1", env);
		for (let i = 0; i < 200 && runner.isRunning; i++) runner.tick(env, 0.05, []);

		expect(bred).toEqual([{ x: -32, y: 96, bornBehaviorName: "PullUp" }]);
		expect(runner.isRunning).toBe(false);
	});

	it("Resisting (Class=...Regist, nested inside the real Dragged sequence) holds still instead of falling", () => {
		// Every real Pose under Resisting is Velocity="0,0" — it's a struggle animation with no
		// physics tie-in, unlike Fall/Thrown/ChaseMouse. Before recognizing "Regist" this fell
		// through to applyNativeEmbedded's default case, which applies gravity — wrong for an
		// action meant to hold in place.
		const pack: MascotPack = { id: "real", name: "Real Shimeji", actions, behaviors, resolveImage: (p) => `resolved:${p}` };
		const runner = new ActionRunner(pack);
		const mascot = {
			physics: { x: 400, y: 600, vx: 0, vy: 0, facing: 1 as const, grounded: true },
			stateElapsedMs: 0,
			setVisualImage: () => {},
			getViewportSize: () => ({ width: 800, height: 900 }),
			getTotalMascotCount: () => 1,
		};
		const env: PushEnv = {
			mascot: mascot as unknown as Mascot,
			ctx: createRuntimeContext(
				mascot.physics,
				{ viewportWidth: 800, viewportHeight: 900, pointer: { x: 0, y: 0, dx: 0, dy: 0 }, totalMascotCount: 1 },
				0,
				new Random(1),
			),
			ambient: { x: 0, y: 0 },
			config: DEFAULT_ENGINE_CONFIG,
		};
		runner.start("Resisting", env);
		for (let i = 0; i < 10; i++) runner.tick(env, 0.05, []);

		expect(mascot.physics.y).toBe(600);
	});

	it("Divide1's sibling (Divided) is a required-but-orphaned behavior, like Fall/Dragged/Thrown/ChaseMouse", () => {
		// PullUp/Divided are Frequency=0 and never appear as any other behavior's
		// NextBehavior target — only reachable via a Breed action's own BornBehavior, the same
		// "engine triggers it directly" pattern as the four behaviors shimeji-ee always requires.
		expect(behaviors.get("Divided")?.frequency).toBe(0);
		expect(behaviors.get("PullUp")?.frequency).toBe(0);
		for (const behavior of behaviors.values()) {
			expect(behavior.nextBehaviors.some((n) => n.name === "Divided")).toBe(false);
			expect(behavior.nextBehaviors.some((n) => n.name === "PullUp")).toBe(false);
		}
	});
});
