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
	// The whole point of the redesign: not a timed action, and not a re-run of ChaseMouse (which
	// structurally cannot close the last 200px — its final Dash target collapses onto the mascot's
	// own position once the pointer is that near). It runs until it arrives, however long that takes.
	it("keeps pursuing until it actually reaches the pointer, not to within ChaseMouse's 200px undershoot", () => {
		const s = scene(200, 1000);
		s.ai.setFollowingMouse(true);
		s.ai.forceBehavior("ChaseMouse", s.mascot, s.cursor, DEFAULT_ENGINE_CONFIG);
		s.run(400);
		expect(Math.abs(s.physics.x - 1000)).toBeLessThanOrEqual(32);
	});

	// Arrival ends the *pursuit*, not the *mode*. Disarming on arrival (which an earlier version of
	// this did) turns "keep following" into a single trip: it catches up once and then ignores the
	// pointer forever after.
	it("settles into the pack's own chain on arrival but stays armed", () => {
		const s = scene(200, 400);
		s.ai.setFollowingMouse(true);
		s.ai.forceBehavior("ChaseMouse", s.mascot, s.cursor, DEFAULT_ENGINE_CONFIG);
		s.run(400);
		expect(Math.abs(s.physics.x - 400)).toBeLessThanOrEqual(32);
		expect(s.ai.currentBehaviorName).toBe("SitAndFaceMouse");
		expect(s.ai.isFollowingMouse).toBe(true);
	});

	it("picks the pursuit back up when the pointer moves away again after arriving", () => {
		const s = scene(600, 620);
		s.ai.setFollowingMouse(true);
		s.ai.forceBehavior("ChaseMouse", s.mascot, s.cursor, DEFAULT_ENGINE_CONFIG);
		s.run(200);
		expect(s.ai.currentBehaviorName).toBe("SitAndFaceMouse");
		s.cursor.x = 150;
		s.run(400);
		expect(Math.abs(s.physics.x - 150)).toBeLessThanOrEqual(32);
	});

	it("tracks a pointer that keeps moving, in both directions", () => {
		const s = scene(600, 1100);
		s.ai.setFollowingMouse(true);
		s.ai.forceBehavior("ChaseMouse", s.mascot, s.cursor, DEFAULT_ENGINE_CONFIG);
		s.run(120);
		expect(s.physics.x).toBeGreaterThan(700);
		// Yank it the other way mid-pursuit: the mascot must turn around rather than finish its
		// original errand. FOLLOW_LEG_PX bounds how stale the aim can be when this happens.
		s.cursor.x = 120;
		s.run(500);
		expect(Math.abs(s.physics.x - 120)).toBeLessThanOrEqual(32);
	});

	// A pointer that leaves the Obsidian window stops producing pointermove events, so the ambient
	// position simply holds its last in-window value. The pursuit must terminate against that frozen
	// target rather than hanging forever waiting for an update that isn't coming.
	it("still completes against a pointer position that stops updating", () => {
		const s = scene(200, 900);
		s.ai.setFollowingMouse(true);
		s.ai.forceBehavior("ChaseMouse", s.mascot, s.cursor, DEFAULT_ENGINE_CONFIG);
		s.run(400);
		expect(Math.abs(s.physics.x - 900)).toBeLessThanOrEqual(32);
	});

	// Asserted on the mechanism rather than on position: once following stops, ordinary autonomous
	// wandering resumes and could carry the mascot anywhere, including near the pointer by chance.
	// What must be true is that no further pursuit is issued — and a pursuit leg is the only thing
	// that can make ChaseMouse current, since the pack gives it Frequency="0" in the general pool.
	it("issues no further pursuit once switched off mid-chase", () => {
		const s = scene(200, 1100);
		s.ai.setFollowingMouse(true);
		s.ai.forceBehavior("ChaseMouse", s.mascot, s.cursor, DEFAULT_ENGINE_CONFIG);
		s.run(60);
		s.ai.setFollowingMouse(false);
		expect(s.ai.isFollowingMouse).toBe(false);
		// Switching off stops *new* pursuits being issued; it deliberately does not abort the action
		// already in flight (the initial forced ChaseMouse here), so let that finish before sampling.
		s.run(200);

		const seen: string[] = [];
		for (let i = 0; i < 400; i++) {
			s.run(1);
			s.cursor.x = i % 2 === 0 ? 60 : 1140; // yank it about; nothing should react
			seen.push(s.ai.currentBehaviorName ?? "-");
		}
		expect(seen).not.toContain("ChaseMouse");
	});
});
