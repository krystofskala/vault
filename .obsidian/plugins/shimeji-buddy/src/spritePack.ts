import { Vault } from "obsidian";
import {
	defaultMovementBehavior,
	type AnimationSequence,
	type AtlasFrameRect,
	type CustomAnimation,
	type MovementBehavior,
} from "./settings";

const CHARACTER_FILE_NAME = "character.json";

/** One pool entry as stored on disk in a character's character.json. */
export interface CharacterFile {
	name: string;
	animations: CustomAnimation[];
	sequences: AnimationSequence[];
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
	kind: "animation";
	weight: number;
	movement: MovementBehavior;
}

/** One resolved beat of a WeightedSequence - see settings.ts's SequenceStep. */
export interface ResolvedSequenceStep {
	/** null = no visible animation this step (a pure wait/hidden beat). */
	clip: ResolvedAnimation | null;
	durationMs: number;
	hidden: boolean;
	movement: MovementBehavior;
	say: string;
}

export interface WeightedSequence {
	kind: "sequence";
	weight: number;
	steps: ResolvedSequenceStep[];
}

/** One pool entry: either a plain animation clip or a whole scripted sequence - pickWeighted() only needs .weight, so both mix freely in the same trigger's pool. */
export type WeightedReaction = WeightedAnimation | WeightedSequence;

export interface LoadedSpritePack {
	name: string;
	/** Keyed by trigger id; each array is a weighted pool of candidates for that trigger. */
	bySlot: Record<string, WeightedReaction[]>;
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

const MIME_BY_EXTENSION: Record<string, string> = {
	png: "image/png",
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	gif: "image/gif",
	webp: "image/webp",
};

export function mimeTypeForPath(path: string): string {
	const ext = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
	return MIME_BY_EXTENSION[ext] ?? "image/png";
}

async function blobUrlForVaultFile(vault: Vault, path: string): Promise<string> {
	const bin = await vault.adapter.readBinary(path);
	const blob = new Blob([bin], { type: mimeTypeForPath(path) });
	return URL.createObjectURL(blob);
}

async function decodeVaultImageToCanvas(vault: Vault, path: string): Promise<HTMLCanvasElement> {
	const bin = await vault.adapter.readBinary(path);
	const blob = new Blob([bin], { type: mimeTypeForPath(path) });
	const url = URL.createObjectURL(blob);
	try {
		const img = new Image();
		await new Promise<void>((resolve, reject) => {
			img.onload = () => resolve();
			img.onerror = () => reject(new Error("failed to decode image"));
			img.src = url;
		});
		const canvas = document.createElement("canvas");
		canvas.width = img.naturalWidth;
		canvas.height = img.naturalHeight;
		const ctx = canvas.getContext("2d");
		if (!ctx) throw new Error("canvas 2D context unavailable");
		ctx.drawImage(img, 0, 0);
		return canvas;
	} finally {
		URL.revokeObjectURL(url);
	}
}

export interface RgbColor {
	r: number;
	g: number;
	b: number;
}

export function rgbToHex(c: RgbColor): string {
	const h = (n: number) => n.toString(16).padStart(2, "0");
	return `#${h(c.r)}${h(c.g)}${h(c.b)}`;
}

export function hexToRgb(hex: string): RgbColor {
	const n = parseInt(hex.slice(1), 16);
	return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** Reads a single pixel's color out of a vault image, in its own natural pixel coordinates. */
export async function sampleImageColor(vault: Vault, path: string, x: number, y: number): Promise<RgbColor> {
	const canvas = await decodeVaultImageToCanvas(vault, path);
	const ctx = canvas.getContext("2d")!;
	const px = ctx.getImageData(
		Math.max(0, Math.min(x, canvas.width - 1)),
		Math.max(0, Math.min(y, canvas.height - 1)),
		1,
		1
	).data;
	return { r: px[0], g: px[1], b: px[2] };
}

/**
 * Color-key transparency: makes every pixel close to any of `colors`
 * transparent, with a small feathered falloff right at the tolerance edge
 * so it doesn't look too hard-edged. Works on flat, solid backgrounds
 * regardless of the sprite art's own quality/resolution - it's just picking
 * out colors, not doing any real background detection. Accepting a list
 * (not just one color) covers sheets whose background/matte isn't perfectly
 * uniform (e.g. a couple of near-white shades from JPEG artifacting).
 */
export async function applyColorKey(
	canvas: HTMLCanvasElement,
	colors: RgbColor[],
	tolerance: number
): Promise<HTMLCanvasElement> {
	const ctx = canvas.getContext("2d")!;
	const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
	const data = imageData.data;
	const feather = Math.max(1, tolerance * 0.3);
	for (let i = 0; i < data.length; i += 4) {
		let minDist = Infinity;
		for (const color of colors) {
			const dr = data[i] - color.r;
			const dg = data[i + 1] - color.g;
			const db = data[i + 2] - color.b;
			const dist = Math.sqrt(dr * dr + dg * dg + db * db);
			if (dist < minDist) minDist = dist;
		}
		if (minDist <= tolerance) {
			data[i + 3] = 0;
		} else if (minDist <= tolerance + feather) {
			const t = (minDist - tolerance) / feather; // 0 at the fully-transparent edge, 1 at fully-opaque
			data[i + 3] = Math.round(data[i + 3] * t);
		}
	}
	ctx.putImageData(imageData, 0, 0);
	return canvas;
}

/** Renders a preview canvas (decoded + color-keyed) without touching the vault file. */
export async function previewColorKey(
	vault: Vault,
	folderPath: string,
	fileName: string,
	colors: RgbColor[],
	tolerance: number
): Promise<HTMLCanvasElement> {
	const canvas = await decodeVaultImageToCanvas(vault, `${normalizeFolder(folderPath)}/${fileName}`);
	return applyColorKey(canvas, colors, tolerance);
}

/** Applies color-key transparency and overwrites the image in place (same filename, so existing animations built from it keep working). Always saved as PNG, since it needs an alpha channel. */
export async function removeBackgroundColor(
	vault: Vault,
	folderPath: string,
	fileName: string,
	colors: RgbColor[],
	tolerance: number
): Promise<void> {
	const path = `${normalizeFolder(folderPath)}/${fileName}`;
	const canvas = await decodeVaultImageToCanvas(vault, path);
	await applyColorKey(canvas, colors, tolerance);
	const blob: Blob = await new Promise((resolve, reject) => {
		canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("failed to encode PNG"))), "image/png");
	});
	await vault.adapter.writeBinary(path, await blob.arrayBuffer());
}

