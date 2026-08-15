import { PALETTE, roomSurfaces, roomWalls, type Painter, type RoomDef, type RoomMood } from "./roomDef";

/**
 * Paints a room to a canvas.
 *
 * Everything is drawn once at room resolution into an offscreen buffer and then blitted up with
 * smoothing off, which is the only way to get honest pixel art: drawing the fixtures directly at
 * display scale would round each rectangle's edges independently and leave seams and half-pixels
 * between neighbouring shapes.
 */

/** After dark. Chosen rather than sampled from Obsidian's theme on purpose — the window looks out of
 * the building, and a light theme at 11pm should still show a night sky. */
const DUSK_START_HOUR = 19;
const DUSK_END_HOUR = 6;

export function moodForHour(hour: number): RoomMood {
	return { dusk: hour >= DUSK_START_HOUR || hour < DUSK_END_HOUR };
}

function painterFor(ctx: CanvasRenderingContext2D): Painter {
	return {
		px(x, y, w, h, color) {
			ctx.fillStyle = color;
			ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
		},
		polygon(points, color) {
			ctx.fillStyle = color;
			ctx.beginPath();
			ctx.moveTo(points[0][0], points[0][1]);
			for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
			ctx.closePath();
			ctx.fill();
		},
	};
}

/** Draws the room into `canvas`, sized and mirrored to match a RoomLayout. */
export function paintRoom(canvas: HTMLCanvasElement, def: RoomDef, mood: RoomMood, opts: { scale: number; mirrored: boolean; devicePixelRatio?: number }): void {
	const buffer = document.createElement("canvas");
	buffer.width = def.width;
	buffer.height = def.height;
	const bufferCtx = buffer.getContext("2d");
	if (!bufferCtx) return;
	const painter = painterFor(bufferCtx);
	for (const fixture of def.fixtures) fixture.paint(painter, mood);

	// The CSS size is the layout's scale; the backing store is multiplied again by the display's
	// own ratio so the art stays crisp on a HiDPI screen instead of being upscaled by the compositor.
	const dpr = Math.max(1, Math.round(opts.devicePixelRatio ?? window.devicePixelRatio ?? 1));
	const cssW = def.width * opts.scale;
	const cssH = def.height * opts.scale;
	canvas.width = cssW * dpr;
	canvas.height = cssH * dpr;
	canvas.style.width = `${cssW}px`;
	canvas.style.height = `${cssH}px`;

	const ctx = canvas.getContext("2d");
	if (!ctx) return;
	ctx.imageSmoothingEnabled = false;
	ctx.clearRect(0, 0, canvas.width, canvas.height);
	ctx.save();
	if (opts.mirrored) {
		ctx.translate(canvas.width, 0);
		ctx.scale(-1, 1);
	}
	ctx.drawImage(buffer, 0, 0, canvas.width, canvas.height);
	ctx.restore();
}

/** The wall colour, so the pane around the room matches it and the room doesn't look like a
 * picture hung in a void. */
export const ROOM_BACKDROP = PALETTE.wall;
export const ROOM_BACKDROP_DUSK = "#b9b0a0";

/**
 * Draws supplied artwork into the room square, fitted rather than stretched.
 *
 * "Contain", not "cover" and not a stretch: the whole picture is always visible and its proportions
 * are never touched. A square source in a square room square fills it exactly; anything else is
 * letterboxed, and the surround is the pane's own background colour — the one thing that gives.
 */
