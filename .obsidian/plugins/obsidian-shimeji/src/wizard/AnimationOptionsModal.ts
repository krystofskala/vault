import { App, Modal, Notice, Setting } from "obsidian";
import type ShimejiPlugin from "../main";
import { listPackImages } from "../shimeji/PackLoader";
import type { CustomActionSpec, CustomPoseSpec } from "../shimeji/customContent";
import { SpriteSheetModal } from "../sprites/SpriteSheetModal";
import { buildReplacementActionSpec, findReferenceVelocity, poseDefToCustomPoseSpec, randomVariantConditions } from "./animationOptions";
import { imagesUsedByActions, imagesUsedByPoseLists, imagesWorthSlicing } from "./imageCandidates";
import { PoseSequenceFitModal } from "./PoseSequenceFitModal";

/** True only if every condition in `spec` matches what randomVariantConditions would itself have
 * generated for that position — i.e. this spec was (or could have been) built by this modal, so
 * overwriting its conditions on save loses nothing a person actually authored by hand. A custom
 * action of the same name built some other way (e.g. hand-tuned facing-direction variants in
 * the advanced editor) fails this check, and the caller warns before letting the random-options
 * save path silently replace that hand-authored logic. */
function looksGenerated(spec: CustomActionSpec): boolean {
	const expected = randomVariantConditions(spec.animations.length).map((c) => c ?? "");
	return spec.animations.every((variant, i) => variant.condition === expected[i]);
}

/**
 * Gives one action several alternative animations ("options") instead of a single fixed sequence
 * — e.g. two or three different Walk cycles cut from a richer game sprite sheet, each an equally
 * likely pick every time the action starts (see animationOptions.ts's own doc comment for why a
 * plain independent-per-variant Math.random() wouldn't be uniform). Reuses SpriteSheetModal
 * completely unmodified to cut each option's frames — the same composition CharacterEditorModal's
 * fit editor already uses for its own "slice from a sheet" source, just consuming the *whole*
 * returned pose sequence as one option instead of picking a single pose out of it, since an option
 * here is a full animation (any number of frames), not one pose fit to one anchor.
 *
 * Deliberately does not touch `plugin.settings.customContent` itself, unlike an earlier version of
 * this file: it reports the built spec (or a reset request) through `onSave`/`onReset` and lets
 * the caller — `CharacterEditorModal`, which already holds this pack's custom content in memory
 * for the whole editing session — be the only thing that ever commits it. Reading
 * `plugin.settings.customContent` for the *starting* state is still fine here, since the caller's
 * own in-memory draft and the settings object stay in sync at every point this modal can be opened
 * from; only the write path needed to move.
 */
export class AnimationOptionsModal extends Modal {
	private options: CustomPoseSpec[][] = [];
	private packImages: string[] = [];
	private imgDir?: string;
	private hasExistingOverride = false;

	constructor(
		app: App,
		private plugin: ShimejiPlugin,
		private packId: string,
		private actionName: string,
		private onSave: (spec: CustomActionSpec) => void | Promise<void>,
		private onReset: () => void | Promise<void>,
	) {
		super(app);
	}

