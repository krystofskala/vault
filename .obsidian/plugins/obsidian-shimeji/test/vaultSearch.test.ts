import { describe, expect, it } from "vitest";
import { buildContextBlock, diffIndex, rankRelevant, type IndexedNote } from "../src/ai/vaultSearch";

function note(path: string, embedding: number[], excerpt = `content of ${path}`): IndexedNote {
	return { path, mtime: 0, excerpt, embedding };
}

describe("diffIndex", () => {
	it("marks a file with no index entry at all as stale", () => {
		const { stale, pruned } = diffIndex([{ path: "a.md", mtime: 100 }], new Map());
		expect(stale).toEqual([{ path: "a.md", mtime: 100 }]);
		expect(pruned).toEqual([]);
	});

	it("marks a file stale when its mtime no longer matches the cached entry", () => {
		const index = new Map([["a.md", note("a.md", [1, 0], "old content")]]);
		// note()'s own mtime default (0) differs from the file's real mtime here on purpose.
		const { stale } = diffIndex([{ path: "a.md", mtime: 200 }], index);
		expect(stale).toEqual([{ path: "a.md", mtime: 200 }]);
	});

	it("leaves an unchanged file alone", () => {
		const cached = note("a.md", [1, 0]);
		cached.mtime = 100;
		const index = new Map([["a.md", cached]]);
		const { stale, pruned } = diffIndex([{ path: "a.md", mtime: 100 }], index);
		expect(stale).toEqual([]);
		expect(pruned).toEqual([]);
	});

	it("prunes an index entry whose file no longer exists", () => {
		const index = new Map([["gone.md", note("gone.md", [1, 0])]]);
		const { stale, pruned } = diffIndex([], index);
		expect(stale).toEqual([]);
		expect(pruned).toEqual(["gone.md"]);
	});
});

describe("rankRelevant", () => {
	it("ranks the closest vector first", () => {
		const notes = [note("far.md", [0, 1]), note("near.md", [1, 0]), note("mid.md", [0.7, 0.7])];
		const ranked = rankRelevant([1, 0], notes, 3);
		expect(ranked.map((n) => n.path)).toEqual(["near.md", "mid.md", "far.md"]);
	});

	it("slices to topK", () => {
		const notes = [note("a.md", [1, 0]), note("b.md", [0.9, 0.1]), note("c.md", [0, 1])];
		const ranked = rankRelevant([1, 0], notes, 2);
		expect(ranked).toHaveLength(2);
		expect(ranked.map((n) => n.path)).toEqual(["a.md", "b.md"]);
	});

	it("returns nothing for topK of 0, and nothing for an empty note list", () => {
		expect(rankRelevant([1, 0], [note("a.md", [1, 0])], 0)).toEqual([]);
		expect(rankRelevant([1, 0], [], 5)).toEqual([]);
	});
});

describe("buildContextBlock", () => {
	it("returns an empty string for no notes, so a caller can always append the result", () => {
		expect(buildContextBlock([])).toBe("");
	});

	it("includes each note's path and excerpt", () => {
		const block = buildContextBlock([note("folder/a.md", [1], "first note's text"), note("b.md", [1], "second note's text")]);
		expect(block).toContain("folder/a.md");
		expect(block).toContain("first note's text");
		expect(block).toContain("b.md");
		expect(block).toContain("second note's text");
	});
});
