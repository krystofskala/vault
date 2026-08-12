import type { ExprContext, ExprValue } from "./Expression";
import type { MascotPhysics } from "../engine/types";
import type { Random } from "../engine/Random";

export interface RuntimeEnv {
	viewportWidth: number;
	viewportHeight: number;
}

const warned = new Set<string>();
function warnUnknown(what: string): void {
	if (warned.has(what)) return;
	warned.add(what);
	console.warn(`[obsidian-shimeji] unsupported expression ${what}; defaulting to false/undefined`);
}

/** Builds the `#{...}` condition context: exposes a pragmatic, best-effort subset of the
 * identifiers real Shimeji packs use (mascot.anchor.*, mascot.lookRight, mascot.environment.*,
 * random()). Unknown identifiers/functions resolve to undefined rather than throwing. */
export function createRuntimeContext(physics: MascotPhysics, env: RuntimeEnv, elapsedMs: number, rng: Random): ExprContext {
	return {
		resolve(path: string[]): ExprValue {
			return resolvePath(path, physics, env, elapsedMs);
		},
		call(name: string, args: ExprValue[]): ExprValue {
			if (name === "random" || name.endsWith(".random")) {
				const n = typeof args[0] === "number" ? args[0] : 1;
				return rng.range(0, n);
			}
			warnUnknown(`function "${name}(...)"`);
			return undefined;
		},
	};
}

function resolvePath(path: string[], physics: MascotPhysics, env: RuntimeEnv, elapsedMs: number): ExprValue {
	const [head, ...rest] = path;
	if (head === "mascot") return resolveMascot(rest, physics, env, elapsedMs);
	if (head === "environment" || head === "env") return resolveEnvironment(rest, env);
	warnUnknown(`identifier "${path.join(".")}"`);
	return undefined;
}

function resolveMascot(rest: string[], physics: MascotPhysics, env: RuntimeEnv, elapsedMs: number): ExprValue {
	const [key, ...tail] = rest;
	switch (key) {
		case "anchor":
			if (tail[0] === "x") return physics.x;
			if (tail[0] === "y") return physics.y;
			break;
		case "lookRight":
			return physics.facing === 1;
		case "grounded":
		case "onFloor":
			return physics.grounded;
		case "time":
			return elapsedMs;
		case "environment":
		case "env":
			return resolveEnvironment(tail, env);
	}
	warnUnknown(`identifier "mascot.${rest.join(".")}"`);
	return undefined;
}

function resolveEnvironment(rest: string[], env: RuntimeEnv): ExprValue {
	const [region, ...tail] = rest;
	if (region === "workArea" || region === "screen" || region === "window") {
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
	warnUnknown(`identifier "environment.${rest.join(".")}"`);
	return undefined;
}
