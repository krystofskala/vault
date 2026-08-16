import { App, Modal, Notice, Setting, normalizePath } from "obsidian";
import type ShimejiPlugin from "../main";
import { listPackImages } from "../shimeji/PackLoader";
import { decodeImageBlob, decodeVaultImage, importPackImage, overwriteVaultImageAsPng, packImagePath } from "../sprites/imageIo";
import { SpriteSheetModal } from "../sprites/SpriteSheetModal";
import { AnimationOptionsModal } from "./AnimationOptionsModal";
import { deriveAnimatedActions, type AnimatedActionChecklist } from "./animationOptions";
import { deriveRequiredPoses, type PoseChecklist, type PoseChecklistEntry } from "./deriveRequiredPoses";
import { PoseFitCanvas } from "./PoseFitCanvas";
import { probeScaffoldPlan, scaffoldCharacter } from "./scaffoldCharacter";

type View = "name" | "confirmMigration" | "checklist" | "fit";

/**
 * Names a character, scaffolds it as a real pack (full standard shimeji-ee schema, no art yet —
 * see scaffoldCharacter.ts), then shows exactly which pose images it still needs. Re-opening for
 * a pack that already exists (wizard-made or not) skips straight to the checklist.
 *
 * The checklist's done/empty state is never stored anywhere of its own — it's recomputed from
 * `listPackImages` every time this opens, so closing and reopening mid-way just works, and a
 * pose fitted by hand-editing the pack folder directly counts too.
 */
export class CharacterWizardModal extends Modal {
	private view: View = "name";
	private nameDraft = "";
	private packId?: string;
	private packName?: string;
	private imgDir?: string;
	private checklist?: PoseChecklist;
	private animatedActions?: AnimatedActionChecklist;
	private doneImages = new Set<string>();
	private fittingEntry?: PoseChecklistEntry;
	private fitCanvas?: PoseFitCanvas;
	/** Every image already in the pack's folder, for the "pick an already-uploaded image" picker
	 * and as the sheet-slicer's own candidate list — fetched once when a slot's fit editor opens
	 * (not on every render) so opening the dropdown doesn't need its own loading state. */
	private packImages: string[] = [];

	constructor(
		app: App,
		private plugin: ShimejiPlugin,
		private existingPackId?: string,
		/** Called once, when this modal closes for any reason — e.g. the settings tab re-rendering
		 * itself so a freshly scaffolded character shows up in "Your characters" without a manual
		 * Rescan click. Optional: most callers don't need it. */
		private onDidClose?: () => void,
	) {
		super(app);
	}

	async onOpen(): Promise<void> {
		this.modalEl.addClass("shimeji-wizard-modal");
		if (this.existingPackId) await this.loadChecklist(this.existingPackId);
		this.render();
	}

	onClose(): void {
		this.fitCanvas?.destroy();
		this.contentEl.empty();
		this.onDidClose?.();
	}

	private render(): void {
		this.contentEl.empty();
		if (this.view === "confirmMigration") this.renderMigrationConfirm();
		else if (this.view === "fit" && this.fittingEntry) this.renderFitEditor(this.fittingEntry);
		else if (this.view === "checklist" && this.checklist) this.renderChecklist();
		else this.renderNameStep();
	}

	// ---------------------------------------------------------------- name step

	private renderNameStep(): void {
		this.setTitle("Create a new character");
		const { contentEl } = this;
		contentEl.createEl("p", {
			text:
				"Sets a new character up with shimeji-ee's full standard behavior repertoire — walking, " +
				"sitting, climbing, breeding, all of it — ready to receive its own art one pose at a time. " +
				"Window-throwing poses are optional and shown separately; nothing else is left out.",
			cls: "setting-item-description",
		});

		new Setting(contentEl).setName("Name").addText((text) =>
			text
				.setPlaceholder("e.g. Whiskers")
				.setValue(this.nameDraft)
				.onChange((value) => {
					this.nameDraft = value;
				}),
		);

		new Setting(contentEl)
			.addButton((b) => b.setButtonText("Cancel").onClick(() => this.close()))
			.addButton((b) => b.setButtonText("Next").setCta().onClick(() => void this.startScaffold()));
	}

