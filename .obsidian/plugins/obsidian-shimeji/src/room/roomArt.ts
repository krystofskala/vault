import { PALETTE, type Painter, type RoomDef, type RoomMood } from "./roomDef";

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