interface DetectedBox {
	x: number;
	y: number;
	w: number;
	h: number;
}

export interface DetectFramesOptions {
	/** Any color(s) treated as "empty space" between sprites - already-transparent pixels always count too. */
	backgroundColors: RgbColor[];
	tolerance: number;
	/** Discards components smaller than this many pixels - filters out noise/dithering specks. */
	minArea: number;
	/** Bounding boxes separated by no more than this many pixels get merged into one - reunites a sprite whose limbs/parts got split by background gaps within its own silhouette. */
	mergeDistance: number;
}

function boxGap(a: DetectedBox, b: DetectedBox): number {
	const dx = Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w), 0);
	const dy = Math.max(a.y - (b.y + b.h), b.y - (a.y + a.h), 0);
	return Math.max(dx, dy);
}

function mergeBoxes(a: DetectedBox, b: DetectedBox): DetectedBox {
	const x = Math.min(a.x, b.x);
	const y = Math.min(a.y, b.y);
	const right = Math.max(a.x + a.w, b.x + b.w);
	const bottom = Math.max(a.y + a.h, b.y + b.h);
	return { x, y, w: right - x, h: bottom - y };
}

/** Iteratively merges any two boxes within `distance` of each other, until no more merges apply. */
function mergeCloseBoxes(boxes: DetectedBox[], distance: number): DetectedBox[] {
	const result = boxes.slice();
	let merged = true;
	while (merged) {
		merged = false;
		outer: for (let i = 0; i < result.length; i++) {
			for (let j = i + 1; j < result.length; j++) {
				if (boxGap(result[i], result[j]) <= distance) {
					const combined = mergeBoxes(result[i], result[j]);
					result.splice(j, 1);
					result.splice(i, 1);
					result.push(combined);
					merged = true;
					break outer;
				}
			}
		}
	}
	return result;
}

