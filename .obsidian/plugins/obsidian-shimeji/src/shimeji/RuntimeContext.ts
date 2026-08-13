import type { ExprContext, ExprValue } from "./Expression";
import type { Ledge, MascotPhysics } from "../engine/types";
import type { Random } from "../engine/Random";

/** Whichever single pane (if any) the mascot is currently against — floor takes precedence
 * since it's the most common, most stable case; a mascot is never against more than one of
 * these at once in practice, but if it somehow were, this is at least a consistent pick rather
 * than an arbitrary one. Shared by createRuntimeContext (for reading activeIE's geometry) and
 * ActionRunner (for actually *acting* on that same pane — see PaneActions) so both agree on
 * exactly which pane "activeIE" currently means. */
export function resolveActivePaneLedge(physics: MascotPhysics): Ledge | undefined {
	const floor = physics.currentFloor?.kind === "floor" ? physics.currentFloor : undefined;
	const wall = physics.currentWall?.kind === "wall" ? physics.currentWall : undefined;
	const ceiling = physics.currentCeiling?.kind === "ceiling" ? physics.currentCeiling : undefined;
	if (physics.grounded && floor?.source === "pane") return floor;
	if (wall?.source === "pane") return wall;
	if (ceiling?.source === "pane") return ceiling;
	return undefined;
}

export interface AmbientPointer {
	x: number;
	y: number;
	dx: number;
	dy: number;
}

export interface RuntimeEnv {
	viewportWidth: number;
	viewportHeight: number;
	/** Top of the walkable world — below Obsidian's title bar / tab strip, matching where
	 * Ledges.ts actually puts the ceiling and the top of the window walls. The pack's own
	 * `workArea.top`/`ceiling.isOn(...)` must agree with the real geometry, or a mascot that
	 * climbs to the ceiling is told it isn't there. Optional (defaults to 0) so existing callers
	 * and tests with no chrome above the stage are unaffected. */
	worldTop?: number;
	pointer: AmbientPointer;
	totalMascotCount: number;
}

const warned = new Set<string>();
function warnUnknown(what: string): void {
	if (warned.has(what)) return;
	warned.add(what);
	console.warn(`[obsidian-shimeji] unsupported expression ${what}; defaulting to false/undefined`);
}

function toNum(v: ExprValue): number {
	return typeof v === "number" ? v : typeof v === "boolean" ? (v ? 1 : 0) : Number(v) || 0;
}

/**
 * Builds the `#{...}`/`${...}` condition context. Real Shimeji-ee packs lean heavily on a
 * geometry/predicate API (`mascot.environment.floor.isOn(mascot.anchor)`,
 * `mascot.environment.workArea.rightBorder.isOn(...)`, `mascot.environment.activeIE.*`) that
 * originally reflects OS-level window tracking we don't have. Here it's approximated from our
 * own ledges: "floor"/"ceiling"/"*Border" map to the outer window edges, and "activeIE" (the
 * original engine's tracked external window) maps to whichever *pane* the mascot is currently
 * against — its top (as a floor), one of its sides, or its underside — a reasonable analogue,
 * not a literal equivalent.
 */
