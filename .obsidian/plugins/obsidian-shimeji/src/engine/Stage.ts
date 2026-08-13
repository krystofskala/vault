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
	 * letting the caller inherit the parent's own pack instead of picking one at random.
	 * `forcedPackId` is spawnMascot's own passthrough (see its own comment) for "this specific
	 * character, but otherwise an ordinary fresh spawn" — real per-mascot "Another One!". */
	onMascotCreated?: (mascot: Mascot, bornBehaviorName?: string, parent?: Mascot, forcedPackId?: string | null) => void;
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
	 * itself, which onPointerMove updates immediately on every real pointer event regardless of
	 * the simulation's own tick boundary. */
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
		window.addEventListener("pointermove", this.onPointerMove);
		window.addEventListener("resize", this.onResize);
	}

	/**
	 * Tracks `pointermove`, not `mousemove`: Mascot's own drag handler calls
	 * `ev.preventDefault()` on `pointerdown` (needed so touch-drag doesn't also scroll/select
	 * text), and per the Pointer Events spec, preventing a pointerdown's default suppresses the
	 * *compatibility* `mousedown`/`mousemove`/`mouseup` events the browser would otherwise
	 * synthesize from that same pointer for the rest of the interaction — real `pointer*` events
	 * are unaffected. A `mousemove` listener here used to go completely silent for the entire
	 * duration of every drag, freezing `ambientPos` at the grab point; smoothCursorVelocity would
	 * then see one giant single-tick jump once a real mousemove finally fired again after
	 * release, instead of the drag's true gradual path, and finishDrag()'s release-velocity
	 * calculation baked that bogus jump straight into `physics.vx/vy` — reading as the mascot
	 * skipping the fall entirely and teleporting to wherever that spurious velocity carried it in
	 * a handful of ticks. This is also the same shared ambientPos every *other* (non-dragged)
	 * mascot's ChaseMouse reads, so it was going stale for them too whenever any one mascot was
	 * being dragged.
	 */
	private onPointerMove = (ev: PointerEvent): void => {
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
		const worldTop = this.environment.getWorldTop();
		const platforms = this.opts.paneLedgesEnabled ? this.environment.getPlatformRects() : [];
		this.ledges = computeLedgesFromRects({ ...viewport, top: worldTop }, platforms);
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
	/** `forcedPackId` has no effect on physics/position at all — it exists purely so main.ts can
	 * request a *specific* character for an otherwise perfectly ordinary fresh spawn (real
	 * per-mascot "Another One!": `Main.createMascot(imageSet)`, the exact same off-screen/
	 * random-facing fresh-spawn path as the tray's own random-character "Another One!", just
	 * with a forced imageSet instead of a random one — see onMascotCreated's own use of it).
	 * Passed straight through untouched; Stage itself has no concept of packs/characters. */
	spawnMascot(x?: number, y?: number, bornBehaviorName?: string, parent?: Mascot, forcedPackId?: string | null): Mascot | undefined {
		if (this.mascots.length >= this.opts.maxMascots) return undefined;
		const viewport = this.environment.getViewportSize();
		const spawningFresh = x === undefined && y === undefined;
		const mascot = this.createMascot(
			spawningFresh ? this.rng.range(0, viewport.width) : x ?? viewport.width / 2,
			spawningFresh ? FALL_SPAWN_Y : y ?? DEFAULT_SPAWN_Y,
		);
		if (parent) {
			// Real Breed.breed(): `mascot.setLookRight(getMascot().isLookRight())` — a new
			// sibling always starts facing the same way its parent was.
			mascot.physics.facing = parent.physics.facing;
		} else if (spawningFresh) {
			// Real Main.createMascot(imageSet) — the *only* real path to a fresh top-level
			// mascot, tray or per-mascot alike: `mascot.setLookRight(Math.random() < 0.5)`.
			// Previously always defaulted right, silently, for every manual/auto spawn.
			mascot.physics.facing = this.rng.chance(0.5) ? 1 : -1;
		}
		this.mascots.push(mascot);
		this.container.appendChild(mascot.el);
		this.opts.onMascotCreated?.(mascot, spawningFresh ? "Fall" : bornBehaviorName, parent, forcedPackId);
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

	/**
	 * Real Manager.remainOne()/remainOne(imageSet) ("Reduce to One!" in *both* the tray menu and
	 * a mascot's own right-click menu — see Mascot.java's showPopup, a second, separate
	 * per-mascot context menu the real engine has that this plugin's single context menu stands
	 * in for). A distinct, third population primitive from removeAllMascots ("Bye Everyone!",
	 * zero left) and spawnMascot ("Another One!") — previously missing entirely (conflated with
	 * "remove all").
	 *
	 * The two real overloads genuinely differ on *which end* they keep, not just whether
	 * they're filtered — confirmed by reading both literally, not assumed symmetric:
	 * - No `matches` (global, tray-level): keeps the *oldest* mascot (index 0), disposes
	 *   everyone else regardless of character.
	 * - With `matches` (per-mascot menu, scoped to that mascot's own character): keeps the
	 *   *newest* mascot satisfying it, disposes only *other* satisfying mascots — anything not
	 *   matching (other characters) is left completely untouched.
	 */
	removeAllButOne(matches?: (mascot: Mascot) => boolean): void {
		if (!matches) {
			const [keep, ...rest] = this.mascots;
			for (const m of rest) m.destroy();
			this.mascots = keep ? [keep] : [];
			return;
		}
		const matching = this.mascots.filter(matches);
		if (matching.length <= 1) return;
		const toRemove = new Set(matching.slice(0, -1)); // all but the newest (last) match
		for (const m of toRemove) m.destroy();
		this.mascots = this.mascots.filter((m) => !toRemove.has(m));
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
		window.removeEventListener("pointermove", this.onPointerMove);
		window.removeEventListener("resize", this.onResize);
		this.removeAllMascots();
		this.container.remove();
	}
}
