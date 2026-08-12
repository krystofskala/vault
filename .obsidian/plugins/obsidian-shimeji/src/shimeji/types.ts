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
	/** px/second and ms, already converted from Shimeji-ee's tick units at parse time. */
	velocity?: Vec2;
	durationMs: number;
}

/** A pack can define several <Animation> blocks on one Action, each gated by its own
 * Condition (e.g. ClimbWall picks "climbing up" vs "climbing down" poses depending on
 * which side of the target it's on). The first block whose condition passes at the moment
 * the action starts is used for its whole run. */
export interface AnimationVariant {
	condition?: ExprNode;
	poses: PoseDef[];
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
	animations: AnimationVariant[];
	/** Sequence: run in order. Select: first child whose condition passes (or the first
	 * with no condition) is chosen. */
	children: ActionRefDef[];
	/** Set when type === "Embedded": which native physics handler drives this action, taken
	 * from the last segment of the Class attribute (e.g. "com.group_finity...Dragged" ->
	 * "Dragged"). Falls back to the action's own Name if there's no Class attribute. */
	embeddedName?: string;
	params: Record<string, string>;
}

export interface BehaviorNextDef {
	name: string;
	/** Weight for this specific transition edge (from <BehaviorReference Frequency="...">),
	 * distinct from the target behavior's own top-level Frequency. */
	frequency: number;
	condition?: ExprNode;
	add: boolean;
}

export interface BehaviorDef {
	name: string;
	/** Weighted selection value for the top-level random pool. 0 means "reachable only via
	 * another behavior's nextBehaviors list" (real packs have no separate Hidden flag —
	 * Frequency=0 alone keeps a behavior out of the initial pool). */
	frequency: number;
	/** Combines the Behavior's own Condition attribute with any enclosing <Condition> wrapper
	 * elements (real behaviors.xml groups many behaviors under one wrapper condition). */
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
	/** Vault-relative folder this pack's images live in — set by PackLoader for real loaded
	 * packs, used by the custom-content editor to offer an image picker. Optional so synthetic
	 * packs (tests, mergeCustomContent's output) don't need to fabricate one. */
	imgDir?: string;
}
