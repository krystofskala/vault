import { describe, expect, it } from "vitest";
import { Stage, type StageOptions } from "../src/engine/Stage";
import { DEFAULT_ENGINE_CONFIG } from "../src/engine/types";
import type { Environment } from "../src/engine/Environment";

function fakeEnvironment(): Environment {
	return {
		getViewportSize: () => ({ width: 800, height: 600 }),
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

	it("a spawn without a parent still defaults to facing right, unaffected", () => {
		const stage = makeStage();
		const mascot = stage.spawnMascot(100, 100)!;
		expect(mascot.physics.facing).toBe(1);
		stage.destroy();
	});
});
