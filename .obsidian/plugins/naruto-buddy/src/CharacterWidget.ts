import { LOOPING_REACTIONS, type NarutoBuddySettings, type ReactionName } from "./settings";
import type { LoadedSpritePack } from "./spritePack";

// How long each built-in placeholder animation runs for, in ms.
// Must stay in sync with the keyframe durations in styles.css.
const PLACEHOLDER_DURATIONS: Record<ReactionName, number> = {
	idle: 0, // looping, no fixed duration
	walk: 0, // looping, driven by the wander tween instead
	sleep: 0, // looping
	wave: 900,
	cheer: 800,
	poof: 700,
	nod: 600,
	surprised: 500,
	think: 1100,
	poke: 400,
};

export interface CharacterWidgetCallbacks {
	onPositionChange: (posX: number, posY: number) => void;
}

export class CharacterWidget {
	private containerEl: HTMLElement;
	private charEl!: HTMLElement;
	private spriteStageEl!: HTMLElement;
	private spriteFrameEl!: HTMLElement;
	private bubbleEl!: HTMLElement;

	private settings: NarutoBuddySettings;
	private callbacks: CharacterWidgetCallbacks;
	private pack: LoadedSpritePack | null = null;

	private currentReaction: ReactionName = "idle";
	private facingLeft = false;

	private idleTimer: number | null = null;
	private sleepCheckTimer: number | null = null;
	private oneShotRevertTimer: number | null = null;
	private spriteFrameTimer: number | null = null;
	private wanderTimer: number | null = null;

	private lastActivity = Date.now();
	private isDragging = false;
	private dragMoved = false;
	private dragStart = { x: 0, y: 0 };
	private dragPointerOffset = { x: 0, y: 0 };

	private boundPointerMove = (e: PointerEvent) => this.onPointerMove(e);
	private boundPointerUp = (e: PointerEvent) => this.onPointerUp(e);

	constructor(settings: NarutoBuddySettings, callbacks: CharacterWidgetCallbacks) {
		this.settings = settings;
		this.callbacks = callbacks;
		this.containerEl = this.buildDom();
		this.applySize(settings.size);
		this.applyPosition(settings.posX, settings.posY);
		this.setReaction("idle");
		this.startSleepWatcher();
	}

	private buildDom(): HTMLElement {
		const container = document.body.createDiv({ cls: "nb-container" });
		if (this.settings.clickThrough) container.addClass("nb-clickthrough");

		const shadow = container.createDiv({ cls: "nb-shadow" });
		void shadow;

		const char = container.createDiv({ cls: "nb-char nb-state-idle" });
		this.charEl = char;

		// Built-in placeholder character, made of plain shapes (not any
		// copyrighted artwork) so the plugin works out of the box.
		char.createDiv({ cls: "nb-headband" });
		const head = char.createDiv({ cls: "nb-head" });
		head.createDiv({ cls: "nb-eye nb-eye-l" });
		head.createDiv({ cls: "nb-eye nb-eye-r" });
		head.createDiv({ cls: "nb-headband-strap" });
		char.createDiv({ cls: "nb-torso" });
		char.createDiv({ cls: "nb-arm nb-arm-l" });
		char.createDiv({ cls: "nb-arm nb-arm-r" });
		char.createDiv({ cls: "nb-leg nb-leg-l" });
		char.createDiv({ cls: "nb-leg nb-leg-r" });
		char.createDiv({ cls: "nb-zzz" });

		// Sprite-pack frame layer, hidden unless a custom pack is active. The
		// stage is sized to an animation's largest frame and stays put; the
		// frame inside it is bottom-center anchored so frames of differing
		// size (common on hand-packed/modular sheets) don't jitter around.
		const spriteStage = container.createDiv({ cls: "nb-spritestage" });
		this.spriteStageEl = spriteStage;
		const spriteFrame = spriteStage.createDiv({ cls: "nb-spriteframe" });
		this.spriteFrameEl = spriteFrame;

		const bubble = container.createDiv({ cls: "nb-bubble" });
		bubble.style.display = "none";
		this.bubbleEl = bubble;

		container.addEventListener("pointerdown", (e) => this.onPointerDown(e));
		container.addEventListener("contextmenu", (e) => e.preventDefault());

		return container;
	}

