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

interface TestDocTypeEdgeCases {
	id: string;
	name: string;
	tags?: string[] | null | string;
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
	
	it('handles $type array edge cases (empty, nested, null, undefined, string)', async () => {
		const edgeCaseInstance = await storage.createStorageInstance<TestDocTypeEdgeCases>({
			databaseInstanceToken: `test-token-edge-${Date.now()}`,
			databaseName: 'test-db',
			collectionName: 'test-collection-edge-1',
			schema: {
				version: 0,
				primaryKey: 'id',
				type: 'object',
				properties: {
					id: { type: 'string', maxLength: 100 },
					name: { type: 'string' },
					tags: { type: 'array' },
					metadata: { type: 'object' },
					age: { type: 'number' },
					_deleted: { type: 'boolean' },
					_attachments: { type: 'object' },
					_rev: { type: 'string' },
					_meta: {
						type: 'object',
						properties: {
							lwt: { type: 'number' }
						},
						required: ['lwt'],
						additionalProperties: false
					}
				},
				required: ['id', 'name', 'age', 'metadata', '_deleted', '_attachments', '_rev', '_meta']
			},
			options: {},
			multiInstance: false,
			devMode: false
		});
		
		const docs: RxDocumentData<TestDocTypeEdgeCases>[] = [
			{ 
				id: 'user1', 
				name: 'Alice', 
				tags: [], 
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
				tags: ['nested', 'arrays'], 
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
				tags: undefined,
				metadata: { active: true, count: 8 },
				age: 35, 
				_deleted: false, 
				_attachments: {}, 
				_rev: '1-c', 
				_meta: { lwt: Date.now() } 
			},
			{ 
				id: 'user4', 
				name: 'David', 
				tags: null, 
				metadata: { active: false, count: 1 },
				age: 40, 
				_deleted: false, 
				_attachments: {}, 
				_rev: '1-d', 
				_meta: { lwt: Date.now() } 
			},
			{ 
				id: 'user5', 
				name: 'Eve', 
				tags: "[1,2,3]", 
				metadata: { active: true, count: 3 },
				age: 28, 
				_deleted: false, 
				_attachments: {}, 
				_rev: '1-e', 
				_meta: { lwt: Date.now() } 
			}
		];
		
		await edgeCaseInstance.bulkWrite(docs.map(doc => ({ document: doc })), 'test-context');
		
		const result = await edgeCaseInstance.query({ 
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
		expect(result.documents[0].id).toBe('user1');
		expect(result.documents[1].id).toBe('user2');
		
		await edgeCaseInstance.remove();
	});
	
	it('handles $type array bulletproof edge cases (malformed JSON, unicode, special chars)', async () => {
		const edgeCaseInstance = await storage.createStorageInstance<TestDocTypeEdgeCases>({
			databaseInstanceToken: `test-token-${Date.now()}`,
			databaseName: 'test-db',
			collectionName: 'test-collection-edge',
			schema: {
				version: 0,
				primaryKey: 'id',
				type: 'object',
				properties: {
					id: { type: 'string', maxLength: 100 },
					name: { type: 'string' },
					tags: { type: 'array' },
					metadata: { type: 'object' },
					age: { type: 'number' },
					_deleted: { type: 'boolean' },
					_attachments: { type: 'object' },
					_rev: { type: 'string' },
					_meta: {
						type: 'object',
						properties: {
							lwt: { type: 'number' }
						},
						required: ['lwt'],
						additionalProperties: false
					}
				},
				required: ['id', 'name', 'age', 'metadata', '_deleted', '_attachments', '_rev', '_meta']
			},
			options: {},
			multiInstance: false,
			devMode: false
		});
		
		const docs: RxDocumentData<TestDocTypeEdgeCases>[] = [
			{ 
				id: 'user1', 
				name: 'Valid empty array', 
				tags: [], 
				metadata: { active: true, count: 1 },
				age: 30, 
				_deleted: false, 
				_attachments: {}, 
				_rev: '1-a', 
				_meta: { lwt: Date.now() } 
			},
			{ 
				id: 'user2', 
				name: 'Valid array with unicode', 
				tags: ['🏴‍☠️', '日本語', 'Ñoño'], 
				metadata: { active: true, count: 2 },
				age: 25, 
				_deleted: false, 
				_attachments: {}, 
				_rev: '1-b', 
				_meta: { lwt: Date.now() } 
			},
			{ 
				id: 'user3', 
				name: 'Malformed JSON string', 
				tags: '{not valid json',
				metadata: { active: true, count: 3 },
				age: 35, 
				_deleted: false, 
				_attachments: {}, 
				_rev: '1-c', 
				_meta: { lwt: Date.now() } 
			},
			{ 
				id: 'user4', 
				name: 'JSON-like string with brackets', 
				tags: '[1,2,3]',
				metadata: { active: true, count: 4 },
				age: 40, 
				_deleted: false, 
				_attachments: {}, 
				_rev: '1-d', 
				_meta: { lwt: Date.now() } 
			},
			{ 
				id: 'user5', 
				name: 'Empty string', 
				tags: '',
				metadata: { active: true, count: 5 },
				age: 28, 
				_deleted: false, 
				_attachments: {}, 
				_rev: '1-e', 
				_meta: { lwt: Date.now() } 
			},
			{ 
				id: 'user6', 
				name: 'Array with special chars', 
				tags: ['<script>', '"quotes"', "it's", 'back\\slash'], 
				metadata: { active: true, count: 6 },
				age: 32, 
				_deleted: false, 
				_attachments: {}, 
				_rev: '1-f', 
				_meta: { lwt: Date.now() } 
			}
		];
		
		await edgeCaseInstance.bulkWrite(docs.map(doc => ({ document: doc })), 'test-context');
		
		const result = await edgeCaseInstance.query({ 
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
		
		expect(result.documents).toHaveLength(3);
		expect(result.documents[0].id).toBe('user1');
		expect(result.documents[1].id).toBe('user2');
		expect(result.documents[2].id).toBe('user6');
		
		await edgeCaseInstance.remove();
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
	
	it('handles $elemMatch with $and (Mingo fallback)', async () => {
		const docs: RxDocumentData<TestDocType>[] = [
			{ 
				id: 'user1', 
				name: 'Alice', 
				tags: ['premium', 'active'], 
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
				tags: ['premium'], 
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
				tags: ['active'], 
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
						$elemMatch: { 
							$and: [
								{ $eq: 'premium' },
								{ $ne: 'inactive' }
							]
						}
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
		expect(result.documents[1].id).toBe('user2');
		
		await instance.remove();
	});
	
	it('handles $elemMatch with $or (Mingo fallback)', async () => {
		const docs: RxDocumentData<TestDocType>[] = [
			{ 
				id: 'user1', 
				name: 'Alice', 
				tags: ['premium'], 
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
				tags: ['vip'], 
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
				tags: ['basic'], 
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
						$elemMatch: { 
							$or: [
								{ $eq: 'premium' },
								{ $eq: 'vip' }
							]
						}
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
		expect(result.documents[1].id).toBe('user2');
		
		await instance.remove();
	});
});
