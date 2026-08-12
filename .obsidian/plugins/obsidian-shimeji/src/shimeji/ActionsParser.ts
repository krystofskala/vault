import { parseCondition } from "./Expression";
import type { ActionDef, ActionRefDef, ActionType, BorderType, PoseDef, Vec2 } from "./types";

const KNOWN_TYPES: ActionType[] = ["Stay", "Move", "Animate", "Sequence", "Select", "Embedded"];
function isKnownType(t: string): t is ActionType {
	return (KNOWN_TYPES as string[]).includes(t);
}

const KNOWN_BORDERS: BorderType[] = ["Floor", "Wall", "Ceiling"];
function isKnownBorder(t: string | null): t is BorderType {
	return !!t && (KNOWN_BORDERS as string[]).includes(t);
}

function parsePair(raw: string | null): Vec2 | undefined {
	if (!raw) return undefined;
	const parts = raw.split(",").map((s) => parseFloat(s.trim()));
	if (parts.length < 2 || parts.some((n) => Number.isNaN(n))) return undefined;
	return { x: parts[0], y: parts[1] };
}

function parsePose(el: Element): PoseDef {
	return {
		image: el.getAttribute("Image") ?? "",
		anchor: parsePair(el.getAttribute("ImageAnchor")) ?? { x: 0, y: 0 },
		velocity: parsePair(el.getAttribute("Velocity")),
		durationMs: Number(el.getAttribute("Duration") ?? "100") || 100,
	};
}

function parseActionRef(el: Element): ActionRefDef {
	const conditionRaw = el.getAttribute("Condition") ?? el.getAttribute("NotCondition");
	const negate = !el.getAttribute("Condition") && !!el.getAttribute("NotCondition");
	const parsed = conditionRaw ? parseCondition(conditionRaw) : undefined;
	const paramOverrides: Record<string, string> = {};
	for (const attr of Array.from(el.attributes)) {
		if (attr.name === "Name" || attr.name === "Condition" || attr.name === "NotCondition") continue;
		paramOverrides[attr.name] = attr.value;
	}
	return {
		name: el.getAttribute("Name") ?? "",
		condition: negate && parsed ? { kind: "unary", op: "!", expr: parsed } : parsed,
		paramOverrides,
	};
}

function parseActionElement(el: Element): ActionDef | null {
	const name = el.getAttribute("Name");
	if (!name) return null;
	const typeAttr = el.getAttribute("Type") ?? "Stay";
	const type = isKnownType(typeAttr) ? typeAttr : "Stay";
	if (!isKnownType(typeAttr)) {
		console.warn(`[obsidian-shimeji] Action "${name}" has unrecognized Type="${typeAttr}", treating as Stay`);
	}

	const borderAttr = el.getAttribute("BorderType");
	const borderType = isKnownBorder(borderAttr) ? borderAttr : undefined;

	const params: Record<string, string> = {};
	for (const attr of Array.from(el.attributes)) params[attr.name] = attr.value;

	const poses: PoseDef[] = Array.from(el.getElementsByTagName("Pose")).map(parsePose);

	const children: ActionRefDef[] = Array.from(el.children)
		.filter((child) => child.tagName === "ActionReference")
		.map(parseActionRef);

	return {
		name,
		type,
		borderType,
		loop: el.getAttribute("Loop") === "true",
		poses,
		children,
		embeddedName: type === "Embedded" ? el.getAttribute("Class") || name : undefined,
		params,
	};
}

export function parseActionsXml(xmlText: string): Map<string, ActionDef> {
	const doc = new DOMParser().parseFromString(xmlText, "application/xml");
	const parserError = doc.querySelector("parsererror");
	if (parserError) throw new Error(`actions.xml is not valid XML: ${parserError.textContent ?? "unknown error"}`);

	const actions = new Map<string, ActionDef>();
	for (const el of Array.from(doc.getElementsByTagName("Action"))) {
		try {
			const def = parseActionElement(el);
			if (def) actions.set(def.name, def);
		} catch (err) {
			console.warn(`[obsidian-shimeji] skipping malformed <Action>: ${(err as Error).message}`);
		}
	}
	return actions;
}
