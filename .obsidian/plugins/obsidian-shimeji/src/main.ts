import { MarkdownView, Menu, Notice, Platform, Plugin } from "obsidian";
import { installDebugApi, uninstallDebugApi } from "./debugApi";
import { ObsidianDomEnvironment } from "./engine/Environment";
import { Mascot } from "./engine/Mascot";
import type { PaneActions } from "./engine/PaneActions";
import { Random } from "./engine/Random";
import { Stage } from "./engine/Stage";
import { DEFAULT_ENGINE_CONFIG, type EngineConfig } from "./engine/types";
import { ObsidianPaneActions } from "./ObsidianPaneActions";
import { mergeCustomContent } from "./shimeji/CustomContentBuilder";
import { PackDriver } from "./shimeji/PackDriver";
import { loadPacksFromFolder } from "./shimeji/PackLoader";
import { sounds } from "./shimeji/SoundPlayer";
import type { MascotPack } from "./shimeji/types";
import { DEFAULT_SETTINGS, ShimejiSettingTab, type ShimejiSettings } from "./settings";

/** How often to check whether a mascot is currently on the user's active pane and roll for
 * "note mischief" — not tied to any real engine tick, this is Obsidian-layer-only and has no
 * source to be faithful to at all (see allowNoteMischief). */
const NOTE_MISCHIEF_CHECK_MS = 15_000;
/** Chance per check, while eligible, of actually swapping the note — tuned to feel like a rare
 * surprise (roughly once every several minutes of continuous editing) rather than a nuisance. */
