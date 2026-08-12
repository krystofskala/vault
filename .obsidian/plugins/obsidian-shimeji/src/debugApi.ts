import { setVerboseLogging } from "./engine/debugLog";
import type { Stage } from "./engine/Stage";

export interface ShimejiDebugApi {
	setVerbose(on: boolean): void;
	stageCount(): number;
	hideOverlay(): void;
	showOverlay(): void;
	elementsAtTop(y?: number): void;
	mascotRects(): void;
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
	};
	console.info(
		"[obsidian-shimeji] debug helpers ready in this console: window.shimejiDebug.stageCount() / .hideOverlay() / .showOverlay() / .elementsAtTop() / .mascotRects() / .setVerbose(true)",
	);
}

export function uninstallDebugApi(): void {
	delete window.shimejiDebug;
}
