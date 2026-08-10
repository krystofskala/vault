import { Vault } from "obsidian";
import type { AtlasFrameRect, CustomAnimation } from "./settings";

const CHARACTER_FILE_NAME = "character.json";

/** One pool entry as stored on disk in a character's character.json. */
export interface CharacterFile {
	name: string;
	animations: CustomAnimation[];
}

/** A resolved animation, ready for CharacterWidget to play. */
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

function normalizeFolder(folderPath: string): string {
	return folderPath.replace(/\/+$/, "");
}

export function characterFilePath(folderPath: string): string {
	return `${normalizeFolder(folderPath)}/${CHARACTER_FILE_NAME}`;
}

/** Reads a character's character.json, or a blank one if the folder has none yet. */
export async function readCharacterFile(vault: Vault, folderPath: string): Promise<CharacterFile> {
	const path = characterFilePath(folderPath);
	try {
		if (await vault.adapter.exists(path)) {
			const raw = await vault.adapter.read(path);
			const parsed = JSON.parse(raw);
			if (parsed && Array.isArray(parsed.animations)) return parsed as CharacterFile;
		}
	} catch (e) {
		console.warn("Shimeji Buddy: could not read character.json, starting fresh", e);
	}
	const folderName = folderPath.split("/").pop() || "Character";
	return { name: folderName, animations: [] };
}

export async function writeCharacterFile(vault: Vault, folderPath: string, file: CharacterFile): Promise<void> {
	await vault.adapter.write(characterFilePath(folderPath), JSON.stringify(file, null, 2));
}

/** Lists the image filenames already sitting in a character's folder. */
export async function listCharacterImages(vault: Vault, folderPath: string): Promise<string[]> {
	const normalized = normalizeFolder(folderPath);
	if (!(await vault.adapter.exists(normalized))) return [];
	try {
		const listing = await vault.adapter.list(normalized);
		return listing.files
			.map((f) => f.split("/").pop() || f)
			.filter((name) => /\.(png|jpe?g|gif|webp)$/i.test(name))
			.sort();
	} catch {
		return [];
	}
}

/** Creates a new, empty character folder + character.json. Returns its vault-relative folder path. */
export async function createCharacter(vault: Vault, basePath: string, name: string): Promise<string> {
	const slug =
		name
			.trim()
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/(^-|-$)/g, "") || "character";
	let folder = `${normalizeFolder(basePath)}/${slug}`;
	let suffix = 2;
	while (await vault.adapter.exists(folder)) {
		folder = `${normalizeFolder(basePath)}/${slug}-${suffix}`;
		suffix++;
	}
	await vault.adapter.mkdir(folder);
	await writeCharacterFile(vault, folder, { name: name.trim() || slug, animations: [] });
	return folder;
}

/** Copies raw bytes (e.g. from a native file picker) into a character's folder, avoiding filename collisions. */
export async function addImageToCharacter(
	vault: Vault,
	folderPath: string,
	fileName: string,
	data: ArrayBuffer
): Promise<string> {
	const normalized = normalizeFolder(folderPath);
	if (!(await vault.adapter.exists(normalized))) await vault.adapter.mkdir(normalized);

	const dot = fileName.lastIndexOf(".");
	const base = dot > 0 ? fileName.slice(0, dot) : fileName;
	const ext = dot > 0 ? fileName.slice(dot) : ".png";
	let candidate = fileName;
	let suffix = 2;
	while (await vault.adapter.exists(`${normalized}/${candidate}`)) {
		candidate = `${base}-${suffix}${ext}`;
		suffix++;
	}
	await vault.adapter.writeBinary(`${normalized}/${candidate}`, data);
	return candidate;
}

export async function deleteCharacterImage(vault: Vault, folderPath: string, fileName: string): Promise<void> {
	const path = `${normalizeFolder(folderPath)}/${fileName}`;
	if (await vault.adapter.exists(path)) await vault.adapter.remove(path);
}

