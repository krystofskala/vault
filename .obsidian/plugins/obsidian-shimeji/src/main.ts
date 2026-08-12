import { Notice, Plugin } from "obsidian";
import { Mascot } from "./engine/Mascot";
import { Random } from "./engine/Random";
import { Stage } from "./engine/Stage";
import { DEFAULT_ENGINE_CONFIG, type EngineConfig } from "./engine/types";
import { PackDriver } from "./shimeji/PackDriver";
import { loadPacksFromFolder } from "./shimeji/PackLoader";
import type { MascotPack } from "./shimeji/types";
import { DEFAULT_SETTINGS, ShimejiSettingTab, type ShimejiSettings } from "./settings";

export default class ShimejiPlugin extends Plugin {
	settings: ShimejiSettings = DEFAULT_SETTINGS;
	stage?: Stage;
	availablePacks: MascotPack[] = [];
	private engineConfig: EngineConfig = { ...DEFAULT_ENGINE_CONFIG };

	async onload(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());

		// "Shimeji" was an earlier broken default: adapter paths are vault-relative, so it
		// resolved to <vault-root>/Shimeji instead of this plugin's own bundled folder.
		// Migrate both a never-configured (empty) value and that specific old default.
		const bundledPackFolder = `${this.app.vault.configDir}/plugins/${this.manifest.id}/Shimeji`;
		if (!this.settings.packsFolder || this.settings.packsFolder === "Shimeji") {
			this.settings.packsFolder = bundledPackFolder;
			await this.saveSettings();
		}

		this.stage = new Stage({
			config: this.engineConfig,
			paneLedgesEnabled: this.settings.paneLedgesEnabled,
			debugLedges: this.settings.debugLedges,
		});
		this.stage.start();

		this.addSettingTab(new ShimejiSettingTab(this.app, this));

		this.addRibbonIcon("cat", "Toggle Shimeji mascot", () => this.toggleMascot());
		this.addCommand({ id: "shimeji-spawn", name: "Spawn mascot", callback: () => this.spawnMascot() });
		this.addCommand({ id: "shimeji-remove", name: "Remove mascot", callback: () => this.stage?.removeMascot() });
		this.addCommand({ id: "shimeji-rescan", name: "Rescan pack folder", callback: () => this.rescanPacks() });

		this.registerEvent(this.app.workspace.on("resize", () => this.stage?.notifyLayoutChanged()));
		this.registerEvent(this.app.workspace.on("layout-change", () => this.stage?.notifyLayoutChanged()));

		await this.rescanPacks();
		if (this.settings.autoSpawn) this.spawnMascot();
	}

	onunload(): void {
		this.stage?.destroy();
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	async rescanPacks(): Promise<void> {
		if (!this.settings.packsFolder) {
			this.availablePacks = [];
			this.respawnWithCurrentSettings();
			return;
		}
		try {
			this.availablePacks = await loadPacksFromFolder(this.app, this.settings.packsFolder);
			if (this.availablePacks.length === 0) {
				new Notice("Shimeji: no actions.xml/behaviors.xml found in that folder yet — using the placeholder mascot.");
			} else {
				new Notice(`Shimeji: found ${this.availablePacks.length} pack(s): ${this.availablePacks.map((p) => p.name).join(", ")}`);
			}
		} catch (err) {
			console.error("[obsidian-shimeji] failed to scan pack folder", err);
			this.availablePacks = [];
		}

		// Auto-pick a pack once one is found rather than silently sticking with the
		// placeholder until the user visits Settings — that's the whole point of scanning.
		const stillValid = this.availablePacks.some((p) => p.id === this.settings.activePackId);
		if (!stillValid) {
			this.settings.activePackId = this.availablePacks[0]?.id ?? null;
			await this.saveSettings();
		}

		this.respawnWithCurrentSettings();
	}

	toggleMascot(): void {
		if (this.stage?.getMascot()) this.stage.removeMascot();
		else this.spawnMascot();
	}

	spawnMascot(): void {
		if (!this.stage) return;
		const mascot = this.stage.spawnMascot();
		mascot.scale = this.settings.scale;
		this.attachActivePack(mascot);
	}

	respawnWithCurrentSettings(): void {
		const mascot = this.stage?.getMascot();
		if (mascot) this.attachActivePack(mascot);
	}

	applyScale(): void {
		const mascot = this.stage?.getMascot();
		if (mascot) mascot.scale = this.settings.scale;
	}

	private attachActivePack(mascot: Mascot): void {
		const pack = this.availablePacks.find((p) => p.id === this.settings.activePackId);
		if (pack) {
			mascot.attachDriver(new PackDriver(pack, this.engineConfig, new Random()));
		} else {
			mascot.detachDriver();
		}
	}
}
