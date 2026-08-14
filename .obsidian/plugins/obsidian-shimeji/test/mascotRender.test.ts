import { describe, expect, it } from "vitest";
import { Mascot, type MascotDeps } from "../src/engine/Mascot";
import { Random } from "../src/engine/Random";
import { DEFAULT_ENGINE_CONFIG } from "../src/engine/types";
import { PLACEHOLDER_HEIGHT, PLACEHOLDER_WIDTH } from "../src/placeholder/placeholderSprite";

/**
 * Renderer-level DOM smoke tests: unlike ActionRunner/BehaviorAI's fake-mascot-object tests,
 * these construct a real jsdom-backed Mascot and check what actually lands in its DOM —
 * catching regressions in the physics->DOM projection (render()) and the
 * placeholder<->pack-image visibility switching that a fake mascot object can't exercise.
 */
function makeDeps(overrides: Partial<MascotDeps> = {}): MascotDeps {
	return {
		config: DEFAULT_ENGINE_CONFIG,
		getAmbientPointer: () => ({ x: 0, y: 0, dx: 0, dy: 0 }),
		getViewportSize: () => ({ width: 800, height: 600 }),
		getTotalMascotCount: () => 1,
		rng: new Random(1),
		...overrides,
	};
}

/** Tolerant of the exact z-component formatting ("0" vs "0px") — only x/y are asserted on. */
function parseTranslate(transform: string): { x: number; y: number } {
	const match = transform.match(/translate3d\(([-\d.]+)px,\s*([-\d.]+)px,\s*[^)]+\)/);
	if (!match) throw new Error(`unparseable transform: "${transform}"`);
	return { x: parseFloat(match[1]), y: parseFloat(match[2]) };
}

