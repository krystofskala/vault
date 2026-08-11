import { Notice, type App } from "obsidian";
import {
	BASIC_MOVEMENT_ROLES,
	type BasicMovementRole,
	type BuiltinBehaviorId,
	type JutsuId,
	type MovementBehavior,
	type ScreenCorner,
	type ScreenEdge,
	type ShimejiSettings,
} from "./settings";

const BASIC_MOVEMENT_ROLE_SET: ReadonlySet<string> = new Set(BASIC_MOVEMENT_ROLES);
import {
	pickWeighted,
	type LoadedSpritePack,
	type ResolvedAnimation,
	type WeightedAnimation,
	type WeightedSequence,
} from "./spritePack";

/** The built-in placeholder character's fixed set of hand-authored CSS poses. */
type BuiltinPose =
	| "idle"
	| "wave"
	| "cheer"
	| "poof"
	| "nod"
	| "surprised"
	| "think"
	| "poke"
	| "walk"
	| "run"
	| "jump"
	| "fall"
	| "sleep"
	| "punch"
	| "pushup"
	| "squat"
	| "lift"
	| "jutsuClone"
	| "jutsuTransform"
	| "jutsuShuriken"
	| "happy"
	| "angry";

const LOOPING_POSES: ReadonlySet<BuiltinPose> = new Set(["idle", "walk", "run", "jump", "fall", "sleep", "happy", "angry"]);

/** Which builtin pose plays for a trigger id when no pack/atlas animation is assigned to it. Anything not listed here (e.g. a command trigger) just rests at idle. */
const BUILTIN_POSE_FOR_TRIGGER: Record<string, BuiltinPose> = {
	idle: "idle",
	"note:open": "wave",
	"note:create": "cheer",
	"note:delete": "poof",
	"note:edit": "nod",
	"note:rename": "surprised",
	"search:open": "think",
	poke: "poke",
	sleep: "sleep",
	"idle:punch": "punch",
	"idle:pushup": "pushup",
	"idle:squat": "squat",
	"idle:lift": "lift",
	"idle:jutsu-clone": "jutsuClone",
	"idle:jutsu-transform": "jutsuTransform",
	"idle:jutsu-shuriken": "jutsuShuriken",
	"mood:happy": "happy",
	"mood:bored": "sleep",
	"mood:angry": "angry",
	summon: "run", // played while travelling to wherever it was triple-clicked
};

/** Maps a jutsu placeholder Sequence step's builtinPose (see settings.ts) to the matching CSS pose. */
const JUTSU_ID_TO_POSE: Record<JutsuId, BuiltinPose> = {
	"jutsu-clone": "jutsuClone",
	"jutsu-transform": "jutsuTransform",
	"jutsu-shuriken": "jutsuShuriken",
};

/**
 * Four moods, recomputed periodically from recent activity - not a builtin
 * concept, just which "resting" trigger id idle time resolves to (a custom
 * character can assign its own animation to any mood:* trigger the same way
 * it assigns one to "idle"). "normal" resolves to plain "idle" rather than
 * its own trigger id - there's nothing to distinguish it from idle.
 */
type MoodId = "normal" | "happy" | "bored" | "angry";

const HAPPY_ACTIVITY_WINDOW_MS = 20_000; // real vault activity within this long ago still counts as "happy"
const ANGRY_WINDOW_MS = 15_000; // pokes/throws are counted within this recent window
const ANGRY_THRESHOLD = 5; // this many within the window -> angry
const MOOD_CHECK_INTERVAL_MS = 5_000;

// "happy" runs the idle brain faster (energetic); "bored" slower (sluggish).
const MOOD_IDLE_INTERVAL_FACTOR: Record<MoodId, number> = { happy: 0.5, bored: 1.6, angry: 1, normal: 1 };

/**
 * Everything the builtin placeholder can do on its own while idle - a
 * roaming gait (moves to a new spot while playing) or a one-off pose played
 * in place - each individually enable/weight-configurable in settings
 * (ShimejiSettings.builtinBehaviors), same pool model as a custom
 * character's animations.
 */
interface BuiltinIdleBehaviorDef {
	id: BuiltinBehaviorId;
	pose: BuiltinPose;
	moves: boolean;
}

const BUILTIN_IDLE_BEHAVIORS: BuiltinIdleBehaviorDef[] = [
	{ id: "walk", pose: "walk", moves: true },
	{ id: "run", pose: "run", moves: true },
	{ id: "jump", pose: "jump", moves: true },
	{ id: "fall", pose: "fall", moves: true },
	{ id: "punch", pose: "punch", moves: false },
	{ id: "pushup", pose: "pushup", moves: false },
	{ id: "squat", pose: "squat", moves: false },
	{ id: "lift", pose: "lift", moves: false },
	{ id: "jutsu-clone", pose: "jutsuClone", moves: false },
	{ id: "jutsu-transform", pose: "jutsuTransform", moves: false },
	{ id: "jutsu-shuriken", pose: "jutsuShuriken", moves: false },
];

// Chance per idle tick that the builtin placeholder does one of the
// BUILTIN_IDLE_BEHAVIORS above instead of just a plain idle bob.
const IDLE_BEHAVIOR_CHANCE = 0.45;

// Chance per idle tick that a custom character roams via its Basic movement
// gaits (see CharacterWidget.basicMovementRoam) instead of re-picking from
// its own idle pool - roughly an even mix, so a character with its own
// hand-built idle-roam animation still gets to show it off regularly.
const BASIC_MOVEMENT_ROAM_CHANCE = 0.4;

// Beyond this ratio of |dy| to |dx|, a Basic movement roam is considered
// "mostly vertical" and plays Jump/Fall instead of Walk/Run - not exactly
// 1:1, since screen travel that's only slightly more vertical than
// horizontal still reads as more of a walk than a hop.
const BASIC_MOVEMENT_VERTICAL_RATIO = 1.2;

// How far into the throw pose (ms) the shuriken actually leaves the hand.
const SHURIKEN_THROW_DELAY_MS = 200;
const SHURIKEN_FLIGHT_MS = 380;

// Movement past this many px (in either axis, summed) counts as a drag
// rather than a tap/click. Touch input is jittery, so this needs to be a
// bit more forgiving than a mouse would need.
const DRAG_THRESHOLD_PX = 8;

// Dragging doesn't snap straight to the pointer - it eases toward it each
// frame (a "leash"), so the further behind it's fallen, the faster it
// catches up. Releasing mid-motion launches it with that same momentum.
const FOLLOW_RATE_PER_SEC = 9; // higher = tighter leash, lower = more lag
const FLING_FRICTION_PER_SEC = 2.2; // exponential air-drag on released velocity
const FLING_MIN_SPEED_PX_S = 40; // below this, just stop and settle
const FLING_MAX_LAUNCH_SPEED_PX_S = 4500; // caps an absurd pointer-jump launch
const FLING_MAX_DURATION_MS = 4000; // safety cap so it can't fly forever
const FLING_BOUNCE_DAMPING = 0.45; // speed kept after bouncing off a screen edge

// Click counter mode: each click hops to a new nearby spot and tallies up,
// instead of the normal poke reaction.
const CLICK_COUNTER_HOP_RANGE_PX = 220;
const CLICK_COUNTER_HOP_DURATION_MS = 260;

// The "size" setting is a base value tuned against a roughly desktop-sized
// window; actual rendered size scales with the viewport's smaller dimension
// (vmin) relative to this reference, so the same setting looks proportionate
// on a small phone and a huge monitor instead of literally identical in px.
const SIZE_REFERENCE_VMIN = 900;
const MIN_RENDERED_SIZE = 44; // stay a reasonable touch target on tiny screens
const MAX_RENDERED_SIZE = 320; // avoid absurdity on ultrawide/huge displays

function computeResponsiveSize(baseSize: number): number {
	const vmin = Math.min(window.innerWidth, window.innerHeight);
	const scale = vmin / SIZE_REFERENCE_VMIN;
	return Math.min(MAX_RENDERED_SIZE, Math.max(MIN_RENDERED_SIZE, baseSize * scale));
}

// Wandering picks a random spot anywhere on screen and travels there at a
// speed depending on the gait, so a short hop across a phone and a long dash
// across an ultrawide monitor both feel consistent rather than snapping or
// crawling. Custom pack/atlas "moves" idle animations don't carry their own
// speed, so they use the walk pace. Actual walk/run px-per-sec values are
// user-configurable (settings.walkSpeedPxPerSec/runSpeedPxPerSec) - see
// gaitSpeed() - the jump gait's horizontal pace reuses the walk speed too,
// since jumpHeightPercent (also configurable) already covers what's
// distinctive about it (the vertical hop), not how fast it covers ground.
const RUN_MIN_DURATION_MS = 450;
const RUN_MAX_DURATION_MS = 3400;

// How long each one-shot builtin placeholder pose runs for, in ms, before
// reverting to idle. Must stay in sync with the keyframe durations in
// styles.css. Looping poses (see LOOPING_POSES) are exempt.
const PLACEHOLDER_DURATIONS: Record<BuiltinPose, number> = {
	idle: 0,
	walk: 0,
	run: 0,
	jump: 0,
	fall: 0,
	sleep: 0,
	wave: 900,
	cheer: 800,
	poof: 700,
	nod: 600,
	surprised: 500,
	think: 1100,
	poke: 400,
	punch: 1600,
	pushup: 2400,
	squat: 2000,
	lift: 3000,
	jutsuClone: 1800,
	jutsuTransform: 1800,
	jutsuShuriken: 700,
	happy: 0,
	angry: 0,
};

/**
 * The workspace's major regions, outermost-in: the left sidebar, the main
 * editor area, and the right sidebar (whichever of these are currently open
 * - a collapsed/closed sidebar is skipped). Uses the documented
 * workspace.leftSplit/rootSplit/rightSplit rather than guessing at
 * internal CSS class names, which aren't part of the public API and can
 * change between Obsidian versions. Queried fresh each time, so it always
 * reflects the current layout without needing to watch for changes.
 */
function getWorkspaceRegions(app: App): DOMRect[] {
	const rects: DOMRect[] = [];
	const splits = [app.workspace.leftSplit, app.workspace.rootSplit, app.workspace.rightSplit];
	for (const split of splits) {
		if (!split) continue;
		if ((split as { collapsed?: boolean }).collapsed) continue;
		const el = (split as { containerEl?: HTMLElement }).containerEl;
		if (!el || !el.isConnected) continue;
		const r = el.getBoundingClientRect();
		if (r.width > 40 && r.height > 40) rects.push(r);
	}
	return rects;
}

/** Which side of a patrolled region's perimeter a point currently falls on - used to orient the character so its feet face that edge. */
type PerimeterSide = "top" | "right" | "bottom" | "left";

