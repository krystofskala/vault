import { Menu, Notice, Plugin } from "obsidian";
import { Mascot } from "./engine/Mascot";
import { Random } from "./engine/Random";
import { Stage } from "./engine/Stage";
import { DEFAULT_ENGINE_CONFIG, type EngineConfig } from "./engine/types";
import { mergeCustomContent } from "./shimeji/CustomContentBuilder";
import { PackDriver } from "./shimeji/PackDriver";
import { loadPacksFromFolder } from "./shimeji/PackLoader";
import type { MascotPack } from "./shimeji/types";
import { DEFAULT_SETTINGS, ShimejiSettingTab, type ShimejiSettings } from "./settings";

export default class ShimejiPlugin extends Plugin {
	settings: ShimejiSettings = DEFAULT_SETTINGS;
	stage?: Stage;
	/** What everything (settings UI, spawning, the context menu) actually consumes: basePacks
	 * with each pack's own customContent overlaid on top. Re-derived by refreshAvailablePacks()
	 * whenever either basePacks or customContent changes, so nothing else has to remember to
	 * re-merge. */
	availablePacks: MascotPack[] = [];
	/** Pure XML-parsed packs, straight from loadPacksFromFolder — the ground truth
	 * refreshAvailablePacks() re-merges from, so editing custom content never needs a disk rescan. */
	private basePacks: MascotPack[] = [];
	private engineConfig: EngineConfig = { ...DEFAULT_ENGINE_CONFIG };
	/** Which pack (or null for the placeholder) each live mascot is currently wearing. A
	 * WeakMap so a removed mascot's entry is simply dropped once nothing else references it. */
	private mascotPackId = new WeakMap<Mascot, string | null>();

	async onload(): Promise<void> {
		const raw = ((await this.loadData()) ?? {}) as Partial<ShimejiSettings> & { activePackId?: string | null };
		this.settings = Object.assign({}, DEFAULT_SETTINGS, raw);

		let needsSave = false;
		// Pre-multi-mascot installs stored a single activePackId; migrate it into the new list
		// shape exactly once (only when the new key was never written at all).
		if (!("activePackIds" in raw) && "activePackId" in raw) {
			this.settings.activePackIds = raw.activePackId ? [raw.activePackId] : [];
			needsSave = true;
		}

		// "Shimeji" was an earlier broken default: adapter paths are vault-relative, so it
		// resolved to <vault-root>/Shimeji instead of this plugin's own bundled folder.
		// Migrate both a never-configured (empty) value and that specific old default.
		const bundledPackFolder = `${this.manifest.dir ?? `${this.app.vault.configDir}/plugins/${this.manifest.id}`}/Shimeji`;
		if (!this.settings.packsFolder || this.settings.packsFolder === "Shimeji") {
			this.settings.packsFolder = bundledPackFolder;
			needsSave = true;
		}

		if (needsSave) await this.saveSettings();

		this.engineConfig.chaseMouseEnabled = this.settings.chaseMouseEnabled;

		this.stage = new Stage({
			config: this.engineConfig,
			paneLedgesEnabled: this.settings.paneLedgesEnabled,
			debugLedges: this.settings.debugLedges,
			maxMascots: this.settings.maxMascots,
			allowBreeding: this.settings.allowBreeding,
			onMascotCreated: (mascot, bornBehaviorName, parent) => this.onMascotCreated(mascot, bornBehaviorName, parent),
			onContextMenu: (mascot, ev) => this.showMascotContextMenu(mascot, ev),
		});
		this.stage.start();

		this.addSettingTab(new ShimejiSettingTab(this.app, this));

		this.addRibbonIcon("cat", "Toggle Shimeji mascots", () => this.toggleMascot());
		this.addCommand({ id: "shimeji-spawn", name: "Spawn mascot", callback: () => this.spawnMascot() });
		this.addCommand({ id: "shimeji-remove", name: "Remove mascot", callback: () => this.stage?.removeMascot() });
		this.addCommand({ id: "shimeji-remove-all", name: "Remove all mascots", callback: () => this.stage?.removeAllMascots() });
		this.addCommand({ id: "shimeji-rescan", name: "Rescan pack folder", callback: () => this.rescanPacks() });

		this.registerEvent(this.app.workspace.on("resize", () => this.stage?.notifyLayoutChanged()));
		this.registerEvent(this.app.workspace.on("layout-change", () => this.stage?.notifyLayoutChanged()));

		await this.rescanPacks();
		if (this.settings.autoSpawn) {
			for (let i = 0; i < this.settings.autoSpawnCount; i++) this.spawnMascot();
		}
	}

