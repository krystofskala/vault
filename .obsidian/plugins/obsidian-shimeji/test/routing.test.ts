import { describe, expect, it } from "vitest";
import { findRoute, ledgeUnder, pointOn } from "../src/engine/Routing";
import { computeLedgesFromRects } from "../src/engine/Ledges";
import type { Ledge } from "../src/engine/types";

/**
 * The router is pure geometry over the same `Ledge` list the physics uses, so these are exact — no
 * simulation, no randomness. Each case is a layout you can picture.
 */
const VIEWPORT = { width: 1200, height: 800, top: 40 };

function bareWindow(): Ledge[] {
	return computeLedgesFromRects(VIEWPORT, []);
}

function withPane(rect: { left: number; top: number; right: number; bottom: number }): Ledge[] {
	return computeLedgesFromRects(VIEWPORT, [{ rect, source: "pane" as const, paneRef: 1 }]);
}

function floorAt(ledges: Ledge[], y: number) {
	return ledges.find((l) => l.kind === "floor" && Math.abs(l.y - y) < 1);
}

describe("pointOn", () => {
	it("clamps to the span of a horizontal ledge", () => {
		const floor = { kind: "floor", y: 500, x1: 100, x2: 300, source: "pane" } as Ledge;
		expect(pointOn(floor, { x: 999, y: 0 })).toEqual({ x: 300, y: 500 });
		expect(pointOn(floor, { x: -5, y: 0 })).toEqual({ x: 100, y: 500 });
		expect(pointOn(floor, { x: 200, y: 0 })).toEqual({ x: 200, y: 500 });
	});

	it("clamps to the height of a wall", () => {
		const wall = { kind: "wall", side: "left", x: 400, y1: 100, y2: 300, source: "pane" } as Ledge;
		expect(pointOn(wall, { x: 0, y: 999 })).toEqual({ x: 400, y: 300 });
		expect(pointOn(wall, { x: 0, y: 200 })).toEqual({ x: 400, y: 200 });
	});
});

describe("findRoute", () => {
	it("returns nothing to do when already at the target", () => {
		const ledges = bareWindow();
		expect(findRoute(ledges, { x: 600, y: 800 }, { x: 600, y: 800 })).toEqual([]);
	});

	it("walks along one floor when the target is on it", () => {
		const ledges = bareWindow();
		const route = findRoute(ledges, { x: 200, y: 800 }, { x: 900, y: 800 });
		expect(route).toHaveLength(1);
		expect(route[0].via).toBe("walk");
		expect(route[0].x).toBe(900);
	});

	// The point of the whole exercise: a target above the mascot is reached by going *up*, not by
	// standing underneath it. Bare window, so the only way up is a side wall.
	it("climbs a wall to reach a target far above the floor", () => {
		const ledges = bareWindow();
		const route = findRoute(ledges, { x: 100, y: 800 }, { x: 0, y: 200 });

		expect(route.length).toBeGreaterThan(0);
		expect(route.some((s) => s.via === "climb")).toBe(true);
		const last = route[route.length - 1];
		expect(last.y).toBeCloseTo(200, 0);
		expect(last.ledge.kind).toBe("wall");
	});

	it("walks to the foot of the wall before climbing it", () => {
		const ledges = bareWindow();
		const route = findRoute(ledges, { x: 600, y: 800 }, { x: 0, y: 200 });
		const walk = route.findIndex((s) => s.via === "walk");
		const climb = route.findIndex((s) => s.via === "climb");
		expect(walk).toBeGreaterThanOrEqual(0);
		expect(climb).toBeGreaterThan(walk);
		// The walk ends at the wall's x, which is where the two surfaces actually meet.
		expect(route[walk].x).toBeCloseTo(0, 0);
	});

	// A pane's top edge is a floor a mascot can be on, and it is above the window floor — exactly the
	// "jump between panes" case.
	it("jumps up onto a pane's top edge when it is within reach", () => {
		const ledges = withPane({ left: 300, top: 700, right: 900, bottom: 780 });
		const route = findRoute(ledges, { x: 500, y: 800 }, { x: 600, y: 700 });

		expect(route.some((s) => s.via === "jump")).toBe(true);
		const last = route[route.length - 1];
		expect(last.y).toBeCloseTo(700, 0);
	});

	it("will not jump higher than the jump budget allows", () => {
		// Same pane, but now 400px up — far past maxJumpUp, so no jump edge should exist.
		const ledges = withPane({ left: 300, top: 400, right: 900, bottom: 500 });
		const route = findRoute(ledges, { x: 500, y: 800 }, { x: 600, y: 400 });
		expect(route.some((s) => s.via === "jump")).toBe(false);
	});

	it("drops off the end of a raised floor to reach something below it", () => {
		const ledges = withPane({ left: 300, top: 700, right: 900, bottom: 780 });
		const paneTop = floorAt(ledges, 700)!;
		const route = findRoute(ledges, { x: 600, y: 700 }, { x: 1100, y: 800 }, paneTop);

		expect(route.some((s) => s.via === "drop")).toBe(true);
		const last = route[route.length - 1];
		expect(last.y).toBeCloseTo(800, 0);
		expect(last.x).toBeCloseTo(1100, 0);
	});

	// Nothing to stand on at the target: it gets as close as the surfaces allow and stops. This is the
	// termination signal sticky follow depends on — without it, a pointer hovering over the middle of
	// the editor would keep a mascot re-planning forever.
	it("stops at the closest reachable point for a target floating in open space", () => {
		const ledges = bareWindow();
		const route = findRoute(ledges, { x: 600, y: 800 }, { x: 600, y: 400 });
		const last = route[route.length - 1];
		if (last) {
			// Whatever it picked, it is a real surface — never a point in mid-air.
			expect(pointOn(last.ledge, { x: last.x, y: last.y })).toEqual({ x: last.x, y: last.y });
		}
		// And once there, it reports nothing further to do rather than looping.
		const settled = last ? { x: last.x, y: last.y } : { x: 600, y: 800 };
		expect(findRoute(ledges, settled, { x: 600, y: 400 }, last?.ledge, { arriveWithin: 32 })).toEqual([]);
	});

	it("reports an empty route rather than throwing when there are no ledges at all", () => {
		expect(findRoute([], { x: 0, y: 0 }, { x: 100, y: 100 })).toEqual([]);
	});

	it("every step lands on a point that is actually on its own ledge", () => {
		const ledges = withPane({ left: 300, top: 500, right: 900, bottom: 700 });
		for (const target of [
			{ x: 1100, y: 800 },
			{ x: 600, y: 500 },
			{ x: 0, y: 200 },
			{ x: 350, y: 640 },
		]) {
			for (const step of findRoute(ledges, { x: 200, y: 800 }, target)) {
				const snapped = pointOn(step.ledge, { x: step.x, y: step.y });
				expect(snapped.x).toBeCloseTo(step.x, 6);
				expect(snapped.y).toBeCloseTo(step.y, 6);
			}
		}
	});
});

