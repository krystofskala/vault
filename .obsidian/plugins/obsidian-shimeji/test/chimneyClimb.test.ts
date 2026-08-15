import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseActionsXml } from "../src/shimeji/ActionsParser";
import { parseBehaviorsXml } from "../src/shimeji/BehaviorsParser";
import { BehaviorAI } from "../src/shimeji/BehaviorAI";
import { Random } from "../src/engine/Random";
import { computeLedgesFromRects } from "../src/engine/Ledges";
import { DEFAULT_ROUTE_OPTIONS, findRoute } from "../src/engine/Routing";
import { DEFAULT_ENGINE_CONFIG, type Ledge, type Rect } from "../src/engine/types";
import type { Mascot } from "../src/engine/Mascot";
import type { MascotPack } from "../src/shimeji/types";

/**
 * Climbing a corridor by kicking between its two walls.
 *
 * The problem it solves is a measured one, not a hunch: `ClimbWall` averages 0.64px/tick, so a
 * mascot crossing a full-height window vertically takes about two minutes, and several reports of
 * "the order does nothing" turned out to be a climb quietly in progress. `Jumping` runs at 20px/tick
 * and the standard pack already contains the move — `JumpFromLeftWall` is a `Jumping` at the
 * opposite wall followed by `GrabWall`. Only the direction is new.
 */
const actions = parseActionsXml(readFileSync(resolve(process.cwd(), "Shimeji/conf/actions.xml"), "utf-8"));
const behaviors = parseBehaviorsXml(readFileSync(resolve(process.cwd(), "Shimeji/conf/behaviors.xml"), "utf-8"));
const pack: MascotPack = { id: "s", name: "S", actions, behaviors, resolveImage: (p) => p };

/** The user's live layout: 1748x1392, card theme, 6px between panes. */
const VIEWPORT = { width: 1748, height: 1392, top: 40 };
const PANES: Rect[] = [
	{ left: 50, top: 80, right: 496, bottom: 1380 },
	{ left: 502, top: 80, right: 1120, bottom: 1380 },
	{ left: 1126, top: 80, right: 1745, bottom: 1380 },
];
const ledges = computeLedgesFromRects(VIEWPORT, PANES.map((rect) => ({ rect, source: "pane" as const, paneRef: rect })));
const ORDER_OPTS = { arriveWithin: 40, travelTimeWeight: 0.05 };

describe("kicking up a corridor", () => {
	it("finds the corridors a card theme leaves between panes", () => {
		// 6px between neighbouring panes, and 3px between the last pane and the window's own edge.
		// Narrow, but genuinely open space — which is the whole difference from a tiled theme, where
		// neighbours share their boundary exactly and there is nothing to kick across.
		const route = findRoute(ledges, { x: 800, y: 1392 }, { x: 800, y: 200 }, undefined, ORDER_OPTS);
		expect(route.some((s) => s.via === "chimney"), `no chimney in ${route.map((s) => s.via).join(" → ")}`).toBe(true);
	});

	it("is dramatically quicker than climbing, which is the entire point", () => {
		const from = { x: 800, y: 1392 };
		const to = { x: 800, y: 200 };
		const withKicks = findRoute(ledges, from, to, undefined, ORDER_OPTS);
		// The same route with kicking priced out of reach, which is what the router used to have.
		const climbingOnly = findRoute(ledges, from, to, undefined, { ...ORDER_OPTS, minChimneyGap: 10_000 });

		const ticks = (steps: typeof withKicks, opts: object) => {
			let at = from;
			let total = 0;
			for (const step of steps) {
				const d = Math.hypot(step.x - at.x, step.y - at.y);
				const o = { ...DEFAULT_ROUTE_OPTIONS, ...opts };
				total += step.via === "chimney" ? Math.max(1, Math.ceil(d / o.chimneyHopUp)) * (d / Math.max(1, Math.ceil(d / o.chimneyHopUp)) / o.speeds.jump + o.jumpOverhead) : step.via === "climb" ? d / o.speeds.climb : d / o.speeds.walk;
				at = step;
			}
			return total;
		};
		const fast = ticks(withKicks, ORDER_OPTS);
		const slow = ticks(climbingOnly, { ...ORDER_OPTS, minChimneyGap: 10_000 });
		expect(slow / fast, `kicking is only ${(slow / fast).toFixed(1)}x quicker`).toBeGreaterThan(4);
	});

	it("refuses walls that are the same edge twice", () => {
		// A tiled theme's panes share their boundary exactly. Two coincident walls are not a corridor,
		// and "jumping" between them would be a mascot flickering upward on the spot.
		const tiled = computeLedgesFromRects(VIEWPORT, [
			{ left: 50, top: 80, right: 500, bottom: 1380 },
			{ left: 500, top: 80, right: 1000, bottom: 1380 },
		].map((rect) => ({ rect, source: "pane" as const, paneRef: rect })));
		const route = findRoute(tiled, { x: 500, y: 1380 }, { x: 500, y: 200 }, undefined, ORDER_OPTS);
		expect(route.some((s) => s.via === "chimney")).toBe(false);
	});

	it("never kicks through a pane, only across the gap beside one", () => {
		// A pane's own two edges face *away* from each other — the space between them is the pane.
		// Getting this backwards would have mascots sailing through open notes.
		for (const step of findRoute(ledges, { x: 800, y: 1392 }, { x: 1200, y: 200 }, undefined, ORDER_OPTS)) {
			if (step.via !== "chimney") continue;
			const inside = PANES.some((p) => step.x > p.left + 1 && step.x < p.right - 1);
			expect(inside, `a kick landed inside a pane at x=${Math.round(step.x)}`).toBe(false);
		}
	});
});

