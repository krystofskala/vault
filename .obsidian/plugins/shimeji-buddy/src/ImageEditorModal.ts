import { App, Modal, Notice, Setting, type DropdownComponent, type TextComponent } from "obsidian";
import { AtlasSlicer } from "./AtlasSlicer";
import { generateStripFrames, hexToRgb, rgbToHex, type DetectFramesOptions, type RgbColor } from "./spritePack";
import type { AtlasFrameRect, CustomAnimation } from "./settings";

const NEW_ANIM_VALUE = "__new__";

export interface ImageEditorModalOptions {
	folder: string;
	imageName: string;
	/** Preselect this animation as the add-frames target (e.g. opened via an animation's own "Edit frames" button). */
	presetAnimationId: string | null;
	getAnimationsForImage: () => CustomAnimation[];
	createAnimation: (name: string) => Promise<CustomAnimation>;
	renameAnimation: (id: string, name: string) => Promise<void>;
	deleteAnimation: (id: string) => Promise<void>;
	addFrames: (animationId: string, frames: AtlasFrameRect[]) => Promise<void>;
	loadSlicerImage: (slicer: AtlasSlicer) => Promise<void>;
	sampleColor: (x: number, y: number) => Promise<RgbColor>;
	detectFrames: (options: DetectFramesOptions) => Promise<AtlasFrameRect[]>;
	/** Called when the modal closes, so the settings tab can refresh its own view. */
	onClosed: () => void;
}

/**
 * A large, dedicated workspace for slicing one image's frames and managing
 * the animations built from it: starts from an even cols x rows grid (with
 * optional padding between cells), then any interior line can be dragged to
 * resize its neighboring cells, or double-clicked to delete it and merge
 * them - for sheets where frames aren't quite uniform. Click a cell
 * (without dragging, and not near a line) to toggle it into the current
 * selection, or shift-click to reuse it again without removing it.
 * Obsidian doesn't expose a way for a plugin to pop a settings panel into
 * its own OS window, so this big modal is the closest equivalent to that,
 * instead of the cramped settings-tab column.
 */
export class ImageEditorModal extends Modal {
	private opts: ImageEditorModalOptions;
	private slicer!: AtlasSlicer;
	private targetAnimationId: string | null;
	private animListEl!: HTMLElement;
	private cellCountEl!: HTMLElement;
	private targetDropdown?: DropdownComponent;
	private detectColors: RgbColor[] = [];
	private detectColorListEl!: HTMLElement;

	constructor(app: App, opts: ImageEditorModalOptions) {
		super(app);
		this.opts = opts;
		this.targetAnimationId = opts.presetAnimationId;
		this.modalEl.addClass("sm-image-editor-modal");
	}

