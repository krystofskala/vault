import type { App, TFile } from "obsidian";
import type { Embedder } from "./embeddings";
import { diffIndex, rankRelevant, type IndexedNote } from "./vaultSearch";

/** How much of a note's own text gets embedded and, unmodified, shown to the chat model as
 * retrieved context — one slice serving both purposes rather than tracking two separately
 * truncated copies of the same note. Generous enough to be a genuinely useful chunk of context
 * (a few paragraphs), short enough that a large vault's cache file stays a reasonable size. */
const EXCERPT_CHAR_BUDGET = 1500;
/** How many notes to embed before yielding back to the event loop with a bare setTimeout(0), so
 * a full rebuild over a large vault reads as "working in the background" rather than freezing
 * Obsidian's UI for however long the whole scan takes. */
const BATCH_SIZE = 5;
/** Matches the reasoning `VAULT_EDIT_DEBOUNCE_MS` already sets in main.ts for a different
 * feature watching the same `vault.on("modify")` event: re-embed once edits go quiet, not once
 * per keystroke/autosave tick. */
const REINDEX_DEBOUNCE_MS = 1500;
const INDEX_FILE_NAME = "vault-search-index.json";

export interface VaultSearchStatus {
	indexedCount: number;
	totalCount: number;
	indexing: boolean;
}

/**
 * Owns the on-disk cache of note embeddings and the live search over it. Deliberately not
 * unit-tested directly — see vaultSearch.ts's own doc comment for why: this class is IO glue
 * around that file's pure logic, the same category `ai/providers.ts`'s `sendAiMessage` is
 * already in. Never constructed or called on mobile or with the feature disabled — that decision
 * lives entirely in main.ts, which is the one place that knows about settings and `Platform`.
 */
export class VaultSearchIndex {
	private index = new Map<string, IndexedNote>();
	private loaded = false;
	private indexing = false;
	private dirtyTimers = new Map<string, ReturnType<typeof setTimeout>>();

	constructor(
		private app: App,
		private embedder: Embedder,
		/** A function rather than a plain string: it reads `manifest.dir`, which main.ts only has
		 * once the plugin has actually finished loading. */
		private dataFolder: () => string,
	) {}

	private indexPath(): string {
		return `${this.dataFolder()}/${INDEX_FILE_NAME}`;
	}

	/** For the settings screen's status line — never throws, never triggers a load itself, so
	 * rendering settings can't accidentally kick off IO. */
	status(): VaultSearchStatus {
		return { indexedCount: this.index.size, totalCount: this.app.vault.getMarkdownFiles().length, indexing: this.indexing };
	}

	private async ensureLoaded(): Promise<void> {
		if (this.loaded) return;
		this.loaded = true;
		const path = this.indexPath();
		if (!(await this.app.vault.adapter.exists(path))) return;
		try {
			const raw = JSON.parse(await this.app.vault.adapter.read(path)) as IndexedNote[];
			this.index = new Map(raw.map((n) => [n.path, n]));
		} catch {
			// A corrupt or foreign-format cache file is worth starting over from, not crashing on —
			// the next rebuild() regenerates it from scratch regardless.
			this.index = new Map();
		}
	}

	private async persist(): Promise<void> {
		await this.app.vault.adapter.write(this.indexPath(), JSON.stringify([...this.index.values()]));
	}

	/** Full scan: embeds whatever is new or changed since the cache was last written, drops
	 * entries for notes that no longer exist. Safe to call repeatedly — diffIndex only re-embeds
	 * what actually needs it, so a second call right after the first does almost nothing. */
	async rebuild(): Promise<void> {
		await this.ensureLoaded();
		if (this.indexing) return;
		this.indexing = true;
		try {
			const files = this.app.vault.getMarkdownFiles();
			const { stale, pruned } = diffIndex(
				files.map((f) => ({ path: f.path, mtime: f.stat.mtime })),
				this.index,
			);
			for (const path of pruned) this.index.delete(path);
			const byPath = new Map(files.map((f) => [f.path, f]));
			for (let i = 0; i < stale.length; i += BATCH_SIZE) {
				const batch = stale.slice(i, i + BATCH_SIZE);
				await Promise.all(batch.map((entry) => this.embedOne(byPath.get(entry.path))));
				await new Promise((resolve) => setTimeout(resolve, 0));
			}
			await this.persist();
		} finally {
			this.indexing = false;
		}
	}

	private async embedOne(file: TFile | undefined): Promise<void> {
		if (!file) return;
		const content = await this.app.vault.cachedRead(file);
		const excerpt = content.length > EXCERPT_CHAR_BUDGET ? `${content.slice(0, EXCERPT_CHAR_BUDGET)}…` : content;
		if (!excerpt.trim()) return; // an empty note has nothing to search for or to show
		const embedding = await this.embedder.embed(excerpt);
		this.index.set(file.path, { path: file.path, mtime: file.stat.mtime, excerpt, embedding });
	}

	/** Called from main.ts's existing `vault.on("modify"/"create")` listeners. A stale timer for
	 * the same path is replaced rather than left to also fire, the same "restart the clock on
	 * every edit" shape `VAULT_EDIT_DEBOUNCE_MS` already uses. */
	scheduleReembed(file: TFile): void {
		const existing = this.dirtyTimers.get(file.path);
		if (existing) clearTimeout(existing);
		this.dirtyTimers.set(
			file.path,
			setTimeout(() => {
				this.dirtyTimers.delete(file.path);
				void this.ensureLoaded().then(async () => {
					await this.embedOne(file);
					await this.persist();
				});
			}, REINDEX_DEBOUNCE_MS),
		);
	}

	/** Called from main.ts's existing `vault.on("delete")` listener, and from its `"rename"`
	 * listener for the old path (paired with scheduleReembed for the new one) — a rename is
	 * treated as "forget the old entry, embed fresh under the new path" rather than a special
	 * key-rename case, since renames are rare enough that re-embedding once is not worth the
	 * extra code. */
	forget(path: string): void {
		const timer = this.dirtyTimers.get(path);
		if (timer) {
			clearTimeout(timer);
			this.dirtyTimers.delete(path);
		}
		void this.ensureLoaded().then(async () => {
			if (this.index.delete(path)) await this.persist();
		});
	}

	/** Embeds `query` and returns the topK most relevant already-indexed notes. An empty array
	 * (never a throw) when the index has nothing in it yet — main.ts's chat wrapper is meant to
	 * fail soft into "no extra context" rather than break the chat over this. */
	async search(query: string, topK: number): Promise<IndexedNote[]> {
		await this.ensureLoaded();
		if (this.index.size === 0) return [];
		const queryEmbedding = await this.embedder.embed(query);
		return rankRelevant(queryEmbedding, [...this.index.values()], topK);
	}
}
