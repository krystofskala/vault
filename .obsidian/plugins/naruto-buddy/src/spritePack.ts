import { Vault } from "obsidian";
import type { AtlasAnimationsConfig, AtlasFrameRect, ReactionName } from "./settings";

export interface StripAnimationDef {
	file: string; // filename of the horizontal sprite strip, relative to the pack folder
	frames: number; // number of equal-width frames in the strip
	fps: number; // playback speed
	loop: boolean; // whether it should loop until interrupted, or play once
}

export interface SpritePackManifest {
	name: string;
	frameWidth: number;
	frameHeight: number;
	animations: Partial<Record<ReactionName, StripAnimationDef>>;
}

/** A resolved animation, ready for CharacterWidget to play - regardless of
 * whether it came from a folder pack's manifest.json or a freeform atlas. */
export interface ResolvedAnimation {
	imageUrl: string;
	imageWidth: number;
	imageHeight: number;
	frames: AtlasFrameRect[];
	fps: number;
	loop: boolean;
}

export interface LoadedSpritePack {
	name: string;
	animations: Partial<Record<ReactionName, ResolvedAnimation>>;
	objectUrls: string[];
}

function getImageDimensions(url: string): Promise<{ width: number; height: number }> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
		img.onerror = () => reject(new Error("failed to decode image"));
		img.src = url;
	});
}

async function blobUrlForVaultFile(vault: Vault, path: string): Promise<string> {
	const bin = await vault.adapter.readBinary(path);
	const blob = new Blob([bin], { type: "image/png" });
	return URL.createObjectURL(blob);
}

/**
 * Loads a sprite pack from a vault-relative folder. The folder must contain a
 * manifest.json (see SpritePackManifest) plus the PNG strips it references -
 * one horizontal, equal-width-frame strip per animation. Returns null if the
 * folder/manifest is missing or invalid so callers can fall back to the
 * built-in placeholder character.
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

	const objectUrls: string[] = [];
	const animations: Partial<Record<ReactionName, ResolvedAnimation>> = {};

	for (const key of Object.keys(manifest.animations) as ReactionName[]) {
		const def = manifest.animations[key];
		if (!def) continue;
		const imgPath = `${normalized}/${def.file}`;
		try {
			const url = await blobUrlForVaultFile(vault, imgPath);
			objectUrls.push(url);
			const dims = await getImageDimensions(url);
			const frames: AtlasFrameRect[] = [];
			for (let i = 0; i < def.frames; i++) {
				frames.push({ x: i * manifest.frameWidth, y: 0, w: manifest.frameWidth, h: manifest.frameHeight });
			}
			animations[key] = {
				imageUrl: url,
				imageWidth: dims.width,
				imageHeight: dims.height,
				frames,
				fps: def.fps,
				loop: def.loop,
			};
		} catch (e) {
			console.warn(`Naruto Buddy: could not load sprite frame "${imgPath}"`, e);
		}
	}

	if (Object.keys(animations).length === 0) {
		for (const url of objectUrls) URL.revokeObjectURL(url);
		return null;
	}

	return { name: manifest.name, animations, objectUrls };
}

/**
 * Builds a sprite pack from a single "atlas" image plus explicit per-frame
 * crop rectangles configured in settings - no manifest.json needed. Suited
 * to modular/irregularly-packed sheets where frames aren't a uniform grid.
 */
export async function loadAtlasSpritePack(
	vault: Vault,
	atlasImagePath: string,
	atlasAnimations: AtlasAnimationsConfig
): Promise<LoadedSpritePack | null> {
	if (!atlasImagePath) return null;
	if (!(await vault.adapter.exists(atlasImagePath))) return null;

	let url: string;
	let dims: { width: number; height: number };
	try {
		url = await blobUrlForVaultFile(vault, atlasImagePath);
		dims = await getImageDimensions(url);
	} catch (e) {
		console.warn("Naruto Buddy: could not load atlas image", e);
		return null;
	}

	const animations: Partial<Record<ReactionName, ResolvedAnimation>> = {};
	for (const key of Object.keys(atlasAnimations) as ReactionName[]) {
		const cfg = atlasAnimations[key];
		if (!cfg || !cfg.enabled || cfg.frames.length === 0) continue;
		animations[key] = {
			imageUrl: url,
			imageWidth: dims.width,
			imageHeight: dims.height,
			frames: cfg.frames,
			fps: Math.max(1, cfg.fps),
			loop: cfg.loop,
		};
	}

	if (Object.keys(animations).length === 0) {
		URL.revokeObjectURL(url);
		return null;
	}

	return { name: "Custom atlas", animations, objectUrls: [url] };
}

export function revokeSpritePack(pack: LoadedSpritePack | null): void {
	if (!pack) return;
	for (const url of pack.objectUrls) URL.revokeObjectURL(url);
}

export interface SpritePackInfo {
	/** vault-relative folder path */
	path: string;
	/** manifest.json "name", falling back to the folder name */
	label: string;
}

/**
 * Scans a vault-relative base folder (typically this plugin's characters/
 * folder) for sub-folders that look like a usable folder pack - i.e. they
 * have a manifest.json referencing at least one image file that actually
 * exists. Used to populate the "Character pack" picker in settings so users
 * aren't stuck typing paths by hand.
 */
export async function listAvailableSpritePacks(
	vault: Vault,
	baseFolder: string
): Promise<SpritePackInfo[]> {
	const results: SpritePackInfo[] = [];
	if (!baseFolder) return results;
	if (!(await vault.adapter.exists(baseFolder))) return results;

	let listing: { files: string[]; folders: string[] };
	try {
		listing = await vault.adapter.list(baseFolder);
	} catch {
		return results;
	}

	for (const folder of listing.folders) {
		const manifestPath = `${folder}/manifest.json`;
		if (!(await vault.adapter.exists(manifestPath))) continue;

		try {
			const raw = await vault.adapter.read(manifestPath);
			const manifest: SpritePackManifest = JSON.parse(raw);
			const defs = Object.values(manifest.animations || {});

			let hasImage = false;
			for (const def of defs) {
				if (def && (await vault.adapter.exists(`${folder}/${def.file}`))) {
					hasImage = true;
					break;
				}
			}
			if (!hasImage) continue;

			const folderName = folder.split("/").pop() || folder;
			results.push({ path: folder, label: manifest.name || folderName });
		} catch {
			continue;
		}
	}

	return results;
}

/** Loads just the pixel dimensions of a vault image, for UI helpers (the atlas slicer). */
export async function loadImageForSlicing(
	vault: Vault,
	imagePath: string
): Promise<{ url: string; width: number; height: number } | null> {
	if (!imagePath) return null;
	if (!(await vault.adapter.exists(imagePath))) return null;
	try {
		const url = await blobUrlForVaultFile(vault, imagePath);
		const dims = await getImageDimensions(url);
		return { url, width: dims.width, height: dims.height };
	} catch (e) {
		console.warn("Naruto Buddy: could not load image for slicing", e);
		return null;
	}
}
