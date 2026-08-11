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
	{ id: "summon", label: "Called over (triple-clicked outside the editor)" },
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
 * A named, pre-scripted way of moving around the screen - "how" an
 * animation moves while it plays, independent of "what" it looks like.
 * Attachable to any plain animation (replacing the old moves:true/false
 * flag) or any sequence step (see AnimationSequence below), so e.g. the
 * same "Stalk / block cursor" behavior can drive an angry-mood animation
 * directly, or one beat of a longer scripted bit.
 *
 * Split into three families under the hood - "destinations" (edge, center,
 * corner, hide, peek, random, origin: resolved once, then tweened to like
 * the roaming brain always has), "moveIn" (a one-time atomic entrance:
 * teleports off-screen past a chosen edge, reveals, then tweens in to an
 * on-screen landing spot - walking/running/falling/jumping in is entirely a
 * matter of which edge is chosen and which animation is paired with it, not
 * a separate kind per verb), and "continuous" behaviors (spin,
 * patrolWindowEdges, paceEdge, follow, stalk, avoid, startleDash: recomputed
 * every frame for as long as the animation/step plays) - but that's purely
 * an implementation detail, exposed as one flat picker either way.
 */
export type MovementBehaviorKind =
	| "none"
	| "randomSpot"
	| "origin"
	| "edge"
	| "center"
	| "corner"
	| "hide"
	| "peek"
	| "moveIn"
	| "spin"
	| "patrolWindowEdges"
	| "paceEdge"
	| "follow"
	| "stalk"
	| "avoid"
	| "startleDash";

export type ScreenEdge = "top" | "bottom" | "left" | "right" | "nearest" | "random";
export type ScreenCorner = "top-left" | "top-right" | "bottom-left" | "bottom-right" | "nearest";
/** Which third along the entry edge's perpendicular axis to land at - "second" (the middle third) is the sensible default. */
export type ScreenThird = "first" | "second" | "third";

export interface MovementBehavior {
	kind: MovementBehaviorKind;
	/** kind "edge" | "hide" | "peek" | "paceEdge" | "moveIn": which edge - "nearest"/"random" valid for "edge"/"hide"/"moveIn" only, "peek"/"paceEdge" need a specific side. "Edge" stops touching it (on-screen); "hide"/"moveIn" continue past it (off-screen). */
	edge?: ScreenEdge;
	/** kind "corner". */
	corner?: ScreenCorner;
	/** kind "peek": 0-1, how much of the sprite stays visible - a fraction rather than a fixed px amount since sprite height varies per character. */
	peekFraction?: number;
	/** kind "spin": orbit radius in px around the screen center. */
	radius?: number;
	/** kind "moveIn": which third of the entry edge to come in at. */
	third?: ScreenThird;
	/** kind "edge" | "center" | "corner" | "randomSpot" | "origin" | "hide": skip the travel tween and jump straight there. */
	instant?: boolean;
	/** kind "edge" | "center" | "corner" | "randomSpot" | "origin" | "hide" | "moveIn": which of Settings -> Movement speeds' two paces this travels at (ignored if "instant"). Undefined = "walk", matching every existing config from before this field existed. */
	gait?: "walk" | "run";
}

export function defaultMovementBehavior(): MovementBehavior {
	return { kind: "none" };
}

/**
 * Every pose the builtin placeholder can do, except the three jutsus (too
 * elaborate for a single clip - see AnimationSequence instead) - kept
 * separate from a character's regular trigger-driven animation library, see
 * CustomAnimation.role. This is the *complete* roster every character is
 * expected to have: fill in a role's slot with your own art and it plays
 * instead of the builtin placeholder's own version of that exact pose;
 * leave it blank and the placeholder's own pose plays there, so a character
 * is always fully formed - filled in gradually, one slot at a time, rather
 * than needing every pose built before it looks/acts complete.
 */
export type BasicMovementRole =
	| "idle"
	| "walk"
	| "run"
	| "jump"
	| "fall"
	| "poke"
	| "wave"
	| "cheer"
	| "poof"
	| "nod"
	| "surprised"
	| "think"
	| "sleep"
	| "happy"
	| "angry"
	| "punch"
	| "pushup"
	| "squat"
	| "lift";