/** A point at fractional distance `t` (wraps, can exceed [0,1)) clockwise around a region's inset perimeter, or null if the region's too small to walk. */
function pointOnRegionPerimeter(
	region: DOMRect,
	charWidth: number,
	charHeight: number,
	t: number,
	margin: number
): { left: number; top: number; side: PerimeterSide } | null {
	const left = region.left + margin;
	const top = region.top + margin;
	const right = region.right - margin - charWidth;
	const bottom = region.bottom - margin - charHeight;
	const topLen = Math.max(0, right - left);
	const sideLen = Math.max(0, bottom - top);
	const perimeter = 2 * topLen + 2 * sideLen;
	if (perimeter <= 0) return null;

	// Walking the left/right sides rotates the character +/-90 degrees (see
	// rotationForSide) to face the edge, which swaps its visual footprint
	// (charHeight becomes the on-screen width) around the box's own center -
	// but the box's actual layout width/height never changes, since CSS
	// transforms are purely visual and don't affect it. Left uncompensated,
	// the rotated visual - now wider than the box it's centered in - pokes
	// out past the true edge instead of touching it. This shifts the box
	// inward by half the width/height difference so it's the ROTATED
	// visual's outer edge that lands on the target line, not the box's own.
	const sideInset = (charHeight - charWidth) / 2;

	const s = (((t % 1) + 1) % 1) * perimeter;
	if (s < topLen) return { left: left + s, top, side: "top" };
	if (s < topLen + sideLen) return { left: right - sideInset, top: top + (s - topLen), side: "right" };
	if (s < topLen * 2 + sideLen) return { left: right - (s - topLen - sideLen), top: bottom, side: "bottom" };
	return { left: left + sideInset, top: bottom - (s - topLen * 2 - sideLen), side: "left" };
}

/** CSS rotation so the character's feet point toward whichever perimeter side it's walking, like a bug crawling around a picture frame. */
function rotationForSide(side: PerimeterSide | null): number {
	switch (side) {
		case "top":
			return 180;
		case "left":
			return -90;
		case "right":
			return 90;
		default:
			return 0;
	}
}

export interface CharacterWidgetCallbacks {
	onPositionChange: (posX: number, posY: number) => void;
}

export class CharacterWidget {
	private containerEl: HTMLElement;
	/** Rotatable wrapper around shadow/char/spritestage only - keeps edge-orientation rotation purely visual, never affecting containerEl's own layout box (position math stays simple). */
	private visualEl!: HTMLElement;
	private charEl!: HTMLElement;
	private spriteStageEl!: HTMLElement;
	private spriteFrameEl!: HTMLElement;
	private bubbleEl!: HTMLElement;

	private app: App;
	private settings: ShimejiSettings;
	private callbacks: CharacterWidgetCallbacks;
	private pack: LoadedSpritePack | null = null;
	/** trigger id -> pool of user-authored lines, parsed from the vault file at settings.speechLinesFilePath (see speechLines.ts) - the only source of speech lines. */
	private customSpeechLines: Record<string, string[]> = {};

	/** The trigger id currently being displayed - "idle" covers both resting and roaming. */
	private currentTrigger = "idle";
	private facingLeft = false;

	private idleTimer: number | null = null;
	private moodCheckTimer: number | null = null;
	private oneShotRevertTimer: number | null = null;
	private spriteFrameTimer: number | null = null;
	private wanderTimer: number | null = null;

	/** The last place the buddy came to rest - what MovementBehavior "origin" returns to. */
	private restRight = 0;
	private restBottom = 0;
	/** Drives any of the continuous MovementBehavior kinds (spin, patrolWindowEdges, paceEdge, follow, stalk, avoid) - a single rAF loop, replaced (never stacked) each time a new reaction starts. */
	private movementRafId: number | null = null;
	private sequenceStepTimer: number | null = null;
	/** Bumped on every playSequence() call - a scheduled step only runs if it still matches, so an interrupted sequence (poked, dragged, a new reaction) can't advance itself after the fact. */
	private sequenceRunId = 0;

	/** Forces click-through regardless of the user's own setting - e.g. mobile edit-view lockout. */
	private autoClickThrough = false;

	/** State for "stick to window edges" roaming - which workspace region is being patrolled and how far around its perimeter. */
	private patrolRegionIndex = 0;
	private perimeterT = Math.random();
	private perimeterDirection: 1 | -1 = 1;

	/** Last pointer position on screen, tracked for the shuriken jutsu to throw toward. */
	private lastPointerX = window.innerWidth / 2;
	private lastPointerY = window.innerHeight / 2;
	private boundTrackPointer = (e: PointerEvent) => {
		this.lastPointerX = e.clientX;
		this.lastPointerY = e.clientY;
	};

	/** Recomputed every MOOD_CHECK_INTERVAL_MS from recent activity/provocations - see recomputeMood(). */
	private currentMood: MoodId = "normal";
	private recentProvocations: number[] = [];

	private clickCounterCount = 0;
	private isClickHopping = false;

	private lastActivity = Date.now();
	private isDragging = false;
	private isFlinging = false;
	private dragMoved = false;
	private dragPointerType = "mouse";
	private dragStart = { x: 0, y: 0 };
	private dragPointerOffset = { x: 0, y: 0 };
	private dragRectWidth = 0;
	private dragRectHeight = 0;

	// Leash-follow state, in the same right/bottom px space as the container's
	// own position - the pointer sets a target, these track where the
	// character actually is each frame (which lags behind while dragging and
	// keeps moving under its own velocity during a fling).
	private followRight = 0;
	private followBottom = 0;
	private dragTargetRight = 0;
	private dragTargetBottom = 0;
	private velocityRight = 0;
	private velocityBottom = 0;
	private followRafId: number | null = null;
	private flingRafId: number | null = null;
	private lastFrameTime = 0;
	private flingStartTime = 0;

	private boundPointerMove = (e: PointerEvent) => this.onPointerMove(e);
	private boundPointerUp = (e: PointerEvent) => this.onPointerUp(e);
	private boundPointerCancel = (e: PointerEvent) => this.onPointerCancel(e);
	private boundResize = () => this.onViewportResize();

	constructor(app: App, settings: ShimejiSettings, callbacks: CharacterWidgetCallbacks) {
		this.app = app;
		this.settings = settings;
		this.callbacks = callbacks;
		this.containerEl = this.buildDom();
		this.updateClickThroughClass();
		this.applyBubbleStyleClass();
		this.applyGaitCssVars();
		this.applySize(settings.size);
		this.applyPosition(settings.posX, settings.posY);
		this.restRight = settings.posX;
		this.restBottom = settings.posY;
		this.setReaction("idle");
		this.startMoodWatcher();
		window.addEventListener("resize", this.boundResize);
		window.addEventListener("pointermove", this.boundTrackPointer);
	}

	private buildDom(): HTMLElement {
		const container = document.body.createDiv({ cls: "sm-container" });

		// Everything visual lives in here rather than directly in the
		// container, so edge-patrol orientation can rotate just this wrapper
		// (a bug crawling around a picture frame) without ever touching
		// containerEl's own layout box - drag/wander position math keeps
		// reading a plain, unrotated bounding rect.
		const visual = container.createDiv({ cls: "sm-visual" });
		this.visualEl = visual;

		const shadow = visual.createDiv({ cls: "sm-shadow" });
		void shadow;

		const char = visual.createDiv({ cls: "sm-char sm-state-idle" });
		this.charEl = char;

		// Built-in placeholder character, made of plain shapes (not any
		// copyrighted artwork) so the plugin works out of the box.
		char.createDiv({ cls: "sm-headband" });
		const head = char.createDiv({ cls: "sm-head" });
		head.createDiv({ cls: "sm-eye sm-eye-l" });
		head.createDiv({ cls: "sm-eye sm-eye-r" });
		head.createDiv({ cls: "sm-headband-strap" });
		char.createDiv({ cls: "sm-torso" });
		char.createDiv({ cls: "sm-arm sm-arm-l" });
		char.createDiv({ cls: "sm-arm sm-arm-r" });
		char.createDiv({ cls: "sm-leg sm-leg-l" });
		char.createDiv({ cls: "sm-leg sm-leg-r" });
		char.createDiv({ cls: "sm-zzz" });
		char.createDiv({ cls: "sm-smoke" });
		char.createDiv({ cls: "sm-dumbbell" });
		char.createDiv({ cls: "sm-clone sm-clone-l" });
		char.createDiv({ cls: "sm-clone sm-clone-r" });
		char.createDiv({ cls: "sm-sparkle" });

		// Sprite-pack frame layer, hidden unless a custom pack is active. The
		// stage is sized to an animation's largest frame and stays put; the
		// frame inside it is bottom-center anchored so frames of differing
		// size (common on hand-packed/modular sheets) don't jitter around.
		const spriteStage = visual.createDiv({ cls: "sm-spritestage" });
		this.spriteStageEl = spriteStage;
		const spriteFrame = spriteStage.createDiv({ cls: "sm-spriteframe" });
		this.spriteFrameEl = spriteFrame;

		// Stays outside sm-visual so it's never rotated - a sideways speech
		// bubble would just be unreadable.
		const bubble = container.createDiv({ cls: "sm-bubble" });
		bubble.style.display = "none";
		this.bubbleEl = bubble;

		container.addEventListener("pointerdown", (e) => this.onPointerDown(e));
		container.addEventListener("contextmenu", (e) => e.preventDefault());

		return container;
	}

	// ---------- public API ----------

	setSpritePack(pack: LoadedSpritePack | null): void {
		this.pack = pack;
		this.containerEl.toggleClass("sm-sprite-mode", !!pack);
		this.setReaction(this.currentTrigger === "sleep" ? "sleep" : "idle");
	}

	/** Called by the plugin after (re)parsing the user's speech-lines markdown file (see speechLines.ts). */
	setCustomSpeechLines(pool: Record<string, string[]>): void {
		this.customSpeechLines = pool;
	}

	updateSettings(settings: ShimejiSettings): void {
		this.settings = settings;
		this.updateClickThroughClass();
		this.applyBubbleStyleClass();
		this.applyGaitCssVars();
		this.applySize(settings.size);
		this.restartIdleBrain();
	}

	/** Forces click-through on/off independent of the user's own click-through setting (either wins). */
	setAutoClickThrough(auto: boolean): void {
		if (this.autoClickThrough === auto) return;
		this.autoClickThrough = auto;
		this.updateClickThroughClass();
	}

	private updateClickThroughClass(): void {
		this.containerEl.toggleClass("sm-clickthrough", this.settings.clickThrough || this.autoClickThrough);
	}

	private applyBubbleStyleClass(): void {
		this.bubbleEl.toggleClass("sm-bubble-style-comic", this.settings.speechBubbleStyle === "comic");
	}

	private gaitSpeed(gait: "walk" | "run"): number {
		return gait === "run" ? Math.max(1, this.settings.runSpeedPxPerSec) : Math.max(1, this.settings.walkSpeedPxPerSec);
	}

	private applyGaitCssVars(): void {
		this.containerEl.style.setProperty("--sm-jump-height", `${Math.max(1, this.settings.jumpHeightPercent)}%`);
	}

	setVisible(visible: boolean): void {
		this.containerEl.style.display = visible ? "" : "none";
		if (visible) this.restartIdleBrain();
		else this.clearTimer("idleTimer");
	}

	startIdleBrain(): void {
		this.restartIdleBrain();
	}

