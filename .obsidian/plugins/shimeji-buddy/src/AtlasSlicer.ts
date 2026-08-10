import type { Vault } from "obsidian";
import type { AtlasFrameRect } from "./settings";
import { loadImageForSlicing } from "./spritePack";

const MAX_DISPLAY_WIDTH = 460;
const MAX_UPSCALE = 3;
const MIN_DRAG_PX = 2;

/**
 * A small canvas-based tool for marking out individual frame rectangles on a
 * sprite sheet by dragging a box - used for "modular" sheets whose frames
 * aren't laid out on a uniform grid, so row/column math doesn't apply.
 */
export class AtlasSlicer {
	private wrapperEl: HTMLElement;
	private canvas: HTMLCanvasElement;
	private ctx: CanvasRenderingContext2D;

	private image: HTMLImageElement | null = null;
	private objectUrl: string | null = null;
	private naturalWidth = 0;
	private naturalHeight = 0;
	private scale = 1;

	private selection: AtlasFrameRect | null = null;
	private dragStartCanvas: { x: number; y: number } | null = null;
	private dragMoved = false;

	private selectionListener: ((rect: AtlasFrameRect | null) => void) | null = null;

	private boundPointerUp = (e: PointerEvent) => this.onPointerUp(e);
	private boundPointerCancel = (e: PointerEvent) => this.onPointerCancel(e);

	constructor(parentEl: HTMLElement) {
		this.wrapperEl = parentEl.createDiv({ cls: "sm-slicer" });
		this.canvas = this.wrapperEl.createEl("canvas");
		const ctx = this.canvas.getContext("2d");
		if (!ctx) throw new Error("Shimeji Buddy: canvas 2D context unavailable");
		this.ctx = ctx;
		this.ctx.imageSmoothingEnabled = false;

		this.canvas.addEventListener("pointerdown", (e) => this.onPointerDown(e));
		this.canvas.addEventListener("pointermove", (e) => this.onPointerMove(e));
		window.addEventListener("pointerup", this.boundPointerUp);
		window.addEventListener("pointercancel", this.boundPointerCancel);

		this.showPlaceholder("No image loaded yet.");
	}

	onSelectionChange(cb: (rect: AtlasFrameRect | null) => void): void {
		this.selectionListener = cb;
	}

	/** The slicer's root DOM node, so a caller can re-attach it after moving/rebuilding its own container. */
	get rootEl(): HTMLElement {
		return this.wrapperEl;
	}

	async load(vault: Vault, imagePath: string): Promise<{ width: number; height: number } | null> {
		this.releaseImage();
		if (!imagePath) {
			this.showPlaceholder("No image loaded yet.");
			return null;
		}

		const loaded = await loadImageForSlicing(vault, imagePath);
		if (!loaded) {
			this.showPlaceholder(`Couldn't load "${imagePath}". Check the path is correct.`);
			return null;
		}

		const img = new Image();
		await new Promise<void>((resolve, reject) => {
			img.onload = () => resolve();
			img.onerror = () => reject(new Error("failed to decode"));
			img.src = loaded.url;
		});

		this.objectUrl = loaded.url;
		this.image = img;
		this.naturalWidth = loaded.width;
		this.naturalHeight = loaded.height;

		let scale = MAX_DISPLAY_WIDTH / this.naturalWidth;
		scale = Math.min(scale, MAX_UPSCALE);
		scale = Math.max(scale, 0.05);
		this.scale = scale;

		this.canvas.width = Math.max(1, Math.round(this.naturalWidth * scale));
		this.canvas.height = Math.max(1, Math.round(this.naturalHeight * scale));
		this.canvas.style.display = "";
		this.canvas.style.cursor = "crosshair";

		this.setSelection(null);
		this.redraw();

		return { width: this.naturalWidth, height: this.naturalHeight };
	}

	getSelection(): AtlasFrameRect | null {
		return this.selection;
	}

	/** The currently loaded image's real pixel size, or null if nothing's loaded. */
	getNaturalSize(): { width: number; height: number } | null {
		return this.image ? { width: this.naturalWidth, height: this.naturalHeight } : null;
	}

