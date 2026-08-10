import { Vault } from "obsidian";
import type { ReactionName } from "./settings";

export interface SpriteAnimationDef {
	file: string; // filename of the horizontal sprite strip, relative to the pack folder
	frames: number; // number of frames in the strip
	fps: number; // playback speed
	loop: boolean; // whether it should loop until interrupted, or play once
}

export interface SpritePackManifest {
	name: string;
	frameWidth: number;
	frameHeight: number;
	animations: Partial<Record<ReactionName, SpriteAnimationDef>>;
}

export interface LoadedSpritePack {
	manifest: SpritePackManifest;
	// reaction name -> object URL of its sprite strip image
	images: Partial<Record<ReactionName, string>>;
}

/**
 * Loads a sprite pack from a vault-relative folder. The folder must contain a
 * manifest.json (see SpritePackManifest) plus the PNG strips it references.
 * Returns null if the folder/manifest is missing or invalid so callers can
 * fall back to the built-in placeholder character.
 */
export async function loadSpritePack(
	vault: Vault,
	folderPath: string
): Promise<LoadedSpritePack | null> {
	if (!folderPath) return null;
	const normalized = folderPath.replace(/\/+$/, "");
	const manifestPath = `${normalized}/manifest.json`;

	let manifestRaw: string;
	try {
		if (!(await vault.adapter.exists(manifestPath))) return null;
		manifestRaw = await vault.adapter.read(manifestPath);
	} catch (e) {
		console.warn("Naruto Buddy: could not read sprite pack manifest", e);
		return null;
	}

	let manifest: SpritePackManifest;
	try {
		manifest = JSON.parse(manifestRaw);
		if (!manifest.animations || !manifest.frameWidth || !manifest.frameHeight) {
			throw new Error("manifest missing required fields");
		}
	} catch (e) {
		console.warn("Naruto Buddy: invalid sprite pack manifest.json", e);
		return null;
	}

	const images: Partial<Record<ReactionName, string>> = {};
	for (const key of Object.keys(manifest.animations) as ReactionName[]) {
		const def = manifest.animations[key];
		if (!def) continue;
		const imgPath = `${normalized}/${def.file}`;
		try {
			const bin = await vault.adapter.readBinary(imgPath);
			const blob = new Blob([bin], { type: "image/png" });
			images[key] = URL.createObjectURL(blob);
		} catch (e) {
			console.warn(`Naruto Buddy: could not load sprite frame "${imgPath}"`, e);
		}
	}

	if (Object.keys(images).length === 0) return null;

	return { manifest, images };
}

export function revokeSpritePack(pack: LoadedSpritePack | null): void {
	if (!pack) return;
	for (const url of Object.values(pack.images)) {
		if (url) URL.revokeObjectURL(url);
	}
}
