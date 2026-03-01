import type { SqlFragment } from './operators';

export class NoOpCache<K, V> {
	get size(): number {
		return 0;
	}

	has(_key: K): boolean {
		return false;
	}

	get(_key: K): V | undefined {
		return undefined;
	}

	set(_key: K, _value: V): this {
		return this;
	}

	clear(): void {}
}

export const NO_CACHE = new NoOpCache<string, SqlFragment | null>();