	private async startScaffold(): Promise<void> {
		const name = this.nameDraft.trim();
		if (!name) {
			new Notice("Give the character a name first.");
			return;
		}
		const packsFolder = this.plugin.settings.packsFolder.trim();
		if (!packsFolder) {
			new Notice("Set a pack folder first, under Settings → Characters → Your characters.");
			return;
		}

		const plan = await probeScaffoldPlan(this.app, packsFolder);
		if (plan === "migrate-then-add") {
			this.view = "confirmMigration";
			this.render();
			return;
		}
		await this.finishScaffold(packsFolder, name, false);
	}

	// ---------------------------------------------------------------- migration confirmation

	private renderMigrationConfirm(): void {
		this.setTitle("Reorganize the existing character first?");
		const { contentEl } = this;
		const packsFolder = this.plugin.settings.packsFolder.trim();
		const existingName = packsFolder.split("/").pop() || "Mascot";
		contentEl.createEl("p", {
			text:
				`This vault has one character ("${existingName}") using the older single-folder layout. ` +
				`Creating a second character needs it reorganized into the same "one folder per character" ` +
				`layout shimeji-ee itself uses (README's "Using your own artwork") first.`,
		});
		contentEl.createEl("p", {
			text: `Nothing is deleted — only moved: "${packsFolder}/conf" and "${packsFolder}/img/*" become "${packsFolder}/img/${existingName}/...".`,
			cls: "setting-item-description",
		});

		new Setting(contentEl)
			.addButton((b) =>
				b.setButtonText("Cancel").onClick(() => {
					this.view = "name";
					this.render();
				}),
			)
			.addButton((b) =>
				b
					.setButtonText("Reorganize and continue")
					.setCta()
					.onClick(() => void this.finishScaffold(packsFolder, this.nameDraft.trim(), true)),
			);
	}

	private async finishScaffold(packsFolder: string, name: string, allowMigration: boolean): Promise<void> {
		try {
			const result = await scaffoldCharacter(this.app, packsFolder, this.plugin.bundledPackFolder(), name, allowMigration);
			await this.plugin.rescanPacks();
			if (!(await this.loadChecklist(result.packId))) {
				new Notice(`Created "${result.packId}", but couldn't read it back — try Rescan in Settings.`);
				this.close();
				return;
			}
		} catch (e) {
			console.error("[obsidian-shimeji] could not create the new character", e);
			new Notice("Couldn't create the character — see the console for details.");
			return;
		}
		this.view = "checklist";
		this.render();
	}

	// ---------------------------------------------------------------- checklist

	/** Looks up the already-loaded pack (fresh from a scaffold, or any existing one this modal
	 * was opened directly against) and derives its checklist from that live, parsed pack —
	 * never by re-reading/re-parsing XML here, so a hand-edited actions.xml is reflected too. */
	private async loadChecklist(packId: string): Promise<boolean> {
		const pack = this.plugin.availablePacks.find((p) => p.id === packId);
		if (!pack || !pack.imgDir) return false;
		this.packId = packId;
		this.packName = pack.name;
		this.imgDir = pack.imgDir;
		this.checklist = deriveRequiredPoses(pack.actions);
		this.animatedActions = deriveAnimatedActions(pack.actions);
		this.doneImages = new Set(await listPackImages(this.app, pack.imgDir));
		return true;
	}

