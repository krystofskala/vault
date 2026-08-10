import type { App } from "obsidian";
import type { ShimejiSettings } from "./settings";
import { pickWeighted, type LoadedSpritePack, type ResolvedAnimation } from "./spritePack";

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
	| "sleep"
	| "punch"
	| "pushup"
	| "squat"
	| "lift";

const LOOPING_POSES: ReadonlySet<BuiltinPose> = new Set(["idle", "walk", "run", "jump", "sleep"]);

/** Occasional idle-time exercise poses, picked instead of a plain idle bob - builtin placeholder only. */
const WORKOUT_TRIGGERS = ["idle:punch", "idle:pushup", "idle:squat", "idle:lift"];

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
};

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
// speed, so they use the walk pace.
const GAIT_SPEED_PX_PER_SEC: Record<"walk" | "run" | "jump", number> = {
	walk: 200,
	run: 440,
	jump: 260,
};
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

/** A point at fractional distance `t` (wraps, can exceed [0,1)) clockwise around a region's inset perimeter, or null if the region's too small to walk. */
function pointOnRegionPerimeter(
	region: DOMRect,
	charWidth: number,
	charHeight: number,
	t: number,
	margin: number
): { left: number; top: number } | null {
	const left = region.left + margin;
	const top = region.top + margin;
	const right = region.right - margin - charWidth;
	const bottom = region.bottom - margin - charHeight;
	const topLen = Math.max(0, right - left);
	const sideLen = Math.max(0, bottom - top);
	const perimeter = 2 * topLen + 2 * sideLen;
	if (perimeter <= 0) return null;

	const s = (((t % 1) + 1) % 1) * perimeter;
	if (s < topLen) return { left: left + s, top };
	if (s < topLen + sideLen) return { left: right, top: top + (s - topLen) };
	if (s < topLen * 2 + sideLen) return { left: right - (s - topLen - sideLen), top: bottom };
	return { left, top: bottom - (s - topLen * 2 - sideLen) };
}

export interface CharacterWidgetCallbacks {
	onPositionChange: (posX: number, posY: number) => void;
}

export class CharacterWidget {
	private containerEl: HTMLElement;
	private charEl!: HTMLElement;
	private spriteStageEl!: HTMLElement;
	private spriteFrameEl!: HTMLElement;
	private bubbleEl!: HTMLElement;

	private app: App;
	private settings: ShimejiSettings;
	private callbacks: CharacterWidgetCallbacks;
	private pack: LoadedSpritePack | null = null;

	/** The trigger id currently being displayed - "idle" covers both resting and roaming. */
	private currentTrigger = "idle";
	private facingLeft = false;

	private idleTimer: number | null = null;
	private sleepCheckTimer: number | null = null;
	private oneShotRevertTimer: number | null = null;
	private spriteFrameTimer: number | null = null;
	private wanderTimer: number | null = null;

	/** Forces click-through regardless of the user's own setting - e.g. mobile edit-view lockout. */
	private autoClickThrough = false;

