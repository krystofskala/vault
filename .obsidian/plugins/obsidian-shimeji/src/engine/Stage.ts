import { ObsidianDomEnvironment, type Environment } from "./Environment";
import { computeLedgesFromRects } from "./Ledges";
import { Mascot, type MascotDeps } from "./Mascot";
import { Random } from "./Random";
import { ENGINE_FIXED_TICK_MS, type AmbientPointer, type EngineConfig, type Ledge } from "./types";

export interface StageOptions {
	config: EngineConfig;
	paneLedgesEnabled: boolean;
	debugLedges: boolean;
	maxMascots: number;
	/** Settings-level "allow breeding" toggle: gates Breed's spawnSibling request, independent
	 * of the maxMascots cap (which spawnMascot itself still enforces either way). */
	allowBreeding: boolean;
	seed?: number;
	/** Injectable so the core simulation loop never has to touch `window`/`document` itself —
	 * defaults to the real Obsidian window when omitted. */
	environment?: Environment;
	/** Called whenever Stage creates a mascot (a manual spawn or a Breed-spawned sibling), so
	 * the Obsidian-specific layer can attach a pack driver / apply settings without Stage
	 * needing to know anything about packs. `parent` is set only for a Breed-spawned sibling,
	 * letting the caller inherit the parent's own pack instead of picking one at random. */
	onMascotCreated?: (mascot: Mascot, bornBehaviorName?: string, parent?: Mascot) => void;
	onContextMenu?: (mascot: Mascot, ev: MouseEvent) => void;
}

const POINTER_HISTORY_MS = 150;
const FIXED_DT = ENGINE_FIXED_TICK_MS / 1000;
const MAX_FRAME_TIME = 0.25;
/** Default drop point for a manually-spawned mascot: clear of both the ceiling ledge's own
 * y-coordinate (see the spawn-position note in spawnMascot) and typical sprite heights, so it's
 * fully visible immediately rather than mostly clipped above the top of the window. */
const DEFAULT_SPAWN_Y = 160;

/** Owns the full-window overlay, the fixed-timestep simulation loop, and every mascot instance. */
export class Stage {
	readonly container: HTMLDivElement;
	private mascots: Mascot[] = [];
	private ledges: Ledge[] = [];
	private readonly environment: Environment;
	private ambientPos: { x: number; y: number };
	private pointerHistory: Array<{ x: number; y: number; t: number }> = [];
	private readonly rng: Random;
	private rafHandle = 0;
	private lastTime = 0;
	private accumulator = 0;
	private ledgeRecomputeTimer = 0;
	private debugEls: HTMLDivElement[] = [];

