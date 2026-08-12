import type { FloorLedge, Ledge, LedgeSource, Rect, WallLedge } from "./types";

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
		if (rect.top <= 0 || rect.top >= viewport.height) continue;
		ledges.push({
			kind: "floor",
			y: rect.top,
			x1: Math.max(0, rect.left),
			x2: Math.min(viewport.width, rect.right),
			source,
		});
	}

	return ledges;
}

/** DOM-facing collector: finds pane tops and the status bar to use as extra floor ledges. */
export function collectPlatformRects(root: Document): Array<{ rect: Rect; source: LedgeSource }> {
	const platforms: Array<{ rect: Rect; source: LedgeSource }> = [];

	const leaves = root.querySelectorAll<HTMLElement>(".workspace-leaf");
	leaves.forEach((leaf) => {
		if (leaf.offsetParent === null) return;
		const r = leaf.getBoundingClientRect();
		if (r.width === 0 || r.height === 0) return;
		platforms.push({ rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom }, source: "pane" });
	});

	const statusBar = root.querySelector<HTMLElement>(".status-bar");
	if (statusBar && statusBar.offsetParent !== null) {
		const r = statusBar.getBoundingClientRect();
		if (r.width > 0 && r.height > 0) {
			platforms.push({ rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom }, source: "statusbar" });
		}
	}

	return platforms;
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
