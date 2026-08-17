import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { Random } from "../src/engine/Random";
import { DEFAULT_ENGINE_CONFIG } from "../src/engine/types";
import type { Mascot } from "../src/engine/Mascot";
import { ActionRunner, type PushEnv } from "../src/shimeji/ActionRunner";
import { parseActionsXml } from "../src/shimeji/ActionsParser";
import { buildActionDef } from "../src/shimeji/CustomContentBuilder";
import { newActionSpec, newPoseSpec, type CustomPoseSpec } from "../src/shimeji/customContent";
import { SHIMEJI_TICK_MS, SHIMEJI_TICKS_PER_SEC } from "../src/shimeji/constants";
import { evaluateCondition, parseCondition } from "../src/shimeji/Expression";
import { createRuntimeContext } from "../src/shimeji/RuntimeContext";
import type { ActionDef, MascotPack, PoseDef } from "../src/shimeji/types";
import { buildReplacementActionSpec, deriveAnimatedActions, findReferenceVelocity, poseDefToCustomPoseSpec, randomVariantConditions } from "../src/wizard/animationOptions";

const actionsXml = readFileSync(resolve(process.cwd(), "Shimeji/conf/actions.xml"), "utf-8");

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

describe("poseDefToCustomPoseSpec", () => {
	it("round-trips anchor/velocity/duration back through buildActionDef exactly like the original pose", () => {
		const pose: PoseDef = { image: "/shime1.png", anchor: { x: 64, y: 128 }, velocity: { x: -2 * SHIMEJI_TICKS_PER_SEC, y: 0 }, durationMs: 6 * SHIMEJI_TICK_MS };
		const customPose = poseDefToCustomPoseSpec(pose);

		const spec = newActionSpec();
		spec.name = "RoundTrip";
		spec.animations[0].poses = [customPose];
		const rebuilt = buildActionDef(spec).animations[0].poses[0];

		expect(rebuilt.image).toBe(pose.image);
		expect(rebuilt.anchor).toEqual(pose.anchor);
		expect(rebuilt.velocity).toEqual(pose.velocity);
		expect(rebuilt.durationMs).toBe(pose.durationMs);
	});

	it("a held pose (no velocity) round-trips to velocityX/Y of 0, not NaN or undefined", () => {
		const pose: PoseDef = { image: "/shime1.png", anchor: { x: 0, y: 0 }, durationMs: 100 };
		const customPose = poseDefToCustomPoseSpec(pose);
		expect(customPose.velocityX).toBe(0);
		expect(customPose.velocityY).toBe(0);
	});

	it("assigns a fresh id each call", () => {
		const pose: PoseDef = { image: "/a.png", anchor: { x: 0, y: 0 }, durationMs: 100 };
		expect(poseDefToCustomPoseSpec(pose).id).not.toBe(poseDefToCustomPoseSpec(pose).id);
	});

	it("matches the real Walk action's first pose, straight from the bundled schema", () => {
		const actions = parseActionsXml(actionsXml);
		const walkPose = actions.get("Walk")!.animations[0].poses[0];
		const customPose = poseDefToCustomPoseSpec(walkPose);
		expect(customPose.image).toBe("/shime1.png");
		expect(customPose.anchorX).toBe(64);
		expect(customPose.anchorY).toBe(128);
		expect(customPose.velocityX).toBe(-2);
		expect(customPose.velocityY).toBe(0);
		expect(customPose.durationTicks).toBe(6);
	});
});