/**
 * Loads a character folder's animations into the running shape CharacterWidget
 * plays from: one shared object URL per source image, frames resolved from
 * either explicit crop rectangles or an auto-generated even strip.
 */
export async function loadCharacter(vault: Vault, folderPath: string): Promise<LoadedSpritePack | null> {
	if (!folderPath) return null;
	const normalized = normalizeFolder(folderPath);
	if (!(await vault.adapter.exists(normalized))) return null;

	const file = await readCharacterFile(vault, normalized);
	if (file.animations.length === 0) return null;

	const objectUrls: string[] = [];
	const imageCache = new Map<string, Promise<{ url: string; width: number; height: number }>>();
	const loadImage = (fileName: string) => {
		let promise = imageCache.get(fileName);
		if (!promise) {
			promise = (async () => {
				const url = await blobUrlForVaultFile(vault, `${normalized}/${fileName}`);
				objectUrls.push(url);
				const dims = await getImageDimensions(url);
				return { url, ...dims };
			})();
			imageCache.set(fileName, promise);
		}
		return promise;
	};

	const bySlot: Record<string, WeightedAnimation[]> = {};

	for (const anim of file.animations) {
		if (!anim.enabled || !anim.sourceImage || anim.frames.length === 0 || anim.triggers.length === 0) continue;
		try {
			const img = await loadImage(anim.sourceImage);
			const resolved: WeightedAnimation = {
				imageUrl: img.url,
				imageWidth: img.width,
				imageHeight: img.height,
				frames: anim.frames,
				fps: Math.max(1, anim.fps),
				loop: anim.loop,
				weight: Math.max(0, anim.weight),
				moves: anim.moves,
			};
			for (const trigger of anim.triggers) {
				(bySlot[trigger] ??= []).push(resolved);
			}
		} catch (e) {
			console.warn(`Shimeji Buddy: could not load "${anim.sourceImage}" for animation "${anim.name}"`, e);
		}
	}

	if (Object.keys(bySlot).length === 0) {
		for (const url of objectUrls) URL.revokeObjectURL(url);
		return null;
	}

	return { name: file.name, bySlot, objectUrls };
}

export function revokeSpritePack(pack: LoadedSpritePack | null): void {
	if (!pack) return;
	for (const url of pack.objectUrls) URL.revokeObjectURL(url);
}

export interface CharacterInfo {
	/** vault-relative folder path */
	path: string;
	label: string;
}

/** Scans a base folder (this plugin's characters/ folder) for sub-folders that look like a character (have a character.json). */
export async function listCharacters(vault: Vault, baseFolder: string): Promise<CharacterInfo[]> {
	const results: CharacterInfo[] = [];
	if (!baseFolder) return results;
	if (!(await vault.adapter.exists(baseFolder))) return results;

	let listing: { files: string[]; folders: string[] };
	try {
		listing = await vault.adapter.list(baseFolder);
	} catch {
		return results;
	}

	for (const folder of listing.folders) {
		if (!(await vault.adapter.exists(characterFilePath(folder)))) continue;
		try {
			const file = await readCharacterFile(vault, folder);
			const folderName = folder.split("/").pop() || folder;
			results.push({ path: folder, label: file.name || folderName });
		} catch {
			continue;
		}
	}

	return results;
}

/** Generates N evenly-spaced frame rectangles across a full image - the "strip" shortcut. */
export function generateStripFrames(imageWidth: number, imageHeight: number, count: number): AtlasFrameRect[] {
	const n = Math.max(1, Math.floor(count));
	const frameWidth = imageWidth / n;
	const frames: AtlasFrameRect[] = [];
	for (let i = 0; i < n; i++) {
		frames.push({ x: Math.round(i * frameWidth), y: 0, w: Math.round(frameWidth), h: imageHeight });
	}
	return frames;
}

/** Loads just the pixel dimensions (+ a display URL) of a vault image, for UI helpers (the slicer). */
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
