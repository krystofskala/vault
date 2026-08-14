import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseActionsXml } from "../src/shimeji/ActionsParser";
import { parseBehaviorsXml } from "../src/shimeji/BehaviorsParser";
import { BehaviorAI } from "../src/shimeji/BehaviorAI";
import { Random } from "../src/engine/Random";
import { computeLedgesFromRects } from "../src/engine/Ledges";
import { DEFAULT_ENGINE_CONFIG, type Ledge } from "../src/engine/types";
import type { Mascot } from "../src/engine/Mascot";
import type { MascotPack } from "../src/shimeji/types";

/**
 * Driven by the real standard pack, because the whole question here is what the *pack* does after
 * ChaseMouse finishes — a synthetic fixture would prove nothing about it.
 *
 * Real "Follow Cursor" is a one-shot: `Manager.setBehaviorAll(config, "ChaseMouse", imageSet)` is a
 * single `mascot.setBehavior(...)` per mascot, and from there the pack's own NextBehavior chain
 * takes over. In the standard pack that chain is a cul-de-sac by design: ChaseMouse -> (Add="false")
 * SitAndFaceMouse, and SitAndFaceMouse -> (Add="false") itself at Frequency="100". So the mascot
 * dashes to the pointer's x once and then sits watching it, essentially forever. Users read that as
 * "it stopped chasing" — hence the invented sticky mode alongside it.
 */
const actions = parseActionsXml(readFileSync(resolve(process.cwd(), "Shimeji/conf/actions.xml"), "utf-8"));
const behaviors = parseBehaviorsXml(readFileSync(resolve(process.cwd(), "Shimeji/conf/behaviors.xml"), "utf-8"));
const pack: MascotPack = { id: "s", name: "S", actions, behaviors, resolveImage: (p) => p };

function scene(startX: number, cursorX: number) {
	const ledges = computeLedgesFromRects({ width: 1200, height: 800, top: 40 }, []);
	const floor = ledges.find((l): l is Extract<Ledge, { kind: "floor" }> => l.kind === "floor")!;
	const physics = {
		x: startX, y: floor.y, vx: 0, vy: 0, facing: -1 as 1 | -1, grounded: true,
		currentFloor: floor, currentWall: undefined, currentCeiling: undefined,
	};
	const cursor = { x: cursorX, y: 300, dx: 0, dy: 0 };
	const mascot = {
		physics, stateElapsedMs: 0, affordances: [] as string[], hotspots: [], variables: new Map(),
		setVisualImage() {}, getViewportSize: () => ({ width: 1200, height: 800 }),
		getWorldTop: () => 40, getTotalMascotCount: () => 1, getSameCharacterCount: () => 1,
	} as unknown as Mascot;
	const ai = new BehaviorAI(pack, new Random(7));
	const run = (ticks: number) => {
		for (let i = 0; i < ticks; i++) {
			ai.tick(mascot, 0.04, ledges, cursor, DEFAULT_ENGINE_CONFIG);
			mascot.stateElapsedMs += 40;
		}
	};
	return { ai, mascot, physics, cursor, run };
}

describe("ChaseMouse (faithful one-shot)", () => {
	it("actually crosses the screen toward the pointer", () => {
		const s = scene(200, 1000);
		s.ai.forceBehavior("ChaseMouse", s.mascot, s.cursor, DEFAULT_ENGINE_CONFIG);
		s.run(120);
		// Real ChaseMouse ends on `Dash TargetX="cursor.x + Gap"` where Gap is up to
		// Math.random()*200 short of the cursor, so it arrives close but deliberately not exactly.
		expect(s.physics.x).toBeGreaterThan(700);
		expect(Math.abs(s.physics.x - 1000)).toBeLessThan(240);
	});

	it("hands off to SitAndFaceMouse and then never chases again on its own", () => {
		const s = scene(200, 260);
		s.ai.forceBehavior("ChaseMouse", s.mascot, s.cursor, DEFAULT_ENGINE_CONFIG);
		s.run(40);
		expect(s.ai.currentBehaviorName).toBe("SitAndFaceMouse");
		// Move the pointer far away: without sticky mode the mascot must stay put, because
		// SitAndFaceMouse's own NextBehavior list is Add="false" and references itself at 100.
		s.cursor.x = 1150;
		const restingX = s.physics.x;
		s.run(200);
		expect(s.physics.x).toBe(restingX);
		expect(s.ai.currentBehaviorName).toBe("SitAndFaceMouse");
	});
});

describe("sticky follow (invented)", () => {
	it("re-chases when the pointer moves out of reach", () => {
		const s = scene(200, 260);
		s.ai.setFollowingMouse(true);
		s.ai.forceBehavior("ChaseMouse", s.mascot, s.cursor, DEFAULT_ENGINE_CONFIG);
		s.run(40);
		s.cursor.x = 1150;
		// Each ChaseMouse run covers a randomised fraction of the remaining distance and takes ~100
		// ticks, so arriving from ~900px away legitimately needs several runs — the point is that it
		// keeps starting new ones, which the faithful one-shot above proves it otherwise would not.
		s.run(500);
		expect(s.physics.x).toBeGreaterThan(1150 - 240);
	});

	it("follows the pointer back the other way too", () => {
		const s = scene(200, 1100);
		s.ai.setFollowingMouse(true);
		s.ai.forceBehavior("ChaseMouse", s.mascot, s.cursor, DEFAULT_ENGINE_CONFIG);
		s.run(200);
		expect(s.physics.x).toBeGreaterThan(800);
		s.cursor.x = 100;
		s.run(300);
		expect(s.physics.x).toBeLessThan(350);
	});

	// FOLLOW_REACQUIRE_PX exceeds the pack's own stopping distance on purpose: ChaseMouse can
	// legitimately end up to 200px short, and re-chasing from there would leave the mascot
	// permanently mid-dash instead of ever settling.
	it("settles into the pack's own sit-and-watch chain once the pointer is close", () => {
		const s = scene(200, 260);
		s.ai.setFollowingMouse(true);
		s.ai.forceBehavior("ChaseMouse", s.mascot, s.cursor, DEFAULT_ENGINE_CONFIG);
		s.run(300);
		expect(s.ai.currentBehaviorName).toBe("SitAndFaceMouse");
	});

	it("stops when switched off, leaving the mascot where it stands", () => {
		const s = scene(200, 260);
		s.ai.setFollowingMouse(true);
		s.ai.forceBehavior("ChaseMouse", s.mascot, s.cursor, DEFAULT_ENGINE_CONFIG);
		s.run(60);
		s.ai.setFollowingMouse(false);
		expect(s.ai.isFollowingMouse).toBe(false);
		s.cursor.x = 1150;
		s.run(60);
		const settledX = s.physics.x;
		s.run(200);
		expect(Math.abs(s.physics.x - settledX)).toBeLessThan(240);
	});
});
