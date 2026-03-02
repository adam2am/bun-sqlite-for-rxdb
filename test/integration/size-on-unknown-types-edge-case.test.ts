import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { getRxStorageBunSQLite } from '$app/storage';
import type { RxDocumentData, RxStorage, RxStorageInstance } from 'rxdb';
import type { BunSQLiteStorageSettings, BunSQLiteInternals } from '$app/types';

interface TestDocType {
	id: string;
	tags: string[];
	unknownField: unknown;
	_deleted: boolean;
	_attachments: Record<string, unknown>;
	_rev: string;
	_meta: { lwt: number };
}

describe('$size on Unknown Types - ACTUAL EDGE CASE', () => {
	let storage: RxStorage<BunSQLiteInternals, BunSQLiteStorageSettings>;
	let instance: RxStorageInstance<TestDocType, BunSQLiteInternals, BunSQLiteStorageSettings>;

	const mockDocs: RxDocumentData<TestDocType>[] = [
		{
			id: '1',
			tags: ['admin', 'user'],
			unknownField: ['item1', 'item2'],
			_deleted: false,
			_attachments: {},
			_rev: '1-a',
			_meta: { lwt: 1000 }
		},
		{
			id: '2',
			tags: ['user'],
			unknownField: 'string value',
			_deleted: false,
			_attachments: {},
			_rev: '1-b',
			_meta: { lwt: 2000 }
		},
		{
			id: '3',
			tags: [],
			unknownField: 42,
			_deleted: false,
			_attachments: {},
			_rev: '1-c',
			_meta: { lwt: 3000 }
		},
		{
			id: '4',
			tags: ['premium'],
			unknownField: { nested: 'object' },
			_deleted: false,
			_attachments: {},
			_rev: '1-d',
			_meta: { lwt: 4000 }
		}
	];

	beforeEach(async () => {
		storage = getRxStorageBunSQLite();
		instance = await storage.createStorageInstance<TestDocType>({
			databaseInstanceToken: 'test-token-size-unknown-edge',
			databaseName: 'testdb-size-unknown-edge',
			collectionName: 'docs-size-unknown-edge',
			schema: {
				version: 0,
				primaryKey: 'id',
				type: 'object',
				properties: {
					id: { type: 'string', maxLength: 100 },
					tags: { type: 'array', items: { type: 'string' } },
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
			'size-unknown-edge-test'
		);
	});

	afterEach(async () => {
		await instance.remove();
	});

	it('should NOT match when $size is used on unknown field with array value', async () => {
		const result = await instance.query({
			query: {
				selector: { unknownField: { $size: 2 } },
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

	it('should NOT match when $size is used on unknown field with string value', async () => {
		const result = await instance.query({
			query: {
				selector: { unknownField: { $size: 5 } },
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

	it('should NOT match when $size is used on unknown field with number value', async () => {
		const result = await instance.query({
			query: {
				selector: { unknownField: { $size: 1 } },
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

	it('should NOT match when $size is used on unknown field with object value', async () => {
		const result = await instance.query({
			query: {
				selector: { unknownField: { $size: 1 } },
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
});