	/** Called from vault/workspace event handlers (and the command hook) to react to a trigger id. */
	react(trigger: string, message?: string): void {
		this.lastActivity = Date.now();
		this.setReaction(trigger, message);
	}

	/**
	 * Plays one specific animation/sequence by its own id, bypassing normal
	 * trigger/mood/weight selection - the settings tab's "Play" preview
	 * button uses this to test something immediately while building it,
	 * before (or regardless of) it being enabled/assigned to any action.
	 * Returns false if nothing with that id is currently resolvable (e.g. no
	 * frames yet), so the caller can surface that instead of silently no-op-ing.
	 */
	previewById(id: string): boolean {
		const chosen = this.pack?.byId[id];
		if (!chosen) return false;
		this.lastActivity = Date.now();
		this.currentTrigger = "preview";
		this.clearTimer("oneShotRevertTimer");
		this.clearTimer("sequenceStepTimer");
		this.clearTimer("wanderTimer");
		this.stopContinuousMovement();
		this.containerEl.removeClass("sm-invisible");
		this.applyEdgeOrientation(null);
		this.playChosenReaction(chosen, "preview");
		return true;
	}

	/** Starts playing an already-picked animation or sequence for `trigger` - shared by setReaction() (which does the picking) and previewById() (which already knows exactly which one). */
	private playChosenReaction(chosen: WeightedAnimation | WeightedSequence, trigger: string): void {
		if (chosen.kind === "sequence") {
			this.playSequence(chosen, trigger);
		} else {
			this.playResolvedAnimation(chosen, () => {
				if (this.currentTrigger !== trigger) return;
				// A non-looping clip's own duration (frames/fps) and a travel
				// movement's duration (distance/speed) are unrelated numbers -
				// this can fire before the travel actually arrives.
				this.freezeTweenPosition();
				this.setReaction("idle");
			});
			this.applyMovement(chosen.movement, trigger);
		}
	}

	/**
	 * Called over: triple-clicked outside the editor (see main.ts's summon
	 * watcher). Unlike every other trigger, its destination is wherever was
	 * clicked, not a MovementBehavior preset - a raw click point isn't
	 * something you'd pick from a dropdown - so it travels there directly
	 * instead of going through applyMovement/resolveDestination.
	 */
	summonTo(clientX: number, clientY: number): void {
		this.lastActivity = Date.now();
		this.currentTrigger = "summon";
		this.clearTimer("oneShotRevertTimer");
		this.stopContinuousMovement();
		this.containerEl.removeClass("sm-invisible");
		this.applyEdgeOrientation(null);

		const rect = this.containerEl.getBoundingClientRect();
		const margin = 8;
		const maxRight = Math.max(margin, window.innerWidth - rect.width - margin);
		const maxBottom = Math.max(margin, window.innerHeight - rect.height - margin);
		const targetRight = Math.min(Math.max(window.innerWidth - clientX - rect.width / 2, margin), maxRight);
		const targetBottom = Math.min(Math.max(window.innerHeight - clientY - rect.height / 2, margin), maxBottom);
		const currentRight = window.innerWidth - rect.right;
		const currentBottom = window.innerHeight - rect.bottom;
		const dx = targetRight - currentRight;
		if (Math.abs(dx) > 1) this.facingLeft = dx > 0;

		// Sequences aren't offered here - "summon" is fundamentally "travel to
		// this exact clicked point," which doesn't compose with a sequence's
		// own per-step movement. Assign a plain animation to get a custom look.
		const pool = (this.pack?.bySlot.summon ?? []).filter((c): c is WeightedAnimation => c.kind === "animation");
		const chosen = pool.length > 0 ? pickWeighted(pool) : null;
		if (chosen) {
			this.playResolvedAnimation(chosen, () => {
				if (this.currentTrigger !== "summon") return;
				this.freezeTweenPosition();
				this.setReaction("idle");
			});
		} else {
			const roleClip = this.roleClipForTrigger("summon");
			if (roleClip) {
				this.playResolvedAnimation(roleClip, () => {
					if (this.currentTrigger !== "summon") return;
					this.freezeTweenPosition();
					this.setReaction("idle");
				});
			} else {
				this.playBuiltinForTrigger("summon");
			}
		}

		const distance = Math.hypot(dx, targetBottom - currentBottom);
		const duration = Math.min(RUN_MAX_DURATION_MS, Math.max(RUN_MIN_DURATION_MS, (distance / this.gaitSpeed("run")) * 1000));
		this.clearTimer("wanderTimer");
		this.containerEl.addClass("sm-tween");
		this.containerEl.style.transitionDuration = `${duration}ms`;
		this.containerEl.style.right = `${targetRight}px`;
		this.containerEl.style.bottom = `${targetBottom}px`;
		this.wanderTimer = window.setTimeout(() => {
			if (this.currentTrigger !== "summon") return; // superseded by another reaction mid-travel
			this.containerEl.removeClass("sm-tween");
			this.containerEl.style.transitionDuration = "";
			this.restRight = targetRight;
			this.restBottom = targetBottom;
			this.settings.posX = targetRight;
			this.settings.posY = targetBottom;
			this.callbacks.onPositionChange(targetRight, targetBottom);
			this.setReaction("idle");
		}, duration);

		const resolvedMessage = this.resolveSpeechLine("summon");
		if (resolvedMessage && this.settings.speechBubbleEnabled) this.showBubble(resolvedMessage);
	}

	destroy(): void {
		this.clearTimer("idleTimer");
		this.clearTimer("moodCheckTimer");
		this.clearTimer("oneShotRevertTimer");
		this.clearTimer("spriteFrameTimer");
		this.clearTimer("wanderTimer");
		this.clearTimer("sequenceStepTimer");
		this.stopContinuousMovement();
		window.removeEventListener("resize", this.boundResize);
		window.removeEventListener("pointermove", this.boundTrackPointer);
		this.detachDragListeners();
		this.stopFollowLoop();
		this.stopFling();
		this.containerEl.remove();
	}

	// ---------- reaction / animation core ----------

	private setReaction(trigger: string, message?: string): void {
		this.currentTrigger = trigger;
		this.clearTimer("oneShotRevertTimer");
		this.clearTimer("sequenceStepTimer");
		this.clearTimer("wanderTimer");
		this.stopContinuousMovement();
		this.containerEl.removeClass("sm-invisible"); // any new reaction un-hides; a "Hide" movement re-applies it once it arrives
		// Any discrete reaction/pose stands upright - only edge-patrol wander
		// (which re-applies its own orientation right after this) stays rotated.
		this.applyEdgeOrientation(null);

		// Resting ("idle") is the one trigger mood gets a say in - it decides
		// which flavor of "idle" actually plays. currentTrigger itself stays
		// plain "idle" throughout, so everything that checks for it (idle
		// tick, drag/fling guards, wake-on-interaction) keeps working.
		const lookupTrigger = trigger === "idle" ? this.moodLookupTrigger() : trigger;

		const pool = this.pack?.bySlot[lookupTrigger];
		const chosen = pool && pool.length > 0 ? pickWeighted(pool) : null;

		if (chosen) {
			this.playChosenReaction(chosen, trigger);
		} else if (this.pack) {
			// Pack active but nothing assigned to this trigger: fall back to its
			// idle pool (a resting entry if one exists), else its own Basic
			// movement slot for this exact pose (see roleClipForTrigger).
			// Sequences are excluded from the idle-pool fallback - nothing
			// assigned to a trigger shouldn't randomly kick off a whole
			// scripted bit.
			const idlePool = (this.pack.bySlot.idle ?? []).filter((c): c is WeightedAnimation => c.kind === "animation");
			const restingIdle = idlePool.filter((c) => c.movement.kind === "none");
			const idleChosen = pickWeighted(restingIdle.length > 0 ? restingIdle : idlePool);
			if (idleChosen) {
				this.playResolvedAnimation(idleChosen, () => {});
				this.applyMovement(idleChosen.movement, trigger);
			} else {
				const roleClip = this.roleClipForTrigger(lookupTrigger);
				if (roleClip) {
					this.playResolvedAnimation(roleClip, () => {
						if (this.currentTrigger === trigger) this.setReaction("idle");
					});
				} else {
					this.playBuiltinForTrigger(lookupTrigger);
				}
			}
		} else {
			this.playBuiltinForTrigger(lookupTrigger);
		}

		const resolvedMessage = message ?? this.resolveSpeechLine(lookupTrigger);
		if (resolvedMessage && this.settings.speechBubbleEnabled) this.showBubble(resolvedMessage);
	}

	/**
	 * Freezes the container exactly where it currently is mid-flight,
	 * syncing restRight/restBottom/settings.posX-Y/onPositionChange to match -
	 * call before handing off to another reaction from a non-looping clip's
	 * onComplete, since that can fire before the travel tween it was
	 * playing during (see wanderTimer) actually finishes (a clip's own
	 * frames/fps duration and a travel's distance/speed duration are
	 * unrelated numbers). Without this, the still-pending CSS transition
	 * keeps sliding toward the old target on its own - under whatever plays
	 * next - while restRight/restBottom/settings.pos* silently go stale.
	 * No-op if nothing was actually mid-tween (wanderTimer already null).
	 */
	private freezeTweenPosition(): void {
		if (this.wanderTimer === null) return;
		this.clearTimer("wanderTimer");
		const rect = this.containerEl.getBoundingClientRect();
		const right = window.innerWidth - rect.right;
		const bottom = window.innerHeight - rect.bottom;
		this.containerEl.removeClass("sm-tween");
		this.containerEl.style.transitionDuration = "";
		this.containerEl.style.right = `${right}px`;
		this.containerEl.style.bottom = `${bottom}px`;
		this.restRight = right;
		this.restBottom = bottom;
		this.settings.posX = right;
		this.settings.posY = bottom;
		this.callbacks.onPositionChange(right, bottom);
	}

	/**
	 * The character's own Basic movement slot for whichever exact pose this
	 * trigger would otherwise show the builtin placeholder for (see
	 * BUILTIN_POSE_FOR_TRIGGER) - e.g. a poke plays the character's own
	 * "Poked reaction" clip if one's been built, not a generic stand-in.
	 * Null if this trigger has no corresponding pose (a jutsu, or a command
	 * trigger with no builtin equivalent) or that slot hasn't been filled in
	 * yet - callers fall through to the placeholder's own version of that
	 * exact pose in that case, which is by design: an unfilled slot IS
	 * "still the placeholder for now," not a mismatched swap to a different
	 * character.
	 */
	private roleClipForTrigger(trigger: string): ResolvedAnimation | null {
		const pose = BUILTIN_POSE_FOR_TRIGGER[trigger];
		if (!pose || !BASIC_MOVEMENT_ROLE_SET.has(pose)) return null;
		return this.pack?.basicMovement[pose as BasicMovementRole] ?? null;
	}

	/**
	 * Picks a random line for a trigger id from the user's own speech-lines
	 * file (settings.speechLinesFilePath, see speechLines.ts) - the only
	 * source of speech lines. No line at all if it doesn't cover this
	 * trigger (or hasn't been auto-created/populated yet).
	 */
	private resolveSpeechLine(trigger: string): string | undefined {
		const custom = this.customSpeechLines[trigger];
		if (custom && custom.length > 0) return custom[Math.floor(Math.random() * custom.length)];
		return undefined;
	}

