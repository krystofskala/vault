import { env, pipeline, type FeatureExtractionPipeline } from "@huggingface/transformers";

/**
 * Local, in-browser semantic embeddings — the only file in this plugin that touches
 * `@huggingface/transformers` (the maintained successor to `@xenova/transformers`), which is
 * itself the first real runtime dependency this plugin has ever taken on. Everything else in
 * `vaultSearch.ts`/`VaultSearchIndex.ts` depends on the small `Embedder` interface below, not
 * this library directly — the same "pure logic depends on a small interface, one file owns the
 * messy IO" split `ai/providers.ts` already uses for `sendAiMessage`/`providerConfigError`.
 *
 * A small, well-established sentence-embedding model (384-dim), not a generative one — this is
 * the "does this note relate to this question" half of the feature, not the half that writes
 * prose. `device: "wasm"` is forced explicitly rather than left to auto-detection: the package
 * also pulls in `onnxruntime-node` and `sharp` (its Node-native backend and image-preprocessing
 * deps, unused here and irrelevant to a text-only embedding), and Obsidian's desktop app runs in
 * an Electron renderer that could plausibly be misdetected as "Node, not browser" — forcing WASM
 * means those two never get called, which is also why esbuild.config.mjs marks them `external`:
 * a plugin has to run identically on every desktop OS, and WASM is the portable choice a
 * platform-specific native addon is not.
 *
 * NOT independently verifiable from this environment: fetching the model itself requires
 * reaching huggingface.co, which this development sandbox's network policy blocks outright (a
 * proxy-level 403, confirmed via its own status endpoint — not a bug in this code). The pipeline
 * construction and call shape below is exercised as far as the network boundary (confirmed to
 * reach and correctly form the request before being blocked), but the actual download, WASM
 * loading, and real embedding output need verifying live, in a real Obsidian install with normal
 * internet access.
 */
const MODEL_NAME = "Xenova/all-MiniLM-L6-v2";

// Explicit rather than left to the library's own environment auto-detection, so behavior is the
// same regardless of how Obsidian's Electron renderer gets classified: always fetch from the
// Hub, never go looking for local model files first.
env.allowLocalModels = false;
env.allowRemoteModels = true;

export interface Embedder {
	/** A normalized embedding vector for `text` — two calls' outputs are directly comparable by
	 * plain dot product (see vaultSearch.ts's rankRelevant), no separate magnitude to divide out. */
	embed(text: string): Promise<number[]>;
}

/** Loaded once, reused for every call after — the model load itself is what's slow (and, on
 * first use ever, network-dependent), not any individual embedding. */
let pipelinePromise: Promise<FeatureExtractionPipeline> | undefined;

function getPipeline(): Promise<FeatureExtractionPipeline> {
	if (!pipelinePromise) pipelinePromise = pipeline("feature-extraction", MODEL_NAME, { device: "wasm" });
	return pipelinePromise;
}

export class LocalEmbedder implements Embedder {
	async embed(text: string): Promise<number[]> {
		const extractor = await getPipeline();
		// Mean-pooled + normalized is the standard way to turn a sentence-transformer's
		// per-token output into one fixed-size vector for the whole input.
		const output = await extractor(text, { pooling: "mean", normalize: true });
		return Array.from(output.data as ArrayLike<number>);
	}
}
