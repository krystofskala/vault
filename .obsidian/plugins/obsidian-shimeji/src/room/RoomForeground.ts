import { hasForeground, moodNow, paintRoom, ROOM_ANIMATION_FPS } from "./roomArt";
import type { RoomDef } from "./roomDef";
import type { RoomLayout } from "./RoomGeometry";
import type { Rect } from "../engine/types";

/**
 * The part of a room drawn **in front of** its resident — a desk it is sitting at, and anything else
 * a mascot should be behind rather than on top of.
 *
 * It needs its own element because mascots are not drawn into the room's canvas at all. They live on
 * the stage's full-window overlay, which sits above the whole workspace so a mascot can walk from a
 * pane to the room without being handed between renderers. That is the right arrangement everywhere
 * else and it is exactly what makes "behind the desk" impossible by ordinary means: nothing inside
 * the pane can ever paint over something in that overlay.
 *
 * So this is a second fixed-position canvas on `document.body`, stacked above the overlay, aligned
 * to the room's own rect and painted with only the foreground fixtures. Click-through throughout —
 * it is a picture, and the mascot underneath it must stay grabbable through the parts that overlap.
 *
 * Two things keep it from covering anything it should not.
 *
 * It is **clipped to the resident**. The desk itself is drawn into the room's own in-pane canvas
 * like everything else, so it is complete and correctly placed whether anyone lives there or not;
 * this layer exists only to re-paint the sliver of it that falls across the resident. Without the
 * clip it covered any mascot that happened to overlap the room's rect — one climbing the sidebar's
 * outer wall got half its face cut off by a desk it was nowhere near.
 *
 * And it does **not** resize the canvas. `paintRoom` sizes it to the room's own scale; overriding
 * that with the pane's rect stretched the desk out of register with the one behind it, which is
 * what put the desk's edge across the resident's face instead of its chest.
 *
 * It is positioned from the room canvas's **own measured rect**, not from a second, independent
 * computation of where that canvas ought to be. The room canvas is centred in its pane by CSS
 * flexbox, in fractional pixels the browser is free to round however it likes; `RoomGeometry`
 * centres the same box with its own `Math.round` arithmetic, in JS, for the physics ledges that
 * have to line up with the picture. The two calculations agree on the room's *size* exactly — both
 * start from the same integer scale — but nothing forces them to agree on its *position* to better
 * than a fraction of a pixel, and pixel art has no antialiasing to hide a fraction of a pixel in.
 * Reported as the foreground sitting a few pixels out of register with the room behind it, on a
 * pane whose width made the two roundings disagree. Reading the canvas's own
 * `getBoundingClientRect()` instead means this can only ever land exactly where the room actually
 * is, because it *is* where the room actually is — there is no second prediction left to disagree
 * with it.
 */

/** One above the stage overlay's own z-index (see styles.css). */
const FOREGROUND_Z = 61;

/**
 * A `clip-path` inset that exposes only the part of the foreground canvas lying over `target`.
 *
 * Expressed relative to the canvas's own box, and clamped at zero on every side so a resident
 * partway out of the room clips to the overlap rather than to a negative inset, which browsers
 * treat as no clip at all — the failure would be the whole desk reappearing over everything at
 * exactly the moment the mascot is stepping through the door.
 */
function insetTo(target: Rect, canvasRect: Rect): string {
	const top = Math.max(0, target.top - canvasRect.top);
	const left = Math.max(0, target.left - canvasRect.left);
	const right = Math.max(0, canvasRect.right - target.right);
	const bottom = Math.max(0, canvasRect.bottom - target.bottom);
	return `inset(${top}px ${right}px ${bottom}px ${left}px)`;
}

export class RoomForeground {
	private el?: HTMLCanvasElement;
	private lastKey = "";

	/**
	 * Redraws and repositions to match `layout`, or hides when there is nothing to draw — the room
	 * is off screen, or it simply has no foreground.
	 *
	 * `canvasRect` is the room's own canvas's measured `getBoundingClientRect()`, not `layout.rect`
	 * — see the class doc for why those two are not interchangeable here even though they describe
	 * the same box.
	 */
	update(def: RoomDef | undefined, layout: RoomLayout | undefined, canvasRect: Rect | undefined, residentRect: Rect | undefined, hourOverride?: number): void {
		// Nobody home means nothing to draw in front of: the room's own canvas already has the whole
		// picture. This is also what stops a passing mascot being clipped by furniture it is not at.
		if (!def || !layout || !canvasRect || !residentRect || !hasForeground(def)) {
			this.hide();
			return;
		}
		const canvas = this.ensure();
		const mood = moodNow(hourOverride);
		// Must advance in step with the background layer's own key, or the desk would be lit for one
		// moment of the day while the wall behind it was lit for another.
		const frame = def.animated ? Math.floor(mood.t * ROOM_ANIMATION_FPS) : Math.round(mood.daylight * 40);
		const key = `${def.width}x${def.height}|${layout.scale}|${layout.mirrored}|${frame}`;
		if (key !== this.lastKey) {
			this.lastKey = key;
			paintRoom(canvas, def, mood, { scale: layout.scale, mirrored: layout.mirrored, layer: "foreground" });
		}
		// Positioned every call rather than only on redraw: the pane moves whenever a sidebar is
		// dragged or a split changes, and a foreground a few pixels out of register with the room
		// behind it is worse than none at all.
		canvas.style.left = `${canvasRect.left}px`;
		canvas.style.top = `${canvasRect.top}px`;
		// Width and height deliberately untouched — paintRoom has already sized this to the room's
		// own scale, and setting them from the pane's rect stretches it out of register.
		canvas.style.clipPath = insetTo(residentRect, canvasRect);
		canvas.style.display = "";
	}

	private ensure(): HTMLCanvasElement {
		if (this.el) return this.el;
		const canvas = document.createElement("canvas");
		canvas.className = "shimeji-room-foreground";
		canvas.style.position = "fixed";
		canvas.style.zIndex = String(FOREGROUND_Z);
		// Set inline as well as in the stylesheet, for the same reason the stage overlay does: a
		// full-width element that briefly failed to be click-through would swallow real clicks.
		canvas.style.pointerEvents = "none";
		canvas.style.imageRendering = "pixelated";
		document.body.appendChild(canvas);
		this.el = canvas;
		return canvas;
	}

	private hide(): void {
		if (this.el) this.el.style.display = "none";
	}

	destroy(): void {
		this.el?.remove();
		this.el = undefined;
		this.lastKey = "";
	}
}
