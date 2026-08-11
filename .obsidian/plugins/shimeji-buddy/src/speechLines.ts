/**
 * Parses a plain markdown file of speech lines into per-trigger pools. Each
 * non-empty, non-heading line is one thing the buddy can say, tagged with
 * one or more `@trigger-id` markers to say when it's eligible - deliberately
 * `@`, not `#`, since `#` already means something in Obsidian (tags). A line
 * with no recognized tag (or a heading, used purely for the file's own
 * organization) is just skipped, not an error.
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

export function parseSpeechLinesMarkdown(content: string): ParsedSpeechLines {
	const pool: Record<string, string[]> = {};
	const untaggedLines: string[] = [];
	let taggedLineCount = 0;

	for (const rawLine of content.split(/\r?\n/)) {
		const trimmed = rawLine.trim();
		if (!trimmed || trimmed.startsWith("#")) continue; // blank lines and markdown headings are just structure
		const line = trimmed.replace(LIST_PREFIX_PATTERN, "");

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

/** Starter content for the "create example file" button - explains the format and covers the most common tags. */
export function speechLinesTemplate(): string {
	return `# Shimeji speech lines

Each line below is one thing Shimeji can say. Tag a line with \`@\` plus an
action id to say when it's eligible - a line can carry more than one tag.
Lines and headings with no recognized \`@tag\` (like this paragraph) are
ignored, so notes and organization are safe to keep in this file.

Friendly shortcuts: @happy, @bored / @sleeping, @angry, @normal, @poke, @idle.
Anything else must match an action id exactly - e.g. @note:open,
@note:create, @search:open, or @command:your-command-id - see Settings ->
Shimeji Buddy -> Reactions & actions -> Full action reference for the
complete list, including any custom commands you've added there.

## Examples

Hurá! @happy
Zzzz... @bored @sleeping
Grrr! @angry @poke
Welcome back! @note:open
New page, let's go! @note:create
Aw, it's gone... @note:delete
Nice edit! @note:edit
Hmm, searching... @search:open
`;
}
