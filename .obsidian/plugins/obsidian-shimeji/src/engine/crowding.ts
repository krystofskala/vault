import type { Mascot } from "./Mascot";

/**
 * How close two mascots have to be, on the same axis a floor walk moves along, to count as
 * crowding each other. Roughly a body-width — close enough that a viewer reads it as "standing on
 * top of each other," not merely "nearby."
 */
const CROWD_RADIUS_PX = 48;

/**
 * The x of the nearest *other* grounded, unconfined mascot within crowding distance, or undefined
 * if this mascot isn't crowded. Computed once per tick in Stage and threaded down through
 * Mascot.simulate -> MascotDriver.tick -> BehaviorAI.tick, so a mascot choosing its next behaviour
 * can walk clear of a neighbour first instead of settling next to (or on top of) it — see
 * BehaviorAI.maybeAvoidCrowd.
 *
 * A room resident is solo in its room by construction (moveIn evicts everyone else), and an
 * airborne mascot isn't "standing" anywhere yet to be crowded — both excluded the same way the
 * original (now-removed) position-nudge excluded them.
 */
export function nearestCrowderX(mascots: readonly Mascot[], mascot: Mascot): number | undefined {
	if (!mascot.physics.grounded || mascot.confinement !== undefined) return undefined;
	let nearest: number | undefined;
	let bestDist = Infinity;
	for (const other of mascots) {
		if (other === mascot) continue;
		if (!other.physics.grounded || other.confinement !== undefined) continue;
		const dist = Math.abs(other.physics.x - mascot.physics.x);
		if (dist < CROWD_RADIUS_PX && dist < bestDist) {
			bestDist = dist;
			nearest = other.physics.x;
		}
	}
	return nearest;
}
