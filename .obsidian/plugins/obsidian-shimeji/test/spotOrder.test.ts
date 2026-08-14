import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseActionsXml } from "../src/shimeji/ActionsParser";
import { parseBehaviorsXml } from "../src/shimeji/BehaviorsParser";
import { BehaviorAI } from "../src/shimeji/BehaviorAI";
import { Random } from "../src/engine/Random";
import { computeLedgesFromRects } from "../src/engine/Ledges";
import { DEFAULT_ENGINE_CONFIG, type Ledge } from "../src/engine/types";
import type { PaneActions } from "../src/engine/PaneActions";
import type { Mascot } from "../src/engine/Mascot";
import type { MascotPack } from "../src/shimeji/types";

/**
 * The "get to that spot" order, driven through the real pack. Its distinguishing feature is that it
 * is willing to change the layout: following deliberately stops at the nearest surface, because a
 * pointer sweeping across the editor is not a request to rearrange a workspace, whereas an order is
 * given deliberately at one place.
 */
const actions = parseActionsXml(readFileSync(resolve(process.cwd(), "Shimeji/conf/actions.xml"), "utf-8"));
const behaviors = parseBehaviorsXml(readFileSync(resolve(process.cwd(), "Shimeji/conf/behaviors.xml"), "utf-8"));
const pack: MascotPack = { id: "s", name: "S", actions, behaviors, resolveImage: (p) => p };

const VIEWPORT = { width: 1200, height: 800, top: 40 };

function scene(startX: number, panes: Array<{ left: number; top: number; right: number; bottom: number }> = []) {
	let livePanes = [...panes];
	let ledges = computeLedgesFromRects(VIEWPORT, livePanes.map((rect) => ({ rect, source: "pane" as const, paneRef: rect })));
	const floor = ledges.find((l): l is Extract<Ledge, { kind: "floor" }> => l.kind === "floor" && l.y === 800)!;
	const physics = { x: startX, y: 800, vx: 0, vy: 0, facing: -1 as 1 | -1, grounded: true, currentFloor: floor, currentWall: undefined, currentCeiling: undefined };
	const mascot = {
		physics, stateElapsedMs: 0, affordances: [] as string[], hotspots: [], variables: new Map(),
		setVisualImage() {}, getViewportSize: () => ({ width: 1200, height: 800 }),
		getWorldTop: () => 40, getTotalMascotCount: () => 1, getSameCharacterCount: () => 1,
	} as unknown as Mascot;

	const surgeries: Array<{ x: number; y: number }> = [];
	/**
	 * Stands in for Obsidian. Splitting a pane adds a whole *rect* to the layout, not a lone floating
	 * line — the new pane brings its own sides and underside with it, and those are what a mascot
	 * actually climbs to get up there. An earlier version of this fake appended a bare floor ledge at
	 * the requested y, which no route could ever reach, so the test proved only that the order gave
	 * up. Feeding a rect back through the real `computeLedgesFromRects` keeps the fake honest.
	 */
	const paneActions: PaneActions = {
		makeSurfaceAt: (point) => {
			surgeries.push({ x: point.x, y: point.y });
			// Model a real split: the pane containing the point is *replaced* by two panes meeting at
			// that y, which is what keeps the new surfaces connected to the rest of the layout. A fake
			// that merely drops an extra rect in leaves it floating with nothing joining it to the
			// ground, and no route can ever reach it — which an earlier version of this did, and it
			// made a working feature look broken.
			const containing = livePanes.find((r) => point.x >= r.left && point.x <= r.right && point.y >= r.top && point.y <= r.bottom);
			if (!containing) return undefined;
			const upper = { ...containing, bottom: point.y };
			const lower = { ...containing, top: point.y };
			livePanes = livePanes.flatMap((r) => (r === containing ? [upper, lower] : [r]));
			ledges = computeLedgesFromRects(VIEWPORT, livePanes.map((rect) => ({ rect, source: "pane" as const, paneRef: rect })));
			return lower;
		},
	};

	const ai = new BehaviorAI(pack, new Random(5));
	const run = (ticks: number) => {
		for (let i = 0; i < ticks; i++) {
			ai.tick(mascot, 0.04, ledges, { x: 0, y: 0, dx: 0, dy: 0 }, DEFAULT_ENGINE_CONFIG, paneActions);
			mascot.stateElapsedMs += 40;
		}
	};
	/**
	 * Runs until the order is discharged, then stops — and that stopping point is the whole reason
	 * this exists. Once an order completes the pack's own behaviours resume and wander the mascot off,
	 * so asserting a position at some fixed tick count later measures the pack's idling rather than
	 * whether the order was carried out. (Which is exactly what a first version of these tests did,
	 * and it reported a successful order as a failure by 134px.)
	 */
	const runUntilOrderDone = (maxTicks: number) => {
		for (let i = 0; i < maxTicks; i++) {
			if (!ai.hasSpotOrder) return { ticks: i, arrived: { x: physics.x, y: physics.y } };
			run(1);
		}
		return { ticks: maxTicks, arrived: { x: physics.x, y: physics.y } };
	};
	return { ai, mascot, physics, run, runUntilOrderDone, surgeries };
}

