import { MarkdownView, Platform, Plugin, TFile, WorkspaceLeaf } from "obsidian";
import { CharacterWidget } from "./CharacterWidget";
import {
	loadCharacter,
	revokeSpritePack,
	listCharacters,
	type LoadedSpritePack,
	type CharacterInfo,
} from "./spritePack";
import { DEFAULT_SETTINGS, DEFAULT_BUILTIN_BEHAVIORS, commandTriggerId, type ShimejiSettings } from "./settings";
import { ShimejiSettingTab } from "./settingsTab";
import { parseSpeechLinesMarkdown } from "./speechLines";

/** Surfaced in Settings -> Reactions & actions -> Speech bubble so the user can see whether their file loaded and how much of it parsed. */
export interface SpeechLinesStats {
	configured: boolean;
	fileExists: boolean;
	taggedLineCount: number;
	triggerCount: number;
	untaggedLines: string[];
}

const MODIFY_DEBOUNCE_MS = 1500;

export default class ShimejiBuddyPlugin extends Plugin {
	settings!: ShimejiSettings;
	private widget: CharacterWidget | null = null;
	private spritePack: LoadedSpritePack | null = null;
	private modifyDebounce: number | null = null;
	private lastSearchReactAt = 0;
	private unpatchCommands: (() => void) | null = null;
	availableCharacters: CharacterInfo[] = [];
	availableCharactersLoaded = false;
	private customSpeechLines: Record<string, string[]> = {};
	speechLinesStats: SpeechLinesStats | null = null;
	private summonClickCount = 0;
	private summonClickTimer: number | null = null;
	private summonClickPos = { x: 0, y: 0 };

