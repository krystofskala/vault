import type { PaneRef, Vec2 } from "./types";

/**
 * The real, mutating counterpart to Environment's read-only pane geometry — everything a mascot
 * can actually *do* to an Obsidian pane, standing in for the original engine's OS-level window
 * manipulation (NativeFactory's tracked-window moving/throwing/restoring). Optional end to end:
 * an absent PaneActions, or an absent individual method on it, just means that specific real-pack
 * behavior (WalkWithIE/RunWithIE/ThrowIE) falls back to its already-correct inert mapping (plain
 * Move/hold) instead — see ActionRunner's embeddedName dispatch.
 *
 * `resizeBy` is a deliberate reinterpretation, not a literal port: shimeji-ee has no resize
 * concept at all (windows just move), but Obsidian panes can't be freely repositioned the way a
 * real OS window can — they live in a split/tab tree. Resizing is what "carrying" a pane along
 * while walking can actually *mean* here. `beginThrow` is the literal one: popping a pane into
 * its own real OS window and then actually moving that window is the same kind of action the
 * original performs, just reached through Obsidian's own popout-window API instead of a native
 * bridge.
 */
/**
 * Which dimension a resize is allowed to change. A pane only resizes along its own split's axis —
 * side-by-side siblings resize width, stacked ones resize height — so an action with a specific
 * physical intent has to be able to say which it meant. "Squash the pane I'm standing on" is only
 * meaningful against a stacked split; run unconstrained on a side-by-side one it would silently
 * change the pane's *width* instead, which looks like a bug rather than a mascot.
 */
export type ResizeAxis = "width" | "height";

export type SidebarMode = "collapse" | "expand" | "toggle";

export interface PaneActions {
	/** Real WalkWithIE/RunWithIE (the "carry it along while walking" phase before a throw):
	 * change this pane's size by deltaPx, growing in the direction the mascot is currently
	 * walking. Which axis that actually resizes (width vs height) is decided by the pane's own
	 * real split orientation, not by which action fired — a pane living in a side-by-side split
	 * resizes left/right, one in a stacked split resizes up/down. Uses Obsidian's own
	 * WorkspaceItem.setDimension()-equivalent internals, which aren't part of the public plugin
	 * API — see the implementation's own comment for the real precedent this is based on.
	 *
	 * `axis`, when given, makes the call a no-op unless the pane's own split actually resizes along
	 * that dimension — see ResizeAxis. Omitted (the WalkWithIE case) means "whichever axis this
	 * pane resizes along", the original behaviour. Returns whether anything actually changed, so a
	 * caller can tell "not applicable here" from "done". */
	resizeBy?(pane: PaneRef, deltaPx: number, axis?: ResizeAxis): boolean;

	/** Invented, with no counterpart in shimeji-ee at all: collapse/expand the sidebar `pane` lives
	 * in. Obsidian's sidebars are the one part of its layout that has a real open/shut state, which
	 * makes them the closest thing here to the original's "this window can be minimised". Unlike
	 * resizeBy this uses only documented API (`WorkspaceSidedock.collapse/expand/toggle`). Returns
	 * false when the pane isn't in a sidebar at all, so a behaviour can fire harmlessly anywhere. */
	setSidebar?(pane: PaneRef, mode: SidebarMode): boolean;

	/** Real ThrowIE: pop this pane into its own OS window (if not already popped this throw) and
	 * return a handle for the caller to drive with per-tick position updates using the same
	 * ballistic math as the real class (see ActionRunner's ThrowIE handling). Returns undefined
	 * if popouts aren't supported on this platform (mobile) or the pop itself failed. */
	beginThrow?(pane: PaneRef): ThrownWindowHandle | undefined;

	/** The invented "mischief" feature — shimeji-ee has no vault/note awareness at all, so
	 * there's no real behavior this ports. Swaps whatever note is showing in `pane` for a
	 * randomly chosen other note in the vault. */
	openRandomNote?(pane: PaneRef): void;

	/**
	 * **Invented, and the most invasive thing in this interface**: reshape the layout so that a
	 * walkable surface exists at `point`, by splitting whichever pane contains it and then sliding the
	 * resulting boundary onto that exact coordinate.
	 *
	 * This is what makes "go to that spot" answerable for *any* spot. A pointer hovering in the middle
	 * of the editor is not somewhere a mascot can stand — but a pane divider is, and one can be put
	 * there. It is the logical end of treating Obsidian's layout as the mascot's terrain rather than
	 * its backdrop: if the terrain doesn't reach, the mascot changes the terrain.
	 *
	 * Returns the pane it created, so the caller can offer to close it again. Returns undefined when
	 * the point isn't inside any pane, when splitting failed, or when the layout is already close
	 * enough that no surgery is warranted.
	 */
	makeSurfaceAt?(point: Vec2): PaneRef | undefined;

	/** Closes a pane — only ever used to tidy up ones `makeSurfaceAt` created. */
	closePane?(pane: PaneRef): void;

	/** Real Main.java's "Restore IE!" tray item (`NativeFactory.getInstance().getEnvironment().
	 * restoreIE()`) — brings back every real OS window a mascot has popped out and thrown,
	 * regardless of which mascot or action did it or whether that action has since ended.
	 * Exposed as a command/menu item rather than tied to any one mascot's frame, matching how
	 * the real menu item works (a standing recovery action, not part of any behavior). */
	restoreThrown?(): void;
}

export interface ThrownWindowHandle {
	moveTo(x: number, y: number): void;
}
