import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { getRxStorageBunSQLite } from '$app/index';
import type { RxJsonSchema, RxDocumentData, RxStorageInstance } from 'rxdb';
import type { BunSQLiteInternals, BunSQLiteStorageSettings } from '$app/types';

interface TestDocType {
	id: string;
	age: number;
}

const mockSchema: RxJsonSchema<RxDocumentData<TestDocType>> = {
	version: 0,
	primaryKey: 'id',
	type: 'object',
	properties: {
		id: { type: 'string', maxLength: 100 },
		age: { type: 'number' },
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

describe('$not with nested $and - Beyond MongoDB/Mingo spec', () => {
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
			{ document: { id: '1', age: 15, _deleted: false, _attachments: {}, _rev: '1', _meta: { lwt: Date.now() } } },
			{ document: { id: '2', age: 25, _deleted: false, _attachments: {}, _rev: '1', _meta: { lwt: Date.now() } } },
			{ document: { id: '3', age: 35, _deleted: false, _attachments: {}, _rev: '1', _meta: { lwt: Date.now() } } },
			{ document: { id: '4', age: 45, _deleted: false, _attachments: {}, _rev: '1', _meta: { lwt: Date.now() } } }
		], 'test');
	});

	afterAll(async () => {
		await instance.remove();
		await instance.close();
	});

	it('handles bare operators in $and inside $not (MongoDB/Mingo reject, we support)', async () => {
		// MongoDB/Mingo consider this invalid: bare operators without field wrapper
		// But RxDB passes it as-is, so we MUST handle it
		const query = {
			age: {
				$not: {
					$and: [
						{ $gt: 20 },
						{ $lt: 40 }
					]
				}
			}
		};

		const result = await instance.query({
			query: {
				selector: query,
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

		// Should match ages NOT between 20 and 40: 15, 45
		const ids = result.documents.map((doc: RxDocumentData<TestDocType>) => doc.id).sort();
		expect(ids).toEqual(['1', '4']);
	});

	it('handles field-wrapped operators in $and inside $not (standard format)', async () => {
		// This is the "correct" MongoDB/Mingo format
		const query = {
			$not: {
				$and: [
					{ age: { $gt: 20 } },
					{ age: { $lt: 40 } }
				]
			}
		};

		const result = await instance.query({
			query: {
				selector: query,
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

		// Should match ages NOT between 20 and 40: 15, 45
		const ids = result.documents.map((doc: RxDocumentData<TestDocType>) => doc.id).sort();
		expect(ids).toEqual(['1', '4']);
	});
});