describe("ledgeUnder", () => {
	it("keeps the ledge physics already chose, even if another is nominally nearer", () => {
		const ledges = bareWindow();
		const floor = floorAt(ledges, 800)!;
		expect(ledgeUnder(ledges, { x: 600, y: 800 }, floor)).toBe(floor);
	});

	it("falls back to the nearest surface when physics has no opinion", () => {
		const ledges = bareWindow();
		expect(ledgeUnder(ledges, { x: 600, y: 799 })).toBe(floorAt(ledges, 800));
	});

	it("ignores a stale ledge that is no longer in the current list", () => {
		const ledges = bareWindow();
		const stale = { kind: "floor", y: 12345, x1: 0, x2: 10, source: "pane" } as Ledge;
		expect(ledgeUnder(ledges, { x: 600, y: 800 }, stale)).toBe(floorAt(ledges, 800));
	});
});

/**
 * Autonomous roaming — the reason the router exists outside of pointer pursuit. Driven through the
 * real pack so the route steps have to map onto actions that genuinely exist.
 */
describe("autonomous roaming", () => {
	it("is inert when switched off", async () => {
		const { BehaviorAI } = await import("../src/shimeji/BehaviorAI");
        const { parseActionsXml } = await import("../src/shimeji/ActionsParser");
        const { parseBehaviorsXml } = await import("../src/shimeji/BehaviorsParser");
		const { Random } = await import("../src/engine/Random");
		const { DEFAULT_ENGINE_CONFIG } = await import("../src/engine/types");
		const { readFileSync } = await import("node:fs");
		const { resolve } = await import("node:path");

		const pack = {
			id: "s",
			name: "S",
			actions: parseActionsXml(readFileSync(resolve(process.cwd(), "Shimeji/conf/actions.xml"), "utf-8")),
			behaviors: parseBehaviorsXml(readFileSync(resolve(process.cwd(), "Shimeji/conf/behaviors.xml"), "utf-8")),
			resolveImage: (p: string) => p,
		};
		const ledges = withPane({ left: 300, top: 600, right: 900, bottom: 780 });
		const floor = floorAt(ledges, 800)!;
		const physics = { x: 100, y: 800, vx: 0, vy: 0, facing: -1 as 1 | -1, grounded: true, currentFloor: floor };
		const mascot = {
			physics,
			stateElapsedMs: 0,
			affordances: [] as string[],
			hotspots: [],
			variables: new Map(),
			setVisualImage() {},
			getViewportSize: () => ({ width: 1200, height: 800 }),
			getWorldTop: () => 40,
			getTotalMascotCount: () => 1,
			getSameCharacterCount: () => 1,
		};
		const cursor = { x: 100, y: 800, dx: 0, dy: 0 };
		const config = { ...DEFAULT_ENGINE_CONFIG, roamEnabled: false };
		const ai = new BehaviorAI(pack as never, new Random(11));
		for (let i = 0; i < 400; i++) {
			ai.tick(mascot as never, 0.04, ledges, cursor, config);
			mascot.stateElapsedMs += 40;
		}
		// Nothing in the standard pack's own general pool can put a mascot onto a pane's top edge from
		// the window floor, so reaching one would have to have been the router's doing.
		expect(physics.y).toBeGreaterThan(700);
	});
});
