import { App, PluginSettingTab, Setting } from "obsidian";
import type ShimejiPlugin from "./main";
import { CustomContentModal } from "./customContentModal";
import type { CustomPackContent } from "./shimeji/customContent";

export interface ShimejiSettings {
	packsFolder: string;
	/** Characters (by pack id) eligible to be picked when spawning a mascot. A freshly spawned
	 * mascot picks one at random from this list; empty means "use the built-in placeholder". */
	activePackIds: string[];
	scale: number;
	paneLedgesEnabled: boolean;
	debugLedges: boolean;
	autoSpawn: boolean;
	autoSpawnCount: number;
	maxMascots: number;
	allowDragging: boolean;
	allowBreeding: boolean;
	chaseMouseEnabled: boolean;
	/** Hand-authored actions/behaviors, keyed by pack id, overlaid onto that pack's parsed
	 * actions.xml/behaviors.xml — see CustomContentBuilder. */
	customContent: Record<string, CustomPackContent>;
}

/** Empty means "not configured yet" — main.ts fills in a real default relative to the
 * plugin's own folder on load, since a bare vault-relative path like "Shimeji" would
 * resolve to <vault-root>/Shimeji, not this plugin's own bundled Shimeji/ folder. */
export const DEFAULT_SETTINGS: ShimejiSettings = {
	packsFolder: "",
	activePackIds: [],
	scale: 1,
	paneLedgesEnabled: true,
	debugLedges: false,
	autoSpawn: true,
	autoSpawnCount: 1,
	maxMascots: 8,
	allowDragging: true,
	allowBreeding: true,
	chaseMouseEnabled: true,
	customContent: {},
};

export class ShimejiSettingTab extends PluginSettingTab {
	constructor(app: App, private plugin: ShimejiPlugin) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.createEl("h2", { text: "Shimeji Desktop Mascot" });

		new Setting(containerEl)
			.setName("Pack folder")
			.setDesc(
				"Vault-relative folder containing your Shimeji-compatible artwork " +
					"(expects img/ and conf/ inside, following the standard Shimeji-ee layout).",
			)
			.addText((text) =>
				text
					.setPlaceholder(".obsidian/plugins/obsidian-shimeji/Shimeji")
					.setValue(this.plugin.settings.packsFolder)
					.onChange(async (value) => {
						this.plugin.settings.packsFolder = value.trim();
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Rescan pack folder")
			.setDesc("Look again after adding or changing actions.xml / behaviors.xml / img files.")
			.addButton((btn) =>
				btn.setButtonText("Rescan").onClick(async () => {
					await this.plugin.rescanPacks();
					this.display();
				}),
			);

		containerEl.createEl("h3", { text: "Characters" });

		if (this.plugin.availablePacks.length > 0) {
			containerEl.createEl("p", {
				text: "Each newly spawned mascot picks a random character from the ones enabled below. Turn all off to use the built-in placeholder instead.",
				cls: "setting-item-description",
			});
			for (const pack of this.plugin.availablePacks) {
				new Setting(containerEl).setName(pack.name).addToggle((toggle) =>
					toggle.setValue(this.plugin.settings.activePackIds.includes(pack.id)).onChange(async (value) => {
						const ids = this.plugin.settings.activePackIds;
						this.plugin.settings.activePackIds = value ? [...ids, pack.id] : ids.filter((id) => id !== pack.id);
						await this.plugin.saveSettings();
						this.plugin.respawnWithCurrentSettings();
					}),
				);
			}
		} else {
			containerEl.createEl("p", {
				text:
					"No Shimeji-compatible pack found yet in that folder — using the built-in placeholder mascot. " +
					"Add your img/ and conf/ files and rescan.",
				cls: "setting-item-description",
			});
		}

		containerEl.createEl("h3", { text: "Custom animations & reactions" });

		if (this.plugin.availablePacks.length > 0) {
			containerEl.createEl("p", {
				text:
					"Add your own actions and behaviors to a character, the same way hand-editing " +
					"actions.xml/behaviors.xml would — a custom entry with the same name as a " +
					"standard one replaces it.",
				cls: "setting-item-description",
			});
			for (const pack of this.plugin.availablePacks) {
				const content = this.plugin.settings.customContent[pack.id];
				const count = (content?.actions.length ?? 0) + (content?.behaviors.length ?? 0);
				new Setting(containerEl)
					.setName(pack.name)
					.setDesc(count > 0 ? `${count} custom entr${count === 1 ? "y" : "ies"}` : "No custom entries yet")
					.addButton((btn) =>
						btn.setButtonText("Edit...").onClick(() => {
							new CustomContentModal(this.app, this.plugin, pack.id).open();
						}),
					);
			}
		} else {
			containerEl.createEl("p", {
				text: "Load a character above first — custom actions/behaviors are added on top of a character's own actions.xml/behaviors.xml.",
				cls: "setting-item-description",
			});
		}

		containerEl.createEl("h3", { text: "Population" });

		new Setting(containerEl)
			.setName("Spawn one now")
			.addButton((btn) => btn.setButtonText("Spawn").onClick(() => this.plugin.spawnMascot()));

		new Setting(containerEl)
			.setName("Remove all now")
			.addButton((btn) => btn.setButtonText("Remove all").onClick(() => this.plugin.stage?.removeAllMascots()));

		new Setting(containerEl)
			.setName("Max mascots on screen")
			.setDesc("Caps manual spawning and pack-driven multiplying (e.g. a Breed action) alike.")
			.addSlider((slider) =>
				slider
					.setLimits(1, 20, 1)
					.setValue(this.plugin.settings.maxMascots)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.maxMascots = value;
						await this.plugin.saveSettings();
						this.plugin.stage?.setMaxMascots(value);
					}),
			);

		new Setting(containerEl)
			.setName("Auto-spawn on startup")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.autoSpawn).onChange(async (value) => {
					this.plugin.settings.autoSpawn = value;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName("Number to auto-spawn")
			.addSlider((slider) =>
				slider
					.setLimits(1, 20, 1)
					.setValue(this.plugin.settings.autoSpawnCount)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.autoSpawnCount = value;
						await this.plugin.saveSettings();
					}),
			);

