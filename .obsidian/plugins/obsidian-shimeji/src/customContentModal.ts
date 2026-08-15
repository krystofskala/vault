import { App, Modal, Notice, Setting } from "obsidian";
import type ShimejiPlugin from "./main";
import { EXPR_WRAPPER, parseExpression } from "./shimeji/Expression";
import { listPackImages } from "./shimeji/PackLoader";
import { RemoveBackgroundModal } from "./sprites/RemoveBackgroundModal";
import { SpriteSheetModal } from "./sprites/SpriteSheetModal";
import { deletePackImage, importPackImage } from "./sprites/imageIo";
import type { ActionType, BorderType } from "./shimeji/types";
import {
	emptyCustomPackContent,
	newActionRefSpec,
	newActionSpec,
	newAnimationVariantSpec,
	newBehaviorNextSpec,
	newBehaviorSpec,
	newPoseSpec,
	newSpecId,
	type CustomActionSpec,
	type CustomAnimationVariantSpec,
	type CustomBehaviorSpec,
	type CustomPackContent,
} from "./shimeji/customContent";

const ACTION_TYPES: ActionType[] = ["Stay", "Move", "Animate", "Sequence", "Select", "Embedded"];
const BORDER_TYPES: BorderType[] = ["Floor", "Wall", "Ceiling"];
const SHIMEJI_TICK_HINT = "Same units as actions.xml: 25 ticks ≈ 1 second.";

/** Real Class= values confirmed against the actual conf files, minus ones that are either not
 * genuinely distinct in this engine (WalkWithIE/FallWithIE/ThrowIE all resolve to plain Move or
 * Fall already) or not a real embedded class at all (the top-level "ChaseMouse" action is a
 * plain Sequence in the real pack, not Type="Embedded"). */
const EMBEDDED_CLASSES: Array<[string, string]> = [
	["Fall", "Apply gravity (plus this action's own Gravity/RegistanceX/RegistanceY params) until landing."],
	["Breed", "Spawn one independent sibling mascot (params BornX, BornY, BornBehavior), then play this action's own poses once."],
	["Regist", "Hold/cycle this action's own poses in place with no physics at all — for a struggle/resist animation."],
	["Look", "Instantly face a direction (param LookRight = true/false), or face the cursor if omitted."],
	["Jump", "Instantly set an arc velocity toward a target (params TargetX, TargetY), then fall under gravity."],
	["Offset", "Instantly nudge position by (params X, Y). No pose is shown."],
	["Dragged", "Completes instantly every tick — use for a single lean-pose step inside a Sequence (like the real Pinched), not as a whole top-level action."],
];

function cloneJson<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T;
}

function parsePair(raw: string, fallback: { x: number; y: number }): { x: number; y: number } {
	const parts = raw.split(",").map((s) => parseFloat(s.trim()));
	if (parts.length < 2 || parts.some((n) => Number.isNaN(n))) return fallback;
	return { x: parts[0], y: parts[1] };
}

function formatPair(x: number, y: number): string {
	return `${x},${y}`;
}

/** Mirrors Expression.parseCondition's own wrapper/parse rules, but reports success/failure
 * instead of silently degrading to "always true" with a console warning — the whole point of
 * an editor is to catch this kind of mistake before it ships. */
function conditionError(raw: string): string | null {
	const trimmed = raw.trim();
	if (!trimmed) return null;
	const match = EXPR_WRAPPER.exec(trimmed);
	if (!match) return 'Expected the form "#{...}" or "${...}"';
	try {
		parseExpression(match[1]);
		return null;
	} catch (err) {
		return (err as Error).message;
	}
}

type View = "list" | "editAction" | "editBehavior";

/**
 * Settings-driven equivalent of hand-editing actions.xml/behaviors.xml: lets a user add or
 * override actions/behaviors for one pack without leaving Obsidian. Everything here produces
 * plain specs (see shimeji/customContent.ts) that CustomContentBuilder turns into the exact
 * same ActionDef/BehaviorDef shapes the real XML parser produces, so custom content runs
 * through the identical interpreter — no separate code path to keep in sync.
 */
