/**
 * The pixel arithmetic behind the sprite-sheet editor: colour-key transparency, automatic frame
 * detection, and anchor derivation.
 *
 * Everything here works on a plain `{ data, width, height }` buffer rather than a canvas. That is
 * the whole point of the file existing separately from `imageIo.ts`: a canvas needs a browser, and
 * the test environment is jsdom, which has no 2D context at all. Handing these functions a
 * hand-built `Uint8ClampedArray` means the flood fill and the anchor maths can be checked against
 * pixel patterns written out by hand in a test, instead of being trusted because they look right.
 *
 * Ported from the shimeji-buddy plugin (`src/spritePack.ts`), where the same algorithms were
 * written directly against `CanvasRenderingContext2D`.
 */

/** A decoded image, in the same RGBA byte layout as `ImageData`. */
export interface Pixels {
	data: Uint8ClampedArray;
	width: number;
	height: number;
}

/** A frame's crop box, in the source image's own pixel coordinates. */
export interface FrameRect {
	x: number;
	y: number;
	w: number;
	h: number;
}

export interface Rgb {
	r: number;
	g: number;
	b: number;
}

/** Alpha at or below this counts as "not part of the sprite" when locating its feet. Not zero:
 * anti-aliased art fades out gradually, and a stray 1/255 pixel two rows below the boots would
 * otherwise decide where the mascot stands. */
const OPAQUE_ALPHA_MIN = 8;

export function rgbToHex(c: Rgb): string {
	const h = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
	return `#${h(c.r)}${h(c.g)}${h(c.b)}`;
}

