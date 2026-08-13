import { describe, expect, it } from "vitest";
import { ObsidianDomEnvironment } from "../src/engine/Environment";

function rectAt(top: number): DOMRect {
	return { top, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: top, toJSON: () => ({}) };
}

describe("ObsidianDomEnvironment.getWorldTop", () => {
	// The real fix (see Environment.ts's own comment): main.ts now injects the real
	// `app.workspace` — a documented, public Obsidian API object — instead of this class
	// guessing a `.workspace` CSS selector, which is what it used to (and still does, as a
	// fallback only) rely on.
	it("reads the injected workspace's containerEl rect when one is provided", () => {
		const containerEl = document.createElement("div");
		containerEl.getBoundingClientRect = () => rectAt(42);
		const env = new ObsidianDomEnvironment({ containerEl });
		expect(env.getWorldTop()).toBe(42);
	});

	it("never returns a negative top (clamped to 0)", () => {
		const containerEl = document.createElement("div");
		containerEl.getBoundingClientRect = () => rectAt(-10);
		const env = new ObsidianDomEnvironment({ containerEl });
		expect(env.getWorldTop()).toBe(0);
	});

	it("falls back to 0 when nothing was injected and no .workspace element exists in the DOM", () => {
		const env = new ObsidianDomEnvironment();
		expect(env.getWorldTop()).toBe(0);
	});
});
