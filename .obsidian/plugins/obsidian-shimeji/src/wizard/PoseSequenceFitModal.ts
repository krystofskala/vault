import { App, Modal, Notice, Setting } from "obsidian";
import type { CustomPoseSpec } from "../shimeji/customContent";
import { decodeVaultImage, overwriteVaultImageAsPng, packImagePath, pixelsToCanvas } from "../sprites/imageIo";
import {
	flipAnchorHorizontal,
	flipAnchorVertical,
	flipHorizontal,
	flipVertical,
	rotate90Clockwise,
	rotate90CounterClockwise,
	rotateAnchorClockwise,
	rotateAnchorCounterClockwise,
	type Pixels,
} from "../sprites/pixels";

export interface PoseSequenceFitModalOptions {
	imgDir: string;
	/** Already written to disk at their own path (by `SpriteSheetModal`, just before this opens),
	 * in slice order. The same objects are mutated in place (anchor only — orientation edits
	 * replace `pixels`, not this spec) and handed back unchanged in shape, so a caller can use
	 * `opts.poses` itself as a "nothing happened" fallback without keeping a separate copy. */
	poses: CustomPoseSpec[];
	/** Called once, with every pose in the original order/count — including ones the user never
	 * touched. Not called at all if the modal is dismissed (Escape/X/Cancel): the sliced files stay
	 * on disk exactly as `SpriteSheetModal` left them, same as any other abandoned slice, and the
	 * caller never learns about this batch. */
	onDone(poses: CustomPoseSpec[]): void | Promise<void>;
}

interface FrameState {
	pose: CustomPoseSpec;
	pixels: Pixels;
	/** `pixelsToCanvas(pixels)`, cached alongside — regenerated only when `pixels` itself changes
	 * (a flip/rotate), not on every redraw a drag triggers. */
	canvasEl: HTMLCanvasElement;
	/** Whether `pixels` differs from what is currently on disk at `pose.image`. An anchor nudge
	 * alone never sets this — the anchor lives on `pose`, which the caller gets back regardless of
	 * whether any file gets rewritten, so there is nothing to save for that case. */
	dirty: boolean;
}

const MAX_DISPLAY = 320;
const MAX_UPSCALE = 8;
const CHECKER_SIZE = 8;

/**
 * Walks through a batch of just-sliced animation frames one at a time — flip, rotate, and drag the
 * anchor to the feet — before they become part of an action's animation. Exists because
 * `SpriteSheetModal.onPoses` used to hand a multi-frame slice straight to its caller with no
 * per-frame review at all: fine for a sheet that already lines up with the standard shimeji pose
 * anchors, not fine for a frame that needs mirroring (a sheet with only rightward-facing art) or
 * came out rotated, and there was previously no way to fix either without leaving the modal
 * entirely and hand-editing the anchor as raw numbers in the advanced action editor.
 *
 * Deliberately NOT built on `PoseFitCanvas`: that canvas composites onto a fixed 128x128 frame
 * (`compositeIntoFrame`), which is exactly right for the standard schema's fixed-size pose slots
 * but would silently crop or rescale an arbitrary-size custom animation frame — the entire point of
 * slicing a game character's own sprite sheet is to keep frames at whatever size they actually are.
 * This works at each frame's native size instead, reusing only the pure, size-agnostic pixel
 * functions (`flipHorizontal`/`flipVertical`/`rotate90Clockwise`/`rotate90CounterClockwise` and
 * their anchor-transform counterparts, all from `pixels.ts`) that both editors share.
 *
 * Writes nothing to disk until "Finish": every edit lives only in `this.frames` until then, so
 * closing the modal early (Escape/X/Cancel) is always a clean no-op — the original slice, already
 * on disk, is simply left alone and never handed to `onDone`.
 */
export class PoseSequenceFitModal extends Modal {
	private frames: FrameState[] = [];
	private index = 0;
	private canvas!: HTMLCanvasElement;
	private ctx!: CanvasRenderingContext2D;
	private scale = 1;
	private dragging = false;
	private anchorLabelEl?: HTMLElement;

	constructor(app: App, private opts: PoseSequenceFitModalOptions) {
		super(app);
		this.modalEl.addClass("shimeji-wizard-modal");
	}

