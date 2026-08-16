import { describe, expect, it } from "vitest";
import {
	applyColorKey,
	cellRect,
	compositeIntoFrame,
	cropPixels,
	deriveAnchor,
	detectFrames,
	evenBoundaries,
	hexToRgb,
	rgbToHex,
	sameRect,
	samplePixel,
	stripFrames,
	type Pixels,
} from "../src/sprites/pixels";
import { planPoseSlices, poseFileBaseName, posesFromPlan } from "../src/sprites/poseSlicing";

/**
 * Builds a pixel buffer from rows of single characters, so a test can state the sprite it means
 * instead of computing byte offsets. "." is transparent; every other character is looked up in the
 * palette, defaulting to opaque white for "#" and opaque black for "k".
 */
function pixelsFrom(rows: string[], palette: Record<string, [number, number, number, number]> = {}): Pixels {
	const table: Record<string, [number, number, number, number]> = {
		".": [0, 0, 0, 0],
		"#": [255, 255, 255, 255],
		k: [0, 0, 0, 255],
		...palette,
	};
	const width = rows[0].length;
	const height = rows.length;
	const data = new Uint8ClampedArray(width * height * 4);
	rows.forEach((row, y) => {
		if (row.length !== width) throw new Error(`row ${y} is ${row.length} wide, expected ${width}`);
		[...row].forEach((ch, x) => {
			const rgba = table[ch];
			if (!rgba) throw new Error(`no palette entry for "${ch}"`);
			data.set(rgba, (y * width + x) * 4);
		});
	});
	return { data, width, height };
}

function alphaAt(pixels: Pixels, x: number, y: number): number {
	return pixels.data[(y * pixels.width + x) * 4 + 3];
}

describe("colour conversion", () => {
	it("round-trips through hex", () => {
		expect(rgbToHex({ r: 18, g: 52, b: 86 })).toBe("#123456");
		expect(hexToRgb("#123456")).toEqual({ r: 18, g: 52, b: 86 });
	});

	it("clamps a probe to the image rather than reading past the buffer", () => {
		const pixels = pixelsFrom([".#", "k."]);
		expect(samplePixel(pixels, 1, 0)).toEqual({ r: 255, g: 255, b: 255 });
		expect(samplePixel(pixels, 99, 99)).toEqual({ r: 0, g: 0, b: 0 }); // clamped to (1,1)
	});
});

describe("applyColorKey", () => {
	const black: [number, number, number, number] = [0, 0, 0, 255];
	const near: [number, number, number, number] = [5, 0, 0, 255];
	const edge: [number, number, number, number] = [12, 0, 0, 255];
	const far: [number, number, number, number] = [200, 0, 0, 255];

	it("erases exact and near matches, feathers the edge, and leaves the rest alone", () => {
		const pixels = pixelsFrom(["bnef"], { b: black, n: near, e: edge, f: far });
		applyColorKey(pixels, [{ r: 0, g: 0, b: 0 }], 10);

		expect(alphaAt(pixels, 0, 0)).toBe(0); // distance 0
		expect(alphaAt(pixels, 1, 0)).toBe(0); // distance 5, inside tolerance
		// distance 12: past the tolerance but inside the 3-wide feather, so partially transparent.
		expect(alphaAt(pixels, 2, 0)).toBe(170);
		expect(alphaAt(pixels, 3, 0)).toBe(255); // distance 200, untouched
	});

	it("keys out every listed colour, not just the first", () => {
		const pixels = pixelsFrom(["bf"], { b: black, f: far });
		applyColorKey(pixels, [{ r: 0, g: 0, b: 0 }, { r: 200, g: 0, b: 0 }], 4);
		expect(alphaAt(pixels, 0, 0)).toBe(0);
		expect(alphaAt(pixels, 1, 0)).toBe(0);
	});

	it("does nothing at all when given no colours", () => {
		const pixels = pixelsFrom(["bf"], { b: black, f: far });
		applyColorKey(pixels, [], 255);
		expect(alphaAt(pixels, 0, 0)).toBe(255);
		expect(alphaAt(pixels, 1, 0)).toBe(255);
	});
});

