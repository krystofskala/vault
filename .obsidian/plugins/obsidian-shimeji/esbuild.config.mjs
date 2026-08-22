import esbuild from "esbuild";
import process from "process";
import builtins from "builtin-modules";

const production = process.argv[2] === "production";

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
