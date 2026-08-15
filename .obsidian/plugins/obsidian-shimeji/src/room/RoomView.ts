import { ItemView, type WorkspaceLeaf } from "obsidian";
import type { Rect } from "../engine/types";
import { APARTMENT } from "./apartment";
import { layoutRoom, shouldMirror, type RoomLayout } from "./RoomGeometry";
import { drawRoomImage, drawSurfaceOverlay, moodForHour, paintRoom, ROOM_BACKDROP, ROOM_BACKDROP_DUSK, sampleBackdrop } from "./roomArt";
import { LIVING_ROOM, type RoomDef } from "./roomDef";

export const ROOM_VIEW_TYPE = "shimeji-plant-room";

/** Where the artwork is looked for, relative to the plugin's own folder. Dropping a file at a fixed
 * path is the whole setup — no import step, no settings to find first. */
export const ROOM_IMAGE_FILE = "room/room.png";

export interface RoomViewOptions {
	/** Resolves the room artwork to something an <img> can load, or undefined if there is none. */
	imageSrc(): string | undefined;
	/** Redraw-worthy changes to the room's position, for the residency controller. */
	onLayoutChanged(): void;
	/** Whether to draw the collision surfaces over the room. */
	showSurfaces(): boolean;
}

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
	private lastMoved = "";
	private resizeObserver?: ResizeObserver;
	private image?: HTMLImageElement;
	private imageState: "none" | "loading" | "ready" | "failed" = "none";
	private backdrop?: string;

	constructor(leaf: WorkspaceLeaf, private opts: RoomViewOptions) {
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

	/** The apartment when its artwork is available, the painted room when it is not. Falling back
	 * rather than showing an empty pane means the feature works before any file is dropped in, and
	 * the geometry follows whichever room is actually on screen. */
	get def(): RoomDef {
		return this.imageState === "ready" ? APARTMENT : LIVING_ROOM;
	}

	async onOpen(): Promise<void> {
		const content = this.contentEl;
		content.empty();
		content.addClass("shimeji-room-pane");
		this.stack = content.createDiv({ cls: "shimeji-room-stack" });
		this.canvas = this.stack.createEl("canvas", { cls: "shimeji-room-canvas" });
		this.canvas.setAttr("role", "img");
		this.canvas.setAttr("aria-label", "The room a shimeji can live in.");

		this.loadImage();

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

	/** Reloads the artwork — after it is added, replaced, or its path changed. */
	loadImage(): void {
		const src = this.opts.imageSrc();
		if (!src) {
			this.imageState = "none";
			this.invalidate();
			return;
		}
		const img = new Image();
		this.image = img;
		this.imageState = "loading";
		img.onload = () => {
			// A later load may have superseded this one while it was in flight.
			if (this.image !== img) return;
			this.imageState = "ready";
			this.backdrop = sampleBackdrop(img);
			this.invalidate();
			this.refresh();
			// The room's whole coordinate space changes with the artwork, so the resident's ledges
			// have to be rebuilt rather than left pointing at the painted room's furniture.
			this.opts.onLayoutChanged();
		};
		img.onerror = () => {
			if (this.image !== img) return;
			this.imageState = "failed";
			console.warn(`[obsidian-shimeji] could not load the room artwork from ${src} — falling back to the painted room`);
			this.invalidate();
			this.refresh();
			this.opts.onLayoutChanged();
		};
		img.src = src;
	}

	/** Forces the next refresh to redraw, whatever it thinks has changed. */
	invalidate(): void {
		this.lastKey = "";
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
		return layoutRoom(this.def, rect, window.innerWidth);
	}

	/** What shimejiDebug.room() reports about the artwork. */
	get artworkState(): string {
		switch (this.imageState) {
			case "ready":
				return `loaded (${this.image?.naturalWidth ?? 0}x${this.image?.naturalHeight ?? 0})`;
			case "loading":
				return "still loading";
			case "failed":
				return "found but could not be decoded";
			default:
				return `no file at ${ROOM_IMAGE_FILE} — showing the painted room`;
		}
	}

	/** Redraws only when something that affects the picture has actually changed — this is called
	 * from a ResizeObserver and from workspace events, both of which fire far more often than the
	 * room changes. */
	refresh(): void {
		// onOpen may not have run yet when a workspace event arrives during restore.
		if (!this.canvas) return;
		const rect = this.contentRect();
		if (!rect) return;
		const def = this.def;
		const mood = moodForHour(new Date().getHours());
		const layout = layoutRoom(def, rect, window.innerWidth);
		if (!layout) return;
		const surfaces = this.opts.showSurfaces();
		const key = `${def.background ?? "painted"}|${layout.scale}|${layout.mirrored}|${mood.dusk}|${surfaces}`;
		const moved = `${Math.round(rect.left)}|${Math.round(rect.top)}|${Math.round(rect.right)}|${Math.round(rect.bottom)}`;

		if (key !== this.lastKey) {
			this.lastKey = key;
			if (def.background === "image" && this.image) {
				drawRoomImage(this.canvas, this.image, def, { scale: layout.scale });
				// Sampled from the artwork's own corner, so the pane and the picture are the same
				// shade by construction and the surround has no visible seam.
				this.contentEl.style.backgroundColor = this.backdrop ?? "#121a1a";
			} else {
				paintRoom(this.canvas, def, mood, { scale: layout.scale, mirrored: layout.mirrored });
				this.contentEl.style.backgroundColor = mood.dusk ? ROOM_BACKDROP_DUSK : ROOM_BACKDROP;
			}
			if (surfaces) drawSurfaceOverlay(this.canvas, def, { scale: layout.scale, mirrored: layout.mirrored });
		}

		if (moved !== this.lastMoved) {
			this.lastMoved = moved;
			// Position is what the resident's ledges are derived from, so a move matters even when
			// the picture is unchanged.
			this.opts.onLayoutChanged();
		}
	}

	/** Which way the room faces right now, for the settings screen and tests. */
	mirrored(): boolean {
		const rect = this.contentRect();
		return rect ? shouldMirror(rect, window.innerWidth) : false;
	}
}
