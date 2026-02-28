import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { getRxStorageBunSQLite } from '$app/index';
import type { RxJsonSchema, RxDocumentData, RxStorageInstance } from 'rxdb';
import type { BunSQLiteInternals, BunSQLiteStorageSettings } from '$app/types';

interface TestDocType {
	id: string;
	items: Array<{ price: number }>;
}

const mockSchema: RxJsonSchema<RxDocumentData<TestDocType>> = {
	version: 0,
	primaryKey: 'id',
	type: 'object',
	properties: {
		id: { type: 'string', maxLength: 100 },
		items: {
			type: 'array',
			items: {
				type: 'object',
				properties: {
					price: { type: 'number' }
				}
			}
		},
		_deleted: { type: 'boolean' },
		_attachments: { type: 'object' },
		_rev: { type: 'string' },
		_meta: {
			type: 'object',
			properties: {
				lwt: { type: 'number' }
			},
			required: ['lwt']
		}
	},
	required: ['id', '_deleted', '_attachments', '_rev', '_meta']
};

describe('$elemMatch with $not', () => {
	let instance: RxStorageInstance<TestDocType, BunSQLiteInternals, BunSQLiteStorageSettings>;

	beforeAll(async () => {
		const storage = getRxStorageBunSQLite();
		instance = await storage.createStorageInstance<TestDocType>({
			databaseInstanceToken: 'test-token',
			databaseName: 'testdb',
			collectionName: 'testcol',
			schema: mockSchema,
			options: {},
			multiInstance: false,
			devMode: false
		});

		await instance.bulkWrite([
			{ document: { id: '1', items: [{ price: 100 }, { price: 200 }], _deleted: false, _attachments: {}, _meta: { lwt: Date.now() }, _rev: '1' } },
			{ document: { id: '2', items: [{ price: 50 }, { price: 75 }], _deleted: false, _attachments: {}, _meta: { lwt: Date.now() }, _rev: '1' } },
			{ document: { id: '3', items: [{ price: 150 }], _deleted: false, _attachments: {}, _meta: { lwt: Date.now() }, _rev: '1' } },
			{ document: { id: '4', items: [{ price: 300 }], _deleted: false, _attachments: {}, _meta: { lwt: Date.now() }, _rev: '1' } },
			{ document: { id: '5', items: [{ price: 120 }, { price: 140 }], _deleted: false, _attachments: {}, _meta: { lwt: Date.now() }, _rev: '1' } }
		], 'test');
	});

	afterAll(async () => {
		await instance.remove();
		await instance.close();
	});

	it('handles $not inside $elemMatch', async () => {
		const result = await instance.query({
			query: {
				selector: { items: { $elemMatch: { price: { $not: { $gt: 150 } } } } },
				sort: [{ id: 'asc' }],
				skip: 0
			},
			queryPlan: {
				index: [],
				startKeys: [],
				endKeys: [],
				inclusiveStart: true,
				inclusiveEnd: true,
				sortSatisfiedByIndex: false,
				selectorSatisfiedByIndex: false
			}
		});

		const ids = result.documents.map(doc => doc.id).sort();
		expect(ids).toEqual(['1', '2', '3', '5']);
	});

	it('handles $not with $lt inside $elemMatch', async () => {
		const result = await instance.query({
			query: {
				selector: { items: { $elemMatch: { price: { $not: { $lt: 100 } } } } },
				sort: [{ id: 'asc' }],
				skip: 0
			},
			queryPlan: {
				index: [],
				startKeys: [],
				endKeys: [],
				inclusiveStart: true,
				inclusiveEnd: true,
				sortSatisfiedByIndex: false,
				selectorSatisfiedByIndex: false
			}
		});

		const ids = result.documents.map((doc: RxDocumentData<TestDocType>) => doc.id).sort();
		expect(ids).toEqual(['1', '3', '4', '5']);
	});
});
