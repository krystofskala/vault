import type { Mascot } from "./Mascot";

/**
 * **Invented.** Real shimeji-ee has no box collision between mascots at all (see
 * ActionRunner.ts's tickScanMove comment) — but its behaviors also don't converge as many
 * mascots onto the exact same pixel as this port's do, in particular the four corner
 * wall-grab actions (GrabWorkAreaBottomLeftWall/RightWall, WalkAndGrabBottomLeftWall/RightWall),
 * whose Walk/Run target is the literal, unjittered work-area edge. Jittering those targets
 * directly was tried and rejected: ClimbWall's own grip-maintenance check needs physics.x
 * within 8px of the true edge, far too tight a radius to usefully spread mascots apart without
 * breaking the climb.
 *
 * This is a real position adjustment, not a cosmetic render offset — reported as "5 mascots
 * stand in exact same spot... not just in corner", which a purely visual fix wouldn't address
 * (clicking/dragging would still land on a pile of coincident hitboxes).
 */
const SEPARATION_MIN_PX = 48;
/** Weak on purpose: real Walk/Run speeds are several times this, so an actively-moving mascot's
 * own velocity dominates and the nudge is imperceptible. Once a mascot is idle (Hold-type actions
 * never touch physics.x on their own), this is the only thing left acting on it, and gradually
 * separates it from a neighbour over a couple of seconds — no need to detect "is this mascot
 * currently at rest" explicitly. */
const SEPARATION_NUDGE_PX_PER_SEC = 24;

/** Nudges every pair of too-close, grounded, unconfined mascots apart a little. Call once per
 * physics step with the full live mascot list. */
export function applyMascotSeparation(mascots: readonly Mascot[], dtSeconds: number): void {
	for (let i = 0; i < mascots.length; i++) {
		for (let j = i + 1; j < mascots.length; j++) {
			const a = mascots[i];
			const b = mascots[j];
			if (!a.physics.grounded || !b.physics.grounded) continue;
			// A room resident is solo in its room by construction (moveIn evicts everyone else) —
			// only unconfined, shared-workspace mascots can ever actually coincide.
			if (a.confinement !== undefined || b.confinement !== undefined) continue;
			const dx = b.physics.x - a.physics.x;
			const dist = Math.abs(dx);
			if (dist >= SEPARATION_MIN_PX) continue;
			const push = (SEPARATION_MIN_PX - dist) * Math.min(1, (SEPARATION_NUDGE_PX_PER_SEC * dtSeconds) / SEPARATION_MIN_PX);
			// Stable tie-break at exact coincidence: pick a direction from pair order rather than
			// leaving dx===0 with no sign to push apart along.
			const dir = dx !== 0 ? Math.sign(dx) : i % 2 === 0 ? 1 : -1;
			a.physics.x -= (dir * push) / 2;
			b.physics.x += (dir * push) / 2;
		}
	}
}