	async onOpen(): Promise<void> {
		this.modalEl.addClass("shimeji-wizard-modal");
		const pack = this.plugin.availablePacks.find((p) => p.id === this.packId);
		this.imgDir = pack?.imgDir;
		this.packImages = this.imgDir ? await listPackImages(this.app, this.imgDir) : [];

		const existingSpec = this.plugin.settings.customContent[this.packId]?.actions.find((a) => a.name.trim() === this.actionName);
		if (existingSpec && existingSpec.animations.length > 0) {
			this.hasExistingOverride = true;
			this.options = existingSpec.animations.map((v) => v.poses);
			if (!looksGenerated(existingSpec)) {
				new Notice(
					`"${this.actionName}" already has a hand-authored custom animation with its own conditions. Saving here replaces those with randomized options.`,
					10000,
				);
			}
		} else {
			const def = pack?.actions.get(this.actionName);
			this.options = def && def.animations.length > 0 ? [def.animations[0].poses.map(poseDefToCustomPoseSpec)] : [[]];
		}
		this.render();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private render(): void {
		this.contentEl.empty();
		this.setTitle(`Animation options — ${this.actionName}`);
		const { contentEl } = this;

		contentEl.createEl("p", {
			cls: "setting-item-description",
			text:
				this.options.length > 1
					? `Every time "${this.actionName}" starts, one of these ${this.options.length} options is picked at random, each equally likely.`
					: `Right now "${this.actionName}" always plays the same animation. Add another option below to have it pick a random one each time — handy for higher-frame-rate sprites that don't fit the standard pose slots.`,
		});

		this.options.forEach((poses, i) => this.renderOptionRow(contentEl, poses, i));

		new Setting(contentEl).addButton((b) =>
			b
				.setButtonText("+ Add another option")
				.setCta()
				.onClick(() => this.openSlicerForOption(this.options.length)),
		);

		const footer = new Setting(contentEl)
			.addButton((b) => b.setButtonText("Cancel").onClick(() => this.close()))
			.addButton((b) =>
				b
					.setButtonText("Save")
					.setCta()
					.onClick(() => void this.save()),
			);
		if (this.hasExistingOverride) {
			footer.addButton((b) =>
				b
					.setButtonText("Reset to standard animation")
					.setWarning()
					.onClick(() => void this.resetToStandard()),
			);
		}
	}

	private renderOptionRow(containerEl: HTMLElement, poses: CustomPoseSpec[], index: number): void {
		const box = containerEl.createDiv({ cls: "shimeji-cc-box" });
		const header = box.createDiv({ cls: "shimeji-cc-pose-header" });
		header.createEl("strong", { text: `Option ${index + 1}` });
		for (const pose of poses) this.updateThumb(header.createEl("img", { cls: "shimeji-cc-thumb" }), pose.image);
		box.createEl("p", { cls: "setting-item-description", text: poses.length === 1 ? "1 frame" : `${poses.length} frames` });

		const row = new Setting(box).addButton((b) => b.setButtonText(poses.length > 0 ? "Replace…" : "Slice from a sheet…").onClick(() => this.openSlicerForOption(index)));
		if (this.options.length > 1) {
			row.addButton((b) =>
				b
					.setButtonText("Remove")
					.setWarning()
					.onClick(() => {
						this.options.splice(index, 1);
						this.render();
					}),
			);
		}
	}

	private updateThumb(img: HTMLImageElement, path: string): void {
		if (path.trim() && this.imgDir) img.src = this.app.vault.adapter.getResourcePath(`${this.imgDir}/${path.trim().replace(/^[/\\]+/, "")}`);
		else img.style.display = "none";
	}

	/** Pack images actually worth offering as a sheet to slice — everything except images already
	 * spent as a finished pose, whether by some other saved custom action or by one of this
	 * action's own other (not yet saved) options. Doesn't also cross-check the standard schema's
	 * own shimeN.png-style poses the way CharacterEditorModal's own slicerCandidates does — this
	 * modal only ever edits one already-existing action's alternatives, not the whole pack, so it
	 * has no checklist of its own to consult. `keep` is always let through — see
	 * imagesWorthSlicing's own doc comment. */
	private slicerCandidates(keep?: string): string[] {
		const used = imagesUsedByActions(this.plugin.settings.customContent[this.packId]?.actions ?? []);
		for (const img of imagesUsedByPoseLists(this.options)) used.add(img);
		return imagesWorthSlicing(this.packImages, used, keep);
	}

	private openSlicerForOption(index: number): void {
		if (!this.imgDir) return;
		const imgDir = this.imgDir;
		const standardDef = this.plugin.availablePacks.find((p) => p.id === this.packId)?.actions.get(this.actionName);
		const initialImage = this.options[index]?.[0]?.image || this.packImages[0] || "";
		new SpriteSheetModal(this.app, {
			imgDir,
			images: this.slicerCandidates(initialImage),
			initialImage,
			actionName: this.actionName,
			onPoses: (poses) => {
				if (poses.length === 0) return;
				if (!this.packImages.includes(poses[0].image)) this.packImages = [...this.packImages, ...poses.map((p) => p.image).filter((img) => !this.packImages.includes(img))];
				// One more stop before these become the option's frames: resize to match the rest of
				// the character, flip/rotate whatever came out of the sheet facing the wrong way, and
				// place each frame's anchor, one at a time — see PoseSequenceFitModal's own doc comment
				// for why that's a separate modal rather than the fixed-128px PoseFitCanvas the rest of
				// the checklist uses.
				new PoseSequenceFitModal(this.app, {
					imgDir,
					packImages: this.packImages,
					sliceableImages: this.slicerCandidates(),
					poses,
					// A fresh slice's own poses are always velocity 0,0 (posesFromPlan's neutral
					// default); this is what keeps replacing Walk's art from also silently turning
					// Walk into a held-in-place animation, by carrying its real speed forward instead.
					referenceVelocity: findReferenceVelocity(standardDef, ...this.options),
					onDone: (finetuned) => {
						this.options[index] = finetuned;
						this.render();
					},
				}).open();
			},
		}).open();
	}

	private async save(): Promise<void> {
		const def = this.plugin.availablePacks.find((p) => p.id === this.packId)?.actions.get(this.actionName);
		if (!def) {
			new Notice("Couldn't find that action anymore — try reopening from the checklist.");
			return;
		}
		const validOptions = this.options.filter((poses) => poses.length > 0);
		if (validOptions.length === 0) {
			new Notice("Add at least one option first.");
			return;
		}

		const spec = buildReplacementActionSpec(def, validOptions);
		await this.onSave(spec);
		new Notice(`Saved ${validOptions.length} animation option(s) for "${this.actionName}".`);
		this.close();
	}

	private async resetToStandard(): Promise<void> {
		await this.onReset();
		new Notice(`"${this.actionName}" is back to its standard animation.`);
		this.close();
	}
}
