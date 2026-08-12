import { describe, expect, it } from "vitest";
import { applyNativeEmbedded } from "../src/shimeji/nativeAdapter";
import { DEFAULT_ENGINE_CONFIG } from "../src/engine/types";
import type { Mascot } from "../src/engine/Mascot";

function fakeMascot() {
	return { physics: { x: 0, y: 0, vx: 100, vy: 0, facing: 1 as const, grounded: false } };
}

describe("applyNativeEmbedded Fall params", () => {
	it("applies the action's own RegistanceX as air drag on vx over time", () => {
		const mascot = fakeMascot();
		const ledges = [{ kind: "floor" as const, y: 10000, x1: -1e6, x2: 1e6, source: "window" as const }];
		for (let i = 0; i < 60; i++) {
			applyNativeEmbedded("Fall", mascot as unknown as Mascot, 0.016, ledges, { x: 0, y: 0 }, DEFAULT_ENGINE_CONFIG, { RegistanceX: "0.1" });
		}
		expect(mascot.physics.vx).toBeLessThan(100);
		expect(mascot.physics.vx).toBeGreaterThan(0);
	});

	it("leaves vx unchanged when no RegistanceX is declared", () => {
		const mascot = fakeMascot();
		const ledges = [{ kind: "floor" as const, y: 10000, x1: -1e6, x2: 1e6, source: "window" as const }];
		applyNativeEmbedded("Fall", mascot as unknown as Mascot, 0.016, ledges, { x: 0, y: 0 }, DEFAULT_ENGINE_CONFIG, {});
		expect(mascot.physics.vx).toBe(100);
	});

	it("uses the action's own Gravity override instead of the global default", () => {
		const mascot = fakeMascot();
		const withOverride = fakeMascot();
		const ledges = [{ kind: "floor" as const, y: 10000, x1: -1e6, x2: 1e6, source: "window" as const }];
		applyNativeEmbedded("Fall", mascot as unknown as Mascot, 0.1, ledges, { x: 0, y: 0 }, DEFAULT_ENGINE_CONFIG, {});
		applyNativeEmbedded("Fall", withOverride as unknown as Mascot, 0.1, ledges, { x: 0, y: 0 }, DEFAULT_ENGINE_CONFIG, { Gravity: "0.5" });
		// A much smaller Gravity override should fall noticeably slower than the default.
		expect(withOverride.physics.vy).toBeLessThan(mascot.physics.vy);
	});
});
