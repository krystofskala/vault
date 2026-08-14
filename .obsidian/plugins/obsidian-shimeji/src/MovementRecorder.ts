import { describeSurface } from "./engine/MovementAudit";
import type { Mascot } from "./engine/Mascot";
import type { Stage } from "./engine/Stage";

/**
 * Records what a mascot actually does **inside Obsidian**, at real frame rate, against the real
 * layout — the half the headless audit cannot reach.
 *
 * The headless audit in MovementAudit.ts simulates against synthetic ledges, so it only ever tests
 * what the geometry model says should happen. Everything downstream of that is untested by it: the
 * real ledge scan over real DOM rects, sidebars and tab strips, panes that resize under the mascot
 * while it walks, requestAnimationFrame pacing versus the fixed timestep, and the rendered position
 * as opposed to the physics position. Those are exactly where "it feels wrong but the tests pass"
 * lives, so this samples the live thing and writes a file.
 *
 * Sampling is a plain rAF loop reading `physics`, deliberately not a hook inside the engine: a
 * recorder that changes the tick order it is measuring is worth nothing.
 */

export interface Sample {
	ms: number;
	x: number;
	y: number;
	vx: number;
	vy: number;
	facing: number;
	surface: string;
	behavior: string;
	/** Distance from the previous sample — the teleport signal. */
	step: number;
	/** Free-text marker for whatever the script was doing at this moment. */
	phase: string;
}

export interface RecorderNote {
	ms: number;
	text: string;
}

/** Bigger than any single frame of the pack's fastest animation (Jumping, 20px/tick ≈ 20px/frame)
 * with generous headroom for a slow frame, so this only fires on a genuine discontinuity. */
const TELEPORT_PX = 60;

/** How long the mascot may sit still during a phase that is supposed to be travelling. */
const STUCK_MS = 4000;

export class MovementRecorder {
	private samples: Sample[] = [];
	private notes: RecorderNote[] = [];
	private raf = 0;
	private startedAt = 0;
	private last?: { x: number; y: number };
	private phase = "free play";
	private stillSince = 0;
	private expectMovement = false;
	private stuckReported = false;

	constructor(private stage: Stage, private mascot: Mascot) {}

	get sampleCount(): number {
		return this.samples.length;
	}

	setPhase(phase: string, expectMovement = false): void {
		this.phase = phase;
		this.expectMovement = expectMovement;
		this.stillSince = performance.now();
		this.stuckReported = false;
		this.note(`— ${phase}`);
	}

	note(text: string): void {
		this.notes.push({ ms: Math.round(performance.now() - this.startedAt), text });
	}

	start(): void {
		this.startedAt = performance.now();
		this.last = undefined;
		this.stillSince = this.startedAt;
		const tick = () => {
			this.sample();
			this.raf = requestAnimationFrame(tick);
		};
		this.raf = requestAnimationFrame(tick);
	}

	stop(): void {
		cancelAnimationFrame(this.raf);
		this.raf = 0;
	}

	private sample(): void {
		const now = performance.now();
		const p = this.mascot.physics;
		const step = this.last ? Math.hypot(p.x - this.last.x, p.y - this.last.y) : 0;

		if (step > TELEPORT_PX) {
			this.note(`!! jumped ${Math.round(step)}px in one frame — (${Math.round(this.last!.x)},${Math.round(this.last!.y)}) → (${Math.round(p.x)},${Math.round(p.y)})`);
		}
		if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) this.note("!! position is NaN/Infinity");

		const viewport = this.mascot.getViewportSize();
		if (p.x < -60 || p.x > viewport.width + 60 || p.y > viewport.height + 60) {
			this.note(`!! outside the window at (${Math.round(p.x)},${Math.round(p.y)})`);
		}

		if (step > 1) this.stillSince = now;
		else if (this.expectMovement && !this.stuckReported && now - this.stillSince > STUCK_MS) {
			this.stuckReported = true;
			this.note(`!! stationary for ${Math.round((now - this.stillSince) / 1000)}s during "${this.phase}"`);
		}

		this.samples.push({
			ms: Math.round(now - this.startedAt),
			x: Math.round(p.x),
			y: Math.round(p.y),
			vx: Math.round(p.vx * 10) / 10,
			vy: Math.round(p.vy * 10) / 10,
			facing: p.facing,
			surface: describeSurface(p),
			behavior: this.mascot.currentBehaviorName ?? "-",
			step: Math.round(step),
			phase: this.phase,
		});
		this.last = { x: p.x, y: p.y };
	}

	/**
	 * Markdown, because it lands in the vault and the point is that it gets read and pasted back.
	 * Deliberately not one row per frame: a five-minute run is ~18,000 frames, which is unreadable and
	 * unpasteable. Rows collapse while nothing interesting changes, and every anomaly is kept verbatim.
	 */
	report(title: string): string {
		const out: string[] = [];
		const viewport = this.mascot.getViewportSize();
		out.push(`# ${title}`, "");
		out.push(`- when: ${new Date().toISOString()}`);
		out.push(`- window: ${viewport.width} x ${viewport.height}, worldTop ${Math.round(this.mascot.getWorldTop())}`);
		out.push(`- duration: ${(this.samples.length ? this.samples[this.samples.length - 1].ms / 1000 : 0).toFixed(1)}s over ${this.samples.length} frames`);
		out.push("");

		const anomalies = this.notes.filter((n) => n.text.startsWith("!!"));
		out.push(anomalies.length === 0 ? "## No anomalies detected" : `## ${anomalies.length} anomalies`);
		for (const a of anomalies) out.push(`- \`${a.ms}ms\` ${a.text.slice(3)}`);
		out.push("");

		out.push("## Ledges at the end of the run", "", "```");
		for (const l of this.stage.getLedges()) {
			out.push(
				l.kind === "wall"
					? `wall  ${l.side.padEnd(5)} x=${Math.round(l.x)}  y=[${Math.round(l.y1)},${Math.round(l.y2)}]  ${l.source}`
					: `${l.kind.padEnd(7)}     y=${Math.round(l.y)}  x=[${Math.round(l.x1)},${Math.round(l.x2)}]  ${l.source}`,
			);
		}
		out.push("```", "");

		out.push("## Timeline", "");
		out.push("| ms | phase | x | y | vx | vy | on | behavior | step |");
		out.push("|---|---|---|---|---|---|---|---|---|");
		let prev: Sample | undefined;
		for (const s of this.samples) {
			const interesting =
				!prev ||
				s.phase !== prev.phase ||
				s.behavior !== prev.behavior ||
				s.surface !== prev.surface ||
				s.step > TELEPORT_PX ||
				s.ms - prev.ms > 500;
			if (!interesting) continue;
			out.push(`| ${s.ms} | ${s.phase} | ${s.x} | ${s.y} | ${s.vx} | ${s.vy} | ${s.surface} | ${s.behavior} | ${s.step} |`);
			prev = s;
		}
		out.push("");
		out.push("## Full note log", "", "```");
		for (const n of this.notes) out.push(`${String(n.ms).padStart(7)}ms  ${n.text}`);
		out.push("```");
		return out.join("\n");
	}
}