	async onOpen(): Promise<void> {
		this.setTitle(`Editing: ${this.opts.imageName}`);
		const { contentEl } = this;

		contentEl.createEl("p", {
			cls: "setting-item-description",
			text:
				"Click a cell to select it (numbered in click order - that's the frame order); click again to " +
				"remove it. Shift-click to reuse a cell again instead - handy for a symmetric cycle like " +
				"1, 2, 3, 2. Hover a grid line to grab it (cursor changes): drag it to move it, or double-click " +
				"it to delete it and merge the two cells it separated.",
		});

		const layout = contentEl.createDiv({ cls: "sm-editor-layout" });
		const slicerCol = layout.createDiv({ cls: "sm-editor-slicer-col" });
		const sideCol = layout.createDiv({ cls: "sm-editor-side-col" });

		this.slicer = new AtlasSlicer(slicerCol);
		await this.opts.loadSlicerImage(this.slicer);

		// ---------- grid controls ----------

		let colsInput: HTMLInputElement;
		let rowsInput: HTMLInputElement;
		let gapXInput: HTMLInputElement;
		let gapYInput: HTMLInputElement;
		const gridFieldsWrap = sideCol.createDiv({ cls: "sm-slicer-controls" });
		const applyGrid = () => {
			const cols = Number(colsInput.value);
			const rows = Number(rowsInput.value);
			const gapX = Math.max(0, Number(gapXInput.value) || 0);
			const gapY = Math.max(0, Number(gapYInput.value) || 0);
			if (cols > 0 && rows > 0) this.slicer.setGrid(cols, rows, gapX, gapY);
		};
		const mkGridField = (label: string, defaultValue: string, min: string): HTMLInputElement => {
			const wrap = gridFieldsWrap.createDiv({ cls: "sm-slicer-field" });
			wrap.createEl("label", { text: label });
			const input = wrap.createEl("input", { type: "number", attr: { min } });
			input.value = defaultValue;
			return input;
		};
		colsInput = mkGridField("Columns", "4", "1");
		rowsInput = mkGridField("Rows", "4", "1");
		gapXInput = mkGridField("Gap X (px)", "0", "0");
		gapYInput = mkGridField("Gap Y (px)", "0", "0");
		gridFieldsWrap
			.createEl("button", { text: "Apply grid", cls: "mod-cta" })
			.addEventListener("click", applyGrid);
		gridFieldsWrap.createEl("p", {
			cls: "setting-item-description",
			text:
				"Resets to an even grid, discarding any lines you've dragged - fine to use as a starting point, " +
				"then fine-tune individual lines afterward. If the sheet has padding between frames, set Gap " +
				"X/Y to that padding's width in source-image pixels.",
		});
		applyGrid(); // start from an even grid immediately

		// ---------- auto-detect frames ----------

		sideCol.createEl("h4", { text: "Auto-detect frames" });
		sideCol.createEl("p", {
			cls: "setting-item-description",
			text:
				"For large, messy sheets where frames aren't in a clean grid: treats one or more background " +
				"colors as empty space and finds each separate sprite's bounding box automatically. Switching " +
				"back to a grid (\"Apply grid\" above) discards this.",
		});

		this.detectColors = [await this.opts.sampleColor(0, 0)];
		const detectColorSection = sideCol.createDiv({ cls: "sm-slicer-controls" });
		detectColorSection.createEl("label", { text: "Background color(s)" });
		this.detectColorListEl = detectColorSection.createDiv({ cls: "sm-bg-color-list" });
		this.renderDetectColorList();
		const addColorWrap = detectColorSection.createDiv({ cls: "sm-slicer-field" });
		const addColorInput = addColorWrap.createEl("input", { type: "color" });
		addColorWrap.createEl("button", { text: "+ Add color" }).addEventListener("click", () => {
			this.detectColors.push(hexToRgb(addColorInput.value));
			this.renderDetectColorList();
		});

		let toleranceInput: HTMLInputElement;
		let minAreaInput: HTMLInputElement;
		let mergeDistInput: HTMLInputElement;
		const detectFieldsWrap = sideCol.createDiv({ cls: "sm-slicer-controls" });
		const mkDetectField = (label: string, defaultValue: string, min: string): HTMLInputElement => {
			const wrap = detectFieldsWrap.createDiv({ cls: "sm-slicer-field" });
			wrap.createEl("label", { text: label });
			const input = wrap.createEl("input", { type: "number", attr: { min } });
			input.value = defaultValue;
			return input;
		};
		toleranceInput = mkDetectField("Tolerance", "30", "0");
		minAreaInput = mkDetectField("Min area (px²)", "16", "0");
		mergeDistInput = mkDetectField("Merge gap (px)", "4", "0");
		detectFieldsWrap
			.createEl("button", { text: "Detect frames", cls: "mod-cta" })
			.addEventListener("click", async () => {
				if (this.detectColors.length === 0) {
					new Notice("Add at least one background color first.");
					return;
				}
				const rects = await this.opts.detectFrames({
					backgroundColors: this.detectColors,
					tolerance: Math.max(0, Number(toleranceInput.value) || 0),
					minArea: Math.max(1, Number(minAreaInput.value) || 1),
					mergeDistance: Math.max(0, Number(mergeDistInput.value) || 0),
				});
				if (rects.length === 0) {
					new Notice("No frames detected - try raising tolerance or adding more background colors.");
					return;
				}
				this.slicer.setAutoDetectedCells(rects);
				new Notice(`Detected ${rects.length} frame(s) - click any to select, in the order you want them.`);
			});

		this.cellCountEl = sideCol.createEl("p", { cls: "setting-item-description" });
		this.slicer.onCellSelectionChange((count) => {
			this.cellCountEl.setText(count > 0 ? `${count} cell(s) selected.` : "");
		});

		// ---------- target animation + add ----------

		let newNameInput: TextComponent | undefined;
		const targetSetting = new Setting(sideCol)
			.setName("Add frame(s) to")
			.setDesc("Pick an existing animation from this image, or create a new one.")
			.addDropdown((d) => {
				this.targetDropdown = d;
				this.refreshTargetDropdown();
				d.onChange((v) => {
					this.targetAnimationId = v === NEW_ANIM_VALUE ? null : v;
				});
			});
		targetSetting.addText((t) => {
			newNameInput = t;
			t.setPlaceholder("New animation name");
		});
		targetSetting.addButton((b) =>
			b
				.setButtonText("Add")
				.setCta()
				.onClick(async () => {
					const frames = this.slicer.getSelectedCellRects();
					if (frames.length === 0) {
						new Notice("Nothing selected yet.");
						return;
					}
					let animId = this.targetAnimationId;
					if (!animId) {
						const anim = await this.opts.createAnimation(newNameInput?.getValue().trim() || "");
						animId = anim.id;
						this.targetAnimationId = animId;
					}
					await this.opts.addFrames(animId, frames);
					this.slicer.clearCellSelection();
					new Notice(`Added ${frames.length} frame(s).`);
					this.refreshTargetDropdown();
					this.refreshAnimList();
				})
		);

		let stripCountInput: TextComponent | undefined;
		new Setting(sideCol)
			.setName("Generate strip frames")
			.setDesc("For an evenly-spaced horizontal strip: how many equal-width frames?")
			.addText((t) => {
				stripCountInput = t;
				t.setPlaceholder("e.g. 6");
			})
			.addButton((b) =>
				b.setButtonText("Generate").onClick(async () => {
					const size = this.slicer.getNaturalSize();
					const count = Number(stripCountInput?.getValue());
					if (!size || !count || count < 1) return;
					const frames = generateStripFrames(size.width, size.height, count);
					let animId = this.targetAnimationId;
					if (!animId) {
						const anim = await this.opts.createAnimation(newNameInput?.getValue().trim() || "");
						animId = anim.id;
						this.targetAnimationId = animId;
					}
					await this.opts.addFrames(animId, frames);
					new Notice(`Added ${frames.length} frame(s).`);
					this.refreshTargetDropdown();
					this.refreshAnimList();
				})
			);

		// ---------- animations built from this image ----------

		sideCol.createEl("h4", { text: "Animations from this image" });
		this.animListEl = sideCol.createDiv();
		this.refreshAnimList();
	}

