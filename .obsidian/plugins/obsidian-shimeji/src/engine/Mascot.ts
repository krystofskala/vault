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
	onDetach?(mascot: Mascot): void;
}

export interface MascotDeps {
	config: EngineConfig;
	getAmbientPointer: () => AmbientPointer;
	rng: Random;
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

	private bindPointerHandlers(): void {
		this.el.addEventListener("pointerdown", (ev) => {
			ev.preventDefault();
			this.el.setPointerCapture(ev.pointerId);
			this.activePointerId = ev.pointerId;
			this.isDragging = true;
			this.el.classList.add("is-dragging");
			this.grabOffset = { x: ev.clientX - this.physics.x, y: ev.clientY - this.physics.y };
			this.dragTrack = { x: ev.clientX, y: ev.clientY, down: true, history: [{ x: ev.clientX, y: ev.clientY, t: performance.now() }] };
		});
		this.el.addEventListener("pointermove", (ev) => {
			if (!this.isDragging) return;
			this.dragTrack.x = ev.clientX;
			this.dragTrack.y = ev.clientY;
			this.dragTrack.history.push({ x: ev.clientX, y: ev.clientY, t: performance.now() });
			if (this.dragTrack.history.length > 8) this.dragTrack.history.shift();
		});
		this.el.addEventListener("pointerup", () => this.finishDrag());
		this.el.addEventListener("pointercancel", () => this.finishDrag());
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

	/** Called once per frame before rendering. */
	update(dtSeconds: number, ledges: Ledge[]): void {
		this.stateElapsedMs += dtSeconds * 1000;
		const ambient = this.deps.getAmbientPointer();

		if (this.isDragging) {
			tickDragged(this.physics, this.dragTrack, this.grabOffset, dtSeconds, { width: window.innerWidth, height: window.innerHeight });
			const swing = computeReleaseVelocity(this.dragTrack, this.deps.config);
			if (Math.abs(swing.vx) > 20) this.physics.facing = swing.vx > 0 ? 1 : -1;
			if (!this.driver?.renderState?.(this, "dragged", this.stateElapsedMs, ambient)) this.setVisualState("dragged");
		} else if (this.driver) {
			this.driver.tick(this, dtSeconds, ledges, ambient);
		} else {
			this.tickNativeFallback(dtSeconds, ledges, ambient);
		}
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
		} else if (roll < 0.85) {
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

	private render(): void {
		const anchor = this.usingImage ? this.imageAnchor : { x: this.width / 2, y: this.height };
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