/** Orders boxes roughly top-to-bottom, left-to-right - grouping into "rows" by vertical overlap first, since sprite sheets are usually laid out that way even when frames aren't in a perfectly uniform grid. */
function sortReadingOrder(boxes: DetectedBox[]): DetectedBox[] {
	const byTop = boxes.slice().sort((a, b) => a.y - b.y);
	const rows: DetectedBox[][] = [];
	for (const box of byTop) {
		const row = rows.find((r) => {
			const ref = r[0];
			const overlap = Math.min(box.y + box.h, ref.y + ref.h) - Math.max(box.y, ref.y);
			return overlap > 0.5 * Math.min(box.h, ref.h);
		});
		if (row) row.push(box);
		else rows.push([box]);
	}
	rows.sort((a, b) => Math.min(...a.map((r) => r.y)) - Math.min(...b.map((r) => r.y)));
	const result: DetectedBox[] = [];
	for (const row of rows) {
		row.sort((a, b) => a.x - b.x);
		result.push(...row);
	}
	return result;
}

/**
 * Auto-detects individual sprite frames on a large/messy sheet, the way the
 * "Spriter's Resource" sprite-splitter tool does: any pixel matching one of
 * the given background colors (or already transparent) is treated as empty
 * space, then a flood-fill finds each connected blob of remaining
 * (foreground) pixels and returns its bounding box - no manual grid needed.
 * Typed arrays keep this fast even on a several-thousand-pixel-wide sheet.
 */
export async function detectFrames(
	vault: Vault,
	imagePath: string,
	options: DetectFramesOptions
): Promise<AtlasFrameRect[]> {
	const canvas = await decodeVaultImageToCanvas(vault, imagePath);
	const { width, height } = canvas;
	const ctx = canvas.getContext("2d")!;
	const data = ctx.getImageData(0, 0, width, height).data;
	const tolerance = options.tolerance;

	const isBackground = (pixelIdx: number): boolean => {
		if (data[pixelIdx + 3] === 0) return true;
		const r = data[pixelIdx];
		const g = data[pixelIdx + 1];
		const b = data[pixelIdx + 2];
		for (const c of options.backgroundColors) {
			const dr = r - c.r;
			const dg = g - c.g;
			const db = b - c.b;
			if (Math.sqrt(dr * dr + dg * dg + db * db) <= tolerance) return true;
		}
		return false;
	};

	const visited = new Uint8Array(width * height);
	const queue = new Int32Array(width * height);
	const boxes: (DetectedBox & { area: number })[] = [];

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const idx = y * width + x;
			if (visited[idx]) continue;
			visited[idx] = 1;
			if (isBackground(idx * 4)) continue;

			let head = 0;
			let tail = 0;
			queue[tail++] = idx;
			let minX = x;
			let maxX = x;
			let minY = y;
			let maxY = y;
			let area = 0;
			while (head < tail) {
				const cur = queue[head++];
				const cx = cur % width;
				const cy = (cur - cx) / width;
				area++;
				if (cx < minX) minX = cx;
				if (cx > maxX) maxX = cx;
				if (cy < minY) minY = cy;
				if (cy > maxY) maxY = cy;
				for (let dy = -1; dy <= 1; dy++) {
					for (let dx = -1; dx <= 1; dx++) {
						if (dx === 0 && dy === 0) continue;
						const nx = cx + dx;
						const ny = cy + dy;
						if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
						const nIdx = ny * width + nx;
						if (visited[nIdx]) continue;
						visited[nIdx] = 1;
						if (isBackground(nIdx * 4)) continue;
						queue[tail++] = nIdx;
					}
				}
			}
			boxes.push({ x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1, area });
		}
	}

	const minArea = Math.max(1, options.minArea);
	let rects: DetectedBox[] = boxes.filter((b) => b.area >= minArea).map(({ x, y, w, h }) => ({ x, y, w, h }));
	if (options.mergeDistance > 0) rects = mergeCloseBoxes(rects, options.mergeDistance);

	return sortReadingOrder(rects);
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

