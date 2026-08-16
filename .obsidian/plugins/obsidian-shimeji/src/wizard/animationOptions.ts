/**
 * Lets a custom action have several alternative animations ("options") — e.g. two or three
 * different Walk cycles cut from a richer game sprite sheet — that get picked between at random,
 * equally likely, instead of a single fixed sequence. This is generated `CustomActionSpec` data
 * (one `CustomAnimationVariantSpec` per option, see `CharacterEditorModal.renderAnimationsEditor`'s
 * "Make equally likely" button) flowing through the existing `CustomContentBuilder`/
 * `mergeCustomContent` pipeline unchanged, so it needs no changes to `ActionRunner` or the
 * expression engine: `ActionRunner.chooseAnimationVariant` already re-evaluates an action's
 * Animation conditions fresh every single time the action starts (never cached), and
 * `Math.random()` is already a real, supported call inside a condition (`RuntimeContext.ts`'s
 * `call()`) — both verified directly against source before writing this, not assumed.
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