describe("kicking up a corridor, driven through the real pack", () => {
	function climb(from: { x: number; y: number }, to: { x: number; y: number }, maxTicks = 6000) {
		const wall = ledges.find((l): l is Extract<Ledge, { kind: "wall" }> => l.kind === "wall" && Math.abs(l.x - from.x) < 1)!;
		const physics = {
			x: from.x, y: from.y, vx: 0, vy: 0, facing: 1 as 1 | -1,
			grounded: false, currentFloor: undefined, currentWall: wall, currentCeiling: undefined,
		};
		const mascot = {
			physics, stateElapsedMs: 0, affordances: [] as string[], hotspots: [], variables: new Map(),
			setVisualImage() {}, getViewportSize: () => ({ width: VIEWPORT.width, height: VIEWPORT.height }),
			getWorldTop: () => VIEWPORT.top, getTotalMascotCount: () => 1, getSameCharacterCount: () => 1,
		} as unknown as Mascot;

		const ai = new BehaviorAI(pack, new Random(3));
		ai.orderToSpot(to);
		let ticks = 0;
		let highest = from.y;
		for (; ticks < maxTicks && ai.hasSpotOrder; ticks++) {
			ai.tick(mascot, 0.04, ledges, { x: 0, y: 0, dx: 0, dy: 0 }, DEFAULT_ENGINE_CONFIG, undefined);
			mascot.stateElapsedMs += 40;
			highest = Math.min(highest, physics.y);
		}
		return { ticks, outstanding: ai.hasSpotOrder, at: { x: physics.x, y: physics.y }, highest };
	}

	it("actually gains height, one kick at a time", () => {
		// The router emits the whole ascent as one step; the executor turns it back into hops, and the
		// alternation between walls comes from re-planning rather than from any script. This is what
		// proves the two halves agree — a mismatch leaves the mascot kicking the same wall forever.
		const r = climb({ x: 496, y: 1300 }, { x: 499, y: 300 });
		expect(r.highest, `only reached y=${Math.round(r.highest)} from 1300`).toBeLessThan(700);
	});

	it("gets there, and in seconds rather than minutes", () => {
		const r = climb({ x: 496, y: 1300 }, { x: 499, y: 300 });
		expect(r.outstanding, `never arrived; stalled at (${Math.round(r.at.x)},${Math.round(r.at.y)})`).toBe(false);
		// A thousand pixels of climbing at ClimbWall's real 0.64px/tick is over 1500 ticks — a minute
		// of wall time. Anything near that means the kicks are not being used.
		expect(r.ticks, `took ${r.ticks} ticks (${(r.ticks / 25).toFixed(1)}s)`).toBeLessThan(600);
	});
});
