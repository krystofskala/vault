import { hasForeground, moodForHour, paintRoom } from "./roomArt";
import type { RoomDef } from "./roomDef";
import type { RoomLayout } from "./RoomGeometry";

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
 */

/** One above the stage overlay's own z-index (see styles.css). */
const FOREGROUND_Z = 61;

export class RoomForeground {
	private el?: HTMLCanvasElement;
	private lastKey = "";

	/**
	 * Redraws and repositions to match `layout`, or hides when there is nothing to draw — the room
	 * is off screen, or it simply has no foreground.
	 */
	update(def: RoomDef | undefined, layout: RoomLayout | undefined): void {
		if (!def || !layout || !hasForeground(def)) {
			this.hide();
			return;
		}
		const canvas = this.ensure();
		const mood = moodForHour(new Date().getHours());
		const key = `${def.width}x${def.height}|${layout.scale}|${layout.mirrored}|${mood.dusk}`;
		if (key !== this.lastKey) {
			this.lastKey = key;
			paintRoom(canvas, def, mood, { scale: layout.scale, mirrored: layout.mirrored, layer: "foreground" });
		}
		// Positioned every call rather than only on redraw: the pane moves whenever a sidebar is
		// dragged or a split changes, and a foreground a few pixels out of register with the room
		// behind it is worse than none at all.
		canvas.style.left = `${layout.rect.left}px`;
		canvas.style.top = `${layout.rect.top}px`;
		canvas.style.width = `${layout.rect.right - layout.rect.left}px`;
		canvas.style.height = `${layout.rect.bottom - layout.rect.top}px`;
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
