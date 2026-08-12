import { applyGravityAndLand, tickChaseMouse, tickFall, tickThrown } from "../engine/nativeBehaviors";
import type { EngineConfig, Ledge } from "../engine/types";
import type { Mascot } from "../engine/Mascot";

const warned = new Set<string>();
function warnOnce(msg: string): void {
	if (warned.has(msg)) return;
	warned.add(msg);
	console.warn(`[obsidian-shimeji] ${msg}`);
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
): boolean {
	const args = { physics: mascot.physics, ledges, dt, config };
	switch (name) {
		case "Fall":
			return tickFall(args).landed;
		case "Thrown":
			return tickThrown(args).landed;
		case "ChaseMouse":
			return tickChaseMouse(args, ambient);
		case "Dragged":
			return true;
		default:
			warnOnce(`unrecognized Embedded action "${name}", falling back to gravity`);
			return applyGravityAndLand(args);
	}
}
