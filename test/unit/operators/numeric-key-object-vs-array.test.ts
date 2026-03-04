import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { getRxStorageBunSQLite } from '$app/storage';
import type { RxStorage, RxStorageInstance, RxJsonSchema, RxDocumentData } from 'rxdb';
import type { BunSQLiteStorageSettings, BunSQLiteInternals } from '$app/types';

describe('Numeric Key: Object vs Array Index (ID20 Fix)', () => {
	let storage: RxStorage<BunSQLiteInternals, BunSQLiteStorageSettings>;
	let instance: RxStorageInstance<any, BunSQLiteInternals, BunSQLiteStorageSettings>;

	interface TestDoc {
		id: string;
		'0': number;
		items: Array<{ value: number }>;
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
			'0': { type: 'number' },
			items: {
				type: 'array',
				items: {
					type: 'object',
					properties: {
						value: { type: 'number' }
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
			databaseInstanceToken: 'test-numeric-key',
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

	it('should treat top-level "0" as object key, not array index', async () => {
		const docs: RxDocumentData<TestDoc>[] = [
			{ id: '1', '0': 5, items: [], _deleted: false, _attachments: {}, _rev: '1-a', _meta: { lwt: 1000 } },
			{ id: '2', '0': 10, items: [], _deleted: false, _attachments: {}, _rev: '1-b', _meta: { lwt: 1001 } },
			{ id: '3', '0': 15, items: [], _deleted: false, _attachments: {}, _rev: '1-c', _meta: { lwt: 1002 } }
		];

		await instance.bulkWrite(docs.map(doc => ({ document: doc })), 'test');

		const result = await instance.query({
			query: {
				selector: { '0': { $lt: 8 } },
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
		expect(result.documents[0].id).toBe('1');
		expect(result.documents[0]['0']).toBe(5);
	});

	it('should treat "items.0" as array index when items is array', async () => {
		const docs: RxDocumentData<TestDoc>[] = [
			{ id: '1', '0': 0, items: [{ value: 100 }], _deleted: false, _attachments: {}, _rev: '1-a', _meta: { lwt: 1000 } },
			{ id: '2', '0': 0, items: [{ value: 200 }], _deleted: false, _attachments: {}, _rev: '1-b', _meta: { lwt: 1001 } },
			{ id: '3', '0': 0, items: [{ value: 50 }], _deleted: false, _attachments: {}, _rev: '1-c', _meta: { lwt: 1002 } }
		];

		await instance.bulkWrite(docs.map(doc => ({ document: doc })), 'test');

		const result = await instance.query({
			query: {
				selector: { 'items.0.value': { $gt: 150 } },
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
		expect(result.documents[0].id).toBe('2');
		expect(result.documents[0].items[0].value).toBe(200);
	});

	it('should handle $eq null on numeric key', async () => {
		const docs: RxDocumentData<TestDoc>[] = [
			{ id: '1', '0': 5, items: [], _deleted: false, _attachments: {}, _rev: '1-a', _meta: { lwt: 1000 } },
			{ id: '2', items: [], _deleted: false, _attachments: {}, _rev: '1-b', _meta: { lwt: 1001 } } as any
		];

		await instance.bulkWrite(docs.map(doc => ({ document: doc })), 'test');

		const result = await instance.query({
			query: {
				selector: { '0': { $eq: null } },
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
		expect(result.documents[0].id).toBe('2');
	});

	it('should return no matches when numeric key does not exist', async () => {
		const docs: RxDocumentData<TestDoc>[] = [
			{ id: '1', items: [], _deleted: false, _attachments: {}, _rev: '1-a', _meta: { lwt: 1000 } } as any,
			{ id: '2', items: [], _deleted: false, _attachments: {}, _rev: '1-b', _meta: { lwt: 1001 } } as any
		];

		await instance.bulkWrite(docs.map(doc => ({ document: doc })), 'test');

		const result = await instance.query({
			query: {
				selector: { '0': { $lt: 100 } },
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

	it('should handle array index out of bounds gracefully', async () => {
		const docs: RxDocumentData<TestDoc>[] = [
			{ id: '1', '0': 0, items: [{ value: 100 }], _deleted: false, _attachments: {}, _rev: '1-a', _meta: { lwt: 1000 } },
			{ id: '2', '0': 0, items: [], _deleted: false, _attachments: {}, _rev: '1-b', _meta: { lwt: 1001 } }
		];

		await instance.bulkWrite(docs.map(doc => ({ document: doc })), 'test');

		const result = await instance.query({
			query: {
				selector: { 'items.5.value': { $gt: 0 } },
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

	it('should not match when numeric key has wrong value', async () => {
		const docs: RxDocumentData<TestDoc>[] = [
			{ id: '1', '0': 100, items: [], _deleted: false, _attachments: {}, _rev: '1-a', _meta: { lwt: 1000 } },
			{ id: '2', '0': 200, items: [], _deleted: false, _attachments: {}, _rev: '1-b', _meta: { lwt: 1001 } }
		];

		await instance.bulkWrite(docs.map(doc => ({ document: doc })), 'test');

		const result = await instance.query({
			query: {
				selector: { '0': { $lt: 50 } },
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

	it('should handle $ne on numeric key correctly', async () => {
		const docs: RxDocumentData<TestDoc>[] = [
			{ id: '1', '0': 5, items: [], _deleted: false, _attachments: {}, _rev: '1-a', _meta: { lwt: 1000 } },
			{ id: '2', '0': 10, items: [], _deleted: false, _attachments: {}, _rev: '1-b', _meta: { lwt: 1001 } },
			{ id: '3', items: [], _deleted: false, _attachments: {}, _rev: '1-c', _meta: { lwt: 1002 } } as any
		];

		await instance.bulkWrite(docs.map(doc => ({ document: doc })), 'test');

		const result = await instance.query({
			query: {
				selector: { '0': { $ne: 5 } },
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
		expect(result.documents.map(d => d.id).sort()).toEqual(['2', '3']);
	});
});
