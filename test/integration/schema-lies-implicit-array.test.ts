import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { getRxStorageBunSQLite } from '../../src/storage';
import { Query } from 'mingo';
import type { RxDocumentData, RxStorage, RxStorageInstance } from 'rxdb';
import type { BunSQLiteStorageSettings, BunSQLiteInternals } from '../../src/types';

interface TestDocType {
	id: string;
	dynamicData: any;
}

describe('CRITICAL BUG: Schema Lies & Implicit Array Traversal', () => {
	let storage: RxStorage<BunSQLiteInternals, BunSQLiteStorageSettings>;
	let instance: RxStorageInstance<TestDocType, BunSQLiteInternals, BunSQLiteStorageSettings>;

	beforeEach(async () => {
		storage = getRxStorageBunSQLite();
		instance = await storage.createStorageInstance<TestDocType>({
			databaseInstanceToken: 'test-schema-lies',
			databaseName: 'testdb-schema-lies',
			collectionName: 'docs',
			schema: {
				version: 0,
				primaryKey: 'id',
				type: 'object',
				properties: {
					id: { type: 'string', maxLength: 100 },
					dynamicData: { type: 'object' },
					_deleted: { type: 'boolean' },
					_attachments: { type: 'object' },
					_rev: { type: 'string' },
					_meta: { type: 'object', properties: { lwt: { type: 'number' } } }
				},
				required: ['id', '_deleted', '_attachments', '_rev', '_meta']
			},
			options: {},
			multiInstance: false,
			devMode: false
		});
	});

	afterEach(async () => {
		await instance.remove();
		await instance.close();
	});

	it('PROOF: SQL translation causes SILENT DATA LOSS when runtime data is an array', async () => {
		const doc: RxDocumentData<TestDocType> = {
			id: '1',
			dynamicData: [
				{ category: 'A', price: 100 },
				{ category: 'B', price: 200 }
			],
			_deleted: false,
			_attachments: {},
			_rev: '1-a',
			_meta: { lwt: 1000 }
		};

		await instance.bulkWrite([{ document: doc }], 'test-context');

		const query = { 'dynamicData.price': 100 };

		const mingoQuery = new Query(query);
		const mingoResults = [doc].filter(d => mingoQuery.test(d as any));
		expect(mingoResults.length).toBe(1);

		const sqlResults = await instance.query({
			query: {
				selector: query,
				sort: [{ id: 'asc' }],
				skip: 0
			},
			queryPlan: { index: ['id'], sortSatisfiedByIndex: false, selectorSatisfiedByIndex: false, startKeys: [], endKeys: [], inclusiveStart: true, inclusiveEnd: true }
		});

		expect(sqlResults.documents.length).toBe(1); 
	});
});
