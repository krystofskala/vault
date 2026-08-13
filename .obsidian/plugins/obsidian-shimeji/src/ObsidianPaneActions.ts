import { MarkdownView, WorkspaceWindow, type App, type WorkspaceItem, type WorkspaceLeaf, type WorkspaceParent, type WorkspaceSplit } from "obsidian";
import type { PaneActions, ThrownWindowHandle } from "./engine/PaneActions";
import type { PaneRef } from "./engine/types";

/**
 * The real (Obsidian-specific) implementation of PaneActions. Unlike everything else this
 * plugin ports, `resizeBy` leans on Obsidian internals that are *not* part of the public plugin
 * API (`obsidian.d.ts` has no resize/dimension surface on WorkspaceItem/WorkspaceSplit at all) —
 * confirmed working, not guessed, by reading the source of a real published plugin that does the
 * same thing (github.com/RyotaUshio/obsidian-resize-split): `WorkspaceItem.dimension`/
 * `.setDimension(percent)`, `WorkspaceSplit.getElSize(el)`, and `Workspace.requestResize()`.
 * These exist on the real runtime objects today but aren't guaranteed by any stability contract,
 * unlike every other API this plugin touches — if a future Obsidian release changes them,
 * resizing degrades to a no-op (the same graceful fallback as any other absent PaneActions
 * method), nothing else breaks.
 *
 * `beginThrow` is the one genuinely faithful piece: `Workspace.moveLeafToPopout` is a real,
 * documented, stable API, and Electron intentionally lets a renderer's own `window.moveTo()`
 * drive its native window (unlike a browser tab, which restricts this to script-opened popups) —
 * so this really does fling a separate OS window around, the same kind of action the original
 * engine performs, just reached through Obsidian's popout API instead of a JNA native bridge.
 * Desktop-only: moveLeafToPopout throws on mobile, caught below and treated as "unsupported."
 */

declare module "obsidian" {
	interface WorkspaceItem {
		containerEl: HTMLElement;
		dimension: number | null;
		setDimension(dimension: number | null): void;
	}
	interface WorkspaceParent {
		children: WorkspaceItem[];
	}
	interface WorkspaceSplit {
		getElSize(el: HTMLElement): number | undefined;
	}
	interface Workspace {
		requestResize(): void;
	}
}

const MIN_DIMENSION_PERCENT = 10;
const MAX_DIMENSION_PERCENT = 90;

export class ObsidianPaneActions implements PaneActions {
	constructor(private app: App) {}

	private resolveLeaf(pane: PaneRef): WorkspaceLeaf | undefined {
		if (!(pane instanceof HTMLElement)) return undefined;
		let found: WorkspaceLeaf | undefined;
		this.app.workspace.iterateAllLeaves((leaf) => {
			if (!found && leaf.containerEl === pane) found = leaf;
		});
		return found;
	}

	/** Walks up from `leaf` to the nearest ancestor WorkspaceSplit with more than one child
	 * (a split that can actually be resized against a sibling), returning that split plus
	 * whichever of its direct children leads down to `leaf` — either the leaf itself, or the
	 * WorkspaceTabs group it's currently one tab of. `getElSize` (only real Splits have it, not
	 * a WorkspaceTabs) is what distinguishes an actually-resizable ancestor from a tab group. */
	private findResizableAncestor(leaf: WorkspaceLeaf): { split: WorkspaceSplit; child: WorkspaceItem } | undefined {
		let child: WorkspaceItem = leaf;
		let parent: WorkspaceParent | undefined = leaf.parent;
		while (parent) {
			const asSplit = parent as WorkspaceSplit;
			if (typeof asSplit.getElSize === "function" && parent.children.length > 1) {
				return { split: asSplit, child };
			}
			child = parent;
			parent = parent.parent;
		}
		return undefined;
	}

