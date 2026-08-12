import { applyGravityAndLand, tickChaseMouse, tickFall, tickThrown } from "../engine/nativeBehaviors";
import type { EngineConfig, Ledge, MascotPhysics } from "../engine/types";
import type { Mascot } from "../engine/Mascot";
import { SHIMEJI_TICK_MS, SHIMEJI_TICKS_PER_SEC } from "./constants";

const warned = new Set<string>();
function warnOnce(msg: string): void {
	if (warned.has(msg)) return;
	warned.add(msg);
	console.warn(`[obsidian-shimeji] ${msg}`);
}

const TICK_SECONDS = SHIMEJI_TICK_MS / 1000;

/** Falling's own RegistanceX/Y (air drag, applied per-tick in the original engine) — without
 * this a throw's horizontal speed never decays, so it either travels much further/faster
 * than the original before landing, or (pre wall-clamp) could carry it clean off the edge. */
function applyResistance(physics: MascotPhysics, params: Record<string, string> | undefined, dt: number): void {
	if (!params) return;
	const rx = parseFloat(params.RegistanceX ?? "");
	const ry = parseFloat(params.RegistanceY ?? "");
	if (!Number.isNaN(rx) && rx > 0) physics.vx *= Math.pow(1 - rx, dt / TICK_SECONDS);
	if (!Number.isNaN(ry) && ry > 0) physics.vy *= Math.pow(1 - ry, dt / TICK_SECONDS);
}

/** Falling can override the pack-wide gravity with its own Gravity attribute (px/tick²). */
function withEffectiveGravity(config: EngineConfig, params: Record<string, string> | undefined): EngineConfig {
	const g = params ? parseFloat(params.Gravity ?? "") : NaN;
	if (Number.isNaN(g)) return config;
	return { ...config, gravity: g * SHIMEJI_TICKS_PER_SEC * SHIMEJI_TICKS_PER_SEC };
}

/**
 * Bridges a pack's declarative Embedded action to the native physics that actually
 * implements it (Shimeji-ee itself hard-codes these four as Java classes rather than pure
 * XML). Real Dragged/Thrown lifecycles are driven directly by Mascot's own pointer handling
 * (see PackDriver.renderState/notifyReleased); reaching "Dragged" here would only happen if
 * a pack organically selects it as a normal behavior, which real packs don't do.
 */
export function applyNativeEmbedded(
	name: string,
	mascot: Mascot,
	dt: number,
	ledges: Ledge[],
	ambient: { x: number; y: number },
	config: EngineConfig,
	params?: Record<string, string>,
): boolean {
	switch (name) {
		case "Fall": {
			applyResistance(mascot.physics, params, dt);
			const args = { physics: mascot.physics, ledges, dt, config: withEffectiveGravity(config, params) };
			return tickFall(args).landed;
		}
		case "Thrown":
			return tickThrown({ physics: mascot.physics, ledges, dt, config }).landed;
		case "ChaseMouse":
			return tickChaseMouse({ physics: mascot.physics, ledges, dt, config }, ambient);
		case "Dragged":
			return true;
		// Jump only sets an initial arc velocity (see applyEmbeddedStartEffects, run once when
		// the action starts) and otherwise behaves exactly like Fall — the same "just apply
		// gravity" fallback as the default case below, but without its "unrecognized" warning,
		// since Jump is a real, known embedded class, not an unsupported one.
		case "Jump":
			return applyGravityAndLand({ physics: mascot.physics, ledges, dt, config });
		default:
			warnOnce(`unrecognized Embedded action "${name}", falling back to gravity`);
			return applyGravityAndLand({ physics: mascot.physics, ledges, dt, config });
	}
}
