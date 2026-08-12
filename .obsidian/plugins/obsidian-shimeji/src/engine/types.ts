export interface Vec2 {
	x: number;
	y: number;
}

export interface Rect {
	left: number;
	top: number;
	right: number;
	bottom: number;
}

export type LedgeSource = "window" | "pane" | "statusbar";

export type Ledge =
	| { kind: "floor"; y: number; x1: number; x2: number; source: LedgeSource }
	| { kind: "ceiling"; y: number; x1: number; x2: number; source: LedgeSource }
	| { kind: "wall"; side: "left" | "right"; x: number; y1: number; y2: number; source: LedgeSource };

export type FloorLedge = Extract<Ledge, { kind: "floor" }>;
export type CeilingLedge = Extract<Ledge, { kind: "ceiling" }>;
export type WallLedge = Extract<Ledge, { kind: "wall" }>;

export interface PointerState {
	x: number;
	y: number;
	down: boolean;
	/** Recent (x,y,t) samples used to compute a release velocity when a drag ends. */
	history: Array<{ x: number; y: number; t: number }>;
}

/** Ambient (non-drag) mouse position + recent velocity, tracked window-wide by Stage. Used
 * for ChaseMouse-style behaviors and fed into a pack's cursor.x/y/dx/dy environment lookups. */
export interface AmbientPointer {
	x: number;
	y: number;
	dx: number;
	dy: number;
}

export type Facing = 1 | -1;

export type NativeStateName =
	| "idle"
	| "walk"
	| "fall"
	| "thrown"
	| "dragged"
	| "chase-mouse"
	| "sit"
	| "climb-wall"
	| "walk-ceiling";

/** Mutable physics/animation state shared by the native fallback state machine and the
 * XML "Embedded" action handlers, so both drive the same underlying physics code. */
export interface MascotPhysics {
	x: number;
	y: number;
	vx: number;
	vy: number;
	facing: Facing;
	grounded: boolean;
	currentFloor?: Ledge;
	currentWall?: Ledge;
}

export interface EngineConfig {
	gravity: number;
	walkSpeed: number;
	climbSpeed: number;
	dragThrowScale: number;
	minThrowSpeed: number;
	/** Settings-level behavior toggle (not a physics tunable, but threaded through the same
	 * shared config object so both the native fallback state machine and real-pack BehaviorAI
	 * see a live update without Stage needing a separate policy-config path). */
	chaseMouseEnabled: boolean;
}

export const DEFAULT_ENGINE_CONFIG: EngineConfig = {
	gravity: 1400,
	walkSpeed: 90,
	climbSpeed: 70,
	dragThrowScale: 1,
	minThrowSpeed: 60,
	chaseMouseEnabled: true,
};

/** Shimeji-ee's own engine runs a fixed-timestep loop at this rate; Stage's simulation loop
 * uses the same step so behavior timing lines up with Duration/Velocity values, which are
 * themselves ticks of this same clock (see shimeji/constants.ts). */
export const ENGINE_FIXED_TICK_MS = 40;
