import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { getRxStorageBunSQLite } from '$app/storage';
import type { RxStorage, RxStorageInstance, RxJsonSchema, RxDocumentData } from 'rxdb';
import type { BunSQLiteStorageSettings, BunSQLiteInternals } from '$app/types';

describe('Nested Array Flattening: items.tags Pattern', () => {
	let storage: RxStorage<BunSQLiteInternals, BunSQLiteStorageSettings>;
	let instance: RxStorageInstance<any, BunSQLiteInternals, BunSQLiteStorageSettings>;

	interface TestDoc {
		id: string;
		name: string;
		items: Array<{ name: string; tags: string[] }>;
		_deleted: boolean;
		_attachments: {};
		_rev: string;
		_meta: { lwt: number };
	}

	const schema: RxJsonSchema<RxDocumentData<TestDoc>> = {
		version: 0,
		primaryKey: 'id',
		type: 'object',
		properties: {
			id: { type: 'string', maxLength: 100 },
			name: { type: 'string' },
			items: {
				type: 'array',
				items: {
					type: 'object',
					properties: {
						name: { type: 'string' },
						tags: { type: 'array', items: { type: 'string' } }
					}
				}
			},
			_deleted: { type: 'boolean' },
			_attachments: { type: 'object' },
			_rev: { type: 'string' },
			_meta: { type: 'object', properties: { lwt: { type: 'number' } }, required: ['lwt'] }
		},
		required: ['id', '_deleted', '_attachments', '_rev', '_meta']
	};

	beforeEach(async () => {
		storage = getRxStorageBunSQLite({ filename: ':memory:' });
		instance = await storage.createStorageInstance({
			databaseInstanceToken: 'test-nested-array',
			databaseName: 'testdb',
			collectionName: 'test',
			schema,
			options: {},
			multiInstance: false,
			devMode: false
		});
	});

	afterEach(async () => {
		await instance.remove();
	});

	it('should flatten items.tags for $eq queries (MongoDB behavior)', async () => {
		const docs: RxDocumentData<TestDoc>[] = [
			{
				id: 'doc1',
				name: 'Single item with 100%',
				items: [{ name: 'item1', tags: ['100%', 'urgent'] }],
				_deleted: false,
				_attachments: {},
				_rev: '1-a',
				_meta: { lwt: 1000 }
			},
			{
				id: 'doc2',
				name: 'Multiple items, 100% in first',
				items: [
					{ name: 'item1', tags: ['100%'] },
					{ name: 'item2', tags: ['apple'] }
				],
				_deleted: false,
				_attachments: {},
				_rev: '1-b',
				_meta: { lwt: 1001 }
			},
			{
				id: 'doc3',
				name: 'No 100%',
				items: [{ name: 'item1', tags: ['apple', 'banana'] }],
				_deleted: false,
				_attachments: {},
				_rev: '1-c',
				_meta: { lwt: 1002 }
			}
		];

		await instance.bulkWrite(docs.map(doc => ({ document: doc })), 'test');

		const result = await instance.query({
			query: {
				selector: { 'items.tags': { $eq: '100%' } },
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

		expect(result.documents.length).toBe(2);
		expect(result.documents.map(d => d.id).sort()).toEqual(['doc1', 'doc2']);
	});

	it('should flatten items.tags for $in queries', async () => {
		const docs: RxDocumentData<TestDoc>[] = [
			{
				id: 'doc1',
				name: 'Has apple',
				items: [{ name: 'item1', tags: ['apple'] }],
				_deleted: false,
				_attachments: {},
				_rev: '1-a',
				_meta: { lwt: 1000 }
			},
			{
				id: 'doc2',
				name: 'Has banana in second item',
				items: [
					{ name: 'item1', tags: ['apple'] },
					{ name: 'item2', tags: ['banana'] }
				],
				_deleted: false,
				_attachments: {},
				_rev: '1-b',
				_meta: { lwt: 1001 }
			},
			{
				id: 'doc3',
				name: 'Has neither',
				items: [{ name: 'item1', tags: ['orange'] }],
				_deleted: false,
				_attachments: {},
				_rev: '1-c',
				_meta: { lwt: 1002 }
			}
		];

		await instance.bulkWrite(docs.map(doc => ({ document: doc })), 'test');

		const result = await instance.query({
			query: {
				selector: { 'items.tags': { $in: ['apple', 'banana'] } },
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

		expect(result.documents.length).toBe(2);
		expect(result.documents.map(d => d.id).sort()).toEqual(['doc1', 'doc2']);
	});

	it('should handle empty strings in nested arrays', async () => {
		const docs: RxDocumentData<TestDoc>[] = [
			{
				id: 'doc1',
				name: 'Has empty string',
				items: [{ name: 'item1', tags: ['100%', ''] }],
				_deleted: false,
				_attachments: {},
				_rev: '1-a',
				_meta: { lwt: 1000 }
			},
			{
				id: 'doc2',
				name: 'No empty string',
				items: [{ name: 'item1', tags: ['100%', 'urgent'] }],
				_deleted: false,
				_attachments: {},
				_rev: '1-b',
				_meta: { lwt: 1001 }
			}
		];

		await instance.bulkWrite(docs.map(doc => ({ document: doc })), 'test');

		const result = await instance.query({
			query: {
				selector: { 'items.tags': { $eq: '' } },
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

		expect(result.documents.length).toBe(1);
		expect(result.documents[0].id).toBe('doc1');
	});

	it('should return no matches when value does not exist in any nested array', async () => {
		const docs: RxDocumentData<TestDoc>[] = [
			{
				id: 'doc1',
				name: 'Has apple',
				items: [{ name: 'item1', tags: ['apple', 'banana'] }],
				_deleted: false,
				_attachments: {},
				_rev: '1-a',
				_meta: { lwt: 1000 }
			},
			{
				id: 'doc2',
				name: 'Has orange',
				items: [
					{ name: 'item1', tags: ['orange'] },
					{ name: 'item2', tags: ['grape'] }
				],
				_deleted: false,
				_attachments: {},
				_rev: '1-b',
				_meta: { lwt: 1001 }
			}
		];

		await instance.bulkWrite(docs.map(doc => ({ document: doc })), 'test');

		const result = await instance.query({
			query: {
				selector: { 'items.tags': { $eq: 'nonexistent' } },
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

		expect(result.documents.length).toBe(0);
	});

	it('should return no matches when items array is empty', async () => {
		const docs: RxDocumentData<TestDoc>[] = [
			{
				id: 'doc1',
				name: 'Empty items',
				items: [],
				_deleted: false,
				_attachments: {},
				_rev: '1-a',
				_meta: { lwt: 1000 }
			}
		];

		await instance.bulkWrite(docs.map(doc => ({ document: doc })), 'test');

		const result = await instance.query({
			query: {
				selector: { 'items.tags': { $eq: 'anything' } },
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

		expect(result.documents.length).toBe(0);
	});

	it('should return no matches when all tags arrays are empty', async () => {
		const docs: RxDocumentData<TestDoc>[] = [
			{
				id: 'doc1',
				name: 'Empty tags',
				items: [
					{ name: 'item1', tags: [] },
					{ name: 'item2', tags: [] }
				],
				_deleted: false,
				_attachments: {},
				_rev: '1-a',
				_meta: { lwt: 1000 }
			}
		];

		await instance.bulkWrite(docs.map(doc => ({ document: doc })), 'test');

		const result = await instance.query({
			query: {
				selector: { 'items.tags': { $eq: 'anything' } },
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

		expect(result.documents.length).toBe(0);
	});

	it('should handle $in with partial matches correctly', async () => {
		const docs: RxDocumentData<TestDoc>[] = [
			{
				id: 'doc1',
				name: 'Has apple only',
				items: [{ name: 'item1', tags: ['apple'] }],
				_deleted: false,
				_attachments: {},
				_rev: '1-a',
				_meta: { lwt: 1000 }
			},
			{
				id: 'doc2',
				name: 'Has neither',
				items: [{ name: 'item1', tags: ['orange'] }],
				_deleted: false,
				_attachments: {},
				_rev: '1-b',
				_meta: { lwt: 1001 }
			}
		];

		await instance.bulkWrite(docs.map(doc => ({ document: doc })), 'test');

		const result = await instance.query({
			query: {
				selector: { 'items.tags': { $in: ['apple', 'banana', 'grape'] } },
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

		expect(result.documents.length).toBe(1);
		expect(result.documents[0].id).toBe('doc1');
	});
});