describe("detectFrames", () => {
	const opts = { backgroundColors: [{ r: 0, g: 0, b: 0 }], tolerance: 10, minArea: 1, mergeDistance: 0 };

	it("finds each separate blob's bounding box", () => {
		const pixels = pixelsFrom([
			"..........",
			".##....##.",
			".##....##.",
			"..........",
		]);
		expect(detectFrames(pixels, opts)).toEqual([
			{ x: 1, y: 1, w: 2, h: 2 },
			{ x: 7, y: 1, w: 2, h: 2 },
		]);
	});

	it("treats already-transparent pixels as empty even when no colour matches them", () => {
		// The background here is transparent, and the only listed key colour is black, which does
		// not appear anywhere. Without the alpha check the whole sheet would be one blob.
		const pixels = pixelsFrom(["....", ".#..", "....", "...#"]);
		expect(detectFrames(pixels, { ...opts, backgroundColors: [{ r: 99, g: 99, b: 99 }] })).toEqual([
			{ x: 1, y: 1, w: 1, h: 1 },
			{ x: 3, y: 3, w: 1, h: 1 },
		]);
	});

	it("joins diagonally-touching pixels into one blob", () => {
		// 4-way connectivity would report two separate specks here.
		const pixels = pixelsFrom(["#..", ".#.", "..#"]);
		expect(detectFrames(pixels, opts)).toEqual([{ x: 0, y: 0, w: 3, h: 3 }]);
	});

	it("discards blobs below the minimum area", () => {
		const pixels = pixelsFrom(["##..", "##..", "....", "...#"]);
		expect(detectFrames(pixels, { ...opts, minArea: 4 })).toEqual([{ x: 0, y: 0, w: 2, h: 2 }]);
	});

	it("merges boxes within the merge gap, and leaves them apart beyond it", () => {
		// Two columns separated by two empty pixels — a sprite split by a gap inside its silhouette.
		const pixels = pixelsFrom(["#..#", "#..#"]);
		expect(detectFrames(pixels, { ...opts, mergeDistance: 3 })).toEqual([{ x: 0, y: 0, w: 4, h: 2 }]);
		expect(detectFrames(pixels, { ...opts, mergeDistance: 1 })).toHaveLength(2);
	});

	it("orders frames left-to-right within a row even when the row is not aligned", () => {
		// The right-hand sprite starts a pixel higher, so sorting purely by y would put it first.
		const pixels = pixelsFrom([
			".....##.",
			".##..##.",
			".##..##.",
			"........",
		]);
		const found = detectFrames(pixels, opts);
		expect(found.map((r) => r.x)).toEqual([1, 5]);
	});

	it("orders rows top to bottom", () => {
		const pixels = pixelsFrom(["....", ".#..", "....", "..#."]);
		expect(detectFrames(pixels, opts)).toEqual([
			{ x: 1, y: 1, w: 1, h: 1 },
			{ x: 2, y: 3, w: 1, h: 1 },
		]);
	});
});

