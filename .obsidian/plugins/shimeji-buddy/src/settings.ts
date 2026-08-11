/** A single frame's crop rectangle within a sprite sheet, in source-image pixels. */
export interface AtlasFrameRect {
	x: number;
	y: number;
	w: number;
	h: number;
}

/**
 * A trackable Obsidian thing Shimeji can react to. Deliberately just a
 * string id, not a closed enum - "idle" and the handful below are wired to
 * real event listeners in main.ts, and command triggers (id
 * `command:<commandId>`) are added by the user at runtime, so the set of
 * valid ids grows without touching this list.
 */
export interface TriggerDef {
	id: string;
	label: string;
}

export const BUILTIN_TRIGGERS: TriggerDef[] = [
	{ id: "idle", label: "Idle / standby / roaming" },
	{ id: "note:open", label: "Opening a note" },
	{ id: "note:create", label: "Creating a note" },
	{ id: "note:delete", label: "Deleting a note" },
	{ id: "note:rename", label: "Renaming a note" },
	{ id: "note:edit", label: "Editing / typing in a note" },
	{ id: "search:open", label: "Opening the search pane" },
	{ id: "poke", label: "Clicking / poking the buddy" },
	{ id: "sleep", label: "Falling asleep (long inactivity) - the \"Bored\" mood's look" },
	{ id: "mood:happy", label: "Mood: Happy (energetic - recent typing/vault activity)" },
	{ id: "mood:bored", label: "Mood: Bored (long inactivity)" },
	{ id: "mood:angry", label: "Mood: Angry (poked or thrown too much, too fast)" },
];

/** A user-added trigger tied to a specific Obsidian command id, so any command (yours or another plugin's) can be reacted to without hand-listing them. */
export interface CommandTrigger {
	commandId: string;
	label: string;
}

export function commandTriggerId(commandId: string): string {
	return `command:${commandId}`;
}

/**
 * One animation in a character's library. Can be assigned to more than one
 * trigger (e.g. the same "happy hop" plays for both note:create and poke);
 * each trigger it's assigned to draws from a pool of all animations
 * assigned to it, weighted, so several animations can share one trigger for
 * variety instead of always playing the same thing. All of an animation's
 * frames come from one source image within its character's folder.
 */
export interface CustomAnimation {
	id: string;
	name: string;
	/** Filename (within the character's folder) this animation's frames are cropped from. */
	sourceImage: string;
	triggers: string[];
	/** Only meaningful when "idle" is among triggers: roam to a new spot while playing vs. play in place. */
	moves: boolean;
	weight: number;
	enabled: boolean;
	loop: boolean;
	fps: number;
	frames: AtlasFrameRect[];
}

export type CharacterMode = "builtin" | "character";

/**
 * Every optional thing the builtin placeholder can do on its own while idle
 * - gaits it roams with (walk/run/jump) and one-off poses it plays in place
 * (workouts, jutsus). Listed in settings so each can be individually
 * disabled or weighted, same model as a custom character's animation pool.
 */
export type BuiltinBehaviorId =
	| "walk"
	| "run"
	| "jump"
	| "punch"
	| "pushup"
	| "squat"
	| "lift"
	| "jutsu-clone"
	| "jutsu-transform"
	| "jutsu-shuriken";

export interface BuiltinBehaviorSetting {
	enabled: boolean;
	weight: number;
}

export const DEFAULT_BUILTIN_BEHAVIORS: Record<BuiltinBehaviorId, BuiltinBehaviorSetting> = {
	walk: { enabled: true, weight: 1 },
	run: { enabled: true, weight: 1 },
	jump: { enabled: true, weight: 1 },
	punch: { enabled: true, weight: 1 },
	pushup: { enabled: true, weight: 1 },
	squat: { enabled: true, weight: 1 },
	lift: { enabled: true, weight: 1 },
	"jutsu-clone": { enabled: true, weight: 1 },
	"jutsu-transform": { enabled: true, weight: 1 },
	"jutsu-shuriken": { enabled: true, weight: 1 },
};

