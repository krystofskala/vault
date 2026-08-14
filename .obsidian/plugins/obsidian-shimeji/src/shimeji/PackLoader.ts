import { normalizePath, type App } from "obsidian";
import { parseActionsXml } from "./ActionsParser";
import { parseBehaviorsXml } from "./BehaviorsParser";
import type { MascotPack } from "./types";

async function existsFile(app: App, path: string): Promise<boolean> {
	return app.vault.adapter.exists(path);
}

/**
 * Real `Main.getSoundFilePath(imageSet, soundFile)` probes exactly three directories, in order,
 * and returns the first that actually holds the file:
 *   img/<imageSet>/sound/<file>,  sound/<imageSet>/<file>,  sound/<file>
 * — i.e. a character's own sounds win over a per-character shared folder, which wins over the
 * global one. Reproduced here against the pack's own vault-relative layout. Unlike the original
 * (which throws FileNotFoundException and logs a load failure), a missing file just yields
 * undefined: a pose with an unresolvable sound should still show its art.
 */
function soundCandidates(root: string, name: string, imgDir: string, file: string): string[] {
	return [`${imgDir}/sound/${file}`, `${root}/sound/${name}/${file}`, `${root}/sound/${file}`];
}

async function tryLoadCharacter(app: App, name: string, imgDir: string, confDir: string, root: string): Promise<MascotPack | null> {
	const actionsPath = `${confDir}/actions.xml`;
	const behaviorsPath = `${confDir}/behaviors.xml`;
	if (!(await existsFile(app, actionsPath)) || !(await existsFile(app, behaviorsPath))) return null;

	const [actionsXml, behaviorsXml] = await Promise.all([app.vault.adapter.read(actionsPath), app.vault.adapter.read(behaviorsPath)]);

	// resolveImage runs on every pose tick (many times a second, for whatever pose is
	// currently showing) — getResourcePath isn't guaranteed to return the exact same string on
	// repeat calls for the same file (e.g. if it embeds a cache-busting token), which would
	// defeat Mascot.setVisualImage's own de-dup check and mean re-requesting the same image
	// dozens of times a second — exactly the kind of flood that can make the whole renderer
	// process sluggish. Caching by raw path here makes resolution stable regardless of that,
	// and skips the adapter call entirely once a path's been seen.
	const resolvedCache = new Map<string, string>();
	let loggedSample = false;

	// Sound resolution has to be synchronous (it happens per pose tick, from inside the action
	// interpreter), but the vault adapter's existence check isn't — so probe the three real
	// candidate directories once here, up front, and hand the interpreter a plain lookup table.
	// The original does the same work eagerly too, just at a different moment: AnimationBuilder
	// resolves and loads every Pose's sound while parsing actions.xml, long before any tick.
	const soundSrcByFile = new Map<string, string>();
	for (const file of collectPoseSounds(actionsXml)) {
		for (const candidate of soundCandidates(root, name, imgDir, file)) {
			if (await existsFile(app, candidate)) {
				soundSrcByFile.set(file, app.vault.adapter.getResourcePath(normalizePath(candidate)));
				break;
			}
		}
		if (!soundSrcByFile.has(file)) {
			console.warn(`[obsidian-shimeji] pack "${name}" references sound "${file}" but no file was found in its sound folders`);
		}
	}

	return {
		id: name,
		name,
		actions: parseActionsXml(actionsXml),
		behaviors: parseBehaviorsXml(behaviorsXml),
		resolveImage: (rawPath: string): string => {
			const cached = resolvedCache.get(rawPath);
			if (cached !== undefined) return cached;
			const clean = rawPath.replace(/^[/\\]+/, "");
			const fullPath = normalizePath(`${imgDir}/${clean}`);
			const resolved = app.vault.adapter.getResourcePath(fullPath);
			resolvedCache.set(rawPath, resolved);
			if (!loggedSample) {
				loggedSample = true;
				console.info(`[obsidian-shimeji] pack "${name}" resolves images under "${imgDir}" — e.g. "${rawPath}" -> "${fullPath}" -> ${resolved}`);
			}
			return resolved;
		},
		resolveSound: (file: string): string | undefined => soundSrcByFile.get(file),
		imgDir,
	};
}

/** Every distinct `Sound="..."` in an actions.xml, so the loader knows which files to look for
 * without walking the parsed action tree (which the caller doesn't have yet at this point, and
 * which would also miss sounds on actions that failed to parse). */
function collectPoseSounds(actionsXml: string): Set<string> {
	const found = new Set<string>();
	for (const match of actionsXml.matchAll(/\bSound\s*=\s*"([^"]+)"/g)) {
		const file = match[1].trim();
		if (file !== "") found.add(file);
	}
	return found;
}

const IMAGE_EXTENSION = /\.(png|jpe?g|gif|webp)$/i;

/** Lists a pack's own image files (pack-relative paths, e.g. "/shime1.png") for the
 * custom-content editor's image picker. Sorted numeric-aware so shime1, shime2, ... shime10
 * order sensibly instead of shime1, shime10, shime2. */
export async function listPackImages(app: App, imgDir: string | undefined): Promise<string[]> {
	if (!imgDir) return [];
	try {
		const listing = await app.vault.adapter.list(imgDir);
		return listing.files
			.map((f) => f.split("/").pop() ?? "")
			.filter((name) => IMAGE_EXTENSION.test(name))
			.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
			.map((name) => `/${name}`);
	} catch {
		return [];
	}
}

/**
 * Scans a vault-relative folder for one or more Shimeji-compatible characters, following the
 * upstream convention: the top-level conf/actions.xml + conf/behaviors.xml is used unless a
 * character-specific img/<Name>/conf/ or conf/<Name>/ override exists (multi-character packs).
 */
export async function loadPacksFromFolder(app: App, root: string): Promise<MascotPack[]> {
	const packs: MascotPack[] = [];

	let subNames: string[] = [];
	try {
		const imgList = await app.vault.adapter.list(`${root}/img`);
		subNames = imgList.folders.map((f) => f.split("/").pop() ?? "").filter(Boolean);
	} catch {
		subNames = [];
	}

	if (subNames.length === 0) {
		const name = root.split("/").pop() || "Mascot";
		const pack = await tryLoadCharacter(app, name, `${root}/img`, `${root}/conf`, root);
		if (pack) packs.push(pack);
		return packs;
	}

	for (const name of subNames) {
		const confDirCandidates = [`${root}/img/${name}/conf`, `${root}/conf/${name}`, `${root}/conf`];
		for (const confDir of confDirCandidates) {
			const loaded = await tryLoadCharacter(app, name, `${root}/img/${name}`, confDir, root);
			if (loaded) {
				packs.push(loaded);
				break;
			}
		}
	}
	return packs;
}
