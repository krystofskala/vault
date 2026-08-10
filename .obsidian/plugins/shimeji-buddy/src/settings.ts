export type ReactionName =
	| "idle"
	| "wave"
	| "cheer"
	| "poof"
	| "nod"
	| "surprised"
	| "think"
	| "sleep"
	| "walk"
	| "poke";

export const REACTION_NAMES: ReactionName[] = [
	"idle",
	"walk",
	"sleep",
	"wave",
	"cheer",
	"poof",
	"nod",
	"surprised",
	"think",
	"poke",
];

export const REACTION_LABELS: Record<ReactionName, string> = {
	idle: "Idle (standby)",
	walk: "Walk (wanders on its own)",
	sleep: "Sleep (long inactivity)",
	wave: "Wave (opening a note)",
	cheer: "Cheer (creating a note)",
	poof: "Poof (deleting a note)",
	nod: "Nod (editing a note)",
	surprised: "Surprised (renaming a note)",
	think: "Think (search opened)",
	poke: "Poke (clicked)",
};

export const LOOPING_REACTIONS: ReadonlySet<ReactionName> = new Set(["idle", "walk", "sleep"]);

export interface SpeechLines {
	wave: string[];
	cheer: string[];
	poof: string[];
	nod: string[];
	surprised: string[];
	think: string[];
	poke: string[];
}

/** A single frame's crop rectangle within a sprite sheet, in source-image pixels. */
export interface AtlasFrameRect {
	x: number;
	y: number;
	w: number;
	h: number;
}

export interface AtlasAnimationConfig {
	enabled: boolean;
	frames: AtlasFrameRect[];
	fps: number;
	loop: boolean;
}

export type AtlasAnimationsConfig = Record<ReactionName, AtlasAnimationConfig>;

export type CharacterMode = "builtin" | "pack" | "atlas";

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

	characterMode: CharacterMode;

	// characterMode === "pack": a folder with manifest.json + per-animation strip PNGs
	customCharacterFolder: string;

	// characterMode === "atlas": one image, sliced into freeform per-frame rectangles
	atlasImagePath: string;
	atlasAnimations: AtlasAnimationsConfig;
}

export const DEFAULT_SPEECH_LINES: SpeechLines = {
	wave: ["Welcome back!", "Let's read this one.", "Yosh!"],
	cheer: ["New page, let's go!", "Something new!", "Nice, a fresh note!"],
	poof: ["Aw, it's gone...", "Poof!", "Byebye, note."],
	nod: ["Nice edit!", "Looking good.", "Saved it!"],
	surprised: ["Ooh, a new name!", "Whoa, renamed!"],
	think: ["Hmm, searching...", "Let me think...", "Looking for something?"],
	poke: ["Hey!", "Stop that!", "Hehe, that tickles.", "Believe it!"],
};

function buildDefaultAtlasAnimations(): AtlasAnimationsConfig {
	const result = {} as AtlasAnimationsConfig;
	for (const name of REACTION_NAMES) {
		result[name] = {
			enabled: false,
			frames: [],
			fps: 6,
			loop: LOOPING_REACTIONS.has(name),
		};
	}
	return result;
}

export const DEFAULT_ATLAS_ANIMATIONS: AtlasAnimationsConfig = buildDefaultAtlasAnimations();

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

	characterMode: "builtin",
	customCharacterFolder: "",

	atlasImagePath: "",
	atlasAnimations: DEFAULT_ATLAS_ANIMATIONS,
};
