import { describe, it, expect, beforeEach } from 'bun:test';
import { getRxStorageBunSQLite } from '$app/storage';
import type { RxDocumentData, RxStorage, RxStorageInstance } from 'rxdb';
import type { BunSQLiteStorageSettings, BunSQLiteInternals } from '$app/types';

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

	it('handles $elemMatch with $and (SQL fast path, no Mingo fallback)', async () => {
		interface DocWithObjects {
			id: string;
			name: string;
			items: Array<{ label: string; status: string; count: number }>;
			_deleted: boolean;
			_attachments: Record<string, unknown>;
			_rev: string;
			_meta: { lwt: number };
		}

		const objInstance = await storage.createStorageInstance<DocWithObjects>({
			databaseInstanceToken: `test-token-${Date.now()}`,
			databaseName: 'testdb',
			collectionName: 'items',
			schema: {
				version: 0,
				primaryKey: 'id',
				type: 'object',
				properties: {
					id: { type: 'string', maxLength: 100 },
					name: { type: 'string' },
					items: { type: 'array' },
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

		const docs: RxDocumentData<DocWithObjects>[] = [
			{ 
				id: 'doc1', 
				name: 'First',
				items: [
					{ label: 'premium', status: 'active', count: 10 },
					{ label: 'basic', status: 'inactive', count: 5 }
				],
				_deleted: false, 
				_attachments: {}, 
				_rev: '1-a', 
				_meta: { lwt: Date.now() } 
			},
			{ 
				id: 'doc2', 
				name: 'Second',
				items: [
					{ label: 'premium', status: 'inactive', count: 3 },
					{ label: 'vip', status: 'active', count: 15 }
				],
				_deleted: false, 
				_attachments: {}, 
				_rev: '1-b', 
				_meta: { lwt: Date.now() } 
			},
			{ 
				id: 'doc3', 
				name: 'Third',
				items: [
					{ label: 'basic', status: 'active', count: 2 }
				],
				_deleted: false, 
				_attachments: {}, 
				_rev: '1-c', 
				_meta: { lwt: Date.now() } 
			}
		];

		await objInstance.bulkWrite(docs.map(doc => ({ document: doc })), 'test-context');

		const result = await objInstance.query({ 
			query: { 
				selector: { 
					items: { 
						$elemMatch: { 
							$and: [
								{ label: 'premium' }, 
								{ status: 'active' }
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

		expect(result.documents).toHaveLength(1);
		expect(result.documents[0].id).toBe('doc1');

		await objInstance.remove();
	});

	it('handles $elemMatch with $or (SQL fast path, no Mingo fallback)', async () => {
		interface DocWithObjects {
			id: string;
			name: string;
			items: Array<{ type: string; priority: number }>;
			_deleted: boolean;
			_attachments: Record<string, unknown>;
			_rev: string;
			_meta: { lwt: number };
		}

		const objInstance = await storage.createStorageInstance<DocWithObjects>({
			databaseInstanceToken: `test-token-${Date.now()}`,
			databaseName: 'testdb',
			collectionName: 'items-or',
			schema: {
				version: 0,
				primaryKey: 'id',
				type: 'object',
				properties: {
					id: { type: 'string', maxLength: 100 },
					name: { type: 'string' },
					items: { type: 'array' },
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

		const docs: RxDocumentData<DocWithObjects>[] = [
			{ 
				id: 'doc1', 
				name: 'First',
				items: [
					{ type: 'A', priority: 1 },
					{ type: 'C', priority: 3 }
				],
				_deleted: false, 
				_attachments: {}, 
				_rev: '1-a', 
				_meta: { lwt: Date.now() } 
			},
			{ 
				id: 'doc2', 
				name: 'Second',
				items: [
					{ type: 'B', priority: 2 }
				],
				_deleted: false, 
				_attachments: {}, 
				_rev: '1-b', 
				_meta: { lwt: Date.now() } 
			},
			{ 
				id: 'doc3', 
				name: 'Third',
				items: [
					{ type: 'C', priority: 5 }
				],
				_deleted: false, 
				_attachments: {}, 
				_rev: '1-c', 
				_meta: { lwt: Date.now() } 
			}
		];

		await objInstance.bulkWrite(docs.map(doc => ({ document: doc })), 'test-context');

		const result = await objInstance.query({ 
			query: { 
				selector: { 
					items: { 
						$elemMatch: { 
							$or: [
								{ type: 'A' }, 
								{ type: 'B' }
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
		expect(result.documents[0].id).toBe('doc1');
		expect(result.documents[1].id).toBe('doc2');

		await objInstance.remove();
	});

	it('handles $elemMatch with $nor (SQL fast path, no Mingo fallback)', async () => {
		interface DocWithObjects {
			id: string;
			name: string;
			items: Array<{ status: string; archived: boolean }>;
			_deleted: boolean;
			_attachments: Record<string, unknown>;
			_rev: string;
			_meta: { lwt: number };
		}

		const objInstance = await storage.createStorageInstance<DocWithObjects>({
			databaseInstanceToken: `test-token-${Date.now()}`,
			databaseName: 'testdb',
			collectionName: 'items-nor',
			schema: {
				version: 0,
				primaryKey: 'id',
				type: 'object',
				properties: {
					id: { type: 'string', maxLength: 100 },
					name: { type: 'string' },
					items: { type: 'array' },
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

		const docs: RxDocumentData<DocWithObjects>[] = [
			{ 
				id: 'doc1', 
				name: 'First',
				items: [
					{ status: 'active', archived: false },
					{ status: 'pending', archived: false }
				],
				_deleted: false, 
				_attachments: {}, 
				_rev: '1-a', 
				_meta: { lwt: Date.now() } 
			},
			{ 
				id: 'doc2', 
				name: 'Second',
				items: [
					{ status: 'deleted', archived: true }
				],
				_deleted: false, 
				_attachments: {}, 
				_rev: '1-b', 
				_meta: { lwt: Date.now() } 
			},
			{ 
				id: 'doc3', 
				name: 'Third',
				items: [
					{ status: 'archived', archived: true }
				],
				_deleted: false, 
				_attachments: {}, 
				_rev: '1-c', 
				_meta: { lwt: Date.now() } 
			}
		];

		await objInstance.bulkWrite(docs.map(doc => ({ document: doc })), 'test-context');

		const result = await objInstance.query({ 
			query: { 
				selector: { 
					items: { 
						$elemMatch: { 
							$nor: [
								{ status: 'deleted' }, 
								{ status: 'archived' }
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

		expect(result.documents).toHaveLength(1);
		expect(result.documents[0].id).toBe('doc1');

		await objInstance.remove();
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

	it('handles $type with boolean type (SQL fast path)', async () => {
		interface DocWithBoolean {
			id: string;
			name: string;
			active: boolean;
			verified: boolean;
			count: number;
			_deleted: boolean;
			_attachments: Record<string, unknown>;
			_rev: string;
			_meta: { lwt: number };
		}

		const boolInstance = await storage.createStorageInstance<DocWithBoolean>({
			databaseInstanceToken: `test-token-${Date.now()}`,
			databaseName: 'testdb',
			collectionName: 'bool-test',
			schema: {
				version: 0,
				primaryKey: 'id',
				type: 'object',
				properties: {
					id: { type: 'string', maxLength: 100 },
					name: { type: 'string' },
					active: { type: 'boolean' },
					verified: { type: 'boolean' },
					count: { type: 'number' },
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

		const docs: RxDocumentData<DocWithBoolean>[] = [
			{ 
				id: 'doc1', 
				name: 'First',
				active: true,
				verified: false,
				count: 10,
				_deleted: false, 
				_attachments: {}, 
				_rev: '1-a', 
				_meta: { lwt: Date.now() } 
			},
			{ 
				id: 'doc2', 
				name: 'Second',
				active: false,
				verified: true,
				count: 5,
				_deleted: false, 
				_attachments: {}, 
				_rev: '1-b', 
				_meta: { lwt: Date.now() } 
			},
			{ 
				id: 'doc3', 
				name: 'Third',
				active: true,
				verified: true,
				count: 0,
				_deleted: false, 
				_attachments: {}, 
				_rev: '1-c', 
				_meta: { lwt: Date.now() } 
			}
		];

		await boolInstance.bulkWrite(docs.map(doc => ({ document: doc })), 'test-context');

		const result = await boolInstance.query({ 
			query: { 
				selector: { 
					active: { $type: 'boolean' } 
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
		expect(result.documents[0].id).toBe('doc1');
		expect(result.documents[1].id).toBe('doc2');
		expect(result.documents[2].id).toBe('doc3');

		await boolInstance.remove();
	});
});