	private renderDetectColorList(): void {
		this.detectColorListEl.empty();
		this.detectColors.forEach((c, i) => {
			const chip = this.detectColorListEl.createDiv({ cls: "sm-bg-color-chip" });
			chip.createDiv({ cls: "sm-bg-color-swatch" }).style.backgroundColor = rgbToHex(c);
			chip.createSpan({ text: rgbToHex(c) });
			if (this.detectColors.length > 1) {
				chip.createEl("button", { text: "×", cls: "sm-bg-color-remove" }).addEventListener("click", () => {
					this.detectColors.splice(i, 1);
					this.renderDetectColorList();
				});
			}
		});
	}

	private refreshTargetDropdown(): void {
		if (!this.targetDropdown) return;
		const el = this.targetDropdown.selectEl;
		el.empty();
		this.targetDropdown.addOption(NEW_ANIM_VALUE, "+ New animation");
		for (const anim of this.opts.getAnimationsForImage()) {
			this.targetDropdown.addOption(anim.id, anim.name || "(unnamed)");
		}
		const stillExists = this.opts.getAnimationsForImage().some((a) => a.id === this.targetAnimationId);
		this.targetAnimationId = stillExists ? this.targetAnimationId : null;
		this.targetDropdown.setValue(this.targetAnimationId ?? NEW_ANIM_VALUE);
	}

	private refreshAnimList(): void {
		this.animListEl.empty();
		const anims = this.opts.getAnimationsForImage();
		if (anims.length === 0) {
			this.animListEl.createEl("p", {
				cls: "setting-item-description",
				text: "None yet - add a selection above to create the first one.",
			});
			return;
		}
		for (const anim of anims) {
			new Setting(this.animListEl)
				.setName(anim.name || "(unnamed)")
				.setDesc(anim.frames.length === 1 ? "1 frame" : `${anim.frames.length} frames`)
				.addText((t) =>
					t
						.setValue(anim.name)
						.onChange(async (v) => {
							await this.opts.renameAnimation(anim.id, v);
							this.refreshTargetDropdown();
						})
				)
				.addExtraButton((b) =>
					b
						.setIcon("trash-2")
						.setTooltip("Delete this animation")
						.onClick(async () => {
							await this.opts.deleteAnimation(anim.id);
							this.refreshTargetDropdown();
							this.refreshAnimList();
						})
				);
		}
	}

	onClose(): void {
		this.slicer?.destroy();
		this.contentEl.empty();
		this.opts.onClosed();
	}
}