export function drawRoomImage(canvas: HTMLCanvasElement, image: HTMLImageElement, def: RoomDef, opts: { scale: number; devicePixelRatio?: number }): void {
	const dpr = Math.max(1, Math.round(opts.devicePixelRatio ?? window.devicePixelRatio ?? 1));
	const cssW = def.width * opts.scale;
	const cssH = def.height * opts.scale;
	canvas.width = Math.round(cssW * dpr);
	canvas.height = Math.round(cssH * dpr);
	canvas.style.width = `${cssW}px`;
	canvas.style.height = `${cssH}px`;

	const ctx = canvas.getContext("2d");
	if (!ctx) return;
	ctx.clearRect(0, 0, canvas.width, canvas.height);
	if (image.naturalWidth === 0 || image.naturalHeight === 0) return;

	// Smoothing on when shrinking, off when enlarging. A sidebar is narrower than this kind of art,
	// so shrinking is the normal case, and nearest-neighbour downscaling of pixel art drops whole
	// rows of pixels — thin outlines vanish and the picture comes apart. Enlarging is the opposite:
	// smoothing is exactly what makes upscaled pixel art look blurry.
	const shrinking = image.naturalWidth > canvas.width;
	ctx.imageSmoothingEnabled = shrinking;
	if (shrinking) ctx.imageSmoothingQuality = "high";

	const fit = Math.min(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight);
	const w = image.naturalWidth * fit;
	const h = image.naturalHeight * fit;
	ctx.drawImage(image, Math.round((canvas.width - w) / 2), Math.round((canvas.height - h) / 2), Math.round(w), Math.round(h));
}

/**
 * The surround, sampled from the artwork's own top-left pixel.
 *
 * Guessing a colour to sit behind somebody's illustration is how you get a visible seam. Reading it
 * off the image means the pane and the picture are the same shade by construction, whatever the art
 * happens to be.
 */
export function sampleBackdrop(image: HTMLImageElement): string | undefined {
	if (image.naturalWidth === 0) return undefined;
	const probe = document.createElement("canvas");
	probe.width = 1;
	probe.height = 1;
	const ctx = probe.getContext("2d", { willReadFrequently: true });
	if (!ctx) return undefined;
	try {
		ctx.drawImage(image, 0, 0, 1, 1, 0, 0, 1, 1);
		const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
		return `rgb(${r}, ${g}, ${b})`;
	} catch {
		// A cross-origin image taints the canvas. Not expected for a vault file, but a thrown
		// SecurityError here would take the whole room down with it.
		return undefined;
	}
}

/**
 * Draws the room's collision surfaces over whatever is beneath — the answer to "is the bed line in
 * the right place".
 *
 * Geometry authored against supplied artwork is the one part of the room that cannot be verified by
 * reasoning: `paint` and `surfaces` are the same declaration in a painted room and cannot disagree,
 * but an image knows nothing about the lines drawn on top of it. So the lines are made visible
 * instead, and moving one is then a matter of reading a number off the screen.
 */
export function drawSurfaceOverlay(canvas: HTMLCanvasElement, def: RoomDef, opts: { scale: number; mirrored: boolean }): void {
	const ctx = canvas.getContext("2d");
	if (!ctx) return;
	const dpr = canvas.width / (def.width * opts.scale);
	const at = (x: number): number => (opts.mirrored ? (def.width - x) : x) * opts.scale * dpr;
	const down = (y: number): number => y * opts.scale * dpr;

	ctx.save();
	ctx.lineWidth = Math.max(1, Math.round(dpr));
	for (const s of roomSurfaces(def)) {
		ctx.strokeStyle = s.kind === "floor" ? "rgba(109,224,120,0.95)" : "rgba(255,196,84,0.95)";
		ctx.setLineDash(s.kind === "floor" ? [] : [4 * dpr, 3 * dpr]);
		ctx.beginPath();
		ctx.moveTo(at(s.x1), down(s.y));
		ctx.lineTo(at(s.x2), down(s.y));
		ctx.stroke();
	}
	ctx.setLineDash([]);
	ctx.strokeStyle = "rgba(120,180,255,0.95)";
	for (const w of roomWalls(def)) {
		ctx.beginPath();
		ctx.moveTo(at(w.x), down(w.y1));
		ctx.lineTo(at(w.x), down(w.y2));
		ctx.stroke();
	}
	ctx.restore();
}