	private renderChecklist(): void {
		if (!this.checklist) return;
		this.setTitle(`${this.packName ?? this.packId} — poses`);
		const { contentEl } = this;

		const doneCount = this.checklist.required.filter((e) => this.doneImages.has(e.image)).length;
		contentEl.createEl("p", {
			text: `${doneCount} of ${this.checklist.required.length} required poses done. Click any to fit an image to it — any order, come back any time.`,
			cls: "setting-item-description",
		});

		for (const entry of this.checklist.required) this.renderChecklistRow(contentEl, entry);

		if (this.checklist.optional.length > 0) {
			const details = contentEl.createEl("details", { cls: "shimeji-section" });
			details.createEl("summary", { cls: "shimeji-section-title", text: "Advanced: window-throwing (optional)" });
			const body = details.createDiv({ cls: "shimeji-section-body" });
			body.createEl("p", {
				text: "Only needed if you turn on window-throwing later (off by default). Skipping these is completely normal.",
				cls: "setting-item-description",
			});
			for (const entry of this.checklist.optional) this.renderChecklistRow(body, entry);
		}

		if (this.animatedActions && (this.animatedActions.required.length > 0 || this.animatedActions.optional.length > 0)) {
			const details = contentEl.createEl("details", { cls: "shimeji-section" });
			details.createEl("summary", { cls: "shimeji-section-title", text: "Advanced: animation options" });
			const body = details.createDiv({ cls: "shimeji-section-body" });
			body.createEl("p", {
				text:
					"Give an action a couple of alternative animations instead of one fixed sequence — handy for " +
					"higher-frame-rate game sprites that don't fit the standard pose slots. One option is picked at " +
					"random, equally likely, every time the action starts.",
				cls: "setting-item-description",
			});
			for (const name of this.animatedActions.required) this.renderAnimatedActionRow(body, name);

			if (this.animatedActions.optional.length > 0) {
				const ieDetails = body.createEl("details", { cls: "shimeji-section" });
				ieDetails.createEl("summary", { cls: "shimeji-section-title", text: "Window-throwing actions" });
				const ieBody = ieDetails.createDiv({ cls: "shimeji-section-body" });
				for (const name of this.animatedActions.optional) this.renderAnimatedActionRow(ieBody, name);
			}
		}

		new Setting(contentEl).addButton((b) => b.setButtonText("Close").onClick(() => this.close()));
	}

	private renderAnimatedActionRow(containerEl: HTMLElement, name: string): void {
		const count = (this.packId ? this.plugin.settings.customContent[this.packId] : undefined)?.actions.find((a) => a.name.trim() === name)?.animations.length ?? 0;
		new Setting(containerEl)
			.setName(name)
			.setDesc(count > 0 ? `${count} option${count === 1 ? "" : "s"}` : "Standard animation")
			.addButton((b) => b.setButtonText(count > 0 ? "Edit options" : "Add options").onClick(() => this.openAnimationOptions(name)));
	}

	private openAnimationOptions(name: string): void {
		if (!this.packId) return;
		new AnimationOptionsModal(this.app, this.plugin, this.packId, name, () => this.render()).open();
	}

