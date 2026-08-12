import { App, PluginSettingTab, Setting } from "obsidian";
import type ShimejiPlugin from "./main";

export interface ShimejiSettings {
	packsFolder: string;
	activePackId: string | null;
	scale: number;
	paneLedgesEnabled: boolean;
	debugLedges: boolean;
	autoSpawn: boolean;
}

/** Empty means "not configured yet" — main.ts fills in a real default relative to the
 * plugin's own folder on load, since a bare vault-relative path like "Shimeji" would
 * resolve to <vault-root>/Shimeji, not this plugin's own bundled Shimeji/ folder. */
export const DEFAULT_SETTINGS: ShimejiSettings = {
	packsFolder: "",
	activePackId: null,
	scale: 1,
	paneLedgesEnabled: true,
	debugLedges: false,
	autoSpawn: true,
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

		if (this.plugin.availablePacks.length > 0) {
			new Setting(containerEl)
				.setName("Active pack")
				.setDesc("Which loaded character to spawn. Leave unset to use the built-in placeholder.")
				.addDropdown((drop) => {
					drop.addOption("", "(placeholder)");
					for (const pack of this.plugin.availablePacks) drop.addOption(pack.id, pack.name);
					drop.setValue(this.plugin.settings.activePackId ?? "");
					drop.onChange(async (value) => {
						this.plugin.settings.activePackId = value || null;
						await this.plugin.saveSettings();
						this.plugin.respawnWithCurrentSettings();
					});
				});
		} else {
			containerEl.createEl("p", {
				text:
					"No Shimeji-compatible pack found yet in that folder — using the built-in placeholder mascot. " +
					"Add your img/ and conf/ files and rescan.",
				cls: "setting-item-description",
			});
		}

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

		new Setting(containerEl)
			.setName("Climb panes and status bar")
			.setDesc("Let the mascot land/walk on top of open note panes and the status bar, in addition to the window edges.")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.paneLedgesEnabled).onChange(async (value) => {
					this.plugin.settings.paneLedgesEnabled = value;
					await this.plugin.saveSettings();
					this.plugin.stage?.setPaneLedgesEnabled(value);
				}),
			);

		new Setting(containerEl)
			.setName("Show debug ledges")
			.setDesc("Overlay lines where the mascot currently thinks it can stand — useful while tuning a real vault layout.")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.debugLedges).onChange(async (value) => {
					this.plugin.settings.debugLedges = value;
					await this.plugin.saveSettings();
					this.plugin.stage?.setDebugLedges(value);
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
	}
}
