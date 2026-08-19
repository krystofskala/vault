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
 * an Electron renderer that genuinely is misdetected as "Node, not browser" by the library's own
 * environment check — a plugin has to run identically on every desktop OS, and WASM is the
 * portable choice a platform-specific native addon is not.
 *
 * That misdetection used to make this request fail outright ("Unsupported device: 'wasm'"): the
 * library decides which devices even exist, at module load, from the same Node-vs-browser check,
 * before this call's `device: "wasm"` is ever read — under the (correct, for real Node) assumption
 * that Node means the native `onnxruntime-node` addon is available, `wasm` was never a legal
 * device to request at all in that branch. Forcing WASM here couldn't fix that by itself; see
 * esbuild.config.mjs's `define` for what actually corrects the misdetection.
 *
 * Getting a legal device to request still isn't the whole story: once ONNX actually tries to load
 * the WASM runtime itself (not the embedding model — the small engine that runs it), its default
 * path resolution is relative to `import.meta.url`, which this project's CJS bundle output hollows
 * out to an empty object (esbuild's standard shim for `import.meta` under a format that has no
 * real one) — so the unconfigured default silently resolves to a nonsense path. `LocalEmbedder`'s
 * constructor points `env.backends.onnx.wasm.wasmPaths` at the two files esbuild.config.mjs copies
 * into this plugin's own folder for exactly this reason, sidestepping that resolution entirely.
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
/** Must match the filenames esbuild.config.mjs actually copies — see that file's own comment for
 * why only this one (plain, non-jsep/jspi/webgpu) variant ships. */
const WASM_RUNTIME_FILE = "ort-wasm-simd-threaded.wasm";
const WASM_LOADER_FILE = "ort-wasm-simd-threaded.mjs";

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
	/**
	 * `resourceUrl` turns a filename living in this plugin's own folder into something Chromium
	 * will actually fetch — main.ts passes `(name) => this.app.vault.adapter.getResourcePath(...)`,
	 * the exact same mechanism every pack sprite and room picture already resolves through. Set
	 * here, in the constructor, rather than lazily inside getPipeline(): `env` is the library's own
	 * module-level config singleton, so this only needs to happen once, and unconditionally, before
	 * the first embed() call reaches getPipeline() — which is guaranteed, since embed() can't run
	 * before this object exists.
	 */
	constructor(resourceUrl: (fileName: string) => string) {
		// `env.backends.onnx.wasm` is typed `Partial<...>` (onnxruntime-common's own Env type isn't
		// guaranteed populated) and separately `readonly` (can't be replaced with a fresh object,
		// only mutated) — but importing anything from this package always runs backends/onnx.js's
		// own module-level setup first, which unconditionally leaves a real object here in every
		// version this plugin has ever seen. A thrown guard satisfies the type honestly, without
		// asserting past a case that would mean this dependency changed shape under us.
		const onnxWasm = env.backends.onnx.wasm;
		if (!onnxWasm) throw new Error("onnxruntime-web's env.wasm was never initialized (unexpected — see LocalEmbedder's constructor).");
		onnxWasm.wasmPaths = {
			wasm: resourceUrl(WASM_RUNTIME_FILE),
			mjs: resourceUrl(WASM_LOADER_FILE),
		};
	}

	async embed(text: string): Promise<number[]> {
		const extractor = await getPipeline();
		// Mean-pooled + normalized is the standard way to turn a sentence-transformer's
		// per-token output into one fixed-size vector for the whole input.
		const output = await extractor(text, { pooling: "mean", normalize: true });
		return Array.from(output.data as ArrayLike<number>);
	}
}
