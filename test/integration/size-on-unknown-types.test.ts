import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { getRxStorageBunSQLite } from '$app/storage';
import type { RxDocumentData, RxStorage, RxStorageInstance } from 'rxdb';
import type { BunSQLiteStorageSettings, BunSQLiteInternals } from '$app/types';

interface TestDocType {
	id: string;
	tags: string[];
	name: string;
	age: number;
	metadata: Record<string, unknown>;
	_deleted: boolean;
	_attachments: Record<string, unknown>;
	_rev: string;
	_meta: { lwt: number };
}

describe('$size on Unknown Types Bug - TDD', () => {
	let storage: RxStorage<BunSQLiteInternals, BunSQLiteStorageSettings>;
	let instance: RxStorageInstance<TestDocType, BunSQLiteInternals, BunSQLiteStorageSettings>;

	const mockDocs: RxDocumentData<TestDocType>[] = [
		{
			id: '1',
			name: 'Alice',
			age: 30,
			tags: ['admin', 'user'],
			metadata: { key: 'value' },
			_deleted: false,
			_attachments: {},
			_rev: '1-a',
			_meta: { lwt: 1000 }
		},
		{
			id: '2',
			name: 'Bob',
			age: 25,
			tags: ['user', 'moderator', 'guest'],
			metadata: { foo: 'bar', baz: 'qux' },
			_deleted: false,
			_attachments: {},
			_rev: '1-b',
			_meta: { lwt: 2000 }
		},
		{
			id: '3',
			name: 'Charlie',
			age: 35,
			tags: [],
			metadata: {},
			_deleted: false,
			_attachments: {},
			_rev: '1-c',
			_meta: { lwt: 3000 }
		},
		{
			id: '4',
			name: 'David',
			age: 28,
			tags: ['premium'],
			metadata: { single: 'value' },
			_deleted: false,
			_attachments: {},
			_rev: '1-d',
			_meta: { lwt: 4000 }
		}
	];

	beforeEach(async () => {
		storage = getRxStorageBunSQLite();
		instance = await storage.createStorageInstance<TestDocType>({
			databaseInstanceToken: 'test-token-size-unknown',
			databaseName: 'testdb-size-unknown',
			collectionName: 'docs-size-unknown',
			schema: {
				version: 0,
				primaryKey: 'id',
				type: 'object',
				properties: {
					id: { type: 'string', maxLength: 100 },
					name: { type: 'string' },
					age: { type: 'number' },
					tags: { type: 'array', items: { type: 'string' } },
					metadata: { type: 'object' },
					_deleted: { type: 'boolean' },
					_attachments: { type: 'object' },
					_rev: { type: 'string' },
					_meta: {
						type: 'object',
						properties: {
							lwt: { type: 'number' }
						}
					}
				},
				required: ['id', '_deleted', '_attachments', '_rev', '_meta']
			},
			options: {},
			multiInstance: false,
			devMode: false
		});

		await instance.bulkWrite(
			mockDocs.map(doc => ({ document: doc })),
			'size-unknown-test'
		);
	});

	afterEach(async () => {
		await instance.remove();
	});

	it('should match arrays with size 2 (known array type)', async () => {
		const result = await instance.query({
			query: {
				selector: { tags: { $size: 2 } },
				sort: [{ id: 'asc' }],
				skip: 0
			},
			queryPlan: {
				index: ['id'],
				sortSatisfiedByIndex: false,
				selectorSatisfiedByIndex: false,
				startKeys: [],
				endKeys: [],
				inclusiveStart: true,
				inclusiveEnd: true
			}
		});

		expect(result.documents.map(d => d.id)).toEqual(['1']);
	});

	it('should match arrays with size 3', async () => {
		const result = await instance.query({
			query: {
				selector: { tags: { $size: 3 } },
				sort: [{ id: 'asc' }],
				skip: 0
			},
			queryPlan: {
				index: ['id'],
				sortSatisfiedByIndex: false,
				selectorSatisfiedByIndex: false,
				startKeys: [],
				endKeys: [],
				inclusiveStart: true,
				inclusiveEnd: true
			}
		});

		expect(result.documents.map(d => d.id)).toEqual(['2']);
	});

	it('should match empty arrays with size 0', async () => {
		const result = await instance.query({
			query: {
				selector: { tags: { $size: 0 } },
				sort: [{ id: 'asc' }],
				skip: 0
			},
			queryPlan: {
				index: ['id'],
				sortSatisfiedByIndex: false,
				selectorSatisfiedByIndex: false,
				startKeys: [],
				endKeys: [],
				inclusiveStart: true,
				inclusiveEnd: true
			}
		});

		expect(result.documents.map(d => d.id)).toEqual(['3']);
	});

	it('should NOT match string fields with $size (schema protection)', async () => {
		const result = await instance.query({
			query: {
				selector: { name: { $size: 5 } },
				sort: [{ id: 'asc' }],
				skip: 0
			},
			queryPlan: {
				index: ['id'],
				sortSatisfiedByIndex: false,
				selectorSatisfiedByIndex: false,
				startKeys: [],
				endKeys: [],
				inclusiveStart: true,
				inclusiveEnd: true
			}
		});

		expect(result.documents.map(d => d.id)).toEqual([]);
	});

	it('should NOT match number fields with $size (schema protection)', async () => {
		const result = await instance.query({
			query: {
				selector: { age: { $size: 2 } },
				sort: [{ id: 'asc' }],
				skip: 0
			},
			queryPlan: {
				index: ['id'],
				sortSatisfiedByIndex: false,
				selectorSatisfiedByIndex: false,
				startKeys: [],
				endKeys: [],
				inclusiveStart: true,
				inclusiveEnd: true
			}
		});

		expect(result.documents.map(d => d.id)).toEqual([]);
	});

	it('should NOT match object fields with $size (schema protection)', async () => {
		const result = await instance.query({
			query: {
				selector: { metadata: { $size: 1 } },
				sort: [{ id: 'asc' }],
				skip: 0
			},
			queryPlan: {
				index: ['id'],
				sortSatisfiedByIndex: false,
				selectorSatisfiedByIndex: false,
				startKeys: [],
				endKeys: [],
				inclusiveStart: true,
				inclusiveEnd: true
			}
		});

		expect(result.documents.map(d => d.id)).toEqual([]);
	});

	it('should work with $size in combination with other operators', async () => {
		const result = await instance.query({
			query: {
				selector: {
					$and: [
						{ tags: { $size: 2 } },
						{ age: { $gte: 30 } }
					]
				},
				sort: [{ id: 'asc' }],
				skip: 0
			},
			queryPlan: {
				index: ['id'],
				sortSatisfiedByIndex: false,
				selectorSatisfiedByIndex: false,
				startKeys: [],
				endKeys: [],
				inclusiveStart: true,
				inclusiveEnd: true
			}
		});

		expect(result.documents.map(d => d.id)).toEqual(['1']);
	});

	it('should work with $size in $or operator', async () => {
		const result = await instance.query({
			query: {
				selector: {
					$or: [
						{ tags: { $size: 0 } },
						{ tags: { $size: 1 } }
					]
				},
				sort: [{ id: 'asc' }],
				skip: 0
			},
			queryPlan: {
				index: ['id'],
				sortSatisfiedByIndex: false,
				selectorSatisfiedByIndex: false,
				startKeys: [],
				endKeys: [],
				inclusiveStart: true,
				inclusiveEnd: true
			}
		});

		expect(result.documents.map(d => d.id)).toEqual(['3', '4']);
	});
});
