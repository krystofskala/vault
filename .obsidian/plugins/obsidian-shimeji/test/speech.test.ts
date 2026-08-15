import { describe, expect, it } from "vitest";
import { linesFor, parseSpeechLines, speechLinesTemplate, unmatchedTags } from "../src/speech/speechLines";
import { SpeechScheduler } from "../src/speech/SpeechScheduler";

/** A deterministic stand-in for Math.random: hands back the given values in order, then repeats
 * the last one, so a test states exactly the rolls it means. */
function rolls(...values: number[]): () => number {
	let i = 0;
	return () => values[Math.min(i++, values.length - 1)];
}

const OPTS = { chancePercent: 100, perMascotGapMs: 9000, globalGapMs: 2500 };

describe("parseSpeechLines", () => {
	it("pools a line under every tag it carries, and strips the tags from the text", () => {
		const { pool, taggedLineCount } = parseSpeechLines("Put me down! @Dragged @Thrown");
		expect(taggedLineCount).toBe(1);
		expect(pool.get("dragged")).toEqual(["Put me down!"]);
		expect(pool.get("thrown")).toEqual(["Put me down!"]);
	});

	it("matches tags case-insensitively", () => {
		const { pool } = parseSpeechLines("Oof. @dRaGgEd");
		expect(pool.get("dragged")).toEqual(["Oof."]);
	});

	it("reports untagged lines instead of pooling them", () => {
		const { pool, untaggedLines, taggedLineCount } = parseSpeechLines("Hello @Walk\nI forgot my tag");
		expect(taggedLineCount).toBe(1);
		expect(untaggedLines).toEqual(["I forgot my tag"]);
		expect(pool.size).toBe(1);
	});

	it("strips list markers and trailing separators", () => {
		const { pool } = parseSpeechLines("- Off I go — @Walk");
		expect(pool.get("walk")).toEqual(["Off I go"]);
	});

	describe("safe zones", () => {
		// Each of these mentions a tag but must never become speech — otherwise a file that
		// documents its own tags would recite the documentation.
		it("never speaks a heading", () => {
			expect(parseSpeechLines("# Lines for @Walk").pool.size).toBe(0);
		});

		it("never speaks a blockquote or callout, which is where the cheat sheet lives", () => {
			const md = "> [!tip] Tags\n> `@Walk` `@Fall` `@Dragged`";
			expect(parseSpeechLines(md).pool.size).toBe(0);
		});

		it("never speaks fenced code, and resumes afterwards", () => {
			const md = "```\nSample: @Walk\n```\nReal line @Fall";
			const { pool } = parseSpeechLines(md);
			expect(pool.has("walk")).toBe(false);
			expect(pool.get("fall")).toEqual(["Real line"]);
		});

		it("never speaks an HTML comment, even across several lines", () => {
			const md = "<!--\nnote to self about @Walk\n-->\nReal line @Fall";
			const { pool } = parseSpeechLines(md);
			expect(pool.has("walk")).toBe(false);
			expect(pool.get("fall")).toEqual(["Real line"]);
		});

		it("strips an inline code span without discarding the rest of the line", () => {
			// The code span goes; the real tag outside it still counts.
			const { pool } = parseSpeechLines("Tagged with `@Walk` normally @Fall");
			expect(pool.has("walk")).toBe(false);
			expect(pool.get("fall")).toEqual(["Tagged with normally"]);
		});

		it("counts a tag-only line as no line at all", () => {
			expect(parseSpeechLines("@Walk").pool.size).toBe(0);
		});
	});
});

