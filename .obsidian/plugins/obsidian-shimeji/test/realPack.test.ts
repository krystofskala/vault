import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseActionsXml } from "../src/shimeji/ActionsParser";
import { parseBehaviorsXml } from "../src/shimeji/BehaviorsParser";

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
});
