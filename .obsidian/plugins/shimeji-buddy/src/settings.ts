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
	{ id: "sleep", label: "Falling asleep (long inactivity)" },
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
	speechBubbleEnabled: boolean;
	speechLines: SpeechLines;
	clickThrough: boolean;
	/** Mobile only: only draggable/pokeable while the active note is in reading view, to avoid misclicks while typing. */
	mobileReadingViewOnly: boolean;

	characterMode: CharacterMode;

	/** characterMode === "character": vault-relative path to the active character's folder (images + character.json live there). */
	activeCharacterFolder: string;

	commandTriggers: CommandTrigger[];
}

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
	speechBubbleEnabled: true,
	speechLines: DEFAULT_SPEECH_LINES,
	clickThrough: false,
	mobileReadingViewOnly: true,

	characterMode: "builtin",
	activeCharacterFolder: "",

	commandTriggers: [],
};
