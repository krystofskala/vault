import { App, Notice, Platform, PluginSettingTab, Setting } from "obsidian";
import { sendChatMessage } from "./ai/AnthropicClient";
import { sendOpenAiCompatibleMessage } from "./ai/OpenAiCompatibleClient";
import { resolvePersona } from "./ai/persona";
import { sendAiMessage } from "./ai/providers";
import type ShimejiPlugin from "./main";
import { ROOM_STYLE_IDS, ROOM_STYLES, roomStyle } from "./room/rooms";
import type { RoomRainMode } from "./room/weather";
import { CharacterEditorModal } from "./wizard/CharacterEditorModal";
import type { CustomPackContent } from "./shimeji/customContent";
import { VaultReactionTrigger } from "./speech/vaultReactions";
import { OBSIDIAN_EVENTS_BY_SOURCE } from "./speech/obsidianEvents";

/** One user-defined binding from an Obsidian (or community-plugin) event to a speech tag — see
 * ShimejiSettings.customVaultReactions. */
export interface CustomVaultReaction {
	/** Which object the event fires on. `workspace`, `vault`, and `metadataCache` are the only three
	 * singletons Obsidian's own public API extends `Events` (i.e. offers `.on(name, ...)`) on — see
	 * obsidianEvents.ts. Covers community plugins too: most fire on one of these same singletons
	 * rather than minting their own emitter. */
	source: "workspace" | "vault" | "metadataCache";
	/** The raw event name, exactly as the plugin/Obsidian itself calls `.trigger(...)` with — e.g.
	 * "file-open", or a community plugin's own "dataview:index-ready". The settings UI suggests
	 * Obsidian's own names for the chosen source (see obsidianEvents.ts) via a <datalist>, but a
	 * community plugin mints its own, so those still need that plugin's own docs/source. */
	eventName: string;
	/** The `@tag` mascots react to, e.g. "note:pin". Written into the speech file exactly like any
	 * other tag — no `note:` prefix required, this is not limited to notes. */
	tag: string;
}

