import { Plugin, TFile, WorkspaceLeaf } from "obsidian";
import { CharacterWidget } from "./CharacterWidget";
import { loadSpritePack, revokeSpritePack, type LoadedSpritePack } from "./spritePack";
import { DEFAULT_SETTINGS, type NarutoBuddySettings, type ReactionName, type SpeechLines } from "./settings";
import { NarutoBuddySettingTab } from "./settingsTab";

const MODIFY_DEBOUNCE_MS = 1500;

export default class NarutoBuddyPlugin extends Plugin {
	settings!: NarutoBuddySettings;
	private widget: CharacterWidget | null = null;
	private spritePack: LoadedSpritePack | null = null;
	private modifyDebounce: number | null = null;
	private lastSearchReactAt = 0;

	async onload(): Promise<void> {
		await this.loadSettings();
		this.addSettingTab(new NarutoBuddySettingTab(this.app, this));

		this.app.workspace.onLayoutReady(async () => {
			this.createWidget();
			await this.reloadSpritePack();
			this.widget?.react("wave");
			this.registerVaultEvents();
			this.registerWorkspaceEvents();
		});

		this.addCommand({
			id: "naruto-buddy-poke",
			name: "Poke the buddy",
			callback: () => this.widget?.react("poke"),
		});

		this.addCommand({
			id: "naruto-buddy-toggle",
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
		});
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

	async reloadSpritePack(): Promise<void> {
		revokeSpritePack(this.spritePack);
		this.spritePack = await loadSpritePack(this.app.vault, this.settings.customCharacterFolder);
		this.widget?.setSpritePack(this.spritePack);
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
