import { SHIMEJI_TICK_MS, SHIMEJI_TICKS_PER_SEC } from "../shimeji/constants";
import { newSpecId, type CustomActionSpec, type CustomAnimationVariantSpec, type CustomPoseSpec } from "../shimeji/customContent";
import type { ActionDef, PoseDef } from "../shimeji/types";
import { IE_ONLY_ACTION_NAMES } from "./deriveRequiredPoses";

/**
 * Lets a custom action have several alternative animations ("options") — e.g. two or three
 * different Walk cycles cut from a richer game sprite sheet — that get picked between at random,
 * equally likely, instead of a single fixed sequence. This is generated `CustomActionSpec` data
 * (one `CustomAnimationVariantSpec` per option) flowing through the existing
 * `CustomContentBuilder`/`mergeCustomContent` pipeline unchanged, so it needs no changes to
 * `ActionRunner` or the expression engine: `ActionRunner.chooseAnimationVariant` already
 * re-evaluates an action's Animation conditions fresh every single time the action starts (never
 * cached), and `Math.random()` is already a real, supported call inside a condition
 * (`RuntimeContext.ts`'s `call()`) — both verified directly against source before writing this,
 * not assumed.
 */

/**
 * `ActionRunner.chooseAnimationVariant` picks the *first* variant whose condition passes, falling
 * back to the first variant if none do. Giving each of N options its own independent
 * `Math.random() < 1/N` condition would therefore NOT make them equally likely: option 2 is only
 * even rolled if option 1's roll already failed, so naive independent conditions produce a
 * geometrically-decreasing bias toward earlier options. The fix is a cascading threshold — option
 * i (0-indexed) needs `Math.random() < 1/(count-i)` so that, *conditioned on being reached*, it
 * has exactly a 1/(remaining options) chance. That multiplies out to a flat 1/count for every
 * option: P(0)=1/count, P(1)=(1-1/count)*1/(count-1)=1/count, and so on. The last option is left
 * unconditional (no Animation Condition at all) as the guaranteed fallback.
 */
export function randomVariantConditions(count: number): (string | undefined)[] {
	if (count <= 0) return [];
	const conditions: (string | undefined)[] = [];
	for (let i = 0; i < count - 1; i++) {
		conditions.push(`#{Math.random() < ${1 / (count - i)}}`);
	}
	conditions.push(undefined);
	return conditions;
}

/**
 * Reverses CustomContentBuilder's buildPose, to seed "Option 1" from an action's current
 * (standard-schema) animation before the user adds further options. Note: a real Pose can also
 * carry Sound/Volume, but CustomPoseSpec has no fields for either (the custom-content editor has
 * never supported authoring pose sound) — converting a pose that has one silently drops it, same
 * pre-existing limitation as hand-building a CustomActionSpec any other way. None of the bundled
 * reference schema's poses use Sound, so this doesn't come up for the wizard's own checklist.
 */
export function poseDefToCustomPoseSpec(pose: PoseDef): CustomPoseSpec {
	return {
		id: newSpecId(),
		image: pose.image,
		anchorX: pose.anchor.x,
		anchorY: pose.anchor.y,
		velocityX: pose.velocity ? pose.velocity.x / SHIMEJI_TICKS_PER_SEC : 0,
		velocityY: pose.velocity ? pose.velocity.y / SHIMEJI_TICKS_PER_SEC : 0,
		durationTicks: Math.round(pose.durationMs / SHIMEJI_TICK_MS),
	};
}

/**
 * Assembles a full CustomActionSpec replacement for one action, given its current effective def
 * (standard or already-custom — either way its type/borderType/loop/params/embeddedName are the
 * settled values a replacement must carry forward, since mergeCustomContent replaces an action
 * wholesale by name rather than patching individual fields) and the complete list of animation
 * options the user wants (each just its poses — this function generates the cascaded random
 * conditions, so callers can't accidentally build a non-uniform set by hand). Always rebuilds from
 * scratch, the same full-replacement approach the rest of the custom-content system already uses.
 */
export function buildReplacementActionSpec(existingDef: ActionDef, optionPoseSequences: CustomPoseSpec[][]): CustomActionSpec {
	const conditions = randomVariantConditions(optionPoseSequences.length);
	const animations: CustomAnimationVariantSpec[] = optionPoseSequences.map((poses, i) => ({
		id: newSpecId(),
		condition: conditions[i] ?? "",
		poses,
	}));
	return {
		id: newSpecId(),
		name: existingDef.name,
		type: existingDef.type,
		borderType: existingDef.borderType ?? "",
		loop: existingDef.loop,
		animations,
		children: [],
		embeddedClass: existingDef.embeddedName ?? "",
		params: { ...existingDef.params },
	};
}

/**
 * What velocity a freshly sliced replacement frame should start with, so slicing new art for
 * (say) Walk doesn't quietly turn it into a held-in-place animation. `posesFromPlan` always zeroes
 * a fresh slice's velocity — correctly, in isolation: how far a step carries the mascot is a
 * property of the action, not of the picture, and a guessed nonzero speed would be its own kind of
 * wrong (see poseSlicing.ts's own reasoning). But when the slice is *replacing* an action's
 * existing frames, that context — the speed this action already, actually moves at — is right
 * there and worth carrying forward as the new frames' own starting point, still fully editable
 * afterward. Real Move actions hold one constant velocity across every Pose in the cycle (Walk's
 * four Poses all carry the identical `Velocity="-2,0"` in the bundled schema), so any pose already
 * in play is a representative sample — this returns the first nonzero one it finds. Checks
 * `currentPoses` (whatever the action *actually* plays right now — an existing custom override,
 * if there is one) before `standardDef` (the pack's original definition), since a custom override
 * already changing the speed is the more current truth. `undefined` for an action that
 * legitimately never moves (Stay, Sit, ...), so nothing here would put a fake velocity on one.
 */
export function findReferenceVelocity(standardDef: ActionDef | undefined, ...currentPoses: CustomPoseSpec[][]): { x: number; y: number } | undefined {
	for (const poses of currentPoses) {
		for (const pose of poses) {
			if (pose.velocityX !== 0 || pose.velocityY !== 0) return { x: pose.velocityX, y: pose.velocityY };
		}
	}
	for (const variant of standardDef?.animations ?? []) {
		for (const pose of variant.poses) {
			if (pose.velocity && (pose.velocity.x !== 0 || pose.velocity.y !== 0)) {
				return { x: pose.velocity.x / SHIMEJI_TICKS_PER_SEC, y: pose.velocity.y / SHIMEJI_TICKS_PER_SEC };
			}
		}
	}
	return undefined;
}

export interface AnimatedActionChecklist {
	/** Names of actions with their own animation, eligible for multiple randomized options. */
	required: string[];
	/** Same, but window-throw-only (IE) actions — shown, but tucked away like deriveRequiredPoses'
	 * own optional group. */
	optional: string[];
}

/**
 * Which actions in a pack actually own an animation of their own (non-empty `animations`, i.e.
 * not a pure Sequence/Select choreography step) and are therefore eligible for the "give this
 * action multiple animation options" flow — split required/optional using the same IE-only-art
 * exclusion deriveRequiredPoses uses, so the two checklists the wizard shows stay consistent.
 */
export function deriveAnimatedActions(actions: Map<string, ActionDef>): AnimatedActionChecklist {
	const required: string[] = [];
	const optional: string[] = [];
	for (const [name, action] of actions) {
		if (action.animations.length === 0) continue;
		(IE_ONLY_ACTION_NAMES.has(name) ? optional : required).push(name);
	}
	required.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
	optional.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
	return { required, optional };
}