	/** Which trigger id "idle" actually resolves to, based on the current mood - "normal" is just plain "idle". */
	private moodLookupTrigger(): string {
		if (this.currentMood === "normal") return "idle";
		const id = `mood:${this.currentMood}`;
		// "bored" keeps backward compatibility with the older standalone
		// "sleep" trigger id, for any character.json built before moods existed.
		if (this.currentMood === "bored" && !this.pack?.bySlot[id]?.length && this.pack?.bySlot.sleep?.length) {
			return "sleep";
		}
		return id;
	}

	/** Renders the trigger's built-in placeholder pose and, unless it loops, schedules the revert to idle. */
	private playBuiltinForTrigger(trigger: string): void {
		const pose = BUILTIN_POSE_FOR_TRIGGER[trigger] ?? "idle";
		this.playPlaceholder(pose);
		if (pose === "jutsuShuriken") {
			window.setTimeout(() => {
				if (this.currentTrigger === trigger) this.throwShuriken();
			}, SHURIKEN_THROW_DELAY_MS);
		}
		if (!LOOPING_POSES.has(pose)) {
			const duration = PLACEHOLDER_DURATIONS[pose] || 600;
			this.oneShotRevertTimer = window.setTimeout(() => {
				if (this.currentTrigger === trigger) this.setReaction("idle");
			}, duration);
		}
	}