describe("Mascot renderer", () => {
	it("builds the expected DOM structure", () => {
		const mascot = new Mascot(makeDeps(), 100, 200);
		expect(mascot.el.className).toBe("shimeji-mascot");
		expect(mascot.el.children).toHaveLength(1);
		const inner = mascot.el.firstElementChild as HTMLElement;
		expect(inner.className).toBe("shimeji-mascot-inner");
		expect(inner.querySelector("svg")).not.toBeNull();
		expect(inner.querySelector("img")).not.toBeNull();
	});

	it("starts in placeholder mode: SVG visible, <img> hidden, box sized to the placeholder", () => {
		const mascot = new Mascot(makeDeps(), 0, 0);
		const inner = mascot.el.firstElementChild as HTMLElement;
		const svg = inner.querySelector("svg") as SVGSVGElement;
		const img = inner.querySelector("img") as HTMLImageElement;
		expect(svg.style.display).not.toBe("none");
		expect(img.style.display).toBe("none");
		expect(mascot.el.style.width).toBe(`${PLACEHOLDER_WIDTH}px`);
		expect(mascot.el.style.height).toBe(`${PLACEHOLDER_HEIGHT}px`);
	});

	it("render() projects physics x/y through the current anchor into a translate3d transform", () => {
		const mascot = new Mascot(makeDeps(), 100, 200);
		mascot.render();
		const { x, y } = parseTranslate(mascot.el.style.transform);
		// Placeholder anchor is (width/2, height): left = x - anchor.x*scale, top = y - anchor.y*scale.
		expect(x).toBeCloseTo(100 - PLACEHOLDER_WIDTH / 2);
		expect(y).toBeCloseTo(200 - PLACEHOLDER_HEIGHT);
	});

	it("switching to an image pose hides the SVG, shows and sets the <img>, and re-anchors the transform", () => {
		const mascot = new Mascot(makeDeps(), 100, 200);
		mascot.setVisualImage("resolved:/shime1.png", { x: 64, y: 128 });
		mascot.render();

		const inner = mascot.el.firstElementChild as HTMLElement;
		const svg = inner.querySelector("svg") as SVGSVGElement;
		const img = inner.querySelector("img") as HTMLImageElement;
		expect(svg.style.display).toBe("none");
		expect(img.style.display).not.toBe("none");
		expect(img.getAttribute("src")).toBe("resolved:/shime1.png");

		const { x, y } = parseTranslate(mascot.el.style.transform);
		expect(x).toBeCloseTo(100 - 64);
		expect(y).toBeCloseTo(200 - 128);
	});

	it("mirrors via the inner element's scaleX(-1) when facing right, not the base orientation", () => {
		const mascot = new Mascot(makeDeps(), 0, 0);
		const inner = mascot.el.firstElementChild as HTMLElement;

		mascot.physics.facing = -1;
		mascot.render();
		expect(inner.style.transform).toBe("none");

		mascot.physics.facing = 1;
		mascot.render();
		expect(inner.style.transform).toBe("scaleX(-1)");
	});

	it("suppresses the mirror while a drag is in progress, even when facing right", () => {
		// Faithful to the real engine's Dragged.java: `getMascot().setLookRight(false)` runs
		// unconditionally on every tick *while dragging* (simulate()), not at the instant of
		// grab — the real Pinched poses are five distinct images chosen by *absolute*
		// FootX-vs-cursor.x comparison with no lookRight involved at all, so mirroring on top of
		// them (as every other state correctly does) double-transforms already
		// direction-specific art.
		const mascot = new Mascot(makeDeps(), 100, 200);
		const inner = mascot.el.firstElementChild as HTMLElement;
		mascot.physics.facing = 1;

		// jsdom doesn't implement Pointer Events capture at all (see the mobile-support notes in
		// README) — stub just enough of the real browser API for pointerdown's handler to run
		// past it without throwing.
		mascot.el.setPointerCapture = () => {};
		mascot.el.releasePointerCapture = () => {};
		mascot.el.dispatchEvent(new Event("pointerdown", { bubbles: true, cancelable: true }));
		expect(mascot.isBeingDragged).toBe(true);

		mascot.update(0.04, []); // a real Stage tick, same as simulate() forcing facing every tick
		expect(inner.style.transform).toBe("none");
	});

	it("update() advances the native fallback state machine and moves the rendered transform", () => {
		const mascot = new Mascot(makeDeps(), 100, 0);
		mascot.update(0.05, []); // no ledges to land on: gravity should keep pulling it down
		const before = parseTranslate(mascot.el.style.transform);
		for (let i = 0; i < 10; i++) mascot.update(0.05, []);
		const after = parseTranslate(mascot.el.style.transform);
		expect(after.y).toBeGreaterThan(before.y);
	});

	it("scale multiplies both the translate offset and the transform's own scale() factor", () => {
		const mascot = new Mascot(makeDeps(), 100, 200);
		mascot.scale = 2;
		mascot.render();
		expect(mascot.el.style.transform).toContain("scale(2)");
		const { x, y } = parseTranslate(mascot.el.style.transform);
		expect(x).toBeCloseTo(100 - (PLACEHOLDER_WIDTH / 2) * 2);
		expect(y).toBeCloseTo(200 - PLACEHOLDER_HEIGHT * 2);
	});

	it("dragEnabled=false suppresses the pointerdown drag-start handler", () => {
		const mascot = new Mascot(makeDeps(), 100, 200);
		mascot.dragEnabled = false;
		mascot.el.dispatchEvent(new Event("pointerdown", { bubbles: true, cancelable: true }));
		expect(mascot.isBeingDragged).toBe(false);
	});

	// Real Thrown: `<ActionReference Name="Falling" InitialVX="${mascot.environment.cursor.dx}"
	// InitialVY="${mascot.environment.cursor.dy}"/>` — release velocity *is* the same smoothed
	// cursor.dx/dy exposed everywhere else (see Stage.updateAmbientVelocity/smoothCursorVelocity),
	// not a value separately computed from how the drag itself moved (there's no longer any
	// per-drag movement history at all for such a computation to even read — see PointerState).
	// ambient.dx/dy are raw per-tick pixels (matching real Location.dx/dy's own units), so this
	// native-fallback path — which sets physics.vx/vy directly, bypassing the expression system
	// entirely — converts to px/second itself: 6px/tick * 25 ticks/s = 150px/s.
	it("release velocity comes directly from the ambient pointer's dx/dy, converted from per-tick to px/second", () => {
		const mascot = new Mascot(makeDeps({ getAmbientPointer: () => ({ x: 0, y: 0, dx: 6, dy: -1.6 }) }), 100, 200);
		mascot.el.setPointerCapture = () => {};
		mascot.el.releasePointerCapture = () => {};
		mascot.el.dispatchEvent(new Event("pointerdown", { bubbles: true, cancelable: true }));
		mascot.el.dispatchEvent(new Event("pointerup", { bubbles: true, cancelable: true }));

		expect(mascot.physics.vx).toBeCloseTo(150, 10);
		expect(mascot.physics.vy).toBeCloseTo(-40, 10);
	});
});