		containerEl.createEl("h3", { text: "Behavior" });

		new Setting(containerEl)
			.setName("Allow dragging")
			.setDesc("Let mascots be picked up and thrown with the mouse.")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.allowDragging).onChange(async (value) => {
					this.plugin.settings.allowDragging = value;
					await this.plugin.saveSettings();
					this.plugin.applyAllowDragging();
				}),
			);

		new Setting(containerEl)
			.setName("Allow breeding")
			.setDesc("Let a pack's own Breed-style actions (e.g. splitting in two) spawn new independent mascots.")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.allowBreeding).onChange(async (value) => {
					this.plugin.settings.allowBreeding = value;
					await this.plugin.saveSettings();
					this.plugin.stage?.setAllowBreeding(value);
				}),
			);

		new Setting(containerEl)
			.setName("Chase the mouse")
			.setDesc("Let mascots occasionally dash toward the cursor while idle on the floor. Always off on mobile (no ambient cursor to chase between touches), regardless of this toggle.")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.chaseMouseEnabled).onChange(async (value) => {
					this.plugin.settings.chaseMouseEnabled = value;
					await this.plugin.saveSettings();
					this.plugin.applyChaseMouseEnabled();
				}),
			);

		containerEl.createEl("h3", { text: "Appearance" });

		new Setting(containerEl)
			.setName("Size")
			.setDesc("Scale factor for the mascot.")
			.addSlider((slider) =>
				slider
					.setLimits(0.5, 2, 0.1)
					.setValue(this.plugin.settings.scale)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.scale = value;
						await this.plugin.saveSettings();
						this.plugin.applyScale();
					}),
			);

		containerEl.createEl("h3", { text: "Layout & debugging" });

		new Setting(containerEl)
			.setName("Climb panes and status bar")
			.setDesc("Let mascots land/walk on top of open note panes and the status bar, in addition to the window edges.")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.paneLedgesEnabled).onChange(async (value) => {
					this.plugin.settings.paneLedgesEnabled = value;
					await this.plugin.saveSettings();
					this.plugin.stage?.setPaneLedgesEnabled(value);
				}),
			);

		new Setting(containerEl)
			.setName("Show debug ledges")
			.setDesc("Overlay lines where mascots currently think they can stand — useful while tuning a real vault layout.")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.debugLedges).onChange(async (value) => {
					this.plugin.settings.debugLedges = value;
					await this.plugin.saveSettings();
					this.plugin.stage?.setDebugLedges(value);
				}),
			);
	}
}
