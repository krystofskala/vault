import { parseCondition } from "./Expression";
import type { BehaviorDef, BehaviorNextDef } from "./types";

function parseNextBehaviors(el: Element): BehaviorNextDef[] {
	const next: BehaviorNextDef[] = [];

	// Prefer explicit child elements when present (either tag name seen in the wild).
	for (const tag of ["BehaviorReference", "NextBehavior"]) {
		for (const refEl of Array.from(el.getElementsByTagName(tag))) {
			const refName = refEl.getAttribute("Name");
			if (!refName) continue;
			next.push({ name: refName, add: refEl.getAttribute("Add") === "true" });
		}
	}
	if (next.length > 0) return next;

	// Fall back to a flat comma-separated attribute, e.g. NextBehaviorList="A,B,C".
	const flat = el.getAttribute("NextBehaviorList") ?? el.getAttribute("NextBehavior");
	if (flat) {
		for (const part of flat.split(",")) {
			const trimmed = part.trim();
			if (trimmed) next.push({ name: trimmed, add: false });
		}
	}
	return next;
}

function parseBehaviorElement(el: Element): BehaviorDef | null {
	const name = el.getAttribute("Name");
	if (!name) return null;
	const conditionRaw = el.getAttribute("Condition");
	return {
		name,
		frequency: Number(el.getAttribute("Frequency") ?? "0") || 0,
		hidden: el.getAttribute("Hidden") === "true",
		condition: conditionRaw ? parseCondition(conditionRaw) : undefined,
		nextBehaviors: parseNextBehaviors(el),
	};
}

export function parseBehaviorsXml(xmlText: string): Map<string, BehaviorDef> {
	const doc = new DOMParser().parseFromString(xmlText, "application/xml");
	const parserError = doc.querySelector("parsererror");
	if (parserError) throw new Error(`behaviors.xml is not valid XML: ${parserError.textContent ?? "unknown error"}`);

	const behaviors = new Map<string, BehaviorDef>();
	for (const el of Array.from(doc.getElementsByTagName("Behavior"))) {
		try {
			const def = parseBehaviorElement(el);
			if (def) behaviors.set(def.name, def);
		} catch (err) {
			console.warn(`[obsidian-shimeji] skipping malformed <Behavior>: ${(err as Error).message}`);
		}
	}
	return behaviors;
}
