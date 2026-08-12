import { collectPlatformRects, computeLedgesFromRects } from "./Ledges";
import { Mascot, type MascotDeps } from "./Mascot";
import { Random } from "./Random";
import type { AmbientPointer, EngineConfig, Ledge } from "./types";

export interface StageOptions {
	config: EngineConfig;
	paneLedgesEnabled: boolean;
	debugLedges: boolean;
	seed?: number;
}

const POINTER_HISTORY_MS = 150;

/** Owns the full-window overlay, the animation loop, and the (single) mascot instance. */
export class Stage {
	readonly container: HTMLDivElement;
	private mascot?: Mascot;
	private ledges: Ledge[] = [];
	private ambientPos = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
	private pointerHistory: Array<{ x: number; y: number; t: number }> = [];
	private readonly rng: Random;
	private rafHandle = 0;
	private lastTime = 0;
	private ledgeRecomputeTimer = 0;
	private debugEls: HTMLDivElement[] = [];

	constructor(private opts: StageOptions) {
		this.rng = new Random(opts.seed);
		this.container = document.createElement("div");
		this.container.className = "shimeji-stage";
		// Set inline too (not just via styles.css): this must never depend on stylesheet load
		// timing, since a full-window overlay that briefly fails to be click-through would
		// swallow real Obsidian interactions (dragging the window, resizing panes) underneath it.
		this.container.style.pointerEvents = "none";
		document.body.appendChild(this.container);
		this.recomputeLedges();
		window.addEventListener("mousemove", this.onMouseMove);
		window.addEventListener("resize", this.onResize);
	}

	private onMouseMove = (ev: MouseEvent): void => {
		const now = performance.now();
		this.ambientPos = { x: ev.clientX, y: ev.clientY };
		this.pointerHistory.push({ x: ev.clientX, y: ev.clientY, t: now });
		this.pointerHistory = this.pointerHistory.filter((s) => now - s.t <= POINTER_HISTORY_MS);
	};

	/** Recent mouse velocity (px/s), used for cursor.dx/dy and to launch a pack's own Thrown
	 * action with a realistic release velocity. */
	private getAmbientPointer = (): AmbientPointer => {
		const samples = this.pointerHistory;
		if (samples.length < 2) return { ...this.ambientPos, dx: 0, dy: 0 };
		const first = samples[0];
		const last = samples[samples.length - 1];
		const dtMs = last.t - first.t;
		if (dtMs <= 0) return { ...this.ambientPos, dx: 0, dy: 0 };
		return {
			...this.ambientPos,
			dx: ((last.x - first.x) / dtMs) * 1000,
			dy: ((last.y - first.y) / dtMs) * 1000,
		};
	};

	private onResize = (): void => {
		this.recomputeLedges();
	};

	/** Call after Obsidian workspace layout changes (pane opened/closed/resized). */
	notifyLayoutChanged(): void {
		this.recomputeLedges();
	}

	setPaneLedgesEnabled(enabled: boolean): void {
		this.opts.paneLedgesEnabled = enabled;
		this.recomputeLedges();
	}

	setDebugLedges(enabled: boolean): void {
		this.opts.debugLedges = enabled;
		this.renderDebugLedges();
	}

	setConfig(config: EngineConfig): void {
		this.opts.config = config;
	}

	private recomputeLedges(): void {
		const platforms = this.opts.paneLedgesEnabled ? collectPlatformRects(document) : [];
		this.ledges = computeLedgesFromRects({ width: window.innerWidth, height: window.innerHeight }, platforms);
		this.renderDebugLedges();
	}

	private renderDebugLedges(): void {
		for (const el of this.debugEls) el.remove();
		this.debugEls = [];
		if (!this.opts.debugLedges) return;
		for (const ledge of this.ledges) {
			const el = document.createElement("div");
			el.className = "shimeji-debug-ledge";
			if (ledge.kind === "floor" || ledge.kind === "ceiling") {
				el.style.left = `${ledge.x1}px`;
				el.style.top = `${ledge.y - 1}px`;
				el.style.width = `${ledge.x2 - ledge.x1}px`;
				el.style.height = "2px";
			} else {
				el.style.left = `${ledge.x - 1}px`;
				el.style.top = `${ledge.y1}px`;
				el.style.width = "2px";
				el.style.height = `${ledge.y2 - ledge.y1}px`;
			}
			this.container.appendChild(el);
			this.debugEls.push(el);
		}
	}

	spawnMascot(): Mascot {
		if (this.mascot) return this.mascot;
		const deps: MascotDeps = {
			config: this.opts.config,
			getAmbientPointer: this.getAmbientPointer,
			rng: this.rng,
		};
		// Not y=0 exactly: that coincides with the ceiling ledge's own y-coordinate, so a pack's
		// ceiling.isOn(anchor) geometric check can't tell a freshly-spawned mascot apart from one
		// that's legitimately attached to the ceiling, and picks a ceiling behavior instead of
		// falling.
		this.mascot = new Mascot(deps, window.innerWidth / 2, 40);
		this.container.appendChild(this.mascot.el);
		return this.mascot;
	}

	removeMascot(): void {
		this.mascot?.destroy();
		this.mascot = undefined;
	}

	getMascot(): Mascot | undefined {
		return this.mascot;
	}

	getLedges(): Ledge[] {
		return this.ledges;
	}

	start(): void {
		this.lastTime = performance.now();
		const loop = (now: number): void => {
			const dt = Math.min(0.05, (now - this.lastTime) / 1000);
			this.lastTime = now;
			this.ledgeRecomputeTimer += dt;
			if (this.ledgeRecomputeTimer > 0.5) {
				this.ledgeRecomputeTimer = 0;
				this.recomputeLedges();
			}
			this.mascot?.update(dt, this.ledges);
			this.rafHandle = requestAnimationFrame(loop);
		};
		this.rafHandle = requestAnimationFrame(loop);
	}

	destroy(): void {
		cancelAnimationFrame(this.rafHandle);
		window.removeEventListener("mousemove", this.onMouseMove);
		window.removeEventListener("resize", this.onResize);
		this.removeMascot();
		this.container.remove();
	}
}
