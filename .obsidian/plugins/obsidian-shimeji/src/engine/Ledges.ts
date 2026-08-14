import type { CeilingLedge, FloorLedge, Ledge, LedgeSource, PaneRef, Rect, WallLedge } from "./types";

/**
 * Pure geometry: turn a viewport size plus a set of platform rects (pane tops, status bar)
 * into walkable ledges. Kept free of DOM so it's unit-testable without jsdom. `paneRef` is
 * opaque here too (see engine/types.ts) — just carried onto every ledge derived from the same
 * platform entry, never inspected.
 */
export function computeLedgesFromRects(
	viewport: { width: number; height: number; top?: number },
	platforms: Array<{ rect: Rect; source: LedgeSource; paneRef?: PaneRef }>,
): Ledge[] {
	const ledges: Ledge[] = [];
	// Top of the usable world, not necessarily the top of the viewport — see
	// Environment.getWorldTop(). Optional/defaulting to 0 so every existing caller (tests, or a
	// future non-Obsidian host with no such chrome) keeps today's behavior unchanged.
	const worldTop = viewport.top ?? 0;

	ledges.push({ kind: "floor", y: viewport.height, x1: 0, x2: viewport.width, source: "window" });
	ledges.push({ kind: "ceiling", y: worldTop, x1: 0, x2: viewport.width, source: "window" });
	ledges.push({ kind: "wall", side: "left", x: 0, y1: worldTop, y2: viewport.height, source: "window" });
	ledges.push({ kind: "wall", side: "right", x: viewport.width, y1: worldTop, y2: viewport.height, source: "window" });

	for (const { rect, source, paneRef } of platforms) {
		if (rect.right - rect.left < 24 || rect.bottom - rect.top < 4) continue;
		const x1 = Math.max(0, rect.left);
		const x2 = Math.min(viewport.width, rect.right);

		if (rect.top > worldTop && rect.top < viewport.height) {
			ledges.push({ kind: "floor", y: rect.top, x1, x2, source, rect, paneRef });
		}

		// A pane's own bounding box also has climbable sides and a climbable underside — the
		// real pack's "activeIE" predicates reference all four edges, not just the top-as-floor
		// (see HoldOntoIEWall/ClimbIEWall/ClimbIEBottom/GrabIEBottomLeftWall/RightWall) — but
		// that's only meaningful for a tracked pane, not the thin status bar strip.
		if (source !== "pane") continue;
		// Clamped to worldTop, not just 0: without this, a pane whose own top edge sits close to
		// the real chrome could still let a mascot climb its *side* wall on up past the world
		// ceiling into that chrome, the same bug this whole worldTop plumbing exists to close.
		const y1 = Math.max(worldTop, rect.top);
		const y2 = Math.min(viewport.height, rect.bottom);
		if (rect.bottom > 0 && rect.bottom < viewport.height) {
			ledges.push({ kind: "ceiling", y: rect.bottom, x1, x2, source, rect, paneRef });
		}
		if (rect.left > 0) {
			ledges.push({ kind: "wall", side: "left", x: rect.left, y1, y2, source, rect, paneRef });
		}
		if (rect.right < viewport.width) {
			ledges.push({ kind: "wall", side: "right", x: rect.right, y1, y2, source, rect, paneRef });
		}
	}

	return bridgeNarrowGaps(ledges);
}

/**
 * How wide a gap between two otherwise-collinear pane edges still counts as one continuous surface.
 *
 * Panes were assumed to tile — to share edges exactly, the way Obsidian's default layout does — and a
 * lot of this engine quietly depends on it. Card-style themes break that assumption: they inset every
 * pane so neighbours sit a few pixels apart, which turns every floor in the workspace into a run of
 * segments with cracks between them.
 *
 * Measured from a user's live recording: a card theme with 6px gaps, panes at [50,496], [502,1120],
 * [1126,1433], [1439,1745]. A mascot walking right along the first floor stepped off at 496, found
 * nothing at 497 (the neighbour starts at 502), and fell 731px to the bottom of the window — past
 * three panes it looked like it was standing on.
 *
 * 16px is comfortably above the gaps themes actually use and far below anything a mascot could fall
 * through without it looking wrong: the sprite is well over a hundred pixels wide, so a gap this size
 * is not a hole it could plausibly fit into.
 */
