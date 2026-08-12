import type { App } from "obsidian";
import { parseActionsXml } from "./ActionsParser";
import { parseBehaviorsXml } from "./BehaviorsParser";
import type { MascotPack } from "./types";

async function existsFile(app: App, path: string): Promise<boolean> {
	return app.vault.adapter.exists(path);
}

async function tryLoadCharacter(app: App, name: string, imgDir: string, confDir: string): Promise<MascotPack | null> {
	const actionsPath = `${confDir}/actions.xml`;
	const behaviorsPath = `${confDir}/behaviors.xml`;
	if (!(await existsFile(app, actionsPath)) || !(await existsFile(app, behaviorsPath))) return null;

	const [actionsXml, behaviorsXml] = await Promise.all([app.vault.adapter.read(actionsPath), app.vault.adapter.read(behaviorsPath)]);

	return {
		id: name,
		name,
		actions: parseActionsXml(actionsXml),
		behaviors: parseBehaviorsXml(behaviorsXml),
		resolveImage: (rawPath: string): string => {
			const clean = rawPath.replace(/^[/\\]+/, "");
			return app.vault.adapter.getResourcePath(`${imgDir}/${clean}`);
		},
		imgDir,
	};
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
		const pack = await tryLoadCharacter(app, name, `${root}/img`, `${root}/conf`);
		if (pack) packs.push(pack);
		return packs;
	}

	for (const name of subNames) {
		const confDirCandidates = [`${root}/img/${name}/conf`, `${root}/conf/${name}`, `${root}/conf`];
		for (const confDir of confDirCandidates) {
			const loaded = await tryLoadCharacter(app, name, `${root}/img/${name}`, confDir);
			if (loaded) {
				packs.push(loaded);
				break;
			}
		}
	}
	return packs;
}