export const BASIC_MOVEMENT_ROLES: BasicMovementRole[] = [
	"idle",
	"walk",
	"run",
	"jump",
	"fall",
	"poke",
	"wave",
	"cheer",
	"poof",
	"nod",
	"surprised",
	"think",
	"sleep",
	"happy",
	"angry",
	"punch",
	"pushup",
	"squat",
	"lift",
];

export const BASIC_MOVEMENT_ROLE_LABELS: Record<BasicMovementRole, string> = {
	idle: "Idle / standing still",
	walk: "Walk",
	run: "Run",
	jump: "Jump",
	fall: "Fall",
	poke: "Poked reaction",
	wave: "Greeting (opening a note)",
	cheer: "Cheering (creating a note)",
	poof: "Sad reaction (deleting a note)",
	nod: "Nodding (editing a note)",
	surprised: "Surprised (renaming a note)",
	think: "Thinking (searching)",
	sleep: "Sleeping / bored",
	happy: "Happy mood",
	angry: "Angry mood",
	punch: "Shadow-boxing",
	pushup: "Push-ups",
	squat: "Squats",
	lift: "Dumbbell lift",
};

/** Which roles default to a looping clip vs. a one-shot pose that reverts to idle when it finishes - mirrors CharacterWidget's own LOOPING_POSES for the builtin placeholder, so a fresh slot's default matches how that pose actually behaves. */
export const LOOPING_BASIC_MOVEMENT_ROLES: ReadonlySet<BasicMovementRole> = new Set([
	"idle",
	"walk",
	"run",
	"jump",
	"fall",
	"sleep",
	"happy",
	"angry",
]);

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
	/** How it moves (if at all) while playing - see MovementBehavior. Replaces the old moves:true/false flag (still read for migration - see spritePack.ts). */
	movement: MovementBehavior;
	weight: number;
	enabled: boolean;
	loop: boolean;
	fps: number;
	frames: AtlasFrameRect[];
	/**
	 * Marks this as one of the character's Basic movement poses instead of a
	 * regular trigger-driven entry - edited in its own "Basic movement"
	 * section (not the main Animations list), not assigned triggers/weight of
	 * its own, but still a plain animation otherwise: still pickable as a
	 * Sequence step's clip like any other. At most one animation should hold
	 * a given role; the settings tab enforces that when assigning one.
	 */
	role?: BasicMovementRole;
}

/** The three jutsu poses (see BuiltinBehaviorId) - too elaborate for a single-clip Basic movement slot (Shuriken jutsu throws a projectile), so they ship as a pre-built placeholder Sequence per character instead - see SequenceStep.builtinPose. */
export type JutsuId = "jutsu-clone" | "jutsu-transform" | "jutsu-shuriken";

export const JUTSU_IDS: JutsuId[] = ["jutsu-clone", "jutsu-transform", "jutsu-shuriken"];

export const JUTSU_LABELS: Record<JutsuId, string> = {
	"jutsu-clone": "Multiplication Jutsu",
	"jutsu-transform": "Transformation Jutsu",
	"jutsu-shuriken": "Shuriken Jutsu",
};

/**
 * One beat of a scripted, multi-step reaction - e.g. "vanish in a puff of
 * smoke, wait 7s, fall back in from the opposite edge, say something."
 * Plays like a plain CustomAnimation for trigger/weight purposes (see
 * AnimationSequence), but as an ordered timeline of these instead of one
 * clip.
 */
export interface SequenceStep {
	id: string;
	/** An existing Animation's id in this character, or "" for no visible animation (a pure wait/hidden beat, or - if builtinPose is set - a placeholder-pose beat, see below). */
	animationId: string;
	/** ms this step lasts. 0 = the animation's own natural length (frame count / fps), or the builtin pose's own duration if animationId is unset and builtinPose is - should be set explicitly (>0) for a pure wait/hidden beat, or a looping clip, since neither has a natural end of its own. */
	durationMs: number;
	/** Buddy is invisible for this step - e.g. the "vanished" beat of a disappearing act. */
	hidden: boolean;
	/** How (and whether) the buddy moves during this step - same MovementBehavior plain animations use. */
	movement: MovementBehavior;
	/** Literal text shown the instant this step starts - deliberately scripted, bypasses the @tag speech-line pool. Empty = nothing said. */
	say: string;
	/** Only set on the three built-in jutsu placeholder Sequences (see JUTSU_IDS) - plays the builtin placeholder's own CSS pose for this step while animationId is still unset, exactly like an unfilled Basic movement slot. Replacing animationId with one of the character's own animations overrides it. */
	builtinPose?: JutsuId;
}

