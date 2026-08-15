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
import { buildPaneWranglingContent } from "./shimeji/paneWrangling";
import { PackDriver } from "./shimeji/PackDriver";
import { runMovementSelfTest, startFreePlayRecording, type SelfTestHandle } from "./movementSelfTest";
import { loadPacksFromFolder } from "./shimeji/PackLoader";
import { sounds } from "./shimeji/SoundPlayer";
import type { MascotPack } from "./shimeji/types";
import { DEFAULT_SETTINGS, ShimejiSettingTab, type ShimejiSettings } from "./settings";
import { Residency } from "./room/Residency";
import { ROOM_VIEW_TYPE, RoomView } from "./room/RoomView";
import { roomStyle, ROOM_STYLE_IDS, type RoomStyle } from "./room/rooms";

/** How often to check whether a mascot is currently on the user's active pane and roll for
 * "note mischief" — not tied to any real engine tick, this is Obsidian-layer-only and has no
 * source to be faithful to at all (see allowNoteMischief). */
const NOTE_MISCHIEF_CHECK_MS = 15_000;
/** Chance per check, while eligible, of actually swapping the note — tuned to feel like a rare
 * surprise (roughly once every several minutes of continuous editing) rather than a nuisance. */
const NOTE_MISCHIEF_CHANCE = 0.03;

/** Shift + three clicks in roughly the same place within this window orders the nearest mascot to
 * that spot. Shift is what makes the gesture safe to listen for passively: a plain triple-click is
 * ordinary text selection, whereas nobody shift-triple-clicks by accident. The listener never
 * preventDefaults, so whatever Obsidian does with those clicks still happens. */
const SPOT_ORDER_CLICK_WINDOW_MS = 700;
const SPOT_ORDER_CLICK_SLOP_PX = 24;
const SPOT_ORDER_CLICKS = 3;

