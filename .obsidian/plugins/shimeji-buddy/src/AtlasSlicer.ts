import type { Vault } from "obsidian";
import type { AtlasFrameRect } from "./settings";
import { loadImageForSlicing } from "./spritePack";

const MAX_DISPLAY_WIDTH = 640;
// Small pixel-art sheets (16x16, 32x32...) need heavy magnification just to
// be clickable at all - a 16px-wide image at the old 3x cap was a 48px
// canvas, far too small to drag a meaningful selection on.
const MIN_DISPLAY_WIDTH = 320;
const MAX_UPSCALE = 24;
const MIN_DRAG_PX = 2;

/**
 * A small canvas-based tool for marking out frame rectangles on a sprite
 * sheet, two ways: dragging a freeform box (for "modular" sheets whose
 * frames aren't on a uniform grid) or, once a column/row count is set,
 * clicking cells of an overlaid grid - click order becomes frame order, so
 * a whole animation can be picked out in a few clicks on a uniform sheet.
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

	/** 0 = grid mode off (freeform drag-select instead). */
	private gridCols = 0;
	private gridRows = 0;
	/** Cell indices (row * gridCols + col), in click order - that order becomes frame order. */
	private selectedCells: number[] = [];

	private selectionListener: ((rect: AtlasFrameRect | null) => void) | null = null;
	private cellSelectionListener: ((count: number) => void) | null = null;

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

	onCellSelectionChange(cb: (count: number) => void): void {
		this.cellSelectionListener = cb;
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

		let scale = Math.min(MAX_DISPLAY_WIDTH / this.naturalWidth, MAX_UPSCALE);
		if (this.naturalWidth * scale < MIN_DISPLAY_WIDTH) {
			scale = Math.min(MAX_UPSCALE, MIN_DISPLAY_WIDTH / this.naturalWidth);
		}
		scale = Math.max(scale, 0.05);
		this.scale = scale;

		this.canvas.width = Math.max(1, Math.round(this.naturalWidth * scale));
		this.canvas.height = Math.max(1, Math.round(this.naturalHeight * scale));
		this.canvas.style.display = "";
		this.canvas.style.cursor = "crosshair";

		this.gridCols = 0;
		this.gridRows = 0;
		this.selectedCells = [];
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

	/** Turns on grid-pick mode: an evenly-spaced cols x rows grid is overlaid, and clicking cells (in any order) picks them out as frames, in click order. Pass 0 for either to turn it back off (freeform drag-select). */
	setGrid(cols: number, rows: number): void {
		this.gridCols = Math.max(0, Math.floor(cols));
		this.gridRows = Math.max(0, Math.floor(rows));
		this.selectedCells = [];
		this.setSelection(null);
		this.notifyCellSelection();
		this.redraw();
	}

	isGridMode(): boolean {
		return this.gridCols > 0 && this.gridRows > 0;
	}

	clearCellSelection(): void {
		this.selectedCells = [];
		this.notifyCellSelection();
		this.redraw();
	}

	/** Selected grid cells' rects, in the order they were clicked - that order becomes the animation's frame order. */
	getSelectedCellRects(): AtlasFrameRect[] {
		if (!this.isGridMode() || !this.image) return [];
		const cellW = this.naturalWidth / this.gridCols;
		const cellH = this.naturalHeight / this.gridRows;
		return this.selectedCells.map((i) => {
			const col = i % this.gridCols;
			const row = Math.floor(i / this.gridCols);
			return {
				x: Math.round(col * cellW),
				y: Math.round(row * cellH),
				w: Math.max(1, Math.round(cellW)),
				h: Math.max(1, Math.round(cellH)),
			};
		});
	}

	private notifyCellSelection(): void {
		this.cellSelectionListener?.(this.selectedCells.length);
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

		if (this.isGridMode()) {
			this.drawGrid();
			return;
		}

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

	private drawGrid(): void {
		const cellW = this.canvas.width / this.gridCols;
		const cellH = this.canvas.height / this.gridRows;

		// Highlighted, numbered fills for already-picked cells - the number is
		// the frame order they'll be added to the animation in.
		this.ctx.font = `bold ${Math.max(10, Math.min(cellW, cellH) * 0.4)}px sans-serif`;
		this.ctx.textAlign = "center";
		this.ctx.textBaseline = "middle";
		this.selectedCells.forEach((cellIndex, order) => {
			const col = cellIndex % this.gridCols;
			const row = Math.floor(cellIndex / this.gridCols);
			const x = col * cellW;
			const y = row * cellH;
			this.ctx.fillStyle = "rgba(80, 160, 255, 0.35)";
			this.ctx.fillRect(x, y, cellW, cellH);
			this.ctx.fillStyle = "#ffffff";
			this.ctx.strokeStyle = "rgba(0, 0, 0, 0.6)";
			this.ctx.lineWidth = 3;
			this.ctx.strokeText(String(order + 1), x + cellW / 2, y + cellH / 2);
			this.ctx.fillText(String(order + 1), x + cellW / 2, y + cellH / 2);
		});

		// Grid lines on top.
		this.ctx.strokeStyle = "rgba(79, 168, 255, 0.7)";
		this.ctx.lineWidth = 1;
		this.ctx.beginPath();
		for (let c = 0; c <= this.gridCols; c++) {
			const x = Math.round(c * cellW) + 0.5;
			this.ctx.moveTo(x, 0);
			this.ctx.lineTo(x, this.canvas.height);
		}
		for (let r = 0; r <= this.gridRows; r++) {
			const y = Math.round(r * cellH) + 0.5;
			this.ctx.moveTo(0, y);
			this.ctx.lineTo(this.canvas.width, y);
		}
		this.ctx.stroke();
	}

	private cellAt(p: { x: number; y: number }): number {
		const cellW = this.canvas.width / this.gridCols;
		const cellH = this.canvas.height / this.gridRows;
		const col = Math.min(this.gridCols - 1, Math.max(0, Math.floor(p.x / cellW)));
		const row = Math.min(this.gridRows - 1, Math.max(0, Math.floor(p.y / cellH)));
		return row * this.gridCols + col;
	}

	private toggleCell(cellIndex: number): void {
		const at = this.selectedCells.indexOf(cellIndex);
		if (at >= 0) this.selectedCells.splice(at, 1);
		else this.selectedCells.push(cellIndex);
		this.notifyCellSelection();
		this.redraw();
	}

	/**
	 * Maps a pointer event to canvas-internal pixel coordinates. Goes through
	 * the displayed-vs-internal-size ratio rather than assuming they match
	 * 1:1 - if the canvas is ever rendered smaller than its pixel resolution
	 * (e.g. a global `canvas { max-width: 100% }` rule from the host app),
	 * clicks would otherwise land on the wrong spot entirely.
	 */
	private canvasPoint(e: PointerEvent): { x: number; y: number } {
		const rect = this.canvas.getBoundingClientRect();
		const scaleX = rect.width > 0 ? this.canvas.width / rect.width : 1;
		const scaleY = rect.height > 0 ? this.canvas.height / rect.height : 1;
		return {
			x: Math.max(0, Math.min((e.clientX - rect.left) * scaleX, this.canvas.width)),
			y: Math.max(0, Math.min((e.clientY - rect.top) * scaleY, this.canvas.height)),
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
		if (!this.dragStartCanvas || this.isGridMode()) return;
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

	private onPointerUp(e: PointerEvent): void {
		if (!this.dragStartCanvas) return;
		if (this.isGridMode()) {
			this.toggleCell(this.cellAt(this.canvasPoint(e)));
		} else if (this.dragMoved && this.selection) {
			this.selectionListener?.(this.selection);
		}
		this.dragStartCanvas = null;
	}

	/** A touch drag can be cancelled mid-gesture by the OS; abandon it without committing a selection. */
	private onPointerCancel(_e: PointerEvent): void {
		this.dragStartCanvas = null;
	}
}
