import { App, Modal, Notice, Setting, type DropdownComponent, type TextComponent } from "obsidian";
import { AtlasSlicer } from "./AtlasSlicer";
import { generateStripFrames } from "./spritePack";
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
	/** Called when the modal closes, so the settings tab can refresh its own view. */
	onClosed: () => void;
}

/**
 * A large, dedicated workspace for slicing one image's frames and managing
 * the animations built from it - freeform drag-select for messy sheets, or
 * grid-pick (set columns/rows, click cells in play order) for uniform ones.
 * Obsidian doesn't expose a way for a plugin to pop a settings panel into
 * its own OS window, so this is the closest equivalent: a big modal instead
 * of the cramped settings-tab column.
 */
export class ImageEditorModal extends Modal {
	private opts: ImageEditorModalOptions;
	private slicer!: AtlasSlicer;
	private targetAnimationId: string | null;
	private animListEl!: HTMLElement;
	private cellCountEl!: HTMLElement;
	private targetDropdown?: DropdownComponent;

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
				"Freeform: drag a box around a frame. Grid: set columns/rows below, then click cells in the " +
				"order you want them to play - the order you click becomes the frame order.",
		});

		const layout = contentEl.createDiv({ cls: "sm-editor-layout" });
		const slicerCol = layout.createDiv({ cls: "sm-editor-slicer-col" });
		const sideCol = layout.createDiv({ cls: "sm-editor-side-col" });

		this.slicer = new AtlasSlicer(slicerCol);
		await this.opts.loadSlicerImage(this.slicer);

		// ---------- mode + grid controls ----------

		const modeRow = new Setting(sideCol).setName("Mode");
		let colsInput: HTMLInputElement;
		let rowsInput: HTMLInputElement;
		const gridFieldsWrap = sideCol.createDiv({ cls: "sm-slicer-controls" });
		const applyGrid = () => {
			const cols = Number(colsInput.value);
			const rows = Number(rowsInput.value);
			if (cols > 0 && rows > 0) this.slicer.setGrid(cols, rows);
		};
		modeRow.addDropdown((d) => {
			d.addOption("freeform", "Freeform (drag a box)");
			d.addOption("grid", "Grid (click cells)");
			d.setValue("freeform");
			d.onChange((v) => {
				gridFieldsWrap.style.display = v === "grid" ? "" : "none";
				if (v === "grid") applyGrid();
				else this.slicer.setGrid(0, 0);
			});
		});
		const mkGridField = (label: string, defaultValue: string): HTMLInputElement => {
			const wrap = gridFieldsWrap.createDiv({ cls: "sm-slicer-field" });
			wrap.createEl("label", { text: label });
			const input = wrap.createEl("input", { type: "number", attr: { min: "1" } });
			input.value = defaultValue;
			input.addEventListener("change", applyGrid);
			return input;
		};
		colsInput = mkGridField("Columns", "4");
		rowsInput = mkGridField("Rows", "4");
		gridFieldsWrap.createEl("button", { text: "Apply grid", cls: "mod-cta" }).addEventListener("click", applyGrid);
		gridFieldsWrap.style.display = "none";

		this.cellCountEl = sideCol.createEl("p", { cls: "setting-item-description" });
		this.slicer.onCellSelectionChange((count) => {
			this.cellCountEl.setText(count > 0 ? `${count} cell(s) selected.` : "");
		});

		// ---------- freeform numeric fields ----------

		const controls = sideCol.createDiv({ cls: "sm-slicer-controls" });
		const mkNumField = (label: string): HTMLInputElement => {
			const wrap = controls.createDiv({ cls: "sm-slicer-field" });
			wrap.createEl("label", { text: label });
			return wrap.createEl("input", { type: "number", attr: { min: "0" } });
		};
		const xInput = mkNumField("X");
		const yInput = mkNumField("Y");
		const wInput = mkNumField("W");
		const hInput = mkNumField("H");
		const syncInputsFromSelection = (rect: AtlasFrameRect | null) => {
			xInput.value = rect ? String(rect.x) : "";
			yInput.value = rect ? String(rect.y) : "";
			wInput.value = rect ? String(rect.w) : "";
			hInput.value = rect ? String(rect.h) : "";
		};
		this.slicer.onSelectionChange(syncInputsFromSelection);
		const commitInputsToSelection = () => {
			const x = Number(xInput.value);
			const y = Number(yInput.value);
			const w = Number(wInput.value);
			const h = Number(hInput.value);
			if ([x, y, w, h].some((n) => Number.isNaN(n))) return;
			this.slicer.setSelection({ x, y, w: Math.max(1, w), h: Math.max(1, h) });
		};
		for (const input of [xInput, yInput, wInput, hInput]) input.addEventListener("change", commitInputsToSelection);

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
					const frames = this.slicer.isGridMode()
						? this.slicer.getSelectedCellRects()
						: this.slicer.getSelection()
							? [this.slicer.getSelection()!]
							: [];
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
					if (this.slicer.isGridMode()) this.slicer.clearCellSelection();
					else this.slicer.setSelection(null);
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