/** Migrates a raw (possibly pre-"movement") animation record from disk: older character.json files have `moves: boolean` instead of the current `movement: MovementBehavior`. */
function normalizeAnimation(raw: CustomAnimation & { moves?: boolean }): CustomAnimation {
	if (raw.movement) return raw;
	const { moves, ...rest } = raw;
	return { ...rest, movement: moves ? { kind: "randomSpot" } : defaultMovementBehavior() };
}

/** Reads a character's character.json, or a blank one if the folder has none yet. */
export async function readCharacterFile(vault: Vault, folderPath: string): Promise<CharacterFile> {
	const path = characterFilePath(folderPath);
	try {
		if (await vault.adapter.exists(path)) {
			const raw = await vault.adapter.read(path);
			const parsed = JSON.parse(raw);
			if (parsed && Array.isArray(parsed.animations)) {
				return {
					...parsed,
					animations: parsed.animations.map(normalizeAnimation),
					sequences: Array.isArray(parsed.sequences) ? parsed.sequences : [],
				} as CharacterFile;
			}
		}
	} catch (e) {
		console.warn("Shimeji Buddy: could not read character.json, starting fresh", e);
	}
	const folderName = folderPath.split("/").pop() || "Character";
	return { name: folderName, animations: [], sequences: [] };
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
	await writeCharacterFile(vault, folder, { name: name.trim() || slug, animations: [], sequences: [] });
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
	if (file.animations.length === 0 && file.sequences.length === 0) return null;

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

	const bySlot: Record<string, WeightedReaction[]> = {};

	for (const anim of file.animations) {
		if (!anim.enabled || !anim.sourceImage || anim.frames.length === 0 || anim.triggers.length === 0) continue;
		try {
			const img = await loadImage(anim.sourceImage);
			const resolved: WeightedAnimation = {
				kind: "animation",
				imageUrl: img.url,
				imageWidth: img.width,
				imageHeight: img.height,
				frames: anim.frames,
				fps: Math.max(1, anim.fps),
				loop: anim.loop,
				weight: Math.max(0, anim.weight),
				movement: anim.movement,
			};
			for (const trigger of anim.triggers) {
				(bySlot[trigger] ??= []).push(resolved);
			}
		} catch (e) {
			console.warn(`Shimeji Buddy: could not load "${anim.sourceImage}" for animation "${anim.name}"`, e);
		}
	}

	// Each step reuses one of this character's own animations (by id) for its
	// visual - no separate slicing/upload flow of its own, just a reference.
	const animationById = new Map(file.animations.map((a) => [a.id, a]));
	for (const seq of file.sequences) {
		if (!seq.enabled || seq.steps.length === 0 || seq.triggers.length === 0) continue;
		try {
			const steps: ResolvedSequenceStep[] = [];
			for (const step of seq.steps) {
				const anim = step.animationId ? animationById.get(step.animationId) : undefined;
				let clip: ResolvedAnimation | null = null;
				if (anim && anim.sourceImage && anim.frames.length > 0) {
					const img = await loadImage(anim.sourceImage);
					clip = {
						imageUrl: img.url,
						imageWidth: img.width,
						imageHeight: img.height,
						frames: anim.frames,
						fps: Math.max(1, anim.fps),
						loop: anim.loop,
					};
				}
				steps.push({
					clip,
					durationMs: Math.max(0, step.durationMs),
					hidden: step.hidden,
					movement: step.movement,
					say: step.say,
				});
			}
			const resolved: WeightedSequence = { kind: "sequence", weight: Math.max(0, seq.weight), steps };
			for (const trigger of seq.triggers) {
				(bySlot[trigger] ??= []).push(resolved);
			}
		} catch (e) {
			console.warn(`Shimeji Buddy: could not load sequence "${seq.name}"`, e);
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
