import { ItemView, type WorkspaceLeaf } from "obsidian";
import type { Rect } from "../engine/types";
import { layoutRoom, shouldMirror, type RoomLayout } from "./RoomGeometry";
import { drawRoomImage, drawSurfaceOverlay, moodForHour, paintRoom, ROOM_BACKDROP, ROOM_BACKDROP_DUSK, sampleBackdrop } from "./roomArt";
import { LIVING_ROOM, type RoomDef } from "./roomDef";
import { roomImageCandidates, type RoomStyle } from "./rooms";

export const ROOM_VIEW_TYPE = "shimeji-plant-room";

export interface RoomViewOptions {
	/** Which room to show. */
	style(): RoomStyle;
	/**
	 * Resolves the chosen room's artwork to something an <img> can load, or undefined when there is
	 * no such file. Asynchronous because it has to *check* — handing an <img> a path that is not
	 * there produces a red ERR_FILE_NOT_FOUND in the console, which reads as a broken plugin rather
	 * than "you have not put the picture in yet".
	 */
	imageSrc(style: RoomStyle): Promise<string | undefined>;
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
	private missing!: HTMLDivElement;
	private lastKey = "";
	private lastMoved = "";
	private resizeObserver?: ResizeObserver;
	private image?: HTMLImageElement;
	private imageState: "none" | "loading" | "ready" | "failed" = "none";
	private backdrop?: string;
	private loadedStyleId?: string;

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

	/** The chosen room when its artwork is available, the painted one when it is not. Falling back
	 * rather than showing an empty pane means the feature works before any file is dropped in, and
	 * the geometry always follows whichever room is actually on screen — a mismatch there would put
	 * the resident on furniture that is not in the picture. */
	get def(): RoomDef {
		const style = this.opts.style();
		if (!style.imageBase) return style.def;
		return this.imageState === "ready" ? style.def : LIVING_ROOM;
	}

	async onOpen(): Promise<void> {
		const content = this.contentEl;
		content.empty();
		content.addClass("shimeji-room-pane");
		this.stack = content.createDiv({ cls: "shimeji-room-stack" });
		this.canvas = this.stack.createEl("canvas", { cls: "shimeji-room-canvas" });
		this.canvas.setAttr("role", "img");
		this.canvas.setAttr("aria-label", "The room a shimeji can live in.");
		// Shown only when the chosen room expects a picture and has not got one. Falling back
		// silently is what makes "I only see your original image" a mystery — the pane looks like it
		// is working, and nothing anywhere says a file was expected or where it should go.
		this.missing = content.createDiv({ cls: "shimeji-room-missing" });
		this.missing.hide();

		void this.loadImage();

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

	/** Reloads the artwork — after it is added, replaced, or the chosen room changed. */
	async loadImage(): Promise<void> {
		const style = this.opts.style();
		this.loadedStyleId = style.id;
		if (!style.imageBase) {
			this.image = undefined;
			this.imageState = "none";
			this.invalidate();
			this.refresh();
			return;
		}
		const src = await this.opts.imageSrc(style);
		// The chosen room may have changed while the file was being looked up.
		if (this.loadedStyleId !== style.id) return;
		if (!src) {
			this.image = undefined;
			this.imageState = "none";
			this.invalidate();
			this.refresh();
			this.opts.onLayoutChanged();
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
			console.warn(`[obsidian-shimeji] the room artwork at ${style.imageBase} could not be decoded — falling back to the painted room`);
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
		const style = this.opts.style();
		if (!style.imageBase) return `${style.label} — drawn by the plugin, no file needed`;
		switch (this.imageState) {
			case "ready":
				return `${style.label}: loaded (${this.image?.naturalWidth ?? 0}x${this.image?.naturalHeight ?? 0})`;
			case "loading":
				return `${style.label}: still loading`;
			case "failed":
				return `${style.label}: the file exists but could not be decoded`;
			default:
				return `${style.label}: no file found — looked for ${roomImageCandidates(style).join(", ")}`;
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
		const key = `${this.opts.style().id}|${def.background ?? "painted"}|${layout.scale}|${layout.mirrored}|${mood.dusk}|${surfaces}`;
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

		this.renderMissingNotice();

		if (moved !== this.lastMoved) {
			this.lastMoved = moved;
			// Position is what the resident's ledges are derived from, so a move matters even when
			// the picture is unchanged.
			this.opts.onLayoutChanged();
		}
	}

	/** Says which file the chosen room is waiting for, when it has not got one. */
	private renderMissingNotice(): void {
		const style = this.opts.style();
		const wanted = style.imageBase !== undefined && this.imageState !== "ready";
		if (!wanted) {
			this.missing.hide();
			return;
		}
		this.missing.empty();
		this.missing.show();
		if (this.imageState === "loading") {
			this.missing.createDiv({ text: `Loading the ${style.label.toLowerCase()}…` });
			return;
		}
		if (this.imageState === "failed") {
			this.missing.createDiv({ cls: "shimeji-room-missing-title", text: `The ${style.label} picture could not be read.` });
			this.missing.createDiv({ text: "It may not be a valid image file. Replace it and run \u201cReload the plant room artwork\u201d." });
			return;
		}
		this.missing.createDiv({ cls: "shimeji-room-missing-title", text: `No picture yet for the ${style.label}.` });
		this.missing.createDiv({ text: "Save it in the plugin\u2019s folder as:" });
		this.missing.createEl("code", { text: `${style.imageBase}.png` });
		this.missing.createDiv({ cls: "shimeji-room-missing-note", text: ".webp, .jpg and .gif work too. Then run \u201cReload the plant room artwork\u201d." });
	}

	/** Which way the room faces right now, for the settings screen and tests. */
	mirrored(): boolean {
		const rect = this.contentRect();
		return rect ? shouldMirror(rect, window.innerWidth) : false;
	}
}
