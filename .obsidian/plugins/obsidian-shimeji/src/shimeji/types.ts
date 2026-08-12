import type { Node as ExprNode } from "./Expression";

export type ActionType = "Stay" | "Move" | "Animate" | "Sequence" | "Select" | "Embedded";
export type BorderType = "Floor" | "Wall" | "Ceiling";

export interface Vec2 {
	x: number;
	y: number;
}

export interface PoseDef {
	image: string;
	anchor: Vec2;
	velocity?: Vec2;
	durationMs: number;
}

export interface ActionRefDef {
	name: string;
	condition?: ExprNode;
	paramOverrides: Record<string, string>;
}

export interface ActionDef {
	name: string;
	type: ActionType;
	borderType?: BorderType;
	loop: boolean;
	poses: PoseDef[];
	/** Sequence: run in order. Select: first child whose condition passes (or the first
	 * with no condition) is chosen. */
	children: ActionRefDef[];
	/** Set when type === "Embedded": which native physics handler drives this action
	 * (e.g. "Fall", "Dragged", "Thrown", "ChaseMouse"). Falls back to the action's own
	 * Name, since packs typically name embedded actions after their native behavior. */
	embeddedName?: string;
	params: Record<string, string>;
}

export interface BehaviorNextDef {
	name: string;
	add: boolean;
}

export interface BehaviorDef {
	name: string;
	/** Weighted selection value. 0 means "reachable only via another behavior's
	 * nextBehaviors list", not from the top-level random pool. */
	frequency: number;
	hidden: boolean;
	condition?: ExprNode;
	nextBehaviors: BehaviorNextDef[];
}

export interface MascotPack {
	id: string;
	name: string;
	actions: Map<string, ActionDef>;
	behaviors: Map<string, BehaviorDef>;
	/** Resolves a Pose's raw `Image` path (e.g. "/shime1.png") to a src usable in an <img>. */
	resolveImage: (path: string) => string;
}
