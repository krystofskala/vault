import { findFloorBelow } from "./Ledges";
import type { CeilingLedge, FloorLedge, Ledge, Vec2, WallLedge } from "./types";

/**
 * Route-finding across the ledge graph — how a mascot gets from where it is standing to somewhere
 * it is not, using the surfaces that actually exist.
 *
 * **Invented.** shimeji-ee has nothing like it and does not need it: its mascots live on one desktop
 * with a handful of tracked windows, and every one of its movement behaviours is authored as a fixed
 * script ("walk to a random x on this floor", "climb this wall to a random y"). Nothing in the
 * original ever asks "how do I get *there* from *here*", so there is no algorithm to port. Obsidian's
 * layout is a much denser and more vertical arrangement of surfaces, and the interesting question —
 * the one that makes a mascot look like it inhabits the window rather than patrols one floor — is
 * exactly that one.
 *
 * The graph is deliberately built from the same `Ledge` list the physics already uses, not a separate
 * navigation mesh, so a route can never describe a surface the mascot cannot actually stand on.
 */

/** How a mascot got to a step's point from the previous one. Each maps to a real pack action —
 * see BehaviorAI's route execution — which is why the set is exactly these five and not a richer
 * vocabulary: anything with no pack action behind it would be unplayable. */
export type RouteVia = "walk" | "climb" | "traverse" | "jump" | "drop";

export interface RouteStep {
	via: RouteVia;
	x: number;
	y: number;
	ledge: Ledge;
}

export interface RouteOptions {
	/** Horizontal reach of a jump. The pack's own `Jumping` uses a constant speed toward its target
	 * rather than a ballistic arc (real Jump.java recomputes a direction vector every tick), so reach
	 * is a straight budget rather than something derived from gravity. */
	maxJumpDx: number;
	/** How far *up* a jump can carry. Dropping is unlimited — gravity is free. */
	maxJumpUp: number;
	/**
	 * How fast each kind of movement actually is, in pixels per engine tick, so routes can be costed
	 * in **time** rather than distance.
	 *
	 * This matters far more than it looks. The standard pack's own animations differ by more than an
	 * order of magnitude — `Dash` covers 8px a tick, `Jumping` 20, while `ClimbWall` averages 0.64
	 * (36px of travel spread over 56 ticks, most of them hold frames). An earlier version costed by
	 * distance with small hand-picked multipliers, which priced a climb at roughly a walk and a jump
	 * as *more expensive* than one — precisely backwards, and it made the router send mascots up long
	 * slow walls in preference to routes they could have jumped or dropped in a fraction of the time.
	 *
	 * Defaults are measured from the standard pack. A pack whose animations differ can pass its own.
	 */
	speeds: { walk: number; climb: number; traverse: number; jump: number };
	/** px/tick², matching the pack's own `Falling` Gravity, so a drop is costed by how long the fall
	 * actually takes: distance d under constant acceleration takes sqrt(2d/g) ticks, which is
	 * sublinear — long drops are proportionally *cheaper*, which is exactly why they are worth
	 * preferring over climbing back down. */
	gravity: number;
	/** Fixed tick overheads: a jump has a windup, and changing surface costs a moment either way.
	 * Without these the router would happily chain dozens of micro-hops. */
	jumpOverhead: number;
	/**
	 * When picking *which* reachable surface to aim for, how many pixels of extra distance-from-target
	 * one tick of travel is worth. It is the dial between "get closest" and "get there soonest", and
	 * the right setting genuinely depends on why you are going.
	 *
	 * Following the pointer wants a real number here: chasing a cursor across the window is not worth
	 * a 400-tick wall climb to close the last 300px, and a mascot that tries looks broken rather than
	 * diligent. An explicit "go to that spot" order wants it near zero — the whole promise is reaching
	 * the point, however long it takes. Costed in ticks against a distance in pixels, so the units
	 * only make sense as an exchange rate; at walking speed a pixel is about an eighth of a tick.
	 */
	travelTimeWeight: number;
	/**
	 * How much extra distance-from-target a mascot will accept in order to end up **standing** rather
	 * than hanging or clinging. Expressed in pixels, added to a candidate surface's score.
	 *
	 * Obsidian's layout puts surfaces on top of each other everywhere — a pane's underside and the
	 * next pane's top edge are the same line — so "closest surface to the target" is frequently a tie
	 * between a floor and a ceiling, broken arbitrarily. Left arbitrary, a mascot ends up upside down
	 * on the underside of a ledge it could just as well have walked along, which reads as a glitch
	 * rather than a choice. Big enough to settle those ties decisively, small enough that a ceiling
	 * genuinely nearer the target still wins.
	 */
	uprightPreference: number;
	/**
	 * How close to the best reachable point counts as being there. Load-bearing for callers that use
	 * an empty route as their "stop" signal: without it, a mascot a pixel off would be handed a
	 * one-pixel leg forever. It is measured against the closest point the *surfaces* allow, not
	 * against the raw target, so a target floating in mid-air still terminates.
	 */
	arriveWithin: number;
}