export function hexToRgb(hex: string): Rgb {
	const n = parseInt(hex.replace(/^#/, ""), 16);
	return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** Reads one pixel's colour, clamped to the image so an out-of-range probe returns an edge pixel
 * rather than reading past the end of the buffer. */
export function samplePixel(pixels: Pixels, x: number, y: number): Rgb {
	const px = Math.max(0, Math.min(Math.round(x), pixels.width - 1));
	const py = Math.max(0, Math.min(Math.round(y), pixels.height - 1));
	const i = (py * pixels.width + px) * 4;
	return { r: pixels.data[i], g: pixels.data[i + 1], b: pixels.data[i + 2] };
}

/** Euclidean distance in RGB, to the nearest of several colours. */
function nearestColorDistance(data: Uint8ClampedArray, i: number, colors: Rgb[]): number {
	let min = Infinity;
	for (const c of colors) {
		const dr = data[i] - c.r;
		const dg = data[i + 1] - c.g;
		const db = data[i + 2] - c.b;
		const dist = Math.sqrt(dr * dr + dg * dg + db * db);
		if (dist < min) min = dist;
	}
	return min;
}

/**
 * Colour-key transparency: every pixel close to any of `colors` becomes transparent, with a short
 * feathered falloff just past the tolerance so the cut edge is not a hard staircase.
 *
 * Takes a list rather than one colour because a scraped sheet's background is often not perfectly
 * uniform — JPEG artefacting around the sprite leaves a halo of near-matches, and some sheets mix
 * two matte shades outright. This only matches colours; it does not attempt to tell foreground
 * from background, which is exactly why it copes with art of any resolution or quality.
 *
 * Mutates `pixels` in place and returns it.
 */
export function applyColorKey(pixels: Pixels, colors: Rgb[], tolerance: number): Pixels {
	if (colors.length === 0) return pixels;
	const { data } = pixels;
	const feather = Math.max(1, tolerance * 0.3);
	for (let i = 0; i < data.length; i += 4) {
		const dist = nearestColorDistance(data, i, colors);
		if (dist <= tolerance) {
			data[i + 3] = 0;
		} else if (dist <= tolerance + feather) {
			// 0 at the fully-transparent edge, 1 at fully-opaque.
			const t = (dist - tolerance) / feather;
			data[i + 3] = Math.round(data[i + 3] * t);
		}
	}
	return pixels;
}

export interface DetectFramesOptions {
	/** Colours treated as empty space. Already-transparent pixels always count as empty too. */
	backgroundColors: Rgb[];
	tolerance: number;
	/** Blobs smaller than this many pixels are discarded — filters out dithering specks and noise. */
	minArea: number;
	/** Boxes within this distance of each other are merged, reuniting a sprite whose limbs were
	 * split apart by background-coloured gaps inside its own silhouette. */
	mergeDistance: number;
}

function boxGap(a: FrameRect, b: FrameRect): number {
	const dx = Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w), 0);
	const dy = Math.max(a.y - (b.y + b.h), b.y - (a.y + a.h), 0);
	return Math.max(dx, dy);
}

function mergeBoxes(a: FrameRect, b: FrameRect): FrameRect {
	const x = Math.min(a.x, b.x);
	const y = Math.min(a.y, b.y);
	return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

/** Repeatedly merges any two boxes within `distance` until nothing else can merge. Iterative rather
 * than a single pass because merging two boxes grows the result, which can bring a third box that
 * was previously too far away into range. */
function mergeCloseBoxes(boxes: FrameRect[], distance: number): FrameRect[] {
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

/**
 * Orders boxes top-to-bottom, left-to-right — grouping them into rows by vertical overlap first.
 *
 * Sorting purely by y would interleave two frames on the same row whose tops differ by a pixel, so
 * a row is "everything that overlaps this box vertically by more than half its height", and only
 * then is each row sorted by x. Sprite sheets are laid out in rows even when the frames within a
 * row are not aligned.
 */
function sortReadingOrder(boxes: FrameRect[]): FrameRect[] {
	const rows: FrameRect[][] = [];
	for (const box of boxes.slice().sort((a, b) => a.y - b.y)) {
		const row = rows.find((r) => {
			const ref = r[0];
			const overlap = Math.min(box.y + box.h, ref.y + ref.h) - Math.max(box.y, ref.y);
			return overlap > 0.5 * Math.min(box.h, ref.h);
		});
		if (row) row.push(box);
		else rows.push([box]);
	}
	rows.sort((a, b) => Math.min(...a.map((r) => r.y)) - Math.min(...b.map((r) => r.y)));
	return rows.flatMap((row) => row.sort((a, b) => a.x - b.x));
}

/**
 * Finds each sprite's bounding box on a sheet with no usable grid, the way a sprite-splitter tool
 * does: treat anything matching a background colour (or already transparent) as empty, flood-fill
 * each remaining connected blob, and take its extent.
 *
 * Connectivity is 8-way, so a diagonal chain of pixels counts as joined — with 4-way, dithered or
 * pixel-art outlines routinely fall apart into a dozen separate specks.
 *
 * Typed arrays and an explicit queue rather than recursion: a several-thousand-pixel-wide sheet is
 * millions of pixels, and a recursive fill would exhaust the stack long before it finished.
 */
export function detectFrames(pixels: Pixels, options: DetectFramesOptions): FrameRect[] {
	const { width, height, data } = pixels;
	const { backgroundColors, tolerance } = options;

	const isBackground = (pixelIdx: number): boolean => {
		if (data[pixelIdx + 3] === 0) return true;
		return nearestColorDistance(data, pixelIdx, backgroundColors) <= tolerance;
	};

	const visited = new Uint8Array(width * height);
	const queue = new Int32Array(width * height);
	const boxes: Array<FrameRect & { area: number }> = [];

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
	let rects: FrameRect[] = boxes.filter((b) => b.area >= minArea).map(({ x, y, w, h }) => ({ x, y, w, h }));
	if (options.mergeDistance > 0) rects = mergeCloseBoxes(rects, options.mergeDistance);
	return sortReadingOrder(rects);
}

/**
 * Where a frame's anchor goes: the horizontal centre of its opaque pixels, at the bottom of them.
 *
 * This has no counterpart in shimeji-buddy — it scaled every clip against the character's tallest
 * frame and positioned by its own rules, so it never needed to know where a sprite's feet were. A
 * real pack's `ImageAnchor` is exactly that point (`64,128` on a 128x128 pose is bottom centre),
 * and it is what the engine stands on a floor, so a sliced frame has to supply one.
 *
 * Measuring the silhouette rather than assuming the middle of the box matters for a grid cell with
 * slack around the art: the sprite is rarely centred in its cell, and taking `w/2, h` would leave
 * the mascot hovering above the floor and drifting sideways as poses change. A fully transparent
 * frame has no silhouette to measure, and falls back to the bottom centre of the box.
 *
 * Returned relative to the frame's own top-left corner, which is what `ImageAnchor` means.
 */
export function deriveAnchor(pixels: Pixels, rect: FrameRect): { x: number; y: number } {
	const { data, width } = pixels;
	let minX = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;

	const x0 = Math.max(0, rect.x);
	const y0 = Math.max(0, rect.y);
	const x1 = Math.min(pixels.width, rect.x + rect.w);
	const y1 = Math.min(pixels.height, rect.y + rect.h);

	for (let y = y0; y < y1; y++) {
		for (let x = x0; x < x1; x++) {
			if (data[(y * width + x) * 4 + 3] < OPAQUE_ALPHA_MIN) continue;
			if (x < minX) minX = x;
			if (x > maxX) maxX = x;
			if (y > maxY) maxY = y;
		}
	}

	if (maxY < 0) return { x: Math.round(rect.w / 2), y: rect.h };
	return {
		x: Math.round((minX + maxX + 1) / 2) - rect.x,
		// The anchor sits on the floor, so it is the bottom *edge* of the lowest opaque row, not
		// that row's own index — one pixel lower.
		y: maxY + 1 - rect.y,
	};
}

/** Evenly divides a length into `count` boundaries, inclusive of both ends — the slicer's starting
 * grid. Rounded so every boundary lands on a whole source pixel. */
export function evenBoundaries(total: number, count: number): number[] {
	const n = Math.max(1, Math.floor(count));
	return Array.from({ length: n + 1 }, (_, i) => Math.round((i * total) / n));
}

/**
 * Turns a cell index into its crop box, given the grid's boundaries.
 *
 * `gapX`/`gapY` are trimmed off the far edge of every cell, for sheets exported with a gutter
 * around each frame — the boundary marks where the next cell begins, and the gutter is the part of
 * this cell that is padding rather than art.
 */
export function cellRect(
	colBoundaries: number[],
	rowBoundaries: number[],
	cellIndex: number,
	gapX = 0,
	gapY = 0,
): FrameRect {
	const cols = colBoundaries.length - 1;
	const col = cellIndex % cols;
	const row = Math.floor(cellIndex / cols);
	const x = colBoundaries[col];
	const y = rowBoundaries[row];
	return {
		x: Math.round(x),
		y: Math.round(y),
		w: Math.max(1, Math.round(colBoundaries[col + 1] - x - gapX)),
		h: Math.max(1, Math.round(rowBoundaries[row + 1] - y - gapY)),
	};
}

/** Splits a full image into `count` equal-width frames across its whole height — the shortcut for
 * an evenly-spaced horizontal strip, which needs no grid fiddling at all. */
export function stripFrames(imageWidth: number, imageHeight: number, count: number): FrameRect[] {
	const n = Math.max(1, Math.floor(count));
	const frameWidth = imageWidth / n;
	return Array.from({ length: n }, (_, i) => ({
		x: Math.round(i * frameWidth),
		y: 0,
		w: Math.round(frameWidth),
		h: imageHeight,
	}));
}

/** Whether two crop boxes are the same — used to point a frame reused via shift-click at the file
 * already written for it rather than writing identical bytes twice. */
export function sameRect(a: FrameRect, b: FrameRect): boolean {
	return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}

/**
 * Copies one frame's box out of a sheet into a buffer of its own.
 *
 * The crop is the box as selected, never trimmed down to the art inside it: every frame of an
 * animation then has the same dimensions, which is what a hand-made pack looks like, and the
 * anchor is what positions the sprite. Trimming each frame to its own silhouette instead would
 * make the pose files disagree about their own size for no gain.
 *
 * A box running past the edge of the sheet keeps its requested size and leaves the outside
 * transparent, rather than returning a smaller image than the caller asked for.
 */
export function cropPixels(pixels: Pixels, rect: FrameRect): Pixels {
	const w = Math.max(1, Math.round(rect.w));
	const h = Math.max(1, Math.round(rect.h));
	const out = new Uint8ClampedArray(w * h * 4);
	for (let y = 0; y < h; y++) {
		const sy = rect.y + y;
		// The row guard is belt-and-braces — an out-of-range row indexes past either end of the
		// buffer, and reading there yields undefined, which lands as 0 anyway. The column guard
		// below is not: one pixel past the right edge is a real index, holding the first pixel of
		// the *next row*, so without it a crop touching the edge quietly wraps art into itself.
		if (sy < 0 || sy >= pixels.height) continue;
		for (let x = 0; x < w; x++) {
			const sx = rect.x + x;
			if (sx < 0 || sx >= pixels.width) continue;
			const from = (sy * pixels.width + sx) * 4;
			const to = (y * w + x) * 4;
			out[to] = pixels.data[from];
			out[to + 1] = pixels.data[from + 1];
			out[to + 2] = pixels.data[from + 2];
			out[to + 3] = pixels.data[from + 3];
		}
	}
	return { data: out, width: w, height: h };
}