describe("deriveAnchor", () => {
	it("puts the anchor at the feet of the art, not the middle of the box", () => {
		// The sprite sits left of centre and well above the bottom of its 8x8 cell.
		const pixels = pixelsFrom([
			"........",
			"........",
			"..##....",
			"..##....",
			"..##....",
			"........",
			"........",
			"........",
		]);
		// Opaque columns 2..3, lowest opaque row 4. Centre of 2..3 is 3; the floor is row 4's
		// bottom edge, which is 5.
		expect(deriveAnchor(pixels, { x: 0, y: 0, w: 8, h: 8 })).toEqual({ x: 3, y: 5 });
	});

	it("reports the anchor relative to the frame, not the sheet", () => {
		const pixels = pixelsFrom([
			"........",
			"........",
			"........",
			"........",
			"....##..",
			"....##..",
			"........",
			"........",
		]);
		// Same art, addressed as a cell starting at (4,4): the anchor is inside that cell's space.
		expect(deriveAnchor(pixels, { x: 4, y: 4, w: 4, h: 4 })).toEqual({ x: 1, y: 2 });
	});

	it("ignores all-but-invisible pixels so a stray faint speck cannot move the feet", () => {
		const faint: [number, number, number, number] = [255, 255, 255, 4];
		const pixels = pixelsFrom(["##..", "##..", "....", "f..."], { f: faint });
		// The faint pixel on the last row is below the sprite; if it counted, y would be 4.
		expect(deriveAnchor(pixels, { x: 0, y: 0, w: 4, h: 4 })).toEqual({ x: 1, y: 2 });
	});

	it("falls back to the bottom centre of a frame with nothing in it", () => {
		const pixels = pixelsFrom(["....", "....", "....", "...."]);
		expect(deriveAnchor(pixels, { x: 0, y: 0, w: 4, h: 4 })).toEqual({ x: 2, y: 4 });
	});
});

describe("grid geometry", () => {
	it("divides evenly, inclusive of both ends", () => {
		expect(evenBoundaries(100, 4)).toEqual([0, 25, 50, 75, 100]);
		expect(evenBoundaries(10, 3)).toEqual([0, 3, 7, 10]);
	});

	it("trims the gutter off the far edge of each cell", () => {
		const cols = [0, 20, 40];
		const rows = [0, 30];
		expect(cellRect(cols, rows, 0, 4, 6)).toEqual({ x: 0, y: 0, w: 16, h: 24 });
		expect(cellRect(cols, rows, 1, 4, 6)).toEqual({ x: 20, y: 0, w: 16, h: 24 });
		expect(cellRect(cols, rows, 1)).toEqual({ x: 20, y: 0, w: 20, h: 30 });
	});

	it("indexes cells across rows", () => {
		const cols = [0, 10, 20];
		const rows = [0, 10, 20];
		expect(cellRect(cols, rows, 2)).toEqual({ x: 0, y: 10, w: 10, h: 10 });
		expect(cellRect(cols, rows, 3)).toEqual({ x: 10, y: 10, w: 10, h: 10 });
	});

	it("splits a strip into equal frames spanning the full height", () => {
		expect(stripFrames(60, 40, 3)).toEqual([
			{ x: 0, y: 0, w: 20, h: 40 },
			{ x: 20, y: 0, w: 20, h: 40 },
			{ x: 40, y: 0, w: 20, h: 40 },
		]);
	});

	it("compares crop boxes by value", () => {
		expect(sameRect({ x: 1, y: 2, w: 3, h: 4 }, { x: 1, y: 2, w: 3, h: 4 })).toBe(true);
		expect(sameRect({ x: 1, y: 2, w: 3, h: 4 }, { x: 1, y: 2, w: 3, h: 5 })).toBe(false);
	});
});

describe("cropPixels", () => {
	it("copies the requested box", () => {
		const pixels = pixelsFrom(["k#k#", "#kk#", "kk##"]);
		const cropped = cropPixels(pixels, { x: 1, y: 0, w: 2, h: 2 });
		expect(cropped.width).toBe(2);
		expect(cropped.height).toBe(2);
		expect([...cropped.data.slice(0, 4)]).toEqual([255, 255, 255, 255]); // (1,0) was "#"
		expect([...cropped.data.slice(4, 8)]).toEqual([0, 0, 0, 255]); // (2,0) was "k"
	});

	it("keeps the requested size when the box runs off the sheet, leaving the outside clear", () => {
		// Deliberately a sheet whose rows differ: reading one pixel past the right edge lands on
		// the start of the *next row* in a flat buffer, so a sheet of uniform pixels would hide
		// that bug behind a correct-looking answer.
		const pixels = pixelsFrom(["#k", "kk"]);
		const cropped = cropPixels(pixels, { x: 1, y: 0, w: 2, h: 2 });
		expect(cropped.width).toBe(2);
		expect(cropped.height).toBe(2);

		expect(alphaAt(cropped, 0, 0)).toBe(255); // sheet (1,0), a real pixel
		// Sheet (2,0) does not exist. Row-wrapping would pick up sheet (0,1) instead, which is
		// opaque — so this staying transparent is what proves the crop is clipped, not wrapped.
		expect(alphaAt(cropped, 1, 0)).toBe(0);
		expect(alphaAt(cropped, 1, 1)).toBe(0);
	});

	it("clips a box starting off the top-left of the sheet", () => {
		const pixels = pixelsFrom(["#k", "kk"]);
		const cropped = cropPixels(pixels, { x: -1, y: -1, w: 2, h: 2 });
		expect(alphaAt(cropped, 0, 0)).toBe(0); // off the sheet
		expect(alphaAt(cropped, 1, 1)).toBe(255); // sheet (0,0)
	});
});