export const DEFAULT_ROUTE_OPTIONS: RouteOptions = {
	maxJumpDx: 220,
	maxJumpUp: 130,
	speeds: { walk: 8, climb: 0.64, traverse: 0.64, jump: 20 },
	gravity: 2,
	jumpOverhead: 6,
	travelTimeWeight: 2,
	uprightPreference: 80,
	arriveWithin: 4,
};

/** Two coordinates within this many pixels are the same place. Ledges derived from adjacent DOM
 * rects share edges only approximately — a pane's bottom and the one below it can differ by a
 * fraction of a device pixel — and a corner that fails to connect silently removes a whole branch
 * of the graph, which is the least debuggable failure this file has. */
const JOIN_EPS = 6;


function clamp(v: number, lo: number, hi: number): number {
	return v < lo ? lo : v > hi ? hi : v;
}

function distance(a: Vec2, b: Vec2): number {
	return Math.hypot(a.x - b.x, a.y - b.y);
}

/** The point on `ledge` closest to `towards` — where a mascot heading for `towards` would stand. */
export function pointOn(ledge: Ledge, towards: Vec2): Vec2 {
	if (ledge.kind === "wall") return { x: ledge.x, y: clamp(towards.y, ledge.y1, ledge.y2) };
	return { x: clamp(towards.x, ledge.x1, ledge.x2), y: ledge.y };
}

function spansX(ledge: FloorLedge | CeilingLedge, x: number): boolean {
	return x >= ledge.x1 - JOIN_EPS && x <= ledge.x2 + JOIN_EPS;
}

function spansY(wall: WallLedge, y: number): boolean {
	return y >= wall.y1 - JOIN_EPS && y <= wall.y2 + JOIN_EPS;
}

/** Movement *along* a surface, which is what gets you from an arrival point to a departure point. */
function alongVia(ledge: Ledge): RouteVia {
	return ledge.kind === "wall" ? "climb" : ledge.kind === "ceiling" ? "traverse" : "walk";
}

interface Transfer {
	/** Where on the current ledge the mascot leaves from. */
	from: Vec2;
	/** Which ledge it arrives on, and where. */
	to: Ledge;
	at: Vec2;
	via: RouteVia;
}

/**
 * Every way of leaving `ledge`, given the mascot is currently at `at` on it and ultimately heading
 * for `goal` (which only influences *where* on a candidate surface it aims, never whether the
 * connection exists).
 */
