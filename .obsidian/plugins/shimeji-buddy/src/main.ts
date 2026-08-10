import { MarkdownView, Platform, Plugin, TFile, WorkspaceLeaf } from "obsidian";
import { CharacterWidget } from "./CharacterWidget";
import {
	loadSpritePack,
	loadAtlasSpritePack,
	revokeSpritePack,
	listAvailableSpritePacks,
	type LoadedSpritePack,
	type SpritePackInfo,
} from "./spritePack";
import { DEFAULT_SETTINGS, type ShimejiSettings, type ReactionName, type SpeechLines } from "./settings";
import { ShimejiSettingTab } from "./settingsTab";

const MODIFY_DEBOUNCE_MS = 1500;

export default class ShimejiBuddyPlugin extends Plugin {
	settings!: ShimejiSettings;
	private widget: CharacterWidget | null = null;
	private spritePack: LoadedSpritePack | null = null;
	private modifyDebounce: number | null = null;
	private lastSearchReactAt = 0;
	availablePacks: SpritePackInfo[] = [];
	availablePacksLoaded = false;

	async onload(): Promise<void> {
		await this.loadSettings();
		this.addSettingTab(new ShimejiSettingTab(this.app, this));

		this.app.workspace.onLayoutReady(async () => {
			this.createWidget();
			await this.refreshAvailablePacks();
			await this.reloadSpritePack();
			this.widget?.react("wave");
			this.registerVaultEvents();
			this.registerWorkspaceEvents();
			this.registerMobileInteractivityWatcher();
		});

		this.addCommand({
			id: "shimeji-buddy-poke",
			name: "Poke the buddy",
			callback: () => this.widget?.react("poke"),
		});

		this.addCommand({
			id: "shimeji-buddy-toggle",
			name: "Toggle buddy visibility",
			callback: async () => {
				this.settings.enabled = !this.settings.enabled;
				await this.saveSettings();
				this.applyVisibility();
			},
		});
	}

	onunload(): void {
		this.widget?.destroy();
		this.widget = null;
		revokeSpritePack(this.spritePack);
		this.spritePack = null;
		if (this.modifyDebounce) window.clearTimeout(this.modifyDebounce);
	}

	// ---------- settings ----------

	async loadSettings(): Promise<void> {
		const data = await this.loadData();
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data, {
			speechLines: Object.assign({}, DEFAULT_SETTINGS.speechLines, data?.speechLines),
			atlasAnimations: Object.assign({}, DEFAULT_SETTINGS.atlasAnimations, data?.atlasAnimations),
		});
		// upgrade path: older saved data predates characterMode and only had customCharacterFolder
		if (!data?.characterMode && data?.customCharacterFolder) {
			this.settings.characterMode = "pack";
		}
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	// ---------- widget lifecycle ----------

	private createWidget(force = false): void {
		if (this.widget && !force) return;
		this.widget?.destroy();
		this.widget = new CharacterWidget(this.settings, {
			onPositionChange: async (posX, posY) => {
				this.settings.posX = posX;
				this.settings.posY = posY;
				await this.saveSettings();
			},
		});
		this.widget.startIdleBrain();
		this.applyVisibility();
	}

	recreateWidget(): void {
		this.createWidget(true);
		this.widget?.setSpritePack(this.spritePack);
	}

	applyVisibility(): void {
		this.widget?.setVisible(this.settings.enabled);
	}

	applyLiveSettings(): void {
		this.widget?.updateSettings(this.settings);
	}

	// ---------- mobile: touch only in reading view ----------

	private registerMobileInteractivityWatcher(): void {
		this.updateMobileInteractivity();
		this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.updateMobileInteractivity()));
		this.registerEvent(this.app.workspace.on("layout-change", () => this.updateMobileInteractivity()));
	}

	/** Reactions/idle animation always keep playing - this only gates dragging/poking. */
	updateMobileInteractivity(): void {
		if (!Platform.isMobile || !this.settings.mobileReadingViewOnly) {
			this.widget?.setAutoClickThrough(false);
			return;
		}
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		const isReadingView = !view || view.getMode() === "preview";
		this.widget?.setAutoClickThrough(!isReadingView);
	}

	async reloadSpritePack(): Promise<void> {
		const previous = this.spritePack;
		if (this.settings.characterMode === "pack") {
			this.spritePack = await loadSpritePack(this.app.vault, this.settings.customCharacterFolder);
		} else if (this.settings.characterMode === "atlas") {
			this.spritePack = await loadAtlasSpritePack(
				this.app.vault,
				this.settings.atlasImagePath,
				this.settings.atlasAnimations
			);
		} else {
			this.spritePack = null;
		}
		this.widget?.setSpritePack(this.spritePack);
		revokeSpritePack(previous);
	}

	/** vault-relative folder this plugin's bundled/dropped-in character packs live under */
	getCharactersDir(): string {
		return `${this.app.vault.configDir}/plugins/${this.manifest.id}/characters`;
	}

	async refreshAvailablePacks(): Promise<SpritePackInfo[]> {
		this.availablePacks = await listAvailableSpritePacks(this.app.vault, this.getCharactersDir());
		this.availablePacksLoaded = true;
		return this.availablePacks;
	}

	// ---------- vault action -> animation wiring ----------

	private registerVaultEvents(): void {
		this.registerEvent(
			this.app.vault.on("create", (file) => {
				if (!(file instanceof TFile)) return;
				if (!this.settings.reactToCreate) return;
				this.reactWithLine("cheer", "cheer");
			})
		);

		this.registerEvent(
			this.app.vault.on("delete", (file) => {
				if (!(file instanceof TFile)) return;
				if (!this.settings.reactToDelete) return;
				this.reactWithLine("poof", "poof");
			})
		);

		this.registerEvent(
			this.app.vault.on("rename", (file) => {
				if (!(file instanceof TFile)) return;
				if (!this.settings.reactToRename) return;
				this.reactWithLine("surprised", "surprised");
			})
		);

		this.registerEvent(
			this.app.vault.on("modify", (file) => {
				if (!(file instanceof TFile)) return;
				if (!this.settings.reactToModify) return;
				if (this.modifyDebounce) window.clearTimeout(this.modifyDebounce);
				this.modifyDebounce = window.setTimeout(() => {
					this.reactWithLine("nod", "nod");
				}, MODIFY_DEBOUNCE_MS);
			})
		);
	}

	private registerWorkspaceEvents(): void {
		this.registerEvent(
			this.app.workspace.on("file-open", (file) => {
				if (!file) return;
				if (!this.settings.reactToOpen) return;
				this.reactWithLine("wave", "wave");
			})
		);

		this.registerEvent(
			this.app.workspace.on("active-leaf-change", (leaf: WorkspaceLeaf | null) => {
				if (!leaf || !this.settings.reactToSearch) return;
				const viewType = leaf.view?.getViewType?.();
				if (viewType !== "search") return;
				const now = Date.now();
				if (now - this.lastSearchReactAt < 4000) return;
				this.lastSearchReactAt = now;
				this.reactWithLine("think", "think");
			})
		);
	}

	private reactWithLine(reaction: ReactionName, lineKey: keyof SpeechLines): void {
		const lines = this.settings.speechLines[lineKey];
		const line = lines && lines.length ? lines[Math.floor(Math.random() * lines.length)] : undefined;
		this.widget?.react(reaction, line);
	}
}
