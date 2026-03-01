export class SieveCache<K, V> {
	readonly #capacity: number;
	readonly #map: Map<K, number>;

	readonly #keys: K[];
	readonly #values: V[];
	readonly #visited: Uint8Array;

	readonly #newer: Uint32Array;
	readonly #older: Uint32Array;

	#head = 0;
	#tail = 0;
	#hand = 0;

	#freeHead = 0;
	#nextFreeIndex = 1;

	constructor(capacity: number) {
		if (capacity < 1) throw new RangeError('Capacity must be at least 1');

		const arraySize = capacity + 1;
		this.#capacity = capacity;
		this.#map = new Map();

		this.#keys = new Array(arraySize);
		this.#values = new Array(arraySize);
		this.#visited = new Uint8Array(arraySize);

		this.#newer = new Uint32Array(arraySize);
		this.#older = new Uint32Array(arraySize);
	}

	get size(): number {
		return this.#map.size;
	}

	has(key: K): boolean {
		return this.#map.has(key);
	}

	get(key: K): V | undefined {
		const index = this.#map.get(key);
		if (index !== undefined) {
			this.#visited[index] = 1;
			return this.#values[index];
		}
		return undefined;
	}

	set(key: K, value: V): this {
		let index = this.#map.get(key);

		if (index !== undefined) {
			this.#values[index] = value;
			this.#visited[index] = 1;
			return this;
		}

		index = this.#getFreeIndex();

		this.#keys[index] = key;
		this.#values[index] = value;
		this.#visited[index] = 0;
		this.#map.set(key, index);

		if (this.#head === 0) {
			this.#head = this.#tail = index;
		} else {
			this.#newer[this.#head] = index;
			this.#older[index] = this.#head;
			this.#head = index;
		}

		return this;
	}

	delete(key: K): boolean {
		const index = this.#map.get(key);
		if (index !== undefined) {
			this.#map.delete(key);
			this.#removeNode(index);

			(this.#keys as any)[index] = undefined;
			(this.#values as any)[index] = undefined;

			this.#newer[index] = this.#freeHead;
			this.#freeHead = index;
			return true;
		}
		return false;
	}

	clear(): void {
		this.#map.clear();
		this.#head = 0;
		this.#tail = 0;
		this.#hand = 0;
		this.#freeHead = 0;
		this.#nextFreeIndex = 1;
		this.#keys.fill(undefined as any);
		this.#values.fill(undefined as any);
		this.#newer.fill(0);
		this.#older.fill(0);
		this.#visited.fill(0);
	}

	#getFreeIndex(): number {
		if (this.#freeHead !== 0) {
			const index = this.#freeHead;
			this.#freeHead = this.#newer[index];
			this.#newer[index] = 0;
			return index;
		}
		if (this.#nextFreeIndex <= this.#capacity) {
			return this.#nextFreeIndex++;
		}
		return this.#evict();
	}

	#evict(): number {
		let hand = this.#hand === 0 ? this.#tail : this.#hand;

		while (this.#visited[hand] === 1) {
			this.#visited[hand] = 0;
			hand = this.#newer[hand] === 0 ? this.#tail : this.#newer[hand];
		}

		this.#hand = this.#newer[hand];

		const victimIndex = hand;
		this.#map.delete(this.#keys[victimIndex]);
		this.#removeNode(victimIndex);

		return victimIndex;
	}

	#removeNode(index: number): void {
		const newer = this.#newer[index];
		const older = this.#older[index];

		if (newer !== 0) {
			this.#older[newer] = older;
		} else {
			this.#head = older;
		}

		if (older !== 0) {
			this.#newer[older] = newer;
		} else {
			this.#tail = newer;
		}

		if (this.#hand === index) {
			this.#hand = newer;
		}

		this.#newer[index] = 0;
		this.#older[index] = 0;
	}

	forEach(callbackfn: (value: V, key: K, map: SieveCache<K, V>) => void, thisArg?: any): void {
		this.#map.forEach((index, key) => {
			callbackfn.call(thisArg, this.#values[index], key, this);
		});
	}

	*entries(): IterableIterator<[K, V]> {
		for (const [key, index] of this.#map.entries()) {
			yield [key, this.#values[index]];
		}
	}

	*keys(): IterableIterator<K> {
		for (const key of this.#map.keys()) {
			yield key;
		}
	}

	*values(): IterableIterator<V> {
		for (const index of this.#map.values()) {
			yield this.#values[index];
		}
	}

	[Symbol.iterator](): IterableIterator<[K, V]> {
		return this.entries();
	}

	get [Symbol.toStringTag](): string {
		return `SieveCache(${this.#capacity})`;
	}
}