function transfersFrom(ledge: Ledge, at: Vec2, goal: Vec2, ledges: Ledge[], opts: RouteOptions): Transfer[] {
	const out: Transfer[] = [];

	for (const other of ledges) {
		if (other === ledge) continue;

		// Corner joins: surfaces that physically meet, so the mascot simply changes which one it is
		// attached to. These are the backbone of vertical movement — a floor meeting a wall is how a
		// mascot gets off the ground at all without jumping.
		//
		// Departure and arrival are computed **separately, each clamped onto its own surface**, rather
		// than as one shared corner point. They coincide when the surfaces meet exactly, which is what
		// a tiled layout gives — but `spansX`/`spansY` deliberately tolerate JOIN_EPS of slack, and a
		// card-style theme spends every pixel of it: panes are inset, so a pane's underside stops 3px
		// short of the window wall and one pane's bottom edge sits 6px above the next one's top.
		//
		// A single corner point then names a coordinate that is on neither surface, and the mascot is
		// told to travel to somewhere it cannot be. Both halves of that were observed: a climb ordered
		// 6px past the end of its own wall never completes (the mascot hangs at the wall's end
		// forever), and — worse — the pair of them oscillate, because from the surface it lands on the
		// router immediately plans the reverse leg. Live, that was a mascot ping-ponging across a 6px
		// pane gap for the whole 320s of a test run.
		//
		// Clamped, each leg asks only for a point on the surface it travels along, and the few pixels
		// left over are bridged by ordinary physics — gravity for a floor, adherence reach for a wall
		// or ceiling — which is what those tolerances are for.
		if (ledge.kind !== "wall" && other.kind === "wall" && spansX(ledge, other.x) && spansY(other, ledge.y)) {
			const from = { x: clamp(other.x, ledge.x1, ledge.x2), y: ledge.y };
			const at = { x: other.x, y: clamp(ledge.y, other.y1, other.y2) };
			out.push({ from, to: other, at, via: "climb" });
			continue;
		}
		if (ledge.kind === "wall" && other.kind !== "wall" && spansY(ledge, other.y) && spansX(other, ledge.x)) {
			const from = { x: ledge.x, y: clamp(other.y, ledge.y1, ledge.y2) };
			const at = { x: clamp(ledge.x, other.x1, other.x2), y: other.y };
			out.push({ from, to: other, at, via: alongVia(other) });
			continue;
		}

		// Jumps, from a floor only: a mascot pushes off something it is standing on. Reaching *up* is
		// bounded; reaching down is a drop and handled below, so this skips anything lower.
		if (ledge.kind === "floor" && other.kind === "floor") {
			const landing = pointOn(other, goal);
			const dx = Math.abs(landing.x - at.x);
			const up = ledge.y - other.y;
			if (dx <= opts.maxJumpDx && up > 0 && up <= opts.maxJumpUp) {
				out.push({ from: at, to: other, at: landing, via: "jump" });
			}
		}
	}

	// Drops: walk off either end of a floor and let gravity do the rest. Only the two ends, because
	// anywhere in the middle of a floor there is by definition floor underfoot.
	if (ledge.kind === "floor") {
		for (const end of ["x1", "x2"] as const) {
			const offX = edgeStepOffX(ledges, ledge, end);
			if (offX === undefined) continue;
			const below = findFloorBelow(ledges, offX, ledge.y + 1);
			if (!below) continue;
			out.push({ from: { x: ledge[end], y: ledge.y }, to: below, at: pointOn(below, goal), via: "drop" });
		}
	}

	return out;
}

/**
 * How far past a floor's end a mascot has to be for the floor to no longer be underfoot.
 *
 * Exported because the router and the mascot that carries out its plans have to agree on it: the
 * router may only offer a drop the mascot can actually perform, and the mascot may only step off
 * where the router assumed it would. Above `WALL_CEILING_ADHERENCE_REACH` so the step also breaks
 * contact with any wall at that edge — under a card theme a pane's wall sits a few pixels inside the
 * window's, and a smaller step leaves the mascot clinging to one while ostensibly falling past it.
 */
export const EDGE_STEP_OFF_PX = 6;

/**
 * Where a mascot stepping off one end of `floor` ends up — or `undefined` when that is outside the
 * window, in which case there is no such drop and the router must not offer one.
 *
 * The window's own walls are a hard clamp on position (see clampToWalls), so "step off the right-hand
 * end" is only a real move when there is room to the right of that end. A card-style theme is exactly
 * the case where there often isn't: it insets panes, so the topmost pane's floor stops 3px short of
 * the window wall, and a mascot stepping off it is pushed straight back and catches the wall two
 * pixels into its fall. Observed as a mascot walking to the top-right corner, twitching, climbing
 * back, and repeating for the full five minutes of a test — every "go somewhere below me" order on
 * the right-hand side of the window failed this way, because getting lower always ends in a drop.
 */
export function edgeStepOffX(ledges: Ledge[], floor: FloorLedge, end: "x1" | "x2"): number | undefined {
	const offX = end === "x1" ? floor.x1 - EDGE_STEP_OFF_PX : floor.x2 + EDGE_STEP_OFF_PX;
	let minX = -Infinity;
	let maxX = Infinity;
	for (const l of ledges) {
		if (l.kind !== "wall" || l.source !== "window") continue;
		if (l.side === "left" && l.x > minX) minX = l.x;
		if (l.side === "right" && l.x < maxX) maxX = l.x;
	}
	return offX > minX && offX < maxX ? offX : undefined;
}

