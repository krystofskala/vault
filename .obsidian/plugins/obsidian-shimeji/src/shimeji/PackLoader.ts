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
	};
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
