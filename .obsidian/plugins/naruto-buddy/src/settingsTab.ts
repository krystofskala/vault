import { App, PluginSettingTab, Setting, type TextComponent } from "obsidian";
import type NarutoBuddyPlugin from "./main";

export class NarutoBuddySettingTab extends PluginSettingTab {
	plugin: NarutoBuddyPlugin;

	constructor(app: App, plugin: NarutoBuddyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		const s = this.plugin.settings;

		containerEl.createEl("h2", { text: "Naruto Buddy" });
		containerEl.createEl("p", {
			text:
				"A little character that idles on its own and reacts to what you do in the vault. " +
				"Ships with a generic placeholder - pick or drop in your own sprite pack below to make it " +
				"look like anything you want, ninja or otherwise.",
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
				"The built-in character is a generic placeholder (not Naruto artwork - that's copyrighted). " +
				"It doesn't have to be Naruto, or even a ninja: drop any sprite pack's folder into " +
				"characters/ inside this plugin's folder (each one needs a manifest.json plus its sprite " +
				"strips - see characters/example-pack for the format) and pick it below.",
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
				"Vault-relative folder path, e.g. .obsidian/plugins/naruto-buddy/characters/my-pack. Leave empty for the built-in placeholder."
			)
			.addText((t) => {
				customPathText = t;
				t.setPlaceholder(".obsidian/plugins/naruto-buddy/characters/my-pack")
					.setValue(s.customCharacterFolder)
					.onChange(async (v) => {
						s.customCharacterFolder = v.trim();
						await this.plugin.saveSettings();
						await this.plugin.reloadSpritePack();
					});
			});
	}
}
