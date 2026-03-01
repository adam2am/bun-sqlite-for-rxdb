import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { getRxStorageBunSQLite } from '$app/storage';
import type { RxDocumentData, RxStorage, RxStorageInstance } from 'rxdb';
import type { BunSQLiteStorageSettings, BunSQLiteInternals } from '$app/types';

interface TestDocType {
	id: string;
	tags: string[];
	users: Array<{ name: string; roles: string[] }>;
	matrix: number[][];
	_deleted: boolean;
	_attachments: Record<string, unknown>;
	_rev: string;
	_meta: { lwt: number };
}

describe('Array Index Notation Bug - TDD', () => {
	let storage: RxStorage<BunSQLiteInternals, BunSQLiteStorageSettings>;
	let instance: RxStorageInstance<TestDocType, BunSQLiteInternals, BunSQLiteStorageSettings>;

	const mockDocs: RxDocumentData<TestDocType>[] = [
		{
			id: '1',
			tags: ['urgent', 'admin', 'review'],
			users: [
				{ name: 'Alice', roles: ['admin', 'user'] },
				{ name: 'Bob', roles: ['user'] }
			],
			matrix: [[1, 2], [3, 4]],
			_deleted: false,
			_attachments: {},
			_rev: '1-a',
			_meta: { lwt: 1000 }
		},
		{
			id: '2',
			tags: ['normal', 'user', 'pending'],
			users: [
				{ name: 'Charlie', roles: ['moderator'] },
				{ name: 'David', roles: ['admin', 'moderator'] }
			],
			matrix: [[5, 6], [7, 8]],
			_deleted: false,
			_attachments: {},
			_rev: '1-b',
			_meta: { lwt: 2000 }
		},
		{
			id: '3',
			tags: ['low', 'archived'],
			users: [{ name: 'Eve', roles: ['user', 'guest'] }],
			matrix: [[9, 10]],
			_deleted: false,
			_attachments: {},
			_rev: '1-c',
			_meta: { lwt: 3000 }
		}
	];

	beforeEach(async () => {
		storage = getRxStorageBunSQLite();
		instance = await storage.createStorageInstance<TestDocType>({
			databaseInstanceToken: 'test-token-array-index',
			databaseName: 'testdb-array-index',
			collectionName: 'docs-array-index',
			schema: {
				version: 0,
				primaryKey: 'id',
				type: 'object',
				properties: {
					id: { type: 'string', maxLength: 100 },
					tags: { type: 'array', items: { type: 'string' } },
					users: {
						type: 'array',
						items: {
							type: 'object',
							properties: {
								name: { type: 'string' },
								roles: { type: 'array', items: { type: 'string' } }
							}
						}
					},
					matrix: {
						type: 'array',
						items: {
							type: 'array',
							items: { type: 'number' }
						}
					},
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
			'array-index-test'
		);
	});

	afterEach(async () => {
		await instance.remove();
	});

	it('should match first element of array using numeric index (tags.0)', async () => {
		const result = await instance.query({
			query: {
				selector: { 'tags.0': 'urgent' },
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

	it('should match second element of array using numeric index (tags.1)', async () => {
		const result = await instance.query({
			query: {
				selector: { 'tags.1': 'admin' },
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

	it('should match nested array element (users.0.name)', async () => {
		const result = await instance.query({
			query: {
				selector: { 'users.0.name': 'Alice' },
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

	it('should match deeply nested array element (users.1.roles.0)', async () => {
		const result = await instance.query({
			query: {
				selector: { 'users.1.roles.0': 'user' },
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

	it('should match 2D array element (matrix.0.1)', async () => {
		const result = await instance.query({
			query: {
				selector: { 'matrix.0.1': 2 },
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

	it('should NOT match when index is out of bounds (tags.10)', async () => {
		const result = await instance.query({
			query: {
				selector: { 'tags.10': 'urgent' },
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

	it('should work with operators on array indices (tags.0 with $ne)', async () => {
		const result = await instance.query({
			query: {
				selector: { 'tags.0': { $ne: 'urgent' } },
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

		expect(result.documents.map(d => d.id)).toEqual(['2', '3']);
	});

	it('should work with $in operator on array indices', async () => {
		const result = await instance.query({
			query: {
				selector: { 'tags.0': { $in: ['urgent', 'normal'] } },
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

		expect(result.documents.map(d => d.id)).toEqual(['1', '2']);
	});
});
