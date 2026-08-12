import type { LedgeSource, Rect } from "./types";

/**
 * Everything the engine needs to know about the host app's window that isn't pure physics —
 * viewport size and which DOM regions count as "platforms" (pane tops, status bar). Stage
 * depends on this interface, not on `window`/`document` directly, so the physics/behavior
 * core stays free of Obsidian-specific DOM knowledge and is injectable for tests.
 */
export interface Environment {
	getViewportSize(): { width: number; height: number };
	getPlatformRects(): Array<{ rect: Rect; source: LedgeSource }>;
}

/** The real implementation: reads the actual Obsidian window/DOM. */
export class ObsidianDomEnvironment implements Environment {
	getViewportSize(): { width: number; height: number } {
		return { width: window.innerWidth, height: window.innerHeight };
	}

	getPlatformRects(): Array<{ rect: Rect; source: LedgeSource }> {
		const platforms: Array<{ rect: Rect; source: LedgeSource }> = [];

		const leaves = document.querySelectorAll<HTMLElement>(".workspace-leaf");
		leaves.forEach((leaf) => {
			if (leaf.offsetParent === null) return;
			const r = leaf.getBoundingClientRect();
			if (r.width === 0 || r.height === 0) return;
			platforms.push({ rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom }, source: "pane" });
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
