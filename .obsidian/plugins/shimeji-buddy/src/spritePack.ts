import { Vault } from "obsidian";
import type { AtlasFrameRect, CustomAnimation } from "./settings";

export interface StripAnimationDef {
	file: string; // filename of the horizontal sprite strip, relative to the pack folder
	frames: number; // number of equal-width frames in the strip
	fps: number; // playback speed
	loop: boolean; // whether it should loop until interrupted, or play once
	weight?: number; // relative pick probability within its trigger's pool; default 1
	moves?: boolean; // only meaningful under the "idle" key: roam vs play in place; default false
}

export interface SpritePackManifest {
	name: string;
	frameWidth: number;
	frameHeight: number;
	/** Keyed by trigger id ("idle", "note:open", "command:<id>", ...). Each array is a weighted pool. */
	animations: Record<string, StripAnimationDef[]>;
}

/** A resolved animation, ready for CharacterWidget to play - regardless of
 * whether it came from a folder pack's manifest.json or the atlas library. */
export interface ResolvedAnimation {
	imageUrl: string;
	imageWidth: number;
	imageHeight: number;
	frames: AtlasFrameRect[];
	fps: number;
	loop: boolean;
}

export interface WeightedAnimation extends ResolvedAnimation {
	weight: number;
	moves: boolean;
}

export interface LoadedSpritePack {
	name: string;
	/** Keyed by trigger id; each array is a weighted pool of candidates for that trigger. */
	bySlot: Record<string, WeightedAnimation[]>;
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

/** Picks a weighted-random entry (falls back to even odds if every weight is 0). */
export function pickWeighted<T extends { weight: number }>(items: T[]): T | null {
	if (items.length === 0) return null;
	const total = items.reduce((sum, i) => sum + Math.max(0, i.weight), 0);
	if (total <= 0) return items[Math.floor(Math.random() * items.length)];
	let r = Math.random() * total;
	for (const item of items) {
		r -= Math.max(0, item.weight);
		if (r <= 0) return item;
	}
	return items[items.length - 1];
}

/**
 * Loads a sprite pack from a vault-relative folder. The folder must contain a
 * manifest.json (see SpritePackManifest) plus the PNG strips it references -
 * one horizontal, equal-width-frame strip per pool entry. Returns null if the
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
		console.warn("Shimeji Buddy: could not read sprite pack manifest", e);
		return null;
	}

	let manifest: SpritePackManifest;
	try {
		manifest = JSON.parse(manifestRaw);
		if (!manifest.animations || !manifest.frameWidth || !manifest.frameHeight) {
			throw new Error("manifest missing required fields");
		}
	} catch (e) {
		console.warn("Shimeji Buddy: invalid sprite pack manifest.json", e);
		return null;
	}

	const objectUrls: string[] = [];
	const bySlot: Record<string, WeightedAnimation[]> = {};

	for (const [triggerId, defs] of Object.entries(manifest.animations)) {
		if (!Array.isArray(defs)) continue;
		for (const def of defs) {
			const imgPath = `${normalized}/${def.file}`;
			try {
				const url = await blobUrlForVaultFile(vault, imgPath);
				objectUrls.push(url);
				const dims = await getImageDimensions(url);
				const frames: AtlasFrameRect[] = [];
				for (let i = 0; i < def.frames; i++) {
					frames.push({ x: i * manifest.frameWidth, y: 0, w: manifest.frameWidth, h: manifest.frameHeight });
				}
				(bySlot[triggerId] ??= []).push({
					imageUrl: url,
					imageWidth: dims.width,
					imageHeight: dims.height,
					frames,
					fps: def.fps,
					loop: def.loop,
					weight: def.weight ?? 1,
					moves: def.moves ?? false,
				});
			} catch (e) {
				console.warn(`Shimeji Buddy: could not load sprite frame "${imgPath}"`, e);
			}
		}
	}

	if (Object.keys(bySlot).length === 0) {
		for (const url of objectUrls) URL.revokeObjectURL(url);
		return null;
	}

	return { name: manifest.name, bySlot, objectUrls };
}

/**
 * Builds a sprite pack from a single "atlas" image plus the user's animation
 * library from settings - no manifest.json needed. Each animation can be
 * assigned to more than one trigger; it's added to every trigger pool it's
 * assigned to, using the same weight in each.
 */
export async function loadAtlasSpritePack(
	vault: Vault,
	atlasImagePath: string,
	customAnimations: CustomAnimation[]
): Promise<LoadedSpritePack | null> {
	if (!atlasImagePath) return null;
	if (!(await vault.adapter.exists(atlasImagePath))) return null;

	let url: string;
	let dims: { width: number; height: number };
	try {
		url = await blobUrlForVaultFile(vault, atlasImagePath);
		dims = await getImageDimensions(url);
	} catch (e) {
		console.warn("Shimeji Buddy: could not load atlas image", e);
		return null;
	}

	const bySlot: Record<string, WeightedAnimation[]> = {};
	for (const anim of customAnimations) {
		if (!anim.enabled || anim.frames.length === 0 || anim.triggers.length === 0) continue;
		const resolved: WeightedAnimation = {
			imageUrl: url,
			imageWidth: dims.width,
			imageHeight: dims.height,
			frames: anim.frames,
			fps: Math.max(1, anim.fps),
			loop: anim.loop,
			weight: Math.max(0, anim.weight),
			moves: anim.moves,
		};
		for (const trigger of anim.triggers) {
			(bySlot[trigger] ??= []).push(resolved);
		}
	}

	if (Object.keys(bySlot).length === 0) {
		URL.revokeObjectURL(url);
		return null;
	}

	return { name: "Custom atlas", bySlot, objectUrls: [url] };
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
			const allDefs = Object.values(manifest.animations || {}).flat();

			let hasImage = false;
			for (const def of allDefs) {
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
		console.warn("Shimeji Buddy: could not load image for slicing", e);
		return null;
	}
}
