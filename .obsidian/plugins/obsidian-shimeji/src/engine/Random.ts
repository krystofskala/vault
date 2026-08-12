/** Small seedable PRNG (mulberry32) so behavior-selection tests are deterministic. */
export class Random {
	private state: number;

	constructor(seed: number = Date.now() >>> 0) {
		this.state = seed >>> 0;
	}

	/** Returns a float in [0, 1). */
	next(): number {
		this.state |= 0;
		this.state = (this.state + 0x6d2b79f5) | 0;
		let t = this.state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	}

	/** Returns a float in [min, max). */
	range(min: number, max: number): number {
		return min + this.next() * (max - min);
	}

	/** Returns true with the given probability (0..1). */
	chance(p: number): boolean {
		return this.next() < p;
	}

	pick<T>(items: T[]): T {
		return items[Math.floor(this.next() * items.length) % items.length];
	}

	/** Weighted pick: entries with weight <= 0 are never chosen unless ALL weights are <= 0. */
	weightedPick<T>(entries: Array<{ item: T; weight: number }>): T | undefined {
		const positive = entries.filter((e) => e.weight > 0);
		const pool = positive.length > 0 ? positive : entries;
		const total = pool.reduce((sum, e) => sum + Math.max(0, e.weight), 0);
		if (total <= 0) return pool.length > 0 ? pool[0].item : undefined;
		let roll = this.next() * total;
		for (const entry of pool) {
			roll -= Math.max(0, entry.weight);
			if (roll <= 0) return entry.item;
		}
		return pool[pool.length - 1].item;
	}
}