	/** State for "stick to window edges" roaming - which workspace region is being patrolled and how far around its perimeter. */
	private patrolRegionIndex = 0;
	private perimeterT = Math.random();
	private perimeterDirection: 1 | -1 = 1;

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
		this.applySize(settings.size);
		this.applyPosition(settings.posX, settings.posY);
		this.setReaction("idle");
		this.startSleepWatcher();
		window.addEventListener("resize", this.boundResize);
	}

	private buildDom(): HTMLElement {
		const container = document.body.createDiv({ cls: "sm-container" });

		const shadow = container.createDiv({ cls: "sm-shadow" });
		void shadow;

		const char = container.createDiv({ cls: "sm-char sm-state-idle" });
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

		// Sprite-pack frame layer, hidden unless a custom pack is active. The
		// stage is sized to an animation's largest frame and stays put; the
		// frame inside it is bottom-center anchored so frames of differing
		// size (common on hand-packed/modular sheets) don't jitter around.
		const spriteStage = container.createDiv({ cls: "sm-spritestage" });
		this.spriteStageEl = spriteStage;
		const spriteFrame = spriteStage.createDiv({ cls: "sm-spriteframe" });
		this.spriteFrameEl = spriteFrame;

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

	updateSettings(settings: ShimejiSettings): void {
		this.settings = settings;
		this.updateClickThroughClass();
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

	destroy(): void {
		this.clearTimer("idleTimer");
		this.clearTimer("sleepCheckTimer");
		this.clearTimer("oneShotRevertTimer");
		this.clearTimer("spriteFrameTimer");
		this.clearTimer("wanderTimer");
		window.removeEventListener("resize", this.boundResize);
		this.detachDragListeners();
		this.stopFollowLoop();
		this.stopFling();
		this.containerEl.remove();
	}

	// ---------- reaction / animation core ----------

	private setReaction(trigger: string, message?: string): void {
		this.currentTrigger = trigger;
		this.clearTimer("oneShotRevertTimer");

		const pool = this.pack?.bySlot[trigger];
		const chosen = pool && pool.length > 0 ? pickWeighted(pool) : null;

		if (chosen) {
			this.playResolvedAnimation(chosen, () => {
				if (this.currentTrigger === trigger) this.setReaction("idle");
			});
		} else if (this.pack) {
			// Pack active but nothing assigned to this trigger: fall back to its
			// idle pool (a resting entry if one exists), else the placeholder.
			const idlePool = this.pack.bySlot.idle ?? [];
			const restingIdle = idlePool.filter((c) => !c.moves);
			const idleChosen = pickWeighted(restingIdle.length > 0 ? restingIdle : idlePool);
			if (idleChosen) this.playResolvedAnimation(idleChosen, () => {});
			else this.playBuiltinForTrigger(trigger);
		} else {
			this.playBuiltinForTrigger(trigger);
		}

		if (message && this.settings.speechBubbleEnabled) this.showBubble(message);
	}

	/** Renders the trigger's built-in placeholder pose and, unless it loops, schedules the revert to idle. */
	private playBuiltinForTrigger(trigger: string): void {
		const pose = BUILTIN_POSE_FOR_TRIGGER[trigger] ?? "idle";
		this.playPlaceholder(pose);
		if (!LOOPING_POSES.has(pose)) {
			const duration = PLACEHOLDER_DURATIONS[pose] || 600;
			this.oneShotRevertTimer = window.setTimeout(() => {
				if (this.currentTrigger === trigger) this.setReaction("idle");
			}, duration);
		}
	}

	private playPlaceholder(pose: BuiltinPose): void {
		this.spriteStageEl.style.display = "none";
		this.charEl.style.display = "";
		this.charEl.className = `sm-char sm-state-${pose}${this.facingLeft ? " sm-facing-left" : ""}`;
	}

	private playResolvedAnimation(anim: ResolvedAnimation, onComplete: () => void): void {
		if (anim.frames.length === 0) return;

		this.charEl.style.display = "none";
		this.spriteStageEl.style.display = "";
		this.spriteStageEl.toggleClass("sm-facing-left", this.facingLeft);

		// Frames on hand-packed sheets can vary in size (e.g. a crouch frame
		// shorter than a stand frame). Scale relative to the tallest frame in
		// this animation so the character's overall size stays consistent,
		// and anchor each frame bottom-center within a fixed-size stage so
		// switching frames doesn't make the whole widget jump around.
		const maxFrameHeight = Math.max(...anim.frames.map((f) => f.h));
		const renderedSize = computeResponsiveSize(this.settings.size);
		const scale = maxFrameHeight > 0 ? renderedSize / maxFrameHeight : 1;
		const maxFrameWidth = Math.max(...anim.frames.map((f) => f.w));

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

	// ---------- idle / standby brain ----------

	private restartIdleBrain(): void {
		this.clearTimer("idleTimer");
		this.scheduleNextIdleTick();
	}

	private scheduleNextIdleTick(): void {
		const { idleMinSeconds, idleMaxSeconds } = this.settings;
		const min = Math.max(2, idleMinSeconds);
		const max = Math.max(min + 1, idleMaxSeconds);
		const delay = (min + Math.random() * (max - min)) * 1000;
		this.idleTimer = window.setTimeout(() => this.idleTick(), delay);
	}

	private idleTick(): void {
		this.scheduleNextIdleTick();
		// Never let the standby brain grab position/pose while the user has
		// their hands on the character, or while it's still flying from a
		// throw - it was fighting an active drag for control of
		// style.right/bottom.
		if (this.isDragging || this.isFlinging) return;
		if (this.currentTrigger !== "idle") return;

		if (this.settings.wanderEnabled && Math.random() < 0.35) {
			this.wander();
			return;
		}
		if (!this.pack && Math.random() < 0.25) {
			// A quick workout break - builtin placeholder only (a custom
			// character can still opt in by assigning its own animation to
			// one of these same trigger ids, e.g. "idle:lift").
			const trigger = WORKOUT_TRIGGERS[Math.floor(Math.random() * WORKOUT_TRIGGERS.length)];
			this.setReaction(trigger);
			return;
		}
		// Nudge the placeholder animation to replay its idle keyframe (also
		// picks a fresh random blink phase via CSS restart), or re-roll the
		// pack's idle pool for variety.
		this.setReaction("idle");
	}

	private wander(): void {
		let speed: number;
		let render: () => void;

		if (this.pack) {
			const movable = (this.pack.bySlot.idle ?? []).filter((c) => c.moves);
			const chosen = pickWeighted(movable);
			if (!chosen) return; // nothing to roam with this tick; stay put
			speed = GAIT_SPEED_PX_PER_SEC.walk;
			render = () => {
				this.currentTrigger = "idle";
				this.playResolvedAnimation(chosen, () => {});
			};
		} else {
			const gaits: BuiltinPose[] = ["walk", "run", "jump"];
			const pose = gaits[Math.floor(Math.random() * gaits.length)];
			speed = GAIT_SPEED_PX_PER_SEC[pose as "walk" | "run" | "jump"];
			render = () => {
				this.currentTrigger = "idle";
				this.playPlaceholder(pose);
			};
		}

		const rect = this.containerEl.getBoundingClientRect();
		const { newRight, newBottom } = this.pickWanderDestination(rect);

		const currentRight = window.innerWidth - rect.right;
		const currentBottom = window.innerHeight - rect.bottom;

		const dx = newRight - currentRight;
		const dy = newBottom - currentBottom;
		if (Math.abs(dx) > 1) this.facingLeft = dx > 0; // moving toward the right offset = moving left on screen

		const distance = Math.hypot(dx, dy);
		const duration = Math.min(RUN_MAX_DURATION_MS, Math.max(RUN_MIN_DURATION_MS, (distance / speed) * 1000));

		render();
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
			this.callbacks.onPositionChange(this.settings.posX, this.settings.posY);
			if (this.currentTrigger === "idle") this.setReaction("idle");
		}, duration);
	}

	/** Anywhere on screen by default, or patrolling the sidebar/main-area boundaries when "stick to edges" is on. */
	private pickWanderDestination(rect: DOMRect): { newRight: number; newBottom: number } {
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
					return this.clampDestination(
						window.innerWidth - point.left - rect.width,
						window.innerHeight - point.top - rect.height,
						rect,
						margin
					);
				}
			}
			// No usable region (e.g. window too small) - fall through to free roam this tick.
		}

		const maxRight = Math.max(margin, window.innerWidth - rect.width - margin);
		const maxBottom = Math.max(margin, window.innerHeight - rect.height - margin);
		return {
			newRight: margin + Math.random() * (maxRight - margin),
			newBottom: margin + Math.random() * (maxBottom - margin),
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

	// ---------- sleep watcher ----------

	private startSleepWatcher(): void {
		this.clearTimer("sleepCheckTimer");
		this.sleepCheckTimer = window.setInterval(() => {
			if (this.currentTrigger !== "idle") return;
			const idleMs = Date.now() - this.lastActivity;
			if (idleMs > this.settings.sleepAfterMinutes * 60_000) {
				this.setReaction("sleep");
			}
		}, 15_000);
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
			const lines = this.settings.speechLines.poke;
			const line = lines.length ? lines[Math.floor(Math.random() * lines.length)] : undefined;
			this.setReaction("poke", line);
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
		name: "idleTimer" | "sleepCheckTimer" | "oneShotRevertTimer" | "spriteFrameTimer" | "wanderTimer"
	): void {
		const id = this[name];
		if (id !== null) {
			window.clearTimeout(id);
			window.clearInterval(id);
			this[name] = null as any;
		}
	}
}