	// ---------- public API ----------

	setSpritePack(pack: LoadedSpritePack | null): void {
		this.pack = pack;
		this.containerEl.toggleClass("nb-sprite-mode", !!pack);
		this.setReaction(this.currentReaction === "sleep" ? "sleep" : "idle");
	}

	updateSettings(settings: NarutoBuddySettings): void {
		this.settings = settings;
		this.containerEl.toggleClass("nb-clickthrough", settings.clickThrough);
		this.applySize(settings.size);
		this.restartIdleBrain();
	}

	setVisible(visible: boolean): void {
		this.containerEl.style.display = visible ? "" : "none";
		if (visible) this.restartIdleBrain();
		else this.clearTimer("idleTimer");
	}

	startIdleBrain(): void {
		this.restartIdleBrain();
	}

	/** Called from vault/workspace event handlers to react to something the user did. */
	react(name: ReactionName, message?: string): void {
		this.lastActivity = Date.now();
		this.setReaction(name, message);
	}

	destroy(): void {
		this.clearTimer("idleTimer");
		this.clearTimer("sleepCheckTimer");
		this.clearTimer("oneShotRevertTimer");
		this.clearTimer("spriteFrameTimer");
		this.clearTimer("wanderTimer");
		window.removeEventListener("pointermove", this.boundPointerMove);
		window.removeEventListener("pointerup", this.boundPointerUp);
		this.containerEl.remove();
	}

	// ---------- reaction / animation core ----------

	private setReaction(name: ReactionName, message?: string): void {
		this.currentReaction = name;

		if (this.pack?.animations[name]) {
			this.playSprite(name);
		} else if (this.pack) {
			// Sprite pack active but missing this specific animation: fall back
			// to its idle frame (or the placeholder if it has none at all).
			if (this.pack.animations.idle) this.playSprite("idle");
			else this.playPlaceholder(name);
		} else {
			this.playPlaceholder(name);
		}

		if (message && this.settings.speechBubbleEnabled) this.showBubble(message);

		if (!LOOPING_REACTIONS.has(name)) {
			this.clearTimer("oneShotRevertTimer");
			const duration = this.pack?.animations[name]
				? undefined // sprite one-shot completion drives the revert itself
				: PLACEHOLDER_DURATIONS[name] || 600;
			if (duration) {
				this.oneShotRevertTimer = window.setTimeout(() => {
					if (this.currentReaction === name) this.setReaction("idle");
				}, duration);
			}
		}
	}

	private playPlaceholder(name: ReactionName): void {
		this.spriteStageEl.style.display = "none";
		this.charEl.style.display = "";
		this.charEl.className = `nb-char nb-state-${name}${this.facingLeft ? " nb-facing-left" : ""}`;
	}

