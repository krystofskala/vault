import type { Mascot } from "../engine/Mascot";
import { SpeechScheduler, type SpeechOptions } from "./SpeechScheduler";
import type { SpeechPool } from "./speechLines";
import { DEFAULT_VAULT_REACTION_OPTIONS } from "./vaultReactions";

/** How long a line stays up. Long enough to read a short sentence, short enough not to follow the
 * mascot halfway across the window. */
const BUBBLE_MS = 3600;
/** Gap between the top of the sprite and the bottom of the bubble. */
const BUBBLE_OFFSET_PX = 8;

export type BubbleStyle = "theme" | "comic";

/**
 * Draws what the mascots say.
 *
 * Bubbles live in their own fixed layer on `document.body` rather than inside the mascot's element,
 * for two reasons. The sprite's element is exactly sprite-sized and its inner box is mirrored to
 * face the mascot's direction — a bubble inside it would be clipped, and its text would come out
 * backwards half the time. And a fixed layer above the room's foreground means a line is still
 * readable when the mascot is sitting behind the office desk.
 *
 * Purely an observer: it reads each mascot's current behaviour every frame and never tells the
 * engine anything. That is why adding speech needed no engine change at all.
 */
export class SpeechBubbles {
	private layer: HTMLDivElement;
	private bubbles = new Map<Mascot, { el: HTMLDivElement; until: number }>();
	private scheduler: SpeechScheduler;
	private pool: SpeechPool = new Map();
	private style: BubbleStyle = "theme";
	private enabled = true;

	constructor(options: SpeechOptions, private rng: () => number = Math.random) {
		this.scheduler = new SpeechScheduler(options);
		this.layer = document.createElement("div");
		this.layer.className = "shimeji-speech-layer";
		document.body.appendChild(this.layer);
	}

	setPool(pool: SpeechPool): void {
		this.pool = pool;
	}

	setOptions(options: SpeechOptions): void {
		this.scheduler.setOptions(options);
		this.scheduler.reset();
	}

	setStyle(style: BubbleStyle): void {
		this.style = style;
		for (const { el } of this.bubbles.values()) el.toggleClass("shimeji-bubble-comic", style === "comic");
	}

	setEnabled(enabled: boolean): void {
		this.enabled = enabled;
		if (!enabled) this.clear();
	}

	/** Says something immediately, whatever the cooldowns — the "try a line" button in settings. */
	say(mascot: Mascot, text: string): void {
		this.show(mascot, text);
	}

	/**
	 * Offers a vault event (a note opened, created, deleted, renamed, or edited — see
	 * `vaultReactions.ts`) to the scheduler, cooldown-gated same as ordinary behaviour speech but
	 * kept on its own separate cooldown so one kind of remark never silently uses up the other's
	 * turn. Called once per eligible mascot per event, from main.ts's own vault-event listeners —
	 * this class still never reaches back into the engine to find out anything for itself.
	 */
	announceEvent(mascot: Mascot, triggerId: string): void {
		if (!this.enabled || this.pool.size === 0) return;
		const line = this.scheduler.considerEvent(mascot, triggerId, this.pool, performance.now(), this.rng, DEFAULT_VAULT_REACTION_OPTIONS);
		if (line) this.show(mascot, line);
	}

	/**
	 * One frame: offer every mascot's behaviour to the scheduler, then reposition and expire what
	 * is on screen. Called from the plugin's existing loop rather than owning one of its own.
	 */
	tick(mascots: readonly Mascot[]): void {
		const now = performance.now();

		if (this.enabled && this.pool.size > 0) {
			for (const mascot of mascots) {
				const line = this.scheduler.consider(mascot, mascot.currentBehaviorName, this.pool, now, this.rng);
				if (line) this.show(mascot, line);
			}
		}

		const live = new Set(mascots);
		for (const [mascot, bubble] of this.bubbles) {
			// A mascot that has been removed takes its bubble with it, rather than leaving it
			// floating where the mascot used to be.
			if (now >= bubble.until || !live.has(mascot)) {
				bubble.el.remove();
				this.bubbles.delete(mascot);
				continue;
			}
			this.position(mascot, bubble.el);
		}
	}

	private show(mascot: Mascot, text: string): void {
		const existing = this.bubbles.get(mascot);
		const el = existing?.el ?? this.layer.createDiv({ cls: "shimeji-bubble" });
		el.setText(text);
		el.toggleClass("shimeji-bubble-comic", this.style === "comic");
		this.bubbles.set(mascot, { el, until: performance.now() + BUBBLE_MS });
		this.position(mascot, el);
	}

	/**
	 * Puts the bubble just above the sprite, centred, and keeps it inside the window.
	 *
	 * Measured off the mascot's own element rather than computed from its physics, so this needs to
	 * know nothing about anchors, scaling, or the stage container's offset from the top of the
	 * window — all of which the sprite has already resolved by the time it has a box on screen.
	 */
	private position(mascot: Mascot, el: HTMLElement): void {
		const rect = mascot.el.getBoundingClientRect();
		if (rect.width === 0 && rect.height === 0) {
			// Not laid out — hidden mascot, or a room resident that is currently out of view.
			el.style.visibility = "hidden";
			return;
		}
		el.style.visibility = "";
		const width = el.offsetWidth;
		const centred = rect.left + rect.width / 2 - width / 2;
		const left = Math.max(4, Math.min(centred, window.innerWidth - width - 4));
		el.style.left = `${Math.round(left)}px`;
		el.style.top = `${Math.round(Math.max(4, rect.top - el.offsetHeight - BUBBLE_OFFSET_PX))}px`;
	}

	clear(): void {
		for (const { el } of this.bubbles.values()) el.remove();
		this.bubbles.clear();
	}

	destroy(): void {
		this.clear();
		this.layer.remove();
	}
}
