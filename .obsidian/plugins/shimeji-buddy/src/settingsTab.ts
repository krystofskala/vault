import { App, PluginSettingTab, Setting } from "obsidian";
import type ShimejiBuddyPlugin from "./main";
import { AtlasSlicer } from "./AtlasSlicer";
import {
	REACTION_LABELS,
	REACTION_NAMES,
	type AtlasFrameRect,
	type CharacterMode,
	type ReactionName,
} from "./settings";

export class ShimejiSettingTab extends PluginSettingTab {
	plugin: ShimejiBuddyPlugin;

	private slicer?: AtlasSlicer;
	private pendingTargetReaction: ReactionName = "idle";
	private frameCountEls: Partial<Record<ReactionName, HTMLElement>> = {};

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
				"Ships with a generic placeholder - pick or drop in sprites of whatever character you like " +
				"below, however you find them.",
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
			.setDesc("Height of the character, in pixels.")
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

		containerEl.createEl("h3", { text: "Standby behaviour" });

		new Setting(containerEl)
			.setName("Idle interval")
			.setDesc("How often (seconds) the buddy decides on its own what to do next while nothing is happening.")
			.addText((t) =>
				t
					.setPlaceholder("min")
					.setValue(String(s.idleMinSeconds))
					.onChange(async (v) => {
						const n = Number(v);
						if (!Number.isNaN(n) && n > 0) {
							s.idleMinSeconds = n;
							await this.plugin.saveSettings();
							this.plugin.applyLiveSettings();
						}
					})
			)
			.addText((t) =>
				t
					.setPlaceholder("max")
					.setValue(String(s.idleMaxSeconds))
					.onChange(async (v) => {
						const n = Number(v);
						if (!Number.isNaN(n) && n > 0) {
							s.idleMaxSeconds = n;
							await this.plugin.saveSettings();
							this.plugin.applyLiveSettings();
						}
					})
			);

