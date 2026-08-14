import { setVerboseLogging } from "./engine/debugLog";
import { describeSurface } from "./engine/MovementAudit";
import type { Stage } from "./engine/Stage";

export interface ShimejiDebugApi {
	setVerbose(on: boolean): void;
	stageCount(): number;
	hideOverlay(): void;
	showOverlay(): void;
	elementsAtTop(y?: number): void;
	mascotRects(): void;
	dumpLedges(): void;
	where(): void;
	watch(seconds?: number): void;
}

declare global {
	interface Window {
		shimejiDebug?: ShimejiDebugApi;
	}
}

/**
 * Console-reachable diagnostics (window.shimejiDebug in Obsidian's DevTools) for issues a user
 * can trigger interactively but we can't reproduce blind — e.g. whether the stage overlay's
 * mere DOM presence interferes with the title bar's own native drag hit-testing, or whether a
 * previous plugin reload left a stale Stage instance still running alongside a fresh one.
 * Installed once from main.ts's onload; getStage is a thunk (not a captured value) so it keeps
 * working across a settings-triggered Stage recreation, if that's ever added.
 */
export function installDebugApi(getStage: () => Stage | undefined): void {
	window.shimejiDebug = {
		setVerbose(on) {
			setVerboseLogging(on);
			console.info(`[obsidian-shimeji] verbose physics/behavior logging ${on ? "ON" : "OFF"}`);
		},
		stageCount() {
			const n = document.querySelectorAll(".shimeji-stage").length;
			console.info(
				`[obsidian-shimeji] .shimeji-stage elements currently in the DOM: ${n}` +
					(n > 1 ? " <- more than one! a previous instance likely never got cleaned up on reload" : ""),
			);
			return n;
		},
		hideOverlay() {
			getStage()?.container.style.setProperty("display", "none");
			console.info("[obsidian-shimeji] stage overlay hidden — try dragging the title bar now; shimejiDebug.showOverlay() brings mascots back");
		},
		showOverlay() {
			getStage()?.container.style.removeProperty("display");
			console.info("[obsidian-shimeji] stage overlay restored");
		},
		elementsAtTop(y = 8) {
			const w = window.innerWidth;
			const xs = [20, Math.round(w / 2), Math.max(20, w - 20)];
			for (const x of xs) {
				const el = document.elementFromPoint(x, y);
				const cs = el ? getComputedStyle(el) : undefined;
				console.info(
					`[obsidian-shimeji] elementFromPoint(${x}, ${y}) ->`,
					el,
					cs && { pointerEvents: cs.pointerEvents, appRegion: cs.getPropertyValue("-webkit-app-region"), zIndex: cs.zIndex },
				);
			}
		},
		mascotRects() {
			const stage = getStage();
			if (!stage) {
				console.info("[obsidian-shimeji] no stage");
				return;
			}
			const mascots = stage.getMascots();
			if (mascots.length === 0) console.info("[obsidian-shimeji] no live mascots");
			mascots.forEach((m, i) => {
				const r = m.el.getBoundingClientRect();
				console.info(`[obsidian-shimeji] mascot#${i}`, {
					left: Math.round(r.left),
					top: Math.round(r.top),
					right: Math.round(r.right),
					bottom: Math.round(r.bottom),
					pointerEvents: getComputedStyle(m.el).pointerEvents,
				});
			});
		},
		/** Where every mascot is right now, and what it is standing on / clinging to. The first thing
		 * to reach for when movement looks wrong: it names the surface, not just the coordinates. */
		where() {
			const stage = getStage();
			if (!stage) {
				console.info("[obsidian-shimeji] no stage");
				return;
			}
			const mascots = stage.getMascots();
			if (mascots.length === 0) {
				console.info("[obsidian-shimeji] no live mascots");
				return;
			}
			console.table(
				mascots.map((m, i) => ({
					"#": i,
					x: Math.round(m.physics.x),
					y: Math.round(m.physics.y),
					vx: Math.round(m.physics.vx * 10) / 10,
					vy: Math.round(m.physics.vy * 10) / 10,
					facing: m.physics.facing === 1 ? "right" : "left",
					on: describeSurface(m.physics),
					behavior: m.currentBehaviorName ?? "-",
				})),
			);
		},

		/** Samples position once per animation frame for `seconds`, then prints the track. Use this when
		 * something looks wrong *while it happens* — `where()` is a snapshot, this is the movie. */
		watch(seconds = 5) {
			const stage = getStage();
			const mascot = stage?.getMascots()[0];
			if (!mascot) {
				console.info("[obsidian-shimeji] no live mascots to watch");
				return;
			}
			const rows: Array<Record<string, unknown>> = [];
			const started = performance.now();
			let last = { x: mascot.physics.x, y: mascot.physics.y };
			const sample = () => {
				const t = performance.now() - started;
				const p = mascot.physics;
				const step = Math.hypot(p.x - last.x, p.y - last.y);
				rows.push({ ms: Math.round(t), x: Math.round(p.x), y: Math.round(p.y), step: Math.round(step), on: describeSurface(p), behavior: mascot.currentBehaviorName ?? "-" });
				last = { x: p.x, y: p.y };
				if (t < seconds * 1000) requestAnimationFrame(sample);
				else {
					console.info(`[obsidian-shimeji] ${seconds}s track (${rows.length} frames):`);
					console.table(rows);
					// A frame-to-frame jump far beyond the pack's fastest animation is the teleport
					// signature; surfaced explicitly because it is easy to miss scrolling a long table.
					const jumps = rows.filter((r) => (r.step as number) > 60);
					if (jumps.length) console.warn(`[obsidian-shimeji] ${jumps.length} frame(s) jumped >60px:`, jumps);
				}
			};
			requestAnimationFrame(sample);
			console.info(`[obsidian-shimeji] watching mascot#0 for ${seconds}s...`);
		},

		// For chasing "why did it land/climb/spawn there" reports (pane-heavy layouts producing
		// unexpected floor/ceiling geometry) without needing a live debugger session — paste this
		// output straight into a bug report.
		dumpLedges() {
			const stage = getStage();
			if (!stage) {
				console.info("[obsidian-shimeji] no stage");
				return;
			}
			const ledges = stage.getLedges();
			console.info(`[obsidian-shimeji] ${ledges.length} ledges currently computed:`);
			for (const ledge of ledges) {
				if (ledge.kind === "wall") {
					console.info(
						`  wall   side=${ledge.side.padEnd(5)} x=${Math.round(ledge.x)}`.padEnd(38) +
							`y=[${Math.round(ledge.y1)}, ${Math.round(ledge.y2)}]  source=${ledge.source}`,
					);
				} else {
					console.info(
						`  ${ledge.kind.padEnd(7)}         y=${Math.round(ledge.y)}`.padEnd(38) +
							`x=[${Math.round(ledge.x1)}, ${Math.round(ledge.x2)}]  source=${ledge.source}`,
					);
				}
			}
		},
	};
	console.info(
		"[obsidian-shimeji] debug helpers ready in this console: window.shimejiDebug.stageCount() / .hideOverlay() / .showOverlay() / .elementsAtTop() / .mascotRects() / .dumpLedges() / .where() / .watch(5) / .setVerbose(true)",
	);
}

export function uninstallDebugApi(): void {
	delete window.shimejiDebug;
}
