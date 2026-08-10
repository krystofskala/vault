import type { Vault } from "obsidian";
import type { AtlasFrameRect } from "./settings";
import { loadImageForSlicing } from "./spritePack";

const MAX_DISPLAY_WIDTH = 640;
// Small pixel-art sheets (16x16, 32x32...) need heavy magnification just to
// be clickable at all - a 16px-wide image at the old 3x cap was a 48px
// canvas, far too small to work with.
const MIN_DISPLAY_WIDTH = 320;
const MAX_UPSCALE = 24;

const LINE_HOVER_TOLERANCE_PX = 8; // canvas px, how close the pointer must be to a line to grab it
const LINE_DRAG_THRESHOLD_PX = 3; // canvas px of movement before a right-click-hold counts as a drag, not a delete
const LINE_SNAP_TOLERANCE_PX = 6; // canvas px, snapping a dragged line to match another cell's width
const MIN_CELL_SIZE_PX = 4; // natural px, a dragged line can't shrink a cell smaller than this

type LineRef = { axis: "col" | "row"; index: number };

/**
 * A canvas-based tool for marking out an animation's frames on a sprite
 * sheet with an adjustable grid: start from an even cols x rows split (with
 * optional padding between cells), then drag any interior line to resize
 * its neighboring cells, or right-click a line to delete it (merging the
 * two cells it separated) - for sheets where frames aren't quite uniform.
 * Left-click a cell to toggle it into the current selection (shown as a
 * numbered blue overlay, numbered in click order - that order becomes the
 * animation's frame order); click again to remove it.
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

	/** Ascending, in source-image pixels; boundaries[0] = 0 and boundaries[last] = naturalWidth/Height always. */
	private colBoundaries: number[] = [];
	private rowBoundaries: number[] = [];
	/** Padding subtracted from the end of every cell, in source-image pixels - e.g. a sheet exported with a gutter around each frame. */
	private gapX = 0;
	private gapY = 0;

	/** Cell indices (row * cols + col), in click order - that order becomes frame order. */
	private selectedCells: number[] = [];
	private cellSelectionListener: ((count: number) => void) | null = null;

	private hoveredLine: LineRef | null = null;
	private draggingLine: (LineRef & { startCanvasPos: number }) | null = null;
	private leftDownCell: number | null = null;

	constructor(parentEl: HTMLElement) {
		this.wrapperEl = parentEl.createDiv({ cls: "sm-slicer" });
		this.canvas = this.wrapperEl.createEl("canvas");
		const ctx = this.canvas.getContext("2d");
		if (!ctx) throw new Error("Shimeji Buddy: canvas 2D context unavailable");
		this.ctx = ctx;
		this.ctx.imageSmoothingEnabled = false;

		// pointerup/pointercancel are registered on the canvas itself (not
		// window) to match setPointerCapture() below - once a pointer is
		// captured, the browser guarantees delivery to the capturing
		// element directly, without depending on the event bubbling all the
		// way up through Obsidian's own modal/app DOM (which could
		// intercept it first).
		this.canvas.addEventListener("pointerdown", (e) => this.onPointerDown(e));
		this.canvas.addEventListener("pointermove", (e) => this.onPointerMove(e));
		this.canvas.addEventListener("pointerup", (e) => this.onPointerUp(e));
		this.canvas.addEventListener("pointercancel", () => this.onPointerCancel());
		this.canvas.addEventListener("pointerleave", () => this.onPointerLeave());
		this.canvas.addEventListener("contextmenu", (e) => e.preventDefault());

		this.showPlaceholder("No image loaded yet.");
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

		this.colBoundaries = [];
		this.rowBoundaries = [];
		this.selectedCells = [];
		this.hoveredLine = null;
		this.draggingLine = null;
		this.redraw();

		return { width: this.naturalWidth, height: this.naturalHeight };
	}

	/** The currently loaded image's real pixel size, or null if nothing's loaded. */
	getNaturalSize(): { width: number; height: number } | null {
		return this.image ? { width: this.naturalWidth, height: this.naturalHeight } : null;
	}

	/**
	 * (Re)lays out an even cols x rows grid, discarding any lines dragged
	 * out of place before. gapX/gapY are the padding between cells in
	 * source-image pixels, for sheets exported with a gutter around each
	 * frame - cells are sized to exclude it.
	 */
	setGrid(cols: number, rows: number, gapX = 0, gapY = 0): void {
		if (!this.image) return;
		const c = Math.max(1, Math.floor(cols));
		const r = Math.max(1, Math.floor(rows));
		this.colBoundaries = Array.from({ length: c + 1 }, (_, i) => Math.round((i * this.naturalWidth) / c));
		this.rowBoundaries = Array.from({ length: r + 1 }, (_, i) => Math.round((i * this.naturalHeight) / r));
		this.gapX = Math.max(0, gapX);
		this.gapY = Math.max(0, gapY);
		this.selectedCells = [];
		this.notifyCellSelection();
		this.redraw();
	}

	isGridMode(): boolean {
		return this.colBoundaries.length >= 2 && this.rowBoundaries.length >= 2;
	}

	clearCellSelection(): void {
		this.selectedCells = [];
		this.notifyCellSelection();
		this.redraw();
	}

	/** Selected cells' rects, in the order they were clicked - that order becomes the animation's frame order. */
	getSelectedCellRects(): AtlasFrameRect[] {
		if (!this.isGridMode()) return [];
		const cols = this.colBoundaries.length - 1;
		return this.selectedCells.map((i) => {
			const col = i % cols;
			const row = Math.floor(i / cols);
			const x = this.colBoundaries[col];
			const y = this.rowBoundaries[row];
			return {
				x: Math.round(x),
				y: Math.round(y),
				w: Math.max(1, Math.round(this.colBoundaries[col + 1] - x - this.gapX)),
				h: Math.max(1, Math.round(this.rowBoundaries[row + 1] - y - this.gapY)),
			};
		});
	}

	private notifyCellSelection(): void {
		this.cellSelectionListener?.(this.selectedCells.length);
	}

	destroy(): void {
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
		if (this.isGridMode()) this.drawGrid();
	}

	private drawGrid(): void {
		const cols = this.colBoundaries.length - 1;
		const rows = this.rowBoundaries.length - 1;
		const gapXCanvas = this.gapX * this.scale;
		const gapYCanvas = this.gapY * this.scale;
		const colX = this.colBoundaries.map((v) => v * this.scale);
		const rowY = this.rowBoundaries.map((v) => v * this.scale);

		// Highlighted, numbered fills for already-picked cells - the number is
		// the frame order they'll be added to the animation in.
		this.ctx.textAlign = "center";
		this.ctx.textBaseline = "middle";
		this.selectedCells.forEach((cellIndex, order) => {
			const col = cellIndex % cols;
			const row = Math.floor(cellIndex / cols);
			const x = colX[col];
			const y = rowY[row];
			const w = Math.max(1, colX[col + 1] - x - gapXCanvas);
			const h = Math.max(1, rowY[row + 1] - y - gapYCanvas);
			this.ctx.fillStyle = "rgba(80, 160, 255, 0.35)";
			this.ctx.fillRect(x, y, w, h);
			this.ctx.font = `bold ${Math.max(10, Math.min(w, h) * 0.4)}px sans-serif`;
			this.ctx.fillStyle = "#ffffff";
			this.ctx.strokeStyle = "rgba(0, 0, 0, 0.6)";
			this.ctx.lineWidth = 3;
			this.ctx.strokeText(String(order + 1), x + w / 2, y + h / 2);
			this.ctx.fillText(String(order + 1), x + w / 2, y + h / 2);
		});

		// Excluded padding, shaded so it's obvious at a glance the grid accounts for it.
		if (gapXCanvas > 0.5) {
			this.ctx.fillStyle = "rgba(255, 70, 70, 0.4)";
			for (let c = 0; c < cols; c++) this.ctx.fillRect(colX[c + 1] - gapXCanvas, 0, gapXCanvas, this.canvas.height);
		}
		if (gapYCanvas > 0.5) {
			this.ctx.fillStyle = "rgba(255, 70, 70, 0.4)";
			for (let r = 0; r < rows; r++) this.ctx.fillRect(0, rowY[r + 1] - gapYCanvas, this.canvas.width, gapYCanvas);
		}

		// Boundary lines - interior ones are hoverable/draggable/deletable and highlight accordingly.
		for (let i = 0; i <= cols; i++) this.strokeLine("col", i, colX[i], true);
		for (let i = 0; i <= rows; i++) this.strokeLine("row", i, rowY[i], false);
	}

	private strokeLine(axis: "col" | "row", index: number, canvasPos: number, vertical: boolean): void {
		const isInterior = index > 0 && index < (axis === "col" ? this.colBoundaries.length - 1 : this.rowBoundaries.length - 1);
		const isDragging = isInterior && this.draggingLine?.axis === axis && this.draggingLine.index === index;
		const isHovered = isInterior && !this.draggingLine && this.hoveredLine?.axis === axis && this.hoveredLine.index === index;
		this.ctx.strokeStyle = isDragging ? "#ff9f43" : isHovered ? "#ffd76b" : "rgba(79, 168, 255, 0.7)";
		this.ctx.lineWidth = isDragging || isHovered ? 3 : 1;
		const pos = Math.round(canvasPos) + 0.5;
		this.ctx.beginPath();
		if (vertical) {
			this.ctx.moveTo(pos, 0);
			this.ctx.lineTo(pos, this.canvas.height);
		} else {
			this.ctx.moveTo(0, pos);
			this.ctx.lineTo(this.canvas.width, pos);
		}
		this.ctx.stroke();
	}

	/** Which cell (row*cols+col) a canvas-space point falls in. */
	private cellAt(p: { x: number; y: number }): number {
		const cols = this.colBoundaries.length - 1;
		let col = 0;
		for (let i = 0; i < cols; i++) if (p.x >= this.colBoundaries[i] * this.scale) col = i;
		let row = 0;
		for (let i = 0; i < this.rowBoundaries.length - 1; i++) if (p.y >= this.rowBoundaries[i] * this.scale) row = i;
		return row * cols + col;
	}

	/** The nearest interior (draggable/deletable) line to a canvas-space point, within tolerance - null if none is close enough. */
	private findNearestLine(p: { x: number; y: number }): LineRef | null {
		let best: (LineRef & { dist: number }) | null = null;
		for (let i = 1; i < this.colBoundaries.length - 1; i++) {
			const d = Math.abs(p.x - this.colBoundaries[i] * this.scale);
			if (d <= LINE_HOVER_TOLERANCE_PX && (!best || d < best.dist)) best = { axis: "col", index: i, dist: d };
		}
		for (let i = 1; i < this.rowBoundaries.length - 1; i++) {
			const d = Math.abs(p.y - this.rowBoundaries[i] * this.scale);
			if (d <= LINE_HOVER_TOLERANCE_PX && (!best || d < best.dist)) best = { axis: "row", index: i, dist: d };
		}
		return best ? { axis: best.axis, index: best.index } : null;
	}

	private toggleCell(cellIndex: number): void {
		const at = this.selectedCells.indexOf(cellIndex);
		if (at >= 0) this.selectedCells.splice(at, 1);
		else this.selectedCells.push(cellIndex);
		this.notifyCellSelection();
		this.redraw();
	}

	/** Moves a dragged line to a new canvas-space position, snapped to the nearest source pixel and (if close) to match another cell's width. */
	private updateLineDrag(p: { x: number; y: number }): void {
		if (!this.draggingLine) return;
		const { axis, index } = this.draggingLine;
		const boundaries = axis === "col" ? this.colBoundaries : this.rowBoundaries;
		const rawNatural = (axis === "col" ? p.x : p.y) / this.scale;

		const lo = boundaries[index - 1] + MIN_CELL_SIZE_PX;
		const hi = boundaries[index + 1] - MIN_CELL_SIZE_PX;
		if (lo >= hi) return; // no room to move this line at all
		let next = Math.round(Math.min(hi, Math.max(lo, rawNatural)));

		const snapToleranceNatural = LINE_SNAP_TOLERANCE_PX / this.scale;
		const leftWidth = next - boundaries[index - 1];
		const rightWidth = boundaries[index + 1] - next;
		for (let i = 0; i < boundaries.length - 1; i++) {
			if (i === index - 1 || i === index) continue;
			const otherWidth = boundaries[i + 1] - boundaries[i];
			if (Math.abs(leftWidth - otherWidth) < snapToleranceNatural) {
				next = boundaries[index - 1] + otherWidth;
				break;
			}
			if (Math.abs(rightWidth - otherWidth) < snapToleranceNatural) {
				next = boundaries[index + 1] - otherWidth;
				break;
			}
		}

		boundaries[index] = Math.min(hi, Math.max(lo, next));
		this.redraw();
	}

	/** Removes an interior line, merging the two cells it separated. Selection is cleared since cell indices shift. */
	private deleteLine(line: LineRef): void {
		const boundaries = line.axis === "col" ? this.colBoundaries : this.rowBoundaries;
		if (line.index <= 0 || line.index >= boundaries.length - 1) return;
		boundaries.splice(line.index, 1);
		this.selectedCells = [];
		this.notifyCellSelection();
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
		if (!this.image || !this.isGridMode()) return;
		e.preventDefault();
		const p = this.canvasPoint(e);

		if (e.button === 2) {
			const line = this.findNearestLine(p);
			if (!line) return;
			this.canvas.setPointerCapture(e.pointerId);
			this.draggingLine = { ...line, startCanvasPos: line.axis === "col" ? p.x : p.y };
			this.redraw();
			return;
		}
		if (e.button === 0) {
			this.canvas.setPointerCapture(e.pointerId);
			this.leftDownCell = this.cellAt(p);
		}
	}

	private onPointerMove(e: PointerEvent): void {
		const p = this.canvasPoint(e);

		if (this.draggingLine) {
			this.updateLineDrag(p);
			return;
		}
		if (this.leftDownCell !== null) return; // plain click - no live feedback needed mid-gesture

		// Idle hover: highlight the nearest draggable/deletable line, if any.
		const line = this.findNearestLine(p);
		const changed = line?.axis !== this.hoveredLine?.axis || line?.index !== this.hoveredLine?.index;
		this.hoveredLine = line;
		this.canvas.style.cursor = line ? (line.axis === "col" ? "ew-resize" : "ns-resize") : "crosshair";
		if (changed) this.redraw();
	}

	private onPointerUp(e: PointerEvent): void {
		const p = this.canvasPoint(e);

		if (this.draggingLine) {
			const { axis, index, startCanvasPos } = this.draggingLine;
			const currentCanvasPos = axis === "col" ? p.x : p.y;
			const moved = Math.abs(currentCanvasPos - startCanvasPos) > LINE_DRAG_THRESHOLD_PX;
			this.draggingLine = null;
			if (!moved) this.deleteLine({ axis, index });
			this.redraw();
			return;
		}
		if (this.leftDownCell !== null) {
			if (this.cellAt(p) === this.leftDownCell) this.toggleCell(this.leftDownCell);
			this.leftDownCell = null;
		}
	}

	private onPointerCancel(): void {
		this.draggingLine = null;
		this.leftDownCell = null;
		this.redraw();
	}

	private onPointerLeave(): void {
		if (this.draggingLine || this.leftDownCell !== null) return; // still mid-gesture (pointer capture keeps tracking it)
		if (this.hoveredLine) {
			this.hoveredLine = null;
			this.canvas.style.cursor = "crosshair";
			this.redraw();
		}
	}
}