/** Estimated ticks to perform this step — see RouteOptions.speeds for why this is time, not distance. */
function stepCost(via: RouteVia, from: Vec2, to: Vec2, opts: RouteOptions): number {
	const d = distance(from, to);
	switch (via) {
		case "jump":
			return d / opts.speeds.jump + opts.jumpOverhead;
		case "climb":
			return d / opts.speeds.climb;
		case "traverse":
			return d / opts.speeds.traverse;
		case "drop": {
			// Free-fall time for the vertical part, walking time for whatever sideways drift remains.
			const dy = Math.abs(to.y - from.y);
			const dx = Math.abs(to.x - from.x);
			return Math.sqrt((2 * dy) / opts.gravity) + dx / opts.speeds.walk;
		}
		default:
			return d / opts.speeds.walk;
	}
}

/** Which ledge the mascot is currently attached to, preferring what physics already decided. */
export function ledgeUnder(ledges: Ledge[], at: Vec2, current?: Ledge): Ledge | undefined {
	if (current && ledges.includes(current)) return current;
	let best: Ledge | undefined;
	let bestD = Infinity;
	for (const ledge of ledges) {
		const d = distance(pointOn(ledge, at), at);
		if (d < bestD) {
			bestD = d;
			best = ledge;
		}
	}
	return best;
}

interface Visit {
	cost: number;
	at: Vec2;
	prev?: { ledge: Ledge; transfer: Transfer };
}

/** Movement smaller than this along a step's own axis is no movement at all. */
const NO_OP_STEP_PX = 0.5;

/**
 * Drops steps that ask the mascot to travel where it already is — measured **along the axis that
 * step's action actually moves**, which is the part that took two goes to get right.
 *
 * A corner transfer legitimately arrives at the very point it departs from, so the raw path contains
 * zero-length steps by construction. They are meaningful as *graph* edges and useless as
 * *instructions*: a caller that turns each into a targeted Move gets one that completes on its first
 * tick, re-plans, produces the same step again, and never progresses. That much was already handled.
 *
 * What was not: a step can be a no-op *for its own action* while still covering ground. Each leg is
 * given only the axis its Move travels along — a climb gets `TargetY`, a walk or traverse gets
 * `TargetX` — because handing a wall climb the x it is already at made it finish on its first tick.
 * So a "climb" between two walls 3px apart at the *same height* has nothing to climb: its TargetY is
 * already satisfied, and it loops exactly as a zero-length step would.
 *
 * That is not a contrived case. Card-style themes inset panes, so a pane's wall sits a few pixels
 * inside the window's own wall, and the corner between them is a short horizontal hop. Observed live:
 * a mascot at the top-right corner reissued `climb → (1745,40)` from (1748,40) every tick for 42
 * seconds, then did the same at the bottom-right corner for nearly three minutes. Five of eight spot
 * orders in that session timed out without moving.
 *
 * Dropping such a step is safe for the same reason dropping a zero-length one is: the surface change
 * is carried by the *next* step, which names the new ledge and a point actually on it.
 */
function withoutStandingStill(steps: RouteStep[], from: Vec2): RouteStep[] {
	const out: RouteStep[] = [];
	let at = from;
	for (const step of steps) {
		const dx = Math.abs(step.x - at.x);
		const dy = Math.abs(step.y - at.y);
		// Which axis the leg's action is actually given as its target — see BehaviorAI.startRouteAction.
		const worthDoing = step.via === "climb" ? dy > NO_OP_STEP_PX : step.via === "walk" || step.via === "traverse" ? dx > NO_OP_STEP_PX : distance(at, step) > NO_OP_STEP_PX;
		if (!worthDoing) continue;
		out.push(step);
		at = step;
	}
	return out;
}

/**
 * Finds a route from `from` to `target`, as a list of steps a mascot can actually perform. Returns
 * an empty list when it is already there, or when nothing connects — callers treat that as "just do
 * the simple thing", never as an error.
 *
 * Dijkstra over ledges rather than over (ledge, point) pairs: the cost of crossing a surface depends
 * on where you got on, so keying purely by ledge can in principle settle for a slightly worse entry
 * point. That is a deliberate trade — the graph is tens of nodes and rebuilt every leg, and a
 * marginally suboptimal route is invisible where a slow one would not be.
 */
