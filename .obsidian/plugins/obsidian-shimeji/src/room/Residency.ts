import { debugLog } from "../engine/debugLog";
import type { Confinement, Mascot } from "../engine/Mascot";
import type { Stage } from "../engine/Stage";
import type { Ledge, Vec2 } from "../engine/types";
import type { RoomLayout } from "./RoomGeometry";

/**
 * Who lives in the plant room, and how they get in and out.
 *
 * **Invented**, with no shimeji-ee counterpart — see roomDef.ts.
 *
 * Three rules, all of them the user's:
 *  - a mascot that reaches the room lives there and cannot leave on its own;
 *  - the first one in is the only one: every other mascot on screen vanishes;
 *  - it comes out only when explicitly sent somewhere outside.
 *
 * The first rule is not enforced here. Moving in replaces the mascot's world with the room's
 * surfaces (Mascot.confinement), so there is no route out to plan and no rule to check. This file
 * only handles the two *transitions*, which are the parts that genuinely need arranging.
 */

/** How close to the threshold counts as arriving at it. Generous: climbing is slow at the pack's
 * real 0.64px/tick and a mascot that stops two pixels short should still go in. */
const THRESHOLD_REACH_PX = 52;

/**
 * How tall the resident stands, as a fraction of the room's own drawn height.
 *
 * Derived from the room rather than a fixed multiplier, because "half size" is only the right answer
 * for one particular room at one particular pane width. The painted room is a tall narrow nook and
 * the apartment is a whole flat seen in isometric; the same mascot has to look at home in both, and
 * both change size whenever the sidebar is dragged. Sizing it against the room keeps the proportion
 * fixed and lets everything else move.
 *
 * A sixth of the room's height puts it comfortably between the bookshelf's shelves and makes the
 * furniture read as furniture.
 */
const RESIDENT_HEIGHT_FRACTION = 1 / 6;

/** Never enlarged past its normal size: a mascot bigger indoors than out would look wrong at the
 * threshold, which is the one moment both sizes are on screen together. */
const MAX_RESIDENT_SCALE = 1;

export interface ResidencyHost {
	stage(): Stage | undefined;
	/** The room's current placement, or undefined when its pane is closed or collapsed. */
	layout(): RoomLayout | undefined;
	notify(message: string): void;
	/** Persist who lives here, so the room still has its resident after a restart. */
	rememberResident(resident: { packId: string | null } | null): void;
	packIdOf(mascot: Mascot): string | null;
}

export class Residency {
	private resident?: Mascot;
	/** On its way home but not yet through the door. */
	private incoming?: Mascot;
	/** Where a resident is headed once it has stepped back outside. */
	private leavingFor?: Vec2;
	/** Whether the resident was in the user's hand on the previous frame, so a release can be told
	 * apart from physics having flung it somewhere. */
	private residentWasHeld = false;
	private scaleBeforeMovingIn = 1;
	private cachedLedges?: { key: string; ledges: Ledge[] };

	constructor(private host: ResidencyHost) {}

	private readonly confinement: Confinement = {
		getLedges: () => {
			const layout = this.host.layout();
			if (!layout) return [];
			// Rebuilt only when the room actually moves. getLedges is called every fixed tick, and
			// the room's twenty-odd surfaces are otherwise re-derived sixty times a second for a
			// layout that changes when you drag a sidebar edge.
			const key = `${layout.rect.left}|${layout.rect.top}|${layout.scale}|${layout.mirrored}`;
			if (this.cachedLedges?.key !== key) this.cachedLedges = { key, ledges: layout.ledges() };
			return this.cachedLedges.ledges;
		},
		isVisible: () => this.host.layout() !== undefined,
	};

	get hasResident(): boolean {
		return this.resident !== undefined;
	}

	get residentMascot(): Mascot | undefined {
		return this.resident;
	}

	/**
	 * Intercepts a "go to that spot" order, returning true when the room has taken it over.
	 *
	 * Ordering is where both transitions start, and routing them through here rather than through
	 * BehaviorAI keeps the engine free of any knowledge that rooms exist. The four cases are
	 * exhaustive: the target is inside or outside, and there is a resident or there is not.
	 */
	handleOrder(point: Vec2, nearest: Mascot | undefined): boolean {
		const layout = this.host.layout();
		if (!layout || !nearest) return false;
		const inside = layout.contains(point);

		if (this.resident) {
			if (inside) {
				// Already home: an ordinary order, just one whose world is the room.
				this.resident.orderToSpot(point);
				return true;
			}
			// Called out. It walks to the door first; stepping through is what actually returns it
			// to the workspace, and the original destination is re-issued on the far side.
			this.leavingFor = { x: point.x, y: point.y };
			this.resident.orderToSpot(layout.doorInside());
			this.host.notify("Shimeji: coming out.");
			return true;
		}

		if (!inside) return false;

		// Sent home. The order aims at the *outside* of the door — a point on the pane's own edge,
		// which is a wall the workspace graph already has — because the room's interior is not in
		// that graph and cannot be routed to.
		this.incoming = nearest;
		nearest.orderToSpot(layout.doorOutside());
		this.host.notify("Shimeji: on the way home.");
		return true;
	}