	resizeBy(pane: PaneRef, deltaPx: number): void {
		try {
			const leaf = this.resolveLeaf(pane);
			if (!leaf) return;
			const found = this.findResizableAncestor(leaf);
			if (!found) return;
			const { split, child } = found;

			const index = split.children.indexOf(child);
			if (index < 0) return;
			// Prefer growing into the neighbor in the direction of travel; fall back to the only
			// neighbor available if there's just the one (a 2-child split, the common case).
			const neighborIndex = deltaPx >= 0 ? (index + 1 < split.children.length ? index + 1 : index - 1) : index - 1 >= 0 ? index - 1 : index + 1;
			const neighbor = split.children[neighborIndex];
			if (!neighbor) return;

			// getElSize/setDimension are already axis-transparent: a mod-vertical split (panes
			// side by side) measures/sets width, a mod-horizontal one (panes stacked) measures/
			// sets height, automatically — the same internal mechanism Obsidian's own resize-drag
			// handle uses regardless of the split's orientation, so there's no separate
			// left-right-vs-up-down branch to write here at all; whichever axis this particular
			// split resizes along is exactly the axis this already resizes.
			const childSize = split.getElSize(child.containerEl);
			const neighborSize = split.getElSize(neighbor.containerEl);
			if (typeof childSize !== "number" || typeof neighborSize !== "number" || childSize + neighborSize <= 0) return;

			const total = childSize + neighborSize;
			const clip = (v: number) => Math.max(Math.min(v, MAX_DIMENSION_PERCENT), MIN_DIMENSION_PERCENT);
			const currentChildPercent = (childSize / total) * 100;
			const newChildPercent = clip(currentChildPercent + (deltaPx / total) * 100);
			const newNeighborPercent = 100 - newChildPercent;

			child.setDimension(newChildPercent);
			neighbor.setDimension(newNeighborPercent);

			this.app.workspace.requestSaveLayout();
			this.app.workspace.requestResize();
		} catch (e) {
			console.warn("[obsidian-shimeji] pane resize failed, skipping", e);
		}
	}

	beginThrow(pane: PaneRef): ThrownWindowHandle | undefined {
		try {
			const leaf = this.resolveLeaf(pane);
			if (!leaf) return undefined;
			const rect = leaf.containerEl.getBoundingClientRect();
			const popout = this.app.workspace.moveLeafToPopout(leaf, {
				x: Math.round(window.screenX + rect.left),
				y: Math.round(window.screenY + rect.top),
			});
			const win = popout.win;
			return {
				moveTo: (x: number, y: number) => {
					try {
						win.moveTo(Math.round(x), Math.round(y));
					} catch {
						// Best-effort: some platforms/Electron versions may ignore or restrict this.
					}
				},
			};
		} catch (e) {
			// Expected on mobile (moveLeafToPopout throws outright) or an old Electron version —
			// not a real error, just "this platform doesn't support it."
			console.warn("[obsidian-shimeji] could not pop out a pane to throw, skipping", e);
			return undefined;
		}
	}

	openRandomNote(pane: PaneRef): void {
		try {
			const leaf = this.resolveLeaf(pane);
			if (!leaf) return;
			const files = this.app.vault.getMarkdownFiles();
			if (files.length === 0) return;
			const currentFile = leaf.view instanceof MarkdownView ? leaf.view.file : undefined;
			let candidate = files[Math.floor(Math.random() * files.length)];
			for (let attempt = 0; attempt < 3 && files.length > 1 && candidate === currentFile; attempt++) {
				candidate = files[Math.floor(Math.random() * files.length)];
			}
			void leaf.openFile(candidate);
		} catch (e) {
			console.warn("[obsidian-shimeji] could not swap in a random note, skipping", e);
		}
	}

	restoreThrown(): void {
		const seen = new Set<Window>();
		this.app.workspace.iterateAllLeaves((leaf) => {
			const container = leaf.getContainer();
			if (!(container instanceof WorkspaceWindow) || seen.has(container.win)) return;
			seen.add(container.win);
			try {
				container.win.moveTo(80, 80);
				container.win.focus();
			} catch (e) {
				console.warn("[obsidian-shimeji] could not restore a thrown window, skipping", e);
			}
		});
	}
}
