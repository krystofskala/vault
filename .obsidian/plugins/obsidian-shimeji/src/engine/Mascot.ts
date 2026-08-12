import { applyPlaceholderPose, createPlaceholderElement, PLACEHOLDER_HEIGHT, PLACEHOLDER_WIDTH } from "../placeholder/placeholderSprite";
import {
	applyGravityAndLand,
	findClingableWall,
	pickWalk,
	tickChaseMouse,
	tickClimbWall,
	tickDragFootX,
	tickDragged,
	tickFall,
	tickWalk,
	type WalkState,
} from "./nativeBehaviors";
import { TICKS_PER_SEC, type AmbientPointer, type EngineConfig, type Ledge, type MascotPhysics, type NativeStateName, type PointerState, type Vec2 } from "./types";
import type { Random } from "./Random";

/** The real engine's own constant (Dragged.java: `cursor.getY() + 120`) — the anchor sits this
 * far below the cursor throughout a drag, regardless of where on the sprite you actually
 * clicked. Scaled by the mascot's own render scale, which the original has no equivalent of, so
 * it still lands in a sensible spot if the sprite's been resized. */
const DRAG_ANCHOR_OFFSET_Y = 120;

/** Touch/pen has no right-click, so holding still opens the context menu instead — the same
 * long-press-for-options gesture Obsidian's own mobile UI already uses elsewhere (e.g. the
 * file explorer). Gated to non-mouse pointers only; desktop's existing right-click is
 * untouched. */
const LONG_PRESS_MS = 500;
/** Moving further than this before the timer fires means it's a drag/swipe, not a long
 * press — cancels the pending menu so a touch-drag never also pops up a menu partway through. */
const LONG_PRESS_MOVE_CANCEL_PX = 10;

export interface MascotDriver {
	/** Advances one frame. Implementations mutate `mascot.physics` and call
	 * `mascot.setVisualState`/`setVisualImage` themselves. */
	tick(mascot: Mascot, dt: number, ledges: Ledge[], ambientPointer: AmbientPointer): void;
	/** Dragging is handled by Mascot itself (uniform physics regardless of pack); this lets
	 * a pack-backed driver still supply its own Dragged/Thrown artwork during/after a drag. */
	renderState?(mascot: Mascot, state: NativeStateName, elapsedMs: number, ambientPointer: AmbientPointer): boolean;
	notifyReleased?(mascot: Mascot, wasThrown: boolean, ambientPointer: AmbientPointer): void;
	/** Jumps straight to a named behavior (e.g. a right-click "Set behavior" menu, or the
	 * BornBehavior a Breed action starts a new sibling with) instead of the normal weighted pick. */
	startNamedBehavior?(mascot: Mascot, name: string, ambientPointer: AmbientPointer): void;
	/** Behavior names this driver can run, for building a "Set behavior" menu generically. */
	listBehaviorNames?(): string[];
	onDetach?(mascot: Mascot): void;
}

export interface MascotDeps {
	config: EngineConfig;
	getAmbientPointer: () => AmbientPointer;
	getViewportSize: () => { width: number; height: number };
	getTotalMascotCount: () => number;
	rng: Random;
	/** Requests a new independent mascot near this one (Breed). Position is an offset from
	 * this mascot's current position, matching the original's BornX/BornY semantics. `parent`
	 * is always the requesting mascot itself, passed through so the caller can decide the new
	 * mascot's pack (e.g. inherit the same character rather than picking a random active one). */
	spawnSibling?: (x: number, y: number, bornBehaviorName: string | undefined, parent: Mascot) => void;
	onContextMenu?: (mascot: Mascot, ev: MouseEvent) => void;
}

export class Mascot {
	readonly el: HTMLDivElement;
	private readonly inner: HTMLDivElement;
	private readonly svg: SVGSVGElement;
	private readonly img: HTMLImageElement;