/** A scripted, multi-step reaction - see SequenceStep. Assignable to triggers and pooled/weighted exactly like a plain CustomAnimation, so the two kinds can mix in the same trigger's pool for variety. */
export interface AnimationSequence {
	id: string;
	name: string;
	triggers: string[];
	weight: number;
	enabled: boolean;
	steps: SequenceStep[];
}

export type CharacterMode = "builtin" | "character";

/**
 * Every optional thing the builtin placeholder can do on its own while idle
 * - gaits it roams with (walk/run/jump/fall) and one-off poses it plays in
 * place (workouts, jutsus). Listed in settings so each can be individually
 * disabled or weighted, same model as a custom character's animation pool.
 */
export type BuiltinBehaviorId =
	| "walk"
	| "run"
	| "jump"
	| "fall"
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
	fall: { enabled: true, weight: 1 },
	punch: { enabled: true, weight: 1 },
	pushup: { enabled: true, weight: 1 },
	squat: { enabled: true, weight: 1 },
	lift: { enabled: true, weight: 1 },
	"jutsu-clone": { enabled: true, weight: 1 },
	"jutsu-transform": { enabled: true, weight: 1 },
	"jutsu-shuriken": { enabled: true, weight: 1 },
};

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
	/** px/sec - the walking pace, used by the builtin "walk" gait and every destination-based MovementBehavior tween (Move to edge/center/corner, "Move in", etc). */
	walkSpeedPxPerSec: number;
	/** px/sec - the running pace, used by the builtin "run" gait and "Called over" (triple-click summon). */
	runSpeedPxPerSec: number;
	/** % of the character's own height - how high the builtin "jump" gait/pose hops. */
	jumpHeightPercent: number;
	speechBubbleEnabled: boolean;
	/** "obsidian" matches the active theme's own colors; "comic" is a fixed white/black-outline manga-panel look regardless of theme. */
	speechBubbleStyle: "obsidian" | "comic";
	/** Vault-relative path to a markdown file of user-authored, @tag-assigned speech lines (see speechLines.ts) - the only source of speech lines, auto-created (see main.ts's ensureSpeechLinesFile) at the vault's own default location for new notes if left empty, rather than falling back to a separate hardcoded pool. */
	speechLinesFilePath: string;
	clickThrough: boolean;
	/** Mobile only: only draggable/pokeable while the active note is in reading view, to avoid misclicks while typing. */
	mobileReadingViewOnly: boolean;
	/** While on, clicking the buddy counts clicks and hops it to a new spot each time, instead of the normal poke reaction. Toggle here or via the "Toggle click counter mode" command (bind a hotkey in Settings -> Hotkeys). */
	clickCounterEnabled: boolean;
	/** Triple-clicking anywhere outside the editor/note content calls the buddy over to that spot (the "summon" trigger). */
	summonEnabled: boolean;

	characterMode: CharacterMode;

	/** characterMode === "character": vault-relative path to the active character's folder (images + character.json live there). */
	activeCharacterFolder: string;

	commandTriggers: CommandTrigger[];
}

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
	walkSpeedPxPerSec: 200,
	runSpeedPxPerSec: 440,
	jumpHeightPercent: 32,
	speechBubbleEnabled: true,
	speechBubbleStyle: "obsidian",
	speechLinesFilePath: "",
	clickThrough: false,
	mobileReadingViewOnly: true,
	clickCounterEnabled: false,
	summonEnabled: true,

	characterMode: "builtin",
	activeCharacterFolder: "",

	commandTriggers: [],
};
