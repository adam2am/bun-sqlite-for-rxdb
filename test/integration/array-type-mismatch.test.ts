import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { Query } from 'mingo';
import { getRxStorageBunSQLite } from '$app/storage';
import type { RxDocumentData, RxStorage, RxStorageInstance } from 'rxdb';
import type { BunSQLiteStorageSettings, BunSQLiteInternals } from '$app/types';

interface TestDocType {
	id: string;
	scores: (string | number)[];
	tags: string[];
}

const mockSchema = {
	version: 0,
	primaryKey: 'id',
	type: 'object',
	properties: {
		id: { type: 'string', maxLength: 100 },
		scores: { type: 'array', items: { type: 'number' } },
		tags: { type: 'array', items: { type: 'string' } }
	},
	required: ['id']
};

describe('Array Type Mismatch - CRITICAL BUG TEST', () => {
	let storage: RxStorage<BunSQLiteInternals<TestDocType>, BunSQLiteStorageSettings>;
	let instance: RxStorageInstance<TestDocType, BunSQLiteInternals<TestDocType>, BunSQLiteStorageSettings>;

	beforeEach(async () => {
		storage = getRxStorageBunSQLite({ databaseName: ':memory:' });
		instance = await storage.createStorageInstance({
			databaseName: 'test',
			collectionName: 'array_type_test',
			schema: mockSchema as any,
			options: {},
			multiInstance: false,
			devMode: false
		});
	});

	afterEach(async () => {
		await instance.remove();
		await instance.close();
	});

	it('🚨 BUG: Array with STRING elements should NOT match NUMBER comparison ($gt)', async () => {
		// Insert document with STRING array (type mismatch)
		const doc: RxDocumentData<TestDocType> = {
			id: '1',
			scores: ['80', '90'], // STRINGS, not numbers!
			tags: ['test'],
			_deleted: false,
			_attachments: {},
			_rev: '1-a',
			_meta: { lwt: 1000 }
		};

		await instance.bulkWrite([{ document: doc }], 'test-context');

		// Query: Find scores > 50 (NUMBER comparison)
		const query = { scores: { $gt: 50 } };

		// Mingo behavior (CORRECT)
		const mingoQuery = new Query(query);
		const mingoResults = [doc].filter(d => mingoQuery.test(d));
		expect(mingoResults.length).toBe(0); // Type mismatch → no matches

		// Our SQLite behavior (CURRENTLY WRONG!)
		const preparedQuery = {
			query: {
				selector: query,
				sort: [{ id: 'asc' }],
				skip: 0
			},
			queryPlan: { index: ['id'], selectorSatisfiedByIndex: false }
		};

		const result = await instance.query(preparedQuery as any);
		
		// THIS TEST SHOULD FAIL with current implementation
		// Current: result.documents.length = 1 (BUG - SQLite implicit conversion)
		// Expected: result.documents.length = 0 (Mingo behavior)
		expect(result.documents.length).toBe(0); // Should match Mingo
	});

	it('🚨 BUG: Array with STRING elements should NOT match NUMBER comparison ($lt)', async () => {
		const doc: RxDocumentData<TestDocType> = {
			id: '2',
			scores: ['30', '40'], // STRINGS
			tags: ['test'],
			_deleted: false,
			_attachments: {},
			_rev: '1-b',
			_meta: { lwt: 2000 }
		};

		await instance.bulkWrite([{ document: doc }], 'test-context');

		const query = { scores: { $lt: 100 } }; // NUMBER comparison

		// Mingo: Type mismatch → no matches
		const mingoQuery = new Query(query);
		const mingoResults = [doc].filter(d => mingoQuery.test(d));
		expect(mingoResults.length).toBe(0);

		// Our SQLite: Should match Mingo
		const preparedQuery = {
			query: {
				selector: query,
				sort: [{ id: 'asc' }],
				skip: 0
			},
			queryPlan: { index: ['id'], selectorSatisfiedByIndex: false }
		};

		const result = await instance.query(preparedQuery as any);
		expect(result.documents.length).toBe(0); // Should match Mingo
	});

	it('✅ CONTROL: Array with NUMBER elements SHOULD match NUMBER comparison', async () => {
		const doc: RxDocumentData<TestDocType> = {
			id: '3',
			scores: [80, 90], // NUMBERS (correct type)
			tags: ['test'],
			_deleted: false,
			_attachments: {},
			_rev: '1-c',
			_meta: { lwt: 3000 }
		};

		await instance.bulkWrite([{ document: doc }], 'test-context');

		const query = { scores: { $gt: 50 } };

		// Mingo: Type matches → should match
		const mingoQuery = new Query(query);
		const mingoResults = [doc].filter(d => mingoQuery.test(d));
		expect(mingoResults.length).toBe(1);

		// Our SQLite: Should match Mingo
		const preparedQuery = {
			query: {
				selector: query,
				sort: [{ id: 'asc' }],
				skip: 0
			},
			queryPlan: { index: ['id'], selectorSatisfiedByIndex: false }
		};

		const result = await instance.query(preparedQuery as any);
		expect(result.documents.length).toBe(1); // Should match
	});

	it('🚨 BUG: Array with NUMBER elements should NOT match STRING comparison', async () => {
		const doc: RxDocumentData<TestDocType> = {
			id: '4',
			scores: [80, 90], // NUMBERS
			tags: ['test'],
			_deleted: false,
			_attachments: {},
			_rev: '1-d',
			_meta: { lwt: 4000 }
		};

		await instance.bulkWrite([{ document: doc }], 'test-context');

		const query = { scores: { $gt: '50' } }; // STRING comparison

		// Mingo: Type mismatch → no matches
		const mingoQuery = new Query(query);
		const mingoResults = [doc].filter(d => mingoQuery.test(d));
		expect(mingoResults.length).toBe(0);

		// Our SQLite: Should match Mingo
		const preparedQuery = {
			query: {
				selector: query,
				sort: [{ id: 'asc' }],
				skip: 0
			},
			queryPlan: { index: ['id'], selectorSatisfiedByIndex: false }
		};

		const result = await instance.query(preparedQuery as any);
		expect(result.documents.length).toBe(0); // Should match Mingo
	});
});