export default class ShimejiPlugin extends Plugin {
	/** Who lives in the plant room. Created unconditionally — it is inert until the room's pane
	 * is actually open, and having it always present keeps every call site free of a null check. */
	readonly residency = new Residency({
		stage: () => this.stage,
		layout: () => this.roomView()?.layout(),
		notify: (message) => new Notice(message),
		rememberResident: (resident) => {
			const before = JSON.stringify(this.settings.roomResident ?? null);
			if (before === JSON.stringify(resident ?? null)) return;
			this.settings.roomResident = resident;
			void this.saveSettings();
		},
		packIdOf: (mascot) => this.packIdOf(mascot),
	});
	private residencyRaf = 0;
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
	/** Panes opened by a spot order, so they can be tidied up again on request — the mascot leaves
	 * the layout it built standing, since closing it would drop the mascot the instant it arrived. */
	private mascotOpenedPanes: unknown[] = [];
	/** Rolling shift-click tally behind the spot-order gesture. */
	private spotClicks: { x: number; y: number; at: number; count: number } = { x: 0, y: 0, at: 0, count: 0 };
	/** What every PackDriver actually receives: gates obsidianPaneActions' resize/throw methods
	 * behind the "Window mischief" setting live (read fresh on every call, not captured once),
	 * so flipping the toggle takes effect immediately without reattaching every mascot's driver.
	 * restoreThrown is deliberately always allowed through regardless of the toggle — turning
	 * "throw" off shouldn't strand an already-thrown window with no way back. */
	private paneActionsGate: PaneActions = {
		// Resizing is gated by *either* toggle, because it is the same physical act in both cases —
		// a mascot changing the size of one of your panes. "Window mischief" reaches it by carrying a
		// pane while walking (real WalkWithIE); "pane wrangling" reaches it deliberately. Keeping it
		// behind only the throw toggle would have meant pane wrangling silently did nothing.
		resizeBy: (pane, deltaPx, axis) =>
			this.settings.allowPaneWrangling || this.settings.allowWindowThrow ? this.obsidianPaneActions.resizeBy(pane, deltaPx, axis) : false,
		setSidebar: (pane, mode) => (this.settings.allowPaneWrangling ? this.obsidianPaneActions.setSidebar(pane, mode) : false),
		// Behind its own toggle: this one *creates* a pane in the user's layout, which is a bigger
		// intrusion than resizing an existing one. Only ever reached from an explicit spot order, and
		// only once the mascot has physically walked to the button.
		listNewPaneControls: () => (this.settings.allowLayoutSurgery ? this.obsidianPaneActions.listNewPaneControls() : []),
		pressNewPaneControl: (near) => {
			if (!this.settings.allowLayoutSurgery) return undefined;
			const created = this.obsidianPaneActions.pressNewPaneControl(near);
			if (created !== undefined) this.mascotOpenedPanes.push(created);
			return created;
		},
		closePane: (pane) => this.obsidianPaneActions.closePane(pane),
		// Throwing stays behind its own toggle alone: it is the only one that spawns a separate OS
		// window, which is a different order of surprise from resizing a split.
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
		this.applyUpsideDownFeetDrag();
		this.applyRoamEnabled();
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
		installDebugApi(
			() => this.stage,
			() => this.paneActionsGate,
			() => ({ report: () => this.roomDiagnostics() }),
		);
		this.applySoundSettings();

		this.addSettingTab(new ShimejiSettingTab(this.app, this));

		this.registerView(
			ROOM_VIEW_TYPE,
			(leaf) =>
				new RoomView(leaf, {
					style: () => roomStyle(this.settings.roomStyle),
					imageSrc: (style) => this.roomImageSrc(style),
					onLayoutChanged: () => this.residency.tick(),
					showSurfaces: () => this.showRoomSurfaces,
				}),
		);
		this.startResidencyLoop();

		this.addRibbonIcon("cat", "Toggle Shimeji mascots", () => this.toggleMascot());
		this.addRibbonIcon("sprout", "Open the Shimeji plant room", () => void this.revealRoom());
		this.addCommand({ id: "shimeji-open-room", name: "Open the plant room", callback: () => void this.revealRoom() });
		this.addCommand({ id: "shimeji-send-home", name: "Send a shimeji home to the plant room", callback: () => void this.sendHome() });
		this.addCommand({ id: "shimeji-call-out", name: "Call the shimeji out of the plant room", callback: () => this.callOutOfRoom() });
		this.addCommand({ id: "shimeji-room-surfaces", name: "Show/hide what the shimeji can stand on in the plant room", callback: () => this.toggleRoomSurfaces() });
		this.addCommand({ id: "shimeji-room-reload-art", name: "Reload the plant room artwork", callback: () => this.reloadRoomArt() });
		this.addCommand({ id: "shimeji-room-next", name: "Switch to the next plant room", callback: () => void this.cycleRoomStyle() });
		this.addCommand({ id: "shimeji-spawn", name: "Spawn mascot", callback: () => this.spawnMascot() });
		this.addCommand({ id: "shimeji-remove", name: "Remove mascot", callback: () => this.stage?.removeMascot() });
		this.addCommand({ id: "shimeji-remove-all", name: "Remove all mascots", callback: () => this.stage?.removeAllMascots() });
		// Real Main.java's "Reduce to One!" tray item (Manager.remainOne()) — a *third* distinct
		// population command from "Another One!"/spawnMascot and "Bye Everyone!"/removeAllMascots,
		// previously missing entirely (this had been incorrectly treated as a duplicate of
		// "remove all" instead of its own real, real-mascot-keeping primitive).
		this.addCommand({ id: "shimeji-reduce-to-one", name: "Reduce to one mascot", callback: () => this.stage?.removeAllButOne() });
		// Two deliberately separate commands: the first is real shimeji-ee's "Follow Cursor" tray
		// item exactly (one `setBehaviorAll("ChaseMouse")`, after which the pack's own
		// SitAndFaceMouse chain takes over and it watches the pointer without chasing again); the
		// second is the invented sticky version. Keeping them apart means the faithful behavior is
		// never silently redefined, and there is no default to argue about.
		this.addCommand({ id: "shimeji-follow-mouse", name: "Make all mascots dash to the mouse (once)", callback: () => this.followMouseAllMascots() });
		this.addCommand({
			id: "shimeji-keep-following-mouse",
			name: "Keep all mascots following the mouse",
			callback: () => this.keepFollowingMouseAllMascots(true),
		});
		this.addCommand({
			id: "shimeji-stop-following-mouse",
			name: "Stop all mascots following the mouse",
			callback: () => this.keepFollowingMouseAllMascots(false),
		});
		this.addCommand({
			id: "shimeji-close-opened-panes",
			name: "Close panes opened by mascots",
			callback: () => this.closeMascotOpenedPanes(),
		});
		this.addCommand({ id: "shimeji-rescan", name: "Rescan pack folder", callback: () => this.rescanPacks() });
		// In-Obsidian movement testing. The headless suite only ever exercises the geometry model;
		// these two exercise the real stage, real DOM-derived ledges and real frame pacing, which is
		// where "it feels wrong but the tests pass" lives.
		this.addCommand({ id: "shimeji-movement-selftest", name: "Run movement self-test (writes a report)", callback: () => this.runMovementSelfTest() });
		this.addCommand({ id: "shimeji-record-movement", name: "Start/stop recording movement (writes a report)", callback: () => this.toggleMovementRecording() });
		// Real Main.java's "Restore IE!" tray item — always available regardless of the "Window
		// mischief" toggle (see paneActionsGate), same reasoning as its real counterpart: turning
		// throwing off in the future shouldn't strand a window thrown while it was still on.
		this.addCommand({ id: "shimeji-restore-windows", name: "Restore thrown windows", callback: () => this.restoreThrownWindows() });

		// Capture phase, for the same reason the ambient pointer tracker uses it: a bubble-phase
		// listener on window can be starved by any handler in between calling stopPropagation.
		this.registerDomEvent(window, "click", (ev) => this.onPossibleSpotOrder(ev), { capture: true });

		this.registerEvent(this.app.workspace.on("resize", () => this.stage?.notifyLayoutChanged()));
		this.registerEvent(this.app.workspace.on("layout-change", () => this.stage?.notifyLayoutChanged()));
		this.registerInterval(window.setInterval(() => this.maybeTriggerNoteMischief(), NOTE_MISCHIEF_CHECK_MS));

		await this.rescanPacks();
		if (this.settings.autoSpawn) {
			for (let i = 0; i < this.settings.autoSpawnCount; i++) this.spawnMascot();
		}
		// After the auto-spawn, and deferred until the workspace has finished restoring its own
		// layout — the room's pane is part of that layout, and asking for its rect before it exists
		// gets nothing.
		this.app.workspace.onLayoutReady(() => {
			// A view type nobody has ever opened exists only in the command palette, which is not
			// where anyone looks for a room. Shown once, then it is the workspace's business —
			// closing it is remembered by Obsidian's own layout, and this never reopens it.
			if (!this.settings.roomIntroduced) {
				this.settings.roomIntroduced = true;
				void this.saveSettings();
				void this.revealRoom();
			}
			if (this.settings.roomResident) void this.restoreResident();
		});
	}