	/** Called every frame. Only watches for the two thresholds being crossed. */
	tick(): void {
		// The resident can be removed by something that has never heard of the room — "Remove all
		// mascots", a settings change, a plugin reload. Noticing here rather than hooking every
		// removal path means no path can be forgotten.
		const live = this.host.stage()?.getMascots();
		if (this.resident && live && !live.includes(this.resident)) this.forget(this.resident);
		if (this.incoming && live && !live.includes(this.incoming)) this.incoming = undefined;

		const layout = this.host.layout();
		if (!layout) return;

		if (this.incoming && !this.resident) {
			const m = this.incoming;
			// Either route in: ordered to the doorstep and arrived, or simply dropped into the room
			// by hand. Both are "it is at the threshold", so both are one check.
			const atDoor = distance(m.physics, layout.doorOutside()) <= THRESHOLD_REACH_PX;
			const droppedIn = layout.contains(m.physics) && !m.isBeingDragged;
			if (atDoor || droppedIn) this.moveIn(m, layout);
			return;
		}

		// Dragging any mascot into the room moves it in, whether or not it was ever ordered to.
		if (!this.resident) {
			const stage = this.host.stage();
			const dropped = stage?.getMascots().find((m) => !m.isBeingDragged && layout.contains(m.physics));
			if (dropped) this.moveIn(dropped, layout);
			return;
		}

		// Re-fitted every frame, not only on the way in: dragging the sidebar's edge changes the
		// room's size, and a resident that kept its old scale would grow or shrink relative to the
		// furniture it is standing on.
		this.fitResidentToRoom(layout);
		this.keepResidentInside(layout);
		if (!this.resident) return;

		if (this.leavingFor && !this.resident.hasSpotOrder) {
			// The order to the door has been discharged — either by arriving or by the router
			// giving up. Only the first counts.
			if (distance(this.resident.physics, layout.doorInside()) <= THRESHOLD_REACH_PX) this.moveOut(layout);
			else this.leavingFor = undefined;
		}
	}

	/** Sizes the resident against the room it is in — on the way in, and again whenever the room
	 * changes size under it. */
	private fitResidentToRoom(layout: RoomLayout): void {
		const mascot = this.resident;
		if (!mascot || mascot.height <= 0) return;
		const roomHeight = layout.rect.bottom - layout.rect.top;
		const fraction = layout.def.residentHeightFraction ?? RESIDENT_HEIGHT_FRACTION;
		const cap = layout.def.residentMaxScale ?? MAX_RESIDENT_SCALE;
		const wanted = Math.min(cap, (roomHeight * fraction) / mascot.height);
		if (Math.abs(mascot.scale - wanted) > 0.001) mascot.scale = wanted;
		// A room may pin which way its resident faces — a mascot sitting at a desk should not keep
		// turning away. Applied every frame because the pack's own Look action would otherwise flip
		// it back within seconds.
		if (layout.def.residentFacing !== undefined) mascot.physics.facing = layout.def.residentFacing;

		// Held in one behaviour, re-applied the moment the pack's chain moves off it. Without this the
		// pack keeps selecting from its whole repertoire, and in a room the size of a seat the result
		// reads as jittering rather than as idling — reported as "shaking like crazy".
		const hold = layout.def.residentBehavior;
		if (hold && mascot.currentBehaviorName !== hold) mascot.startNamedBehavior(hold);
	}

	/**
	 * Two ways a resident can end up outside its own room, which need opposite answers.
	 *
	 * **Picked up and put down somewhere else** is a deliberate act, and the natural counterpart of
	 * dropping a mascot in to move it in — so it moves out, and stays where it was put.
	 *
	 * **Anything else** is the room failing to hold it: a throw's release velocity, a pane resized
	 * out from under it. That has to be corrected, because the room is not protected by
	 * `clampToWalls` (which is deliberately window-only, so a pane edge can never yank a mascot
	 * sideways) and a mascot outside the room carrying the room's surfaces has nothing beneath it —
	 * it falls forever, drifts off screen, and ends up in the engine's respawn-above-the-window
	 * recovery, still holding a world it is nowhere near.
	 */
	private keepResidentInside(layout: RoomLayout): void {
		const mascot = this.resident;
		if (!mascot) return;
		if (mascot.isBeingDragged) {
			this.residentWasHeld = true;
			return;
		}
		const justReleased = this.residentWasHeld;
		this.residentWasHeld = false;
		// Judged against the walkable box, not the drawn picture: an isometric room's square has
		// surround in its corners, and a resident sitting in one has nothing beneath it.
		if (within(layout.walkable, mascot.physics)) return;

		// Only a release *outside the picture* is the user putting it down elsewhere. Landing in the
		// square's corner is still being in the room, just in a part of it with no floor.
		if (justReleased && !layout.contains(mascot.physics)) {
			this.moveOut(layout, { placeAtDoor: false });
			return;
		}
		const rect = layout.walkable;
		mascot.physics.x = Math.min(Math.max(mascot.physics.x, rect.left + 1), rect.right - 1);
		mascot.physics.y = Math.min(Math.max(mascot.physics.y, rect.top + 1), rect.bottom - 1);
		mascot.physics.vx = 0;
		mascot.physics.vy = 0;
		debugLog("room: pulled the resident back inside", { x: Math.round(mascot.physics.x), y: Math.round(mascot.physics.y) });
	}

