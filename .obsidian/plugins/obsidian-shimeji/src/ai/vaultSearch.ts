/**
 * Pure logic for local semantic vault search — deliberately free of Obsidian's `Vault`/`TFile`
 * API and of `embeddings.ts`'s own model, so it can be unit-tested against fake notes and fake
 * vectors with no WASM runtime, no network, and no real files involved. `VaultSearchIndex.ts` is
 * the thin, untested-by-design orchestrator that wires this to the real vault and the real
 * embedder, the same split `ai/providers.ts` already draws between `providerConfigError` (pure,
 * tested) and `sendAiMessage` (thin dispatch, never unit-tested directly).
 */

export interface IndexedNote {
	path: string;
	/** The file's own mtime at the time it was embedded — how staleness is detected, see
	 * diffIndex. Not a content hash: mtime is what the Obsidian API hands over for free with
	 * every file listing, and a note that has not been touched since it was last indexed cannot
	 * have changed underneath that timestamp. */
	mtime: number;
	/** What actually gets embedded, and what gets shown to the chat model as retrieved context —
	 * the same text serves both purposes rather than tracking two separately truncated copies of
	 * the same note (see VaultSearchIndex's own EXCERPT_CHAR_BUDGET). */
	excerpt: string;
	embedding: number[];
}

/**
 * Which files need (re)embedding, and which cached entries no longer correspond to any real
 * file. Pure comparison against whatever the caller already has — no vault access here at all,
 * so a test can hand this two plain arrays/maps and nothing else.
 */
export function diffIndex(files: readonly { path: string; mtime: number }[], index: ReadonlyMap<string, IndexedNote>): { stale: { path: string; mtime: number }[]; pruned: string[] } {
	const filePaths = new Set(files.map((f) => f.path));
	const stale = files.filter((f) => index.get(f.path)?.mtime !== f.mtime);
	const pruned = [...index.keys()].filter((path) => !filePaths.has(path));
	return { stale, pruned };
}

/** Plain dot product, not full cosine similarity — safe because every embedding this plugin ever
 * stores is already L2-normalized (see embeddings.ts's `normalize: true`), which is exactly what
 * makes the two the same number. Ranks every candidate rather than doing anything approximate:
 * a vault search over a few thousand short vectors is a few thousand dot products, well under
 * the cost of the chat request this feeds into. */
export function rankRelevant(queryEmbedding: readonly number[], notes: readonly IndexedNote[], topK: number): IndexedNote[] {
	const dot = (a: readonly number[], b: readonly number[]): number => {
		let sum = 0;
		for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
		return sum;
	};
	return notes
		.map((note) => ({ note, score: dot(queryEmbedding, note.embedding) }))
		.sort((a, b) => b.score - a.score)
		.slice(0, Math.max(0, topK))
		.map((r) => r.note);
}

/**
 * Formats retrieved notes into the block appended to the chat's system prompt — see main.ts's
 * `sendMessage` wrapper. Empty input means nothing worth adding, not an empty-but-present
 * section, so a caller can just always append the result without an extra length check.
 */
export function buildContextBlock(notes: readonly IndexedNote[]): string {
	if (notes.length === 0) return "";
	const sections = notes.map((n) => `### ${n.path}\n${n.excerpt}`).join("\n\n");
	return `\n\nHere are notes from the user's vault that might be relevant to their question. Use them if they help answer it; ignore them if they don't:\n\n${sections}`;
}