describe("linesFor", () => {
	const { pool } = parseSpeechLines(
		["General walking @Walk", "Along the ceiling @WalkAlongIECeiling", "Sitting @Sit"].join("\n"),
	);

	it("returns an exact match", () => {
		expect(linesFor(pool, "Walk")).toEqual(["General walking"]);
	});

	it("falls back to a tag that prefixes the behaviour name", () => {
		// Nobody is going to tag lines for all 57 behaviours individually; @Walk has to cover the
		// eight different kinds of walking.
		expect(linesFor(pool, "WalkLeftAlongFloorAndSit")).toEqual(["General walking"]);
		expect(linesFor(pool, "SitDown")).toEqual(["Sitting"]);
	});

	it("prefers the longest matching prefix, so a specific line gets its own moment", () => {
		// Both @Walk and @WalkAlongIECeiling match; the specific one must win, or writing it was
		// pointless.
		expect(linesFor(pool, "WalkAlongIECeiling")).toEqual(["Along the ceiling"]);
	});

	it("prefers the longest prefix whichever order the file declares them in", () => {
		// The general tag deliberately comes *last* here. Taking "the last tag that matched"
		// happens to be right when the specific one is written second, so a fixture in that order
		// cannot tell longest-wins from last-wins.
		const { pool: reversed } = parseSpeechLines("Along the ceiling @WalkAlongIECeiling\nGeneral walking @Walk");
		expect(linesFor(reversed, "WalkAlongIECeiling")).toEqual(["Along the ceiling"]);
		expect(linesFor(reversed, "WalkAndSit")).toEqual(["General walking"]);
	});

	it("is silent for a behaviour nothing matches", () => {
		expect(linesFor(pool, "Fall")).toEqual([]);
	});

	it("does not match a tag longer than the behaviour name", () => {
		expect(linesFor(pool, "Wal")).toEqual([]);
	});
});

describe("unmatchedTags", () => {
	it("flags a tag no behaviour could ever match", () => {
		const { pool } = parseSpeechLines("Hi @Walk\nOops @Wlak");
		expect(unmatchedTags(pool, ["Walk", "WalkAndSit", "Fall"])).toEqual(["wlak"]);
	});

	it("accepts a tag that only matches as a prefix", () => {
		const { pool } = parseSpeechLines("Hi @Walk");
		expect(unmatchedTags(pool, ["WalkAlongIECeiling"])).toEqual([]);
	});
});

describe("speechLinesTemplate", () => {
	it("lists the loaded character's own behaviour names, since those are the legal tags", () => {
		const md = speechLinesTemplate(["Fall", "SitDown", "WalkAlongIECeiling"]);
		expect(md).toContain("`@WalkAlongIECeiling`");
		expect(md).toContain("`@SitDown`");
	});

	it("parses back to real lines rather than reciting its own documentation", () => {
		// The template is the first thing anyone reads, and it explains the tags by naming them.
		// If the safe zones were wrong, it would parse as a heap of nonsense speech.
		const parsed = parseSpeechLines(speechLinesTemplate(["Fall", "Dragged", "Thrown", "SitDown", "Walk", "ChaseMouse"]));
		expect(parsed.untaggedLines).toEqual([]);
		expect(parsed.taggedLineCount).toBeGreaterThan(0);
		// Every tag it produced is a real behaviour name, not a fragment of the prose around it.
		expect(unmatchedTags(parsed.pool, ["Fall", "Dragged", "Thrown", "SitDown", "Walk", "ChaseMouse"])).toEqual([]);
	});

	it("copes with no character loaded", () => {
		expect(() => parseSpeechLines(speechLinesTemplate([]))).not.toThrow();
	});
});

