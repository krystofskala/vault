import { App, Notice, PluginSettingTab, Setting, type DropdownComponent, type TextComponent } from "obsidian";
import type ShimejiBuddyPlugin from "./main";
import { AtlasSlicer } from "./AtlasSlicer";
import {
	BUILTIN_TRIGGERS,
	commandTriggerId,
	type AtlasFrameRect,
	type CustomAnimation,
	type TriggerDef,
} from "./settings";
import {
	addImageToCharacter,
	createCharacter,
	deleteCharacterImage,
	generateStripFrames,
	listCharacterImages,
	readCharacterFile,
	writeCharacterFile,
	type CharacterFile,
} from "./spritePack";

function newAnimationId(): string {
	if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
	return `anim-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const NEW_CHARACTER_VALUE = "__new_character__";
const IMPORT_FOLDER_VALUE = "__import_folder__";

export class ShimejiSettingTab extends PluginSettingTab {
	plugin: ShimejiBuddyPlugin;

	private slicer?: AtlasSlicer;
	private pendingTargetAnimationId: string | null = null;
	private frameCountEls: Record<string, HTMLElement> = {};

	private creatingCharacter = false;
	private importingFolder = false;
	private loadedCharacterFolder: string | null = null;
	private characterFileLoaded = false;
	private characterFile: CharacterFile | null = null;
	private characterImages: string[] = [];
	private editingImage: string | null = null;

	constructor(app: App, plugin: ShimejiBuddyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	hide(): void {
		this.slicer?.destroy();
		this.slicer = undefined;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		const s = this.plugin.settings;

		containerEl.createEl("h2", { text: "Shimeji Buddy" });
		containerEl.createEl("p", {
			text:
				"A little character that idles on its own and reacts to what you do in the vault. " +
				"Ships with a generic placeholder - build your own character below to make it look like " +
				"anything you want.",
			cls: "setting-item-description",
		});

		new Setting(containerEl)
			.setName("Enable buddy")
			.setDesc("Show or hide the character entirely.")
			.addToggle((t) =>
				t.setValue(s.enabled).onChange(async (v) => {
					s.enabled = v;
					await this.plugin.saveSettings();
					this.plugin.applyVisibility();
				})
			);

		new Setting(containerEl)
			.setName("Size")
			.setDesc("Base height of the character - scales automatically to stay proportionate on smaller or larger screens.")
			.addSlider((sl) =>
				sl
					.setLimits(48, 240, 4)
					.setValue(s.size)
					.setDynamicTooltip()
					.onChange(async (v) => {
						s.size = v;
						await this.plugin.saveSettings();
						this.plugin.applyLiveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Reset position")
			.setDesc("Puts the buddy back in the bottom-right corner.")
			.addButton((b) =>
				b.setButtonText("Reset").onClick(async () => {
					s.posX = 24;
					s.posY = 24;
					await this.plugin.saveSettings();
					this.plugin.recreateWidget();
				})
			);

		new Setting(containerEl)
			.setName("Click-through")
			.setDesc("Let clicks pass through the buddy to whatever is underneath it (disables dragging and poking).")
			.addToggle((t) =>
				t.setValue(s.clickThrough).onChange(async (v) => {
					s.clickThrough = v;
					await this.plugin.saveSettings();
					this.plugin.applyLiveSettings();
				})
			);

		new Setting(containerEl)
			.setName("Restrict touch to reading view (mobile)")
			.setDesc(
				"On the mobile app, only let you drag or poke the buddy while the open note is in reading " +
					"view - avoids misclicks while typing on a small screen. It keeps animating and reacting " +
					"to what you do either way, it just won't respond to touch in edit view. No effect on " +
					"desktop; safe to set up here even if you're configuring from a computer."
			)
			.addToggle((t) =>
				t.setValue(s.mobileReadingViewOnly).onChange(async (v) => {
					s.mobileReadingViewOnly = v;
					await this.plugin.saveSettings();
					this.plugin.updateMobileInteractivity();
				})
			);

		containerEl.createEl("h3", { text: "Standby behaviour" });

		const idleRow = new Setting(containerEl)
			.setName("Idle interval")
			.setDesc("How often the buddy decides on its own what to do next while nothing is happening.");
		const idleFields = idleRow.controlEl.createDiv({ cls: "sm-slicer-controls" });
		this.mkLabeledNumber(idleFields, "Min sec", s.idleMinSeconds, async (n) => {
			s.idleMinSeconds = n;
			await this.plugin.saveSettings();
			this.plugin.applyLiveSettings();
		});
		this.mkLabeledNumber(idleFields, "Max sec", s.idleMaxSeconds, async (n) => {
			s.idleMaxSeconds = n;
			await this.plugin.saveSettings();
			this.plugin.applyLiveSettings();
		});

		new Setting(containerEl)
			.setName("Wander")
			.setDesc("Let the buddy occasionally run to a random spot anywhere on the screen on its own.")
			.addToggle((t) =>
				t.setValue(s.wanderEnabled).onChange(async (v) => {
					s.wanderEnabled = v;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName("Fall asleep after")
			.setDesc("Minutes of no vault activity before the buddy dozes off.")
			.addText((t) =>
				t.setValue(String(s.sleepAfterMinutes)).onChange(async (v) => {
					const n = Number(v);
					if (!Number.isNaN(n) && n > 0) {
						s.sleepAfterMinutes = n;
						await this.plugin.saveSettings();
					}
				})
			);

		containerEl.createEl("h3", { text: "React to vault actions" });

		const reactionToggle = (name: string, desc: string, key: keyof typeof s) => {
			new Setting(containerEl)
				.setName(name)
				.setDesc(desc)
				.addToggle((t) =>
					t.setValue(s[key] as boolean).onChange(async (v) => {
						(s[key] as boolean) = v;
						await this.plugin.saveSettings();
					})
				);
		};

		reactionToggle("Opening a note", "Greet you when you open a file.", "reactToOpen");
		reactionToggle("Creating a note", "Cheer when a new file is created.", "reactToCreate");
		reactionToggle("Deleting a note", "React sadly when a file is deleted.", "reactToDelete");
		reactionToggle("Editing a note", "Nod along while you're editing (debounced).", "reactToModify");
		reactionToggle("Renaming a note", "Look surprised when a file is renamed.", "reactToRename");
		reactionToggle("Searching", "Look thoughtful while the search pane is open.", "reactToSearch");

		this.renderActionsSection(containerEl);

		containerEl.createEl("h3", { text: "Speech bubble" });

		new Setting(containerEl)
			.setName("Enable speech bubble")
			.setDesc("Show a short line of text above the buddy's head for reactions.")
			.addToggle((t) =>
				t.setValue(s.speechBubbleEnabled).onChange(async (v) => {
					s.speechBubbleEnabled = v;
					await this.plugin.saveSettings();
				})
			);

		containerEl.createEl("h3", { text: "Character" });
		containerEl.createEl("p", {
			cls: "setting-item-description",
			text:
				"The built-in character is a generic placeholder. Build your own instead: a character is a " +
				"folder that can hold as many images as you want (clean strips or messy full sheets); slice " +
				"whichever frames you need out of any of them, right here.",
		});

		this.renderCharacterPicker(containerEl);

		if (s.characterMode === "character" && s.activeCharacterFolder) {
			this.renderCharacterEditor(containerEl);
		}
	}

	private mkLabeledNumber(
		parent: HTMLElement,
		label: string,
		value: number,
		onCommit: (n: number) => void | Promise<void>
	): HTMLInputElement {
		const wrap = parent.createDiv({ cls: "sm-slicer-field" });
		wrap.createEl("label", { text: label });
		const input = wrap.createEl("input", { type: "number", attr: { min: "1" } });
		input.value = String(value);
		input.addEventListener("change", () => {
			const n = Number(input.value);
			if (!Number.isNaN(n) && n > 0) onCommit(n);
		});
		return input;
	}

	// ---------- actions reference + command triggers ----------

	private allKnownTriggers(): TriggerDef[] {
		const commandDefs: TriggerDef[] = this.plugin.settings.commandTriggers.map((c) => ({
			id: commandTriggerId(c.commandId),
			label: `${c.label || c.commandId} (command)`,
		}));
		return [...BUILTIN_TRIGGERS, ...commandDefs];
	}

	private renderActionsSection(containerEl: HTMLElement): void {
		const s = this.plugin.settings;

		containerEl.createEl("h3", { text: "Actions Shimeji can react to" });
		containerEl.createEl("p", {
			cls: "setting-item-description",
			text:
				"Every one of these is assignable to an animation down in the Character section. Built-in " +
				"ones are wired to real events already. For anything else - any Obsidian command, yours or " +
				"another plugin's - run \"Shimeji Buddy: List all command IDs into current note\" from the " +
				"command palette to paste every command's id into your note, then add the one you want below.",
		});

		const list = containerEl.createEl("ul", { cls: "sm-trigger-list" });
		for (const t of BUILTIN_TRIGGERS) {
			list.createEl("li", { text: `${t.label} — ${t.id}` });
		}
		for (const c of s.commandTriggers) {
			const li = list.createEl("li");
			li.createSpan({ text: `${c.label || c.commandId} — ${commandTriggerId(c.commandId)} ` });
			const remove = li.createEl("span", { text: "(remove)", cls: "sm-trigger-remove" });
			remove.onclick = async () => {
				s.commandTriggers = s.commandTriggers.filter((x) => x.commandId !== c.commandId);
				await this.plugin.saveSettings();
				this.display();
			};
		}

		let commandIdInput: TextComponent | undefined;
		let commandLabelInput: TextComponent | undefined;
		new Setting(containerEl)
			.setName("Add a command trigger")
			.setDesc("Paste a command id from the list above and give it a short label.")
			.addText((t) => {
				commandIdInput = t;
				t.setPlaceholder("editor:toggle-bold");
			})
			.addText((t) => {
				commandLabelInput = t;
				t.setPlaceholder("Label (optional)");
			})
			.addButton((b) =>
				b.setButtonText("Add").onClick(async () => {
					const commandId = commandIdInput?.getValue().trim();
					if (!commandId || s.commandTriggers.some((c) => c.commandId === commandId)) return;
					s.commandTriggers.push({ commandId, label: commandLabelInput?.getValue().trim() || commandId });
					await this.plugin.saveSettings();
					this.display();
				})
			);
	}

	// ---------- character picker ----------

	private renderCharacterPicker(containerEl: HTMLElement): void {
		const s = this.plugin.settings;

		if (!this.plugin.availableCharactersLoaded) {
			this.plugin.refreshAvailableCharacters().then(() => this.display());
		}

		new Setting(containerEl)
			.setName("Character source")
			.setDesc("Which character is active.")
			.addDropdown((d) => {
				d.addOption("builtin", "Built-in placeholder (generic)");
				for (const c of this.plugin.availableCharacters) d.addOption(c.path, c.label);
				d.addOption(NEW_CHARACTER_VALUE, "+ New character...");
				d.addOption(IMPORT_FOLDER_VALUE, "Import an existing folder...");
				d.setValue(
					s.characterMode === "character" && s.activeCharacterFolder ? s.activeCharacterFolder : "builtin"
				);
				d.onChange(async (value) => {
					if (value === NEW_CHARACTER_VALUE) {
						this.creatingCharacter = true;
						this.display();
						return;
					}
					if (value === IMPORT_FOLDER_VALUE) {
						this.importingFolder = true;
						this.display();
						return;
					}
					if (value === "builtin") {
						s.characterMode = "builtin";
					} else {
						s.characterMode = "character";
						s.activeCharacterFolder = value;
						this.characterFileLoaded = false;
						this.editingImage = null;
					}
					await this.plugin.saveSettings();
					await this.plugin.reloadSpritePack();
					this.display();
				});
			})
			.addExtraButton((b) =>
				b
					.setIcon("refresh-cw")
					.setTooltip("Rescan characters/ folder")
					.onClick(async () => {
						await this.plugin.refreshAvailableCharacters();
						this.display();
					})
			);

		if (this.creatingCharacter) {
			let nameInput: TextComponent | undefined;
			new Setting(containerEl)
				.setName("New character name")
				.addText((t) => {
					nameInput = t;
					t.setPlaceholder("My character");
				})
				.addButton((b) =>
					b
						.setButtonText("Create")
						.setCta()
						.onClick(async () => {
							const name = nameInput?.getValue().trim();
							if (!name) return;
							const folder = await createCharacter(this.app.vault, this.plugin.getCharactersDir(), name);
							s.characterMode = "character";
							s.activeCharacterFolder = folder;
							this.characterFileLoaded = false;
							this.editingImage = null;
							this.creatingCharacter = false;
							await this.plugin.saveSettings();
							await this.plugin.refreshAvailableCharacters();
							await this.plugin.reloadSpritePack();
							this.display();
						})
				)
				.addExtraButton((b) =>
					b.setIcon("x").setTooltip("Cancel").onClick(() => {
						this.creatingCharacter = false;
						this.display();
					})
				);
		}

		if (this.importingFolder) {
			let pathInput: TextComponent | undefined;
			new Setting(containerEl)
				.setName("Folder to import")
				.setDesc(
					"Vault-relative path to a folder that already has your images in it - e.g. one you " +
						"copied in with your file manager, or dragged into Obsidian. Any PNGs already there " +
						"become sliceable immediately; nothing is moved or copied."
				)
				.addText((t) => {
					pathInput = t;
					t.setPlaceholder("Assets/MyCharacter");
				})
				.addButton((b) =>
					b
						.setButtonText("Use this folder")
						.setCta()
						.onClick(async () => {
							const path = pathInput?.getValue().trim();
							if (!path) return;
							if (!(await this.app.vault.adapter.exists(path))) {
								new Notice(`Folder "${path}" wasn't found in this vault.`);
								return;
							}
							s.characterMode = "character";
							s.activeCharacterFolder = path;
							this.characterFileLoaded = false;
							this.editingImage = null;
							this.importingFolder = false;
							await this.plugin.saveSettings();
							await this.plugin.reloadSpritePack();
							this.display();
						})
				)
				.addExtraButton((b) =>
					b.setIcon("x").setTooltip("Cancel").onClick(() => {
						this.importingFolder = false;
						this.display();
					})
				);
		}
	}

	// ---------- character editor ----------

	private renderCharacterEditor(containerEl: HTMLElement): void {
		const s = this.plugin.settings;
		const folder = s.activeCharacterFolder;

		if (this.loadedCharacterFolder !== folder) {
			this.loadedCharacterFolder = folder;
			this.characterFileLoaded = false;
			Promise.all([readCharacterFile(this.app.vault, folder), listCharacterImages(this.app.vault, folder)]).then(
				([file, images]) => {
					this.characterFile = file;
					this.characterImages = images;
					this.characterFileLoaded = true;
					this.display();
				}
			);
		}

		if (!this.characterFileLoaded || !this.characterFile) {
			containerEl.createEl("p", { cls: "setting-item-description", text: "Loading character…" });
			return;
		}

		containerEl.createEl("h4", { text: "Images" });
		if (this.characterImages.length === 0) {
			containerEl.createEl("p", {
				cls: "setting-item-description",
				text: "No images yet - upload one to get started (a clean strip, a messy full sheet, whatever).",
			});
		}
		for (const img of this.characterImages) {
			const isEditing = this.editingImage === img;
			new Setting(containerEl)
				.setName(img)
				.addButton((b) =>
					b
						.setButtonText(isEditing ? "Editing" : "Slice frames")
						.setDisabled(isEditing)
						.onClick(async () => {
							this.editingImage = img;
							await this.loadSlicerImage();
							this.display();
						})
				)
				.addExtraButton((b) =>
					b
						.setIcon("trash-2")
						.setTooltip("Delete image (and any animations using it)")
						.onClick(async () => {
							await deleteCharacterImage(this.app.vault, folder, img);
							if (this.characterFile) {
								this.characterFile.animations = this.characterFile.animations.filter(
									(a) => a.sourceImage !== img
								);
								await this.persistCharacterFile();
							}
							if (this.editingImage === img) this.editingImage = null;
							this.characterImages = await listCharacterImages(this.app.vault, folder);
							this.display();
						})
				);
		}

		new Setting(containerEl)
			.setName("Upload image")
			.setDesc("Pick a PNG (or JPG/GIF/WebP) from anywhere on your computer - it's copied into this character's folder.")
			.addButton((b) => b.setButtonText("Upload…").onClick(() => this.pickAndUploadImage(folder)));

		containerEl.createEl("h4", { text: "Slice frames" });
		if (!this.editingImage) {
			containerEl.createEl("p", {
				cls: "setting-item-description",
				text: "Pick \"Slice frames\" on an image above to start.",
			});
		} else {
			this.renderSlicer(containerEl, folder);
		}

		containerEl.createEl("h4", { text: "Animations" });
		if (this.characterFile.animations.length === 0) {
			containerEl.createEl("p", {
				cls: "setting-item-description",
				text: "No animations yet - slice some frames above to create your first one.",
			});
		}
		for (const anim of this.characterFile.animations) {
			this.renderCustomAnimationBlock(containerEl, anim);
		}
	}

	private renderSlicer(containerEl: HTMLElement, folder: string): void {
		containerEl.createEl("p", {
			cls: "setting-item-description",
			text: `Editing: ${this.editingImage}. Drag a box around a frame (or type exact coordinates), then add it to an animation - or use "Generate strip frames" below if this image is an evenly-spaced strip.`,
		});

		const slicerHost = containerEl.createDiv();
		if (!this.slicer) {
			this.slicer = new AtlasSlicer(slicerHost);
			this.loadSlicerImage();
		} else {
			slicerHost.appendChild(this.slicer.rootEl);
		}

		const controls = containerEl.createDiv({ cls: "sm-slicer-controls" });
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
		syncInputsFromSelection(this.slicer.getSelection());

		const commitInputsToSelection = () => {
			const x = Number(xInput.value);
			const y = Number(yInput.value);
			const w = Number(wInput.value);
			const h = Number(hInput.value);
			if ([x, y, w, h].some((n) => Number.isNaN(n))) return;
			this.slicer?.setSelection({ x, y, w: Math.max(1, w), h: Math.max(1, h) });
		};
		for (const input of [xInput, yInput, wInput, hInput]) {
			input.addEventListener("change", commitInputsToSelection);
		}

		const relevantAnims = this.characterFile?.animations.filter((a) => a.sourceImage === this.editingImage) ?? [];
		new Setting(containerEl)
			.setName("Add selection to")
			.setDesc("Pick an existing animation for this image, or create a new one.")
			.addDropdown((d) => {
				d.addOption("__new__", "+ New animation");
				for (const anim of relevantAnims) d.addOption(anim.id, anim.name || "(unnamed)");
				d.setValue(this.pendingTargetAnimationId ?? "__new__");
				d.onChange((v) => {
					this.pendingTargetAnimationId = v === "__new__" ? null : v;
				});
			})
			.addButton((b) =>
				b
					.setButtonText("Add frame")
					.setCta()
					.onClick(async () => {
						const sel = this.slicer?.getSelection();
						if (!sel) return;
						await this.appendFramesToTargetAnimation(folder, [sel]);
					})
			);

		let stripCountInput: TextComponent | undefined;
		new Setting(containerEl)
			.setName("Generate strip frames")
			.setDesc("For an evenly-spaced horizontal strip: how many equal-width frames does this image contain?")
			.addText((t) => {
				stripCountInput = t;
				t.setPlaceholder("e.g. 6");
			})
			.addButton((b) =>
				b.setButtonText("Generate").onClick(async () => {
					const size = this.slicer?.getNaturalSize();
					const count = Number(stripCountInput?.getValue());
					if (!size || !count || count < 1) return;
					const frames = generateStripFrames(size.width, size.height, count);
					await this.appendFramesToTargetAnimation(folder, frames);
				})
			);
	}

	private async appendFramesToTargetAnimation(folder: string, frames: AtlasFrameRect[]): Promise<void> {
		if (!this.characterFile || !this.editingImage) return;
		let anim = this.characterFile.animations.find((a) => a.id === this.pendingTargetAnimationId);
		if (!anim || anim.sourceImage !== this.editingImage) {
			anim = {
				id: newAnimationId(),
				name: `Animation ${this.characterFile.animations.length + 1}`,
				sourceImage: this.editingImage,
				triggers: ["idle"],
				moves: true,
				weight: 1,
				enabled: true,
				loop: true,
				fps: 6,
				frames: [],
			};
			this.characterFile.animations.push(anim);
			this.pendingTargetAnimationId = anim.id;
		}
		anim.frames.push(...frames);
		anim.enabled = true;
		await this.persistCharacterFile();
		this.display();
	}

	private renderCustomAnimationBlock(containerEl: HTMLElement, anim: CustomAnimation): void {
		const wrap = containerEl.createDiv({ cls: "sm-anim-block" });

		new Setting(wrap)
			.setName("Name")
			.setDesc(`Source image: ${anim.sourceImage}`)
			.addText((t) =>
				t.setValue(anim.name).onChange(async (v) => {
					anim.name = v;
					await this.persistCharacterFile();
				})
			)
			.addExtraButton((b) =>
				b
					.setIcon("trash-2")
					.setTooltip("Delete this animation")
					.onClick(async () => {
						if (!this.characterFile) return;
						this.characterFile.animations = this.characterFile.animations.filter((a) => a.id !== anim.id);
						if (this.pendingTargetAnimationId === anim.id) this.pendingTargetAnimationId = null;
						await this.persistCharacterFile();
						this.display();
					})
			);

		const allKnown = this.allKnownTriggers();
		const chipRow = wrap.createDiv({ cls: "sm-chip-row" });
		if (anim.triggers.length === 0) {
			chipRow.createSpan({ cls: "setting-item-description", text: "Not assigned to anything yet." });
		}
		for (const triggerId of anim.triggers) {
			const label = allKnown.find((k) => k.id === triggerId)?.label ?? triggerId;
			const chip = chipRow.createSpan({ cls: "sm-chip" });
			chip.createSpan({ text: label });
			const remove = chip.createSpan({ cls: "sm-chip-remove", text: "×" });
			remove.onclick = async () => {
				anim.triggers = anim.triggers.filter((x) => x !== triggerId);
				await this.persistCharacterFile();
				this.display();
			};
		}

		const remaining = allKnown.filter((k) => !anim.triggers.includes(k.id));
		if (remaining.length > 0) {
			let addDropdown: DropdownComponent | undefined;
			new Setting(wrap)
				.setName("Add trigger")
				.setDesc("Assign this animation to another action too.")
				.addDropdown((d) => {
					addDropdown = d;
					for (const t of remaining) d.addOption(t.id, t.label);
				})
				.addButton((b) =>
					b.setButtonText("Add").onClick(async () => {
						const value = addDropdown?.getValue();
						if (!value) return;
						anim.triggers.push(value);
						await this.persistCharacterFile();
						this.display();
					})
				);
		}

		if (anim.triggers.includes("idle")) {
			new Setting(wrap)
				.setName("Moves around the screen")
				.setDesc("On: played while roaming to a new spot. Off: played in place, like resting.")
				.addToggle((t) =>
					t.setValue(anim.moves).onChange(async (v) => {
						anim.moves = v;
						await this.persistCharacterFile();
					})
				);
		}

		new Setting(wrap)
			.setName("Probability weight")
			.setDesc("Relative chance of being picked vs. other enabled animations sharing any of the same actions.")
			.addText((t) =>
				t.setValue(String(anim.weight)).onChange(async (v) => {
					const n = Number(v);
					if (!Number.isNaN(n) && n >= 0) {
						anim.weight = n;
						await this.persistCharacterFile();
					}
				})
			);

		const playbackRow = new Setting(wrap).setName("Playback");
		playbackRow.descEl.empty();
		const countEl = playbackRow.descEl.createSpan({ cls: "sm-frame-count" });
		this.frameCountEls[anim.id] = countEl;
		this.refreshFrameCountText(anim.id);

		playbackRow
			.addToggle((t) =>
				t
					.setTooltip("Enabled")
					.setValue(anim.enabled)
					.onChange(async (v) => {
						anim.enabled = v;
						await this.persistCharacterFile();
					})
			)
			.addText((t) =>
				t
					.setPlaceholder("fps")
					.setValue(String(anim.fps))
					.onChange(async (v) => {
						const n = Number(v);
						if (!Number.isNaN(n) && n > 0) {
							anim.fps = n;
							await this.persistCharacterFile();
						}
					})
			)
			.addToggle((t) =>
				t
					.setTooltip("Loop")
					.setValue(anim.loop)
					.onChange(async (v) => {
						anim.loop = v;
						await this.persistCharacterFile();
					})
			)
			.addExtraButton((b) =>
				b
					.setIcon("undo-2")
					.setTooltip("Remove last frame")
					.onClick(async () => {
						anim.frames.pop();
						await this.persistCharacterFile();
						this.refreshFrameCountText(anim.id);
					})
			)
			.addExtraButton((b) =>
				b
					.setIcon("trash-2")
					.setTooltip("Clear all frames")
					.onClick(async () => {
						anim.frames = [];
						await this.persistCharacterFile();
						this.refreshFrameCountText(anim.id);
					})
			);
	}

	private refreshFrameCountText(animId: string): void {
		const el = this.frameCountEls[animId];
		if (!el) return;
		const anim = this.characterFile?.animations.find((a) => a.id === animId);
		const count = anim ? anim.frames.length : 0;
		el.setText(count === 1 ? "1 frame" : `${count} frames`);
	}

	private async persistCharacterFile(): Promise<void> {
		if (!this.characterFile || !this.plugin.settings.activeCharacterFolder) return;
		await writeCharacterFile(this.app.vault, this.plugin.settings.activeCharacterFolder, this.characterFile);
		await this.plugin.reloadSpritePack();
	}

	private async loadSlicerImage(): Promise<void> {
		if (!this.slicer || !this.editingImage || !this.plugin.settings.activeCharacterFolder) return;
		await this.slicer.load(this.app.vault, `${this.plugin.settings.activeCharacterFolder}/${this.editingImage}`);
	}

	private pickAndUploadImage(folder: string): void {
		// Must be attached to the DOM before .click() - a detached file input's
		// click() is unreliable (often a silent no-op) in Obsidian's Electron/
		// WebView environment.
		const input = document.createElement("input");
		input.type = "file";
		input.accept = "image/png,image/jpeg,image/gif,image/webp";
		input.multiple = true;
		input.style.display = "none";
		document.body.appendChild(input);

		const cleanup = () => input.remove();

		input.onchange = async () => {
			const files = Array.from(input.files ?? []);
			cleanup();
			if (files.length === 0) return;
			let lastSaved: string | null = null;
			for (const file of files) {
				const buffer = await file.arrayBuffer();
				lastSaved = await addImageToCharacter(this.app.vault, folder, file.name, buffer);
			}
			this.characterImages = await listCharacterImages(this.app.vault, folder);
			if (lastSaved) this.editingImage = lastSaved;
			await this.loadSlicerImage();
			this.display();
		};
		// Some Electron/Chromium versions support the "cancel" event on file inputs; clean up if so, harmless no-op otherwise.
		input.addEventListener("cancel", cleanup);
		input.click();
	}
}
