import type { ShimejiSettings } from "./settings";

/**
 * On-disk shape once a setting can differ between mobile and desktop: `desktop` is the base
 * every setting starts from, and `mobileOverrides` holds only the keys mobile has explicitly
 * changed away from that base — a key absent here just keeps inheriting whatever desktop has,
 * so nothing needs configuring twice, and a later desktop change still flows through to every
 * setting nobody has deliberately diverged on mobile.
 */
export interface StoredShimejiSettings {
	desktop: ShimejiSettings;
	mobileOverrides: Partial<ShimejiSettings>;
}

/** Every setting value here is plain JSON (strings/numbers/booleans/arrays/records) — the same
 * assumption `saveData`/`loadData` themselves already make about this whole object — so a
 * JSON round-trip is a correct, adequate deep clone/compare, not a shortcut. */
function deepClone<T>(value: T): T {
	return JSON.parse(JSON.stringify(value));
}

function deepEqual(a: unknown, b: unknown): boolean {
	return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * The flat settings object every mascot/room/UI reads (`plugin.settings`) — mobile's own
 * explicit overrides layered on the desktop base. On desktop this *is* `stored.desktop`, by
 * reference: nothing to merge, and mutating it in place (as every setting's own onChange
 * handler already does) is exactly right, since desktop has no separate override layer to keep
 * in sync with.
 *
 * On mobile, both sources are deep-cloned before merging — never the originals — so a setting
 * whose value is an object/array (e.g. `disabledBehaviors`) can be freely mutated in place by
 * existing onChange handlers without silently reaching back into `stored.desktop` (which would
 * corrupt the desktop base itself) or `stored.mobileOverrides` (which would make a value read
 * as "already overridden" before the user ever changed anything on this device).
 */
export function resolveEffectiveSettings(stored: StoredShimejiSettings, isMobile: boolean): ShimejiSettings {
	if (!isMobile) return stored.desktop;
	return { ...deepClone(stored.desktop), ...deepClone(stored.mobileOverrides) };
}

/**
 * The write side of the split: given the effective settings a setting's own onChange handler
 * just mutated, and the platform that happened under, figures out which top-level keys
 * genuinely diverge from the desktop base and keeps `mobileOverrides` holding exactly those —
 * no more, no less. A key changed back to matching desktop again quietly stops being an
 * override (falls back to inheriting), rather than staying pinned to a now-redundant explicit
 * value forever.
 *
 * Desktop writes pass straight through: `effective` already *is* the new desktop base there
 * (see resolveEffectiveSettings), nothing to diff against itself.
 *
 * Compares by value, not by reference — `resolveEffectiveSettings` deep-clones on the way out
 * specifically so in-place edits to an object/array-valued setting don't alias the stored
 * originals, which means a reference comparison here would find *every* such field "changed"
 * on every single save, real edit or not.
 */
export function reconcileStoredSettings(stored: StoredShimejiSettings, effective: ShimejiSettings, isMobile: boolean): StoredShimejiSettings {
	if (!isMobile) return { desktop: effective, mobileOverrides: stored.mobileOverrides };
	const mobileOverrides: Partial<Record<keyof ShimejiSettings, unknown>> = {};
	for (const key of Object.keys(effective) as Array<keyof ShimejiSettings>) {
		if (!deepEqual(effective[key], stored.desktop[key])) mobileOverrides[key] = effective[key];
	}
	return { desktop: stored.desktop, mobileOverrides: mobileOverrides as Partial<ShimejiSettings> };
}
