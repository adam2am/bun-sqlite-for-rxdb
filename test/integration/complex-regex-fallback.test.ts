import { describe, it, expect, beforeEach } from 'bun:test';
import { getRxStorageBunSQLite } from './storage';
import type { RxDocumentData, RxStorage, RxStorageInstance } from 'rxdb';
import type { BunSQLiteStorageSettings, BunSQLiteInternals } from './types';

interface TestDocType {
	id: string;
	name: string;
	code: string;
	age: number;
}

describe('Complex $regex Fallback (TDD)', () => {
	let storage: RxStorage<BunSQLiteInternals, BunSQLiteStorageSettings>;
	let instance: RxStorageInstance<TestDocType, BunSQLiteInternals, BunSQLiteStorageSettings>;
	
	beforeEach(async () => {
		storage = getRxStorageBunSQLite();
		instance = await storage.createStorageInstance<TestDocType>({
			databaseInstanceToken: 'test-token',
			databaseName: 'testdb',
			collectionName: 'users',
			schema: {
				version: 0,
				primaryKey: 'id',
				type: 'object',
				properties: {
					id: { type: 'string', maxLength: 100 },
					name: { type: 'string' },
					code: { type: 'string' },
					age: { type: 'number' },
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
	});
	
	it('handles complex $regex with character classes', async () => {
		const docs: RxDocumentData<TestDocType>[] = [
			{ id: 'user1', name: 'Alice', code: 'ABC123', age: 30, _deleted: false, _attachments: {}, _rev: '1-a', _meta: { lwt: Date.now() } },
			{ id: 'user2', name: 'Bob', code: 'XYZ789', age: 25, _deleted: false, _attachments: {}, _rev: '1-b', _meta: { lwt: Date.now() } },
			{ id: 'user3', name: 'Charlie', code: '123456', age: 35, _deleted: false, _attachments: {}, _rev: '1-c', _meta: { lwt: Date.now() } }
		];
		
		await instance.bulkWrite(docs.map(doc => ({ document: doc })), 'test-context');
		
		// Complex regex: match codes that start with uppercase letters
		// Pattern: [A-Z]+ (one or more uppercase letters)
		// This should match: ABC123, XYZ789
		// This should NOT match: 123456
		const result = await instance.query({ 
			query: { 
				selector: { 
					code: { 
						$regex: '^[A-Z]+' 
					} 
				}, 
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
		
		expect(result.documents).toHaveLength(2);
		expect(result.documents[0].code).toBe('ABC123');
		expect(result.documents[1].code).toBe('XYZ789');
		
		await instance.remove();
	});
	
	it('handles complex $regex with case-insensitive flag', async () => {
		const docs: RxDocumentData<TestDocType>[] = [
			{ id: 'user1', name: 'alice', code: 'A1', age: 30, _deleted: false, _attachments: {}, _rev: '1-a', _meta: { lwt: Date.now() } },
			{ id: 'user2', name: 'ALICE', code: 'A2', age: 25, _deleted: false, _attachments: {}, _rev: '1-b', _meta: { lwt: Date.now() } },
			{ id: 'user3', name: 'Bob', code: 'B1', age: 35, _deleted: false, _attachments: {}, _rev: '1-c', _meta: { lwt: Date.now() } }
		];
		
		await instance.bulkWrite(docs.map(doc => ({ document: doc })), 'test-context');
		
		// Case-insensitive regex: match "alice" in any case
		const result = await instance.query({ 
			query: { 
				selector: { 
					name: { 
						$regex: 'alice',
						$options: 'i'
					} 
				}, 
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
		
		expect(result.documents).toHaveLength(2);
		expect(result.documents[0].name).toBe('alice');
		expect(result.documents[1].name).toBe('ALICE');
		
		await instance.remove();
	});
	
	it('handles complex $regex with digit patterns', async () => {
		const docs: RxDocumentData<TestDocType>[] = [
			{ id: 'user1', name: 'Alice', code: '123-456', age: 30, _deleted: false, _attachments: {}, _rev: '1-a', _meta: { lwt: Date.now() } },
			{ id: 'user2', name: 'Bob', code: '789-012', age: 25, _deleted: false, _attachments: {}, _rev: '1-b', _meta: { lwt: Date.now() } },
			{ id: 'user3', name: 'Charlie', code: 'ABC-DEF', age: 35, _deleted: false, _attachments: {}, _rev: '1-c', _meta: { lwt: Date.now() } }
		];
		
		await instance.bulkWrite(docs.map(doc => ({ document: doc })), 'test-context');
		
		// Complex regex: match codes with digit-dash-digit pattern
		// Pattern: \d{3}-\d{3}
		const result = await instance.query({ 
			query: { 
				selector: { 
					code: { 
						$regex: '\\d{3}-\\d{3}' 
					} 
				}, 
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
		
		expect(result.documents).toHaveLength(2);
		expect(result.documents[0].code).toBe('123-456');
		expect(result.documents[1].code).toBe('789-012');
		
		await instance.remove();
	});
});
