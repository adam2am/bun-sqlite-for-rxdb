import { describe, it, expect, beforeEach } from 'bun:test';
import { getRxStorageBunSQLite } from './storage';
import type { RxDocumentData, RxStorage, RxStorageInstance } from 'rxdb';
import type { BunSQLiteStorageSettings, BunSQLiteInternals } from './types';

interface TestDocType {
	id: string;
	name: string;
	tags: string[];
	metadata: { active: boolean; count: number };
	age: number;
}

describe('$elemMatch and $type Fallback (TDD)', () => {
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
					tags: { type: 'array', items: { type: 'string' } },
					metadata: { 
						type: 'object',
						properties: {
							active: { type: 'boolean' },
							count: { type: 'number' }
						}
					},
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
	
	it('handles $elemMatch on array fields', async () => {
		const docs: RxDocumentData<TestDocType>[] = [
			{ 
				id: 'user1', 
				name: 'Alice', 
				tags: ['urgent', 'important'], 
				metadata: { active: true, count: 5 },
				age: 30, 
				_deleted: false, 
				_attachments: {}, 
				_rev: '1-a', 
				_meta: { lwt: Date.now() } 
			},
			{ 
				id: 'user2', 
				name: 'Bob', 
				tags: ['normal', 'pending'], 
				metadata: { active: false, count: 2 },
				age: 25, 
				_deleted: false, 
				_attachments: {}, 
				_rev: '1-b', 
				_meta: { lwt: Date.now() } 
			},
			{ 
				id: 'user3', 
				name: 'Charlie', 
				tags: ['urgent', 'pending'], 
				metadata: { active: true, count: 8 },
				age: 35, 
				_deleted: false, 
				_attachments: {}, 
				_rev: '1-c', 
				_meta: { lwt: Date.now() } 
			}
		];
		
		await instance.bulkWrite(docs.map(doc => ({ document: doc })), 'test-context');
		
		const result = await instance.query({ 
			query: { 
				selector: { 
					tags: { 
						$elemMatch: { $eq: 'urgent' } 
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
		expect(result.documents[0].id).toBe('user1');
		expect(result.documents[1].id).toBe('user3');
		
		await instance.remove();
	});
	
	it('handles $type with array type', async () => {
		const docs: RxDocumentData<TestDocType>[] = [
			{ 
				id: 'user1', 
				name: 'Alice', 
				tags: ['tag1', 'tag2'], 
				metadata: { active: true, count: 5 },
				age: 30, 
				_deleted: false, 
				_attachments: {}, 
				_rev: '1-a', 
				_meta: { lwt: Date.now() } 
			},
			{ 
				id: 'user2', 
				name: 'Bob', 
				tags: ['tag3'], 
				metadata: { active: false, count: 2 },
				age: 25, 
				_deleted: false, 
				_attachments: {}, 
				_rev: '1-b', 
				_meta: { lwt: Date.now() } 
			}
		];
		
		await instance.bulkWrite(docs.map(doc => ({ document: doc })), 'test-context');
		
		const result = await instance.query({ 
			query: { 
				selector: { 
					tags: { $type: 'array' } 
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
		
		await instance.remove();
	});
	
	it('handles $type with object type', async () => {
		const docs: RxDocumentData<TestDocType>[] = [
			{ 
				id: 'user1', 
				name: 'Alice', 
				tags: ['tag1'], 
				metadata: { active: true, count: 5 },
				age: 30, 
				_deleted: false, 
				_attachments: {}, 
				_rev: '1-a', 
				_meta: { lwt: Date.now() } 
			},
			{ 
				id: 'user2', 
				name: 'Bob', 
				tags: ['tag2'], 
				metadata: { active: false, count: 2 },
				age: 25, 
				_deleted: false, 
				_attachments: {}, 
				_rev: '1-b', 
				_meta: { lwt: Date.now() } 
			}
		];
		
		await instance.bulkWrite(docs.map(doc => ({ document: doc })), 'test-context');
		
		const result = await instance.query({ 
			query: { 
				selector: { 
					metadata: { $type: 'object' } 
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
		
		await instance.remove();
	});
});
