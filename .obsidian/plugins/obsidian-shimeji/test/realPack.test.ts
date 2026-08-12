import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseActionsXml } from "../src/shimeji/ActionsParser";
import { parseBehaviorsXml } from "../src/shimeji/BehaviorsParser";
import { BehaviorAI } from "../src/shimeji/BehaviorAI";
import { Random } from "../src/engine/Random";
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
			// y=40, matching Stage's actual spawn point — not y=0, which coincides with the
			// ceiling ledge's own y-coordinate and would make ceiling.isOn(anchor) look true.
			physics: { x: 400, y: 40, vx: 0, vy: 0, facing: 1 as const, grounded: false },
			stateElapsedMs: 0,
			setVisualImage: () => {},
		};
		const ledges = [{ kind: "floor" as const, y: 600, x1: 0, x2: 800, source: "window" as const }];

		for (let i = 0; i < 30; i++) {
			ai.tick(mascot as unknown as Mascot, 0.05, ledges, { x: 400, y: 300, dx: 0, dy: 0 }, DEFAULT_ENGINE_CONFIG);
		}
		// Falling for 1.5s of sim time should have made real downward progress, not left the
		// mascot stuck sliding around at its spawn height.
		expect(mascot.physics.y).toBeGreaterThan(50);
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
		};
		const ledges = [{ kind: "floor" as const, y: 600, x1: 0, x2: 800, source: "window" as const }];

		let sawChaseMouse = false;
		for (let i = 0; i < 2000 && !sawChaseMouse; i++) {
			ai.tick(mascot as unknown as Mascot, 0.1, ledges, { x: 700, y: 300, dx: 0, dy: 0 }, DEFAULT_ENGINE_CONFIG);
			if (ai.currentBehaviorName === "ChaseMouse") sawChaseMouse = true;
		}
		expect(sawChaseMouse).toBe(true);
	});
});
