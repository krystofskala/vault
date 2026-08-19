import esbuild from "esbuild";
import process from "process";
import { copyFileSync, mkdirSync } from "fs";
import builtins from "builtin-modules";

const production = process.argv[2] === "production";

/**
 * The actual ONNX WASM runtime binary + its loader, copied straight out of onnxruntime-web's own
 * npm package into this plugin's own folder, so it ships with the plugin instead of needing a
 * separate network fetch for it (unlike the embedding model's weights, which really do only need
 * fetching once real usage begins — see README's Vault search section). Two reasons this can't
 * just be left to the library's own default resolution, both explained in the `define` comment
 * below: this project's CJS output hollows out the `import.meta.url` this library would otherwise
 * resolve those files relative to, and even if it didn't, `onnxruntime-web`'s own dist/ folder
 * where they actually live is never itself part of what ships in an installed Obsidian plugin.
 * ai/embeddings.ts points `env.backends.onnx.wasm.wasmPaths` at wherever this lands.
 *
 * Only the plain default (non-jsep/non-jspi/non-webgpu) build is copied, matching
 * ai/embeddings.ts's own forced `device: "wasm"` request, which never asks for webgpu/webnn —
 * the other three variants exist for those and are 15-25MB each, not worth shipping unused.
 */
const WASM_SRC_DIR = "node_modules/onnxruntime-web/dist";
const WASM_OUT_DIR = "onnx-wasm";
const WASM_FILES = ["ort-wasm-simd-threaded.wasm", "ort-wasm-simd-threaded.mjs"];

mkdirSync(WASM_OUT_DIR, { recursive: true });
for (const file of WASM_FILES) copyFileSync(`${WASM_SRC_DIR}/${file}`, `${WASM_OUT_DIR}/${file}`);

const context = await esbuild.context({
	banner: {
		js: "/* obsidian-shimeji: bundled build, see src/ for source. */",
	},
	entryPoints: ["src/main.ts"],
	bundle: true,
	external: [
		"obsidian",
		"electron",
		"@codemirror/autocomplete",
		"@codemirror/collab",
		"@codemirror/commands",
		"@codemirror/language",
		"@codemirror/lint",
		"@codemirror/search",
		"@codemirror/state",
		"@codemirror/view",
		"@lezer/common",
		"@lezer/highlight",
		"@lezer/lr",
		// @huggingface/transformers' own browser build (what this bundle actually resolves to,
		// confirmed by inspecting the output) never references either of these — its Node-native
		// ONNX backend and its image-preprocessing dependency, neither of which vault search needs
		// (WASM is forced explicitly in ai/embeddings.ts, and this plugin never touches images
		// through the embedding pipeline). Declared external anyway, not just left alone: both
		// carry real CVEs in the versions this package currently pulls in, and a native addon
		// would need a different binary per desktop OS regardless — external turns "these are
		// unreachable today" into "these can never silently get bundled in" if a future dependency
		// bump ever changes which entry point resolves.
		"onnxruntime-node",
		"sharp",
		...builtins,
	],
	// The actual root cause of the "Unsupported device: 'wasm'" crash the two externals above
	// were only ever a defensive half-measure for: @huggingface/transformers decides which ONNX
	// backend to use, and which devices it considers valid at all, from its own top-level
	// `typeof process !== "undefined" && process?.release?.name === "node"` check — evaluated
	// once, at module load, before ai/embeddings.ts's `device: "wasm"` request is ever looked at.
	// Obsidian's desktop app is a real Electron renderer, where `process` is a real global with
	// `release.name === "node"` — genuinely true, not a bug in Electron — so the library concludes
	// it's running under plain Node and builds its `supportedDevices` list accordingly: `cpu`/
	// `webgpu` only, `wasm` never included, because real Node is expected to reach the native
	// `onnxruntime-node` addon instead. This bundle deliberately never ships that addon (see the
	// `external` comment above — a native addon needs a different binary per desktop OS, which is
	// exactly what WASM avoids), so forcing `device: "wasm"` at the call site was necessary but not
	// sufficient: it just requests a device the library had already, unconditionally, decided not
	// to support in this session.
	// Rewriting just this one expression at build time — not all of `process`, which real desktop-
	// only code elsewhere may still legitimately read — makes the library's own check evaluate
	// false the same way it would in an actual browser, regardless of what the real Electron
	// `process` global says at runtime. Confirmed empirically (a standalone esbuild bundle of
	// `process?.release?.name === "node"` with this same define, run under plain Node) to fold the
	// whole expression to a constant `false` at build time, not merely shadow it at runtime.
	define: {
		"process.release.name": '"browser"',
	},
	format: "cjs",
	target: "es2020",
	logLevel: "info",
	sourcemap: production ? false : "inline",
	treeShaking: true,
	outfile: "main.js",
	minify: production,
});

if (production) {
	await context.rebuild();
	process.exit(0);
} else {
	await context.watch();
}