	constructor(private opts: StageOptions) {
		this.rng = new Random(opts.seed);
		this.environment = opts.environment ?? new ObsidianDomEnvironment();
		const viewport = this.environment.getViewportSize();
		this.ambientPos = { x: viewport.width / 2, y: viewport.height / 2 };

		this.container = document.createElement("div");
		this.container.className = "shimeji-stage";
		// Set inline too (not just via styles.css): this must never depend on stylesheet load
		// timing, since a full-window overlay that briefly fails to be click-through would
		// swallow real Obsidian interactions underneath it.
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

	setMaxMascots(max: number): void {
		this.opts.maxMascots = max;
	}

	setAllowBreeding(enabled: boolean): void {
		this.opts.allowBreeding = enabled;
	}

	private recomputeLedges(): void {
		const viewport = this.environment.getViewportSize();
		const platforms = this.opts.paneLedgesEnabled ? this.environment.getPlatformRects() : [];
		this.ledges = computeLedgesFromRects(viewport, platforms);
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

	private createMascot(x: number, y: number): Mascot {
		const deps: MascotDeps = {
			config: this.opts.config,
			getAmbientPointer: this.getAmbientPointer,
			rng: this.rng,
			getViewportSize: () => this.environment.getViewportSize(),
			getTotalMascotCount: () => this.mascots.length,
			spawnSibling: (sx, sy, bornBehaviorName, parent) => {
				if (!this.opts.allowBreeding) return;
				this.spawnMascot(sx, sy, bornBehaviorName, parent);
			},
			onContextMenu: this.opts.onContextMenu,
		};
		return new Mascot(deps, x, y);
	}

	/**
	 * Spawns a new mascot. `x`/`y` default to a fixed drop point when omitted (used for manual
	 * spawns, which then fall under gravity); Breed passes an exact offset position instead.
	 * Not y=0: that coincides with the ceiling ledge's own y-coordinate, so a pack's
	 * ceiling.isOn(anchor) geometric check couldn't tell a freshly-spawned mascot apart from one
	 * legitimately attached to the ceiling. Not a too-small offset either: real sprites anchor
	 * near the bottom of a ~130-170px image, so a shallow offset leaves most of the sprite
	 * clipped above the top of the window until it falls far enough to be fully visible.
	 */
	spawnMascot(x?: number, y?: number, bornBehaviorName?: string, parent?: Mascot): Mascot | undefined {
		if (this.mascots.length >= this.opts.maxMascots) return undefined;
		const viewport = this.environment.getViewportSize();
		const mascot = this.createMascot(x ?? viewport.width / 2, y ?? DEFAULT_SPAWN_Y);
		// Real Breed.breed(): `mascot.setLookRight(getMascot().isLookRight())` — a new sibling
		// always starts facing the same way its parent was, not the engine's usual default.
		if (parent) mascot.physics.facing = parent.physics.facing;
		this.mascots.push(mascot);
		this.container.appendChild(mascot.el);
		this.opts.onMascotCreated?.(mascot, bornBehaviorName, parent);
		return mascot;
	}

	/** Removes a specific mascot, or the most recently spawned one if none is given. */
	removeMascot(mascot?: Mascot): void {
		const target = mascot ?? this.mascots[this.mascots.length - 1];
		if (!target) return;
		target.destroy();
		this.mascots = this.mascots.filter((m) => m !== target);
	}

	removeAllMascots(): void {
		for (const m of this.mascots) m.destroy();
		this.mascots = [];
	}

	getMascots(): readonly Mascot[] {
		return this.mascots;
	}

	getLedges(): Ledge[] {
		return this.ledges;
	}

	private stepSimulation(dt: number): void {
		this.ledgeRecomputeTimer += dt;
		if (this.ledgeRecomputeTimer > 0.5) {
			this.ledgeRecomputeTimer = 0;
			this.recomputeLedges();
		}
		for (const m of this.mascots) m.simulate(dt, this.ledges);
	}

	/** Fixed-timestep accumulator: physics always advances in ENGINE_FIXED_TICK_MS-sized steps
	 * regardless of display refresh rate (possibly several per rendered frame after a stall, or
	 * zero if the frame was faster than one step), matching the original engine's own
	 * fixed-tick loop instead of scaling behavior speed with machine performance. Rendering
	 * happens once per real frame after however many simulation steps just ran. */
	start(): void {
		this.lastTime = performance.now();
		const loop = (now: number): void => {
			const frameTime = Math.min(MAX_FRAME_TIME, (now - this.lastTime) / 1000);
			this.lastTime = now;
			this.accumulator += frameTime;
			while (this.accumulator >= FIXED_DT) {
				this.stepSimulation(FIXED_DT);
				this.accumulator -= FIXED_DT;
			}
			for (const m of this.mascots) m.render();
			this.rafHandle = requestAnimationFrame(loop);
		};
		this.rafHandle = requestAnimationFrame(loop);
	}

	destroy(): void {
		cancelAnimationFrame(this.rafHandle);
		window.removeEventListener("mousemove", this.onMouseMove);
		window.removeEventListener("resize", this.onResize);
		this.removeAllMascots();
		this.container.remove();
	}
}
