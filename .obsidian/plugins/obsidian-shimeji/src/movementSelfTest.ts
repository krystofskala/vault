import { tourTargets } from "./engine/MovementAudit";
import type { Mascot } from "./engine/Mascot";
import type { Stage } from "./engine/Stage";
import { MovementRecorder } from "./MovementRecorder";

/**
 * The scripted half of in-Obsidian testing: drive one live mascot through every movement the pack
 * has and a full lap of the real window, recording the whole thing.
 *
 * Runs at real speed against the real stage rather than fast-forwarding a simulation, because the
 * point is the parts a simulation replaces with assumptions — the DOM ledge scan, rAF pacing, panes
 * moving underfoot. That costs minutes of wall time; progress is reported and it can be cancelled.
 */

/** Real behavior names from the standard pack. Action names would select nothing (`forceBehavior`
 * takes behaviors, and the pack names almost none of its movement actions the same as the behaviors
 * that use them) and would silently exercise the nothing-eligible recovery instead. */
const MOVEMENT_BEHAVIORS = [
	"WalkAlongWorkAreaFloor",
	"RunAlongWorkAreaFloor",
	"CrawlAlongWorkAreaFloor",
	"WalkLeftAndSit",
	"WalkRightAndSit",
	"WalkAndGrabBottomLeftWall",
	"WalkAndGrabBottomRightWall",
	"ClimbAlongWall",
	"ClimbHalfwayAlongWall",
	"HoldOntoWall",
	"FallFromWall",
	"ClimbAlongCeiling",
	"HoldOntoCeiling",
	"FallFromCeiling",
	"JumpFromLeftWall",
	"JumpFromRightWall",
	"SitDown",
	"StandUp",
	"LieDown",
	"Fall",
];

/** A behavior gets this long to do something before the script moves on. Generous: several of the
 * pack's own animations run for many seconds by design. */
const BEHAVIOR_TIMEOUT_MS = 12000;

/** A spot order gets much longer — crossing the window on a wall is ~0.64px/tick. */
const ORDER_TIMEOUT_MS = 90000;

export interface SelfTestHandle {
	cancel(): void;
}

export interface SelfTestCallbacks {
	onProgress(message: string): void;
	onDone(report: string): void;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function runMovementSelfTest(stage: Stage, mascot: Mascot, cb: SelfTestCallbacks): SelfTestHandle {
	const recorder = new MovementRecorder(stage, mascot);
	let cancelled = false;

	const waitUntil = async (done: () => boolean, timeoutMs: number): Promise<boolean> => {
		const started = performance.now();
		while (!cancelled && !done() && performance.now() - started < timeoutMs) await sleep(100);
		return done();
	};

	void (async () => {
		recorder.start();
		recorder.note(`pack behaviors available: ${mascot.listBehaviorNames().length}`);

		try {
			// 1. Every movement behavior the pack declares, one at a time, so a single broken one is
			//    attributable rather than just making some later leg look odd.
			const available = new Set(mascot.listBehaviorNames());
			for (const name of MOVEMENT_BEHAVIORS) {
				if (cancelled) break;
				if (!available.has(name)) {
					recorder.note(`skipped ${name} — not in this pack`);
					continue;
				}
				cb.onProgress(`behavior: ${name}`);
				recorder.setPhase(`behavior: ${name}`);
				const before = mascot.currentBehaviorName;
				mascot.startNamedBehavior(name);
				// Until this behavior hands over to whatever the pack picks next.
				const finished = await waitUntil(() => mascot.currentBehaviorName !== name && mascot.currentBehaviorName !== before, BEHAVIOR_TIMEOUT_MS);
				if (!finished) recorder.note(`!! ${name} still running after ${BEHAVIOR_TIMEOUT_MS / 1000}s`);
			}

			// 2. A lap of the real window: the same targets the headless audit uses, but derived from
			//    the live ledges, so this follows whatever panes are actually open right now.
			const viewport = mascot.getViewportSize();
			const targets = tourTargets(stage.getLedges(), { width: viewport.width, height: viewport.height, worldTop: mascot.getWorldTop() });
			for (const { name, point } of targets) {
				if (cancelled) break;
				cb.onProgress(`going to ${name}`);
				recorder.setPhase(`go to ${name} (${Math.round(point.x)},${Math.round(point.y)})`, true);
				mascot.orderToSpot(point);
				const arrived = await waitUntil(() => !mascot.hasSpotOrder, ORDER_TIMEOUT_MS);
				const miss = Math.round(Math.hypot(mascot.physics.x - point.x, mascot.physics.y - point.y));
				if (!arrived) recorder.note(`!! order to ${name} never finished (${ORDER_TIMEOUT_MS / 1000}s), ${miss}px away`);
				else if (miss > 64) recorder.note(`!! gave up ${miss}px short of ${name}`);
				else recorder.note(`reached ${name} (${miss}px)`);
				mascot.cancelSpotOrder();
			}
		} finally {
			recorder.setPhase("done");
			recorder.stop();
			cb.onDone(recorder.report(cancelled ? "Shimeji movement self-test (cancelled)" : "Shimeji movement self-test"));
		}
	})();

	return {
		cancel() {
			cancelled = true;
		},
	};
}

/** The unscripted half: record while the user simply uses Obsidian. Catches the triggers a script
 * cannot think of — resizing a split under a walking mascot, collapsing a sidebar, switching
 * workspaces — which is where the interesting failures have actually come from so far. */
export function startFreePlayRecording(stage: Stage, mascot: Mascot): { stop(): string } {
	const recorder = new MovementRecorder(stage, mascot);
	recorder.setPhase("free play");
	recorder.start();
	return {
		stop() {
			recorder.stop();
			return recorder.report("Shimeji movement recording (free play)");
		},
	};
}