describe("buildReplacementActionSpec", () => {
	const pose = (image: string): CustomPoseSpec => ({ ...newPoseSpec(), image });

	it("carries forward type/borderType/loop/params from the existing def", () => {
		const existing: ActionDef = { name: "Walk", type: "Move", borderType: "Floor", loop: true, animations: [], children: [], params: { TargetX: "100" } };
		const spec = buildReplacementActionSpec(existing, [[pose("/a.png")], [pose("/b.png")]]);
		expect(spec.name).toBe("Walk");
		expect(spec.type).toBe("Move");
		expect(spec.borderType).toBe("Floor");
		expect(spec.loop).toBe(true);
		expect(spec.params).toEqual({ TargetX: "100" });
	});

	it("an action with no BorderType carries forward an empty string, not undefined", () => {
		const existing: ActionDef = { name: "Sit", type: "Stay", loop: false, animations: [], children: [], params: {} };
		const spec = buildReplacementActionSpec(existing, [[pose("/a.png")]]);
		expect(spec.borderType).toBe("");
	});

	it("round-trips an Embedded action's Class through embeddedName -> embeddedClass -> Class", () => {
		const existing: ActionDef = { name: "MyFall", type: "Embedded", loop: false, animations: [], children: [], embeddedName: "Fall", params: { Class: "com.group_finity.mascot.action.Fall", Gravity: "1" } };
		const spec = buildReplacementActionSpec(existing, [[pose("/fall1.png")]]);
		expect(spec.embeddedClass).toBe("Fall");

		const rebuilt = buildActionDef(spec);
		expect(rebuilt.embeddedName).toBe("Fall");
		expect(rebuilt.params.Class).toBe("com.group_finity.mascot.action.Fall");
		expect(rebuilt.params.Gravity).toBe("1");
	});

	it("produces one animation variant per option, in order, each carrying that option's poses", () => {
		const existing: ActionDef = { name: "X", type: "Animate", loop: false, animations: [], children: [], params: {} };
		const optionA = [pose("/a1.png"), pose("/a2.png")];
		const optionB = [pose("/b1.png")];
		const spec = buildReplacementActionSpec(existing, [optionA, optionB]);
		expect(spec.animations).toHaveLength(2);
		expect(spec.animations[0].poses).toEqual(optionA);
		expect(spec.animations[1].poses).toEqual(optionB);
	});

	it("generates the same cascaded conditions randomVariantConditions would, as plain strings ('' for none)", () => {
		const existing: ActionDef = { name: "X", type: "Animate", loop: false, animations: [], children: [], params: {} };
		const spec = buildReplacementActionSpec(existing, [[pose("/a.png")], [pose("/b.png")], [pose("/c.png")]]);
		const expected = randomVariantConditions(3).map((c) => c ?? "");
		expect(spec.animations.map((a) => a.condition)).toEqual(expected);
	});

	it("zero options produces zero animation variants", () => {
		const existing: ActionDef = { name: "X", type: "Animate", loop: false, animations: [], children: [], params: {} };
		expect(buildReplacementActionSpec(existing, []).animations).toEqual([]);
	});

	it("a replacement action actually runs through ActionRunner and both options get picked across enough seeds", () => {
		const existing: ActionDef = { name: "MyWalk", type: "Stay", loop: false, animations: [], children: [], params: {} };
		const optionA: CustomPoseSpec[] = [{ ...newPoseSpec(), image: "/optionA.png", durationTicks: 2 }];
		const optionB: CustomPoseSpec[] = [{ ...newPoseSpec(), image: "/optionB.png", durationTicks: 2 }];
		const spec = buildReplacementActionSpec(existing, [optionA, optionB]);
		const def = buildActionDef(spec);
		const testPack: MascotPack = { id: "test", name: "Test", actions: new Map([[def.name, def]]), behaviors: new Map(), resolveImage: (p) => `resolved:${p}` };

		const seen = new Set<string>();
		for (let seed = 0; seed < 40; seed++) {
			const runner = new ActionRunner(testPack);
			const mascot = {
				physics: { x: 0, y: 0, vx: 0, vy: 0, facing: 1 as 1 | -1, grounded: true },
				stateElapsedMs: 0,
				shownImages: [] as string[],
				setVisualImage(src: string) {
					this.shownImages.push(src);
				},
				requestSibling() {},
				getViewportSize: () => ({ width: 800, height: 900 }),
				getTotalMascotCount: () => 1,
				getWorldTop: () => 0,
				getSameCharacterCount: () => 1,
				affordances: [] as string[],
			};
			const ctx = createRuntimeContext(mascot.physics, { viewportWidth: 800, viewportHeight: 900, pointer: { x: 0, y: 0, dx: 0, dy: 0 }, totalMascotCount: 1 }, 0, new Random(seed));
			const env: PushEnv = { mascot: mascot as unknown as Mascot, ctx, ambient: { x: 0, y: 0 }, config: DEFAULT_ENGINE_CONFIG };

			runner.start("MyWalk", env);
			runner.tick(env, 0.05, []);
			if (mascot.shownImages[0]) seen.add(mascot.shownImages[0]);
		}

		expect(seen).toEqual(new Set(["resolved:/optionA.png", "resolved:/optionB.png"]));
	});
});

