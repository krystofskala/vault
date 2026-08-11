import { App, Modal, Notice } from "obsidian";
import { previewColorKey, removeBackgroundColor, sampleImageColor, type RgbColor } from "./spritePack";

const MAX_PREVIEW_WIDTH = 480;
const MAX_UPSCALE = 8;
const DEFAULT_TOLERANCE = 30;
const REFRESH_DEBOUNCE_MS = 120;

function toHex(c: RgbColor): string {
	const h = (n: number) => n.toString(16).padStart(2, "0");
	return `#${h(c.r)}${h(c.g)}${h(c.b)}`;
}

function fromHex(hex: string): RgbColor {
	const n = parseInt(hex.slice(1), 16);
	return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export interface RemoveBackgroundModalOptions {
	folder: string;
	imageName: string;
	loadImage: () => Promise<{ width: number; height: number } | null>;
	sampleColor: (x: number, y: number) => Promise<RgbColor>;
	preview: (color: RgbColor, tolerance: number) => Promise<HTMLCanvasElement>;
	apply: (color: RgbColor, tolerance: number) => Promise<void>;
	onApplied: () => void;
}

/**
 * Color-key background removal: pick (or click to sample) the background
 * color, adjust tolerance, and preview the result live before committing.
 * Works regardless of the sprite art's own quality/resolution - it's only
 * matching a color, not doing real background detection - so it's well
 * suited to flat-background sprite sheets that are otherwise hard to find
 * pre-cleaned versions of.
 */
export class RemoveBackgroundModal extends Modal {
	private opts: RemoveBackgroundModalOptions;
	private naturalWidth = 0;
	private naturalHeight = 0;
	private scale = 1;
	private color: RgbColor = { r: 255, g: 255, b: 255 };
	private tolerance = DEFAULT_TOLERANCE;
	private previewCanvasHost!: HTMLElement;
	private colorInput!: HTMLInputElement;
	private refreshTimer: number | null = null;

	constructor(app: App, opts: RemoveBackgroundModalOptions) {
		super(app);
		this.opts = opts;
		this.modalEl.addClass("sm-image-editor-modal");
	}

	async onOpen(): Promise<void> {
		this.setTitle(`Remove background: ${this.opts.imageName}`);
		const { contentEl } = this;

		contentEl.createEl("p", {
			cls: "setting-item-description",
			text:
				"Color-key transparency: everything close to the picked color becomes see-through. Works on " +
				"flat, solid backgrounds no matter how low-res the sprite art is - it only needs to match a " +
				"color, not actually detect what's foreground vs background. Click anywhere on the preview to " +
				"pick a different color; nothing is saved until you hit Apply.",
		});

		const size = await this.opts.loadImage();
		if (!size) {
			contentEl.createEl("p", { text: "Couldn't load this image." });
			return;
		}
		this.naturalWidth = size.width;
		this.naturalHeight = size.height;
		this.scale = Math.min(MAX_PREVIEW_WIDTH / this.naturalWidth, MAX_UPSCALE);
		this.scale = Math.max(this.scale, 0.05);

		this.color = await this.opts.sampleColor(0, 0);

		const layout = contentEl.createDiv({ cls: "sm-editor-layout" });
		const previewCol = layout.createDiv({ cls: "sm-editor-slicer-col" });
		const controlsCol = layout.createDiv({ cls: "sm-editor-side-col" });

		this.previewCanvasHost = previewCol.createDiv({ cls: "sm-bg-preview" });
		this.previewCanvasHost.addEventListener("click", (e) => this.onPreviewClick(e));

		const colorRow = controlsCol.createDiv({ cls: "sm-slicer-controls" });
		const swatchWrap = colorRow.createDiv({ cls: "sm-slicer-field" });
		swatchWrap.createEl("label", { text: "Background color" });
		this.colorInput = swatchWrap.createEl("input", { type: "color" });
		this.colorInput.addEventListener("input", () => {
			this.color = fromHex(this.colorInput.value);
			this.scheduleRefresh();
		});

		const toleranceWrap = colorRow.createDiv({ cls: "sm-slicer-field" });
		toleranceWrap.createEl("label", { text: "Tolerance" });
		const toleranceInput = toleranceWrap.createEl("input", { type: "number", attr: { min: "0", max: "255" } });
		toleranceInput.value = String(this.tolerance);
		toleranceInput.addEventListener("input", () => {
			const n = Number(toleranceInput.value);
			if (!Number.isNaN(n) && n >= 0) {
				this.tolerance = n;
				this.scheduleRefresh();
			}
		});

		controlsCol.createEl("p", {
			cls: "setting-item-description",
			text: "Higher tolerance removes a wider range of similar colors - useful for JPEG-y or dithered edges, but too high starts eating the character too.",
		});

		const buttonRow = controlsCol.createDiv({ cls: "sm-slicer-controls" });
		buttonRow.createEl("button", { text: "Resample top-left corner" }).addEventListener("click", async () => {
			this.color = await this.opts.sampleColor(0, 0);
			this.refresh();
		});
		const applyButton = buttonRow.createEl("button", { text: "Apply - overwrite image", cls: "mod-cta" });
		applyButton.addEventListener("click", async () => {
			applyButton.disabled = true;
			try {
				await this.opts.apply(this.color, this.tolerance);
				new Notice(`Background removed from "${this.opts.imageName}".`);
				this.opts.onApplied();
				this.close();
			} catch (e) {
				console.error("Shimeji Buddy: background removal failed", e);
				new Notice(`Couldn't remove the background: ${e instanceof Error ? e.message : String(e)}`);
				applyButton.disabled = false;
			}
		});

		this.refresh();
	}

	private scheduleRefresh(): void {
		if (this.refreshTimer) window.clearTimeout(this.refreshTimer);
		this.refreshTimer = window.setTimeout(() => this.refresh(), REFRESH_DEBOUNCE_MS);
	}

	private async refresh(): Promise<void> {
		this.colorInput.value = toHex(this.color);
		const canvas = await this.opts.preview(this.color, this.tolerance);
		canvas.style.width = `${Math.max(1, Math.round(this.naturalWidth * this.scale))}px`;
		canvas.style.height = `${Math.max(1, Math.round(this.naturalHeight * this.scale))}px`;
		canvas.style.imageRendering = "pixelated";
		canvas.style.display = "block";
		this.previewCanvasHost.empty();
		this.previewCanvasHost.appendChild(canvas);
	}

	private async onPreviewClick(e: MouseEvent): Promise<void> {
		const canvas = this.previewCanvasHost.querySelector("canvas");
		if (!canvas) return;
		const rect = canvas.getBoundingClientRect();
		const x = Math.round(((e.clientX - rect.left) / rect.width) * this.naturalWidth);
		const y = Math.round(((e.clientY - rect.top) / rect.height) * this.naturalHeight);
		this.color = await this.opts.sampleColor(x, y);
		this.refresh();
	}

	onClose(): void {
		if (this.refreshTimer) window.clearTimeout(this.refreshTimer);
		this.contentEl.empty();
	}
}