describe("SpeechScheduler", () => {
	const { pool } = parseSpeechLines("Off I go @Walk\nOof @Fall");
	const mascot = () => ({});

	it("stays quiet on the first behaviour it ever sees", () => {
		// Nothing changed — the observer just arrived. Without this, every mascot on screen would
		// speak the instant the plugin loaded.
		const s = new SpeechScheduler(OPTS);
		expect(s.consider(mascot(), "Walk", pool, 0, rolls(0))).toBeUndefined();
	});

	it("speaks when the behaviour changes to one with a line", () => {
		const s = new SpeechScheduler(OPTS);
		const m = mascot();
		s.consider(m, "Fall", pool, 0, rolls(0));
		expect(s.consider(m, "Walk", pool, 10_000, rolls(0))).toBe("Off I go");
	});

	it("stays quiet while the same behaviour keeps running", () => {
		const s = new SpeechScheduler(OPTS);
		const m = mascot();
		s.consider(m, "Fall", pool, 0, rolls(0));
		expect(s.consider(m, "Walk", pool, 10_000, rolls(0))).toBe("Off I go");
		expect(s.consider(m, "Walk", pool, 30_000, rolls(0))).toBeUndefined();
	});

	it("stays quiet for a behaviour with nothing written for it", () => {
		const s = new SpeechScheduler(OPTS);
		const m = mascot();
		s.consider(m, "Walk", pool, 0, rolls(0));
		expect(s.consider(m, "ClimbWall", pool, 10_000, rolls(0))).toBeUndefined();
	});

	it("holds its tongue until the mascot's own gap has passed", () => {
		const s = new SpeechScheduler(OPTS);
		const m = mascot();
		s.consider(m, "Fall", pool, 0, rolls(0));
		expect(s.consider(m, "Walk", pool, 10_000, rolls(0))).toBe("Off I go");
		// 3s later: past the global gap, well short of the per-mascot one.
		expect(s.consider(m, "Fall", pool, 13_000, rolls(0))).toBeUndefined();
		expect(s.consider(m, "Walk", pool, 22_001, rolls(0))).toBe("Off I go");
	});

	it("does not let two mascots talk over each other", () => {
		const s = new SpeechScheduler(OPTS);
		const a = mascot();
		const b = mascot();
		s.consider(a, "Fall", pool, 0, rolls(0));
		s.consider(b, "Fall", pool, 0, rolls(0));
		expect(s.consider(a, "Walk", pool, 10_000, rolls(0))).toBe("Off I go");
		// b has its own untouched per-mascot gap, but the global one still applies.
		expect(s.consider(b, "Walk", pool, 10_100, rolls(0))).toBeUndefined();
		// ...and it can speak again once the global gap has passed and it does something new.
		expect(s.consider(b, "Fall", pool, 12_501, rolls(0))).toBe("Oof");
	});

	it("does not owe a suppressed line later — the moment it belonged to has passed", () => {
		// A remark is about *starting* to do something. If a cooldown swallows it, the mascot is
		// already doing that thing, and saying it several seconds late would be worse than silence.
		const s = new SpeechScheduler(OPTS);
		const m = mascot();
		s.consider(m, "Fall", pool, 0, rolls(0));
		expect(s.consider(m, "Walk", pool, 10_000, rolls(0))).toBe("Off I go");
		expect(s.consider(m, "Fall", pool, 11_000, rolls(0))).toBeUndefined(); // inside both gaps
		// Still falling much later: nothing new happened, so there is nothing to say.
		expect(s.consider(m, "Fall", pool, 60_000, rolls(0))).toBeUndefined();
	});

	it("respects the chance, and a failed roll does not start a cooldown", () => {
		// A shy setting must not also be a slow one: if a lost roll consumed the quiet period, a
		// low chance would suppress far more than its own percentage.
		const s = new SpeechScheduler({ ...OPTS, chancePercent: 50 });
		const m = mascot();
		s.consider(m, "Fall", pool, 0, rolls(0));
		expect(s.consider(m, "Walk", pool, 10_000, rolls(0.9))).toBeUndefined();
		expect(s.consider(m, "Fall", pool, 12_600, rolls(0.1))).toBe("Oof");
	});

	it("does not spend a roll on a behaviour that has no lines", () => {
		// The chance is about how often the mascot pipes up when it *has* something to say. If the
		// dice were thrown before checking the pool, the 50-odd behaviours with nothing written for
		// them would each burn a roll, and the effective chattiness would be far below the setting.
		//
		// One rng shared across both calls, so the second one's roll depends on whether the first
		// consumed anything: 0.9 fails at 50%, 0.1 passes.
		const s = new SpeechScheduler({ ...OPTS, chancePercent: 50 });
		const m = mascot();
		const rng = rolls(0.9, 0.1, 0);
		s.consider(m, "Fall", pool, 0, rng);
		expect(s.consider(m, "ClimbWall", pool, 10_000, rng)).toBeUndefined(); // nothing written
		expect(s.consider(m, "Walk", pool, 20_000, rng)).toBeUndefined(); // still on the 0.9
	});

	it("never speaks at zero chance", () => {
		const s = new SpeechScheduler({ ...OPTS, chancePercent: 0 });
		const m = mascot();
		s.consider(m, "Fall", pool, 0, rolls(0));
		expect(s.consider(m, "Walk", pool, 10_000, rolls(0))).toBeUndefined();
	});

	it("ignores a mascot with no behaviour at all", () => {
		const s = new SpeechScheduler(OPTS);
		expect(s.consider(mascot(), undefined, pool, 0, rolls(0))).toBeUndefined();
	});

	it("picks within the pool for the behaviour", () => {
		const { pool: many } = parseSpeechLines("One @Walk\nTwo @Walk\nThree @Walk");
		const s = new SpeechScheduler(OPTS);
		const m = mascot();
		s.consider(m, "Fall", many, 0, rolls(0));
		// Second roll picks the line: 0.99 lands on the last of three.
		expect(s.consider(m, "Walk", many, 10_000, rolls(0, 0.99))).toBe("Three");
	});
});
