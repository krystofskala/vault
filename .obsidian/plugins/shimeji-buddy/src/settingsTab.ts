import { App, Notice, PluginSettingTab, Setting, setIcon, type DropdownComponent, type TextComponent } from "obsidian";
import type ShimejiBuddyPlugin from "./main";
import { ImageEditorModal } from "./ImageEditorModal";
import {
	BUILTIN_TRIGGERS,
	commandTriggerId,
	type BuiltinBehaviorId,
	type CustomAnimation,
	type TriggerDef,
} from "./settings";
import {
	addImageToCharacter,
	createCharacter,
	deleteCharacterImage,
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

/** Display order + labels for the builtin placeholder's configurable idle behaviors. */
const BUILTIN_BEHAVIOR_ORDER: BuiltinBehaviorId[] = [
	"walk",
	"run",
	"jump",
	"punch",
	"pushup",
	"squat",
	"lift",
	"jutsu-clone",
	"jutsu-transform",
	"jutsu-shuriken",
];
const BUILTIN_BEHAVIOR_LABELS: Record<BuiltinBehaviorId, string> = {
	walk: "Walk around",
	run: "Run around",
	jump: "Jump around",
	punch: "Shadow-boxing",
	pushup: "Push-ups",
	squat: "Squats",
	lift: "Dumbbell lift",
	"jutsu-clone": "Multiplication Jutsu",
	"jutsu-transform": "Transformation Jutsu",
	"jutsu-shuriken": "Shuriken Jutsu (throws at your pointer)",
};

export class ShimejiSettingTab extends PluginSettingTab {
	plugin: ShimejiBuddyPlugin;

	private frameCountEls: Record<string, HTMLElement> = {};

	private creatingCharacter = false;
	private importingFolder = false;
	private loadedCharacterFolder: string | null = null;
	private characterFileLoaded = false;
	private characterFile: CharacterFile | null = null;
	private characterImages: string[] = [];

	constructor(app: App, plugin: ShimejiBuddyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	// ---------- layout helpers ----------

	/** A native collapsible section, so a long settings page stays easy to scan. */
	private section(
		containerEl: HTMLElement,
		title: string,
		defaultOpen: boolean,
		render: (body: HTMLElement) => void
	): HTMLElement {
		const details = containerEl.createEl("details", { cls: "sm-section" });
		if (defaultOpen) details.setAttr("open", "");
		details.createEl("summary", { text: title, cls: "sm-section-title" });
		const body = details.createDiv({ cls: "sm-section-body" });
		render(body);
		return body;
	}

	/** A small inline callout for advice that doesn't belong in a setting's own description. */
	private callout(containerEl: HTMLElement, kind: "tip" | "warning" | "info", text: string): void {
		const el = containerEl.createDiv({ cls: `sm-callout sm-callout-${kind}` });
		const icon = el.createSpan({ cls: "sm-callout-icon" });
		setIcon(icon, kind === "tip" ? "lightbulb" : kind === "warning" ? "alert-triangle" : "info");
		el.createDiv({ cls: "sm-callout-text", text });
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

	// ---------- main layout ----------

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

		this.section(containerEl, "General", true, (body) => {
			new Setting(body)
				.setName("Enable buddy")
				.setDesc("Show or hide the character entirely.")
				.addToggle((t) =>
					t.setValue(s.enabled).onChange(async (v) => {
						s.enabled = v;
						await this.plugin.saveSettings();
						this.plugin.applyVisibility();
					})
				);

			new Setting(body)
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

			new Setting(body)
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

			new Setting(body)
				.setName("Click-through")
				.setDesc("Let clicks pass through the buddy to whatever is underneath it (disables dragging and poking).")
				.addToggle((t) =>
					t.setValue(s.clickThrough).onChange(async (v) => {
						s.clickThrough = v;
						await this.plugin.saveSettings();
						this.plugin.applyLiveSettings();
					})
				);

			new Setting(body)
				.setName("Restrict touch to reading view (mobile)")
				.setDesc(
					"On the mobile app, only let you drag or poke the buddy while the open note is in reading " +
						"view - it still animates and reacts either way, it just won't take touch input in edit view."
				)
				.addToggle((t) =>
					t.setValue(s.mobileReadingViewOnly).onChange(async (v) => {
						s.mobileReadingViewOnly = v;
						await this.plugin.saveSettings();
						this.plugin.updateMobileInteractivity();
					})
				);

			new Setting(body)
				.setName("Click counter mode")
				.setDesc(
					"While on, clicking the buddy tallies clicks (shown as a speech-bubble count) and hops it to " +
						"a new nearby spot each time, instead of the normal poke reaction. Assign a hotkey to " +
						"\"Toggle click counter mode\" (Settings → Hotkeys) to flip it on/off without opening settings."
				)
				.addToggle((t) =>
					t.setValue(s.clickCounterEnabled).onChange(async (v) => {
						await this.plugin.setClickCounterEnabled(v);
					})
				);

			this.callout(
				body,
				"tip",
				"\"Size\" is a baseline, not a fixed pixel count - the buddy scales itself to stay a " +
					"sensible size whether Obsidian's on a phone or an ultrawide monitor. This setting is safe " +
					"to configure on desktop even if you mainly use the vault on mobile."
			);
		});

		this.section(containerEl, "Standby behaviour", true, (body) => {
			const idleRow = new Setting(body)
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

			new Setting(body)
				.setName("Roam style")
				.setDesc("Whether the buddy occasionally moves to a new spot on its own instead of just idling in place, and how.")
				.addDropdown((d) => {
					d.addOption("off", "Off - stay in place");
					d.addOption("anywhere", "Anywhere on screen");
					d.addOption("edges", "Along window edges");
					d.setValue(!s.wanderEnabled ? "off" : s.roamStickToEdges ? "edges" : "anywhere");
					d.onChange(async (value) => {
						s.wanderEnabled = value !== "off";
						s.roamStickToEdges = value === "edges";
						await this.plugin.saveSettings();
					});
				});

			new Setting(body)
				.setName("Bored / asleep after")
				.setDesc("Minutes of no vault activity before the buddy gets bored and dozes off.")
				.addText((t) =>
					t.setValue(String(s.sleepAfterMinutes)).onChange(async (v) => {
						const n = Number(v);
						if (!Number.isNaN(n) && n > 0) {
							s.sleepAfterMinutes = n;
							await this.plugin.saveSettings();
						}
					})
				);

			this.callout(
				body,
				"tip",
				"Min/max set the random range between decisions - e.g. 8/20 means it acts every 8 to 20 " +
					"seconds. \"Along window edges\" tracks the sidebar and main-area boundaries live (and " +
					"rotates the buddy so its feet face whichever edge it's on), so resizing or toggling a " +
					"sidebar mid-patrol is fine. The buddy also has a mood, always on in the background: " +
					"energetic \"Happy\" from recent typing/vault activity, \"Bored\" once it's been quiet for " +
					"the duration above, \"Angry\" if you poke or throw it too much too fast, and \"Normal\" the " +
					"rest of the time. Each has its own entry in \"Actions Shimeji can react to\" if you want to " +
					"assign a custom character's own animation to a mood."
			);

			if (s.characterMode === "builtin") {
				this.section(body, "Idle behaviors (builtin placeholder)", false, (behaviorsBody) => {
					behaviorsBody.createEl("p", {
						cls: "setting-item-description",
						text:
							"What the builtin placeholder can do on its own while idle - gaits it roams with (only " +
							"offered while \"Roam style\" above isn't Off) and one-off poses it plays in place. " +
							"Toggle any of these off, or raise/lower a weight to make it more or less likely " +
							"relative to the others (weight 2 is twice as likely as weight 1).",
					});
					for (const id of BUILTIN_BEHAVIOR_ORDER) {
						const cfg = s.builtinBehaviors[id];
						new Setting(behaviorsBody)
							.setName(BUILTIN_BEHAVIOR_LABELS[id])
							.addToggle((t) =>
								t
									.setTooltip("Enabled")
									.setValue(cfg.enabled)
									.onChange(async (v) => {
										cfg.enabled = v;
										await this.plugin.saveSettings();
									})
							)
							.addText((t) =>
								t
									.setPlaceholder("weight")
									.setValue(String(cfg.weight))
									.onChange(async (v) => {
										const n = Number(v);
										if (!Number.isNaN(n) && n >= 0) {
											cfg.weight = n;
											await this.plugin.saveSettings();
										}
									})
							);
					}
				});
			}
		});

		this.section(containerEl, "React to vault actions", false, (body) => {
			const reactionToggle = (name: string, desc: string, key: keyof typeof s) => {
				new Setting(body)
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
		});

		this.section(containerEl, "Actions Shimeji can react to", false, (body) => this.renderActionsSection(body));

		this.section(containerEl, "Speech bubble", false, (body) => {
			new Setting(body)
				.setName("Enable speech bubble")
				.setDesc("Show a short line of text above the buddy's head for reactions.")
				.addToggle((t) =>
					t.setValue(s.speechBubbleEnabled).onChange(async (v) => {
						s.speechBubbleEnabled = v;
						await this.plugin.saveSettings();
					})
				);
		});

		this.section(containerEl, "Character", true, (body) => {
			body.createEl("p", {
				cls: "setting-item-description",
				text:
					"The built-in character is a generic placeholder. Build your own instead: a character is a " +
					"folder that can hold as many images as you want (clean strips or messy full sheets); slice " +
					"whichever frames you need out of any of them, right here.",
			});
			this.callout(
				body,
				"info",
				"Everything below saves itself the moment you change it - straight to that character's " +
					"character.json in your vault. There's no separate save button or step."
			);

			this.renderCharacterPicker(body);

			if (s.characterMode === "character" && s.activeCharacterFolder) {
				this.renderCharacterEditor(body);
			}
		});
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

		containerEl.createEl("p", {
			cls: "setting-item-description",
			text: "Every one of these is assignable to an animation down in the Character section.",
		});
		this.callout(
			containerEl,
			"tip",
			"Built-in ones are already wired to real events. For anything else - any Obsidian command, " +
				"yours or another plugin's - run \"Shimeji Buddy: List all command IDs into current note\" " +
				"from the command palette to paste every command's id into your note, then add the one you " +
				"want below."
		);

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

		this.section(containerEl, "Images", true, (body) => {
			if (this.characterImages.length === 0) {
				body.createEl("p", {
					cls: "setting-item-description",
					text: "No images yet - upload one to get started (a clean strip, a messy full sheet, whatever).",
				});
			}
			for (const img of this.characterImages) {
				new Setting(body)
					.setName(img)
					.addButton((b) =>
						b.setButtonText("Edit frames…").onClick(() => this.openImageEditor(folder, img, null))
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
								this.characterImages = await listCharacterImages(this.app.vault, folder);
								this.display();
							})
					);
			}

			new Setting(body)
				.setName("Upload image")
				.setDesc("Pick PNGs/JPGs/GIFs/WebPs from anywhere on your computer, one or several at once - copied into this character's folder.")
				.addButton((b) => b.setButtonText("Upload…").onClick(() => this.pickAndUploadImage(folder)));

			this.callout(
				body,
				"tip",
				"\"Edit frames…\" opens a bigger dedicated window: drag a box freeform, or set a grid and click " +
					"cells in play order - either way it also lists and manages every animation built from that " +
					"image. Got a whole asset-pack export (several PNGs)? Select them all at once in the upload " +
					"dialog, or use \"Import an existing folder...\" above if you've already placed them in the vault."
			);
		});

		this.section(containerEl, "Animations", true, (body) => {
			if (this.characterImages.length > 0) {
				let newAnimName: TextComponent | undefined;
				let newAnimImage: DropdownComponent | undefined;
				new Setting(body)
					.setName("New animation")
					.setDesc("Adds an empty animation to the list below - open its \"Edit frames\" to slice frames for it.")
					.addText((t) => {
						newAnimName = t;
						t.setPlaceholder("Name");
					})
					.addDropdown((d) => {
						newAnimImage = d;
						for (const img of this.characterImages) d.addOption(img, img);
					})
					.addButton((b) =>
						b
							.setButtonText("+ Add")
							.setCta()
							.onClick(async () => {
								const sourceImage = newAnimImage?.getValue();
								if (!sourceImage || !this.characterFile) return;
								const anim: CustomAnimation = {
									id: newAnimationId(),
									name: newAnimName?.getValue().trim() || `Animation ${this.characterFile.animations.length + 1}`,
									sourceImage,
									triggers: ["idle"],
									moves: true,
									weight: 1,
									enabled: true,
									loop: true,
									fps: 6,
									frames: [],
								};
								this.characterFile.animations.push(anim);
								await this.persistCharacterFile();
								this.display();
							})
					);
			}

			if (this.characterFile!.animations.length === 0) {
				body.createEl("p", {
					cls: "setting-item-description",
					text: "No animations yet - add one above, or upload/edit an image first.",
				});
			}
			for (const anim of this.characterFile!.animations) {
				this.renderCustomAnimationBlock(body, anim);
			}
			this.callout(
				body,
				"warning",
				"An animation with no actions assigned (see its trigger chips) never plays - it just sits " +
					"here unused. Assign it to at least one action, including \"Idle / standby / roaming\" if " +
					"you want it in the standby rotation."
			);
		});
	}

	/** Opens the big dedicated slicing window for one image - freeform drag or grid-pick, plus managing every animation built from it. */
	private openImageEditor(folder: string, imageName: string, presetAnimationId: string | null): void {
		const modal = new ImageEditorModal(this.app, {
			folder,
			imageName,
			presetAnimationId,
			getAnimationsForImage: () =>
				this.characterFile?.animations.filter((a) => a.sourceImage === imageName) ?? [],
			createAnimation: async (name) => {
				const anim: CustomAnimation = {
					id: newAnimationId(),
					name: name || `Animation ${(this.characterFile?.animations.length ?? 0) + 1}`,
					sourceImage: imageName,
					triggers: ["idle"],
					moves: true,
					weight: 1,
					enabled: true,
					loop: true,
					fps: 6,
					frames: [],
				};
				this.characterFile?.animations.push(anim);
				await this.persistCharacterFile();
				return anim;
			},
			renameAnimation: async (id, name) => {
				const anim = this.characterFile?.animations.find((a) => a.id === id);
				if (!anim) return;
				anim.name = name;
				await this.persistCharacterFile();
			},
			deleteAnimation: async (id) => {
				if (!this.characterFile) return;
				this.characterFile.animations = this.characterFile.animations.filter((a) => a.id !== id);
				await this.persistCharacterFile();
			},
			addFrames: async (id, frames) => {
				const anim = this.characterFile?.animations.find((a) => a.id === id);
				if (!anim) return;
				anim.frames.push(...frames);
				anim.enabled = true;
				await this.persistCharacterFile();
			},
			loadSlicerImage: async (slicer) => {
				await slicer.load(this.app.vault, `${folder}/${imageName}`);
			},
			onClosed: () => this.display(),
		});
		modal.open();
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

		const framesRow = new Setting(wrap).setName("Frames");
		framesRow.descEl.empty();
		const countEl = framesRow.descEl.createSpan({ cls: "sm-frame-count" });
		this.frameCountEls[anim.id] = countEl;
		this.refreshFrameCountText(anim.id);
		framesRow
			.addButton((b) =>
				b.setButtonText("Edit frames…").onClick(() => {
					const folder = this.plugin.settings.activeCharacterFolder;
					if (folder) this.openImageEditor(folder, anim.sourceImage, anim.id);
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

		new Setting(wrap)
			.setName("Enabled")
			.setDesc("Off skips this animation entirely - it's never picked for any of its actions, but stays here for later.")
			.addToggle((t) =>
				t.setValue(anim.enabled).onChange(async (v) => {
					anim.enabled = v;
					await this.persistCharacterFile();
				})
			);

		new Setting(wrap)
			.setName("Loop")
			.setDesc("On: repeats from the first frame until the trigger ends. Off: plays once and holds the last frame.")
			.addToggle((t) =>
				t.setValue(anim.loop).onChange(async (v) => {
					anim.loop = v;
					await this.persistCharacterFile();
				})
			);

		new Setting(wrap)
			.setName("Speed")
			.setDesc("Frames per second.")
			.addText((t) =>
				t.setValue(String(anim.fps)).onChange(async (v) => {
					const n = Number(v);
					if (!Number.isNaN(n) && n > 0) {
						anim.fps = n;
						await this.persistCharacterFile();
					}
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

	private pickAndUploadImage(folder: string): void {
		// Must be attached to the DOM before .click() - a detached file input's
		// click() is unreliable in Obsidian's Electron environment. It also
		// needs to be visually-hidden rather than display:none - some Chromium
		// versions don't run the native file dialog for fully-hidden elements,
		// even when they're in the DOM, so this positions it off-screen instead.
		const input = document.createElement("input");
		input.type = "file";
		input.accept = "image/png,image/jpeg,image/gif,image/webp";
		input.multiple = true;
		Object.assign(input.style, {
			position: "fixed",
			top: "-1000px",
			left: "-1000px",
			width: "1px",
			height: "1px",
			opacity: "0",
		});
		document.body.appendChild(input);

		const cleanup = () => input.remove();

		input.onchange = async () => {
			const files = Array.from(input.files ?? []);
			cleanup();
			if (files.length === 0) return;
			try {
				for (const file of files) {
					const buffer = await file.arrayBuffer();
					await addImageToCharacter(this.app.vault, folder, file.name, buffer);
				}
				this.characterImages = await listCharacterImages(this.app.vault, folder);
				this.display();
			} catch (e) {
				console.error("Shimeji Buddy: image upload failed", e);
				new Notice(`Couldn't add that image: ${e instanceof Error ? e.message : String(e)}`);
			}
		};
		// Some Electron/Chromium versions support the "cancel" event on file inputs; clean up if so, harmless no-op otherwise.
		input.addEventListener("cancel", cleanup);
		input.click();
	}
}