export function createRuntimeContext(physics: MascotPhysics, env: RuntimeEnv, elapsedMs: number, rng: Random): ExprContext {
	const floor = physics.currentFloor?.kind === "floor" ? physics.currentFloor : undefined;
	const wall = physics.currentWall?.kind === "wall" ? physics.currentWall : undefined;
	const ceiling = physics.currentCeiling?.kind === "ceiling" ? physics.currentCeiling : undefined;
	const onPaneFloor = physics.grounded && floor?.source === "pane";
	const onWindowFloor = physics.grounded && !!floor && floor.source !== "pane";
	const onPaneWall = wall?.source === "pane";
	const onPaneCeiling = ceiling?.source === "pane";
	const EPS = 4;
	// Everything the pack asks about the top of the world has to use the *real* ceiling line, not
	// a hardcoded 0. Live trace 2026-08-13: a mascot climbed the wall to the top and immediately
	// fell instead of transferring onto the ceiling, because `ceiling.isOn(...)` tested `y <= 4`
	// while the actual ceiling ledge sits at worldTop (40 in that user's layout, below the tab
	// strip) — so the pack's HoldOntoCeiling/ClimbAlongCeiling conditions could never be true, and
	// its `workArea.top+64` climb targets aimed 40px into the chrome.
	const worldTop = env.worldTop ?? 0;

	const activePaneRect = resolveActivePaneLedge(physics)?.rect;

	const activeIE = activePaneRect
		? {
				left: activePaneRect.left,
				right: activePaneRect.right,
				top: activePaneRect.top,
				bottom: activePaneRect.bottom,
				width: activePaneRect.right - activePaneRect.left,
				height: activePaneRect.bottom - activePaneRect.top,
				visible: true,
			}
		: undefined;

	function call(name: string, args: ExprValue[]): ExprValue {
		if (name === "random" || name.endsWith(".random")) return rng.range(0, typeof args[0] === "number" ? args[0] : 1);
		if (name.endsWith(".min")) return Math.min(toNum(args[0]), toNum(args[1]));
		if (name.endsWith(".max")) return Math.max(toNum(args[0]), toNum(args[1]));
		if (name.endsWith(".abs")) return Math.abs(toNum(args[0]));
		if (name.endsWith(".floor")) return Math.floor(toNum(args[0]));

		switch (name) {
			case "mascot.environment.floor.isOn":
				return onWindowFloor;
			case "mascot.environment.ceiling.isOn":
				return physics.y <= worldTop + EPS;
			case "mascot.environment.workArea.leftBorder.isOn":
				return physics.x <= EPS;
			case "mascot.environment.workArea.rightBorder.isOn":
				return physics.x >= env.viewportWidth - EPS;
			case "mascot.environment.workArea.topBorder.isOn":
				return physics.y <= worldTop + EPS;
			case "mascot.environment.workArea.bottomBorder.isOn":
				return physics.y >= env.viewportHeight - EPS;
			case "mascot.environment.activeIE.topBorder.isOn":
				return onPaneFloor;
			case "mascot.environment.activeIE.leftBorder.isOn":
				return onPaneWall && wall?.side === "left";
			case "mascot.environment.activeIE.rightBorder.isOn":
				return onPaneWall && wall?.side === "right";
			case "mascot.environment.activeIE.bottomBorder.isOn":
				return onPaneCeiling;
		}
		warnUnknown(`function "${name}(...)"`);
		return undefined;
	}

	function resolve(path: string[]): ExprValue {
		const [head, ...rest] = path;
		if (head === "mascot") return resolveMascot(rest);
		if (head === "environment" || head === "env") return resolveEnvironment(rest);
		// Real bug found 2026-08-13, present in this plugin's own bundled reference pack (and
		// evidently others): actions.xml sometimes writes a bare "Math.random" with no `()` —
		// e.g. ClimbCeiling/Walk's own TargetX, `...right-Math.random*100` (missing the call
		// parens the *other* branch of the same ternary has, one line over). The parser reads an
		// un-called "Math.random" as a plain property path, not a call, so it lands here instead
		// of call()'s existing `.random` handling below. Silently resolving to 0 (this function's
		// normal "unknown identifier" fallback) turned a randomized offset into an exact, always-
		// identical edge coordinate — invisible as a bug in isolation, but the reason a walk/climb
		// target that should vary run to run looked perfectly deterministic every single time.
		// `Math.random()` is the only zero-argument Math member worth special-casing this way;
		// nothing else in that family means anything referenced bare.
		if (head === "Math" && rest.length === 1 && rest[0] === "random") return rng.range(0, 1);
		warnUnknown(`identifier "${path.join(".")}"`);
		return undefined;
	}

	function resolveMascot(rest: string[]): ExprValue {
		const [key, ...tail] = rest;
		switch (key) {
			case "anchor":
				if (tail[0] === "x") return physics.x;
				if (tail[0] === "y") return physics.y;
				// Bare "mascot.anchor" (no .x/.y) is only ever passed as an opaque point
				// argument to isOn(...)-style calls, which read physics state directly and
				// ignore the argument value — nothing to resolve here, silently.
				if (tail.length === 0) return undefined;
				break;
			case "lookRight":
				return physics.facing === 1;
			case "grounded":
			case "onFloor":
				return physics.grounded;
			case "time":
				return elapsedMs;
			case "totalCount":
				return env.totalMascotCount;
			case "environment":
			case "env":
				return resolveEnvironment(tail);
		}
		warnUnknown(`identifier "mascot.${rest.join(".")}"`);
		return undefined;
	}

	function resolveEnvironment(rest: string[]): ExprValue {
		const [region, ...tail] = rest;
		if (region === "cursor") {
			switch (tail[0]) {
				case "x":
					return env.pointer.x;
				case "y":
					return env.pointer.y;
				case "dx":
					return env.pointer.dx;
				case "dy":
					return env.pointer.dy;
			}
		}
		if (region === "screen" || region === "workArea") {
			switch (tail[0]) {
				case "left":
					return 0;
				// The work area starts at the ceiling line, not at the raw top of the window — the
				// pack builds real climb targets out of this (`workArea.top+64`, and
				// `workArea.top+64 + Math.random()*(workArea.height-128)`), so a hardcoded 0 aimed
				// them into the title bar and left `height` overstating the usable space by the
				// same amount.
				case "top":
					return worldTop;
				case "right":
					return env.viewportWidth;
				case "bottom":
					return env.viewportHeight;
				case "width":
					return env.viewportWidth;
				case "height":
					return env.viewportHeight - worldTop;
			}
		}
		if (region === "activeIE") {
			if (tail[0] === "visible") return !!activeIE?.visible;
			if (!activeIE) return undefined;
			switch (tail[0]) {
				case "left":
					return activeIE.left;
				case "right":
					return activeIE.right;
				case "top":
					return activeIE.top;
				case "bottom":
					return activeIE.bottom;
				case "width":
					return activeIE.width;
				case "height":
					return activeIE.height;
			}
		}
		warnUnknown(`identifier "environment.${rest.join(".")}"`);
		return undefined;
	}

	return { resolve, call };
}
