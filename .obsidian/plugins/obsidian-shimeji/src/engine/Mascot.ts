import { applyPlaceholderPose, createPlaceholderElement, PLACEHOLDER_HEIGHT, PLACEHOLDER_WIDTH } from "../placeholder/placeholderSprite";
import {
	applyGravityAndLand,
	computeReleaseVelocity,
	findClingableWall,
	pickWalk,
	tickChaseMouse,
	tickClimbWall,
	tickDragged,
	tickFall,
	tickWalk,
	type WalkState,
} from "./nativeBehaviors";
import type { AmbientPointer, EngineConfig, Ledge, MascotPhysics, NativeStateName, PointerState, Vec2 } from "./types";
import type { Random } from "./Random";

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
	private grabOffset: Vec2 = { x: 0, y: 0 };
	private dragTrack: PointerState = { x: 0, y: 0, down: false, history: [] };
	private usingImage = false;
	private imageAnchor: Vec2 = { x: PLACEHOLDER_WIDTH / 2, y: PLACEHOLDER_HEIGHT };

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
	 * position, optionally starting it directly on a named behavior (BornBehavior). */
	requestSibling(offsetX: number, offsetY: number, bornBehaviorName?: string): void {
		this.deps.spawnSibling?.(this.physics.x + offsetX, this.physics.y + offsetY, bornBehaviorName, this);
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
			// Always grab by a fixed point near the top of the sprite — like being picked up
			// by the scruff of the neck — regardless of exactly where on the sprite you
			// clicked, matching the original app rather than dragging by whatever pixel was
			// under the cursor (which also throws off the pack's own FootX-vs-cursor lean
			// poses, since those assume a consistent hold point).
			// physics.y = pointer.y - grabOffset.y, and image top = physics.y - anchor.y*scale,
			// so to put the cursor topMarginPx below the image's top edge we need
			// grabOffset.y = topMarginPx - anchor.y*scale.
			const anchor = this.getCurrentAnchor();
			const topMarginPx = 18;
			this.grabOffset = { x: 0, y: topMarginPx - anchor.y * this.scale };
			this.dragTrack = { x: ev.clientX, y: ev.clientY, down: true, history: [{ x: ev.clientX, y: ev.clientY, t: performance.now() }] };
		});
		this.el.addEventListener("pointermove", (ev) => {
			if (!this.isDragging) return;
			this.dragTrack.x = ev.clientX;
			this.dragTrack.y = ev.clientY;
			const now = performance.now();
			this.dragTrack.history.push({ x: ev.clientX, y: ev.clientY, t: now });
			// A time window, not a sample count: a fast pointer can fire far more samples per
			// second than a slow one, and a too-short window on a fast mouse reads pure noise
			// (hand tremor) as rapid direction changes — see the facing hysteresis in simulate().
			this.dragTrack.history = this.dragTrack.history.filter((s) => now - s.t <= 120);
		});
		this.el.addEventListener("pointerup", () => this.finishDrag());
		this.el.addEventListener("pointercancel", () => this.finishDrag());
		this.el.addEventListener("contextmenu", (ev) => {
			ev.preventDefault();
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
	};

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
		const release = computeReleaseVelocity(this.dragTrack, this.deps.config);
		this.physics.vx = release.vx;
		this.physics.vy = release.vy;
		const wasThrown = Math.hypot(release.vx, release.vy) > this.deps.config.minThrowSpeed;
		this.enterState(wasThrown ? "thrown" : "fall");
		this.driver?.notifyReleased?.(this, wasThrown, this.deps.getAmbientPointer());
	}

	/** Advances physics/behavior by one fixed simulation step. Does not touch the DOM — call
	 * `render()` separately (Stage does this once per real frame, possibly after several
	 * simulate() calls if the display stalled). */
	simulate(dtSeconds: number, ledges: Ledge[]): void {
		this.stateElapsedMs += dtSeconds * 1000;
		const ambient = this.deps.getAmbientPointer();

		if (this.isDragging) {
			tickDragged(this.physics, this.dragTrack, this.grabOffset, dtSeconds, this.deps.getViewportSize());
			// Hysteresis (a dead zone in the middle, not a single threshold both ways): flip
			// only on a confident swing past a real threshold, so ordinary hand jitter while
			// moving in one clear direction can't make it flicker back and forth.
			const swing = computeReleaseVelocity(this.dragTrack, this.deps.config);
			if (swing.vx > 90) this.physics.facing = 1;
			else if (swing.vx < -90) this.physics.facing = -1;
			if (!this.driver?.renderState?.(this, "dragged", this.stateElapsedMs, ambient)) this.setVisualState("dragged");
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
		// rightward-facing mascot is the *mirrored* rendering, not the base one.
		this.inner.style.transform = this.physics.facing === 1 ? "scaleX(-1)" : "none";
	}

	destroy(): void {
		window.removeEventListener("blur", this.onWindowBlur);
		this.detachDriver();
		this.el.remove();
	}
}