	/**
	 * The resident steps in, and everyone else vanishes.
	 *
	 * Abrupt on purpose — the user asked for exactly this. Nothing on disk is touched: the other
	 * mascots are removed from the screen the same way "Remove all mascots" removes them, and
	 * spawning more afterwards works as it always did.
	 */
	private moveIn(mascot: Mascot, layout: RoomLayout): void {
		const stage = this.host.stage();
		const evicted = (stage?.getMascots() ?? []).filter((m) => m !== mascot);
		for (const other of evicted) stage?.removeMascot(other);

		this.incoming = undefined;
		this.resident = mascot;
		this.scaleBeforeMovingIn = mascot.scale;
		this.fitResidentToRoom(layout);
		mascot.cancelSpotOrder();
		mascot.setFollowingMouse(false);
		mascot.confinement = this.confinement;
		this.cachedLedges = undefined;

		// Placed just inside the threshold and dropped, rather than pinned to the floor: landing is
		// the engine's job, and letting it happen means the mascot arrives with a proper Fall
		// instead of appearing already standing.
		const inside = layout.doorInside();
		mascot.physics.x = inside.x;
		mascot.physics.y = inside.y - 1;
		mascot.physics.vx = 0;
		mascot.physics.vy = 0;
		mascot.physics.grounded = false;
		mascot.physics.currentFloor = undefined;
		mascot.physics.currentWall = undefined;
		mascot.physics.currentCeiling = undefined;

		this.host.rememberResident({ packId: this.host.packIdOf(mascot) });
		debugLog("room: moved in", { at: inside, evicted: evicted.length });
		this.host.notify(evicted.length > 0 ? `Shimeji: moved into the plant room. ${evicted.length} other${evicted.length === 1 ? "" : "s"} vanished.` : "Shimeji: moved into the plant room.");
	}

	/** Back out through the door, full size, and on to wherever it was actually sent. */
	private moveOut(layout: RoomLayout, opts: { placeAtDoor?: boolean } = {}): void {
		const mascot = this.resident;
		if (!mascot) return;
		const target = this.leavingFor;
		this.resident = undefined;
		this.leavingFor = undefined;
		this.residentWasHeld = false;
		this.cachedLedges = undefined;
		mascot.confinement = undefined;
		mascot.scale = this.scaleBeforeMovingIn;
		mascot.setHidden(false);

		// Placed at the threshold when it walked out, and left exactly where it is when it was
		// carried out — moving a mascot the user has just put down is the one thing guaranteed to
		// feel wrong.
		if (opts.placeAtDoor !== false) {
			const outside = layout.doorOutside();
			mascot.physics.x = outside.x;
			mascot.physics.y = outside.y;
		}
		mascot.physics.vx = 0;
		mascot.physics.vy = 0;
		mascot.physics.grounded = false;
		mascot.physics.currentFloor = undefined;
		mascot.physics.currentWall = undefined;
		mascot.physics.currentCeiling = undefined;

		this.host.rememberResident(null);
		debugLog("room: moved out", { at: { x: Math.round(mascot.physics.x), y: Math.round(mascot.physics.y) }, headingFor: target, carried: opts.placeAtDoor === false });
		if (target) mascot.orderToSpot(target);
	}

	/**
	 * Puts a mascot straight into the room with no journey — how a remembered resident comes back
	 * after a restart, and what the "Send shimeji home" command falls back to when the mascot
	 * cannot route to the door at all.
	 */
	placeDirectly(mascot: Mascot): boolean {
		const layout = this.host.layout();
		if (!layout || this.resident) return false;
		this.moveIn(mascot, layout);
		return true;
	}

	/** Sends the resident out with no destination — the "Call shimeji out" command. */
	callOut(): boolean {
		const layout = this.host.layout();
		if (!layout || !this.resident) return false;
		this.leavingFor = undefined;
		this.moveOut(layout);
		return true;
	}

	/** The resident was removed by something else (a "Remove all mascots", a plugin reload). */
	forget(mascot: Mascot): void {
		if (this.resident !== mascot) return;
		this.resident = undefined;
		this.leavingFor = undefined;
		this.host.rememberResident(null);
	}
}

function distance(a: Vec2, b: Vec2): number {
	return Math.hypot(a.x - b.x, a.y - b.y);
}

function within(rect: { left: number; top: number; right: number; bottom: number }, p: Vec2): boolean {
	return p.x >= rect.left && p.x <= rect.right && p.y >= rect.top && p.y <= rect.bottom;
}