export function findRoute(ledges: Ledge[], from: Vec2, target: Vec2, startLedge?: Ledge, options?: Partial<RouteOptions>): RouteStep[] {
	const opts = { ...DEFAULT_ROUTE_OPTIONS, ...options };
	const start = ledgeUnder(ledges, from, startLedge);
	if (!start) return [];

	const visited = new Map<Ledge, Visit>();
	visited.set(start, { cost: 0, at: from });
	const queue: Ledge[] = [start];

	while (queue.length > 0) {
		// Linear scan for the cheapest unsettled node. A heap would be premature here: the graph is
		// bounded by the number of visible panes, so this is a handful of comparisons.
		let bestIdx = 0;
		for (let i = 1; i < queue.length; i++) {
			if (visited.get(queue[i])!.cost < visited.get(queue[bestIdx])!.cost) bestIdx = i;
		}
		const ledge = queue.splice(bestIdx, 1)[0];
		const here = visited.get(ledge)!;

		for (const transfer of transfersFrom(ledge, here.at, target, ledges, opts)) {
			const cost =
				here.cost + stepCost(alongVia(ledge), here.at, transfer.from, opts) + stepCost(transfer.via, transfer.from, transfer.at, opts);
			const existing = visited.get(transfer.to);
			if (existing && existing.cost <= cost) continue;
			visited.set(transfer.to, { cost, at: transfer.at, prev: { ledge, transfer } });
			if (!queue.includes(transfer.to)) queue.push(transfer.to);
		}
	}

	// The goal is whichever reachable surface gets closest to the target, with its own travel cost
	// counted in — otherwise a distant ledge that happens to pass nearer the cursor would beat the
	// floor the mascot is already standing on. Costs are ticks and the other term is pixels, so the
	// weight converts: at walking speed a pixel is ~1/8 of a tick, and valuing travel time at roughly
	// a third of that keeps proximity the dominant consideration without ignoring a long slog.
	let goal: Ledge | undefined;
	let goalScore = Infinity;
	for (const [ledge, visit] of visited) {
		const upright = ledge.kind === "floor" ? 0 : opts.uprightPreference;
		const score = distance(pointOn(ledge, target), target) + visit.cost * opts.travelTimeWeight + upright;
		if (score < goalScore) {
			goalScore = score;
			goal = ledge;
		}
	}
	if (!goal) return [];

	// Walk the predecessor chain back to the start, emitting the pair of steps each transfer implies:
	// travel along the surface you are on to the departure point, then the transfer itself.
	const steps: RouteStep[] = [];
	for (let ledge: Ledge | undefined = goal; ledge; ) {
		const visit: Visit = visited.get(ledge)!;
		if (!visit.prev) break;
		const { transfer } = visit.prev;
		steps.unshift({ via: transfer.via, x: transfer.at.x, y: transfer.at.y, ledge: transfer.to });
		const departure = visited.get(visit.prev.ledge)!;
		if (distance(departure.at, transfer.from) > 0.5) {
			steps.unshift({ via: alongVia(visit.prev.ledge), x: transfer.from.x, y: transfer.from.y, ledge: visit.prev.ledge });
		}
		ledge = visit.prev.ledge;
	}

	// Finally, move along the goal surface to the point nearest the target. Suppressed when already
	// close enough, which is what makes an empty route mean "nothing further to do" — the signal
	// callers rely on to stop pursuing something they cannot get any nearer to.
	const arrival = pointOn(goal, target);
	const lastAt = steps.length > 0 ? { x: steps[steps.length - 1].x, y: steps[steps.length - 1].y } : from;
	if (distance(lastAt, arrival) > opts.arriveWithin) steps.push({ via: alongVia(goal), x: arrival.x, y: arrival.y, ledge: goal });

	return withoutStandingStill(steps, from);
}

/**
 * How long a route takes, in engine ticks — the same estimate the search itself minimises, exposed so
 * a caller can compare whole *plans* rather than only pick between surfaces.
 *
 * That comparison is the point: "climb up and drop through the spot" and "split a pane and climb the
 * new divider" both reach a mid-air target, and which is quicker depends entirely on the layout. With
 * costs in ticks, the two are directly comparable numbers instead of a guess.
 */
export function routeDurationTicks(from: Vec2, steps: RouteStep[], options?: Partial<RouteOptions>): number {
	const opts = { ...DEFAULT_ROUTE_OPTIONS, ...options };
	let at = from;
	let total = 0;
	for (const step of steps) {
		total += stepCost(step.via, at, step, opts);
		at = step;
	}
	return total;
}