	private playSprite(name: ReactionName): void {
		if (!this.pack) return;
		const anim = this.pack.animations[name];
		if (!anim || anim.frames.length === 0) return;

		this.charEl.style.display = "none";
		this.spriteStageEl.style.display = "";
		this.spriteStageEl.toggleClass("nb-facing-left", this.facingLeft);

		// Frames on hand-packed sheets can vary in size (e.g. a crouch frame
		// shorter than a stand frame). Scale relative to the tallest frame in
		// this animation so the character's overall size stays consistent,
		// and anchor each frame bottom-center within a fixed-size stage so
		// switching frames doesn't make the whole widget jump around.
		const maxFrameHeight = Math.max(...anim.frames.map((f) => f.h));
		const scale = maxFrameHeight > 0 ? this.settings.size / maxFrameHeight : 1;
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
					if (this.currentReaction === name && !LOOPING_REACTIONS.has(name)) {
						this.setReaction("idle");
					}
					return;
				}
			}
			draw();
		}, 1000 / anim.fps);
	}

	private showBubble(text: string): void {
		this.bubbleEl.setText(text);
		this.bubbleEl.style.display = "";
		window.clearTimeout((this.bubbleEl as any)._nbHideTimer);
		(this.bubbleEl as any)._nbHideTimer = window.setTimeout(() => {
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
		if (this.currentReaction !== "idle" && this.currentReaction !== "walk") return;

		if (this.settings.wanderEnabled && Math.random() < 0.35) {
			this.wander();
		} else {
			// Nudge the placeholder animation to replay its idle keyframe
			// (also picks a fresh random blink phase via CSS restart).
			this.setReaction("idle");
		}
	}

	private wander(): void {
		const maxDelta = 140;
		const deltaX = (Math.random() * 2 - 1) * maxDelta;
		this.facingLeft = deltaX < 0;

		const rect = this.containerEl.getBoundingClientRect();
		const currentRight = window.innerWidth - rect.right;
		let newRight = currentRight - deltaX;
		newRight = Math.min(Math.max(newRight, 8), window.innerWidth - rect.width - 8);

		this.setReaction("walk");
		this.containerEl.addClass("nb-tween");
		this.containerEl.style.right = `${newRight}px`;

		this.clearTimer("wanderTimer");
		this.wanderTimer = window.setTimeout(() => {
			this.containerEl.removeClass("nb-tween");
			this.settings.posX = newRight;
			this.callbacks.onPositionChange(this.settings.posX, this.settings.posY);
			if (this.currentReaction === "walk") this.setReaction("idle");
		}, 1600);
	}

	// ---------- sleep watcher ----------

	private startSleepWatcher(): void {
		this.clearTimer("sleepCheckTimer");
		this.sleepCheckTimer = window.setInterval(() => {
			if (this.currentReaction !== "idle") return;
			const idleMs = Date.now() - this.lastActivity;
			if (idleMs > this.settings.sleepAfterMinutes * 60_000) {
				this.setReaction("sleep");
			}
		}, 15_000);
	}

	// ---------- dragging & click ----------

	private onPointerDown(e: PointerEvent): void {
		if (e.button !== 0) return;
		this.isDragging = true;
		this.dragMoved = false;
		this.dragStart = { x: e.clientX, y: e.clientY };
		const rect = this.containerEl.getBoundingClientRect();
		this.dragPointerOffset = { x: e.clientX - rect.left, y: e.clientY - rect.top };
		window.addEventListener("pointermove", this.boundPointerMove);
		window.addEventListener("pointerup", this.boundPointerUp);
	}

	private onPointerMove(e: PointerEvent): void {
		if (!this.isDragging) return;
		const dx = e.clientX - this.dragStart.x;
		const dy = e.clientY - this.dragStart.y;
		if (Math.abs(dx) + Math.abs(dy) > 5) this.dragMoved = true;
		if (!this.dragMoved) return;

		const rect = this.containerEl.getBoundingClientRect();
		const left = e.clientX - this.dragPointerOffset.x;
		const top = e.clientY - this.dragPointerOffset.y;
		const right = Math.min(
			Math.max(window.innerWidth - left - rect.width, 4),
			window.innerWidth - rect.width - 4
		);
		const bottom = Math.min(
			Math.max(window.innerHeight - top - rect.height, 4),
			window.innerHeight - rect.height - 4
		);
		this.containerEl.style.right = `${right}px`;
		this.containerEl.style.bottom = `${bottom}px`;
	}

	private onPointerUp(_e: PointerEvent): void {
		window.removeEventListener("pointermove", this.boundPointerMove);
		window.removeEventListener("pointerup", this.boundPointerUp);
		this.isDragging = false;

		if (this.dragMoved) {
			const style = this.containerEl.style;
			this.settings.posX = parseFloat(style.right || "0");
			this.settings.posY = parseFloat(style.bottom || "0");
			this.callbacks.onPositionChange(this.settings.posX, this.settings.posY);
		} else {
			this.lastActivity = Date.now();
			const lines = this.settings.speechLines.poke;
			const line = lines.length ? lines[Math.floor(Math.random() * lines.length)] : undefined;
			this.setReaction("poke", line);
		}
	}

	// ---------- layout helpers ----------

	private applySize(size: number): void {
		this.containerEl.style.setProperty("--nb-size", `${size}px`);
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
