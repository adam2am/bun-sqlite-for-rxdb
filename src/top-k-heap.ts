import type { RxDocumentData, MangoQuerySortPart } from 'rxdb';

export class TopKHeap<RxDocType> {
	private heap: RxDocumentData<RxDocType>[] = [];
	private maxSize: number;
	private compareFn: (a: RxDocumentData<RxDocType>, b: RxDocumentData<RxDocType>) => number;

	constructor(
		maxSize: number,
		sort: MangoQuerySortPart<RxDocType>[],
		getBsonType: (val: any) => number,
		getNestedValue: (obj: RxDocumentData<RxDocType>, path: string) => unknown
	) {
		this.maxSize = maxSize;
		
		this.compareFn = (a, b) => {
			for (const sortField of sort) {
				const [key, direction] = Object.entries(sortField)[0];
				const aVal = getNestedValue(a, key);
				const bVal = getNestedValue(b, key);

				const aType = getBsonType(aVal);
				const bType = getBsonType(bVal);

				if (aType !== bType) {
					return direction === 'asc' ? aType - bType : bType - aType;
				}

				if (aType === 0) continue;
				if (aType === 1 && typeof aVal === 'number' && typeof bVal === 'number') {
					if (aVal < bVal) return direction === 'asc' ? -1 : 1;
					if (aVal > bVal) return direction === 'asc' ? 1 : -1;
				}
				if (aType === 2 && typeof aVal === 'string' && typeof bVal === 'string') {
					if (aVal < bVal) return direction === 'asc' ? -1 : 1;
					if (aVal > bVal) return direction === 'asc' ? 1 : -1;
				}
				if (aType === 6 && aVal instanceof Date && bVal instanceof Date) {
					const aTime = aVal.getTime();
					const bTime = bVal.getTime();
					if (aTime < bTime) return direction === 'asc' ? -1 : 1;
					if (aTime > bTime) return direction === 'asc' ? 1 : -1;
				}
			}
			return 0;
		};
	}

	insert(doc: RxDocumentData<RxDocType>): void {
		if (this.heap.length < this.maxSize) {
			this.heap.push(doc);
			this.bubbleUp(this.heap.length - 1);
		} else if (this.compareFn(doc, this.heap[0]) > 0) {
			this.heap[0] = doc;
			this.bubbleDown(0);
		}
	}

	private bubbleUp(index: number): void {
		while (index > 0) {
			const parentIndex = Math.floor((index - 1) / 2);
			if (this.compareFn(this.heap[index], this.heap[parentIndex]) >= 0) break;
			[this.heap[index], this.heap[parentIndex]] = [this.heap[parentIndex], this.heap[index]];
			index = parentIndex;
		}
	}

	private bubbleDown(index: number): void {
		while (true) {
			const leftChild = 2 * index + 1;
			const rightChild = 2 * index + 2;
			let smallest = index;

			if (leftChild < this.heap.length && this.compareFn(this.heap[leftChild], this.heap[smallest]) < 0) {
				smallest = leftChild;
			}
			if (rightChild < this.heap.length && this.compareFn(this.heap[rightChild], this.heap[smallest]) < 0) {
				smallest = rightChild;
			}
			if (smallest === index) break;

			[this.heap[index], this.heap[smallest]] = [this.heap[smallest], this.heap[index]];
			index = smallest;
		}
	}

	getSorted(): RxDocumentData<RxDocType>[] {
		return this.heap.sort(this.compareFn);
	}

	size(): number {
		return this.heap.length;
	}
}