	async onload(): Promise<void> {
		await this.loadSettings();
		this.addSettingTab(new ShimejiSettingTab(this.app, this));
		this.registerCommandHook();
		this.registerSummonWatcher();

		this.app.workspace.onLayoutReady(async () => {
			this.createWidget();
			await this.refreshAvailableCharacters();
			await this.reloadSpritePack();
			await this.reloadSpeechLines();
			this.widget?.react("note:open");
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

		this.addCommand({
			id: "shimeji-buddy-list-command-ids",
			name: "List all command IDs into current note",
			editorCallback: (editor) => {
				const commands = (this.app as any).commands?.commands ?? {};
				const lines = Object.values(commands)
					.map((c: any) => `- \`${c.id}\` — ${c.name}`)
					.sort();
				editor.replaceSelection(lines.join("\n") + "\n");
			},
		});

		this.addCommand({
			id: "shimeji-buddy-toggle-click-counter",
			name: "Toggle click counter mode",
			callback: () => this.setClickCounterEnabled(!this.settings.clickCounterEnabled),
		});
	}

	onunload(): void {
		this.widget?.destroy();
		this.widget = null;
		revokeSpritePack(this.spritePack);
		this.spritePack = null;
		if (this.modifyDebounce) window.clearTimeout(this.modifyDebounce);
		this.unpatchCommands?.();
	}

	// ---------- settings ----------

	async loadSettings(): Promise<void> {
		const data = await this.loadData();
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data, {
			speechLines: Object.assign({}, DEFAULT_SETTINGS.speechLines, data?.speechLines),
			commandTriggers: data?.commandTriggers ?? [],
			builtinBehaviors: Object.assign({}, DEFAULT_BUILTIN_BEHAVIORS, data?.builtinBehaviors),
		});
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	// ---------- widget lifecycle ----------

	private createWidget(force = false): void {
		if (this.widget && !force) return;
		this.widget?.destroy();
		this.widget = new CharacterWidget(this.app, this.settings, {
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

	/** Also used by the settings-tab toggle, not just the command, so both routes reset the tally and confirm the new state the same way. */
	async setClickCounterEnabled(enabled: boolean): Promise<void> {
		this.settings.clickCounterEnabled = enabled;
		await this.saveSettings();
		this.widget?.setClickCounterMode(enabled);
	}

	/** The settings tab's "Play" preview button - plays one specific animation/sequence by id immediately, regardless of trigger/enabled state. False if it's not currently resolvable (e.g. no frames yet). */
	previewReaction(id: string): boolean {
		return this.widget?.previewById(id) ?? false;
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

	// ---------- character loading ----------

	async reloadSpritePack(): Promise<void> {
		const previous = this.spritePack;
		if (this.settings.characterMode === "character" && this.settings.activeCharacterFolder) {
			this.spritePack = await loadCharacter(this.app.vault, this.settings.activeCharacterFolder);
		} else {
			this.spritePack = null;
		}
		this.widget?.setSpritePack(this.spritePack);
		revokeSpritePack(previous);
	}

	/** vault-relative folder this plugin's characters live under */
	getCharactersDir(): string {
		return `${this.app.vault.configDir}/plugins/${this.manifest.id}/characters`;
	}

	// ---------- speech lines ----------

	/** (Re)reads and parses settings.speechLinesFilePath (see speechLines.ts), and pushes the result to the widget. Safe to call any time - on load, when the path setting changes, on manual "reload" click, and automatically whenever that exact file is modified (see registerVaultEvents). */
	async reloadSpeechLines(): Promise<void> {
		const path = this.settings.speechLinesFilePath.trim();
		if (!path) {
			this.customSpeechLines = {};
			this.speechLinesStats = { configured: false, fileExists: false, taggedLineCount: 0, triggerCount: 0, untaggedLines: [] };
			this.widget?.setCustomSpeechLines(this.customSpeechLines);
			return;
		}
		if (!(await this.app.vault.adapter.exists(path))) {
			this.customSpeechLines = {};
			this.speechLinesStats = { configured: true, fileExists: false, taggedLineCount: 0, triggerCount: 0, untaggedLines: [] };
			this.widget?.setCustomSpeechLines(this.customSpeechLines);
			return;
		}
		try {
			const raw = await this.app.vault.adapter.read(path);
			const parsed = parseSpeechLinesMarkdown(raw);
			this.customSpeechLines = parsed.pool;
			this.speechLinesStats = {
				configured: true,
				fileExists: true,
				taggedLineCount: parsed.taggedLineCount,
				triggerCount: Object.keys(parsed.pool).length,
				untaggedLines: parsed.untaggedLines,
			};
		} catch (e) {
			console.warn("Shimeji Buddy: could not read speech lines file", e);
			this.customSpeechLines = {};
			this.speechLinesStats = { configured: true, fileExists: true, taggedLineCount: 0, triggerCount: 0, untaggedLines: [] };
		}
		this.widget?.setCustomSpeechLines(this.customSpeechLines);
	}

	async refreshAvailableCharacters(): Promise<CharacterInfo[]> {
		this.availableCharacters = await listCharacters(this.app.vault, this.getCharactersDir());
		this.availableCharactersLoaded = true;
		return this.availableCharacters;
	}

	// ---------- vault/workspace triggers ----------

	private registerVaultEvents(): void {
		this.registerEvent(
			this.app.vault.on("create", (file) => {
				if (!(file instanceof TFile)) return;
				if (!this.settings.reactToCreate) return;
				this.widget?.react("note:create");
			})
		);

		this.registerEvent(
			this.app.vault.on("delete", (file) => {
				if (!(file instanceof TFile)) return;
				if (!this.settings.reactToDelete) return;
				this.widget?.react("note:delete");
			})
		);

		this.registerEvent(
			this.app.vault.on("rename", (file) => {
				if (!(file instanceof TFile)) return;
				if (!this.settings.reactToRename) return;
				this.widget?.react("note:rename");
			})
		);

		this.registerEvent(
			this.app.vault.on("modify", (file) => {
				if (!(file instanceof TFile)) return;
				if (!this.settings.reactToModify) return;
				if (this.modifyDebounce) window.clearTimeout(this.modifyDebounce);
				this.modifyDebounce = window.setTimeout(() => {
					this.widget?.react("note:edit");
				}, MODIFY_DEBOUNCE_MS);
			})
		);

		// Hot-reloads the speech-lines file the moment it's saved, so editing
		// it in Obsidian itself (the expected workflow) shows up immediately -
		// no reopening settings or restarting the plugin required.
		this.registerEvent(
			this.app.vault.on("modify", (file) => {
				if (!(file instanceof TFile)) return;
				if (this.settings.speechLinesFilePath && file.path === this.settings.speechLinesFilePath) {
					this.reloadSpeechLines();
				}
			})
		);
	}

	private registerWorkspaceEvents(): void {
		this.registerEvent(
			this.app.workspace.on("file-open", (file) => {
				if (!file) return;
				if (!this.settings.reactToOpen) return;
				this.widget?.react("note:open");
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
				this.widget?.react("search:open");
			})
		);
	}

	// ---------- command triggers ----------

	/**
	 * Obsidian doesn't expose a public "a command just ran" event, so this
	 * wraps the internal `app.commands.executeCommandById` (same technique
	 * plugins like Commander use) to notice when a command the user has
	 * added as a trigger runs, from anywhere - the command palette, a
	 * hotkey, another plugin. Restored on unload.
	 */
	private registerCommandHook(): void {
		const commands = (this.app as any).commands;
		if (!commands || typeof commands.executeCommandById !== "function") return;
		const original = commands.executeCommandById.bind(commands);
		commands.executeCommandById = (id: string, ...args: unknown[]) => {
			const result = original(id, ...args);
			if (this.settings.commandTriggers.some((c) => c.commandId === id)) {
				this.widget?.react(commandTriggerId(id));
			}
			return result;
		};
		this.unpatchCommands = () => {
			commands.executeCommandById = original;
		};
	}

	// ---------- triple-click to summon ----------

	/**
	 * Triple-clicking is the standard "select this paragraph" gesture inside
	 * any editor/rendered text, so this only fires for clicks outside note
	 * content entirely (empty pane space, sidebars, tab bar, etc) - never
	 * source/reading view or anything else editable - to avoid hijacking
	 * that. registerDomEvent auto-unregisters on unload.
	 */
	private registerSummonWatcher(): void {
		const EXCLUDED_SELECTOR =
			".sm-container, .sm-bubble, .markdown-source-view, .markdown-reading-view, .cm-editor, [contenteditable='true'], input, textarea";
		const CLICK_RADIUS_PX = 16;
		const CLICK_WINDOW_MS = 500;

		this.registerDomEvent(document, "click", (e: MouseEvent) => {
			if (!this.settings.summonEnabled) return;
			const target = e.target as HTMLElement | null;
			if (!target || target.closest(EXCLUDED_SELECTOR)) return;

			const closeEnough = Math.hypot(e.clientX - this.summonClickPos.x, e.clientY - this.summonClickPos.y) < CLICK_RADIUS_PX;
			this.summonClickCount = this.summonClickCount > 0 && closeEnough ? this.summonClickCount + 1 : 1;
			this.summonClickPos = { x: e.clientX, y: e.clientY };

			if (this.summonClickTimer) window.clearTimeout(this.summonClickTimer);
			this.summonClickTimer = window.setTimeout(() => (this.summonClickCount = 0), CLICK_WINDOW_MS);

			if (this.summonClickCount >= 3) {
				this.summonClickCount = 0;
				if (this.summonClickTimer) window.clearTimeout(this.summonClickTimer);
				this.widget?.summonTo(e.clientX, e.clientY);
			}
		});
	}
}