export interface ShimejiSettings {
	packsFolder: string;
	/** Vault-relative folder of optional reference art (`shime1.png`…`shime46.png`) the character
	 * wizard shows as a translucent guide while fitting a pose — never written to, and never
	 * required: a slot with nothing there just gets no guide layer. Empty means "use this plugin's
	 * own bundled Shimeji/img — see ShimejiPlugin.bundledPackFolder()", not a literal empty path. */
	referenceArtFolder: string;
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
	/** Invented, and Obsidian's answer to the original's window throwing: mascots squash, stretch,
	 * shove and fold your panes and sidebars. Separate from allowWindowThrow because that one spawns
	 * a real OS window, which is a different order of surprise. See shimeji/paneWrangling.ts. */
	allowPaneWrangling: boolean;
	/** Invented: mascots occasionally pick a destination anywhere in the layout and route to it over
	 * the ledge graph, climbing walls and hopping between panes to get there. See engine/Routing.ts. */
	roamEnabled: boolean;
	/** Invented, and the most invasive thing here: a spot order may *split a pane* to create a surface
	 * where none exists, so the mascot can reach any point at all. Only ever reached from the explicit
	 * shift-triple-click gesture, never autonomously. See PaneActions.makeSurfaceAt. */
	allowLayoutSurgery: boolean;
	/** Invented — shimeji-ee has no vault/note awareness at all. While a mascot happens to be on
	 * the pane you're actively working in, occasionally swaps in a random other note from the
	 * vault. Off by default for the same reason as allowWindowThrow: it changes what you're
	 * looking at without asking. */
	allowNoteMischief: boolean;
	/** Hand-authored actions/behaviors, keyed by pack id, overlaid onto that pack's parsed
	 * actions.xml/behaviors.xml — see CustomContentBuilder. */
	customContent: Record<string, CustomPackContent>;
	/**
	 * Who lives in the room, or null when nobody does. Persisted so the room still has its
	 * resident after a restart rather than respawning it into the workspace — a room you have to
	 * re-populate every launch is a widget, not a home.
	 *
	 * A wrapper rather than a bare pack id because `packId: null` is itself meaningful: it is the
	 * built-in placeholder character, so a bare null could not tell "nobody is home" apart from
	 * "the plain white one is".
	 */
	roomResident: { packId: string | null } | null;
	/** Which room the plant-room pane shows — see room/rooms.ts. */
	roomStyle: string;
	/** The user's manual override for a room that declares `weather: "rain"` — "auto" leaves it to
	 * RoomWeather's own drift. Ignored by rooms with no weather at all. */
	roomRainMode: RoomRainMode;
	/** Whether the room's pane has ever been shown. Opened once on the first run that has the
	 * feature, because an unopened view type appears nowhere but the command palette — after that
	 * it is Obsidian's own saved layout that decides, so closing it sticks. */
	roomIntroduced: boolean;
	/** Whether mascots say anything at all. */
	speechEnabled: boolean;
	/**
	 * Vault-relative path to the markdown file of `@Behavior`-tagged lines (see
	 * speech/speechLines.ts) — the only source of speech. Empty means "not set up yet"; main.ts
	 * creates one at the vault's own default location for new notes on first load, so the feature
	 * works without anything to configure by hand.
	 */
	speechFilePath: string;
	/**
	 * Per-character overrides of speechFilePath, keyed by pack id. A pack with an entry here (and a
	 * non-empty path) reads its own dedicated file instead of the general one above — every other
	 * pack, and every mascot while no character pack is loaded, keeps using the general file. Absent
	 * or empty for a pack means "no override," not "no speech," so introducing this never silenced
	 * anyone who was already talking.
	 */
	packSpeechFiles: Record<string, string>;
	/** "theme" follows the active Obsidian theme; "comic" is a fixed white bubble with a heavy ink
	 * outline, the same in light or dark. */
	speechStyle: "theme" | "comic";
	/** How often an eligible behaviour change actually produces a line, 0–100. Everything a mascot
	 * does is a behaviour and they change every few seconds, so this is the difference between an
	 * occasional remark and a running commentary. */
	speechChancePercent: number;
	/** Invented — shimeji-ee has no awareness of files or vaults at all. Lets a mascot on the active
	 * pane remark on a note being opened, created, deleted, renamed, or edited, using the same lines
	 * file as ordinary behaviour speech (tagged `@note:open` and so on — see speech/vaultReactions.ts).
	 * Named to match speechEnabled rather than the allow*-family flags in "What it may touch": this
	 * never reaches into the workspace, it only ever calls the same speech.say() ordinary speech
	 * already uses. Off by default so `@note:open` alone does not start talking the moment this ships. */
	vaultReactionsEnabled: boolean;
	/**
	 * User-defined bindings from an arbitrary Obsidian (or community-plugin) event to a speech tag —
	 * the escape hatch that makes the fixed note:open/create/delete/rename/edit set above not a
	 * ceiling. Obsidian's own event surface, and everything a plugin fires on top of it, is open —
	 * `workspace`/`vault` are both plain event emitters underneath their typed method signatures, so
	 * any event name either one actually fires at runtime works here, typed or not. Deliberately no
	 * guarding/debouncing/argument-reading like the built-in five have: this is the generic case, not
	 * a replacement for the hand-tuned ones.
	 */
	customVaultReactions: CustomVaultReaction[];
	/** Whether `scale` is read as a fraction of the window rather than a literal pixel multiplier —
	 * see engine/responsiveScale.ts. On, a size chosen on a laptop still looks right on a phone or
	 * a large monitor; off, it renders at the same pixel size everywhere. */
	responsiveScale: boolean;
	/** Mobile only: only draggable and pokeable while the active note is in reading view, so the
	 * mascot is not competing with your thumb while you type. Animation and reactions carry on
	 * regardless — this gates input, not life. */
	mobileReadingViewOnly: boolean;
	/** Whether the AI assistant is available at all — off by default, the same reasoning as
	 * soundsEnabled/vaultReactionsEnabled: a note-taking app quietly starting to send your text to
	 * an external API is a bigger proposition than anything else this plugin does unprompted, and
	 * it costs real money per message on top of that. */
	aiEnabled: boolean;
	/** Which backend actually answers a chat message — see ai/providers.ts. Each provider keeps its
	 * own settings below rather than sharing fields, so switching back and forth never loses what
	 * was typed into the other one. */
	aiProvider: "anthropic" | "local";
	/** Sent as the `x-api-key` header on every request — see AnthropicClient.ts. Stored in this
	 * plugin's own settings (data.json) like every other setting here; no separate secret store. */
	aiApiKey: string;
	/** A plain configurable string rather than a fixed dropdown of choices — Anthropic ships new
	 * models regularly, and hardcoding a fixed list would go stale faster than this setting would
	 * ever get revisited. */
	aiModel: string;
	/** Base URL of an OpenAI-compatible chat-completions server — Ollama's own compat endpoint
	 * (typically "http://localhost:11434/v1") and LM Studio's (typically "http://localhost:1234/v1")
	 * both work here unmodified, and so does anything else that speaks the same wire format. Empty
	 * means "not configured yet" — see ai/providers.ts's providerConfigError. */
	aiLocalBaseUrl: string;
	/** Almost always blank — most local servers, Ollama included, don't check one at all. Sent as a
	 * Bearer token only when non-empty, for the servers that do want one. */
	aiLocalApiKey: string;
	/** A model name the local server already has pulled/loaded, e.g. "llama3.2" for Ollama. No
	 * fallback default the way aiModel has one above: which model (if any) is actually available is
	 * entirely local to whichever machine is running the server, so guessing one here would be as
	 * likely to be wrong as right. */
	aiLocalModel: string;
	/**
	 * Per-character override files for the AI assistant's system prompt, keyed by pack id — the
	 * exact same shape packSpeechFiles uses for character-specific speech. A pack with an entry
	 * here, pointing at a file that actually has something written in it, uses that file's own
	 * content (verbatim, whatever is written there) as its persona; every other pack, and this one
	 * for as long as its file is empty or doesn't exist yet, gets the generic in-character default
	 * from ai/persona.ts's resolvePersona. Absent or empty for a pack means "no override," not "no
	 * persona" — introducing a file never silences a character that was already working.
	 */
	aiPersonaFiles: Record<string, string>;
}

/** Empty means "not configured yet" — main.ts fills in a real default relative to the
 * plugin's own folder on load, since a bare vault-relative path like "Shimeji" would
 * resolve to <vault-root>/Shimeji, not this plugin's own bundled Shimeji/ folder. */
export const DEFAULT_SETTINGS: ShimejiSettings = {
	packsFolder: "",
	referenceArtFolder: "",
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
	allowPaneWrangling: true,
	roamEnabled: true,
	allowLayoutSurgery: true,
	allowNoteMischief: false,
	customContent: {},
	roomResident: null,
	roomStyle: "plant-room",
	roomRainMode: "auto",
	roomIntroduced: false,
	speechEnabled: true,
	speechFilePath: "",
	packSpeechFiles: {},
	speechStyle: "theme",
	speechChancePercent: 25,
	vaultReactionsEnabled: false,
	customVaultReactions: [],
	responsiveScale: true,
	mobileReadingViewOnly: true,
	aiEnabled: false,
	aiProvider: "anthropic",
	aiApiKey: "",
	aiModel: "claude-sonnet-5",
	aiLocalBaseUrl: "",
	aiLocalApiKey: "",
	aiLocalModel: "",
	aiPersonaFiles: {},
};

export class ShimejiSettingTab extends PluginSettingTab {
	constructor(app: App, private plugin: ShimejiPlugin) {
		super(app, plugin);
	}