export class CustomContentModal extends Modal {
	private content: CustomPackContent;
	private view: View = "list";
	private draftAction?: CustomActionSpec;
	private draftBehavior?: CustomBehaviorSpec;
	private images: string[] = [];
	private readonly packName: string;
	private readonly imgDir: string | undefined;

	constructor(app: App, private plugin: ShimejiPlugin, private packId: string) {
		super(app);
		const pack = plugin.availablePacks.find((p) => p.id === packId);
		this.packName = pack?.name ?? packId;
		this.imgDir = pack?.imgDir;
		this.content = cloneJson(plugin.settings.customContent[packId] ?? emptyCustomPackContent());
	}

	async onOpen(): Promise<void> {
		this.modalEl.addClass("shimeji-cc-modal");
		this.images = await listPackImages(this.app, this.imgDir);
		this.render();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private async commit(): Promise<void> {
		this.plugin.settings.customContent[this.packId] = this.content;
		await this.plugin.saveSettings();
		this.plugin.applyCustomContent();
	}

	private render(): void {
		this.contentEl.empty();
		if (this.view === "editAction" && this.draftAction) this.renderActionEditor(this.draftAction);
		else if (this.view === "editBehavior" && this.draftBehavior) this.renderBehaviorEditor(this.draftBehavior);
		else this.renderList();
	}

	// ---------------------------------------------------------------- list view

	private renderList(): void {
		this.setTitle(`Custom content — ${this.packName}`);
		const { contentEl } = this;

		contentEl.createEl("p", {
			text: "A custom action/behavior with the same name as a standard one replaces it — exactly like editing actions.xml/behaviors.xml by hand.",
			cls: "setting-item-description",
		});

		this.renderImagesSection(contentEl);

		contentEl.createEl("h3", { text: "Actions" });
		if (this.content.actions.length === 0) {
			contentEl.createEl("p", { text: "No custom actions yet.", cls: "setting-item-description" });
		}
		for (const spec of this.content.actions) {
			const detail = [spec.type, spec.borderType, spec.type === "Embedded" ? spec.embeddedClass || "(no handler chosen)" : ""]
				.filter(Boolean)
				.join(" · ");
			new Setting(contentEl)
				.setName(spec.name || "(unnamed)")
				.setDesc(detail)
				.addExtraButton((b) => b.setIcon("play").setTooltip("Play this on a live mascot").onClick(() => this.playAction(spec.name)))
				.addButton((b) => b.setButtonText("Edit").onClick(() => this.openActionEditor(spec)))
				.addButton((b) => b.setButtonText("Duplicate").onClick(() => this.duplicateAction(spec)))
				.addButton((b) => b.setButtonText("Delete").setWarning().onClick(() => this.deleteAction(spec)));
		}
		new Setting(contentEl).addButton((b) => b.setButtonText("+ New action").setCta().onClick(() => this.openActionEditor()));

		contentEl.createEl("h3", { text: "Behaviors" });
		if (this.content.behaviors.length === 0) {
			contentEl.createEl("p", { text: "No custom behaviors yet.", cls: "setting-item-description" });
		}
		for (const spec of this.content.behaviors) {
			const detail = `Frequency ${spec.frequency}${spec.nextBehaviors.length > 0 ? ` · ${spec.nextBehaviors.length} transition(s)` : ""}`;
			new Setting(contentEl)
				.setName(spec.name || "(unnamed)")
				.setDesc(detail)
				.addButton((b) => b.setButtonText("Edit").onClick(() => this.openBehaviorEditor(spec)))
				.addButton((b) => b.setButtonText("Duplicate").onClick(() => this.duplicateBehavior(spec)))
				.addButton((b) => b.setButtonText("Delete").setWarning().onClick(() => this.deleteBehavior(spec)));
		}
		new Setting(contentEl).addButton((b) => b.setButtonText("+ New behavior").setCta().onClick(() => this.openBehaviorEditor()));

		new Setting(contentEl).addButton((b) => b.setButtonText("Close").onClick(() => this.close()));
	}

	/**
	 * The pack's images: what is in the folder, how to add more, and how to clean one up.
	 *
	 * Here rather than buried in the pose editor because images are the raw material for every
	 * action in the pack — and because until this existed the only way to get a sprite into a pack
	 * was to find the folder in a file manager and drop it in by hand.
	 */
	private renderImagesSection(contentEl: HTMLElement): void {
		contentEl.createEl("h3", { text: "Images" });
		if (!this.imgDir) {
			contentEl.createEl("p", {
				cls: "setting-item-description",
				text: "This pack has no image folder, so images cannot be added from here.",
			});
			return;
		}

		const uploadRow = new Setting(contentEl)
			.setName("Add images")
			.setDesc(`Copied into ${this.imgDir}. Sprite sheets are fine — slice them into poses from an action's pose list.`);
		// A real <label for> wrapping a hidden <input type="file">, not a programmatic .click():
		// Electron blocks a file dialog opened from script without a user gesture it recognises, and
		// the simulated version fails silently.
		const label = uploadRow.controlEl.createEl("label", { cls: "shimeji-upload-label mod-cta", text: "Upload images…" });
		const input = label.createEl("input", { cls: "shimeji-upload-input" });
		input.type = "file";
		input.accept = "image/png,image/jpeg,image/gif,image/webp";
		input.multiple = true;
		input.onchange = async () => {
			const files = Array.from(input.files ?? []);
			input.value = "";
			if (files.length === 0 || !this.imgDir) return;
			try {
				for (const file of files) await importPackImage(this.app, this.imgDir, file.name, await file.arrayBuffer());
				this.images = await listPackImages(this.app, this.imgDir);
				new Notice(`Added ${files.length} image(s).`);
				this.render();
			} catch (e) {
				console.error("[obsidian-shimeji] image import failed", e);
				new Notice(`Couldn't add that image: ${e instanceof Error ? e.message : String(e)}`);
			}
		};

		if (this.images.length === 0) {
			contentEl.createEl("p", { text: "No images in this pack yet.", cls: "setting-item-description" });
			return;
		}

		for (const image of this.images) {
			const used = this.posesUsing(image);
			new Setting(contentEl)
				.setName(image.replace(/^\//, ""))
				.setDesc(used === 0 ? "Not used by any pose" : `Used by ${used} pose(s)`)
				.addButton((b) =>
					b.setButtonText("Remove background…").onClick(() =>
						new RemoveBackgroundModal(this.app, {
							imgDir: this.imgDir!,
							image,
							onApplied: async (newPath) => {
								// Keying a .jpg produces a .png, so any pose pointing at the old name
								// has to follow it or it would silently render nothing.
								if (newPath !== image) this.repointPoses(image, newPath);
								this.images = await listPackImages(this.app, this.imgDir);
								this.render();
							},
						}).open(),
					),
				)
				.addButton((b) =>
					b
						.setButtonText("Delete")
						.setWarning()
						.onClick(async () => {
							if (used > 0) {
								new Notice(`"${image.replace(/^\//, "")}" is still used by ${used} pose(s) — repoint them first.`);
								return;
							}
							await deletePackImage(this.app, this.imgDir!, image);
							this.images = await listPackImages(this.app, this.imgDir);
							this.render();
						}),
				);
		}
	}

	/** How many poses across the whole pack reference an image — the guard against deleting a file
	 * still in use, and the reason a rename has to be followed. */
	private posesUsing(image: string): number {
		let count = 0;
		for (const action of this.content.actions) {
			for (const variant of action.animations) {
				for (const pose of variant.poses) if (pose.image === image) count++;
			}
		}
		return count;
	}

	private repointPoses(from: string, to: string): void {
		for (const action of this.content.actions) {
			for (const variant of action.animations) {
				for (const pose of variant.poses) if (pose.image === from) pose.image = to;
			}
		}
		void this.commit();
	}

	private openActionEditor(spec?: CustomActionSpec): void {
		this.draftAction = spec ? cloneJson(spec) : newActionSpec();
		this.view = "editAction";
		this.render();
	}

	private openBehaviorEditor(spec?: CustomBehaviorSpec): void {
		this.draftBehavior = spec ? cloneJson(spec) : newBehaviorSpec();
		this.view = "editBehavior";
		this.render();
	}

	private async duplicateAction(spec: CustomActionSpec): Promise<void> {
		const copy = cloneJson(spec);
		copy.id = newSpecId();
		copy.name = spec.name ? `${spec.name} copy` : "";
		this.content.actions.push(copy);
		await this.commit();
		this.render();
	}

	private async deleteAction(spec: CustomActionSpec): Promise<void> {
		this.content.actions = this.content.actions.filter((a) => a.id !== spec.id);
		await this.commit();
		this.render();
	}

	private async duplicateBehavior(spec: CustomBehaviorSpec): Promise<void> {
		const copy = cloneJson(spec);
		copy.id = newSpecId();
		copy.name = spec.name ? `${spec.name} copy` : "";
		this.content.behaviors.push(copy);
		await this.commit();
		this.render();
	}

	private async deleteBehavior(spec: CustomBehaviorSpec): Promise<void> {
		this.content.behaviors = this.content.behaviors.filter((b) => b.id !== spec.id);
		await this.commit();
		this.render();
	}

	// ---------------------------------------------------------------- action editor

	private renderActionEditor(spec: CustomActionSpec): void {
		this.setTitle(spec.name ? `Edit action: ${spec.name}` : "New action");
		const { contentEl } = this;

		new Setting(contentEl).setName("Name").addText((t) => t.setValue(spec.name).onChange((v) => (spec.name = v)));

		new Setting(contentEl)
			.setName("Type")
			.addDropdown((d) => {
				for (const t of ACTION_TYPES) d.addOption(t, t);
				d.setValue(spec.type).onChange((v) => {
					spec.type = v as ActionType;
					this.render();
				});
			});

		new Setting(contentEl)
			.setName("Border")
			.setDesc("Floor/Wall/Ceiling keeps this action glued to (falling to reach, if needed) whatever real ledge is beneath or beside it — like the real Stand/ClimbWall/WalkOnCeiling actions.")
			.addDropdown((d) => {
				d.addOption("", "(none)");
				for (const b of BORDER_TYPES) d.addOption(b, b);
				d.setValue(spec.borderType).onChange((v) => (spec.borderType = v as BorderType | ""));
			});

		new Setting(contentEl)
			.setName("Loop")
			.setDesc("Repeat the pose cycle instead of finishing after one pass.")
			.addToggle((t) => t.setValue(spec.loop).onChange((v) => (spec.loop = v)));

		if (spec.type === "Sequence" || spec.type === "Select") {
			this.renderChildrenEditor(contentEl, spec);
		} else {
			if (spec.type === "Embedded") this.renderEmbeddedEditor(contentEl, spec);
			this.renderAnimationsEditor(contentEl, spec);
		}

		new Setting(contentEl)
			.addButton((b) =>
				b
					.setButtonText("Save")
					.setCta()
					.onClick(() => this.saveActionDraft()),
			)
			.addButton((b) => b.setButtonText("▶ Save & play").onClick(() => this.saveAndPlay()))
			.addButton((b) => b.setButtonText("Cancel").onClick(() => this.cancelActionDraft()));
	}

	/**
	 * Saves the draft and immediately plays it, without leaving the editor.
	 *
	 * Saving first is not optional: a mascot plays what is in the built pack, and the draft only
	 * reaches it via commit(). Previewing without saving would show the previous version of the
	 * action while the editor displayed the new one, which is worse than not having a preview.
	 */
	private async saveAndPlay(): Promise<void> {
		const name = this.draftAction?.name.trim();
		if (!(await this.saveActionDraft({ stayOpen: true }))) return;
		if (name) this.playAction(name);
	}

	/** Plays a saved action on a live mascot, reporting in a Notice when it cannot. */
	private playAction(name: string): void {
		const trimmed = name.trim();
		if (!trimmed) {
			new Notice("Give this action a name first.");
			return;
		}
		const problem = this.plugin.previewAction(this.packId, trimmed);
		if (problem) new Notice(problem);
	}

	private renderEmbeddedEditor(container: HTMLElement, spec: CustomActionSpec): void {
		container.createEl("h4", { text: "Native handler" });
		new Setting(container).setName("Class").addDropdown((d) => {
			d.addOption("", "(choose one)");
			for (const [cls] of EMBEDDED_CLASSES) d.addOption(cls, cls);
			d.setValue(spec.embeddedClass).onChange((v) => {
				spec.embeddedClass = v;
				this.render();
			});
		});
		const desc = EMBEDDED_CLASSES.find(([cls]) => cls === spec.embeddedClass)?.[1];
		if (desc) container.createEl("p", { text: desc, cls: "setting-item-description" });

		container.createEl("h5", { text: "Params" });
		this.renderKeyValueEditor(container, spec.params, "Param name (e.g. Gravity, BornX)", "Value (e.g. 0.5 or #{...})");
	}

	private renderAnimationsEditor(container: HTMLElement, spec: CustomActionSpec): void {
		container.createEl("h4", { text: "Poses" });
		container.createEl("p", {
			text:
				spec.animations.length > 1
					? "Multiple variants: the first whose condition passes when this action starts is used for its whole run."
					: 'Add another variant below if the poses should differ by condition (e.g. facing direction) — most actions only need one.',
			cls: "setting-item-description",
		});

		spec.animations.forEach((variant, vi) => {
			const box = container.createDiv({ cls: "shimeji-cc-box" });
			if (spec.animations.length > 1) {
				const hint = box.createDiv({ cls: "shimeji-cc-error" });
				new Setting(box)
					.setName(`Variant ${vi + 1} condition`)
					.addText((t) =>
						t
							.setPlaceholder("#{mascot.lookRight}")
							.setValue(variant.condition)
							.onChange((v) => {
								variant.condition = v;
								hint.setText(conditionError(v) ?? "");
							}),
					)
					.addButton((b) =>
						b.setButtonText("Remove variant").onClick(() => {
							spec.animations.splice(vi, 1);
							this.render();
						}),
					);
				hint.setText(conditionError(variant.condition) ?? "");
			}
			this.renderPoseList(box, variant);
		});

		new Setting(container).addButton((b) =>
			b.setButtonText("+ Add condition variant").onClick(() => {
				spec.animations.push(newAnimationVariantSpec());
				this.render();
			}),
		);
	}

	private renderPoseList(container: HTMLElement, variant: CustomAnimationVariantSpec): void {
		variant.poses.forEach((pose, pi) => {
			const row = container.createDiv({ cls: "shimeji-cc-box shimeji-cc-pose" });
			const header = row.createDiv({ cls: "shimeji-cc-pose-header" });
			const thumb = header.createEl("img", { cls: "shimeji-cc-thumb" });
			this.updateThumb(thumb, pose.image);
			header.createEl("strong", { text: `Pose ${pi + 1}` });

			const imageSetting = new Setting(row).setName("Image");
			const datalistId = "shimeji-cc-images";
			imageSetting.addText((t) => {
				t.inputEl.setAttribute("list", datalistId);
				t.setPlaceholder("/shime1.png")
					.setValue(pose.image)
					.onChange((v) => {
						pose.image = v;
						this.updateThumb(thumb, v);
					});
			});
			if (!container.ownerDocument.getElementById(datalistId)) {
				const datalist = this.contentEl.createEl("datalist", { attr: { id: datalistId } });
				for (const img of this.images) datalist.createEl("option", { attr: { value: img } });
			}

			new Setting(row)
				.setName("Anchor (x,y)")
				.setDesc("Pixel offset from the image's top-left corner to its feet/anchor point.")
				.addText((t) =>
					t
						.setPlaceholder("64,128")
						.setValue(formatPair(pose.anchorX, pose.anchorY))
						.onChange((v) => {
							const p = parsePair(v, { x: pose.anchorX, y: pose.anchorY });
							pose.anchorX = p.x;
							pose.anchorY = p.y;
						}),
				);

			new Setting(row)
				.setName("Velocity (x,y)")
				.setDesc("px/tick. 0,0 for a held pose.")
				.addText((t) =>
					t
						.setPlaceholder("0,0")
						.setValue(formatPair(pose.velocityX, pose.velocityY))
						.onChange((v) => {
							const p = parsePair(v, { x: pose.velocityX, y: pose.velocityY });
							pose.velocityX = p.x;
							pose.velocityY = p.y;
						}),
				);

			new Setting(row)
				.setName("Duration (ticks)")
				.setDesc(`${SHIMEJI_TICK_HINT}`)
				.addText((t) =>
					t
						.setPlaceholder("10")
						.setValue(String(pose.durationTicks))
						.onChange((v) => (pose.durationTicks = parseFloat(v) || 0)),
				)
				.addButton((b) =>
					b.setButtonText("Remove pose").onClick(() => {
						variant.poses.splice(pi, 1);
						this.render();
					}),
				);
		});

		new Setting(container)
			.addButton((b) =>
				b.setButtonText("+ Add pose").onClick(() => {
					variant.poses.push(newPoseSpec());
					this.render();
				}),
			)
			.addButton((b) =>
				b
					.setButtonText("Slice from a sheet…")
					.setCta()
					.onClick(() => this.openSlicer(variant)),
			);
	}

	/**
	 * Cuts poses out of a sprite sheet and appends them to this variant.
	 *
	 * Appends rather than replaces: a walk cycle is often assembled from more than one sheet, and
	 * losing the poses already placed because a second slice was needed would be its own bug.
	 */
	private openSlicer(variant: CustomAnimationVariantSpec): void {
		if (!this.imgDir) {
			new Notice("This pack has no image folder, so there is nowhere to save sliced frames.");
			return;
		}
		if (this.images.length === 0) {
			new Notice("Add an image to the pack first — use “Upload images…” on the main screen.");
			return;
		}
		new SpriteSheetModal(this.app, {
			imgDir: this.imgDir,
			images: this.images,
			initialImage: variant.poses.find((p) => p.image)?.image ?? this.images[0],
			actionName: this.draftAction?.name ?? "pose",
			onPoses: async (poses) => {
				variant.poses.push(...poses);
				// A slice writes new files, so the picker's list is now out of date.
				this.images = await listPackImages(this.app, this.imgDir);
				this.render();
			},
		}).open();
	}

	private updateThumb(img: HTMLImageElement, path: string): void {
		if (path.trim() && this.imgDir) {
			const clean = path.trim().replace(/^[/\\]+/, "");
			img.src = this.app.vault.adapter.getResourcePath(`${this.imgDir}/${clean}`);
			img.style.display = "";
		} else {
			img.style.display = "none";
		}
	}

	private renderChildrenEditor(container: HTMLElement, spec: CustomActionSpec): void {
		container.createEl("h4", { text: spec.type === "Sequence" ? "Steps (run in order)" : "Branches (first matching condition wins)" });
		container.createEl("p", {
			text: "Reference an existing action by name — standard (e.g. Falling, Bouncing, Offset) or one of your own custom actions.",
			cls: "setting-item-description",
		});

		spec.children.forEach((ref, i) => {
			const box = container.createDiv({ cls: "shimeji-cc-box" });
			new Setting(box)
				.setName(`Step ${i + 1}`)
				.addText((t) => t.setPlaceholder("Action name").setValue(ref.name).onChange((v) => (ref.name = v)))
				.addButton((b) =>
					b.setButtonText("Remove step").onClick(() => {
						spec.children.splice(i, 1);
						this.render();
					}),
				);

			const hint = box.createDiv({ cls: "shimeji-cc-error" });
			new Setting(box)
				.setName("Condition (optional)")
				.addText((t) =>
					t
						.setPlaceholder("#{...} or ${...}")
						.setValue(ref.condition)
						.onChange((v) => {
							ref.condition = v;
							hint.setText(conditionError(v) ?? "");
						}),
				);
			hint.setText(conditionError(ref.condition) ?? "");

			box.createEl("div", { text: "Param overrides (e.g. TargetX, Duration):", cls: "setting-item-description" });
			this.renderKeyValueEditor(box, ref.paramOverrides, "Param name", "Value or #{...} / ${...}");
		});

		new Setting(container).addButton((b) =>
			b.setButtonText("+ Add step").onClick(() => {
				spec.children.push(newActionRefSpec());
				this.render();
			}),
		);
	}

	/** Shared free-form key/value list, used for both an Embedded action's own params and an
	 * action reference's param overrides — real packs put arbitrary attribute names here
	 * (Gravity, BornX, TargetX, ...) that only mean something to whichever handler reads them. */
	private renderKeyValueEditor(container: HTMLElement, record: Record<string, string>, keyPlaceholder: string, valuePlaceholder: string): void {
		for (const [key, value] of Object.entries(record)) {
			const row = new Setting(container);
			// Renaming a key deletes the old one and re-renders (so the value input's own
			// closure re-binds to the new key) — that must NOT happen on every keystroke via
			// onChange (which fires on the input event, same as every other text field here),
			// or the field would lose focus after the very first character typed. Committing
			// on blur instead means the whole field is typed before the rename ever fires.
			row.addText((t) => {
				t.setPlaceholder(keyPlaceholder).setValue(key);
				t.inputEl.addEventListener("blur", () => this.renameKey(record, key, t.inputEl.value));
			});
			row.addText((t) =>
				t
					.setPlaceholder(valuePlaceholder)
					.setValue(value)
					.onChange((v) => (record[key] = v)),
			);
			row.addButton((b) =>
				b.setButtonText("Remove").onClick(() => {
					delete record[key];
					this.render();
				}),
			);
		}
		new Setting(container).addButton((b) =>
			b.setButtonText("+ Add param").onClick(() => {
				let n = 1;
				while (`Param${n}` in record) n++;
				record[`Param${n}`] = "";
				this.render();
			}),
		);
	}

	private renameKey(record: Record<string, string>, oldKey: string, newKey: string): void {
		const trimmed = newKey.trim();
		if (!trimmed || trimmed === oldKey) return;
		const value = record[oldKey];
		delete record[oldKey];
		record[trimmed] = value;
		this.render();
	}

	/** Saves the draft action. `stayOpen` keeps the editor showing it — for "Save & play", where
	 * being thrown back to the list after every preview would make iterating on an animation
	 * miserable. Returns whether it validated. */
	private async saveActionDraft(opts?: { stayOpen?: boolean }): Promise<boolean> {
		const draft = this.draftAction;
		if (!draft) return false;
		const name = draft.name.trim();
		if (!name) {
			new Notice("Give this action a name first.");
			return false;
		}
		if (draft.type === "Embedded" && !draft.embeddedClass) {
			new Notice("Pick a native handler for this Embedded action.");
			return false;
		}
		if (this.content.actions.some((a) => a.id !== draft.id && a.name.trim() === name)) {
			new Notice(`Another custom action is already named "${name}" — the later one would silently win. Pick a different name, or edit that one instead.`);
			return false;
		}
		const idx = this.content.actions.findIndex((a) => a.id === draft.id);
		if (idx >= 0) this.content.actions[idx] = draft;
		else this.content.actions.push(draft);
		if (!opts?.stayOpen) {
			this.draftAction = undefined;
			this.view = "list";
		} else {
			// Kept as the live draft, but re-cloned so further edits do not mutate what was just
			// committed to `content` behind the editor's back.
			this.draftAction = cloneJson(draft);
		}
		await this.commit();
		this.render();
		return true;
	}

	private cancelActionDraft(): void {
		this.draftAction = undefined;
		this.view = "list";
		this.render();
	}

	// ---------------------------------------------------------------- behavior editor

	private renderBehaviorEditor(spec: CustomBehaviorSpec): void {
		this.setTitle(spec.name ? `Edit behavior: ${spec.name}` : "New behavior");
		const { contentEl } = this;

		new Setting(contentEl).setName("Name").addText((t) => t.setValue(spec.name).onChange((v) => (spec.name = v)));

		new Setting(contentEl)
			.setName("Frequency")
			.setDesc("Weighted chance of being picked from the general pool. 0 means it's only reachable via another behavior's transitions (like Fall/Dragged/Thrown/ChaseMouse).")
			.addText((t) => t.setValue(String(spec.frequency)).onChange((v) => (spec.frequency = parseFloat(v) || 0)));

		const condHint = contentEl.createDiv({ cls: "shimeji-cc-error" });
		new Setting(contentEl)
			.setName("Condition (optional)")
			.addText((t) =>
				t
					.setPlaceholder("#{mascot.environment.floor.isOn(mascot.anchor)}")
					.setValue(spec.condition)
					.onChange((v) => {
						spec.condition = v;
						condHint.setText(conditionError(v) ?? "");
					}),
			);
		condHint.setText(conditionError(spec.condition) ?? "");

		contentEl.createEl("h4", { text: "Next behaviors" });
		contentEl.createEl("p", {
			text: '"Add to general pool" means these come on top of the normal weighted pick when this behavior finishes; turned off, they become the only options.',
			cls: "setting-item-description",
		});

		spec.nextBehaviors.forEach((next, i) => {
			const box = contentEl.createDiv({ cls: "shimeji-cc-box" });
			new Setting(box)
				.setName(`Transition ${i + 1}: target behavior`)
				.addText((t) => t.setPlaceholder("Behavior name").setValue(next.name).onChange((v) => (next.name = v)))
				.addButton((b) =>
					b.setButtonText("Remove").onClick(() => {
						spec.nextBehaviors.splice(i, 1);
						this.render();
					}),
				);
			new Setting(box).setName("Frequency").addText((t) => t.setValue(String(next.frequency)).onChange((v) => (next.frequency = parseFloat(v) || 0)));
			new Setting(box).setName("Add to general pool").addToggle((t) => t.setValue(next.add).onChange((v) => (next.add = v)));
			const hint = box.createDiv({ cls: "shimeji-cc-error" });
			new Setting(box)
				.setName("Condition (optional)")
				.addText((t) =>
					t
						.setPlaceholder("#{...} or ${...}")
						.setValue(next.condition)
						.onChange((v) => {
							next.condition = v;
							hint.setText(conditionError(v) ?? "");
						}),
				);
			hint.setText(conditionError(next.condition) ?? "");
		});

		new Setting(contentEl).addButton((b) =>
			b.setButtonText("+ Add transition").onClick(() => {
				spec.nextBehaviors.push(newBehaviorNextSpec());
				this.render();
			}),
		);

		new Setting(contentEl)
			.addButton((b) =>
				b
					.setButtonText("Save")
					.setCta()
					.onClick(() => this.saveBehaviorDraft()),
			)
			.addButton((b) => b.setButtonText("Cancel").onClick(() => this.cancelBehaviorDraft()));
	}

	private async saveBehaviorDraft(): Promise<void> {
		if (!this.draftBehavior) return;
		const name = this.draftBehavior.name.trim();
		if (!name) {
			new Notice("Give this behavior a name first.");
			return;
		}
		if (this.content.behaviors.some((b) => b.id !== this.draftBehavior?.id && b.name.trim() === name)) {
			new Notice(`Another custom behavior is already named "${name}" — the later one would silently win. Pick a different name, or edit that one instead.`);
			return;
		}
		const idx = this.content.behaviors.findIndex((b) => b.id === this.draftBehavior?.id);
		if (idx >= 0) this.content.behaviors[idx] = this.draftBehavior;
		else this.content.behaviors.push(this.draftBehavior);
		this.draftBehavior = undefined;
		this.view = "list";
		await this.commit();
		this.render();
	}

	private cancelBehaviorDraft(): void {
		this.draftBehavior = undefined;
		this.view = "list";
		this.render();
	}
}
