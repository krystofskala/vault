import { ItemView, type WorkspaceLeaf } from "obsidian";
import type { Rect } from "../engine/types";
import { layoutRoom, shouldMirror, type RoomLayout } from "./RoomGeometry";
import { moodForHour, paintRoom, ROOM_BACKDROP, ROOM_BACKDROP_DUSK } from "./roomArt";
import { LIVING_ROOM } from "./roomDef";

export const ROOM_VIEW_TYPE = "shimeji-plant-room";

/**
 * The sidebar pane the room lives in.
 *
 * It draws the room and nothing else — it does not own the resident, does not know a mascot exists,
 * and never moves one. Mascots are drawn on the stage's own full-window overlay, which sits above
 * the workspace, so the resident appears inside this pane without this pane having to host it. That
 * separation is what lets the mascot walk from the workspace into the room as one continuous motion
 * in one coordinate space, instead of being handed between two renderers at the threshold.
 */
export class RoomView extends ItemView {
	private canvas!: HTMLCanvasElement;
	private stack!: HTMLDivElement;
	private lastKey = "";
	private resizeObserver?: ResizeObserver;

	constructor(leaf: WorkspaceLeaf, private onLayoutChanged: () => void) {
		super(leaf);
	}

	getViewType(): string {
		return ROOM_VIEW_TYPE;
	}

	getDisplayText(): string {
		return "Plant room";
	}

	getIcon(): string {
		return "sprout";
	}

	async onOpen(): Promise<void> {
		const content = this.contentEl;
		content.empty();
		content.addClass("shimeji-room-pane");
		this.stack = content.createDiv({ cls: "shimeji-room-stack" });
		this.canvas = this.stack.createEl("canvas", { cls: "shimeji-room-canvas" });
		this.canvas.setAttr("role", "img");
		this.canvas.setAttr("aria-label", "A pixel-art living room full of plants, where a shimeji can live.");

		// The pane is resized by dragging the sidebar's edge, which fires no workspace event — only
		// the element itself knows. Without this the room would keep its old scale until something
		// else happened to trigger a redraw.
		if (typeof ResizeObserver !== "undefined") {
			this.resizeObserver = new ResizeObserver(() => this.refresh());
			this.resizeObserver.observe(content);
		}
		this.refresh();
	}

	async onClose(): Promise<void> {
		this.resizeObserver?.disconnect();
		this.resizeObserver = undefined;
	}

	/** The area the room is drawn into, in viewport coordinates. Undefined when the pane is not on
	 * screen — collapsed sidebar, another tab showing in the same slot, or not open at all. */
	private contentRect(): Rect | undefined {
		const el = this.contentEl;
		if (!el || el.offsetParent === null) return undefined;
		const r = el.getBoundingClientRect();
		if (r.width <= 0 || r.height <= 0) return undefined;
		return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
	}

	/**
	 * Where the room currently is, or undefined when it is not on screen — the pane closed, the
	 * sidebar collapsed, or another tab showing in the same slot. The residency controller reads
	 * this every frame and treats undefined as "the resident is home, out of view".
	 */
	layout(): RoomLayout | undefined {
		const rect = this.contentRect();
		if (!rect) return undefined;
		return layoutRoom(LIVING_ROOM, rect, window.innerWidth);
	}

	/** Redraws only when something that affects the picture has actually changed — this is called
	 * from a ResizeObserver and from workspace events, both of which fire far more often than the
	 * room changes. */
	refresh(): void {
		// onOpen may not have run yet when a workspace event arrives during restore.
		if (!this.canvas) return;
		const rect = this.contentRect();
		if (!rect) return;
		const mood = moodForHour(new Date().getHours());
		const layout = layoutRoom(LIVING_ROOM, rect, window.innerWidth);
		if (!layout) return;
		const key = `${layout.scale}|${layout.mirrored}|${mood.dusk}`;
		const moved = `${Math.round(rect.left)}|${Math.round(rect.top)}|${Math.round(rect.right)}|${Math.round(rect.bottom)}`;
		if (key !== this.lastKey) {
			this.lastKey = key;
			paintRoom(this.canvas, LIVING_ROOM, mood, { scale: layout.scale, mirrored: layout.mirrored });
			this.contentEl.style.backgroundColor = mood.dusk ? ROOM_BACKDROP_DUSK : ROOM_BACKDROP;
		}
		if (moved !== this.lastMoved) {
			this.lastMoved = moved;
			// Position is what the resident's ledges are derived from, so a move matters even when
			// the picture is unchanged.
			this.onLayoutChanged();
		}
	}

	private lastMoved = "";

	/** Which way the room faces right now, for the settings screen and tests. */
	mirrored(): boolean {
		const rect = this.contentRect();
		return rect ? shouldMirror(rect, window.innerWidth) : false;
	}
}