	physics: MascotPhysics;
	state: NativeStateName = "fall";
	stateElapsedMs = 0;
	scale = 1;
	width = PLACEHOLDER_WIDTH;
	height = PLACEHOLDER_HEIGHT;
	/** Settings-level "allow dragging" toggle; checked on pointerdown rather than removing the
	 * listener itself, so flipping it mid-drag can't leave a drag stuck without its pointerup. */
	dragEnabled = true;

	private driver?: MascotDriver;
	private walk?: WalkState;
	private climbDirection: "up" | "down" = "up";
	private isDragging = false;
	private activePointerId: number | null = null;
	private dragTrack: PointerState = { x: 0, y: 0, down: false };
	/** Faithful port of Dragged.java's own footX/footDx fields — see tickDragFootX. Public
	 * (read-only in spirit) so PackDriver can read it the same way the real engine's Pinched
	 * poses read the `FootX` variable, without a dedicated interface just for this one value. */
	dragFootX = 0;
	private dragFootDx = 0;
	private usingImage = false;
	private imageAnchor: Vec2 = { x: PLACEHOLDER_WIDTH / 2, y: PLACEHOLDER_HEIGHT };
	private longPressTimer: ReturnType<typeof setTimeout> | null = null;
	private longPressStart: Vec2 | null = null;
	/** Set right before the long-press timer opens the menu itself, so a native touch-and-hold
	 * contextmenu event that also happens to fire around the same time doesn't open a second one. */
	private suppressNextContextMenu = false;

	constructor(private deps: MascotDeps, startX: number, startY: number) {
		this.physics = { x: startX, y: startY, vx: 0, vy: 0, facing: 1, grounded: false };

		this.el = document.createElement("div");
		this.el.className = "shimeji-mascot";

		this.inner = document.createElement("div");
		this.inner.className = "shimeji-mascot-inner";

		this.svg = createPlaceholderElement();
		this.img = document.createElement("img");
		this.img.style.display = "none";
		this.img.draggable = false;
		this.img.addEventListener("load", () => {
			if (!this.usingImage) return;
			this.width = this.img.naturalWidth || this.width;
			this.height = this.img.naturalHeight || this.height;
			this.applyBoxSize();
		});

		this.inner.append(this.svg, this.img);
		this.el.append(this.inner);
		this.applyBoxSize();
		this.bindPointerHandlers();
	}

	attachDriver(driver: MascotDriver): void {
		this.detachDriver();
		this.driver = driver;
	}

	detachDriver(): void {
		this.driver?.onDetach?.(this);
		this.driver = undefined;
	}

	get isBeingDragged(): boolean {
		return this.isDragging;
	}

	getViewportSize(): { width: number; height: number } {
		return this.deps.getViewportSize();
	}

	getTotalMascotCount(): number {
		return this.deps.getTotalMascotCount();
	}

	/** Breed: requests an independent sibling mascot at an offset from this one's current
	 * position, optionally starting it directly on a named behavior (BornBehavior). Real
	 * Breed.breed(): `lookRight ? (x - BornX) : (x + BornX)` — BornX is authored relative to
	 * facing direction (e.g. "spawn slightly behind me"), not a fixed screen-space offset, so it
	 * flips sign when facing right. BornY is never flipped. */
	requestSibling(offsetX: number, offsetY: number, bornBehaviorName?: string): void {
		const signedOffsetX = this.physics.facing === 1 ? -offsetX : offsetX;
		this.deps.spawnSibling?.(this.physics.x + signedOffsetX, this.physics.y + offsetY, bornBehaviorName, this);
	}

	/** Jumps this mascot straight to a named behavior (right-click menu, Breed's BornBehavior). */
	startNamedBehavior(name: string): void {
		this.driver?.startNamedBehavior?.(this, name, this.deps.getAmbientPointer());
	}

	listBehaviorNames(): string[] {
		return this.driver?.listBehaviorNames?.() ?? [];
	}

