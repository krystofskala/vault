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
	/** Not a real shimeji-ee feature — the original engine has no vertical flip whatsoever, and
	 * always pinches the mascot by the head (Dragged.java's `DEFAULT_OFFSETY = 120`). Grabbing the
	 * lower third of the sprite instead holds it by the ankles, hanging upside down. */
	upsideDownFeetDrag: boolean;
	allowBreeding: boolean;
	/** Real shimeji-ee's own `transients` setting — separate from `breeding`, and what
	 * Breed.Delegate.isEnabled() consults for a `BornTransient` clone. */
	allowTransients: boolean;
	/** Behaviors the user has switched off from a mascot's own menu, keyed by pack id — real
	 * `Toggleable` behaviors plus `Main.setMascotBehaviorEnabled`'s persisted state. */
	disabledBehaviors: Record<string, string[]>;
	chaseMouseEnabled: boolean;
	/** Real shimeji-ee's own `sounds` setting, read by `Sounds.isEnabled()` and checked before
	 * every single playback. Off by default here (the original defaults it on) — a note-taking app
	 * making noise unprompted is a different proposition from a mascot app you launched for it. */
	soundsEnabled: boolean;
	/** 0-100. Scales every clip on top of its own authored per-Pose `Volume`, the equivalent of
	 * the original's global volume setting rather than anything a pack controls. */
	soundVolume: number;
	/** Real ThrowIE/WalkWithIE: a mascot that grabs a pane resizes it while "carrying" it, then
	 * pops it into its own real OS window and throws that. Off by default — unlike every other
	 * toggle here, this can genuinely resize your layout or spawn/fling a whole separate window
	 * on its own, not just move a mascot around. See PaneActions/ObsidianPaneActions. */
	allowWindowThrow: boolean;
	/** Invented — shimeji-ee has no vault/note awareness at all. While a mascot happens to be on
	 * the pane you're actively working in, occasionally swaps in a random other note from the
	 * vault. Off by default for the same reason as allowWindowThrow: it changes what you're
	 * looking at without asking. */
	allowNoteMischief: boolean;
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
	upsideDownFeetDrag: true,
	allowBreeding: true,
	allowTransients: true,
	disabledBehaviors: {},
	chaseMouseEnabled: true,
	soundsEnabled: false,
	soundVolume: 70,
	allowWindowThrow: false,
	allowNoteMischief: false,
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
			.setName("Grab by the feet to dangle upside down")
			.setDesc(
				"Picking a mascot up by its lower third holds it by the ankles, hanging upside down; grabbing it anywhere higher pinches it by the head as usual. Not a real shimeji-ee feature — the original engine has no vertical flip at all and always grabs by the head.",
			)
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.upsideDownFeetDrag).onChange(async (value) => {
					this.plugin.settings.upsideDownFeetDrag = value;
					await this.plugin.saveSettings();
					this.plugin.applyUpsideDownFeetDrag();
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
			.setName("Allow transient clones")
			.setDesc(
				"Lets a pack spawn short-lived clones (BornTransient) — the mechanism behind effects like a mascot firing a projectile, which is itself just another mascot set to self-destruct. Separate from breeding in real shimeji-ee too, so a pack can use effects like this without you also enabling full self-replication.",
			)
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.allowTransients).onChange(async (value) => {
					this.plugin.settings.allowTransients = value;
					await this.plugin.saveSettings();
					this.plugin.stage?.setAllowTransients(value);
				}),
			);

		new Setting(containerEl)
			.setName("Chase the mouse")
			.setDesc(
				"Enables the \"Make all Shimejis follow the mouse\" command/menu item (real shimeji-ee's own \"Follow Mouse!\" is an on-demand tray action, not something mascots do spontaneously), and lets a placeholder mascot (no character pack loaded) occasionally dash toward the cursor as one of its idle variations. Always off on mobile (no ambient cursor to chase between touches), regardless of this toggle.",
			)
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.chaseMouseEnabled).onChange(async (value) => {
					this.plugin.settings.chaseMouseEnabled = value;
					await this.plugin.saveSettings();
					this.plugin.applyChaseMouseEnabled();
				}),
			);

		containerEl.createEl("h3", { text: "Sound" });

		new Setting(containerEl)
			.setName("Play pack sounds")
			.setDesc(
				"Real Shimeji packs can attach a sound file to any individual animation pose. Off by default — turn it on only if your character pack actually ships a sound/ folder and you want to hear it.",
			)
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.soundsEnabled).onChange(async (value) => {
					this.plugin.settings.soundsEnabled = value;
					await this.plugin.saveSettings();
					this.plugin.applySoundSettings();
				}),
			);

		new Setting(containerEl)
			.setName("Volume")
			.setDesc("Scales every sound on top of whatever volume the pack itself authored for that pose.")
			.addSlider((slider) =>
				slider
					.setLimits(0, 100, 5)
					.setValue(this.plugin.settings.soundVolume)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.soundVolume = value;
						await this.plugin.saveSettings();
						this.plugin.applySoundSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Window mischief")
			.setDesc(
				"Real shimeji-ee's mascots can pick up, carry, and throw the OS window they're standing next to. Obsidian panes can't be freely moved, so this reinterprets it: a mascot resizes the pane it's carrying, then pops it into its own real OS window and throws that (desktop only). Off by default — this can resize your layout or spawn a flung window with no confirmation.",
			)
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.allowWindowThrow).onChange(async (value) => {
					this.plugin.settings.allowWindowThrow = value;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName("Restore thrown windows")
			.setDesc('Bring back every popped-out window a mascot has thrown — the equivalent of real shimeji-ee\'s "Restore IE!" tray item.')
			.addButton((button) => button.setButtonText("Restore").onClick(() => this.plugin.restoreThrownWindows()));

		new Setting(containerEl)
			.setName("Note mischief")
			.setDesc(
				"Not a real shimeji-ee feature — shimeji-ee has no awareness of files or vaults at all. While a mascot happens to be standing on the pane you're actively working in, occasionally swaps in a random other note from the vault. Off by default.",
			)
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.allowNoteMischief).onChange(async (value) => {
					this.plugin.settings.allowNoteMischief = value;
					await this.plugin.saveSettings();
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
