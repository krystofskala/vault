import type { LedgeSource, PaneRef, Rect } from "./types";

/**
 * Everything the engine needs to know about the host app's window that isn't pure physics —
 * viewport size and which DOM regions count as "platforms" (pane tops, status bar). Stage
 * depends on this interface, not on `window`/`document` directly, so the physics/behavior
 * core stays free of Obsidian-specific DOM knowledge and is injectable for tests.
 */
export interface Environment {
	getViewportSize(): { width: number; height: number };
	/** Top of the usable/walkable area, in the same viewport-relative coordinates as everything
	 * else here — below any app-level chrome mascots' *autonomous* physics shouldn't reach
	 * (custom title bar, tab strip), not the literal top of the window. 0 when there's no such
	 * chrome (e.g. in tests). See ObsidianDomEnvironment's own implementation for why this needs
	 * to exist at all. */
	getWorldTop(): number;
	getPlatformRects(): Array<{ rect: Rect; source: LedgeSource; paneRef?: PaneRef }>;
}

/** The real implementation: reads the actual Obsidian window/DOM. */
export class ObsidianDomEnvironment implements Environment {
	/**
	 * Obsidian's own `Workspace` (structurally — just the one property this needs), when the
	 * caller has one to give it. Passing this is how main.ts gets `getWorldTop()` reading the
	 * real, documented `app.workspace.containerEl` instead of a guessed CSS selector — see
	 * getWorldTop() itself. Optional, with a selector-based fallback, purely so `new
	 * ObsidianDomEnvironment()` (Stage's own no-argument default) still degrades instead of
	 * throwing; real usage (main.ts) always provides it.
	 */
	constructor(private workspace?: { containerEl: HTMLElement }) {}

	getViewportSize(): { width: number; height: number } {
		return { width: window.innerWidth, height: window.innerHeight };
	}

	/**
	 * `window.innerHeight`'s y=0 is the literal top of the Electron viewport — which, whenever
	 * Obsidian's custom title bar is in play, is a strip of real app chrome (drag region, window
	 * controls, tab headers), not open space. Ledges.ts used to plant the world's "ceiling" and
	 * the top of its left/right walls right there, so a mascot climbing a wall (or ceiling-walking
	 * after — both entirely authentic shimeji-ee behavior) would ride straight up into that chrome
	 * and rest on top of it, rendered over it with pointer-events on for dragging. That's the
	 * mechanism behind two separate-looking reports: mascots visibly parking on/around the title
	 * bar, and the title bar becoming impossible to drag (the previously-unexplained open report
	 * in SOURCE_AUDIT.md — shimejiDebug.hideOverlay()/elementsAtTop() were built to chase exactly
	 * this without knowing yet what was causing it).
	 *
	 * `app.workspace.containerEl` (a real, documented public property, not a guessed class name)
	 * is a sibling of the custom `.titlebar` and the left icon ribbon under `.app-container`, not
	 * a descendant of either, so its own top edge already sits below both regardless of which
	 * chrome is actually present (native title bar, no title bar, ribbon hidden, ...) — no need
	 * to special-case any of that here. Falls back to the `.workspace` selector (what that same
	 * property points at) only when no workspace was actually injected.
	 */
	getWorldTop(): number {
		const containerEl = this.workspace?.containerEl ?? document.querySelector<HTMLElement>(".workspace");
		if (!containerEl) return 0;
		return Math.max(0, containerEl.getBoundingClientRect().top);
	}

	getPlatformRects(): Array<{ rect: Rect; source: LedgeSource; paneRef?: PaneRef }> {
		const platforms: Array<{ rect: Rect; source: LedgeSource; paneRef?: PaneRef }> = [];

		const leaves = document.querySelectorAll<HTMLElement>(".workspace-leaf");
		leaves.forEach((leaf) => {
			if (leaf.offsetParent === null) return;
			const r = leaf.getBoundingClientRect();
			if (r.width === 0 || r.height === 0) return;
			// `paneRef` is this leaf's own container element, opaque to everything except
			// PaneActions' real implementation (see engine/PaneActions.ts) — it's what lets a
			// mascot standing on this exact pane later resize/pop out/swap the note in *this*
			// pane specifically, not just read its geometry.
			platforms.push({ rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom }, source: "pane", paneRef: leaf });
		});

		const statusBar = document.querySelector<HTMLElement>(".status-bar");
		if (statusBar && statusBar.offsetParent !== null) {
			const r = statusBar.getBoundingClientRect();
			if (r.width > 0 && r.height > 0) {
				platforms.push({ rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom }, source: "statusbar" });
			}
		}

		return platforms;
	}
}