const PANE_GAP_BRIDGE_PX = 16;

/** Two edges within this many pixels vertically are at the same height — pane rects come from
 * `getBoundingClientRect`, so collinear edges can differ by a fraction of a device pixel. */
const SAME_LEVEL_EPS = 1.5;

/**
 * Joins floors (and ceilings) that sit at the same height with only a narrow gap between them, so a
 * card-style layout presents the same continuous surfaces a tiled one does.
 *
 * Only spans are merged, never heights: two floors at genuinely different y stay separate, because
 * the step between them is real. `rect`/`paneRef` are taken from the leftmost segment — a merged
 * floor spans more than one pane, so "which pane is this" no longer has a single answer, and the
 * left-hand one is the stable, predictable choice for the pane-wrangling actions that read it.
 */
function bridgeNarrowGaps(ledges: Ledge[]): Ledge[] {
	const out: Ledge[] = ledges.filter((l) => l.kind === "wall" || l.source !== "pane");
	for (const kind of ["floor", "ceiling"] as const) {
		const segments = ledges
			.filter((l): l is Extract<Ledge, { kind: "floor" | "ceiling" }> => l.kind === kind && l.source === "pane")
			.sort((a, b) => a.y - b.y || a.x1 - b.x1);
		let current: Extract<Ledge, { kind: "floor" | "ceiling" }> | undefined;
		for (const seg of segments) {
			const joins = current && Math.abs(seg.y - current.y) <= SAME_LEVEL_EPS && seg.x1 - current.x2 <= PANE_GAP_BRIDGE_PX;
			if (joins && current) current.x2 = Math.max(current.x2, seg.x2);
			else {
				current = { ...seg };
				out.push(current);
			}
		}
	}
	return out;
}

/**
 * Excludes any floor within `standingHeight` of `worldTop` — a pane's own top edge can
 * legitimately sit just a few pixels below worldTop (there's rarely much room between "top of the
 * workspace" and "top of its topmost pane"), and physics.y itself never crosses worldTop there, so
 * the *anchor* is correct. But floor-standing poses are bottom-anchored, so the sprite's own
 * rendered top edge still extends upward from that anchor by roughly its own height and pokes
 * above worldTop into whatever's above (Obsidian's title bar/tab strip) — a real, reported
 * problem, not merely cosmetic, since that title bar is real interactive chrome. `standingHeight`
 * is the specific mascot's own rendered height (already includes its scale), so a smaller pack or
 * a shrunk mascot isn't excluded from floors a taller one legitimately would be. Ceiling-hanging
 * doesn't need this: that anchor sits near the *top* of the sprite and extends downward, away
 * from worldTop, so it never pokes into the chrome above — only floors are affected here.
 */
export function withoutFloorsTooCloseToTop(ledges: Ledge[], worldTop: number, standingHeight: number): Ledge[] {
	const minStandableY = worldTop + standingHeight;
	return ledges.filter((ledge) => !(ledge.kind === "floor" && ledge.y < minStandableY));
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

/**
 * Direction-agnostic: the closest floor spanning this x, whether it's above or below y.
 * findFloorBelow's "at or below" rule is right for catching an active fall, but wrong for
 * "is the floor I'm standing on still there" — ledges are recomputed (fresh objects, possibly
 * moved) on every window/pane resize, and if the window shrinks, the floor a mascot is
 * standing on moves *up*, ending up above the mascot's still-stale y. findFloorBelow would
 * then find nothing "below" that stale position and the mascot would fall through forever,
 * even though its floor never actually vanished — it just moved. Used only for re-anchoring an
 * already-grounded mascot, never for detecting a fresh landing while actively falling.
 */
export function findNearestFloorAt(ledges: Ledge[], x: number, y: number): FloorLedge | undefined {
	let best: FloorLedge | undefined;
	let bestDist = Infinity;
	for (const ledge of ledges) {
		if (ledge.kind !== "floor") continue;
		if (x < ledge.x1 || x > ledge.x2) continue;
		const dist = Math.abs(ledge.y - y);
		if (dist < bestDist) {
			best = ledge;
			bestDist = dist;
		}
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
