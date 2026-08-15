/**
 * A markdown file of things the mascot can say, tagged with the behaviours they belong to.
 *
 * Ported from the shimeji-buddy plugin's `src/speechLines.ts`. The scanner is nearly unchanged —
 * it was already small, pure and careful — but the *vocabulary* is not: buddy's tags were its own
 * invented trigger ids (`@mood:happy`, `@note:open`), and this engine has no such thing. What it
 * has is the pack's own behaviour names, straight out of `behaviors.xml`, so those are the tags.
 * That means the vocabulary is discoverable rather than documented: the plugin knows every legal
 * tag for the loaded character and can list them (see `speechLinesTemplate`).
 *
 * `@` and not `#`, because `#` is already an Obsidian tag and the file is a real note in the vault.
 */

/** Tag (lower-cased) -> the lines carrying it. A line with several tags is in several pools. */
export type SpeechPool = Map<string, string[]>;

export interface ParsedSpeechLines {
	pool: SpeechPool;
	/** Lines that carried at least one tag. */
	taggedLineCount: number;
	/** Non-blank lines outside every safe zone that carried no tag at all. Surfaced in settings,
	 * because the commonest mistake is a typo'd tag, and silence is a terrible way to report it. */
	untaggedLines: string[];
}

const TAG_PATTERN = /@([A-Za-z0-9_-]+)/g;
const LIST_PREFIX_PATTERN = /^(?:[-*+]|\d+[.)])\s+/;
const TRAILING_SEPARATOR_PATTERN = /[-–—:]\s*$/;
const HTML_COMMENT_PATTERN = /<!--[\s\S]*?-->/g;
const INLINE_CODE_PATTERN = /`[^`\n]*`/g;
const FENCE_PATTERN = /^```/;

/**
 * Reads the file into per-tag pools.
 *
 * Several markdown constructs are *safe zones* that never become speech, even when they mention a
 * tag: headings, blockquotes and callouts, fenced code, and HTML comments. Inline code spans are
 * stripped from a line before tags are matched, rather than disqualifying the whole line.
 *
 * This matters more than it looks. The scanner is a line reader, not a markdown parser, so without
 * safe zones a cheat sheet listing the available tags would itself be captured as a pile of
 * garbled speech lines for every behaviour it named — the file would sabotage itself simply by
 * documenting what goes in it. With them, a permanent `> [!tip]` callout of every legal tag is a
 * sensible thing to keep at the top, which is exactly what the generated template does.
 */
export function parseSpeechLines(content: string): ParsedSpeechLines {
	const pool: SpeechPool = new Map();
	const untaggedLines: string[] = [];
	let taggedLineCount = 0;
	let insideFence = false;

	// Comments are stripped from the whole file first, because they can span lines — and because
	// Obsidian hides them in Reading view too, which makes them the natural place for longer
	// notes-to-self that should not clutter the file day to day.
	for (const rawLine of content.replace(HTML_COMMENT_PATTERN, "").split(/\r?\n/)) {
		const trimmed = rawLine.trim();

		if (FENCE_PATTERN.test(trimmed)) {
			insideFence = !insideFence;
			continue;
		}
		if (insideFence) continue;
		if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith(">")) continue;

		const line = trimmed.replace(LIST_PREFIX_PATTERN, "").replace(INLINE_CODE_PATTERN, "");

		const tags = new Set<string>();
		const withoutTags = line.replace(TAG_PATTERN, (_match, rawTag: string) => {
			tags.add(rawTag.toLowerCase());
			return "";
		});
		const text = withoutTags.trim().replace(TRAILING_SEPARATOR_PATTERN, "").trim().replace(/\s+/g, " ");
		if (!text) continue;

		if (tags.size === 0) {
			untaggedLines.push(text);
			continue;
		}
		taggedLineCount++;
		for (const tag of tags) {
			const existing = pool.get(tag);
			if (existing) existing.push(text);
			else pool.set(tag, [text]);
		}
	}

	return { pool, taggedLineCount, untaggedLines };
}

/**
 * The lines eligible when a given behaviour starts: those under the longest tag that is a prefix
 * of the behaviour's name.
 *
 * Prefixes are what make the file writable at all. This pack has 57 behaviours, eight of them some
 * flavour of walking, and nobody is going to tag lines for `WalkLeftAlongFloorAndSit` individually.
 * `@Walk` covers the lot and `@Sit` covers all the sitting.
 *
 * Longest wins rather than pooling every match, so a line written for one specific behaviour gets
 * the moment it was written for instead of competing with twenty general ones. An exact tag needs
 * no special case: a name is a prefix of itself, and the longest one there can be.
 */
