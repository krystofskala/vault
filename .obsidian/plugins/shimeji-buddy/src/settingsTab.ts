import { App, PluginSettingTab, Setting, type DropdownComponent, type TextComponent } from "obsidian";
import type ShimejiBuddyPlugin from "./main";
import { AtlasSlicer } from "./AtlasSlicer";
import {
	BUILTIN_TRIGGERS,
	commandTriggerId,
	type AtlasFrameRect,
	type CharacterMode,
	type CustomAnimation,
	type TriggerDef,
} from "./settings";

function newAnimationId(): string {
	if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
	return `anim-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export class ShimejiSettingTab extends PluginSettingTab {
	plugin: ShimejiBuddyPlugin;

	private slicer?: AtlasSlicer;
	private pendingTargetAnimationId: string | null = null;
	private frameCountEls: Record<string, HTMLElement> = {};

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
				"ones are wired to real events already; add your own for any Obsidian command (yours or " +
				"another plugin's) by its command id below.",
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
			.setDesc(
				"Paste an Obsidian command id (find one via a helper plugin like \"Show Command ID\", or from a plugin's source) and give it a short label."
			)
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

		let customPathText: TextComponent | undefined;

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

	// ---------- freeform atlas mode: animation library ----------

	private renderAtlasSection(containerEl: HTMLElement): void {
		const s = this.plugin.settings;

		containerEl.createEl("p", {
			cls: "setting-item-description",
			text:
				"For spritesheets that aren't a uniform grid (frames of different sizes, packed however they " +
				"packed them). Point at one image, drag a box around a frame below (or type exact pixel " +
				"coordinates), add it to an animation, and assign that animation to one or more actions above.",
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
			.setDesc("Pick an existing animation, or create a new one, then add the current selection as its next frame.")
			.addDropdown((d) => {
				d.addOption("__new__", "+ New animation");
				for (const anim of s.customAnimations) d.addOption(anim.id, anim.name || "(unnamed)");
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
						let anim = s.customAnimations.find((a) => a.id === this.pendingTargetAnimationId);
						if (!anim) {
							anim = {
								id: newAnimationId(),
								name: `Animation ${s.customAnimations.length + 1}`,
								triggers: ["idle"],
								moves: true,
								weight: 1,
								enabled: true,
								loop: true,
								fps: 6,
								frames: [],
							};
							s.customAnimations.push(anim);
							this.pendingTargetAnimationId = anim.id;
						}
						anim.frames.push({ ...sel });
						anim.enabled = true;
						await this.plugin.saveSettings();
						await this.plugin.reloadSpritePack();
						this.display();
					})
			);

		containerEl.createEl("h4", { text: "Your animations" });
		if (s.customAnimations.length === 0) {
			containerEl.createEl("p", {
				cls: "setting-item-description",
				text: "No animations yet - drag a selection above and click \"Add frame\" to create your first one.",
			});
		}
		for (const anim of s.customAnimations) {
			this.renderCustomAnimationBlock(containerEl, anim);
		}
	}

	private renderCustomAnimationBlock(containerEl: HTMLElement, anim: CustomAnimation): void {
		const s = this.plugin.settings;
		const wrap = containerEl.createDiv({ cls: "sm-anim-block" });

		new Setting(wrap)
			.setName("Name")
			.addText((t) =>
				t.setValue(anim.name).onChange(async (v) => {
					anim.name = v;
					await this.plugin.saveSettings();
				})
			)
			.addExtraButton((b) =>
				b
					.setIcon("trash-2")
					.setTooltip("Delete this animation")
					.onClick(async () => {
						s.customAnimations = s.customAnimations.filter((a) => a.id !== anim.id);
						if (this.pendingTargetAnimationId === anim.id) this.pendingTargetAnimationId = null;
						await this.plugin.saveSettings();
						await this.plugin.reloadSpritePack();
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
				await this.plugin.saveSettings();
				await this.plugin.reloadSpritePack();
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
						await this.plugin.saveSettings();
						await this.plugin.reloadSpritePack();
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
						await this.plugin.saveSettings();
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
						await this.plugin.saveSettings();
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
						await this.plugin.saveSettings();
						await this.plugin.reloadSpritePack();
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
							await this.plugin.saveSettings();
							await this.plugin.reloadSpritePack();
						}
					})
			)
			.addToggle((t) =>
				t
					.setTooltip("Loop")
					.setValue(anim.loop)
					.onChange(async (v) => {
						anim.loop = v;
						await this.plugin.saveSettings();
						await this.plugin.reloadSpritePack();
					})
			)
			.addExtraButton((b) =>
				b
					.setIcon("undo-2")
					.setTooltip("Remove last frame")
					.onClick(async () => {
						anim.frames.pop();
						await this.plugin.saveSettings();
						await this.plugin.reloadSpritePack();
						this.refreshFrameCountText(anim.id);
					})
			)
			.addExtraButton((b) =>
				b
					.setIcon("trash-2")
					.setTooltip("Clear all frames")
					.onClick(async () => {
						anim.frames = [];
						await this.plugin.saveSettings();
						await this.plugin.reloadSpritePack();
						this.refreshFrameCountText(anim.id);
					})
			);
	}

	private refreshFrameCountText(animId: string): void {
		const el = this.frameCountEls[animId];
		if (!el) return;
		const anim = this.plugin.settings.customAnimations.find((a) => a.id === animId);
		const count = anim ? anim.frames.length : 0;
		el.setText(count === 1 ? "1 frame" : `${count} frames`);
	}

	private async loadSlicerImage(): Promise<void> {
		if (!this.slicer) return;
		await this.slicer.load(this.app.vault, this.plugin.settings.atlasImagePath);
	}
}
