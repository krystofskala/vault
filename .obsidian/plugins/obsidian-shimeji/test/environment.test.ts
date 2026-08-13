import { afterEach, describe, expect, it } from "vitest";
import { ObsidianDomEnvironment } from "../src/engine/Environment";

function rectAt(top: number, bottom = 0, width = 0): DOMRect {
	return { top, left: 0, right: width, bottom, width, height: bottom - top, x: 0, y: top, toJSON: () => ({}) };
}

function addTabHeaderContainer(rect: { top: number; bottom: number; width: number }): HTMLElement {
	const el = document.createElement("div");
	el.className = "workspace-tab-header-container";
	el.getBoundingClientRect = () => rectAt(rect.top, rect.bottom, rect.width);
	document.body.appendChild(el);
	return el;
}

describe("ObsidianDomEnvironment.getWorldTop", () => {
	afterEach(() => {
		document.querySelectorAll(".workspace-tab-header-container").forEach((el) => el.remove());
	});

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

	// Regression coverage for a real, confirmed (not guessed) bug: Obsidian can merge the tab
	// strip into the same row as the title bar's own window controls — a user's own screenshot
	// showed exactly this — in which case app.workspace.containerEl starts at literal y=0
	// (nothing to exclude by that measurement alone) even though the tab-header row itself has a
	// real, nonzero height that's the actual boundary mattering here. A user's own console
	// confirmed `.workspace-tab-header-spacer` (inside `.workspace-tab-header-container`) computes
	// `-webkit-app-region: drag` — this is the real element carrying the drag region.
	it("uses the tab-header row's own bottom edge when workspace.containerEl starts at 0", () => {
		const containerEl = document.createElement("div");
		containerEl.getBoundingClientRect = () => rectAt(0);
		addTabHeaderContainer({ top: 0, bottom: 40, width: 400 });
		const env = new ObsidianDomEnvironment({ containerEl });
		expect(env.getWorldTop()).toBe(40);
	});

	it("unions multiple top-row tab-header containers (side-by-side pane groups) via their max bottom", () => {
		const containerEl = document.createElement("div");
		containerEl.getBoundingClientRect = () => rectAt(0);
		addTabHeaderContainer({ top: 0, bottom: 36, width: 300 });
		addTabHeaderContainer({ top: 0, bottom: 40, width: 300 }); // slightly taller sibling
		const env = new ObsidianDomEnvironment({ containerEl });
		expect(env.getWorldTop()).toBe(40);
	});

	it("ignores a lower pane group's own tab-header row in a vertically-split layout", () => {
		const containerEl = document.createElement("div");
		containerEl.getBoundingClientRect = () => rectAt(0);
		addTabHeaderContainer({ top: 0, bottom: 40, width: 400 }); // the real title-bar row
		addTabHeaderContainer({ top: 300, bottom: 340, width: 400 }); // an unrelated lower pane group
		const env = new ObsidianDomEnvironment({ containerEl });
		expect(env.getWorldTop()).toBe(40);
	});

	it("takes whichever of the two signals excludes more", () => {
		const containerEl = document.createElement("div");
		containerEl.getBoundingClientRect = () => rectAt(50); // e.g. a genuinely separate title bar sibling
		addTabHeaderContainer({ top: 50, bottom: 70, width: 400 }); // tab row inside workspace, taller
		const env = new ObsidianDomEnvironment({ containerEl });
		expect(env.getWorldTop()).toBe(70);
	});
});