	/**
	 * A collapsible group. Nests one level, for sub-groups within a section.
	 *
	 * A native `<details>` rather than a hand-rolled toggle, so it opens and closes, remembers
	 * nothing it should not, and is keyboard-reachable without any of that being written here.
	 *
	 * The callback's parameter is deliberately named `containerEl`, shadowing the outer one: every
	 * setting inside is then written against the container it is genuinely rendered into, and a
	 * block can be moved between sections without touching a line of it.
	 *
	 * Ported from shimeji-buddy, whose settings page was larger than this one and stayed navigable.
	 */
	private section(containerEl: HTMLElement, title: string, defaultOpen: boolean, render: (body: HTMLElement) => void): void {
		const details = containerEl.createEl("details", { cls: "shimeji-section" });
		if (defaultOpen) details.setAttr("open", "");
		details.createEl("summary", { cls: "shimeji-section-title", text: title });
		render(details.createDiv({ cls: "shimeji-section-body" }));
	}

	/** A short aside that belongs to a group rather than to any one setting in it — the warning at
	 * the top of a risky section, or the "this is mobile only" that would otherwise have to be
	 * repeated in every description below it. */
	private callout(containerEl: HTMLElement, kind: "tip" | "warning" | "info", text: string): void {
		containerEl.createDiv({ cls: `shimeji-callout shimeji-callout-${kind}`, text });
	}