export function linesFor(pool: SpeechPool, behaviorName: string): string[] {
	const name = behaviorName.toLowerCase();
	let best: string[] | undefined;
	let bestLength = 0;
	for (const [tag, lines] of pool) {
		if (tag.length <= bestLength || !name.startsWith(tag)) continue;
		best = lines;
		bestLength = tag.length;
	}
	return best ?? [];
}

/** Every tag in the file that no behaviour of the loaded pack could ever match — a typo, or a tag
 * left over from another character. Reported in settings for the same reason untagged lines are:
 * the failure is silence, which is indistinguishable from working. */
export function unmatchedTags(pool: SpeechPool, behaviorNames: string[]): string[] {
	const names = behaviorNames.map((n) => n.toLowerCase());
	return [...pool.keys()].filter((tag) => !names.some((n) => n === tag || n.startsWith(tag))).sort();
}

/**
 * Starter content for the file, seeded with the loaded pack's own behaviour names.
 *
 * Generated rather than hardcoded because the legal tags *are* the pack's behaviours, and a
 * different character has different ones. A cheat sheet written by hand would be wrong for
 * everybody but the pack it was written against.
 */
export function speechLinesTemplate(behaviorNames: string[]): string {
	const cheatSheet = behaviorNames.length > 0 ? behaviorNames.map((n) => `\`@${n}\``).join(" ") : "_(no character loaded yet)_";

	/**
	 * Which example tags to include.
	 *
	 * Filtered against the loaded character where possible, so the starter file does not suggest
	 * tags that character has no behaviour for. But it falls back to writing all of them whenever
	 * that filter would leave nothing — an empty starter file is the worst possible outcome here,
	 * because the file is created exactly once and never rewritten, so a moment of bad timing
	 * during load would leave the mascot permanently, silently mute. A tag that turns out not to
	 * match is merely wrong, and the settings screen says so.
	 */
	const keep = (tags: string[]): string[] => {
		const matching = tags.filter((tag) => behaviorNames.some((b) => b === tag || b.startsWith(tag)));
		return matching.length > 0 ? matching : tags;
	};
	const usableTags = new Set(keep(["Dragged", "Thrown", "Fall", "Walk", "SitDown", "ChaseMouse"]));
	const has = (tag: string): boolean => usableTags.has(tag);

	// Every word of explanation goes inside a callout, and every example line outside one. That is
	// not a stylistic choice: a plain paragraph *is* a speech line as far as the scanner is
	// concerned, so prose sitting loose in the file would be reported back to the user as "these
	// lines have no tag and will never be said" — the generated file would arrive already
	// complaining about itself.
	const out: string[] = [
		"# Shimeji speech",
		"",
		"> [!info] How this works",
		"> Every **plain line** below is something a mascot can say. Tag it with `@` and a",
		"> behaviour name to set when it is eligible, e.g. `Off I go. @Walk`.",
		"> ",
		"> Headings, callouts like this one, code blocks and comments are never spoken, so you",
		"> can write as many notes to yourself as you like.",
		"> ",
		"> A tag also matches any behaviour *starting* with it, so `@Walk` covers every kind of",
		"> walking. The most specific tag wins, and a line can carry several tags.",
		"",
		"> [!tip] Every tag this character understands",
		`> ${cheatSheet}`,
		"",
		"<!-- A comment like this is hidden in Reading view too, so it is a good place for longer",
		"notes to yourself. Nothing in here is ever spoken. -->",
		"",
	];

	const section = (heading: string, lines: Array<[string, string]>): void => {
		const usable = lines.filter(([, tag]) => has(tag));
		if (usable.length === 0) return;
		out.push(`## ${heading}`, "");
		for (const [text, tag] of usable) out.push(`${text} @${tag}`);
		out.push("");
	};

	section("Being handled", [
		["Put me down!", "Dragged"],
		["Hey — hands off.", "Dragged"],
		["Wheeeee!", "Thrown"],
		["Look out below!", "Fall"],
	]);
	section("Pottering about", [
		["Just stretching my legs.", "Walk"],
		["Off I go.", "Walk"],
		["Think I'll sit here a while.", "SitDown"],
		["Wait for me!", "ChaseMouse"],
	]);

	return out.join("\n");
}
