import { describe, expect, it } from "vitest";
import { Stage, type StageOptions } from "../src/engine/Stage";
import { DEFAULT_ENGINE_CONFIG } from "../src/engine/types";
import type { Environment } from "../src/engine/Environment";

function fakeEnvironment(): Environment {
	return {
		getViewportSize: () => ({ width: 800, height: 600 }),
		getWorldTop: () => 0,
		getPlatformRects: () => [],
	};
}

function makeStage(overrides: Partial<StageOptions> = {}): Stage {
	return new Stage({
		config: DEFAULT_ENGINE_CONFIG,
		paneLedgesEnabled: false,
		debugLedges: false,
		maxMascots: 10,
		allowBreeding: true,
		environment: fakeEnvironment(),
		...overrides,
	});
}

describe("Stage.spawnMascot", () => {
	// Real Breed.breed(): `mascot.setLookRight(getMascot().isLookRight())` — a Breed-spawned
	// sibling always starts facing the same way its parent currently is, not the engine's usual
	// default. Also exercised by "Duplicate this Shimeji" in the context menu, which passes a
	// parent for the same reason (a duplicate should look like its source).
	it("a spawn with a parent inherits the parent's current facing", () => {
		const stage = makeStage();
		const parent = stage.spawnMascot(100, 100)!;
		parent.physics.facing = -1;
		const sibling = stage.spawnMascot(150, 100, undefined, parent)!;
		expect(sibling.physics.facing).toBe(-1);
		stage.destroy();
	});

	it("an explicit-position spawn without a parent keeps the default facing right, unaffected (only a *fresh* spawn randomizes — see below)", () => {
		const stage = makeStage();
		const mascot = stage.spawnMascot(100, 100)!;
		expect(mascot.physics.facing).toBe(1);
		stage.destroy();
	});

	// Real Main.createMascot() always creates off-screen at a fixed anchor (-1000,-1000); the
	// very next UserBehavior.next() tick then finds it out of screen bounds and relocates it to
	// a random x above the top edge (screen.top - 256) before forcing Fall — the same recovery
	// BehaviorAI.respawnAndFall already ports for the identical reason. Every real mascot's
	// first visible moment is falling in from off the top of the screen, never already standing
	// in view.
	it("a spawn with no explicit position falls in from above the screen at a random x", () => {
		const stage = makeStage({ seed: 42 });
		const mascot = stage.spawnMascot()!;
		expect(mascot.physics.y).toBe(-256);
		expect(mascot.physics.x).toBeGreaterThanOrEqual(0);
		expect(mascot.physics.x).toBeLessThan(800);
		stage.destroy();
	});

	it("a spawn with no explicit position is born straight into Fall", () => {
		let bornBehaviorName: string | undefined;
		const stage = makeStage({ onMascotCreated: (_mascot, name) => (bornBehaviorName = name) });
		stage.spawnMascot();
		expect(bornBehaviorName).toBe("Fall");
		stage.destroy();
	});

	it("an explicit position (Breed, duplicate) is left exactly as given, not redirected to a random fall-in spot", () => {
		let bornBehaviorName: string | undefined;
		const stage = makeStage({ onMascotCreated: (_mascot, name) => (bornBehaviorName = name) });
		const mascot = stage.spawnMascot(321, 111, "SomeBornBehavior")!;
		expect(mascot.physics.x).toBe(321);
		expect(mascot.physics.y).toBe(111);
		expect(bornBehaviorName).toBe("SomeBornBehavior");
		stage.destroy();
	});

	// Real Main.createMascot(imageSet) — the *only* real path to a fresh top-level mascot, tray
	// "Another One!" and per-mascot "Another One!" alike: `mascot.setLookRight(Math.random() <
	// 0.5)`. Previously every fresh/auto spawn silently defaulted to facing right always.
	// Statistical rather than a single hand-computed seed value: what matters here is that both
	// outcomes are actually reachable, not the exact PRNG sequence for one particular seed.
	it("a spawn with no explicit position randomizes initial facing, not always right", () => {
		const stage = makeStage({ seed: 1, maxMascots: 100 });
		const facings = new Set<number>();
		for (let i = 0; i < 30; i++) facings.add(stage.spawnMascot()!.physics.facing);
		expect(facings).toEqual(new Set([1, -1]));
		stage.destroy();
	});

	// Real per-mascot "Another One!" (`Mascot.java`'s popup: `Main.createMascot(imageSet)`) —
	// forces a specific character but is otherwise an entirely ordinary fresh spawn (see the
	// facing-randomization test above; forcedPackId doesn't change any of that, it only changes
	// which pack the caller ends up attaching in onMascotCreated).
	it("forcedPackId passes straight through to onMascotCreated, alongside an otherwise-fresh spawn", () => {
		let seenPackId: string | null | undefined;
		let seenParent: unknown;
		const stage = makeStage({
			onMascotCreated: (_mascot, _name, parent, forcedPackId) => {
				seenPackId = forcedPackId;
				seenParent = parent;
			},
		});
		const mascot = stage.spawnMascot(undefined, undefined, undefined, undefined, "some-pack-id")!;
		expect(seenPackId).toBe("some-pack-id");
		expect(seenParent).toBeUndefined();
		expect(mascot.physics.y).toBe(-256); // still a genuinely fresh (off-screen fall-in) spawn
		stage.destroy();
	});
});

describe("Stage.removeAllButOne", () => {
	// Real Manager.remainOne(): disposes every mascot except the *first* (oldest) one — a
	// distinct primitive from removeAllMascots (real "Bye Everyone!", zero left), previously
	// missing entirely (the two had been conflated).
	it("keeps the oldest mascot and removes the rest", () => {
		const stage = makeStage();
		const first = stage.spawnMascot(100, 100)!;
		stage.spawnMascot(200, 100)!;
		stage.spawnMascot(300, 100)!;
		expect(stage.getMascots()).toHaveLength(3);

		stage.removeAllButOne();

		expect(stage.getMascots()).toEqual([first]);
		stage.destroy();
	});

	it("is a no-op on an empty stage", () => {
		const stage = makeStage();
		stage.removeAllButOne();
		expect(stage.getMascots()).toHaveLength(0);
		stage.destroy();
	});

	// Real remainOne(imageSet) (the per-mascot right-click menu's own "Reduce to One!", scoped
	// to that mascot's character) genuinely keeps the *opposite* end from the no-filter overload:
	// the newest matching mascot, not the oldest — confirmed by reading both literally, not
	// assumed symmetric. Non-matching mascots (other characters) are untouched either way.
	it("with a filter, keeps the newest matching mascot and leaves non-matching ones alone", () => {
		const stage = makeStage();
		const catA1 = stage.spawnMascot(10, 10)!;
		const dogA = stage.spawnMascot(20, 10)!; // a different "character" — untouched throughout
		const catA2 = stage.spawnMascot(30, 10)!;
		const catA3 = stage.spawnMascot(40, 10)!; // newest of the "cat" group — should be kept
		const cats = new Set([catA1, catA2, catA3]);

		stage.removeAllButOne((m) => cats.has(m));

		expect(stage.getMascots()).toEqual([dogA, catA3]);
		stage.destroy();
	});
});