	display(): void {
		const { containerEl } = this;
		// Every toggle and every text change rebuilds this whole panel, which resets the scroll to
		// the top — so changing one setting halfway down throws away your place. Restoring it
		// afterwards is the difference between a panel you can work in and one that fights you.
		const scrollTop = containerEl.scrollTop;
		containerEl.empty();
		containerEl.createEl("h2", { text: "Shimeji Desktop Mascot" });

		// Ordered by how often you touch it, not by when it was built. Each section's callback
		// deliberately shadows `containerEl` with its own body, so everything inside is written
		// against the container it is actually rendered into.
		this.section(containerEl, "Characters", true, (containerEl) => {
			this.section(containerEl, "Your characters", true, (containerEl) => {
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

				// The wizard is a canvas-based pixel editor — drag-select rectangles, scroll-wheel zoom,
				// keyboard pan — built for a mouse and a full-size screen, not a touchscreen. Rather
				// than ship a barely-usable version of it, it is desktop-only: create or edit characters
				// there, then sync the vault, and the finished pack shows up here on mobile like any
				// other. Everything else in this section (pack folder, rescan, enabling/disabling a
				// pack) still works on mobile, since none of it needs precision pointing.
				if (Platform.isMobile) {
					this.callout(
						containerEl,
						"info",
						"Creating or editing a character (slicing sprite sheets, fitting poses onto a canvas) needs a mouse, so the wizard is desktop-only. Build or edit packs on desktop, then sync this vault — finished packs appear below automatically.",
					);
				} else {
					new Setting(containerEl)
						.setName("Create a new character")
						.setDesc("Names a character, sets it up with the full standard behavior set, then walks through exactly which pose images it needs.")
						.addButton((btn) =>
							btn
								.setButtonText("Create...")
								.setCta()
								.onClick(() => new CharacterEditorModal(this.app, this.plugin, undefined, () => this.display()).open()),
						);

					new Setting(containerEl)
						.setName("Reference art for the character wizard")
						.setDesc(
							"Optional. A vault-relative folder of shime1.png…shime46.png you supply yourself — any character you " +
								"want to match the proportions of, not necessarily the original — shown as a translucent guide while " +
								"fitting each pose. A slot with nothing there just gets no guide; this never blocks anything, and this " +
								"plugin never ships that art itself. Leave blank to use this plugin's own bundled Shimeji/img (which, " +
								"the same way, has none included).",
						)
						.addText((text) =>
							text
								.setPlaceholder(`${this.plugin.bundledPackFolder()}/img`)
								.setValue(this.plugin.settings.referenceArtFolder)
								.onChange(async (value) => {
									this.plugin.settings.referenceArtFolder = value.trim();
									await this.plugin.saveSettings();
								}),
						);
				}

				if (this.plugin.availablePacks.length > 0) {
					containerEl.createEl("p", {
						text: "Each newly spawned mascot picks a random character from the ones enabled below. Turn all off to use the built-in placeholder instead.",
						cls: "setting-item-description",
					});
					for (const pack of this.plugin.availablePacks) {
						const content = this.plugin.settings.customContent[pack.id];
						const customCount = (content?.actions.length ?? 0) + (content?.behaviors.length ?? 0);
						const setting = new Setting(containerEl)
							.setName(pack.name)
							.setDesc(customCount > 0 ? `${customCount} custom action/behavior entr${customCount === 1 ? "y" : "ies"}` : "")
							.addToggle((toggle) =>
								toggle.setValue(this.plugin.settings.activePackIds.includes(pack.id)).onChange(async (value) => {
									const ids = this.plugin.settings.activePackIds;
									this.plugin.settings.activePackIds = value ? [...ids, pack.id] : ids.filter((id) => id !== pack.id);
									await this.plugin.saveSettings();
									this.plugin.respawnWithCurrentSettings();
								}),
							);
						// Enabling/disabling a pack is a plain toggle either platform can do; editing one
						// opens the same desktop-only wizard as "Create a new character" above.
						if (!Platform.isMobile) {
							setting.addButton((btn) =>
								btn.setButtonText("Edit...").onClick(() => new CharacterEditorModal(this.app, this.plugin, pack.id, () => this.display()).open()),
							);
						}
					}
				} else {
					containerEl.createEl("p", {
						text:
							"No Shimeji-compatible pack found yet in that folder — using the built-in placeholder mascot. " +
							"Add your img/ and conf/ files and rescan.",
						cls: "setting-item-description",
					});
				}
			});

			this.section(containerEl, "Size & number", false, (containerEl) => {
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
					.setName("Scale with the window")
					.setDesc(
						"Reads Size as a fraction of the window rather than a fixed pixel multiplier, so a size " +
							"chosen on a laptop still looks right on a phone or a large monitor. Off renders at the " +
							"same pixel size everywhere.",
					)
					.addToggle((toggle) =>
						toggle.setValue(this.plugin.settings.responsiveScale).onChange(async (value) => {
							this.plugin.settings.responsiveScale = value;
							await this.plugin.saveSettings();
							this.plugin.applyScale();
						}),
					);

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
			});
		});

		this.section(containerEl, "Behaviour", false, (containerEl) => {
			this.section(containerEl, "Roaming", true, (containerEl) => {
				new Setting(containerEl)
					.setName("Wander the whole window")
					.setDesc(
						"Mascots occasionally pick somewhere else in the layout and actually route to it — walking, climbing walls, hopping between panes and dropping off edges to get there. Off means they stick to whichever surface they happen to be on, which is closer to how the original behaves on a bare desktop.",
					)
					.addToggle((toggle) =>
						toggle.setValue(this.plugin.settings.roamEnabled).onChange(async (value) => {
							this.plugin.settings.roamEnabled = value;
							await this.plugin.saveSettings();
							this.plugin.applyRoamEnabled();
						}),
					);
			});

			this.section(containerEl, "Breeding", false, (containerEl) => {
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
			});
		});

		this.section(containerEl, "Interaction", false, (containerEl) => {
			this.section(containerEl, "Mouse", true, (containerEl) => {
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
			});

			this.section(containerEl, "Touch & mobile", false, (containerEl) => {
				this.callout(containerEl, "info", "These only apply on Obsidian mobile. On desktop the mascots are always interactive.");
				new Setting(containerEl)
					.setName("Only grabbable in reading view")
					.setDesc(
						"A mascot walking across a phone screen sits right where your thumb is trying to type. This " +
							"lets taps pass straight through to the editor, and keeps it grabbable in reading view where " +
							"there is nothing to interrupt. It carries on moving and reacting either way.",
					)
					.addToggle((toggle) =>
						toggle.setValue(this.plugin.settings.mobileReadingViewOnly).onChange(async (value) => {
							this.plugin.settings.mobileReadingViewOnly = value;
							await this.plugin.saveSettings();
							this.plugin.applyMobileInteractivity();
						}),
					);
			});
		});

		this.section(containerEl, "Voice", false, (containerEl) => {
			this.renderSpeechSection(containerEl);

			this.section(containerEl, "Character-specific speech", false, (containerEl) => {
				this.callout(
					containerEl,
					"info",
					"Give one character its own lines file. Every other character, and this one for as long as its file has nothing written in it, keeps using the general file above — introducing a character-specific file never goes silent, it only ever adds lines that are more specific.",
				);

				const describePackSpeech = (packId: string, path: string): string => {
					if (!path) return "Uses the general file above.";
					const stats = this.plugin.packSpeechStats.get(packId);
					if (!stats) return "Not read yet.";
					if (!stats.fileExists) return "File not found yet — the pencil button creates it.";
					if (stats.taggedLineCount === 0) return "Its own file has no lines yet, so this character currently uses the general file instead.";
					const parts = [`${stats.taggedLineCount} line(s) across ${stats.tagCount} tag(s), just for this character.`];
					if (stats.unmatchedTags.length > 0) parts.push(`${stats.unmatchedTags.length} tag(s) no behaviour matches.`);
					if (stats.untaggedLines.length > 0) parts.push(`${stats.untaggedLines.length} line(s) have no tag.`);
					return parts.join(" ");
				};

				if (this.plugin.availablePacks.length === 0) {
					containerEl.createEl("p", {
						text: "No character packs loaded yet — nothing to give its own file.",
						cls: "setting-item-description",
					});
				}
				for (const pack of this.plugin.availablePacks) {
					const path = this.plugin.settings.packSpeechFiles[pack.id]?.trim() ?? "";
					new Setting(containerEl)
						.setName(pack.name)
						.setDesc(describePackSpeech(pack.id, path))
						.addText((text) =>
							text
								.setPlaceholder("uses the general file")
								.setValue(path)
								.onChange(async (value) => {
									const trimmed = value.trim();
									if (trimmed) this.plugin.settings.packSpeechFiles[pack.id] = trimmed;
									else delete this.plugin.settings.packSpeechFiles[pack.id];
									await this.plugin.saveSettings();
									await this.plugin.reloadSpeechLines();
								}),
						)
						.addExtraButton((b) =>
							b
								.setIcon("pencil")
								.setTooltip("Open it for editing (creates one first if it doesn't have one yet)")
								.onClick(() => void this.plugin.openPackSpeechFile(pack.id, pack.name).then(() => this.display())),
						)
						.addExtraButton((b) =>
							b
								.setIcon("list-checks")
								.setTooltip("Refresh the tag list in the file's cheat sheet")
								.onClick(async () => {
									if (!path) {
										new Notice("This character uses the general file — nothing of its own to refresh.");
										return;
									}
									const ok = await this.plugin.refreshCheatSheet(path);
									new Notice(ok ? "Refreshed the tag list." : "Couldn't find a tag list to refresh in that file.");
								}),
						)
						.addExtraButton((b) =>
							b
								.setIcon("refresh-cw")
								.setTooltip("Re-read it now")
								.onClick(() => void this.plugin.reloadSpeechLines().then(() => this.display())),
						);
				}
			});

			this.section(containerEl, "Sound effects", false, (containerEl) => {
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
			});

			this.section(containerEl, "Vault events", false, (containerEl) => {
				this.callout(
					containerEl,
					"info",
					"Not a real shimeji-ee feature — shimeji-ee has no awareness of files or vaults at all. Uses the same lines file as ordinary speech above, tagged with @note:open, @note:create, @note:delete, @note:rename, or @note:edit instead of a behaviour name.",
				);
				new Setting(containerEl)
					.setName("React to vault events")
					.setDesc(
						"Lets a mascot on the pane you're working in say a line when you open, create, delete, rename, or edit a note — if you've written one tagged for it.",
					)
					.addToggle((toggle) =>
						toggle.setValue(this.plugin.settings.vaultReactionsEnabled).onChange(async (value) => {
							this.plugin.settings.vaultReactionsEnabled = value;
							await this.plugin.saveSettings();
						}),
					);

				const customTags = this.plugin.settings.customVaultReactions.map((r) => r.tag.trim()).filter((tag) => tag.length > 0);
				containerEl.createEl("p", {
					cls: "setting-item-description",
					text: `Tags mascots can react to: ${[...Object.values(VaultReactionTrigger), ...customTags].map((tag) => `@${tag}`).join(", ")}`,
				});

				this.section(containerEl, "Custom triggers", false, (containerEl) => {
					this.callout(
						containerEl,
						"tip",
						"Bind any Obsidian event — or one fired by a community plugin — to a tag of your own choosing, so the built-in five above aren't a ceiling. Start typing in the event name box for every event Obsidian's own API documents for the source picked on the left — that list is exhaustive. A community plugin's own events are its own to document, not Obsidian's, so those still need that plugin's own docs/source. The tag doesn't need a note: prefix — it's just a name for lines to carry.",
					);
					const reactions = this.plugin.settings.customVaultReactions;
					reactions.forEach((reaction, index) => {
						const eventListId = `shimeji-custom-trigger-events-${index}`;
						new Setting(containerEl)
							.setName(`Trigger ${index + 1}`)
							.addDropdown((dropdown) => {
								dropdown.addOption("workspace", "Workspace event");
								dropdown.addOption("vault", "Vault event");
								dropdown.addOption("metadataCache", "Metadata event");
								dropdown.setValue(reaction.source).onChange(async (value) => {
									reaction.source = value === "vault" ? "vault" : value === "metadataCache" ? "metadataCache" : "workspace";
									await this.plugin.saveSettings();
									this.plugin.applyCustomVaultReactions();
									// The datalist below is source-specific, so a rebuild is the only way to
									// swap which events it suggests — same reason the trash button rebuilds.
									this.display();
								});
							})
							.addText((text) => {
								text.inputEl.setAttr("list", eventListId);
								text
									.setPlaceholder("event name, e.g. file-open")
									.setValue(reaction.eventName)
									.onChange(async (value) => {
										reaction.eventName = value;
										await this.plugin.saveSettings();
										this.plugin.applyCustomVaultReactions();
									});
							})
							.addText((text) =>
								text
									.setPlaceholder("tag, e.g. note:pin")
									.setValue(reaction.tag)
									.onChange(async (value) => {
										reaction.tag = value;
										await this.plugin.saveSettings();
										this.plugin.applyCustomVaultReactions();
										await this.plugin.reloadSpeechLines();
									}),
							)
							.addExtraButton((b) =>
								b
									.setIcon("trash")
									.setTooltip("Remove this trigger")
									.onClick(async () => {
										reactions.splice(index, 1);
										await this.plugin.saveSettings();
										this.plugin.applyCustomVaultReactions();
										await this.plugin.reloadSpeechLines();
										this.display();
									}),
							);
						// Invisible — an <input list="..."> just needs an element with this id
						// somewhere in the document; its own position in the DOM doesn't matter.
						containerEl.createEl("datalist", { attr: { id: eventListId } }, (datalist) => {
							for (const event of OBSIDIAN_EVENTS_BY_SOURCE[reaction.source]) {
								datalist.createEl("option", { value: event.name, attr: { label: event.desc } });
							}
						});
					});
					new Setting(containerEl).addButton((b) =>
						b.setButtonText("Add a custom trigger").onClick(async () => {
							reactions.push({ source: "workspace", eventName: "", tag: "" });
							await this.plugin.saveSettings();
							this.display();
						}),
					);
				});
			});
		});

		this.section(containerEl, "Room", false, (containerEl) => {
			new Setting(containerEl)
				.setName("Room style")
				.setDesc("Which room the shimeji lives in — see the description below for this one.")
				.addDropdown((dropdown) => {
					for (const id of ROOM_STYLE_IDS) dropdown.addOption(id, ROOM_STYLES[id].label);
					dropdown.setValue(roomStyle(this.plugin.settings.roomStyle).id).onChange(async (value) => {
						await this.plugin.setRoomStyle(value);
						this.display();
					});
				});

			containerEl.createEl("p", {
				text: roomStyle(this.plugin.settings.roomStyle).description,
				cls: "setting-item-description",
			});

			if (roomStyle(this.plugin.settings.roomStyle).def.weather === "rain") {
				new Setting(containerEl)
					.setName("Rain")
					.setDesc(
						"Left on Auto, it drifts between drizzle, rain and a downpour on its own — a proper " +
							"pour is the rare one. Pin one, or turn it off, to override the drift.",
					)
					.addDropdown((dropdown) => {
						dropdown.addOption("auto", "Auto");
						dropdown.addOption("off", "Off");
						dropdown.addOption("drizzle", "Drizzle");
						dropdown.addOption("rain", "Rain");
						dropdown.addOption("pour", "Pour");
						dropdown.setValue(this.plugin.settings.roomRainMode).onChange(async (value) => {
							await this.plugin.setRoomRainMode(value as RoomRainMode);
						});
					});
			}

			// Which rooms actually have their picture, so a missing file is visible here rather than only
			// as the room quietly showing something else. Nothing currently listed needs one (both rooms
			// are self-drawn) \u2014 this stays silent rather than printing an empty status line for zero rooms.
			const roomStatus = containerEl.createEl("p", { cls: "setting-item-description" });
			void (async () => {
				const lines: string[] = [];
				for (const id of ROOM_STYLE_IDS) {
					const style = ROOM_STYLES[id];
					if (!style.imageBase) continue;
					const found = await this.plugin.findRoomImage(style);
					lines.push(`${style.label}: ${found ? `using ${found}` : `no picture yet \u2014 save one as ${style.imageBase}.png`}`);
				}
				if (lines.length > 0) roomStatus.setText(`${lines.join(" \u00b7 ")}  (inside ${this.plugin.roomFolder()}/)`);
			})();
		});

		this.section(containerEl, "AI Assistant", false, (containerEl) => {
			this.callout(
				containerEl,
				"info",
				"Off by default. Turning this on lets your chat messages \u2014 and, once vault search ships, matching note excerpts \u2014 leave your machine, either to Anthropic's API or to a local model server you run yourself, whichever provider below is active. The cloud key (or the local server's address) is stored in this plugin's own settings, the same trust model as everything else on this page.",
			);

			new Setting(containerEl)
				.setName("Enable AI assistant")
				.setDesc("Turns on the AI chat features. Needs the active provider below actually configured regardless of this toggle.")
				.addToggle((toggle) =>
					toggle.setValue(this.plugin.settings.aiEnabled).onChange(async (value) => {
						this.plugin.settings.aiEnabled = value;
						await this.plugin.saveSettings();
					}),
				);

			new Setting(containerEl)
				.setName("Provider")
				.setDesc("Which backend actually answers a chat message. Both keep their own settings below, so switching back and forth never loses what's typed into the other.")
				.addDropdown((dropdown) => {
					dropdown.addOption("anthropic", "Anthropic (cloud)");
					dropdown.addOption("local", "Local server (Ollama, LM Studio, ...)");
					dropdown.setValue(this.plugin.settings.aiProvider).onChange(async (value) => {
						this.plugin.settings.aiProvider = value === "local" ? "local" : "anthropic";
						await this.plugin.saveSettings();
						this.display();
					});
				});

			this.section(containerEl, "Anthropic (cloud)", this.plugin.settings.aiProvider === "anthropic", (containerEl) => {
				new Setting(containerEl)
					.setName("API key")
					.setDesc("From console.anthropic.com. Sent as-is with every request, never logged.")
					.addText((text) => {
						text.inputEl.type = "password";
						text
							.setPlaceholder("sk-ant-...")
							.setValue(this.plugin.settings.aiApiKey)
							.onChange(async (value) => {
								this.plugin.settings.aiApiKey = value.trim();
								await this.plugin.saveSettings();
							});
					});

				new Setting(containerEl)
					.setName("Model")
					.setDesc("Anthropic model name \u2014 a plain string rather than a fixed list, since new ones ship regularly.")
					.addText((text) =>
						text
							.setPlaceholder(DEFAULT_SETTINGS.aiModel)
							.setValue(this.plugin.settings.aiModel)
							.onChange(async (value) => {
								this.plugin.settings.aiModel = value.trim();
								await this.plugin.saveSettings();
							}),
					);

				new Setting(containerEl)
					.setName("Test connection")
					.setDesc("Sends a trivial message and reports whether it worked \u2014 independent of the enable toggle and the provider selection above, so a key can be verified before switching to it.")
					.addButton((b) =>
						b.setButtonText("Test").onClick(async () => {
							const apiKey = this.plugin.settings.aiApiKey.trim();
							if (!apiKey) {
								new Notice("Enter an API key first.");
								return;
							}
							b.setDisabled(true).setButtonText("Testing\u2026");
							try {
								const reply = await sendChatMessage({ apiKey, model: this.plugin.settings.aiModel || DEFAULT_SETTINGS.aiModel }, [
									{ role: "user", content: "Reply with just the word 'Connected.' and nothing else." },
								]);
								new Notice(`AI assistant says: ${reply}`);
							} catch (e) {
								new Notice(`Connection failed: ${e instanceof Error ? e.message : String(e)}`);
							} finally {
								b.setDisabled(false).setButtonText("Test");
							}
						}),
					);
			});

			this.section(containerEl, "Local server (Ollama, LM Studio, ...)", this.plugin.settings.aiProvider === "local", (containerEl) => {
				this.callout(
					containerEl,
					"info",
					"Any server that speaks the OpenAI-compatible chat-completions format works here \u2014 Ollama's own compat endpoint is typically \u201chttp://localhost:11434/v1\u201d, LM Studio's is typically \u201chttp://localhost:1234/v1\u201d once its server is started. Reaching one from your phone, if you use Obsidian Mobile, means the server has to be reachable over the network \u2014 your home Wi-Fi, or a tunnel like Tailscale when you're away \u2014 which is a networking setup on your end, not something this plugin can do for you.",
				);

				new Setting(containerEl)
					.setName("Server URL")
					.setDesc("Base URL, no trailing path needed \u2014 \u201c/chat/completions\u201d is added automatically.")
					.addText((text) =>
						text
							.setPlaceholder("http://localhost:11434/v1")
							.setValue(this.plugin.settings.aiLocalBaseUrl)
							.onChange(async (value) => {
								this.plugin.settings.aiLocalBaseUrl = value.trim();
								await this.plugin.saveSettings();
							}),
					);

				new Setting(containerEl)
					.setName("Model")
					.setDesc("A model name the server already has pulled or loaded, e.g. \u201cllama3.2\u201d for Ollama.")
					.addText((text) =>
						text
							.setPlaceholder("llama3.2")
							.setValue(this.plugin.settings.aiLocalModel)
							.onChange(async (value) => {
								this.plugin.settings.aiLocalModel = value.trim();
								await this.plugin.saveSettings();
							}),
					);

				new Setting(containerEl)
					.setName("API key")
					.setDesc("Almost always blank \u2014 most local servers, Ollama included, don't check one at all.")
					.addText((text) => {
						text.inputEl.type = "password";
						text
							.setPlaceholder("(usually not needed)")
							.setValue(this.plugin.settings.aiLocalApiKey)
							.onChange(async (value) => {
								this.plugin.settings.aiLocalApiKey = value.trim();
								await this.plugin.saveSettings();
							});
					});

				new Setting(containerEl)
					.setName("Test connection")
					.setDesc("Sends a trivial message and reports whether it worked \u2014 independent of the enable toggle and the provider selection above, so a local server can be verified before switching to it.")
					.addButton((b) =>
						b.setButtonText("Test").onClick(async () => {
							const baseUrl = this.plugin.settings.aiLocalBaseUrl.trim();
							if (!baseUrl) {
								new Notice("Enter the server's URL first.");
								return;
							}
							b.setDisabled(true).setButtonText("Testing\u2026");
							try {
								const reply = await sendOpenAiCompatibleMessage(
									{ baseUrl, apiKey: this.plugin.settings.aiLocalApiKey, model: this.plugin.settings.aiLocalModel },
									[{ role: "user", content: "Reply with just the word 'Connected.' and nothing else." }],
								);
								new Notice(`AI assistant says: ${reply}`);
							} catch (e) {
								new Notice(`Connection failed: ${e instanceof Error ? e.message : String(e)}`);
							} finally {
								b.setDisabled(false).setButtonText("Test");
							}
						}),
					);
			});

			this.section(containerEl, "Character personality", false, (containerEl) => {
				this.callout(
					containerEl,
					"info",
					"Give one character its own persona file — a plain note in your vault, edited like any other. Whatever is written in it, verbatim, becomes that character's system prompt. Leave it empty (or don't set one) and that character gets a generic-but-in-character default instead of going silent or bland — the same “introducing an override never mutes anyone” shape Character-specific speech above uses.",
				);

				if (this.plugin.availablePacks.length === 0) {
					containerEl.createEl("p", {
						text: "No character packs loaded yet — nothing to give its own personality.",
						cls: "setting-item-description",
					});
				}

				const describePackPersona = (packId: string, path: string): string => {
					if (!path) return "Uses the generic default.";
					const fileExists = this.plugin.personaFileExists.get(packId);
					if (fileExists === undefined) return "Not read yet.";
					if (!fileExists) return "File not found yet — the pencil button creates it.";
					const text = this.plugin.personaTexts.get(packId);
					if (!text) return "Its own file is empty — uses the generic default until something is written in it.";
					return "Custom persona set, from its own file.";
				};

				for (const pack of this.plugin.availablePacks) {
					const path = this.plugin.settings.aiPersonaFiles[pack.id]?.trim() ?? "";
					new Setting(containerEl)
						.setName(pack.name)
						.setDesc(describePackPersona(pack.id, path))
						.addText((text) =>
							text
								.setPlaceholder("uses the generic default")
								.setValue(path)
								.onChange(async (value) => {
									const trimmed = value.trim();
									if (trimmed) this.plugin.settings.aiPersonaFiles[pack.id] = trimmed;
									else delete this.plugin.settings.aiPersonaFiles[pack.id];
									await this.plugin.saveSettings();
									await this.plugin.reloadPersonas();
								}),
						)
						.addExtraButton((b) =>
							b
								.setIcon("pencil")
								.setTooltip("Open it for editing (creates one first if it doesn't have one yet)")
								.onClick(() => void this.plugin.openPackPersonaFile(pack.id, pack.name).then(() => this.display())),
						)
						.addExtraButton((b) =>
							b
								.setIcon("refresh-cw")
								.setTooltip("Re-read it now")
								.onClick(() => void this.plugin.reloadPersonas().then(() => this.display())),
						)
						.addButton((b) =>
							b.setButtonText("Test").onClick(async () => {
								b.setDisabled(true).setButtonText("Testing…");
								try {
									const persona = resolvePersona(pack, this.plugin.personaTexts);
									// Through whichever provider is currently active, same as the chat bubble itself
									// — this is a persona check, not a provider check, so it uses whatever's live
									// rather than always testing Anthropic specifically.
									const reply = await sendAiMessage(this.plugin.aiDispatchSettings(), [{ role: "user", content: "Say hello, briefly, in character." }], persona);
									new Notice(`${pack.name} says: ${reply}`);
								} catch (e) {
									new Notice(`Connection failed: ${e instanceof Error ? e.message : String(e)}`);
								} finally {
									b.setDisabled(false).setButtonText("Test");
								}
							}),
						);
				}
			});
		});

		this.section(containerEl, "What it may touch", false, (containerEl) => {
			this.callout(
				containerEl,
				"warning",
				"Everything in here lets the mascots reach beyond their own overlay and into your workspace. Most of it is off by default.",
			);

			this.section(containerEl, "Climbing", true, (containerEl) => {
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
			});

			this.section(containerEl, "Rearranging", false, (containerEl) => {
				new Setting(containerEl)
					.setName("Open panes to reach a spot")
					.setDesc(
						"Shift + triple-click anywhere to order the nearest mascot to that exact point. If nothing there can be stood on, it splits the pane under your cursor and slides the new divider to your click — so any point is reachable. Turn this off to keep the order but limit it to surfaces that already exist. Use the \u201cClose panes opened by mascots\u201d command to tidy up afterwards.",
					)
					.addToggle((toggle) =>
						toggle.setValue(this.plugin.settings.allowLayoutSurgery).onChange(async (value) => {
							this.plugin.settings.allowLayoutSurgery = value;
							await this.plugin.saveSettings();
						}),
					);

				new Setting(containerEl)
					.setName("Pane wrangling")
					.setDesc(
						"Obsidian's stand-in for the original's window throwing. Mascots squash a stacked pane by landing on it, haul its bottom edge down while hanging underneath, shove side-by-side panes apart, and fold a sidebar shut by sitting on it. They use your pack's existing animations, so this works with any character. Turn it off if you would rather they left your layout alone.",
					)
					.addToggle((toggle) =>
						toggle.setValue(this.plugin.settings.allowPaneWrangling).onChange(async (value) => {
							this.plugin.settings.allowPaneWrangling = value;
							await this.plugin.saveSettings();
							this.plugin.applyCustomContent();
						}),
					);
			});

			this.section(containerEl, "Mischief", false, (containerEl) => {
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
			});

			this.section(containerEl, "Troubleshooting", false, (containerEl) => {
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
			});
		});

		// After the panel has been rebuilt, not before — the content has to exist for the scroll
		// offset to be reachable again.
		containerEl.scrollTop = scrollTop;
	}