	/**
	 * Puts the remembered resident back in the room after a restart, with no journey — it never
	 * left, so watching it walk home would be a lie about what happened.
	 */
	private async restoreResident(): Promise<void> {
		const remembered = this.settings.roomResident;
		if (!remembered || this.residency.hasResident) return;
		const view = (await this.revealRoom()) ?? this.roomView();
		if (!view?.layout()) return;
		// Its own character, not a random one: a room whose occupant changes each launch is not
		// somebody's home.
		const existing = (this.stage?.getMascots() ?? []).find((m) => this.packIdOf(m) === remembered.packId);
		if (!existing) this.stage?.spawnMascot(undefined, undefined, undefined, undefined, remembered.packId);
		const mascot = existing ?? (this.stage?.getMascots() ?? []).slice(-1)[0];
		if (mascot) this.residency.placeDirectly(mascot);
	}

	onunload(): void {
		cancelAnimationFrame(this.residencyRaf);
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

	private selfTest?: SelfTestHandle;
	private selfTestStatus?: HTMLElement;
	private recording?: { stop(): string };
	private recordingStatus?: HTMLElement;

	/**
	 * Drives one live mascot through every movement the pack has, then a lap of the real window, and
	 * writes what happened to a note. Reduces to a single mascot first: with several on screen it is
	 * not clear which one a row in the report describes.
	 */
	private runMovementSelfTest(): void {
		if (this.selfTest) {
			this.selfTest.cancel();
			new Notice("Shimeji: cancelling self-test — the partial report will still be written");
			return;
		}
		const stage = this.stage;
		if (!stage) return;
		// Two mascots on purpose. The first runs the script; the rest are yours to drag, throw and
		// generally interfere with, and everything they do lands in the same report. Running both on
		// one mascot cannot work — touching it cancels whatever order the script just issued.
		for (let i = stage.getMascots().length; i < 2; i++) {
			const before = stage.getMascots().length;
			this.spawnMascot();
			if (stage.getMascots().length === before) break; // at the max-mascots limit
		}
		const [mascot, ...free] = stage.getMascots();
		if (!mascot) {
			new Notice("Shimeji: no mascot to test");
			return;
		}
		new Notice(
			free.length > 0
				? "Shimeji: self-test started. Just leave it running — both mascots are recorded. Run the command again to cancel."
				: "Shimeji: self-test started. It takes a few minutes — run the command again to cancel.",
		);
		this.selfTestStatus = this.addStatusBarItem();
		this.selfTestStatus.setText("Shimeji test: starting");
		this.selfTest = runMovementSelfTest(stage, mascot, free, {
			onProgress: (message) => this.selfTestStatus?.setText(`Shimeji test: ${message}`),
			onDone: (report) => {
				this.selfTest = undefined;
				this.selfTestStatus?.remove();
				this.selfTestStatus = undefined;
				void this.writeReport("selftest", report);
			},
		});
	}

	/** The unscripted counterpart: leave it running and use Obsidian normally. A script only exercises
	 * what it was told to; this catches whatever a real session does to a mascot. */
	private toggleMovementRecording(): void {
		if (this.recording) {
			const report = this.recording.stop();
			this.recording = undefined;
			this.recordingStatus?.remove();
			this.recordingStatus = undefined;
			void this.writeReport("recording", report);
			return;
		}
		const mascots = this.stage?.getMascots() ?? [];
		if (!this.stage || mascots.length === 0) {
			new Notice("Shimeji: spawn a mascot first");
			return;
		}
		this.recording = startFreePlayRecording(this.stage, [...mascots]);
		this.recordingStatus = this.addStatusBarItem();
		this.recordingStatus.setText("● Shimeji recording");
		new Notice("Shimeji: recording. Use Obsidian normally, then run the command again to stop.");
	}

	/**
	 * Into the vault rather than the console, so it survives a reload and can be pasted whole.
	 *
	 * Deliberately **not** opened afterwards, and filed in its own folder. Opening it seemed helpful
	 * and was the opposite: Obsidian restores open notes on reload, so a heavy generated report was
	 * re-rendered every single launch, and a long enough run made the vault unusable until the note
	 * was deleted from outside the app. A notice with the path is enough — the folder also makes the
	 * whole lot easy to clear out in one go.
	 */
	private async writeReport(kind: string, body: string): Promise<void> {
		const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
		const folder = "Shimeji reports";
		const path = `${folder}/${kind} ${stamp}.md`;
		try {
			if (!this.app.vault.getAbstractFileByPath(folder)) await this.app.vault.createFolder(folder);
			await this.app.vault.create(path, body);
			new Notice(`Shimeji: report written to "${path}" (not opened — it can be a large note)`, 8000);
		} catch (e) {
			console.error("[obsidian-shimeji] could not write the report; logging it here instead", e);
			console.log(body);
			new Notice("Shimeji: could not write the report — logged to the console instead");
		}
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
		// Two overlays, in this order deliberately: the invented pane-wrangling set first, then the
		// user's own on top. mergeCustomContent replaces by name, so anyone who wants to retune or
		// disable one of these can simply author an action or behavior of the same name in the
		// custom-content editor — the built-in one loses, exactly as if it had been a pack default.
		const paneWrangling = this.settings.allowPaneWrangling ? buildPaneWranglingContent() : undefined;
		this.availablePacks = this.basePacks.map((p) =>
			mergeCustomContent(mergeCustomContent(p, paneWrangling), this.settings.customContent[p.id]),
		);
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

	/**
	 * The invented sticky counterpart to the faithful one-shot above — see
	 * BehaviorAI.setFollowingMouse for why they are two separate commands rather than one with a
	 * setting. Real "Follow Cursor" runs ChaseMouse exactly once; this keeps re-running it as the
	 * pointer moves away, which is what most people mean by "follow the mouse".
	 */
	keepFollowingMouseAllMascots(following: boolean, onlyMatching?: (mascot: Mascot) => boolean): void {
		if (following && !this.effectiveChaseMouseEnabled()) {
			new Notice("Chase the mouse is disabled (see Settings), or unavailable on mobile.");
			return;
		}
		const mascots = this.stage?.getMascots() ?? [];
		const targets = onlyMatching ? mascots.filter(onlyMatching) : mascots;
		for (const mascot of targets) mascot.setFollowingMouse(following);
		new Notice(following ? `Now following the mouse (${targets.length})` : `Stopped following the mouse (${targets.length})`);
	}

	/** Which character a mascot wears, or null for the built-in placeholder. */
	private packIdOf(mascot: Mascot): string | null {
		return this.mascotPackId.get(mascot) ?? null;
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

	/** Read at the moment of each grab, so flipping this mid-drag can't invert a mascot already in
	 * the air — the next pickup gets the new setting. */
	applyUpsideDownFeetDrag(): void {
		this.engineConfig.upsideDownFeetDrag = this.settings.upsideDownFeetDrag;
	}

	applyRoamEnabled(): void {
		this.engineConfig.roamEnabled = this.settings.roamEnabled;
	}

	/**
	 * Shift + triple-click anywhere: order the nearest mascot to that exact spot, reshaping the
	 * layout if it can't be reached otherwise.
	 *
	 * Deliberately passive — no preventDefault, no stopPropagation — so the clicks still do whatever
	 * Obsidian would normally do with them. Shift-clicking in the editor extends a selection, which
	 * is harmless, and requiring Shift is what makes it safe to watch every click in the first place:
	 * a bare triple-click is ordinary text selection and would fire this constantly.
	 */
	private onPossibleSpotOrder(ev: MouseEvent): void {
		if (!ev.shiftKey || ev.button !== 0) {
			this.spotClicks.count = 0;
			return;
		}
		const now = Date.now();
		const sameSpot = Math.hypot(ev.clientX - this.spotClicks.x, ev.clientY - this.spotClicks.y) <= SPOT_ORDER_CLICK_SLOP_PX;
		const inTime = now - this.spotClicks.at <= SPOT_ORDER_CLICK_WINDOW_MS;
		this.spotClicks = {
			x: ev.clientX,
			y: ev.clientY,
			at: now,
			count: sameSpot && inTime ? this.spotClicks.count + 1 : 1,
		};
		if (this.spotClicks.count < SPOT_ORDER_CLICKS) return;
		this.spotClicks.count = 0;
		this.orderNearestMascotToSpot({ x: ev.clientX, y: ev.clientY });
	}

	/** Sends whichever mascot is closest — "that one, go there" is the natural reading of pointing at
	 * a spot, and having every mascot pile onto it would be chaos with more than one on screen. */
	orderNearestMascotToSpot(point: { x: number; y: number }): void {
		const mascots = this.stage?.getMascots() ?? [];
		if (mascots.length === 0) return;
		let nearest = mascots[0];
		let bestD = Infinity;
		for (const mascot of mascots) {
			const d = Math.hypot(mascot.physics.x - point.x, mascot.physics.y - point.y);
			if (d < bestD) {
				bestD = d;
				nearest = mascot;
			}
		}
		// The plant room gets first refusal, because an order that crosses its threshold in either
		// direction is not an ordinary order — it is a move, and has to route to the door rather
		// than to the point. Everything else falls through unchanged.
		if (this.residency.handleOrder(point, this.residency.residentMascot ?? nearest)) return;
		nearest.orderToSpot(point);
		new Notice(`On my way to (${Math.round(point.x)}, ${Math.round(point.y)})`);
	}

	// ---- the plant room -------------------------------------------------

	/**
	 * Every link between "the plugin loaded" and "the room is on screen", separately.
	 *
	 * The room has no partial state a user could describe: it is either there or it is not, so a
	 * report of "I don't see it" is the same sentence whether the view type never registered, no
	 * leaf was ever opened, the sidebar is collapsed, or the pane is too small to draw into.
	 */
	private roomDiagnostics(): { chain: Array<Record<string, string | number | boolean>>; note?: string } {
		const leaves = this.app.workspace.getLeavesOfType(ROOM_VIEW_TYPE);
		const view = this.roomView();
		const layout = view?.layout();
		const chain: Array<Record<string, string | number | boolean>> = [
			{ step: "view type registered", ok: true, detail: ROOM_VIEW_TYPE },
			{ step: "pane open", ok: leaves.length > 0, detail: `${leaves.length} leaf/leaves` },
			{ step: "view built", ok: view !== undefined, detail: view ? "RoomView" : "no RoomView on the leaf" },
			{ step: "pane on screen", ok: layout !== undefined, detail: layout ? `${layout.rect.right - layout.rect.left}x${layout.rect.bottom - layout.rect.top} at (${Math.round(layout.rect.left)}, ${Math.round(layout.rect.top)})` : "collapsed, hidden, or zero-sized" },
			{ step: "drawn", ok: layout !== undefined, detail: layout ? `${layout.scale}x pixels, door on the ${layout.mirrored ? "right" : "left"}` : "-" },
			{ step: "artwork", ok: view?.artworkState.startsWith("loaded") ?? false, detail: view?.artworkState ?? "-" },
			{ step: "resident", ok: this.residency.hasResident, detail: this.settings.roomResident ? `remembered: ${this.settings.roomResident.packId ?? "placeholder"}` : "nobody" },
		];
		let note: string | undefined;
		if (leaves.length === 0) note = 'No pane is open. Run "Open the plant room" from the command palette, or click the sprout in the ribbon.';
		else if (!view) note = "A leaf exists but carries no RoomView — the plugin was probably reloaded while the pane was open. Close and reopen the pane.";
		else if (!layout) note = "The pane exists but is not on screen — the sidebar is collapsed, or another tab is showing in that slot.";
		return { chain, note };
	}

	/**
	 * Where a room's artwork comes from: a file the user drops into the plugin's own folder.
	 *
	 * A fixed path per room rather than a setting to fill in first — the whole setup is "put the
	 * picture here". `getResourcePath` turns a vault path into something an <img> will load, and is
	 * already how every pack sprite is resolved.
	 *
	 * The existence check is not a nicety. Handing an <img> a path with nothing behind it puts a red
	 * `ERR_FILE_NOT_FOUND` in the console, which reads as a broken plugin rather than as "you have
	 * not added the picture yet" — reported as exactly that.
	 */
	private async roomImageSrc(style: RoomStyle): Promise<string | undefined> {
		if (!style.imageFile) return undefined;
		const dir = this.manifest.dir ?? `${this.app.vault.configDir}/plugins/${this.manifest.id}`;
		const path = `${dir}/${style.imageFile}`;
		try {
			if (!(await this.app.vault.adapter.exists(path))) return undefined;
		} catch {
			return undefined;
		}
		return this.app.vault.adapter.getResourcePath(path);
	}

	/** Cycles through the rooms. A dropdown in settings is the discoverable way; this is the one you
	 * reach for while actually looking at the room. */
	private async cycleRoomStyle(): Promise<void> {
		const current = roomStyle(this.settings.roomStyle);
		const next = ROOM_STYLE_IDS[(ROOM_STYLE_IDS.indexOf(current.id) + 1) % ROOM_STYLE_IDS.length];
		await this.setRoomStyle(next);
	}

	async setRoomStyle(id: string): Promise<void> {
		this.settings.roomStyle = roomStyle(id).id;
		await this.saveSettings();
		const view = this.roomView();
		await view?.loadImage();
		view?.invalidate();
		view?.refresh();
		const style = roomStyle(this.settings.roomStyle);
		new Notice(`Shimeji room: ${style.label}${style.imageFile && !view ? "" : ""}`);
	}

	/** Draws the room's collision surfaces over the artwork. The one part of the room that cannot be
	 * checked by reasoning — an image knows nothing about the lines authored on top of it — so it is
	 * made visible instead. */
	private showRoomSurfaces = false;

	private toggleRoomSurfaces(): void {
		this.showRoomSurfaces = !this.showRoomSurfaces;
		const view = this.roomView();
		view?.invalidate();
		view?.refresh();
		new Notice(this.showRoomSurfaces ? "Shimeji: showing what the room can be stood on." : "Shimeji: surfaces hidden.");
	}

	private reloadRoomArt(): void {
		const view = this.roomView();
		if (!view) {
			new Notice("Shimeji: the plant room is not open.");
			return;
		}
		void view.loadImage();
		new Notice(`Shimeji: reloading ${roomStyle(this.settings.roomStyle).label}`);
	}

	private roomView(): RoomView | undefined {
		const leaf = this.app.workspace.getLeavesOfType(ROOM_VIEW_TYPE)[0];
		return leaf?.view instanceof RoomView ? leaf.view : undefined;
	}

	/**
	 * Opens the room in the right sidebar, or reveals it if it is already open somewhere.
	 *
	 * Every failure here says so out loud. A view type that will not open is invisible by
	 * definition — there is no half-drawn room to notice — so a silent return leaves the user
	 * clicking a button that appears to do nothing, with nowhere to look for why. The sidebar can
	 * genuinely be unavailable (a workspace with the right split removed, some mobile layouts), so
	 * this falls back to a main-area tab rather than giving up.
	 */
	async revealRoom(): Promise<RoomView | undefined> {
		const existing = this.app.workspace.getLeavesOfType(ROOM_VIEW_TYPE)[0];
		const leaf = existing ?? this.app.workspace.getRightLeaf(false) ?? this.app.workspace.getLeaf("tab");
		if (!leaf) {
			new Notice("Shimeji: could not open the plant room — no pane was available for it.");
			return undefined;
		}
		if (!existing) await leaf.setViewState({ type: ROOM_VIEW_TYPE, active: true });
		this.app.workspace.revealLeaf(leaf);
		const view = this.roomView();
		if (!view) new Notice("Shimeji: the plant room pane did not open. Check the console for an error.");
		return view;
	}

	/** "Send a shimeji home": opens the room if it is closed, then orders the nearest mascot to the
	 * threshold. Falls back to placing it directly when it cannot get there under its own steam —
	 * which is also how a remembered resident is restored on load. */
	async sendHome(): Promise<void> {
		const view = (await this.revealRoom()) ?? this.roomView();
		const layout = view?.layout();
		if (!layout) {
			new Notice("Shimeji: the plant room could not be opened.");
			return;
		}
		if (this.residency.hasResident) {
			new Notice("Shimeji: someone already lives there.");
			return;
		}
		let mascots = this.stage?.getMascots() ?? [];
		if (mascots.length === 0) {
			this.spawnMascot();
			mascots = this.stage?.getMascots() ?? [];
		}
		const door = layout.doorOutside();
		let nearest: Mascot | undefined;
		let bestD = Infinity;
		for (const mascot of mascots) {
			const d = Math.hypot(mascot.physics.x - door.x, mascot.physics.y - door.y);
			if (d < bestD) {
				bestD = d;
				nearest = mascot;
			}
		}
		if (!nearest) {
			new Notice("Shimeji: no mascot to send home.");
			return;
		}
		this.residency.handleOrder(layout.doorInside(), nearest);
	}

	callOutOfRoom(): void {
		if (!this.residency.callOut()) new Notice("Shimeji: nobody is home.");
	}

	/**
	 * Watches for the two thresholds being crossed, every frame.
	 *
	 * Its own loop rather than a hook inside Stage's, so the engine keeps knowing nothing about
	 * rooms. A frame of lag either way is invisible at the sizes involved, and the work is a couple
	 * of distance comparisons.
	 */
	private startResidencyLoop(): void {
		const step = (): void => {
			this.residency.tick();
			this.roomView()?.refresh();
			this.residencyRaf = requestAnimationFrame(step);
		};
		this.residencyRaf = requestAnimationFrame(step);
	}

	/** The panes a spot order opened are left in place on purpose — closing one the moment the mascot
	 * arrived would pull the floor out from under it — so tidying up is an explicit action. */
	closeMascotOpenedPanes(): void {
		const count = this.mascotOpenedPanes.length;
		for (const pane of this.mascotOpenedPanes) this.obsidianPaneActions.closePane(pane);
		this.mascotOpenedPanes = [];
		new Notice(count > 0 ? `Closed ${count} pane${count === 1 ? "" : "s"} opened by mascots` : "No mascot-opened panes to close");
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
					.setTitle("Dash to the mouse once")
					.setIcon("mouse-pointer-click")
					.onClick(() => this.followMouseAllMascots((m) => this.sameCharacter(mascot, m))),
			);
			// The invented sticky mode, offered alongside the faithful one-shot above rather than
			// replacing it — see keepFollowingMouseAllMascots.
			menu.addItem((item) =>
				item
					.setTitle("Keep following the mouse")
					.setIcon("mouse-pointer-2")
					.onClick(() => this.keepFollowingMouseAllMascots(true, (m) => this.sameCharacter(mascot, m))),
			);
			menu.addItem((item) =>
				item
					.setTitle("Stop following the mouse")
					.setIcon("square")
					.onClick(() => this.keepFollowingMouseAllMascots(false, (m) => this.sameCharacter(mascot, m))),
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