		new Setting(containerEl)
			.setName("Wander")
			.setDesc("Let the buddy occasionally walk to a new spot along the edge on its own.")
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
				"The built-in character is a generic placeholder. Bring your own character instead: use a " +
				"folder pack (manifest.json + sprite strips), or a single freeform spritesheet sliced right " +
				"here in settings - whatever sprites you've got, in whatever shape you found them.",
		});

		new Setting(containerEl)
			.setName("Character source")
			.setDesc("Where the buddy's look comes from.")
			.addDropdown((d) => {
				d.addOption("builtin", "Built-in placeholder (generic)");
				d.addOption("pack", "Folder pack (manifest.json + sprite strips)");
				d.addOption("atlas", "Single spritesheet (slice it below)");
				d.setValue(s.characterMode);
				d.onChange(async (v) => {
					s.characterMode = v as CharacterMode;
					await this.plugin.saveSettings();
					await this.plugin.reloadSpritePack();
					this.display();
				});
			});

		if (s.characterMode === "pack") {
			this.renderPackSection(containerEl);
		} else if (s.characterMode === "atlas") {
			this.renderAtlasSection(containerEl);
		}
	}

	// ---------- folder-pack mode ----------

	private renderPackSection(containerEl: HTMLElement): void {
		const s = this.plugin.settings;

		containerEl.createEl("p", {
			cls: "setting-item-description",
			text:
				"Drop a pack's folder into characters/ inside this plugin's folder (each one needs a " +
				"manifest.json plus its sprite strips - see characters/example-pack for the format), then pick it below.",
		});

		if (!this.plugin.availablePacksLoaded) {
			this.plugin.refreshAvailablePacks().then(() => this.display());
		}

		const CUSTOM_VALUE = "__custom__";
		const knownPaths = this.plugin.availablePacks.map((p) => p.path);
		const dropdownValue =
			s.customCharacterFolder === ""
				? ""
				: knownPaths.includes(s.customCharacterFolder)
				? s.customCharacterFolder
				: CUSTOM_VALUE;

		let customPathText: import("obsidian").TextComponent | undefined;

		new Setting(containerEl)
			.setName("Character pack")
			.setDesc("Choose a discovered pack, or pick \"Custom path...\" to point at one manually below.")
			.addDropdown((d) => {
				d.addOption("", "Built-in placeholder (generic)");
				for (const pack of this.plugin.availablePacks) d.addOption(pack.path, pack.label);
				d.addOption(CUSTOM_VALUE, "Custom path...");
				d.setValue(dropdownValue);
				d.onChange(async (value) => {
					if (value === CUSTOM_VALUE) {
						this.display();
						return;
					}
					s.customCharacterFolder = value;
					customPathText?.setValue(value);
					await this.plugin.saveSettings();
					await this.plugin.reloadSpritePack();
				});
			})
			.addExtraButton((b) =>
				b
					.setIcon("refresh-cw")
					.setTooltip("Rescan characters/ for packs")
					.onClick(async () => {
						await this.plugin.refreshAvailablePacks();
						this.display();
					})
			);

		new Setting(containerEl)
			.setName("Custom pack path")
			.setDesc(
				"Vault-relative folder path, e.g. .obsidian/plugins/shimeji-buddy/characters/my-pack. Leave empty for the built-in placeholder."
			)
			.addText((t) => {
				customPathText = t;
				t.setPlaceholder(".obsidian/plugins/shimeji-buddy/characters/my-pack")
					.setValue(s.customCharacterFolder)
					.onChange(async (v) => {
						s.customCharacterFolder = v.trim();
						await this.plugin.saveSettings();
						await this.plugin.reloadSpritePack();
					});
			});
	}

	// ---------- freeform atlas mode ----------

	private renderAtlasSection(containerEl: HTMLElement): void {
		const s = this.plugin.settings;

		containerEl.createEl("p", {
			cls: "setting-item-description",
			text:
				"For spritesheets that aren't a uniform grid (frames of different sizes, packed however they " +
				"packed them). Point at one image, drag a box around a frame below (or type exact pixel " +
				"coordinates), pick which animation it belongs to, and add it - repeat in order for every frame " +
				"of every animation you want.",
		});

		new Setting(containerEl)
			.setName("Spritesheet image")
			.setDesc("Vault-relative path to a single image containing all your frames.")
			.addText((t) =>
				t
					.setPlaceholder(".obsidian/plugins/shimeji-buddy/characters/my-sheet.png")
					.setValue(s.atlasImagePath)
					.onChange(async (v) => {
						s.atlasImagePath = v.trim();
						await this.plugin.saveSettings();
						await this.plugin.reloadSpritePack();
						await this.loadSlicerImage();
					})
			);

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

		new Setting(containerEl)
			.setName("Add selection to")
			.setDesc("Which animation the currently selected frame should be appended to.")
			.addDropdown((d) => {
				for (const name of REACTION_NAMES) d.addOption(name, REACTION_LABELS[name]);
				d.setValue(this.pendingTargetReaction);
				d.onChange((v) => {
					this.pendingTargetReaction = v as ReactionName;
				});
			})
			.addButton((b) =>
				b
					.setButtonText("Add frame")
					.setCta()
					.onClick(async () => {
						const sel = this.slicer?.getSelection();
						if (!sel) return;
						const cfg = s.atlasAnimations[this.pendingTargetReaction];
						cfg.frames.push({ ...sel });
						cfg.enabled = true;
						await this.plugin.saveSettings();
						await this.plugin.reloadSpritePack();
						this.refreshFrameCountText(this.pendingTargetReaction);
					})
			);

		containerEl.createEl("h4", { text: "Animations" });
		containerEl.createEl("p", {
			cls: "setting-item-description",
			text: "Undo removes the most recently added frame; frames play back in the order you added them.",
		});

		for (const name of REACTION_NAMES) {
			const cfg = s.atlasAnimations[name];
			const row = new Setting(containerEl).setName(REACTION_LABELS[name]);
			row.descEl.empty();
			const countEl = row.descEl.createSpan({ cls: "sm-frame-count" });
			this.frameCountEls[name] = countEl;
			this.refreshFrameCountText(name);

			row.addToggle((t) =>
				t
					.setTooltip("Use this animation")
					.setValue(cfg.enabled)
					.onChange(async (v) => {
						cfg.enabled = v;
						await this.plugin.saveSettings();
						await this.plugin.reloadSpritePack();
					})
			);
			row.addText((t) =>
				t
					.setPlaceholder("fps")
					.setValue(String(cfg.fps))
					.onChange(async (v) => {
						const n = Number(v);
						if (!Number.isNaN(n) && n > 0) {
							cfg.fps = n;
							await this.plugin.saveSettings();
							await this.plugin.reloadSpritePack();
						}
					})
			);
			row.addToggle((t) =>
				t
					.setTooltip("Loop")
					.setValue(cfg.loop)
					.onChange(async (v) => {
						cfg.loop = v;
						await this.plugin.saveSettings();
						await this.plugin.reloadSpritePack();
					})
			);
			row.addExtraButton((b) =>
				b
					.setIcon("undo-2")
					.setTooltip("Remove last frame")
					.onClick(async () => {
						cfg.frames.pop();
						await this.plugin.saveSettings();
						await this.plugin.reloadSpritePack();
						this.refreshFrameCountText(name);
					})
			);
			row.addExtraButton((b) =>
				b
					.setIcon("trash-2")
					.setTooltip("Clear all frames")
					.onClick(async () => {
						cfg.frames = [];
						cfg.enabled = false;
						await this.plugin.saveSettings();
						await this.plugin.reloadSpritePack();
						this.refreshFrameCountText(name);
					})
			);
		}
	}

	private refreshFrameCountText(name: ReactionName): void {
		const el = this.frameCountEls[name];
		if (!el) return;
		const count = this.plugin.settings.atlasAnimations[name].frames.length;
		el.setText(count === 1 ? "1 frame" : `${count} frames`);
	}

	private async loadSlicerImage(): Promise<void> {
		if (!this.slicer) return;
		await this.slicer.load(this.app.vault, this.plugin.settings.atlasImagePath);
	}
}