	/**
	 * Speech: the toggle, the file, and — most importantly — what the plugin actually made of it.
	 *
	 * The status readout is the part that earns its place. Every failure mode here is silence: a
	 * typo'd tag, a file saved somewhere else, a line that forgot its tag. All of them look
	 * identical to a mascot that simply had nothing to say, so the counts and the two problem lists
	 * are the only way to tell "working, just quiet" from "broken".
	 */
	private renderSpeechSection(containerEl: HTMLElement): void {
		new Setting(containerEl)
			.setName("Let mascots talk")
			.setDesc("Shows a bubble when a mascot starts a behaviour you have written a line for.")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.speechEnabled).onChange(async (value) => {
					this.plugin.settings.speechEnabled = value;
					await this.plugin.saveSettings();
					this.plugin.applySpeechSettings();
				}),
			);

		new Setting(containerEl)
			.setName("Lines file")
			.setDesc("A note in your vault. Each plain line is one thing a mascot can say, tagged with @ and a behaviour name.")
			.addText((text) =>
				text
					.setPlaceholder("Shimeji speech.md")
					.setValue(this.plugin.settings.speechFilePath)
					.onChange(async (value) => {
						this.plugin.settings.speechFilePath = value.trim();
						await this.plugin.saveSettings();
						await this.plugin.reloadSpeechLines();
					}),
			)
			.addExtraButton((b) => b.setIcon("pencil").setTooltip("Open it for editing").onClick(() => void this.plugin.openSpeechFile()))
			.addExtraButton((b) =>
				b
					.setIcon("list-checks")
					.setTooltip("Refresh the tag list in the file's cheat sheet")
					.onClick(async () => {
						const ok = await this.plugin.refreshCheatSheet(this.plugin.settings.speechFilePath);
						new Notice(ok ? "Refreshed the tag list." : "Couldn't find a tag list to refresh in that file.");
					}),
			)
			.addExtraButton((b) =>
				b
					.setIcon("refresh-cw")
					.setTooltip("Re-read it now")
					.onClick(() => void this.plugin.reloadSpeechLines().then(() => this.display())),
			);

		new Setting(containerEl)
			.setName("How chatty")
			.setDesc(
				"Chance that a behaviour with a line for it actually says something. Everything a mascot does is a " +
					"behaviour and they change every few seconds, so at 100% it never stops talking.",
			)
			.addSlider((slider) =>
				slider
					.setLimits(0, 100, 5)
					.setValue(this.plugin.settings.speechChancePercent)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.speechChancePercent = value;
						await this.plugin.saveSettings();
						this.plugin.applySpeechSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Bubble style")
			.addDropdown((dropdown) => {
				dropdown.addOption("theme", "Match the Obsidian theme");
				dropdown.addOption("comic", "Comic — white with an ink outline");
				dropdown.setValue(this.plugin.settings.speechStyle).onChange(async (value) => {
					this.plugin.settings.speechStyle = value === "comic" ? "comic" : "theme";
					await this.plugin.saveSettings();
					this.plugin.applySpeechSettings();
					this.plugin.trySpeech("Like this.");
				});
			})
			.addButton((b) =>
				b.setButtonText("Try it").onClick(() => {
					if (!this.plugin.trySpeech("Hello!")) new Notice("Spawn a mascot first.");
				}),
			);

		const stats = this.plugin.speechStats;
		const status = containerEl.createEl("p", { cls: "setting-item-description" });
		if (!stats) {
			status.setText("Not read yet.");
		} else if (!stats.fileExists) {
			status.setText("No file at that path yet — the pencil button creates it.");
		} else if (stats.taggedLineCount === 0) {
			// Almost always a file written before the character was loaded, which came out holding
			// only the explanation. Nothing about a silent mascot points at its own cause, so this
			// says it outright and offers the one-click fix.
			status.setText("The file has no speech lines in it yet — so nothing is ever said.");
			new Setting(containerEl)
				.setName("Add the starter lines")
				.setDesc("Appends a few example lines for this character to the end of the file. Nothing already in it is changed.")
				.addButton((b) =>
					b
						.setButtonText("Add them")
						.setCta()
						.onClick(async () => {
							const ok = await this.plugin.appendStarterLines();
							new Notice(ok ? "Added the starter lines." : "Couldn't write to the speech file.");
							this.display();
						}),
				);
		} else {
			status.setText(`${stats.taggedLineCount} line(s) across ${stats.tagCount} tag(s).`);
			if (stats.unmatchedTags.length > 0) {
				containerEl.createEl("p", {
					cls: "shimeji-cc-error",
					text: `No behaviour matches: ${stats.unmatchedTags.map((t) => `@${t}`).join(", ")} — check the spelling against the cheat sheet in the file.`,
				});
			}
			if (stats.untaggedLines.length > 0) {
				containerEl.createEl("p", {
					cls: "shimeji-cc-error",
					text: `${stats.untaggedLines.length} line(s) have no tag and will never be said, starting with “${stats.untaggedLines[0]}”.`,
				});
			}
		}
	}
}