describe("findReferenceVelocity", () => {
	const held = (image: string): CustomPoseSpec => ({ ...newPoseSpec(), image, velocityX: 0, velocityY: 0 });
	const moving = (image: string, x: number, y: number): CustomPoseSpec => ({ ...newPoseSpec(), image, velocityX: x, velocityY: y });

	it("returns undefined when nothing — current poses or the standard def — ever moves", () => {
		const standing: ActionDef = { name: "Sit", type: "Stay", loop: false, animations: [{ poses: [{ image: "/sit.png", anchor: { x: 0, y: 0 }, durationMs: 100 }], hotspots: [] }], children: [], params: {} };
		expect(findReferenceVelocity(standing, [held("/a.png")])).toBeUndefined();
		expect(findReferenceVelocity(undefined, [])).toBeUndefined();
	});

	it("prefers a nonzero velocity already on the current (custom) poses over the standard def", () => {
		const standard: ActionDef = {
			name: "Walk",
			type: "Move",
			loop: true,
			animations: [{ poses: [{ image: "/shime1.png", anchor: { x: 64, y: 128 }, velocity: { x: -2 * SHIMEJI_TICKS_PER_SEC, y: 0 }, durationMs: 100 }], hotspots: [] }],
			children: [],
			params: {},
		};
		const result = findReferenceVelocity(standard, [moving("/custom.png", 5, -1)]);
		expect(result).toEqual({ x: 5, y: -1 });
	});

	it("falls back to the standard def's velocity when the current poses are all held", () => {
		const standard: ActionDef = {
			name: "Walk",
			type: "Move",
			loop: true,
			animations: [{ poses: [{ image: "/shime1.png", anchor: { x: 64, y: 128 }, velocity: { x: -2 * SHIMEJI_TICKS_PER_SEC, y: 0 }, durationMs: 100 }], hotspots: [] }],
			children: [],
			params: {},
		};
		const result = findReferenceVelocity(standard, [held("/a.png"), held("/b.png")]);
		expect(result).toEqual({ x: -2, y: 0 });
	});

	it("checks every pose group passed, not just the first", () => {
		const result = findReferenceVelocity(undefined, [held("/a.png")], [held("/b.png"), moving("/c.png", 3, 0)]);
		expect(result).toEqual({ x: 3, y: 0 });
	});

	it("scans every variant of the standard def, not just the first", () => {
		const standard: ActionDef = {
			name: "Multi",
			type: "Move",
			loop: false,
			animations: [
				{ poses: [{ image: "/1.png", anchor: { x: 0, y: 0 }, durationMs: 50 }], hotspots: [] },
				{ poses: [{ image: "/2.png", anchor: { x: 0, y: 0 }, velocity: { x: 4 * SHIMEJI_TICKS_PER_SEC, y: 2 * SHIMEJI_TICKS_PER_SEC }, durationMs: 50 }], hotspots: [] },
			],
			children: [],
			params: {},
		};
		expect(findReferenceVelocity(standard, [])).toEqual({ x: 4, y: 2 });
	});

	it("matches the real Walk action's own velocity, straight from the bundled schema", () => {
		const actions = parseActionsXml(actionsXml);
		expect(findReferenceVelocity(actions.get("Walk"), [])).toEqual({ x: -2, y: 0 });
	});
});

describe("deriveAnimatedActions, on synthetic input", () => {
	const action = (over: Partial<ActionDef> = {}): ActionDef => ({ name: "X", type: "Stay", loop: false, animations: [], children: [], params: {}, ...over });
	const withPose = (): ActionDef["animations"] => [{ condition: undefined, poses: [{ image: "/a.png", anchor: { x: 0, y: 0 }, durationMs: 100 }], hotspots: [] }];

	it("excludes Sequence/Select actions — they have no animation of their own to replace", () => {
		const actions = new Map<string, ActionDef>([
			["Choreo", action({ type: "Sequence", children: [{ name: "Leaf", condition: undefined, paramOverrides: {} }] })],
			["Leaf", action({ animations: withPose() })],
		]);
		const { required } = deriveAnimatedActions(actions);
		expect(required).toEqual(["Leaf"]);
	});

	it("splits IE-only actions into optional, everything else into required", () => {
		const actions = new Map<string, ActionDef>([
			["Walk", action({ name: "Walk", type: "Move", animations: withPose() })],
			["FallWithIe", action({ name: "FallWithIe", type: "Embedded", animations: withPose() })],
		]);
		const { required, optional } = deriveAnimatedActions(actions);
		expect(required).toEqual(["Walk"]);
		expect(optional).toEqual(["FallWithIe"]);
	});

	it("sorts each list alphabetically", () => {
		const actions = new Map<string, ActionDef>([
			["Zebra", action({ name: "Zebra", animations: withPose() })],
			["Alpha", action({ name: "Alpha", animations: withPose() })],
		]);
		const { required } = deriveAnimatedActions(actions);
		expect(required).toEqual(["Alpha", "Zebra"]);
	});
});

describe("deriveAnimatedActions, against the real standard Shimeji-ee actions.xml", () => {
	const actions = parseActionsXml(actionsXml);
	const { required, optional } = deriveAnimatedActions(actions);

	it("includes real leaf actions (own art) in required", () => {
		for (const name of ["Walk", "Sit", "ClimbWall"]) expect(required, name).toContain(name);
	});

	it("excludes pure Sequence/Select dispatchers that own no art of their own", () => {
		// Confirmed directly against the schema: Fall/Dragged/Thrown/ChaseMouse are Type="Sequence"
		// with zero <Pose> of their own — there is no animation there to give alternatives to.
		for (const name of ["Fall", "Dragged", "Thrown", "ChaseMouse"]) {
			expect(required).not.toContain(name);
			expect(optional).not.toContain(name);
		}
	});

	it("puts the four window-throw-only actions in optional", () => {
		for (const name of ["FallWithIe", "WalkWithIe", "RunWithIe", "ThrowIe"]) expect(optional).toContain(name);
	});

	it("has no name in both lists", () => {
		const requiredSet = new Set(required);
		for (const name of optional) expect(requiredSet.has(name)).toBe(false);
	});
});