	private renderChecklistRow(containerEl: HTMLElement, entry: PoseChecklistEntry): void {
		const done = this.doneImages.has(entry.image);
		new Setting(containerEl)
			.setName(entry.image.replace(/^\//, ""))
			.setDesc(`Used by ${entry.label}`)
			.addButton((b) =>
				b
					.setButtonText(done ? "Refit" : "Fit an image")
					.onClick(() => void this.openFitEditor(entry))
					.buttonEl.toggleClass("shimeji-cc-done", done),
			);
	}

	// ---------------------------------------------------------------- fit editor

	private async openFitEditor(entry: PoseChecklistEntry): Promise<void> {
		this.fittingEntry = entry;
		this.packImages = this.imgDir ? await listPackImages(this.app, this.imgDir) : [];
		this.view = "fit";
		this.render();
	}

	private backToChecklist(): void {
		this.fitCanvas?.destroy();
		this.fitCanvas = undefined;
		this.fittingEntry = undefined;
		this.view = "checklist";
		this.render();
	}

	private renderFitEditor(entry: PoseChecklistEntry): void {
		this.setTitle(`Fit ${entry.image.replace(/^\//, "")}`);
		const { contentEl } = this;

		contentEl.createEl("p", {
			text:
				`Used by ${entry.label}. Drag to position, scroll (or the buttons below) to zoom — ` +
				`whatever falls outside the frame is left out, so there's no separate crop step.`,
			cls: "setting-item-description",
		});

		this.fitCanvas = new PoseFitCanvas(contentEl);
		this.fitCanvas.setAnchors(entry.anchors);
		void this.loadTemplateForFit(entry);

		const uploadRow = new Setting(contentEl)
			.setName("Working image")
			.setDesc("Not saved anywhere on its own — only the fitted result is, and only once you click Save.");
		const label = uploadRow.controlEl.createEl("label", { cls: "shimeji-upload-label mod-cta", text: "Upload a photo…" });
		const input = label.createEl("input", { cls: "shimeji-upload-input" });
		input.type = "file";
		input.accept = "image/png,image/jpeg,image/gif,image/webp";
		input.onchange = async () => {
			const file = input.files?.[0];
			input.value = "";
			if (!file || !this.fitCanvas) return;
			try {
				const decoded = await decodeImageBlob(file);
				this.fitCanvas.loadWorkingImage(decoded.pixels);
			} catch (e) {
				console.error("[obsidian-shimeji] could not decode the uploaded image", e);
				new Notice("Couldn't read that as an image.");
			}
		};

		if (this.packImages.length > 0) {
			new Setting(contentEl)
				.setName("Or pick an image already in this pack")
				.addDropdown((dropdown) => {
					dropdown.addOption("", "Choose one…");
					for (const image of this.packImages) dropdown.addOption(image, image.replace(/^\//, ""));
					dropdown.setValue("").onChange((value) => void this.loadPackImageIntoFit(value));
				});
		}

		this.renderSliceFromSheet(contentEl, entry);

		new Setting(contentEl)
			.setName("Orientation")
			.setDesc("Applied to the image immediately — click again to undo a flip, or rotate the other way to undo a turn.")
			.addButton((b) => b.setButtonText("Flip ↔").setTooltip("Flip horizontal").onClick(() => this.fitCanvas?.flipHorizontal()))
			.addButton((b) => b.setButtonText("Flip ↕").setTooltip("Flip vertical").onClick(() => this.fitCanvas?.flipVertical()))
			.addButton((b) => b.setButtonText("Rotate ↺").setTooltip("Rotate counter-clockwise").onClick(() => this.fitCanvas?.rotateCounterClockwise()))
			.addButton((b) => b.setButtonText("Rotate ↻").setTooltip("Rotate clockwise").onClick(() => this.fitCanvas?.rotateClockwise()));

		new Setting(contentEl)
			.setName("Position")
			.addButton((b) => b.setButtonText("Zoom out").onClick(() => this.fitCanvas?.zoomOut()))
			.addButton((b) => b.setButtonText("Zoom in").onClick(() => this.fitCanvas?.zoomIn()))
			.addButton((b) => b.setButtonText("Reset").onClick(() => this.fitCanvas?.resetTransform()));

		new Setting(contentEl)
			.addButton((b) => b.setButtonText("Back to checklist").onClick(() => this.backToChecklist()))
			.addButton((b) =>
				b
					.setButtonText("Save")
					.setCta()
					.onClick(() => void this.saveFit(entry)),
			);
	}

	/** The optional translucent guide — see `ShimejiSettings.referenceArtFolder`'s own doc comment.
	 * Same `shimeN.png` filename on both sides, so no per-pose mapping is needed: whatever is (or
	 * isn't) sitting at that name in the reference folder is exactly what this slot shows. */
	private async loadTemplateForFit(entry: PoseChecklistEntry): Promise<void> {
		if (!this.fitCanvas) return;
		const path = normalizePath(`${this.plugin.referenceArtFolder()}${entry.image}`);
		const decoded = await decodeVaultImage(this.app, path);
		await this.fitCanvas?.loadTemplate(decoded?.url);
	}

	private async loadPackImageIntoFit(image: string): Promise<void> {
		if (!image || !this.imgDir || !this.fitCanvas) return;
		const decoded = await decodeVaultImage(this.app, packImagePath(this.imgDir, image));
		if (decoded) this.fitCanvas.loadWorkingImage(decoded.pixels);
		else new Notice(`Couldn't read "${image.replace(/^\//, "")}".`);
	}

	/**
	 * Upload-a-sheet-then-cut-one-piece-out, reusing `SpriteSheetModal`/`AtlasSlicer` completely
	 * unmodified: it already writes each selected region out as its own PNG and reports the
	 * result through `onPoses`, which is exactly the "give me one cropped image" hook this needs
	 * — just consumed differently than that modal's usual "append to an action's pose list".
	 *
	 * The sheet itself is imported into the pack folder (unlike a plain "Upload a photo", which
	 * never touches disk) because a sheet is worth keeping to re-slice later, the same reason
	 * `SpriteSheetModal` leaves the original sheet in place after cutting from it.
	 */
	private renderSliceFromSheet(containerEl: HTMLElement, entry: PoseChecklistEntry): void {
		if (!this.imgDir) return;
		const row = new Setting(containerEl)
			.setName("Or slice from a sprite sheet")
			.setDesc("Upload a sheet with several poses on it, then cut just this one out of it.");
		const label = row.controlEl.createEl("label", { cls: "shimeji-upload-label", text: "Upload a sheet…" });
		const input = label.createEl("input", { cls: "shimeji-upload-input" });
		input.type = "file";
		input.accept = "image/png,image/jpeg,image/gif,image/webp";
		input.onchange = async () => {
			const file = input.files?.[0];
			input.value = "";
			if (!file || !this.imgDir) return;
			try {
				// importPackImage returns a bare filename ("sheet.png"), unlike listPackImages/
				// writePackImage's leading-slash convention ("/sheet.png") everything else here
				// uses — normalize it before it goes anywhere near packImages.
				const imported = `/${await importPackImage(this.app, this.imgDir, file.name, await file.arrayBuffer())}`;
				if (!this.packImages.includes(imported)) this.packImages = [...this.packImages, imported];
				this.openSheetSlicer(entry, imported);
			} catch (e) {
				console.error("[obsidian-shimeji] could not import the sheet", e);
				new Notice("Couldn't add that sheet.");
			}
		};
	}

	private openSheetSlicer(entry: PoseChecklistEntry, initialImage: string): void {
		if (!this.imgDir) return;
		new SpriteSheetModal(this.app, {
			imgDir: this.imgDir,
			images: this.packImages,
			initialImage,
			actionName: entry.image.replace(/^\/|\.png$/g, ""),
			onPoses: (poses) => {
				if (poses.length === 0) return;
				if (poses.length > 1) new Notice(`Sliced ${poses.length} poses — used the first; the rest are saved in the image list too.`);
				void this.loadPackImageIntoFit(poses[0].image);
			},
		}).open();
	}

	private async saveFit(entry: PoseChecklistEntry): Promise<void> {
		if (!this.fitCanvas || !this.imgDir) return;
		const composited = this.fitCanvas.composite();
		if (!composited) {
			new Notice("Upload an image first.");
			return;
		}
		try {
			await overwriteVaultImageAsPng(this.app, packImagePath(this.imgDir, entry.image), composited);
		} catch (e) {
			console.error("[obsidian-shimeji] could not save the fitted pose", e);
			new Notice("Couldn't save that pose — see the console for details.");
			return;
		}
		this.doneImages.add(entry.image);
		new Notice(`Saved ${entry.image.replace(/^\//, "")}.`);

		const next = this.checklist ? [...this.checklist.required, ...this.checklist.optional].find((e) => !this.doneImages.has(e.image)) : undefined;
		this.fitCanvas.destroy();
		this.fitCanvas = undefined;
		if (next) void this.openFitEditor(next);
		else this.backToChecklist();
	}
}
