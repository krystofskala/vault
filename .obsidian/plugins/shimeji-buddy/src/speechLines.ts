/**
 * Parses a plain markdown file of speech lines into per-trigger pools. Each
 * plain line is one thing the buddy can say, tagged with one or more
 * `@trigger-id` markers to say when it's eligible - deliberately `@`, not
 * `#`, since `#` already means something in Obsidian (tags).
 *
 * A handful of markdown constructs are "safe zones" that never become
 * spoken lines, even if they happen to mention an `@tag` as an example -
 * this is a dumb line-scanner, not a real markdown parser, so without this
 * a sentence like "shortcuts: `@happy`, `@bored`..." would otherwise get
 * captured as an actual (garbled) speech line for those triggers:
 *   - blank lines and headings (`#`)
 *   - blockquotes/callouts (`>`) - e.g. a permanent "tag cheat sheet" box
 *   - fenced code blocks (``` ```)
 *   - HTML comments (`<!-- -->`), which Obsidian also hides in Reading view
 *   - inline code spans (`` `...` ``) are stripped from a line before tag
 *     matching, so "the `@happy` tag" only removes the code span, not the
 *     whole line
 */

/** Friendlier alternate spellings for the most commonly-typed trigger ids, so a line can say "@happy" instead of the more technical "@mood:happy". Anything else must match a trigger id exactly - see Settings -> Reactions & actions -> Full action reference. */
export const SPEECH_TAG_ALIASES: Record<string, string> = {
	happy: "mood:happy",
	bored: "mood:bored",
	sleeping: "mood:bored",
	sleep: "sleep",
	angry: "mood:angry",
	normal: "idle",
	idle: "idle",
	poke: "poke",
	poked: "poke",
};

export interface ParsedSpeechLines {
	/** trigger id -> pool of lines tagged for it (a line with N tags appears in N pools). */
	pool: Record<string, string[]>;
	/** How many lines had at least one recognized @tag. */
	taggedLineCount: number;
	/** Non-blank, non-heading lines that had no recognized @tag - surfaced in settings so a typo'd tag isn't a silent no-op. */
	untaggedLines: string[];
}

const TAG_PATTERN = /@([a-zA-Z0-9:_-]+)/g;
const LIST_PREFIX_PATTERN = /^(?:[-*+]|\d+[.)])\s+/;
const TRAILING_SEPARATOR_PATTERN = /[-–—:]\s*$/;
const HTML_COMMENT_PATTERN = /<!--[\s\S]*?-->/g;
const INLINE_CODE_PATTERN = /`[^`\n]*`/g;
const FENCE_PATTERN = /^```/;

export function parseSpeechLinesMarkdown(content: string): ParsedSpeechLines {
	const pool: Record<string, string[]> = {};
	const untaggedLines: string[] = [];
	let taggedLineCount = 0;
	let insideFence = false;

	// HTML comments can span multiple lines, so they're stripped from the
	// whole file up front rather than line by line - also matches how
	// Obsidian itself hides them in Reading view, so they double as a way to
	// leave notes-to-self that vanish outside source/edit mode.
	const withoutComments = content.replace(HTML_COMMENT_PATTERN, "");

	for (const rawLine of withoutComments.split(/\r?\n/)) {
		const trimmed = rawLine.trim();

		if (FENCE_PATTERN.test(trimmed)) {
			insideFence = !insideFence;
			continue;
		}
		if (insideFence) continue;
		// Blank lines, headings, and blockquotes/callouts are structure, not
		// content - never spoken, even if they happen to mention an @tag as
		// an example (a "tag cheat sheet" callout is a common one).
		if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith(">")) continue;

		const line = trimmed.replace(LIST_PREFIX_PATTERN, "").replace(INLINE_CODE_PATTERN, "");

		const tags = new Set<string>();
		const withoutTags = line.replace(TAG_PATTERN, (_match, rawTag: string) => {
			const tag = rawTag.toLowerCase();
			tags.add(SPEECH_TAG_ALIASES[tag] ?? tag);
			return "";
		});
		const text = withoutTags.trim().replace(TRAILING_SEPARATOR_PATTERN, "").trim().replace(/\s+/g, " ");
		if (!text) continue;

		if (tags.size === 0) {
			untaggedLines.push(text);
			continue;
		}
		taggedLineCount++;
		for (const tag of tags) (pool[tag] ??= []).push(text);
	}

	return { pool, taggedLineCount, untaggedLines };
}

/**
 * Starter content for the "create example file" button. Organizes examples
 * by topic under headings - headings, blockquotes/callouts, and HTML
 * comments are all safe zones the parser never treats as speech (see the
 * doc comment above), so this same structure works for a real file: group
 * lines however makes sense to you, keep a cheat sheet visible in a
 * callout, or hide longer notes in a comment.
 */
export function speechLinesTemplate(): string {
	return `# Shimeji Speech

This file is Shimeji's script. Every plain line below is one thing it can
say - tag it with \`@\` plus an action id to say when it's eligible. Group
lines under headings however you like (by mood, by topic, whatever) -
headings, blank lines, and blockquotes are never spoken, only plain lines
with a recognized tag are.

> [!tip] Tag cheat sheet
> **Moods & idle:** \`@happy\` \`@bored\`/\`@sleeping\` \`@angry\` \`@normal\` \`@idle\`
> **Interaction:** \`@poke\`
> **Vault events:** \`@note:open\` \`@note:create\` \`@note:delete\` \`@note:edit\` \`@note:rename\` \`@search:open\`
> **Custom commands:** \`@command:your-command-id\` - see Settings -> Shimeji Buddy -> Reactions & actions -> Full action reference for ids you've added there.
> A line can carry more than one tag, e.g. \`Grrr! @angry @poke\`.

<!-- Text inside a comment like this one is hidden in Reading view too (Obsidian does that natively) - handy for longer notes to yourself without cluttering what you actually see day to day. -->

## Happy

Hurá! @happy
Believe it! @happy
Let's go! @happy

## Bored / sleepy

Zzzz... @bored @sleeping
So... quiet... @bored

## Angry

Grrr! @angry
Hey, cut that out! @angry @poke

## Poke

Hey! @poke
Hehe, that tickles. @poke

## Vault events

Welcome back! @note:open
New page, let's go! @note:create
Aw, it's gone... @note:delete
Nice edit! @note:edit
Ooh, a new name! @note:rename
Hmm, searching... @search:open
`;
}
