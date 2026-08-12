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
});
