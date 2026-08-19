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