	/** Launches a small shuriken sprite from the character toward wherever the pointer last was - "Shuriken Jutsu". */
	private throwShuriken(): void {
		const origin = this.containerEl.getBoundingClientRect();
		const startX = origin.left + origin.width / 2;
		const startY = origin.top + origin.height * 0.4;
		const dx = this.lastPointerX - startX;
		const dy = this.lastPointerY - startY;

		const shuriken = document.body.createDiv({ cls: "sm-thrown-shuriken" });
		shuriken.style.left = `${startX}px`;
		shuriken.style.top = `${startY}px`;

		const anim = shuriken.animate(
			[
				{ transform: "translate(-50%, -50%) rotate(0deg)", opacity: 1 },
				{ transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) rotate(900deg)`, opacity: 1 },
			],
			{ duration: SHURIKEN_FLIGHT_MS, easing: "ease-out", fill: "forwards" }
		);
		anim.finished
			.catch(() => {})
			.finally(() => shuriken.remove());
	}

	private playPlaceholder(pose: BuiltinPose): void {
		this.spriteStageEl.style.display = "none";
		this.charEl.style.display = "";
		this.charEl.className = `sm-char sm-state-${pose}${this.facingLeft ? " sm-facing-left" : ""}`;
	}

	private playResolvedAnimation(anim: ResolvedAnimation, onComplete: () => void): void {
		// No frames, or a degenerate (zero-size) crop rect, means there's
		// nothing to actually draw - fall back to the builtin placeholder
		// instead of leaving the widget stuck with the sprite stage hidden
		// and the placeholder body already hidden too (i.e. nothing visible
		// at all except the shadow).
		const maxFrameHeight = Math.max(0, ...anim.frames.map((f) => f.h));
		const maxFrameWidth = Math.max(0, ...anim.frames.map((f) => f.w));
		if (anim.frames.length === 0 || maxFrameHeight === 0 || maxFrameWidth === 0) {
			console.warn("Shimeji Buddy: animation has no usable frames, falling back to the placeholder", anim);
			this.playPlaceholder("idle");
			return;
		}

		this.charEl.style.display = "none";
		// .sm-spritestage's base CSS rule is display:none (hidden until a
		// pack actually has something to show) - clearing the inline style
		// to "" doesn't override that, it just defers back to the stylesheet
		// default, which is exactly the none we're trying to undo. Needs an
		// explicit non-none value.
		this.spriteStageEl.style.display = "block";
		this.spriteStageEl.toggleClass("sm-facing-left", this.facingLeft);

		// Auto-detected frames on hand-packed sheets can vary in height
		// between animations, not just within one (a crouch pose is
		// genuinely shorter than a standing one) - scaling each animation
		// independently against its OWN tallest frame would stretch every
		// pose up to fill the configured Size regardless, making the
		// character's apparent height jump around between animations. Scale
		// against the character's shared tallest frame (pack.maxFrameHeight)
		// instead, so only its tallest pose exactly fills Size and shorter
		// poses render shorter, in proportion - and anchor each frame
		// bottom-center within a fixed-size stage so switching frames within
		// one animation doesn't make the widget jump around either.
		const renderedSize = computeResponsiveSize(this.settings.size);
		const scale = renderedSize / (this.pack?.maxFrameHeight ?? maxFrameHeight);

		this.spriteStageEl.style.width = `${maxFrameWidth * scale}px`;
		this.spriteStageEl.style.height = `${maxFrameHeight * scale}px`;
		this.spriteFrameEl.style.backgroundImage = `url(${anim.imageUrl})`;
		this.spriteFrameEl.style.backgroundSize = `${anim.imageWidth * scale}px ${anim.imageHeight * scale}px`;

		this.clearTimer("spriteFrameTimer");
		let frame = 0;
		const draw = () => {
			const rect = anim.frames[frame];
			this.spriteFrameEl.style.width = `${rect.w * scale}px`;
			this.spriteFrameEl.style.height = `${rect.h * scale}px`;
			this.spriteFrameEl.style.backgroundPosition = `${-rect.x * scale}px ${-rect.y * scale}px`;
		};
		draw();

		if (anim.frames.length <= 1) return;
		this.spriteFrameTimer = window.setInterval(() => {
			frame++;
			if (frame >= anim.frames.length) {
				if (anim.loop) {
					frame = 0;
				} else {
					frame = anim.frames.length - 1;
					draw();
					this.clearTimer("spriteFrameTimer");
					onComplete();
					return;
				}
			}
			draw();
		}, 1000 / anim.fps);
	}

	private showBubble(text: string): void {
		this.bubbleEl.setText(text);
		this.bubbleEl.style.display = "";
		window.clearTimeout((this.bubbleEl as any)._smHideTimer);
		(this.bubbleEl as any)._smHideTimer = window.setTimeout(() => {
			this.bubbleEl.style.display = "none";
		}, 2200);
	}

	// ---------- scripted sequences (see settings.ts's AnimationSequence) ----------

	/** Kicks off a scripted, multi-step reaction - each step plays like a small one-shot reaction (its own visual, movement, and optional line), advancing on the step's own timer rather than waiting for the clip to finish naturally, so an explicit "wait 7 seconds" is honored precisely. */
	private playSequence(seq: WeightedSequence, trigger: string): void {
		const runId = ++this.sequenceRunId;
		this.runSequenceStep(seq, 0, runId, trigger);
	}

	private runSequenceStep(seq: WeightedSequence, index: number, runId: number, trigger: string): void {
		// Stale if something else (a poke, a drag, mood change, another reaction) has taken over since this step was scheduled.
		if (runId !== this.sequenceRunId || this.currentTrigger !== trigger) return;
		if (index >= seq.steps.length) {
			if (this.currentTrigger === trigger) this.setReaction("idle");
			return;
		}

		const step = seq.steps[index];
		this.clearTimer("sequenceStepTimer");
		// A previous step's own destination/moveIn/startleDash tween may still
		// be in flight if this step's duration was shorter than that tween -
		// its completion is on this same timer, and (unlike an external
		// interruption) currentTrigger doesn't change between steps, so only
		// clearing it here stops it from firing later and clobbering position
		// (or re-hiding the character) mid-way through a later step.
		this.clearTimer("wanderTimer");
		this.stopContinuousMovement();
		this.applyEdgeOrientation(null);
		this.containerEl.toggleClass("sm-invisible", step.hidden);

		// Sequence timing is driven by the step's own duration (below), not
		// the clip's natural completion - a no-op onComplete either way.
		// builtinPose only matters while there's no clip - a step's own
		// animation (if the user's replaced the jutsu placeholder with one)
		// always wins, same as an unfilled Basic movement slot.
		const builtinPose = !step.clip && step.builtinPose ? JUTSU_ID_TO_POSE[step.builtinPose] : null;
		if (step.clip) {
			this.playResolvedAnimation(step.clip, () => {});
		} else if (builtinPose) {
			this.playPlaceholder(builtinPose);
			if (builtinPose === "jutsuShuriken") {
				window.setTimeout(() => {
					if (this.currentTrigger === trigger) this.throwShuriken();
				}, SHURIKEN_THROW_DELAY_MS);
			}
		}
		if (step.movement.kind !== "none") this.applyMovement(step.movement, trigger);
		if (step.say && this.settings.speechBubbleEnabled) this.showBubble(step.say);

		let duration = step.durationMs;
		if (duration <= 0) {
			// No explicit duration: a non-looping clip gets exactly its own
			// playback length, an unfilled jutsu slot gets its placeholder
			// pose's own length, anything else (a loop, or no clip/pose at
			// all) needs a sane fallback since none of those end on their own.
			if (step.clip && !step.clip.loop) duration = (step.clip.frames.length / step.clip.fps) * 1000;
			else if (builtinPose) duration = PLACEHOLDER_DURATIONS[builtinPose] || 600;
			else duration = 1200;
		}

		this.sequenceStepTimer = window.setTimeout(() => this.runSequenceStep(seq, index + 1, runId, trigger), duration);
	}

	// ---------- idle / standby brain ----------

	private restartIdleBrain(): void {
		this.clearTimer("idleTimer");
		this.scheduleNextIdleTick();
	}

	private scheduleNextIdleTick(): void {
		const { idleMinSeconds, idleMaxSeconds } = this.settings;
		const min = Math.max(2, idleMinSeconds);
		const max = Math.max(min + 1, idleMaxSeconds);
		// Happy = energetic (acts sooner), bored = sluggish (acts later).
		const delay = (min + Math.random() * (max - min)) * 1000 * MOOD_IDLE_INTERVAL_FACTOR[this.currentMood];
		this.idleTimer = window.setTimeout(() => this.idleTick(), delay);
	}

	private idleTick(): void {
		this.scheduleNextIdleTick();
		// Never let the standby brain grab position/pose while the user has
		// their hands on the character, while it's still flying from a
		// throw, or mid click-counter hop - it was fighting an active drag
		// for control of style.right/bottom.
		if (this.isDragging || this.isFlinging || this.isClickHopping) return;
		if (this.currentTrigger !== "idle") return;

		if (this.pack) {
			// Basic movement (see settings.ts's BasicMovementRole) is the
			// automatic fallback for idle roaming - a character only needs its
			// four gait clips built to roam convincingly, without also having
			// to hand-build a dedicated idle-roam animation. Still only offered
			// while "Roam style" itself isn't Off, same as every other roaming
			// path, and can be turned off per-character too.
			const bm = this.pack.basicMovement;
			if (
				this.settings.wanderEnabled &&
				this.pack.basicMovementRoamEnabled &&
				(bm.walk || bm.run || bm.jump || bm.fall) &&
				Math.random() < BASIC_MOVEMENT_ROAM_CHANCE
			) {
				this.basicMovementRoam();
				return;
			}
			// Otherwise, re-picking from the idle pool naturally mixes movement
			// in - each idle animation carries its own MovementBehavior (applied
			// inside setReaction), so "does this tick roam or rest" just falls
			// out of how the pool is weighted.
			this.setReaction("idle");
			return;
		}

		// Builtin placeholder: pick from the user's configured pool of idle
		// behaviors (settings.builtinBehaviors) - gaits that roam, or poses
		// (workouts, jutsus) played in place. Roaming gaits are only offered
		// while "Wander" itself is on; everything else is independent of it.
		if (Math.random() < IDLE_BEHAVIOR_CHANCE) {
			const behavior = this.pickBuiltinIdleBehavior();
			if (behavior) {
				if (behavior.moves) {
					this.wander(behavior);
				} else {
					this.setReaction(`idle:${behavior.id}`);
				}
				return;
			}
		}
		// Nudge the placeholder animation to replay its idle keyframe (also
		// picks a fresh random blink phase via CSS restart).
		this.setReaction("idle");
	}

	private pickBuiltinIdleBehavior(): BuiltinIdleBehaviorDef | null {
		const candidates = BUILTIN_IDLE_BEHAVIORS.filter((b) => {
			if (b.moves && !this.settings.wanderEnabled) return false;
			return this.settings.builtinBehaviors[b.id]?.enabled !== false;
		}).map((b) => ({ ...b, weight: Math.max(0, this.settings.builtinBehaviors[b.id]?.weight ?? 1) }));
		return pickWeighted(candidates);
	}

	/** The builtin placeholder's own roaming gaits (walk/run/jump) - a custom pack's idle roaming goes through setReaction()'s MovementBehavior handling instead (see applyMovement). */
	private wander(builtinBehavior?: BuiltinIdleBehaviorDef): void {
		const pose = builtinBehavior?.pose ?? "walk";
		const speed = this.gaitSpeed(pose === "run" ? "run" : "walk");
		const render = () => {
			this.currentTrigger = "idle";
			this.playPlaceholder(pose);
		};

		const rect = this.containerEl.getBoundingClientRect();
		const { newRight, newBottom, edgeSide } = this.pickWanderDestination(rect);

		const currentRight = window.innerWidth - rect.right;
		const currentBottom = window.innerHeight - rect.bottom;

		const dx = newRight - currentRight;
		const dy = newBottom - currentBottom;
		if (Math.abs(dx) > 1) this.facingLeft = dx > 0; // moving toward the right offset = moving left on screen

		const distance = Math.hypot(dx, dy);
		const duration = Math.min(RUN_MAX_DURATION_MS, Math.max(RUN_MIN_DURATION_MS, (distance / speed) * 1000));

		render();
		this.applyEdgeOrientation(edgeSide);
		this.containerEl.addClass("sm-tween");
		this.containerEl.style.transitionDuration = `${duration}ms`;
		this.containerEl.style.right = `${newRight}px`;
		this.containerEl.style.bottom = `${newBottom}px`;

		this.clearTimer("wanderTimer");
		this.wanderTimer = window.setTimeout(() => {
			this.containerEl.removeClass("sm-tween");
			this.containerEl.style.transitionDuration = "";
			this.settings.posX = newRight;
			this.settings.posY = newBottom;
			this.restRight = newRight;
			this.restBottom = newBottom;
			this.callbacks.onPositionChange(this.settings.posX, this.settings.posY);
			if (this.currentTrigger === "idle") {
				this.setReaction("idle"); // resets orientation to upright...
				this.applyEdgeOrientation(edgeSide); // ...so re-apply it: still resting on the edge.
			}
		}, duration);
	}

	/**
	 * A custom character's idle-roam fallback when it has no dedicated
	 * roaming animation of its own: travels to a random on-screen spot using
	 * one of its four Basic movement gaits, picked by the actual direction
	 * of travel - mostly straight up plays Jump, mostly straight down plays
	 * Fall, sideways plays Walk (Run if there's no Walk clip to fall back
	 * to). Deliberately never touches rotation (always upright, left/right
	 * mirrored only) - that's reserved for the "Walk around the window
	 * edges" MovementBehavior, not roaming in general.
	 */
	private basicMovementRoam(): void {
		const basicMovement = this.pack?.basicMovement;
		if (!basicMovement) return;

		const rect = this.containerEl.getBoundingClientRect();
		const margin = 8;
		const maxRight = Math.max(margin, window.innerWidth - rect.width - margin);
		const maxBottom = Math.max(margin, window.innerHeight - rect.height - margin);
		const currentRight = window.innerWidth - rect.right;
		const currentBottom = window.innerHeight - rect.bottom;
		const targetRight = margin + Math.random() * (maxRight - margin);
		const targetBottom = margin + Math.random() * (maxBottom - margin);
		const dx = targetRight - currentRight; // + = moving left on screen
		const dy = targetBottom - currentBottom; // + = moving down on screen (bottom offset shrinking = moving up)

		let role: BasicMovementRole;
		if (Math.abs(dy) > Math.abs(dx) * BASIC_MOVEMENT_VERTICAL_RATIO) role = dy < 0 ? "jump" : "fall";
		else role = basicMovement.walk ? "walk" : "run";
		const clip = basicMovement[role] ?? basicMovement.walk ?? basicMovement.run ?? basicMovement.jump ?? basicMovement.fall;
		if (!clip) return;

		this.currentTrigger = "idle";
		if (Math.abs(dx) > 1) this.facingLeft = dx > 0;
		this.playResolvedAnimation(clip, () => {
			if (this.currentTrigger !== "idle") return;
			this.freezeTweenPosition();
			this.setReaction("idle");
		});
		this.applyEdgeOrientation(null);

		const gait = role === "run" ? "run" : "walk";
		const distance = Math.hypot(dx, dy);
		const duration = Math.min(RUN_MAX_DURATION_MS, Math.max(RUN_MIN_DURATION_MS, (distance / this.gaitSpeed(gait)) * 1000));
		this.clearTimer("wanderTimer");
		this.containerEl.addClass("sm-tween");
		this.containerEl.style.transitionDuration = `${duration}ms`;
		this.containerEl.style.right = `${targetRight}px`;
		this.containerEl.style.bottom = `${targetBottom}px`;

		this.wanderTimer = window.setTimeout(() => {
			if (this.currentTrigger !== "idle") return; // superseded by another reaction mid-travel
			this.containerEl.removeClass("sm-tween");
			this.containerEl.style.transitionDuration = "";
			this.restRight = targetRight;
			this.restBottom = targetBottom;
			this.settings.posX = targetRight;
			this.settings.posY = targetBottom;
			this.callbacks.onPositionChange(targetRight, targetBottom);
			this.setReaction("idle");
		}, duration);
	}

	/** Rotates sm-visual so the character's feet face whichever perimeter side it's on, or upright (null) otherwise. */
	private applyEdgeOrientation(side: PerimeterSide | null): void {
		const deg = rotationForSide(side);
		this.visualEl.style.transform = deg ? `rotate(${deg}deg)` : "";
	}

	/** Anywhere on screen by default, or patrolling the sidebar/main-area boundaries when "stick to edges" is on. */
	private pickWanderDestination(
		rect: DOMRect
	): { newRight: number; newBottom: number; edgeSide: PerimeterSide | null } {
		const margin = 8;

		if (this.settings.roamStickToEdges) {
			const regions = getWorkspaceRegions(this.app);
			if (regions.length > 0) {
				if (this.patrolRegionIndex >= regions.length || Math.random() < 0.2) {
					this.patrolRegionIndex = Math.floor(Math.random() * regions.length);
				}
				if (Math.random() < 0.15) this.perimeterDirection = this.perimeterDirection === 1 ? -1 : 1;
				this.perimeterT += this.perimeterDirection * (0.05 + Math.random() * 0.1);

				const point = pointOnRegionPerimeter(
					regions[this.patrolRegionIndex],
					rect.width,
					rect.height,
					this.perimeterT,
					margin
				);
				if (point) {
					const dest = this.clampDestination(
						window.innerWidth - point.left - rect.width,
						window.innerHeight - point.top - rect.height,
						rect,
						margin
					);
					return { ...dest, edgeSide: point.side };
				}
			}
			// No usable region (e.g. window too small) - fall through to free roam this tick.
		}

		const maxRight = Math.max(margin, window.innerWidth - rect.width - margin);
		const maxBottom = Math.max(margin, window.innerHeight - rect.height - margin);
		return {
			newRight: margin + Math.random() * (maxRight - margin),
			newBottom: margin + Math.random() * (maxBottom - margin),
			edgeSide: null,
		};
	}

	private clampDestination(
		right: number,
		bottom: number,
		rect: DOMRect,
		margin: number
	): { newRight: number; newBottom: number } {
		const maxRight = Math.max(margin, window.innerWidth - rect.width - margin);
		const maxBottom = Math.max(margin, window.innerHeight - rect.height - margin);
		return {
			newRight: Math.min(Math.max(right, margin), maxRight),
			newBottom: Math.min(Math.max(bottom, margin), maxBottom),
		};
	}

	// ---------- MovementBehavior engine (pre-scripted movement, see settings.ts) ----------

	/** Dispatches a chosen animation's MovementBehavior - a one-shot travel-to-a-destination, or a continuous per-frame behavior that runs for as long as this reaction stays current. Called from setReaction() for whichever animation it just picked. */
	private applyMovement(movement: MovementBehavior, trigger: string): void {
		switch (movement.kind) {
			case "none":
				return;
			case "randomSpot":
			case "origin":
			case "edge":
			case "center":
			case "corner":
			case "hide":
			case "peek":
				this.runDestinationMovement(movement, trigger);
				return;
			case "startleDash":
				this.runStartleDash(trigger);
				return;
			case "moveIn":
				this.runMoveIn(movement, trigger);
				return;
			case "spin":
			case "patrolWindowEdges":
			case "paceEdge":
			case "follow":
			case "stalk":
			case "avoid":
				this.runContinuousMovement(movement, trigger);
				return;
		}
	}

	private stopContinuousMovement(): void {
		if (this.movementRafId !== null) window.cancelAnimationFrame(this.movementRafId);
		this.movementRafId = null;
	}

	/** Travels once to a resolved destination (or jumps straight there if movement.instant), reusing the same CSS-transition tween the idle-roam brain always has. */
	private runDestinationMovement(movement: MovementBehavior, trigger: string): void {
		const rect = this.containerEl.getBoundingClientRect();
		const dest = this.resolveDestination(movement, rect);
		const currentRight = window.innerWidth - rect.right;
		const currentBottom = window.innerHeight - rect.bottom;
		const dx = dest.right - currentRight;
		const dy = dest.bottom - currentBottom;
		if (Math.abs(dx) > 1) this.facingLeft = dx > 0;

		this.clearTimer("wanderTimer");
		this.containerEl.removeClass("sm-tween");
		this.containerEl.style.transitionDuration = "";

		if (movement.instant) {
			this.containerEl.style.right = `${dest.right}px`;
			this.containerEl.style.bottom = `${dest.bottom}px`;
			this.applyEdgeOrientation(dest.edgeSide);
			this.finishDestinationMovement(dest, trigger, movement);
			return;
		}

		const distance = Math.hypot(dx, dy);
		const duration = Math.min(RUN_MAX_DURATION_MS, Math.max(RUN_MIN_DURATION_MS, (distance / this.gaitSpeed(movement.gait ?? "walk")) * 1000));
		this.applyEdgeOrientation(dest.edgeSide);
		this.containerEl.addClass("sm-tween");
		this.containerEl.style.transitionDuration = `${duration}ms`;
		this.containerEl.style.right = `${dest.right}px`;
		this.containerEl.style.bottom = `${dest.bottom}px`;

		this.wanderTimer = window.setTimeout(() => {
			if (this.currentTrigger !== trigger) return; // superseded by another reaction mid-travel
			this.containerEl.removeClass("sm-tween");
			this.containerEl.style.transitionDuration = "";
			this.finishDestinationMovement(dest, trigger, movement);
		}, duration);
	}

	private finishDestinationMovement(
		dest: { right: number; bottom: number; edgeSide: PerimeterSide | null },
		trigger: string,
		movement: MovementBehavior
	): void {
		this.settings.posX = dest.right;
		this.settings.posY = dest.bottom;
		this.callbacks.onPositionChange(dest.right, dest.bottom);
		// "Hide"/"Peek" are deliberately not normal resting spots - "origin" shouldn't return to one of them.
		if (movement.kind !== "hide" && movement.kind !== "peek") {
			this.restRight = dest.right;
			this.restBottom = dest.bottom;
		}
		if (movement.kind === "hide") this.containerEl.addClass("sm-invisible");
		if (trigger === "idle" && this.currentTrigger === trigger) {
			this.setReaction("idle"); // resets orientation to upright...
			this.applyEdgeOrientation(dest.edgeSide); // ...so re-apply it: still resting on the edge, if any.
		}
	}

	/** Which screen edge a rect currently sits closest to. */
	private nearestScreenEdge(rect: DOMRect): "top" | "bottom" | "left" | "right" {
		const currentRight = window.innerWidth - rect.right;
		const currentBottom = window.innerHeight - rect.bottom;
		const distTop = Math.max(0, window.innerHeight - currentBottom - rect.height);
		const distBottom = Math.max(0, currentBottom);
		const distLeft = Math.max(0, window.innerWidth - currentRight - rect.width);
		const distRight = Math.max(0, currentRight);
		const min = Math.min(distTop, distBottom, distLeft, distRight);
		if (min === distTop) return "top";
		if (min === distBottom) return "bottom";
		if (min === distLeft) return "left";
		return "right";
	}

	/** Resolves "nearest"/"random"/a specific side into one of the 4 real edges. */
	private resolveEdgeChoice(edge: ScreenEdge | undefined, rect: DOMRect): "top" | "bottom" | "left" | "right" {
		if (!edge || edge === "nearest") return this.nearestScreenEdge(rect);
		if (edge === "random") return (["top", "bottom", "left", "right"] as const)[Math.floor(Math.random() * 4)];
		return edge;
	}

	/**
	 * A position at (or just past) one of the 4 screen edges. `offscreen`
	 * false = touching it, still on-screen (the "Edge" destination);
	 * true = continues past it, fully hidden (the "Hide" destination, and
	 * the starting point for "Move in"). `along`/`alongV` optionally pin
	 * the position along the edge's other axis (0-1, 0=near start of that
	 * axis) instead of picking a random spot along it.
	 */
	private edgePositionOnScreen(
		edge: "top" | "bottom" | "left" | "right",
		offscreen: boolean,
		rect: DOMRect,
		alongFraction?: number
	): { right: number; bottom: number; edgeSide: PerimeterSide } {
		const margin = 8;
		const maxRight = Math.max(margin, window.innerWidth - rect.width - margin);
		const maxBottom = Math.max(margin, window.innerHeight - rect.height - margin);
		const along = margin + (alongFraction ?? Math.random()) * Math.max(0, maxRight - margin);
		const alongV = margin + (alongFraction ?? Math.random()) * Math.max(0, maxBottom - margin);
		switch (edge) {
			case "top":
				return { right: along, bottom: offscreen ? window.innerHeight : maxBottom, edgeSide: "top" };
			case "bottom":
				return { right: along, bottom: offscreen ? -rect.height : margin, edgeSide: "bottom" };
			case "left":
				return { right: offscreen ? window.innerWidth : maxRight, bottom: alongV, edgeSide: "left" };
			case "right":
				return { right: offscreen ? -rect.width : margin, bottom: alongV, edgeSide: "right" };
		}
	}

	/** Where a one-shot MovementBehavior destination resolves to, in the same right/bottom offset space the container's own position lives in. */
	private resolveDestination(
		movement: MovementBehavior,
		rect: DOMRect
	): { right: number; bottom: number; edgeSide: PerimeterSide | null } {
		const margin = 8;
		const maxRight = Math.max(margin, window.innerWidth - rect.width - margin);
		const maxBottom = Math.max(margin, window.innerHeight - rect.height - margin);
		const currentRight = window.innerWidth - rect.right;
		const currentBottom = window.innerHeight - rect.bottom;

		switch (movement.kind) {
			case "randomSpot": {
				const { newRight, newBottom, edgeSide } = this.pickWanderDestination(rect);
				return { right: newRight, bottom: newBottom, edgeSide };
			}
			case "origin":
				return {
					right: Math.min(Math.max(this.restRight, margin), maxRight),
					bottom: Math.min(Math.max(this.restBottom, margin), maxBottom),
					edgeSide: null,
				};
			case "center":
				return { right: (window.innerWidth - rect.width) / 2, bottom: (window.innerHeight - rect.height) / 2, edgeSide: null };
			case "corner": {
				const nearestVertical = window.innerHeight - currentBottom - rect.height <= currentBottom ? "top" : "bottom";
				const nearestHorizontal = window.innerWidth - currentRight - rect.width <= currentRight ? "left" : "right";
				const corner: ScreenCorner =
					!movement.corner || movement.corner === "nearest"
						? (`${nearestVertical}-${nearestHorizontal}` as ScreenCorner)
						: movement.corner;
				return {
					right: corner.endsWith("left") ? maxRight : margin,
					bottom: corner.startsWith("top") ? maxBottom : margin,
					edgeSide: null,
				};
			}
			case "edge":
				return this.edgePositionOnScreen(this.resolveEdgeChoice(movement.edge, rect), false, rect);
			case "hide":
				return this.edgePositionOnScreen(this.resolveEdgeChoice(movement.edge, rect), true, rect);
			case "peek": {
				const edge = (movement.edge && movement.edge !== "nearest" && movement.edge !== "random" ? movement.edge : "top") as
					| "top"
					| "bottom"
					| "left"
					| "right";
				return { ...this.resolvePeekOffset(edge, movement.peekFraction ?? 0.3, rect), edgeSide: null };
			}
			default:
				return { right: currentRight, bottom: currentBottom, edgeSide: null };
		}
	}

	/** How far off an edge to sit so only `fraction` of the sprite still shows - a fraction rather than fixed px since sprite height/width varies per character. */
	private resolvePeekOffset(edge: ScreenEdge, fraction: number, rect: DOMRect): { right: number; bottom: number } {
		const f = Math.min(1, Math.max(0, fraction));
		const currentRight = window.innerWidth - rect.right;
		const currentBottom = window.innerHeight - rect.bottom;
		switch (edge) {
			case "top":
				return { right: currentRight, bottom: window.innerHeight - f * rect.height };
			case "bottom":
				return { right: currentRight, bottom: -(1 - f) * rect.height };
			case "left":
				return { right: window.innerWidth - f * rect.width, bottom: currentBottom };
			case "right":
				return { right: -(1 - f) * rect.width, bottom: currentBottom };
			default:
				return { right: currentRight, bottom: currentBottom };
		}
	}

	/** A quick short hop away from wherever it currently is, then settles - a startle/flinch reaction. */
	private runStartleDash(trigger: string): void {
		const rect = this.containerEl.getBoundingClientRect();
		const margin = 8;
		const maxRight = Math.max(margin, window.innerWidth - rect.width - margin);
		const maxBottom = Math.max(margin, window.innerHeight - rect.height - margin);
		const currentRight = window.innerWidth - rect.right;
		const currentBottom = window.innerHeight - rect.bottom;
		const angle = Math.random() * Math.PI * 2;
		const hopDistance = 140;
		const newRight = Math.min(Math.max(currentRight + Math.cos(angle) * hopDistance, margin), maxRight);
		const newBottom = Math.min(Math.max(currentBottom + Math.sin(angle) * hopDistance, margin), maxBottom);
		if (Math.abs(newRight - currentRight) > 1) this.facingLeft = newRight > currentRight;

		this.clearTimer("wanderTimer");
		this.containerEl.addClass("sm-tween");
		this.containerEl.style.transitionDuration = "180ms";
		this.containerEl.style.right = `${newRight}px`;
		this.containerEl.style.bottom = `${newBottom}px`;
		this.wanderTimer = window.setTimeout(() => {
			if (this.currentTrigger !== trigger) return;
			this.containerEl.removeClass("sm-tween");
			this.containerEl.style.transitionDuration = "";
			this.restRight = newRight;
			this.restBottom = newBottom;
			this.settings.posX = newRight;
			this.settings.posY = newBottom;
			this.callbacks.onPositionChange(newRight, newBottom);
		}, 180);
	}

	/**
	 * A single atomic entrance: teleports off-screen past the chosen edge
	 * (at the chosen third along it), reveals, then tweens in to an
	 * on-screen landing spot a little inset from that edge. Walking,
	 * running, falling, or jumping in is entirely a matter of which edge is
	 * picked (top -> falls, bottom -> jumps, left/right -> walks/runs in)
	 * and which animation is paired with this step/animation - the engine
	 * doesn't distinguish them beyond that.
	 */
	private runMoveIn(movement: MovementBehavior, trigger: string): void {
		const rect = this.containerEl.getBoundingClientRect();
		const margin = 8;
		const maxRight = Math.max(margin, window.innerWidth - rect.width - margin);
		const maxBottom = Math.max(margin, window.innerHeight - rect.height - margin);
		const edge = this.resolveEdgeChoice(movement.edge, rect);
		const thirdFraction = movement.third === "first" ? 1 / 6 : movement.third === "third" ? 5 / 6 : 0.5;

		const start = this.edgePositionOnScreen(edge, true, rect, thirdFraction);
		const inset = (edge === "top" || edge === "bottom" ? rect.height : rect.width) * 1.2;
		let landingRight = start.right;
		let landingBottom = start.bottom;
		if (edge === "top") landingBottom = Math.min(maxBottom, Math.max(margin, maxBottom - inset));
		else if (edge === "bottom") landingBottom = Math.min(maxBottom, margin + inset);
		else if (edge === "left") landingRight = Math.min(maxRight, Math.max(margin, maxRight - inset));
		else landingRight = Math.min(maxRight, margin + inset);
		landingRight = Math.min(Math.max(landingRight, margin), maxRight);
		landingBottom = Math.min(Math.max(landingBottom, margin), maxBottom);

		const dx = landingRight - start.right;
		if (Math.abs(dx) > 1) this.facingLeft = dx > 0;

		this.clearTimer("wanderTimer");
		this.containerEl.removeClass("sm-tween");
		this.containerEl.style.transitionDuration = "";
		this.containerEl.style.right = `${start.right}px`;
		this.containerEl.style.bottom = `${start.bottom}px`;
		this.applyEdgeOrientation(null);
		// Forces the browser to register the off-screen starting position
		// before the transition below begins - without this, both style
		// writes can land in the same paint and the "from" state (needed
		// for the tween to actually animate) is never observed.
		void this.containerEl.offsetHeight;

		const distance = Math.hypot(landingRight - start.right, landingBottom - start.bottom);
		const duration = Math.min(RUN_MAX_DURATION_MS, Math.max(RUN_MIN_DURATION_MS, (distance / this.gaitSpeed(movement.gait ?? "walk")) * 1000));
		this.containerEl.addClass("sm-tween");
		this.containerEl.style.transitionDuration = `${duration}ms`;
		this.containerEl.style.right = `${landingRight}px`;
		this.containerEl.style.bottom = `${landingBottom}px`;

		this.wanderTimer = window.setTimeout(() => {
			if (this.currentTrigger !== trigger) return;
			this.containerEl.removeClass("sm-tween");
			this.containerEl.style.transitionDuration = "";
			this.restRight = landingRight;
			this.restBottom = landingBottom;
			this.settings.posX = landingRight;
			this.settings.posY = landingBottom;
			this.callbacks.onPositionChange(landingRight, landingBottom);
		}, duration);
	}

	/**
	 * Drives spin / patrolWindowEdges / paceEdge / follow / stalk / avoid - a
	 * single rAF loop recomputing position every frame for as long as this
	 * exact reaction stays current (stopped by the next setReaction() call,
	 * whatever triggers it - a new reaction, a drag, mood change, etc).
	 */
	private runContinuousMovement(movement: MovementBehavior, trigger: string): void {
		const startRect = this.containerEl.getBoundingClientRect();
		this.containerEl.removeClass("sm-tween");
		this.containerEl.style.transitionDuration = "";
		let right = window.innerWidth - startRect.right;
		let bottom = window.innerHeight - startRect.bottom;
		let angle = Math.random() * Math.PI * 2;
		let perimeterT = Math.random();
		let perimeterDir: 1 | -1 = 1;
		let lastTime = performance.now();

		const step = (now: number) => {
			if (this.currentTrigger !== trigger || this.isDragging || this.isFlinging || this.isClickHopping) {
				this.movementRafId = null;
				// Persisted once here, not every frame - same pattern the drag/fling loops use (settlePosition), rather than writing to disk 60x/sec.
				this.restRight = right;
				this.restBottom = bottom;
				this.settings.posX = right;
				this.settings.posY = bottom;
				this.callbacks.onPositionChange(right, bottom);
				return;
			}
			const dt = Math.min((now - lastTime) / 1000, 0.05);
			lastTime = now;
			const rect = this.containerEl.getBoundingClientRect();
			const margin = 8;
			const maxRight = Math.max(margin, window.innerWidth - rect.width - margin);
			const maxBottom = Math.max(margin, window.innerHeight - rect.height - margin);

			switch (movement.kind) {
				case "spin": {
					const radius = movement.radius ?? 120;
					angle += dt * 1.2;
					const cx = (window.innerWidth - rect.width) / 2;
					const cy = (window.innerHeight - rect.height) / 2;
					const x = cx + Math.cos(angle) * radius;
					const y = cy + Math.sin(angle) * radius;
					right = Math.min(Math.max(window.innerWidth - x - rect.width, margin), maxRight);
					bottom = Math.min(Math.max(window.innerHeight - y - rect.height, margin), maxBottom);
					// Faces outward (away from center) - the opposite convention from edge-patrol, which faces inward.
					this.visualEl.style.transform = `rotate(${(angle * 180) / Math.PI + 90}deg)`;
					break;
				}
				case "patrolWindowEdges": {
					perimeterT += perimeterDir * dt * 0.08;
					const point = pointOnRegionPerimeter(
						new DOMRect(0, 0, window.innerWidth, window.innerHeight),
						rect.width,
						rect.height,
						perimeterT,
						margin
					);
					if (point) {
						right = window.innerWidth - point.left - rect.width;
						bottom = window.innerHeight - point.top - rect.height;
						this.applyEdgeOrientation(point.side);
					}
					break;
				}
				case "paceEdge": {
					const edge = movement.edge && movement.edge !== "nearest" && movement.edge !== "random" ? movement.edge : "bottom";
					perimeterT += perimeterDir * dt * 0.3;
					if (perimeterT > 1) {
						perimeterT = 1;
						perimeterDir = -1;
					} else if (perimeterT < 0) {
						perimeterT = 0;
						perimeterDir = 1;
					}
					if (edge === "top" || edge === "bottom") {
						right = margin + perimeterT * Math.max(0, maxRight - margin);
						bottom = edge === "top" ? maxBottom : margin;
						this.applyEdgeOrientation(edge);
					} else {
						bottom = margin + perimeterT * Math.max(0, maxBottom - margin);
						right = edge === "left" ? maxRight : margin;
						this.applyEdgeOrientation(edge);
					}
					break;
				}
				case "follow":
				case "stalk": {
					const targetRight = window.innerWidth - this.lastPointerX - rect.width / 2;
					const targetBottom = window.innerHeight - this.lastPointerY - rect.height / 2;
					const keepDistance = movement.kind === "follow" ? 70 : 0;
					const speed = movement.kind === "follow" ? 90 : 260;
					const dRight = targetRight - right;
					const dBottom = targetBottom - bottom;
					const dist = Math.hypot(dRight, dBottom);
					if (dist > keepDistance + 4) {
						const move = Math.min(dist - keepDistance, speed * dt);
						right += (dRight / dist) * move;
						bottom += (dBottom / dist) * move;
						if (Math.abs(dRight) > 1) this.facingLeft = dRight < 0;
					}
					right = Math.min(Math.max(right, margin), maxRight);
					bottom = Math.min(Math.max(bottom, margin), maxBottom);
					break;
				}
				case "avoid": {
					const cursorRight = window.innerWidth - this.lastPointerX - rect.width / 2;
					const cursorBottom = window.innerHeight - this.lastPointerY - rect.height / 2;
					const dRight = right - cursorRight;
					const dBottom = bottom - cursorBottom;
					const dist = Math.hypot(dRight, dBottom);
					const triggerDistance = 160;
					if (dist < triggerDistance && dist > 0.01) {
						const move = 260 * dt;
						right += (dRight / dist) * move;
						bottom += (dBottom / dist) * move;
						if (Math.abs(dRight) > 1) this.facingLeft = dRight > 0;
					}
					right = Math.min(Math.max(right, margin), maxRight);
					bottom = Math.min(Math.max(bottom, margin), maxBottom);
					break;
				}
			}

			this.containerEl.style.right = `${right}px`;
			this.containerEl.style.bottom = `${bottom}px`;
			this.movementRafId = window.requestAnimationFrame(step);
		};
		this.movementRafId = window.requestAnimationFrame(step);
	}

	// ---------- sleep watcher ----------

	private startMoodWatcher(): void {
		this.clearTimer("moodCheckTimer");
		this.moodCheckTimer = window.setInterval(() => this.recomputeMood(), MOOD_CHECK_INTERVAL_MS);
	}

	/**
	 * Four moods, from how the buddy's been treated: "angry" (poked/thrown
	 * too much too fast) beats "happy" (recent real vault activity - typing,
	 * opening notes, etc), which beats "bored" (long inactivity - the old
	 * standalone "asleep" state, now just what bored looks like), which
	 * falls back to plain "normal". Only actually changes the displayed pose
	 * when resting (currentTrigger === "idle") and not mid-drag/fling/hop,
	 * so it never fights the user for control the way idle wander used to.
	 */
	private recomputeMood(): void {
		const now = Date.now();
		this.recentProvocations = this.recentProvocations.filter((t) => now - t < ANGRY_WINDOW_MS);

		let mood: MoodId;
		if (this.recentProvocations.length >= ANGRY_THRESHOLD) mood = "angry";
		else if (now - this.lastActivity < HAPPY_ACTIVITY_WINDOW_MS) mood = "happy";
		else if (now - this.lastActivity > this.settings.sleepAfterMinutes * 60_000) mood = "bored";
		else mood = "normal";

		if (mood === this.currentMood) return;
		this.currentMood = mood;
		if (this.currentTrigger === "idle" && !this.isDragging && !this.isFlinging && !this.isClickHopping) {
			this.setReaction("idle");
		}
	}

	/** A poke or a real throw counts toward "angry" - a gentle reposition drag doesn't. */
	private registerProvocation(): void {
		this.recentProvocations.push(Date.now());
		this.recomputeMood();
	}

	// ---------- click counter mode ----------

	/** Turning it on/off (from settings or the "Toggle click counter mode" command) resets the tally and confirms the new state. */
	setClickCounterMode(enabled: boolean): void {
		if (enabled) {
			this.clickCounterCount = 0;
			new Notice("Click counter started - click the buddy to count.");
		} else if (this.clickCounterCount > 0) {
			new Notice(`Click counter: ${this.clickCounterCount} click${this.clickCounterCount === 1 ? "" : "s"}.`);
		}
	}

	private registerClickCounterClick(): void {
		this.clickCounterCount++;
		if (this.settings.speechBubbleEnabled) this.showBubble(`Clicks: ${this.clickCounterCount}`);
		this.clickCounterHop();
	}

	/** A quick hop to a new nearby spot - "shimeji moves as you click" while counter mode is on, instead of the normal in-place poke reaction. */
	private clickCounterHop(): void {
		this.clearTimer("wanderTimer");
		this.containerEl.removeClass("sm-tween");
		this.containerEl.style.transitionDuration = "";
		this.stopFling();
		this.applyEdgeOrientation(null);

		const rect = this.containerEl.getBoundingClientRect();
		const margin = 8;
		const maxRight = Math.max(margin, window.innerWidth - rect.width - margin);
		const maxBottom = Math.max(margin, window.innerHeight - rect.height - margin);
		const currentRight = window.innerWidth - rect.right;
		const currentBottom = window.innerHeight - rect.bottom;
		const newRight = Math.min(
			Math.max(currentRight + (Math.random() * 2 - 1) * CLICK_COUNTER_HOP_RANGE_PX, margin),
			maxRight
		);
		const newBottom = Math.min(
			Math.max(currentBottom + (Math.random() * 2 - 1) * CLICK_COUNTER_HOP_RANGE_PX, margin),
			maxBottom
		);
		if (Math.abs(newRight - currentRight) > 1) this.facingLeft = newRight > currentRight;

		this.isClickHopping = true;
		if (!this.pack) this.playPlaceholder("jump");
		this.containerEl.addClass("sm-tween");
		this.containerEl.style.transitionDuration = `${CLICK_COUNTER_HOP_DURATION_MS}ms`;
		this.containerEl.style.right = `${newRight}px`;
		this.containerEl.style.bottom = `${newBottom}px`;

		this.clearTimer("wanderTimer");
		this.wanderTimer = window.setTimeout(() => {
			this.containerEl.removeClass("sm-tween");
			this.containerEl.style.transitionDuration = "";
			this.isClickHopping = false;
			this.settings.posX = newRight;
			this.settings.posY = newBottom;
			this.callbacks.onPositionChange(this.settings.posX, this.settings.posY);
			if (this.currentTrigger === "idle") this.setReaction("idle");
		}, CLICK_COUNTER_HOP_DURATION_MS);
	}

	// ---------- dragging & click ----------

	private onPointerDown(e: PointerEvent): void {
		if (e.pointerType === "mouse" && e.button !== 0) return;
		// Stops the WebView from turning this into a page-scroll/callout gesture on touch.
		e.preventDefault();

		// Grabbing mid-flight (or mid-roam) cancels whatever was moving it and
		// picks up dragging from exactly where it is right now.
		this.clearTimer("wanderTimer");
		this.containerEl.removeClass("sm-tween");
		this.containerEl.style.transitionDuration = "";
		this.stopFling();
		this.isClickHopping = false;
		this.applyEdgeOrientation(null);

		this.isDragging = true;
		this.dragMoved = false;
		this.dragPointerType = e.pointerType;
		this.dragStart = { x: e.clientX, y: e.clientY };
		const rect = this.containerEl.getBoundingClientRect();
		this.dragPointerOffset = { x: e.clientX - rect.left, y: e.clientY - rect.top };
		this.dragRectWidth = rect.width;
		this.dragRectHeight = rect.height;
		this.followRight = window.innerWidth - rect.right;
		this.followBottom = window.innerHeight - rect.bottom;
		this.dragTargetRight = this.followRight;
		this.dragTargetBottom = this.followBottom;
		this.velocityRight = 0;
		this.velocityBottom = 0;

		// Added/removed per gesture (rather than always-on with pointer capture)
		// so a mouse drag tracks the cursor as directly and immediately as
		// possible - pointer capture measurably added a step of indirection.
		window.addEventListener("pointermove", this.boundPointerMove);
		window.addEventListener("pointerup", this.boundPointerUp);
		window.addEventListener("pointercancel", this.boundPointerCancel);
		this.startFollowLoop();
	}

	private onPointerMove(e: PointerEvent): void {
		if (!this.isDragging) return;
		const dx = e.clientX - this.dragStart.x;
		const dy = e.clientY - this.dragStart.y;
		// Touch needs a bit of a dead-zone to tell a tap from a drag; a mouse
		// doesn't, and a dead-zone there just reads as sluggish.
		const threshold = this.dragPointerType === "mouse" ? 2 : DRAG_THRESHOLD_PX;
		if (Math.abs(dx) + Math.abs(dy) > threshold) this.dragMoved = true;
		if (!this.dragMoved) return;

		// Just updates where the leash is pulling toward - the follow loop
		// (rAF) is what actually moves the character each frame, easing
		// toward this target rather than snapping straight to it.
		const left = e.clientX - this.dragPointerOffset.x;
		const top = e.clientY - this.dragPointerOffset.y;
		this.dragTargetRight = window.innerWidth - left - this.dragRectWidth;
		this.dragTargetBottom = window.innerHeight - top - this.dragRectHeight;
	}

	private onPointerUp(_e: PointerEvent): void {
		this.detachDragListeners();
		if (!this.isDragging) return;
		this.isDragging = false;

		if (this.dragMoved) {
			this.startFling();
		} else {
			this.lastActivity = Date.now();
			if (this.settings.clickCounterEnabled) {
				this.registerClickCounterClick();
			} else {
				this.setReaction("poke");
				this.registerProvocation();
			}
		}
	}

	/** A touch drag can be cancelled mid-gesture by the OS (incoming call, edge-swipe, etc). */
	private onPointerCancel(_e: PointerEvent): void {
		this.detachDragListeners();
		this.isDragging = false;
	}

	private detachDragListeners(): void {
		window.removeEventListener("pointermove", this.boundPointerMove);
		window.removeEventListener("pointerup", this.boundPointerUp);
		window.removeEventListener("pointercancel", this.boundPointerCancel);
	}

	/** Eases followRight/Bottom toward dragTargetRight/Bottom every frame while dragging - the "leash" feel. */
	private startFollowLoop(): void {
		if (this.followRafId !== null) return;
		this.lastFrameTime = performance.now();
		const step = (now: number) => {
			if (!this.isDragging) {
				this.followRafId = null;
				return;
			}
			const dt = Math.min((now - this.lastFrameTime) / 1000, 0.05);
			this.lastFrameTime = now;

			const factor = 1 - Math.exp(-FOLLOW_RATE_PER_SEC * dt);
			const prevRight = this.followRight;
			const prevBottom = this.followBottom;
			this.followRight += (this.dragTargetRight - this.followRight) * factor;
			this.followBottom += (this.dragTargetBottom - this.followBottom) * factor;
			if (dt > 0) {
				this.velocityRight = (this.followRight - prevRight) / dt;
				this.velocityBottom = (this.followBottom - prevBottom) / dt;
			}
			if (Math.abs(this.followRight - prevRight) > 0.3) this.facingLeft = this.followRight > prevRight;

			this.renderFollowPosition();
			this.followRafId = window.requestAnimationFrame(step);
		};
		this.followRafId = window.requestAnimationFrame(step);
	}

	private stopFollowLoop(): void {
		if (this.followRafId !== null) window.cancelAnimationFrame(this.followRafId);
		this.followRafId = null;
	}

	/** Clamps followRight/Bottom to stay on screen and writes it to the container's style. */
	private renderFollowPosition(): void {
		const margin = 4;
		const maxRight = Math.max(margin, window.innerWidth - this.dragRectWidth - margin);
		const maxBottom = Math.max(margin, window.innerHeight - this.dragRectHeight - margin);
		this.followRight = Math.min(Math.max(this.followRight, margin), maxRight);
		this.followBottom = Math.min(Math.max(this.followBottom, margin), maxBottom);
		this.containerEl.style.right = `${this.followRight}px`;
		this.containerEl.style.bottom = `${this.followBottom}px`;
	}

	/** Launches the character with the velocity it was dragging at when released - a flick sends it flying. */
	private startFling(): void {
		this.stopFollowLoop();
		const speed = Math.hypot(this.velocityRight, this.velocityBottom);
		if (speed < FLING_MIN_SPEED_PX_S) {
			this.settlePosition();
			return;
		}
		if (speed > FLING_MAX_LAUNCH_SPEED_PX_S) {
			const scale = FLING_MAX_LAUNCH_SPEED_PX_S / speed;
			this.velocityRight *= scale;
			this.velocityBottom *= scale;
		}
		this.registerProvocation(); // a real throw, not just a gentle reposition drag

		this.isFlinging = true;
		if (!this.pack) this.playPlaceholder("jump");
		this.flingStartTime = performance.now();
		this.lastFrameTime = this.flingStartTime;
		const step = (now: number) => {
			const dt = Math.min((now - this.lastFrameTime) / 1000, 0.05);
			this.lastFrameTime = now;

			this.followRight += this.velocityRight * dt;
			this.followBottom += this.velocityBottom * dt;
			const decay = Math.exp(-FLING_FRICTION_PER_SEC * dt);
			this.velocityRight *= decay;
			this.velocityBottom *= decay;

			const margin = 4;
			const maxRight = Math.max(margin, window.innerWidth - this.dragRectWidth - margin);
			const maxBottom = Math.max(margin, window.innerHeight - this.dragRectHeight - margin);
			if (this.followRight < margin) {
				this.followRight = margin;
				this.velocityRight *= -FLING_BOUNCE_DAMPING;
			} else if (this.followRight > maxRight) {
				this.followRight = maxRight;
				this.velocityRight *= -FLING_BOUNCE_DAMPING;
			}
			if (this.followBottom < margin) {
				this.followBottom = margin;
				this.velocityBottom *= -FLING_BOUNCE_DAMPING;
			} else if (this.followBottom > maxBottom) {
				this.followBottom = maxBottom;
				this.velocityBottom *= -FLING_BOUNCE_DAMPING;
			}
			this.containerEl.style.right = `${this.followRight}px`;
			this.containerEl.style.bottom = `${this.followBottom}px`;

			const curSpeed = Math.hypot(this.velocityRight, this.velocityBottom);
			const elapsed = now - this.flingStartTime;
			if (curSpeed < FLING_MIN_SPEED_PX_S || elapsed > FLING_MAX_DURATION_MS) {
				this.flingRafId = null;
				this.isFlinging = false;
				this.settlePosition();
				if (this.currentTrigger === "idle") this.setReaction("idle");
				return;
			}
			this.flingRafId = window.requestAnimationFrame(step);
		};
		this.flingRafId = window.requestAnimationFrame(step);
	}

	private stopFling(): void {
		if (this.flingRafId !== null) window.cancelAnimationFrame(this.flingRafId);
		this.flingRafId = null;
		this.isFlinging = false;
	}

	private settlePosition(): void {
		this.settings.posX = this.followRight;
		this.settings.posY = this.followBottom;
		this.callbacks.onPositionChange(this.settings.posX, this.settings.posY);
	}

	/** Orientation change, window resize, or an on-screen keyboard popping up: rescale and re-clamp position. */
	private onViewportResize(): void {
		this.applySize(this.settings.size);
		// The placeholder character rescales for free via the --sm-size CSS
		// var; a sprite pack/atlas needs its frame dimensions recomputed.
		if (this.pack) this.setReaction(this.currentTrigger);

		const rect = this.containerEl.getBoundingClientRect();
		const maxRight = Math.max(4, window.innerWidth - rect.width - 4);
		const maxBottom = Math.max(4, window.innerHeight - rect.height - 4);
		const right = Math.min(Math.max(parseFloat(this.containerEl.style.right || "0"), 4), maxRight);
		const bottom = Math.min(Math.max(parseFloat(this.containerEl.style.bottom || "0"), 4), maxBottom);

		if (right !== this.settings.posX || bottom !== this.settings.posY) {
			this.containerEl.style.right = `${right}px`;
			this.containerEl.style.bottom = `${bottom}px`;
			this.settings.posX = right;
			this.settings.posY = bottom;
			this.callbacks.onPositionChange(right, bottom);
		}
	}

	// ---------- layout helpers ----------

	private applySize(baseSize: number): void {
		this.containerEl.style.setProperty("--sm-size", `${computeResponsiveSize(baseSize)}px`);
	}

	private applyPosition(posX: number, posY: number): void {
		this.containerEl.style.right = `${posX}px`;
		this.containerEl.style.bottom = `${posY}px`;
	}

	private clearTimer(
		name: "idleTimer" | "moodCheckTimer" | "oneShotRevertTimer" | "spriteFrameTimer" | "wanderTimer" | "sequenceStepTimer"
	): void {
		const id = this[name];
		if (id !== null) {
			window.clearTimeout(id);
			window.clearInterval(id);
			this[name] = null as any;
		}
	}
}
