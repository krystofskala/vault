import type { ExprContext, ExprValue } from "./Expression";
import type { MascotPhysics } from "../engine/types";
import type { Random } from "../engine/Random";

export interface AmbientPointer {
	x: number;
	y: number;
	dx: number;
	dy: number;
}

export interface RuntimeEnv {
	viewportWidth: number;
	viewportHeight: number;
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
 * original engine's tracked external window) maps to whichever pane ledge the mascot is
 * currently standing on, when any — a reasonable analogue, not a literal equivalent.
 */
export function createRuntimeContext(physics: MascotPhysics, env: RuntimeEnv, elapsedMs: number, rng: Random): ExprContext {
	const floor = physics.currentFloor?.kind === "floor" ? physics.currentFloor : undefined;
	const onPaneFloor = physics.grounded && floor?.source === "pane";
	const onWindowFloor = physics.grounded && !!floor && floor.source !== "pane";
	const EPS = 4;

	const activeIE = onPaneFloor && floor
		? {
				left: floor.x1,
				right: floor.x2,
				top: floor.y,
				bottom: env.viewportHeight,
				width: floor.x2 - floor.x1,
				height: env.viewportHeight - floor.y,
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
				return physics.y <= EPS;
			case "mascot.environment.workArea.leftBorder.isOn":
				return physics.x <= EPS;
			case "mascot.environment.workArea.rightBorder.isOn":
				return physics.x >= env.viewportWidth - EPS;
			case "mascot.environment.workArea.topBorder.isOn":
				return physics.y <= EPS;
			case "mascot.environment.workArea.bottomBorder.isOn":
				return physics.y >= env.viewportHeight - EPS;
			case "mascot.environment.activeIE.topBorder.isOn":
				return onPaneFloor;
			case "mascot.environment.activeIE.leftBorder.isOn":
			case "mascot.environment.activeIE.rightBorder.isOn":
			case "mascot.environment.activeIE.bottomBorder.isOn":
				// We don't track a pane's sides/underside, only its top-as-floor.
				return false;
		}
		warnUnknown(`function "${name}(...)"`);
		return undefined;
	}

	function resolve(path: string[]): ExprValue {
		const [head, ...rest] = path;
		if (head === "mascot") return resolveMascot(rest);
		if (head === "environment" || head === "env") return resolveEnvironment(rest);
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
				case "top":
					return 0;
				case "right":
					return env.viewportWidth;
				case "bottom":
					return env.viewportHeight;
				case "width":
					return env.viewportWidth;
				case "height":
					return env.viewportHeight;
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