	/** Programmatically set (or clear) the selection box, e.g. from numeric input fields. */
	setSelection(rect: AtlasFrameRect | null): void {
		if (rect) {
			const x = Math.max(0, Math.min(rect.x, this.naturalWidth - 1));
			const y = Math.max(0, Math.min(rect.y, this.naturalHeight - 1));
			const w = Math.max(1, Math.min(rect.w, this.naturalWidth - x));
			const h = Math.max(1, Math.min(rect.h, this.naturalHeight - y));
			this.selection = { x, y, w, h };
		} else {
			this.selection = null;
		}
		this.redraw();
	}

	destroy(): void {
		window.removeEventListener("pointerup", this.boundPointerUp);
		window.removeEventListener("pointercancel", this.boundPointerCancel);
		this.releaseImage();
		this.wrapperEl.remove();
	}

	// ---------- internals ----------

	private releaseImage(): void {
		if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
		this.objectUrl = null;
		this.image = null;
	}

	private showPlaceholder(text: string): void {
		this.canvas.style.display = "none";
		this.wrapperEl.querySelector(".sm-slicer-placeholder")?.remove();
		this.wrapperEl.createDiv({ cls: "sm-slicer-placeholder", text });
	}

	private redraw(): void {
		if (!this.image) return;
		this.wrapperEl.querySelector(".sm-slicer-placeholder")?.remove();
		this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
		this.ctx.drawImage(this.image, 0, 0, this.canvas.width, this.canvas.height);

		if (this.selection) {
			const x = this.selection.x * this.scale;
			const y = this.selection.y * this.scale;
			const w = this.selection.w * this.scale;
			const h = this.selection.h * this.scale;
			this.ctx.fillStyle = "rgba(80, 160, 255, 0.25)";
			this.ctx.fillRect(x, y, w, h);
			this.ctx.strokeStyle = "#4fa8ff";
			this.ctx.lineWidth = 1.5;
			this.ctx.strokeRect(x + 0.75, y + 0.75, w - 1.5, h - 1.5);
		}
	}

	private canvasPoint(e: PointerEvent): { x: number; y: number } {
		const rect = this.canvas.getBoundingClientRect();
		return {
			x: Math.max(0, Math.min(e.clientX - rect.left, this.canvas.width)),
			y: Math.max(0, Math.min(e.clientY - rect.top, this.canvas.height)),
		};
	}

	private onPointerDown(e: PointerEvent): void {
		if (!this.image) return;
		// Stops touch from turning this drag into a page-scroll gesture.
		e.preventDefault();
		this.dragStartCanvas = this.canvasPoint(e);
		this.dragMoved = false;
		this.canvas.setPointerCapture(e.pointerId);
	}

	private onPointerMove(e: PointerEvent): void {
		if (!this.dragStartCanvas) return;
		const p = this.canvasPoint(e);
		const dx = p.x - this.dragStartCanvas.x;
		const dy = p.y - this.dragStartCanvas.y;
		if (Math.abs(dx) + Math.abs(dy) < MIN_DRAG_PX) return;
		this.dragMoved = true;

		const x0 = Math.min(this.dragStartCanvas.x, p.x);
		const y0 = Math.min(this.dragStartCanvas.y, p.y);
		const x1 = Math.max(this.dragStartCanvas.x, p.x);
		const y1 = Math.max(this.dragStartCanvas.y, p.y);

		this.selection = {
			x: Math.round(x0 / this.scale),
			y: Math.round(y0 / this.scale),
			w: Math.max(1, Math.round((x1 - x0) / this.scale)),
			h: Math.max(1, Math.round((y1 - y0) / this.scale)),
		};
		this.redraw();
	}

	private onPointerUp(_e: PointerEvent): void {
		if (!this.dragStartCanvas) return;
		this.dragStartCanvas = null;
		if (this.dragMoved && this.selection) {
			this.selectionListener?.(this.selection);
		}
	}

	/** A touch drag can be cancelled mid-gesture by the OS; abandon it without committing a selection. */
	private onPointerCancel(_e: PointerEvent): void {
		this.dragStartCanvas = null;
	}
}