describe("Mascot.requestSibling (Breed)", () => {
	// Real Breed.breed(): `lookRight ? (x - BornX) : (x + BornX)` — BornX is authored relative
	// to which way the parent is facing (e.g. "spawn slightly behind me"), not a fixed
	// screen-space offset, so it flips sign when facing right. Missing this spawned every
	// sibling on the wrong side whenever the parent happened to be facing right.
	it("negates the x offset when facing right (real BornX sign flip)", () => {
		let requested: { x: number; y: number } | undefined;
		const mascot = new Mascot(makeDeps({ spawnSibling: (x, y) => (requested = { x, y }) }), 400, 300);
		mascot.physics.facing = 1;
		mascot.requestSibling(-32, 96);
		expect(requested).toEqual({ x: 400 + 32, y: 300 + 96 });
	});

	it("uses the x offset as-is when facing left", () => {
		let requested: { x: number; y: number } | undefined;
		const mascot = new Mascot(makeDeps({ spawnSibling: (x, y) => (requested = { x, y }) }), 400, 300);
		mascot.physics.facing = -1;
		mascot.requestSibling(-32, 96);
		expect(requested).toEqual({ x: 400 - 32, y: 300 + 96 });
	});

	it("never flips the y offset, regardless of facing", () => {
		const seen: number[] = [];
		const mascot = new Mascot(makeDeps({ spawnSibling: (_x, y) => seen.push(y) }), 0, 0);
		mascot.physics.facing = 1;
		mascot.requestSibling(0, 50);
		mascot.physics.facing = -1;
		mascot.requestSibling(0, 50);
		expect(seen).toEqual([50, 50]);
	});
});

/**
 * The hotspot click path (real UserBehavior.mousePressed's own first branch). Shipped untested,
 * which is how all three bugs below survived a green suite; these pin each one.
 */