	private bindPointerHandlers(): void {
		this.el.addEventListener("pointerdown", (ev) => {
			if (!this.dragEnabled) return;
			ev.preventDefault();
			this.el.setPointerCapture(ev.pointerId);
			this.activePointerId = ev.pointerId;
			this.isDragging = true;
			this.el.classList.add("is-dragging");
			this.dragTrack = { x: ev.clientX, y: ev.clientY, down: true };
			// Dragged.java's own init(): `footX = cursor.getX()`, so the lag simulation starts
			// with zero gap (no lean pose) rather than snapping in from wherever it last was.
			this.dragFootX = ev.clientX;
			this.dragFootDx = 0;

			// Touch/pen has no right mouse button, so a held-still touch opens the context menu
			// instead — dragging still starts immediately either way (below); this timer just
			// watches whether the pointer actually moves before it fires, and if not, treats it
			// as "held for a menu" rather than "picked up and moved" (see clearLongPress()).
			if (ev.pointerType !== "mouse") {
				this.longPressStart = { x: ev.clientX, y: ev.clientY };
				this.longPressTimer = setTimeout(() => {
					this.longPressTimer = null;
					this.longPressStart = null;
					this.suppressNextContextMenu = true;
					this.finishDrag();
					this.deps.onContextMenu?.(this, ev);
				}, LONG_PRESS_MS);
			}
		});
		this.el.addEventListener("pointermove", (ev) => {
			if (this.longPressStart) {
				const moved = Math.hypot(ev.clientX - this.longPressStart.x, ev.clientY - this.longPressStart.y);
				if (moved > LONG_PRESS_MOVE_CANCEL_PX) this.clearLongPress();
			}
			if (!this.isDragging) return;
			this.dragTrack.x = ev.clientX;
			this.dragTrack.y = ev.clientY;
		});
		this.el.addEventListener("pointerup", () => {
			this.clearLongPress();
			this.finishDrag();
		});
		this.el.addEventListener("pointercancel", () => {
			this.clearLongPress();
			this.finishDrag();
		});
		this.el.addEventListener("contextmenu", (ev) => {
			ev.preventDefault();
			if (this.suppressNextContextMenu) {
				this.suppressNextContextMenu = false;
				return;
			}
			// Either desktop's real right-click, or the platform's own touch-and-hold
			// synthesizing this event on its own schedule (independent of, and possibly faster
			// than, our own long-press timer above) — cancel that timer so it doesn't also fire
			// and open a second menu, and cleanly end any in-progress drag the same way our own
			// long-press path does before opening the menu.
			this.clearLongPress();
			this.finishDrag();
			this.deps.onContextMenu?.(this, ev);
		});
		// Pointer capture is page-level, not real OS mouse capture: if the cursor leaves the
		// window entirely mid-swing, pointermove/pointerup can stop arriving altogether and
		// the drag would otherwise get stuck forever wherever it last was (reading as the
		// mascot "vanishing" at the edge). A window blur is a reliable enough signal to let go.
		window.addEventListener("blur", this.onWindowBlur);
	}

	private onWindowBlur = (): void => {
		if (this.isDragging) this.finishDrag();
		this.clearLongPress();
	};

	private clearLongPress(): void {
		if (this.longPressTimer !== null) clearTimeout(this.longPressTimer);
		this.longPressTimer = null;
		this.longPressStart = null;
	}

	private finishDrag(): void {
		if (!this.isDragging) return;
		this.isDragging = false;
		this.el.classList.remove("is-dragging");
		this.dragTrack.down = false;
		if (this.activePointerId !== null) {
			try {
				this.el.releasePointerCapture(this.activePointerId);
			} catch {
				/* pointer capture already released */
			}
			this.activePointerId = null;
		}
		// Real Thrown: `<ActionReference Name="Falling" InitialVX="${mascot.environment.cursor.dx}"
		// InitialVY="${mascot.environment.cursor.dy}"/>` — release velocity *is* the same smoothed
		// cursor.dx/dy exposed everywhere else, not a separately-computed "throw feel" value.
		// ambient.dx/dy are raw per-tick pixels (see Stage.getAmbientPointer) — a pack-backed
		// driver converts that itself at its own InitialVX consumption point, same as any other
		// pack-authored per-tick constant, but this native-fallback physics needs px/second
		// directly, so it converts here instead.
		const ambient = this.deps.getAmbientPointer();
		const releaseVx = ambient.dx * TICKS_PER_SEC;
		const releaseVy = ambient.dy * TICKS_PER_SEC;
		this.physics.vx = releaseVx;
		this.physics.vy = releaseVy;
		const wasThrown = Math.hypot(releaseVx, releaseVy) > this.deps.config.minThrowSpeed;
		this.enterState(wasThrown ? "thrown" : "fall");
		this.driver?.notifyReleased?.(this, wasThrown, ambient);
	}

