import { ObsidianDomEnvironment, type Environment } from "./Environment";
import { computeLedgesFromRects } from "./Ledges";
import { Mascot, type MascotDeps } from "./Mascot";
import { smoothCursorVelocity } from "./nativeBehaviors";
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

const FIXED_DT = ENGINE_FIXED_TICK_MS / 1000;
const MAX_FRAME_TIME = 0.25;
/** Matches UserBehavior.next()'s own off-screen recovery constant (`screen.top - 256`) — see
 * the spawn-position note on spawnMascot. */
const FALL_SPAWN_Y = -256;
/** Fallback drop point on the defensive path where a caller supplies only one of x/y; no call
 * site in this codebase actually does that today (every real spawn passes both or neither). */
const DEFAULT_SPAWN_Y = 160;

/** Owns the full-window overlay, the fixed-timestep simulation loop, and every mascot instance. */
export class Stage {
	readonly container: HTMLDivElement;
	private mascots: Mascot[] = [];
	private ledges: Ledge[] = [];
	private readonly environment: Environment;
	private ambientPos: { x: number; y: number };
	/** The position ambientPos held as of the *previous* fixed tick, and the smoothed per-tick
	 * delta computed from it — see updateAmbientVelocity(). Deliberately separate from ambientPos
	 * itself, which onMouseMove updates immediately on every real mouse event regardless of the
	 * simulation's own tick boundary. */
	private lastTickAmbientPos: { x: number; y: number };
	private ambientDx = 0;
	private ambientDy = 0;
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
		this.lastTickAmbientPos = { ...this.ambientPos };

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
		this.ambientPos = { x: ev.clientX, y: ev.clientY };
	};

	/** See smoothCursorVelocity — this just supplies "once per fixed 40ms simulation tick" as
	 * the calling cadence, matching the real Environment.tick()/Manager.tick() rate. Called from
	 * stepSimulation, before any mascot ticks this step. */
	private updateAmbientVelocity(): void {
		const delta = smoothCursorVelocity({ x: this.ambientDx, y: this.ambientDy }, this.lastTickAmbientPos, this.ambientPos);
		this.ambientDx = delta.x;
		this.ambientDy = delta.y;
		this.lastTickAmbientPos = { ...this.ambientPos };
	}

	/** dx/dy are deliberately raw per-tick pixels, *not* px/second — exactly matching real
	 * Location.dx/dy's own units (see smoothCursorVelocity). Pack-authored per-tick constants
	 * (Velocity, Gravity, InitialVX/VY, ...) flow through the expression system unconverted too,
	 * only becoming px/second at their one specific consumption point — e.g. InitialVX in
	 * shimeji/ActionRunner.ts's applyEmbeddedStartEffects, which is what actually applies
	 * SHIMEJI_TICKS_PER_SEC to `${mascot.environment.cursor.dx}` when Thrown reads it as a
	 * release velocity. Converting *here* too would double-convert that path. A consumer that
	 * needs px/second directly (bypassing the expression system entirely) must convert itself —
	 * see Mascot.finishDrag(). */
	private getAmbientPointer = (): AmbientPointer => ({
		...this.ambientPos,
		dx: this.ambientDx,
		dy: this.ambientDy,
	});

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
	 * Spawns a new mascot. With no `x`/`y` (every manual spawn: the command, the "Add another
	 * Shimeji" menu item, auto-spawn-on-load), this mirrors the real engine's own spawn path
	 * instead of dropping the mascot in already standing in view: Main.createMascot() always
	 * creates off-screen at a fixed anchor (-1000,-1000), and the very next UserBehavior.next()
	 * tick finds it "out of screen bounds" and relocates it to a random x above the top edge
	 * before forcing Fall — see BehaviorAI.respawnAndFall, which ports that identical recovery
	 * for the identical reason. Every real mascot's first visible moment is falling in from off
	 * the top of the screen at a uniformly random x; the intermediate weighted-random behavior
	 * buildBehavior(null, mascot) picks first is skipped here since it's just as invisible in
	 * the original — it starts running while still off-screen and is overridden before the next
	 * real frame. Breed passes an exact parent-relative x/y instead (BornX/BornY) and must not
	 * be redirected to a random position.
	 */
	spawnMascot(x?: number, y?: number, bornBehaviorName?: string, parent?: Mascot): Mascot | undefined {
		if (this.mascots.length >= this.opts.maxMascots) return undefined;
		const viewport = this.environment.getViewportSize();
		const spawningFresh = x === undefined && y === undefined;
		const mascot = this.createMascot(
			spawningFresh ? this.rng.range(0, viewport.width) : x ?? viewport.width / 2,
			spawningFresh ? FALL_SPAWN_Y : y ?? DEFAULT_SPAWN_Y,
		);
		// Real Breed.breed(): `mascot.setLookRight(getMascot().isLookRight())` — a new sibling
		// always starts facing the same way its parent was, not the engine's usual default.
		if (parent) mascot.physics.facing = parent.physics.facing;
		this.mascots.push(mascot);
		this.container.appendChild(mascot.el);
		this.opts.onMascotCreated?.(mascot, spawningFresh ? "Fall" : bornBehaviorName, parent);
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
		// Matches Manager.tick()'s own ordering: the environment (including cursor.dx/dy) is
		// refreshed before any mascot ticks, every fixed step, so nothing this step reads it stale.
		this.updateAmbientVelocity();
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