describe("spot order", () => {
	it("walks to a spot that is already reachable, without touching the layout", () => {
		const s = scene(200);
		s.ai.orderToSpot({ x: 900, y: 800 });
		const { arrived } = s.runUntilOrderDone(400);

		expect(Math.abs(arrived.x - 900)).toBeLessThanOrEqual(40);
		expect(s.surgeries).toHaveLength(0);
		expect(s.ai.hasSpotOrder).toBe(false);
	});

	// The point of the whole feature: mid-air, nothing to stand on, so it makes somewhere to stand.
	it("reshapes the layout when the spot is not reachable, then goes there", () => {
		// A full-window editor pane, as any real vault has — that is what gets split.
		const s = scene(200, [{ left: 0, top: 40, right: 1200, bottom: 800 }]);
		s.ai.orderToSpot({ x: 600, y: 500 });
		const { arrived } = s.runUntilOrderDone(3000);

		expect(s.surgeries.length).toBeGreaterThan(0);
		expect(s.surgeries[0]).toEqual({ x: 600, y: 500 });
		expect(Math.abs(arrived.y - 500)).toBeLessThanOrEqual(40);
		expect(Math.abs(arrived.x - 600)).toBeLessThanOrEqual(40);
	});

	// Each attempt splits a real pane in someone's workspace, so an impossible spot must not turn
	// into an unbounded run of new panes.
	it("gives up after a bounded number of layout changes rather than splitting forever", () => {
		const s = scene(200);
		// A fake that reports success but never actually adds a surface — the pathological case.
		const stubborn: PaneActions = { makeSurfaceAt: () => "nothing-useful" };
		const ledges = computeLedgesFromRects(VIEWPORT, []);
		let attempts = 0;
		const counting: PaneActions = {
			makeSurfaceAt: (p) => {
				attempts++;
				return stubborn.makeSurfaceAt?.(p);
			},
		};
		s.ai.orderToSpot({ x: 600, y: 300 });
		// Generous budget: once its surgeries are spent the mascot still walks to the closest point
		// the layout offers before standing down, and that approach runs at the pack's own pace.
		for (let i = 0; i < 3000 && s.ai.hasSpotOrder; i++) {
			s.ai.tick(s.mascot, 0.04, ledges, { x: 0, y: 0, dx: 0, dy: 0 }, DEFAULT_ENGINE_CONFIG, counting);
			s.mascot.stateElapsedMs += 40;
		}
		// The invariant that actually matters: an impossible spot cannot turn into an unbounded run
		// of new panes in someone's workspace.
		expect(attempts).toBeLessThanOrEqual(2);
		expect(s.ai.hasSpotOrder).toBe(false);
	});

	it("does nothing invasive when layout surgery is unavailable, and abandons the order", () => {
		const s = scene(200);
		const ledges = computeLedgesFromRects(VIEWPORT, []);
		s.ai.orderToSpot({ x: 600, y: 300 });
		// Generous budget on purpose: an order weights reaching the point far above reaching it
		// quickly, so with surgery unavailable the mascot commits to the long climb toward the closest
		// surface the layout does offer before standing down. Trying hard is the specified behaviour;
		// what is being asserted is that it eventually stops rather than that it stops soon.
		for (let i = 0; i < 4000 && s.ai.hasSpotOrder; i++) {
			// No makeSurfaceAt at all — the gated-off case.
			s.ai.tick(s.mascot, 0.04, ledges, { x: 0, y: 0, dx: 0, dy: 0 }, DEFAULT_ENGINE_CONFIG, {});
			s.mascot.stateElapsedMs += 40;
		}
		expect(s.ai.hasSpotOrder).toBe(false);
	});

	it("is cancelled by being told to follow the mouse instead", () => {
		const s = scene(200);
		s.ai.orderToSpot({ x: 900, y: 800 });
		expect(s.ai.hasSpotOrder).toBe(true);
		s.ai.setFollowingMouse(true);
		expect(s.ai.hasSpotOrder).toBe(false);
	});

	it("can be cancelled outright", () => {
		const s = scene(200);
		s.ai.orderToSpot({ x: 900, y: 800 });
		s.ai.cancelSpotOrder();
		expect(s.ai.hasSpotOrder).toBe(false);
		s.run(200);
		expect(s.surgeries).toHaveLength(0);
	});
});