const NOTE_MISCHIEF_CHANCE = 0.03;

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
	/** The real (Obsidian-specific) pane mutation implementation — see ObsidianPaneActions for
	 * why resizing/throwing lean on undocumented internals more than anything else this plugin
	 * does. */
	private obsidianPaneActions!: ObsidianPaneActions;
	/** What every PackDriver actually receives: gates obsidianPaneActions' resize/throw methods
	 * behind the "Window mischief" setting live (read fresh on every call, not captured once),
	 * so flipping the toggle takes effect immediately without reattaching every mascot's driver.
	 * restoreThrown is deliberately always allowed through regardless of the toggle — turning
	 * "throw" off shouldn't strand an already-thrown window with no way back. */
	private paneActionsGate: PaneActions = {
		resizeBy: (pane, deltaPx) => {
			if (this.settings.allowWindowThrow) this.obsidianPaneActions.resizeBy(pane, deltaPx);
		},
		beginThrow: (pane) => (this.settings.allowWindowThrow ? this.obsidianPaneActions.beginThrow(pane) : undefined),
		restoreThrown: () => this.obsidianPaneActions.restoreThrown(),
	};

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

		this.engineConfig.chaseMouseEnabled = this.effectiveChaseMouseEnabled();
		this.obsidianPaneActions = new ObsidianPaneActions(this.app);

		this.stage = new Stage({
			config: this.engineConfig,
			paneLedgesEnabled: this.settings.paneLedgesEnabled,
			debugLedges: this.settings.debugLedges,
			maxMascots: this.settings.maxMascots,
			allowBreeding: this.settings.allowBreeding,
			allowTransients: this.settings.allowTransients,
			// Real Manager.getCount(imageSet) — only this layer knows which pack each mascot wears.
			getSameCharacterCount: (mascot) => (this.stage?.getMascots() ?? []).filter((m) => this.sameCharacter(mascot, m)).length,
			// Passed explicitly (rather than relying on Stage's own no-argument default) so
			// getWorldTop() reads the real, documented `app.workspace.containerEl` instead of
			// falling back to a guessed `.workspace` selector — see Environment.ts.
			environment: new ObsidianDomEnvironment(this.app.workspace),
			onMascotCreated: (mascot, bornBehaviorName, parent, forcedPackId) => this.onMascotCreated(mascot, bornBehaviorName, parent, forcedPackId),
			onContextMenu: (mascot, ev) => this.showMascotContextMenu(mascot, ev),
		});
		this.stage.start();
		installDebugApi(() => this.stage);
		this.applySoundSettings();

		this.addSettingTab(new ShimejiSettingTab(this.app, this));

		this.addRibbonIcon("cat", "Toggle Shimeji mascots", () => this.toggleMascot());
		this.addCommand({ id: "shimeji-spawn", name: "Spawn mascot", callback: () => this.spawnMascot() });
		this.addCommand({ id: "shimeji-remove", name: "Remove mascot", callback: () => this.stage?.removeMascot() });
		this.addCommand({ id: "shimeji-remove-all", name: "Remove all mascots", callback: () => this.stage?.removeAllMascots() });
		// Real Main.java's "Reduce to One!" tray item (Manager.remainOne()) — a *third* distinct
		// population command from "Another One!"/spawnMascot and "Bye Everyone!"/removeAllMascots,
		// previously missing entirely (this had been incorrectly treated as a duplicate of
		// "remove all" instead of its own real, real-mascot-keeping primitive).
		this.addCommand({ id: "shimeji-reduce-to-one", name: "Reduce to one mascot", callback: () => this.stage?.removeAllButOne() });
		this.addCommand({ id: "shimeji-follow-mouse", name: "Make all mascots follow the mouse", callback: () => this.followMouseAllMascots() });
		this.addCommand({ id: "shimeji-rescan", name: "Rescan pack folder", callback: () => this.rescanPacks() });
		// Real Main.java's "Restore IE!" tray item — always available regardless of the "Window
		// mischief" toggle (see paneActionsGate), same reasoning as its real counterpart: turning
		// throwing off in the future shouldn't strand a window thrown while it was still on.
		this.addCommand({ id: "shimeji-restore-windows", name: "Restore thrown windows", callback: () => this.restoreThrownWindows() });

		this.registerEvent(this.app.workspace.on("resize", () => this.stage?.notifyLayoutChanged()));
		this.registerEvent(this.app.workspace.on("layout-change", () => this.stage?.notifyLayoutChanged()));
		this.registerInterval(window.setInterval(() => this.maybeTriggerNoteMischief(), NOTE_MISCHIEF_CHECK_MS));

		await this.rescanPacks();
		if (this.settings.autoSpawn) {
			for (let i = 0; i < this.settings.autoSpawnCount; i++) this.spawnMascot();
		}
	}

	onunload(): void {
		uninstallDebugApi();
		this.stage?.destroy();
		// The clip registry is a module-level singleton (as the real `Sounds` is a static class),
		// so it outlives this plugin instance unless it's explicitly torn down — without this, a
		// disable/enable cycle would leave the previous load's clips loaded and possibly playing.
		sounds.destroy();
	}

	/** Real `Sounds.isEnabled()` reads a program setting on every playback; here the setting is
	 * pushed into the registry instead, which additionally lets switching it off stop whatever is
	 * currently mid-clip (as the original's own settings dialog does via Sounds.stopAll()). */
	applySoundSettings(): void {
		sounds.setEnabled(this.settings.soundsEnabled);
		sounds.setMasterVolume(this.settings.soundVolume / 100);
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

	/** Real shimeji-ee has no autonomous/spontaneous ChaseMouse at all — it's exclusively
	 * triggered on demand, and by *two* separate real menus with different scopes, not one:
	 * the tray's own "Follow Mouse!" (`Main.java`: `getManager().setBehaviorAll("ChaseMouse")`,
	 * every live mascot regardless of character) and a mascot's own right-click "Follow Mouse!"
	 * (`Mascot.java`'s own popup menu: `setBehaviorAll(config, "ChaseMouse", imageSet)`, only
	 * mascots sharing *that* mascot's character). `onlyMatching` is that same distinction —
	 * omitted for the command-palette/tray-equivalent case, passed for the per-mascot menu. */
	followMouseAllMascots(onlyMatching?: (mascot: Mascot) => boolean): void {
		if (!this.effectiveChaseMouseEnabled()) {
			new Notice("Chase the mouse is disabled (see Settings), or unavailable on mobile.");
			return;
		}
		const mascots = this.stage?.getMascots() ?? [];
		for (const mascot of onlyMatching ? mascots.filter(onlyMatching) : mascots) mascot.startNamedBehavior("ChaseMouse");
	}

	/** True when `other` wears the same character (pack, including "no pack"/placeholder) as
	 * `mascot` — the filter both of the per-mascot menu's character-scoped items use. */
	private sameCharacter(mascot: Mascot, other: Mascot): boolean {
		return (this.mascotPackId.get(other) ?? null) === (this.mascotPackId.get(mascot) ?? null);
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
		this.engineConfig.chaseMouseEnabled = this.effectiveChaseMouseEnabled();
	}

	/** No ambient pointer exists on a touch-only device between touches, so ChaseMouse would
	 * just be dashing toward a stale, meaningless position — skip it there regardless of the
	 * setting, which still governs desktop and still round-trips correctly if the same vault is
	 * later opened there. */
	private effectiveChaseMouseEnabled(): boolean {
		return this.settings.chaseMouseEnabled && !Platform.isMobile;
	}

	private onMascotCreated(
		mascot: Mascot,
		bornBehaviorName: string | undefined,
		parent: Mascot | undefined,
		forcedPackId: string | null | undefined,
	): void {
		mascot.scale = this.settings.scale;
		mascot.dragEnabled = this.settings.allowDragging;
		// A Breed-spawned sibling inherits its parent's exact character instead of picking a
		// random active one, matching the original (splitting in two keeps the same look).
		// forcedPackId is the *other* real reason to skip the random pick — real per-mascot
		// "Another One!" (see spawnAnotherOfCharacter) — checked first since Breed never sets it.
		// `forcedPackId` carries two different things: a real pack id (per-mascot "Another One!")
		// or a Breed `BornMascot` *name* straight out of the pack XML. Real Breed.Delegate falls
		// back to the parent's own image set when no configuration by that name exists
		// (`getConfiguration(getBornMascot()) != null ? ... : getMascot().getImageSet()`), so an
		// unrecognised name means "same character as me", never a failure.
		const packId =
			forcedPackId !== undefined && forcedPackId !== null
				? this.resolvePackRef(forcedPackId) ?? (parent ? this.mascotPackId.get(parent) ?? null : this.pickPackId())
				: forcedPackId !== undefined
					? forcedPackId
					: parent
						? this.mascotPackId.get(parent) ?? null
						: this.pickPackId();
		this.attachActivePack(mascot, packId);
		if (bornBehaviorName) mascot.startNamedBehavior(bornBehaviorName);
	}

	/** Real per-mascot "Another One!" (`Mascot.java`'s own popup: `Main.createMascot(imageSet)`)
	 * — the exact same fresh, off-screen, random-facing spawn as the tray's own "Another One!"
	 * (spawnMascot()), just forced to this specific character instead of a random active one.
	 * Previously this menu slot ("Duplicate this Shimeji") spawned at a fixed offset next to the
	 * source and inherited its facing — neither of which the real per-mascot menu item does. */
	spawnAnotherOfCharacter(mascot: Mascot): void {
		const packId = this.mascotPackId.get(mascot) ?? null;
		this.stage?.spawnMascot(undefined, undefined, undefined, undefined, packId);
	}

	/** Matches a pack by id first, then by name — Breed's BornMascot names a character the way the
	 * pack XML does, which need not be our internal id. Returns null when neither matches, which
	 * callers treat as "fall back", not as an error. */
	private resolvePackRef(ref: string): string | null {
		if (this.availablePacks.some((p) => p.id === ref)) return ref;
		const byName = this.availablePacks.find((p) => p.name === ref);
		return byName ? byName.id : null;
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
			mascot.attachDriver(new PackDriver(pack, this.engineConfig, new Random(), this.paneActionsGate));
			mascot.setDisabledBehaviors(new Set(this.settings.disabledBehaviors[pack.id] ?? []));
		} else {
			mascot.detachDriver();
		}
	}

	/** Real `Main.setMascotBehaviorEnabled(name, mascot, enabled)`: persists the choice and applies
	 * it to every mascot of that character, not just the one whose menu was used. */
	private async setBehaviorEnabled(mascot: Mascot, name: string, enabled: boolean): Promise<void> {
		const packId = this.mascotPackId.get(mascot) ?? null;
		if (!packId) return;
		const current = new Set(this.settings.disabledBehaviors[packId] ?? []);
		if (enabled) current.delete(name);
		else current.add(name);
		this.settings.disabledBehaviors[packId] = Array.from(current);
		await this.saveSettings();
		for (const m of this.stage?.getMascots() ?? []) {
			if ((this.mascotPackId.get(m) ?? null) === packId) m.setDisabledBehaviors(current);
		}
	}

	restoreThrownWindows(): void {
		this.obsidianPaneActions.restoreThrown();
	}

	/** Not a real shimeji-ee mechanism — see allowNoteMischief. Independent of the mascot
	 * simulation loop entirely: just "is any live mascot's position currently over the pane the
	 * user is actively editing," checked on its own timer rather than every 40ms tick. */
	private maybeTriggerNoteMischief(): void {
		if (!this.settings.allowNoteMischief) return;
		const activeLeaf = this.app.workspace.getActiveViewOfType(MarkdownView)?.leaf;
		if (!activeLeaf) return;
		const rect = activeLeaf.containerEl.getBoundingClientRect();
		const mascots = this.stage?.getMascots() ?? [];
		const onActivePane = mascots.some(
			(m) => m.physics.x >= rect.left && m.physics.x <= rect.right && m.physics.y >= rect.top && m.physics.y <= rect.bottom,
		);
		if (!onActivePane) return;
		if (Math.random() > NOTE_MISCHIEF_CHANCE) return;
		this.obsidianPaneActions.openRandomNote(activeLeaf.containerEl);
	}

	/** Right-click menu on a mascot itself (also reachable by a touch-and-hold on mobile — see
	 * Mascot's own long-press handling). Obsidian's Menu has no native submenu support, so
	 * related groups are separated with setIsLabel(true) headers instead of nested flyouts. */
	private showMascotContextMenu(mascot: Mascot, ev: MouseEvent): void {
		const menu = new Menu();

		menu.addItem((item) => item.setTitle("Add another Shimeji").setIcon("plus").onClick(() => this.spawnMascot()));
		// Real per-mascot "Another One!" (`Mascot.java`'s own popup) — see
		// spawnAnotherOfCharacter's own comment for why this is a fresh off-screen/random-facing
		// spawn like the item above, just forced to this mascot's own character, not an offset
		// duplicate next to it (that was this menu slot's previous, unverified behavior).
		menu.addItem((item) =>
			item
				.setTitle("Add another of this character")
				.setIcon("copy")
				.onClick(() => this.spawnAnotherOfCharacter(mascot)),
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
		// Real shimeji-ee actually has *two* separate "Reduce to One!"/"Follow Mouse!" items —
		// the tray's own (global, every character — see the shimeji-reduce-to-one/
		// shimeji-follow-mouse commands, which mirror those) and a *second*, distinct pair on
		// each mascot's own right-click menu (`Mascot.java`'s showPopup), scoped to only that
		// mascot's character. This single context menu stands in for the per-mascot one, so
		// these two use the character-scoped real semantics, not the global ones — previously
		// missing/conflated with the global versions entirely.
		const sameCharacterCount = (this.stage?.getMascots() ?? []).filter((m) => this.sameCharacter(mascot, m)).length;
		if (sameCharacterCount > 1) {
			menu.addItem((item) =>
				item
					.setTitle("Dismiss others of this character")
					.setIcon("minus")
					// Real `remainOne(imageSet, mascot)` keeps *the mascot whose menu this is*, not
					// the newest one of its character — an earlier port read only the unparameterised
					// overloads and had that wrong, so right-clicking one mascot could leave a
					// different one alive.
					.onClick(() => this.stage?.removeAllButOne(mascot, (m) => this.sameCharacter(mascot, m))),
			);
		}
		// Real per-mascot "Dismiss All Others" (`Mascot.java`: `manager.remainOne(this)`) — keeps
		// this mascot and dismisses every other one *regardless of character*, a distinct item
		// from "Dismiss Others" above (which is scoped to this mascot's own character).
		if ((this.stage?.getMascots().length ?? 0) > 1) {
			menu.addItem((item) =>
				item
					.setTitle("Dismiss all other Shimejis")
					.setIcon("minus-circle")
					.onClick(() => this.stage?.removeAllButOne(mascot)),
			);
		}
		// Real shimeji-ee's "Follow Mouse!", the only real trigger ChaseMouse ever has — see
		// followMouseAllMascots(). Hidden rather than shown-disabled here, same as "Switch
		// character"/"Set behavior" below when there's nothing for them to do either.
		if (this.effectiveChaseMouseEnabled()) {
			menu.addItem((item) =>
				item
					.setTitle("Make this character follow the mouse")
					.setIcon("mouse-pointer-click")
					.onClick(() => this.followMouseAllMascots((m) => this.sameCharacter(mascot, m))),
			);
		}
		// Real shimeji-ee's "Restore IE!" tray item — see restoreThrownWindows(). Shown whenever
		// window-throwing itself is enabled, same as "follow the mouse" above, even though this
		// specific mascot may not have thrown anything itself (real Restore IE! isn't per-mascot
		// either).
		if (this.settings.allowWindowThrow) {
			menu.addItem((item) =>
				item
					.setTitle("Restore thrown windows")
					.setIcon("picture-in-picture-2")
					.onClick(() => this.restoreThrownWindows()),
			);
		}

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

		// Real per-mascot "Allowed Behaviours" submenu: a checkbox per `Toggleable` behavior, each
		// persisting an on/off choice for that character (distinct from "Set behavior", which runs
		// one right now). Obsidian's Menu has no submenus, so this uses a label + checked items,
		// the same pattern the rest of this menu already uses.
		const toggleable = mascot.listToggleableBehaviorNames();
		if (toggleable.length > 0) {
			const packId = this.mascotPackId.get(mascot) ?? null;
			const disabled = new Set(packId ? this.settings.disabledBehaviors[packId] ?? [] : []);
			menu.addSeparator();
			menu.addItem((item) => item.setTitle("Allowed behaviors").setIsLabel(true));
			for (const name of toggleable) {
				const enabled = !disabled.has(name);
				menu.addItem((item) =>
					item
						.setTitle(name)
						.setChecked(enabled)
						.onClick(() => void this.setBehaviorEnabled(mascot, name, !enabled)),
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