describe("compositeIntoFrame", () => {
	it("copies the source through unchanged at offset 0,0 and scale 1", () => {
		const source = pixelsFrom(["k#", "#k"]);
		const framed = compositeIntoFrame(source, { offsetX: 0, offsetY: 0, scale: 1 }, 2);
		expect(framed.width).toBe(2);
		expect(framed.height).toBe(2);
		expect(alphaAt(framed, 0, 0)).toBe(255);
		expect([...framed.data.slice(0, 3)]).toEqual([0, 0, 0]); // (0,0) was "k"
		expect([...framed.data.slice(4, 7)]).toEqual([255, 255, 255]); // (1,0) was "#"
	});

	it("pans the source by offsetX/offsetY", () => {
		// A single opaque pixel at source (0,0), panned to land at target (1,1) in a 3x3 frame.
		const source = pixelsFrom(["k"]);
		const framed = compositeIntoFrame(source, { offsetX: 1, offsetY: 1, scale: 1 }, 3);
		expect(alphaAt(framed, 1, 1)).toBe(255);
		expect(alphaAt(framed, 0, 0)).toBe(0);
		expect(alphaAt(framed, 2, 2)).toBe(0);
	});

	it("zooms: one source pixel covers a scale x scale block of target pixels", () => {
		const source = pixelsFrom(["k#"]);
		const framed = compositeIntoFrame(source, { offsetX: 0, offsetY: 0, scale: 2 }, 4);
		// Source (0,0)="k" now covers target (0,0)-(1,1); source (1,0)="#" covers (2,0)-(3,1).
		for (const [x, y] of [
			[0, 0],
			[1, 0],
			[0, 1],
			[1, 1],
		]) {
			expect(alphaAt(framed, x, y)).toBe(255);
			expect([...framed.data.slice((y * 4 + x) * 4, (y * 4 + x) * 4 + 3)]).toEqual([0, 0, 0]);
		}
		expect([...framed.data.slice((0 * 4 + 2) * 4, (0 * 4 + 2) * 4 + 3)]).toEqual([255, 255, 255]);
	});

	it("clips source content that falls outside the fixed frame — the wizard's only 'crop' step", () => {
		const source = pixelsFrom(["kkkk"]); // wider than the frame
		const framed = compositeIntoFrame(source, { offsetX: 0, offsetY: 0, scale: 1 }, 2);
		expect(framed.width).toBe(2); // never grows to fit the source
		expect(alphaAt(framed, 0, 0)).toBe(255);
		expect(alphaAt(framed, 1, 0)).toBe(255);
	});

	it("leaves frame pixels the source never reaches fully transparent", () => {
		const source = pixelsFrom(["k"]); // 1x1, far smaller than the frame
		const framed = compositeIntoFrame(source, { offsetX: 0, offsetY: 0, scale: 1 }, 3);
		expect(alphaAt(framed, 0, 0)).toBe(255);
		expect(alphaAt(framed, 1, 1)).toBe(0);
		expect(alphaAt(framed, 2, 2)).toBe(0);
	});

	it("treats a zero or negative scale as 1 rather than dividing by zero", () => {
		const source = pixelsFrom(["k"]);
		expect(() => compositeIntoFrame(source, { offsetX: 0, offsetY: 0, scale: 0 }, 2)).not.toThrow();
		const framed = compositeIntoFrame(source, { offsetX: 0, offsetY: 0, scale: -1 }, 2);
		expect(alphaAt(framed, 0, 0)).toBe(255); // fell back to scale 1, not NaN/Infinity coordinates
	});
});

