import type { CeilingLedge, FloorLedge, Ledge, LedgeSource, Rect, WallLedge } from "./types";

/**
 * Pure geometry: turn a viewport size plus a set of platform rects (pane tops, status bar)
 * into walkable ledges. Kept free of DOM so it's unit-testable without jsdom.
 */
export function computeLedgesFromRects(
	viewport: { width: number; height: number },
	platforms: Array<{ rect: Rect; source: LedgeSource }>,
): Ledge[] {
	const ledges: Ledge[] = [];

	ledges.push({ kind: "floor", y: viewport.height, x1: 0, x2: viewport.width, source: "window" });
	ledges.push({ kind: "ceiling", y: 0, x1: 0, x2: viewport.width, source: "window" });
	ledges.push({ kind: "wall", side: "left", x: 0, y1: 0, y2: viewport.height, source: "window" });
	ledges.push({ kind: "wall", side: "right", x: viewport.width, y1: 0, y2: viewport.height, source: "window" });

	for (const { rect, source } of platforms) {
		if (rect.right - rect.left < 24 || rect.bottom - rect.top < 4) continue;
		const x1 = Math.max(0, rect.left);
		const x2 = Math.min(viewport.width, rect.right);

		if (rect.top > 0 && rect.top < viewport.height) {
			ledges.push({ kind: "floor", y: rect.top, x1, x2, source, rect });
		}

		// A pane's own bounding box also has climbable sides and a climbable underside — the
		// real pack's "activeIE" predicates reference all four edges, not just the top-as-floor
		// (see HoldOntoIEWall/ClimbIEWall/ClimbIEBottom/GrabIEBottomLeftWall/RightWall) — but
		// that's only meaningful for a tracked pane, not the thin status bar strip.
		if (source !== "pane") continue;
		const y1 = Math.max(0, rect.top);
		const y2 = Math.min(viewport.height, rect.bottom);
		if (rect.bottom > 0 && rect.bottom < viewport.height) {
			ledges.push({ kind: "ceiling", y: rect.bottom, x1, x2, source, rect });
		}
		if (rect.left > 0) {
			ledges.push({ kind: "wall", side: "left", x: rect.left, y1, y2, source, rect });
		}
		if (rect.right < viewport.width) {
			ledges.push({ kind: "wall", side: "right", x: rect.right, y1, y2, source, rect });
		}
	}

	return ledges;
}

export function findFloorBelow(ledges: Ledge[], x: number, y: number): FloorLedge | undefined {
	let best: FloorLedge | undefined;
	for (const ledge of ledges) {
		if (ledge.kind !== "floor") continue;
		if (x < ledge.x1 || x > ledge.x2) continue;
		if (ledge.y < y - 0.5) continue;
		if (!best || ledge.y < best.y) best = ledge;
	}
	return best;
}

export function findWallAt(ledges: Ledge[], x: number, y: number, side: "left" | "right", reach: number): WallLedge | undefined {
	for (const ledge of ledges) {
		if (ledge.kind !== "wall" || ledge.side !== side) continue;
		if (y < ledge.y1 || y > ledge.y2) continue;
		if (Math.abs(ledge.x - x) <= reach) return ledge;
	}
	return undefined;
}

export function findCeilingAt(ledges: Ledge[], x: number, y: number, reach: number): CeilingLedge | undefined {
	for (const ledge of ledges) {
		if (ledge.kind !== "ceiling") continue;
		if (x < ledge.x1 || x > ledge.x2) continue;
		if (Math.abs(ledge.y - y) <= reach) return ledge;
	}
	return undefined;
}