	/** Advances physics/behavior by one fixed simulation step. Does not touch the DOM — call
	 * `render()` separately (Stage does this once per real frame, possibly after several
	 * simulate() calls if the display stalled). */
	simulate(dtSeconds: number, ledges: Ledge[]): void {
		this.stateElapsedMs += dtSeconds * 1000;
		const ambient = this.deps.getAmbientPointer();

		if (this.isDragging) {
			// Faithful port of Dragged.java's tick(), in order: force lookRight=false every
			// tick (the sprite never mirrors while dragging — its five lean poses already
			// encode their own left/right, see render()), hard-follow the cursor with no lag
			// for the actual rendered position, and update the *separate* FootX lag simulation
			// used only for the pack's own lean-pose comparison.
			this.physics.facing = -1;
			tickDragged(this.physics, this.dragTrack, DRAG_ANCHOR_OFFSET_Y * this.scale, this.deps.getViewportSize());
			const nextFoot = tickDragFootX(this.dragFootX, this.dragFootDx, this.dragTrack.x);
			this.dragFootX = nextFoot.footX;
			this.dragFootDx = nextFoot.footDx;
			// The real engine's `mascot.environment.cursor` is one live reading used everywhere
			// (never a second, independently-sampled one) — this drag's own pointer-capture
			// tracking *is* that reading here for x/y (unlagged, straight from dragTrack), and
			// reuses Stage's own smoothed dx/dy (the same value release velocity reads) rather
			// than sampling it separately.
			const cursorPointer = { x: this.dragTrack.x, y: this.dragTrack.y, dx: ambient.dx, dy: ambient.dy };
			if (!this.driver?.renderState?.(this, "dragged", this.stateElapsedMs, cursorPointer)) this.setVisualState("dragged");
		} else if (this.driver) {
			this.driver.tick(this, dtSeconds, ledges, ambient);
		} else {
			this.tickNativeFallback(dtSeconds, ledges, ambient);
		}
	}

	/** Convenience for callers that don't need simulate()/render() decoupled (e.g. tests). */
	update(dtSeconds: number, ledges: Ledge[]): void {
		this.simulate(dtSeconds, ledges);
		this.render();
	}

	private tickNativeFallback(dt: number, ledges: Ledge[], ambient: { x: number; y: number }): void {
		const args = { physics: this.physics, ledges, dt, config: this.deps.config };
		switch (this.state) {
			case "fall":
			case "thrown": {
				const { landed } = tickFall(args);
				this.setVisualState(this.state);
				if (landed) this.enterState("idle");
				break;
			}
			case "idle": {
				applyGravityAndLand(args);
				this.setVisualState("idle");
				if (this.stateElapsedMs > this.deps.rng.range(900, 2600)) this.pickNextIdleTransition(ledges);
				break;
			}
			case "walk": {
				if (!this.walk) this.walk = pickWalk(this.deps.rng);
				const continuing = tickWalk(args, this.walk);
				this.setVisualState("walk");
				if (!continuing) {
					this.walk = undefined;
					this.enterState("idle");
				}
				break;
			}
			case "sit": {
				applyGravityAndLand(args);
				this.setVisualState("sit");
				if (this.stateElapsedMs > this.deps.rng.range(1500, 3500)) this.enterState("idle");
				break;
			}
			case "chase-mouse": {
				const reached = tickChaseMouse(args, ambient);
				this.setVisualState("chase-mouse");
				if (reached || this.stateElapsedMs > 4000) this.enterState("idle");
				break;
			}
			case "climb-wall": {
				const wall = findClingableWall(ledges, this.physics, 8);
				if (!wall) {
					this.enterState("fall");
					break;
				}
				const continuing = tickClimbWall(args, wall, this.climbDirection);
				this.setVisualState("climb-wall");
				if (!continuing) this.enterState("fall");
				break;
			}
			default: {
				applyGravityAndLand(args);
				this.setVisualState("idle");
				this.enterState("idle");
			}
		}
	}