describe("Mascot hotspot clicks", () => {
	/** A driver that records behavior starts and answers the real
	 * `Configuration.isBehaviorEnabled(String, Mascot)` question over a fixed known/disabled set. */
	function driverWith(known: string[], disabled: string[] = []) {
		const started: string[] = [];
		return {
			started,
			driver: {
				tick() {},
				startNamedBehavior: (_m: Mascot, name: string) => started.push(name),
				isBehaviorEnabled: (name: string | undefined) => name !== undefined && known.includes(name) && !disabled.includes(name),
			},
		};
	}

	/** jsdom gives every element a 0x0 rect, so hotspotAt's client->local mapping needs a real one. */
	function mascotAt(deps = makeDeps(), known = ["Poke"], disabled: string[] = []) {
		const mascot = new Mascot(deps, 0, 0);
		const { started, driver } = driverWith(known, disabled);
		mascot.attachDriver(driver);
		mascot.width = 100;
		mascot.el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100 }) as DOMRect;
		// Faces left, so hotspotAt uses the local x directly rather than mirroring it.
		mascot.physics.facing = -1;
		return { mascot, started };
	}

	function clickAt(mascot: Mascot, x: number, y: number): boolean {
		mascot.el.setPointerCapture = () => {};
		mascot.el.releasePointerCapture = () => {};
		const ev = new Event("pointerdown", { bubbles: true, cancelable: true });
		Object.assign(ev, { clientX: x, clientY: y, pointerId: 1, pointerType: "mouse" });
		mascot.el.dispatchEvent(ev);
		return ev.defaultPrevented;
	}

	it("runs a hotspot's behavior instead of starting a drag", () => {
		const { mascot, started } = mascotAt();
		mascot.hotspots = [{ shape: "Rectangle", origin: { x: 10, y: 10 }, size: { x: 20, y: 20 }, behavior: "Poke" }];
		expect(clickAt(mascot, 15, 15)).toBe(true);
		expect(started).toEqual(["Poke"]);
		expect(mascot.el.classList.contains("is-dragging")).toBe(false);
	});

	it("lets a click outside every hotspot fall through to the drag", () => {
		const { mascot, started } = mascotAt();
		mascot.hotspots = [{ shape: "Rectangle", origin: { x: 10, y: 10 }, size: { x: 20, y: 20 }, behavior: "Poke" }];
		clickAt(mascot, 80, 80);
		expect(started).toEqual([]);
		expect(mascot.el.classList.contains("is-dragging")).toBe(true);
	});

	// Bug 1: the hotspot scan used to sit *below* the `dragEnabled` early-return, so switching off
	// the app-level "allow dragging" setting silently disabled every hotspot a pack declared. The
	// real engine has no such toggle at all, and checks hotspots before anything drag-related.
	it("still fires with dragging switched off — a hotspot is a click, not a grab", () => {
		const { mascot, started } = mascotAt();
		mascot.dragEnabled = false;
		mascot.hotspots = [{ shape: "Rectangle", origin: { x: 10, y: 10 }, size: { x: 20, y: 20 }, behavior: "Poke" }];
		expect(clickAt(mascot, 15, 15)).toBe(true);
		expect(started).toEqual(["Poke"]);
	});

	// Bug 2: real UserBehavior ANDs `isBehaviorEnabled(hotspot.getBehaviour(), mascot)` into the
	// match itself, so a hotspot whose behavior the user switched off is transparent rather than a
	// dead zone that swallows clicks.
	it("ignores a hotspot whose behavior the user disabled, falling through to the drag", () => {
		const { mascot, started } = mascotAt(makeDeps(), ["Poke"], ["Poke"]);
		mascot.hotspots = [{ shape: "Rectangle", origin: { x: 10, y: 10 }, size: { x: 20, y: 20 }, behavior: "Poke" }];
		clickAt(mascot, 15, 15);
		expect(started).toEqual([]);
		expect(mascot.el.classList.contains("is-dragging")).toBe(true);
	});

	// ...and because the check lives inside the loop before the `break`, a disabled hotspot does not
	// end the scan — a later overlapping one can still match.
	it("continues scanning past a disabled hotspot to a later overlapping one", () => {
		const { mascot, started } = mascotAt(makeDeps(), ["Poke", "Pat"], ["Poke"]);
		mascot.hotspots = [
			{ shape: "Rectangle", origin: { x: 0, y: 0 }, size: { x: 50, y: 50 }, behavior: "Poke" },
			{ shape: "Rectangle", origin: { x: 10, y: 10 }, size: { x: 20, y: 20 }, behavior: "Pat" },
		];
		clickAt(mascot, 15, 15);
		expect(started).toEqual(["Pat"]);
	});

	// Bug 3: `Hotspot.java` alone reads as though a behaviour-less hotspot still consumes the click,
	// and it did before v1.0.21 — but the String overload of isBehaviorEnabled returns false for any
	// name absent from `behaviorBuilders`, and null is one of those. Against current ground truth a
	// hotspot with no Behaviour (or one naming a behavior the pack doesn't define) is transparent.
	it("treats a hotspot with no Behaviour as transparent, not as a click-swallowing dead zone", () => {
		const { mascot, started } = mascotAt();
		mascot.hotspots = [{ shape: "Rectangle", origin: { x: 10, y: 10 }, size: { x: 20, y: 20 } }];
		clickAt(mascot, 15, 15);
		expect(started).toEqual([]);
		expect(mascot.el.classList.contains("is-dragging")).toBe(true);
	});

	it("treats a hotspot naming a behavior the pack does not define as transparent", () => {
		const { mascot, started } = mascotAt(makeDeps(), ["Poke"]);
		mascot.hotspots = [{ shape: "Rectangle", origin: { x: 10, y: 10 }, size: { x: 20, y: 20 }, behavior: "Nonexistent" }];
		clickAt(mascot, 15, 15);
		expect(started).toEqual([]);
		expect(mascot.el.classList.contains("is-dragging")).toBe(true);
	});

	// Real Hotspot.contains: `mascot.isLookRight() ? bounds.width - point.x : point.x` — the region
	// is authored against the left-facing art and mirrored with the sprite.
	it("mirrors the hotspot's x when the mascot faces right", () => {
		const { mascot, started } = mascotAt();
		mascot.physics.facing = 1;
		mascot.hotspots = [{ shape: "Rectangle", origin: { x: 10, y: 10 }, size: { x: 20, y: 20 }, behavior: "Poke" }];
		// width 100, so a region at local x 10..30 is clickable at client x 70..90 when facing right.
		clickAt(mascot, 15, 15);
		expect(started).toEqual([]);
		clickAt(mascot, 85, 15);
		expect(started).toEqual(["Poke"]);
	});
});