describe("planPoseSlices", () => {
	const sheet = pixelsFrom([
		"##..##..",
		"##..##..",
		"........",
		"........",
	]);
	const a = { x: 0, y: 0, w: 2, h: 2 };
	const b = { x: 4, y: 0, w: 2, h: 2 };

	it("writes one file per distinct frame and points reuses at it", () => {
		// The 1,2,1 shape of a symmetric step cycle: three poses, two images.
		const plan = planPoseSlices(sheet, [a, b, a]);
		expect(plan.writes).toHaveLength(2);
		expect(plan.writes.map((w) => w.rect)).toEqual([a, b]);
		expect(plan.useIndex).toEqual([0, 1, 0]);
	});

	it("keeps distinct frames distinct", () => {
		const plan = planPoseSlices(sheet, [a, b]);
		expect(plan.writes).toHaveLength(2);
		expect(plan.useIndex).toEqual([0, 1]);
	});

	it("derives each frame's anchor from its own art", () => {
		const plan = planPoseSlices(sheet, [a]);
		expect(plan.writes[0].anchor).toEqual({ x: 1, y: 2 });
	});

	it("plans nothing for an empty selection", () => {
		expect(planPoseSlices(sheet, [])).toEqual({ writes: [], useIndex: [] });
	});
});

describe("posesFromPlan", () => {
	const sheet = pixelsFrom(["##..##..", "##..##..", "........", "........"]);
	const a = { x: 0, y: 0, w: 2, h: 2 };
	const b = { x: 4, y: 0, w: 2, h: 2 };

	it("emits one pose per selection, mapping reuses back to the same file", () => {
		const plan = planPoseSlices(sheet, [a, b, a]);
		const poses = posesFromPlan(plan, ["/walk-1.png", "/walk-2.png"], 8);

		expect(poses.map((p) => p.image)).toEqual(["/walk-1.png", "/walk-2.png", "/walk-1.png"]);
		expect(poses.map((p) => p.durationTicks)).toEqual([8, 8, 8]);
	});

	it("carries each frame's derived anchor onto its pose", () => {
		const plan = planPoseSlices(sheet, [a]);
		const [pose] = posesFromPlan(plan, ["/walk-1.png"], 10);
		expect({ x: pose.anchorX, y: pose.anchorY }).toEqual({ x: 1, y: 2 });
	});

	it("leaves velocity at zero — how far a step carries belongs to the action, not the picture", () => {
		const plan = planPoseSlices(sheet, [a, b]);
		for (const pose of posesFromPlan(plan, ["/a.png", "/b.png"], 10)) {
			expect(pose.velocityX).toBe(0);
			expect(pose.velocityY).toBe(0);
		}
	});

	it("gives every pose its own id", () => {
		const plan = planPoseSlices(sheet, [a, b, a]);
		const ids = posesFromPlan(plan, ["/a.png", "/b.png"], 10).map((p) => p.id);
		expect(new Set(ids).size).toBe(3);
	});

	it("never emits a duration below one tick", () => {
		const plan = planPoseSlices(sheet, [a]);
		expect(posesFromPlan(plan, ["/a.png"], 0)[0].durationTicks).toBe(1);
	});
});

describe("poseFileBaseName", () => {
	it("names files after the action, numbered from one", () => {
		expect(poseFileBaseName("Walk", 0)).toBe("Walk-1");
		expect(poseFileBaseName("Walk", 2)).toBe("Walk-3");
	});

	it("falls back to a generic stem for an unnamed action", () => {
		expect(poseFileBaseName("   ", 0)).toBe("pose-1");
	});
});