	private pickNextIdleTransition(ledges: Ledge[]): void {
		const nearWall = findClingableWall(ledges, this.physics, 30);
		const roll = this.deps.rng.next();
		if (roll < 0.4) {
			this.enterState("walk");
		} else if (roll < 0.65) {
			this.enterState("sit");
		} else if (roll < 0.85 && this.deps.config.chaseMouseEnabled) {
			this.enterState("chase-mouse");
		} else if (nearWall) {
			this.climbDirection = this.deps.rng.chance(0.5) ? "up" : "down";
			this.enterState("climb-wall");
		} else {
			this.enterState("walk");
		}
	}

	private enterState(state: NativeStateName): void {
		this.state = state;
		this.stateElapsedMs = 0;
	}

	setVisualState(state: NativeStateName): void {
		this.usingImage = false;
		this.img.style.display = "none";
		this.svg.style.display = "";
		this.width = PLACEHOLDER_WIDTH;
		this.height = PLACEHOLDER_HEIGHT;
		this.applyBoxSize();
		applyPlaceholderPose(this.svg, state, this.stateElapsedMs);
	}

	setVisualImage(src: string, anchor: Vec2): void {
		this.usingImage = true;
		this.svg.style.display = "none";
		this.img.style.display = "";
		this.imageAnchor = anchor;
		if (this.img.getAttribute("src") !== src) {
			this.img.setAttribute("src", src);
			this.img.style.removeProperty("width");
			this.img.style.removeProperty("height");
		} else if (this.img.naturalWidth) {
			this.width = this.img.naturalWidth;
			this.height = this.img.naturalHeight;
		}
		this.applyBoxSize();
	}

	private applyBoxSize(): void {
		this.el.style.width = `${this.width}px`;
		this.el.style.height = `${this.height}px`;
	}

	private getCurrentAnchor(): Vec2 {
		return this.usingImage ? this.imageAnchor : { x: this.width / 2, y: this.height };
	}

	/** Projects current physics/visual state onto the DOM. Pure one-way: physics state is the
	 * source of truth, this never reads back from the DOM. */
	render(): void {
		const anchor = this.getCurrentAnchor();
		const left = this.physics.x - anchor.x * this.scale;
		const top = this.physics.y - anchor.y * this.scale;
		this.el.style.transform = `translate3d(${left}px, ${top}px, 0) scale(${this.scale})`;
		this.inner.style.transformOrigin = `${anchor.x}px ${anchor.y}px`;
		// facing=1 means "facing/moving right" by convention; real Shimeji-ee artwork is
		// authored facing left (confirmed by its Walk poses using negative x velocity), so a
		// rightward-facing mascot is the *mirrored* rendering, not the base one. While
		// dragging, simulate() forces facing to -1 every tick (Dragged.java's own unconditional
		// `setLookRight(false)`) — the real Pinched poses are five distinct images already
		// encoding their own left/right, and mirroring on top used to double-transform them.
		this.inner.style.transform = this.physics.facing === 1 ? "scaleX(-1)" : "none";
	}

	destroy(): void {
		window.removeEventListener("blur", this.onWindowBlur);
		this.clearLongPress();
		this.detachDriver();
		this.el.remove();
	}
}