	async onOpen(): Promise<void> {
		this.setTitle("Finetune frames");
		const frames: FrameState[] = [];
		for (const pose of this.opts.poses) {
			const decoded = await decodeVaultImage(this.app, packImagePath(this.opts.imgDir, pose.image));
			if (!decoded) {
				// Shouldn't happen — SpriteSheetModal just wrote these — but a modal that can't show
				// what it's for is worse than skipping the finetune step; fall back to the caller's
				// own, already-correct default instead of a half-built editor.
				console.warn(`[obsidian-shimeji] couldn't reload "${pose.image}" for finetuning`);
				await this.opts.onDone(this.opts.poses);
				this.close();
				return;
			}
			frames.push({ pose, pixels: decoded.pixels, canvasEl: pixelsToCanvas(decoded.pixels), dirty: false });
		}
		this.frames = frames;
		this.render();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private render(): void {
		const { contentEl } = this;
		contentEl.empty();
		// Each render builds a fresh <canvas> with its own listeners; a drag in progress on the
		// previous one (e.g. a render triggered mid-gesture) has no element left to end on, so
		// nothing would otherwise clear this before the new canvas starts treating a plain hover as
		// a continued drag.
		this.dragging = false;
		const total = this.frames.length;
		this.setTitle(total > 1 ? `Finetune frames — ${this.index + 1} of ${total}` : "Finetune frame");

		contentEl.createEl("p", {
			cls: "setting-item-description",
			text: "Flip or rotate if this frame came out facing the wrong way, and click or drag on the image to move the anchor to its feet — where this pose plants against the ground.",
		});

		const wrap = contentEl.createDiv({ cls: "shimeji-poseseq" });
		this.canvas = wrap.createEl("canvas");
		const ctx = this.canvas.getContext("2d");
		if (!ctx) throw new Error("canvas 2D context unavailable");
		this.ctx = ctx;
		this.canvas.style.touchAction = "none";
		this.canvas.addEventListener("pointerdown", (e) => this.onPointerDown(e));
		this.canvas.addEventListener("pointermove", (e) => this.onPointerMove(e));
		this.canvas.addEventListener("pointerup", () => this.onPointerUp());
		this.canvas.addEventListener("pointercancel", () => this.onPointerUp());
		this.resizeCanvas();
		this.redraw();

		this.anchorLabelEl = contentEl.createEl("p", { cls: "setting-item-description" });
		this.refreshAnchorLabel();

		new Setting(contentEl)
			.setName("Orientation")
			.addButton((b) => b.setButtonText("Flip ↔").setTooltip("Flip horizontal").onClick(() => this.applyFlip("h")))
			.addButton((b) => b.setButtonText("Flip ↕").setTooltip("Flip vertical").onClick(() => this.applyFlip("v")))
			.addButton((b) => b.setButtonText("Rotate ↺").setTooltip("Rotate counter-clockwise").onClick(() => this.applyRotate("ccw")))
			.addButton((b) => b.setButtonText("Rotate ↻").setTooltip("Rotate clockwise").onClick(() => this.applyRotate("cw")));

		const footer = new Setting(contentEl).addButton((b) => b.setButtonText("Cancel").onClick(() => this.close()));
		if (this.index > 0) footer.addButton((b) => b.setButtonText("‹ Back").onClick(() => this.goTo(this.index - 1)));
		if (total > 1 && this.index < total - 1) {
			footer.addButton((b) => b.setButtonText("Skip remaining").onClick(() => void this.finish()));
		}
		footer.addButton((b) =>
			b
				.setButtonText(this.index === total - 1 ? "Finish" : "Next ›")
				.setCta()
				.onClick(() => void this.advance()),
		);
	}

	private goTo(index: number): void {
		this.index = index;
		this.render();
	}

	private async advance(): Promise<void> {
		if (this.index < this.frames.length - 1) this.goTo(this.index + 1);
		else await this.finish();
	}

	private async finish(): Promise<void> {
		try {
			for (const frame of this.frames) {
				if (!frame.dirty) continue;
				await overwriteVaultImageAsPng(this.app, packImagePath(this.opts.imgDir, frame.pose.image), frame.pixels);
			}
		} catch (e) {
			console.error("[obsidian-shimeji] could not save finetuned frames", e);
			new Notice("Couldn't save one of the finetuned frames — see the console for details.");
			return;
		}
		await this.opts.onDone(this.frames.map((f) => f.pose));
		this.close();
	}

	// ---------------------------------------------------------------- orientation

	private applyFlip(kind: "h" | "v"): void {
		const frame = this.frames[this.index];
		const { width, height } = frame.pixels;
		frame.pixels = kind === "h" ? flipHorizontal(frame.pixels) : flipVertical(frame.pixels);
		const anchor =
			kind === "h"
				? flipAnchorHorizontal({ x: frame.pose.anchorX, y: frame.pose.anchorY }, width)
				: flipAnchorVertical({ x: frame.pose.anchorX, y: frame.pose.anchorY }, height);
		frame.pose.anchorX = anchor.x;
		frame.pose.anchorY = anchor.y;
		frame.dirty = true;
		this.afterOrientationChange();
	}

	private applyRotate(dir: "cw" | "ccw"): void {
		const frame = this.frames[this.index];
		const { width, height } = frame.pixels;
		frame.pixels = dir === "cw" ? rotate90Clockwise(frame.pixels) : rotate90CounterClockwise(frame.pixels);
		const anchor =
			dir === "cw"
				? rotateAnchorClockwise({ x: frame.pose.anchorX, y: frame.pose.anchorY }, height)
				: rotateAnchorCounterClockwise({ x: frame.pose.anchorX, y: frame.pose.anchorY }, width);
		frame.pose.anchorX = anchor.x;
		frame.pose.anchorY = anchor.y;
		frame.dirty = true;
		this.afterOrientationChange();
	}

	private afterOrientationChange(): void {
		const frame = this.frames[this.index];
		frame.canvasEl = pixelsToCanvas(frame.pixels);
		this.resizeCanvas();
		this.redraw();
		this.refreshAnchorLabel();
	}

	// ---------------------------------------------------------------- drawing

	private resizeCanvas(): void {
		const { width, height } = this.frames[this.index].pixels;
		this.scale = Math.min(MAX_UPSCALE, MAX_DISPLAY / Math.max(width, height, 1));
		this.canvas.width = Math.max(1, Math.round(width * this.scale));
		this.canvas.height = Math.max(1, Math.round(height * this.scale));
	}

	private redraw(): void {
		const frame = this.frames[this.index];
		const { width, height } = frame.pixels;
		const s = this.scale;
		this.ctx.imageSmoothingEnabled = false;
		this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
		this.drawCheckerboard(width, height, s);
		this.ctx.drawImage(frame.canvasEl, 0, 0, width, height, 0, 0, width * s, height * s);
		this.drawAnchor();
	}

	private drawCheckerboard(width: number, height: number, s: number): void {
		const light = "#3a3a3a";
		const dark = "#2a2a2a";
		for (let y = 0; y * CHECKER_SIZE < height; y++) {
			for (let x = 0; x * CHECKER_SIZE < width; x++) {
				this.ctx.fillStyle = (x + y) % 2 === 0 ? light : dark;
				const w = Math.min(CHECKER_SIZE, width - x * CHECKER_SIZE) * s;
				const h = Math.min(CHECKER_SIZE, height - y * CHECKER_SIZE) * s;
				this.ctx.fillRect(x * CHECKER_SIZE * s, y * CHECKER_SIZE * s, w, h);
			}
		}
	}

	private drawAnchor(): void {
		const frame = this.frames[this.index];
		const s = this.scale;
		const x = frame.pose.anchorX * s;
		const y = frame.pose.anchorY * s;
		const radius = 5;
		this.ctx.strokeStyle = "#ff5f5f";
		this.ctx.lineWidth = 2;
		this.ctx.beginPath();
		this.ctx.moveTo(x - radius, y);
		this.ctx.lineTo(x + radius, y);
		this.ctx.moveTo(x, y - radius);
		this.ctx.lineTo(x, y + radius);
		this.ctx.stroke();
		this.ctx.beginPath();
		this.ctx.arc(x, y, radius, 0, Math.PI * 2);
		this.ctx.stroke();
	}

	private refreshAnchorLabel(): void {
		if (!this.anchorLabelEl) return;
		const { anchorX, anchorY } = this.frames[this.index].pose;
		this.anchorLabelEl.setText(`Anchor: ${Math.round(anchorX)}, ${Math.round(anchorY)}`);
	}

	// ---------------------------------------------------------------- pointer

	/** Client coordinates to this frame's own pixel space — same ratio-through-the-canvas approach
	 * as `PoseFitCanvas.framePoint`/`AtlasSlicer`'s own point conversion, divided by this frame's
	 * own display scale instead of a fixed one since every frame here can be a different size. */
	private framePoint(e: { clientX: number; clientY: number }): { x: number; y: number } {
		const rect = this.canvas.getBoundingClientRect();
		const scaleX = rect.width > 0 ? this.canvas.width / rect.width : 1;
		const scaleY = rect.height > 0 ? this.canvas.height / rect.height : 1;
		return {
			x: ((e.clientX - rect.left) * scaleX) / this.scale,
			y: ((e.clientY - rect.top) * scaleY) / this.scale,
		};
	}

	private onPointerDown(e: PointerEvent): void {
		if (e.button !== 0) return;
		e.preventDefault();
		this.canvas.setPointerCapture(e.pointerId);
		this.dragging = true;
		this.moveAnchorTo(e);
	}

	private onPointerMove(e: PointerEvent): void {
		if (this.dragging) this.moveAnchorTo(e);
	}

	private onPointerUp(): void {
		this.dragging = false;
	}

	/** Anywhere on the canvas moves the anchor there directly — there is only ever one draggable
	 * thing on this frame (unlike `PoseFitCanvas`, which pans the whole image around a fixed
	 * anchor), so there is no separate "grab the crosshair precisely" requirement to get in the
	 * way. */
	private moveAnchorTo(e: PointerEvent): void {
		const frame = this.frames[this.index];
		const p = this.framePoint(e);
		frame.pose.anchorX = Math.round(Math.max(0, Math.min(frame.pixels.width - 1, p.x)));
		frame.pose.anchorY = Math.round(Math.max(0, Math.min(frame.pixels.height - 1, p.y)));
		this.redraw();
		this.refreshAnchorLabel();
	}
}
