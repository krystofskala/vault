import { linesFor, type SpeechPool } from "./speechLines";

/**
 * Decides *whether* a mascot says something, separately from drawing it.
 *
 * Split out from the bubble itself because this is the part with judgement in it — everything the
 * mascot does is a behaviour, behaviours change every few seconds, and a mascot that speaks on
 * every one it has a line for is unbearable within a minute. The three restraints below are what
 * make it an occasional remark rather than a running commentary, and none of them can be checked
 * through the DOM.
 */

export interface SpeechOptions {
	/** How often an eligible behaviour change actually produces a line, 0–100. */
	chancePercent: number;
	/** Minimum quiet time for one mascot between its own lines. */
	perMascotGapMs: number;
	/** Minimum quiet time across all mascots, so a crowd does not talk over itself. */
	globalGapMs: number;
}

export const DEFAULT_SPEECH_OPTIONS: SpeechOptions = {
	chancePercent: 25,
	perMascotGapMs: 9000,
	globalGapMs: 2500,
};

/** Anything with identity — the real caller passes a Mascot, tests pass a plain object. */
type Speaker = object;

export class SpeechScheduler {
	private lastBehavior = new WeakMap<Speaker, string>();
	private lastSpokeAt = new WeakMap<Speaker, number>();
	private lastAnySpokeAt = Number.NEGATIVE_INFINITY;

	constructor(private opts: SpeechOptions = DEFAULT_SPEECH_OPTIONS) {}

	setOptions(opts: SpeechOptions): void {
		this.opts = opts;
	}

	/**
	 * Offers a mascot's current behaviour, and returns a line to say — or undefined for silence.
	 *
	 * Speech is triggered by the behaviour *changing*, not by what it is: the mascot remarks on
	 * starting to do something, and then gets on with it however long it takes.
	 *
	 * The first behaviour ever seen for a mascot is recorded without speaking. Nothing changed —
	 * this is the observer arriving, not the mascot doing something new — and without this every
	 * mascot on screen would pipe up the moment the feature was switched on or the plugin reloaded.
	 */
	consider(mascot: Speaker, behaviorName: string | undefined, pool: SpeechPool, now: number, rng: () => number): string | undefined {
		if (!behaviorName) return undefined;

		const previous = this.lastBehavior.get(mascot);
		this.lastBehavior.set(mascot, behaviorName);
		if (previous === undefined || previous === behaviorName) return undefined;

		// Cooldowns are checked before the dice, so a failed roll does not also burn the quiet
		// period — otherwise a chatty setting would be quieter than a shy one at the same gap.
		if (now - this.lastAnySpokeAt < this.opts.globalGapMs) return undefined;
		if (now - (this.lastSpokeAt.get(mascot) ?? Number.NEGATIVE_INFINITY) < this.opts.perMascotGapMs) return undefined;

		const lines = linesFor(pool, behaviorName);
		if (lines.length === 0) return undefined;
		// Rolled after the pool lookup, so a behaviour with nothing written for it costs nothing
		// and cannot consume the mascot's chance of speaking about the next one.
		if (rng() * 100 >= this.opts.chancePercent) return undefined;

		this.lastSpokeAt.set(mascot, now);
		this.lastAnySpokeAt = now;
		return lines[Math.min(lines.length - 1, Math.floor(rng() * lines.length))];
	}

	/** Forgets the quiet periods — for a settings change that should take effect at once. */
	reset(): void {
		this.lastSpokeAt = new WeakMap();
		this.lastAnySpokeAt = Number.NEGATIVE_INFINITY;
	}
}