export interface SpeechLines {
	"note:open": string[];
	"note:create": string[];
	"note:delete": string[];
	"note:edit": string[];
	"note:rename": string[];
	"search:open": string[];
	poke: string[];
}

export interface ShimejiSettings {
	enabled: boolean;
	size: number; // px, character height
	posX: number; // px from right edge
	posY: number; // px from bottom edge
	idleMinSeconds: number;
	idleMaxSeconds: number;
	sleepAfterMinutes: number;
	reactToOpen: boolean;
	reactToCreate: boolean;
	reactToDelete: boolean;
	reactToModify: boolean;
	reactToRename: boolean;
	reactToSearch: boolean;
	wanderEnabled: boolean;
	/** Roam by patrolling the sidebar/main-editor-area boundaries instead of picking anywhere on screen. */
	roamStickToEdges: boolean;
	/** Builtin-placeholder-only: per-behavior enable/weight for idle gaits and one-off poses (workouts, jutsus). */
	builtinBehaviors: Record<BuiltinBehaviorId, BuiltinBehaviorSetting>;
	speechBubbleEnabled: boolean;
	/** "obsidian" matches the active theme's own colors; "comic" is a fixed white/black-outline manga-panel look regardless of theme. */
	speechBubbleStyle: "obsidian" | "comic";
	/** Vault-relative path to a markdown file of user-authored, @tag-assigned speech lines (see speechLines.ts) - takes priority per-trigger over speechLines below, which stays as the built-in fallback pool. Empty = not configured. */
	speechLinesFilePath: string;
	speechLines: SpeechLines;
	clickThrough: boolean;
	/** Mobile only: only draggable/pokeable while the active note is in reading view, to avoid misclicks while typing. */
	mobileReadingViewOnly: boolean;
	/** While on, clicking the buddy counts clicks and hops it to a new spot each time, instead of the normal poke reaction. Toggle here or via the "Toggle click counter mode" command (bind a hotkey in Settings -> Hotkeys). */
	clickCounterEnabled: boolean;

	characterMode: CharacterMode;

	/** characterMode === "character": vault-relative path to the active character's folder (images + character.json live there). */
	activeCharacterFolder: string;

	commandTriggers: CommandTrigger[];
}

/** Built-in fallback pool, used per-trigger only when the user's own speech-lines file (speechLinesFilePath, see speechLines.ts) doesn't cover that trigger. */
export const DEFAULT_SPEECH_LINES: SpeechLines = {
	"note:open": ["Welcome back!", "Let's read this one.", "Yosh!"],
	"note:create": ["New page, let's go!", "Something new!", "Nice, a fresh note!"],
	"note:delete": ["Aw, it's gone...", "Poof!", "Byebye, note."],
	"note:edit": ["Nice edit!", "Looking good.", "Saved it!"],
	"note:rename": ["Ooh, a new name!", "Whoa, renamed!"],
	"search:open": ["Hmm, searching...", "Let me think...", "Looking for something?"],
	poke: ["Hey!", "Stop that!", "Hehe, that tickles.", "Believe it!"],
};

export const DEFAULT_SETTINGS: ShimejiSettings = {
	enabled: true,
	size: 96,
	posX: 24,
	posY: 24,
	idleMinSeconds: 8,
	idleMaxSeconds: 20,
	sleepAfterMinutes: 5,
	reactToOpen: true,
	reactToCreate: true,
	reactToDelete: true,
	reactToModify: true,
	reactToRename: true,
	reactToSearch: true,
	wanderEnabled: true,
	roamStickToEdges: false,
	builtinBehaviors: DEFAULT_BUILTIN_BEHAVIORS,
	speechBubbleEnabled: true,
	speechBubbleStyle: "obsidian",
	speechLinesFilePath: "",
	speechLines: DEFAULT_SPEECH_LINES,
	clickThrough: false,
	mobileReadingViewOnly: true,
	clickCounterEnabled: false,

	characterMode: "builtin",
	activeCharacterFolder: "",

	commandTriggers: [],
};