	onunload(): void {
		this.stage?.destroy();
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	async rescanPacks(): Promise<void> {
		if (!this.settings.packsFolder) {
			this.basePacks = [];
			this.refreshAvailablePacks();
			this.respawnWithCurrentSettings();
			return;
		}
		try {
			this.basePacks = await loadPacksFromFolder(this.app, this.settings.packsFolder);
			if (this.basePacks.length === 0) {
				new Notice("Shimeji: no actions.xml/behaviors.xml found in that folder yet — using the placeholder mascot.");
			} else {
				new Notice(`Shimeji: found ${this.basePacks.length} pack(s): ${this.basePacks.map((p) => p.name).join(", ")}`);
			}
		} catch (err) {
			console.error("[obsidian-shimeji] failed to scan pack folder", err);
			this.basePacks = [];
		}

		// Drop any selected pack ids the scan no longer finds, and auto-select everything found
		// on a completely fresh install (nothing chosen yet) rather than silently sticking with
		// the placeholder until the user visits Settings.
		const validIds = new Set(this.basePacks.map((p) => p.id));
		this.settings.activePackIds = this.settings.activePackIds.filter((id) => validIds.has(id));
		if (this.settings.activePackIds.length === 0 && this.basePacks.length > 0) {
			this.settings.activePackIds = this.basePacks.map((p) => p.id);
		}
		await this.saveSettings();

		this.refreshAvailablePacks();
		this.respawnWithCurrentSettings();
	}

	private refreshAvailablePacks(): void {
		this.availablePacks = this.basePacks.map((p) => mergeCustomContent(p, this.settings.customContent[p.id]));
	}

	/** Re-derives availablePacks from the current custom content and rebinds every live
	 * mascot's driver, so an edit made in the custom-content editor takes effect immediately
	 * instead of waiting for the next natural reassignment. */
	applyCustomContent(): void {
		this.refreshAvailablePacks();
		for (const mascot of this.stage?.getMascots() ?? []) {
			this.attachActivePack(mascot, this.mascotPackId.get(mascot) ?? null);
		}
	}

	toggleMascot(): void {
		if (!this.stage) return;
		if (this.stage.getMascots().length > 0) {
			this.stage.removeAllMascots();
		} else {
			for (let i = 0; i < this.settings.autoSpawnCount; i++) this.spawnMascot();
		}
	}

	spawnMascot(): void {
		this.stage?.spawnMascot();
	}

	/** Re-validates every live mascot's pack assignment against the current settings (called
	 * after a rescan or a "Characters" toggle change) — reassigns only the ones whose pack is no
	 * longer enabled/available, leaving everyone else exactly as they were. */
	respawnWithCurrentSettings(): void {
		if (!this.stage) return;
		for (const mascot of this.stage.getMascots()) {
			const current = this.mascotPackId.get(mascot) ?? null;
			const stillValid =
				current !== null && this.settings.activePackIds.includes(current) && this.availablePacks.some((p) => p.id === current);
			if (!stillValid) this.attachActivePack(mascot, this.pickPackId());
		}
	}

	applyScale(): void {
		for (const mascot of this.stage?.getMascots() ?? []) mascot.scale = this.settings.scale;
	}

	applyAllowDragging(): void {
		for (const mascot of this.stage?.getMascots() ?? []) mascot.dragEnabled = this.settings.allowDragging;
	}

	applyChaseMouseEnabled(): void {
		this.engineConfig.chaseMouseEnabled = this.settings.chaseMouseEnabled;
	}

	private onMascotCreated(mascot: Mascot, bornBehaviorName: string | undefined, parent: Mascot | undefined): void {
		mascot.scale = this.settings.scale;
		mascot.dragEnabled = this.settings.allowDragging;
		// A Breed-spawned sibling inherits its parent's exact character instead of picking a
		// random active one, matching the original (splitting in two keeps the same look).
		const packId = parent ? this.mascotPackId.get(parent) ?? null : this.pickPackId();
		this.attachActivePack(mascot, packId);
		if (bornBehaviorName) mascot.startNamedBehavior(bornBehaviorName);
	}

	private pickPackId(): string | null {
		const valid = this.settings.activePackIds.filter((id) => this.availablePacks.some((p) => p.id === id));
		if (valid.length === 0) return null;
		return valid[Math.floor(Math.random() * valid.length)];
	}

	private attachActivePack(mascot: Mascot, packId: string | null): void {
		this.mascotPackId.set(mascot, packId);
		const pack = packId ? this.availablePacks.find((p) => p.id === packId) : undefined;
		if (pack) {
			mascot.attachDriver(new PackDriver(pack, this.engineConfig, new Random()));
		} else {
			mascot.detachDriver();
		}
	}

	/** Right-click menu on a mascot itself — Obsidian's Menu has no native submenu support, so
	 * related groups are separated with setIsLabel(true) headers instead of nested flyouts. */
	private showMascotContextMenu(mascot: Mascot, ev: MouseEvent): void {
		const menu = new Menu();

		menu.addItem((item) => item.setTitle("Add another Shimeji").setIcon("plus").onClick(() => this.spawnMascot()));
		menu.addItem((item) =>
			item
				.setTitle("Duplicate this Shimeji")
				.setIcon("copy")
				// Goes straight through Stage.spawnMascot rather than mascot.requestSibling: a
				// deliberate one-off menu action should bypass the "allow breeding" policy
				// (which only governs a pack's own automatic Breed action), while still
				// respecting maxMascots and still inheriting the same character.
				.onClick(() => this.stage?.spawnMascot(mascot.physics.x + 24, mascot.physics.y, undefined, mascot)),
		);
		menu.addItem((item) =>
			item
				.setTitle("Remove this Shimeji")
				.setIcon("trash")
				.onClick(() => this.stage?.removeMascot(mascot)),
		);
		menu.addItem((item) =>
			item
				.setTitle("Remove all Shimejis")
				.setIcon("trash-2")
				.onClick(() => this.stage?.removeAllMascots()),
		);

		if (this.availablePacks.length > 0) {
			menu.addSeparator();
			const currentPackId = this.mascotPackId.get(mascot) ?? null;
			menu.addItem((item) => item.setTitle("Switch character").setIsLabel(true));
			menu.addItem((item) =>
				item
					.setTitle("(placeholder)")
					.setChecked(currentPackId === null)
					.onClick(() => this.attachActivePack(mascot, null)),
			);
			for (const pack of this.availablePacks) {
				menu.addItem((item) =>
					item
						.setTitle(pack.name)
						.setChecked(currentPackId === pack.id)
						.onClick(() => this.attachActivePack(mascot, pack.id)),
				);
			}
		}

		const behaviorNames = mascot.listBehaviorNames();
		if (behaviorNames.length > 0) {
			menu.addSeparator();
			menu.addItem((item) => item.setTitle("Set behavior").setIsLabel(true));
			for (const name of behaviorNames) {
				menu.addItem((item) => item.setTitle(name).onClick(() => mascot.startNamedBehavior(name)));
			}
		}

		menu.addSeparator();
		menu.addItem((item) =>
			item
				.setTitle("Plugin settings...")
				.setIcon("settings")
				.onClick(() => this.openPluginSettings()),
		);

		menu.showAtMouseEvent(ev);
	}

	private openPluginSettings(): void {
		try {
			const setting = (this.app as unknown as { setting: { open: () => void; openTabById: (id: string) => void } }).setting;
			setting.open();
			setting.openTabById(this.manifest.id);
		} catch {
			new Notice("Open Settings -> Community plugins -> Shimeji Desktop Mascot to configure.");
		}
	}
}
