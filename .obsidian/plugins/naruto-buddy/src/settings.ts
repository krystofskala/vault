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

export interface SpeechLines {
	wave: string[];
	cheer: string[];
	poof: string[];
	nod: string[];
	surprised: string[];
	think: string[];
	poke: string[];
}

export interface NarutoBuddySettings {
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
	customCharacterFolder: string; // vault-relative path to a sprite pack, empty = use built-in placeholder
	clickThrough: boolean;
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

export const DEFAULT_SETTINGS: NarutoBuddySettings = {
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
	customCharacterFolder: "",
	clickThrough: false,
};