/** Time for an unassisted fall of `dy` pixels, in ticks. */
export function fallDurationTicks(dy: number, options?: Partial<RouteOptions>): number {
	const opts = { ...DEFAULT_ROUTE_OPTIONS, ...options };
	return Math.sqrt((2 * Math.max(0, dy)) / opts.gravity);
}

export interface DropThrough {
	/** Where to let go from. */
	from: Vec2;
	/** The surface being let go of, so the caller knows whether it is hanging or walking off an edge. */
	ledge: Ledge;
}

/** How near the fall line a spot has to be for a drop to count as passing through it. Falls drift
 * horizontally very little (real Fall applies RegistanceX to whatever sideways velocity it started
 * with, and a release has none), so this is tight. */
const DROP_LINE_TOLERANCE = 28;

/**
 * Finds somewhere to let go from so that the resulting fall passes straight **through** `spot`.
 *
 * This is what makes a mid-air point reachable without touching the layout. A mascot cannot *stand*
 * in the middle of the editor, but it can fall through it — hang from the ceiling directly above,
 * let go, and for a moment it is exactly there. Given the pack's real speeds a fall is one of the
 * cheapest things a mascot can do, so this is very often quicker than splitting a pane and climbing
 * the new divider.
 *
 * Two kinds of departure qualify:
 *  - a **ceiling** (or pane underside) spanning the spot's x, which the mascot hangs from and releases;
 *  - the **edge of a floor** directly above, which it simply walks off.
 * A floor's *middle* never qualifies, for the obvious reason that there is floor underfoot there.
 *
 * The fall must also be unobstructed: no floor may sit between the departure point and the spot.
 *
 * "Between" deliberately **includes floors level with the departure itself**, which is not a detail.
 * Tiled panes put one pane's underside and the next pane's top edge on exactly the same line, so a
 * ceiling that looks like a perfect place to hang and drop from very often has a floor in it. Ignoring
 * those (by starting the search a pixel below) makes such a drop look free while in reality the mascot
 * lands the instant it lets go — and then, still not at the spot, plans the identical drop again. That
 * is not a hypothetical: it is an infinite release/land loop, observed with two stacked panes.
 *
 * The departing ledge is exempt from that test by identity rather than by height, which is what lets a
 * mascot still walk off the *end* of a floor while a same-level sibling floor beside it correctly
 * blocks the fall.
 */
export function planDropThrough(ledges: Ledge[], spot: Vec2, options?: Partial<RouteOptions>, avoid: readonly Vec2[] = []): DropThrough | undefined {
	const opts = { ...DEFAULT_ROUTE_OPTIONS, ...options };
	let best: DropThrough | undefined;
	let bestFall = Infinity;

	const blocked = (departing: Ledge, departY: number): boolean =>
		ledges.some(
			(l) =>
				l.kind === "floor" && l !== departing && spansX(l, spot.x) && l.y >= departY - 0.5 && l.y <= spot.y + opts.arriveWithin,
		);
	const rejected = (from: Vec2): boolean => avoid.some((a) => distance(a, from) <= DROP_LINE_TOLERANCE);

	for (const ledge of ledges) {
		if (ledge.kind === "wall") continue;
		if (ledge.y >= spot.y) continue; // must be above the spot to fall onto it
		if (blocked(ledge, ledge.y)) continue;

		if (ledge.kind === "ceiling") {
			if (!spansX(ledge, spot.x)) continue;
			const from = { x: spot.x, y: ledge.y };
			if (rejected(from)) continue;
			const fall = spot.y - ledge.y;
			if (fall < bestFall) {
				bestFall = fall;
				best = { from, ledge };
			}
			continue;
		}

		// A floor: only its two ends are departure points, and the spot has to be on that fall line.
		// The fall line is where the mascot ends up *after* stepping clear, not the edge itself — and
		// an end with no room to step past is not a departure point at all.
		for (const end of ["x1", "x2"] as const) {
			const offX = edgeStepOffX(ledges, ledge, end);
			if (offX === undefined) continue;
			if (Math.abs(offX - spot.x) > DROP_LINE_TOLERANCE) continue;
			const from = { x: ledge[end], y: ledge.y };
			if (rejected(from)) continue;
			const fall = spot.y - ledge.y;
			if (fall < bestFall) {
				bestFall = fall;
				best = { from, ledge };
			}
		}
	}

	return best;
}
