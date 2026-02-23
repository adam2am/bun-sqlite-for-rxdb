import { describe, it, expect, beforeEach } from 'bun:test';
import { getRxStorageBunSQLite } from './storage';
import type { RxDocumentData, RxStorage, RxStorageInstance, PreparedQuery, EventBulk, RxStorageChangeEvent } from 'rxdb';
import type { BunSQLiteStorageSettings, BunSQLiteInternals } from './types';

interface TestDocType {
	id: string;
	name: string;
	age: number;
}

describe('BunSQLiteStorage', () => {
	it('creates storage instance', async () => {
		const storage = getRxStorageBunSQLite();
		
		expect(storage.name).toBe('bun-sqlite');
		expect(storage.rxdbVersion).toBe('16.21.1');
		
		const instance = await storage.createStorageInstance<TestDocType>({
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
		
		expect(instance.databaseName).toBe('testdb');
		expect(instance.collectionName).toBe('users');
		
		await instance.close();
	});
});

describe('BunSQLiteStorageInstance', () => {
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
	
	it('bulkWrite inserts documents', async () => {
		const doc: RxDocumentData<TestDocType> = {
			id: 'user1',
			name: 'Alice',
			age: 30,
			_deleted: false,
			_attachments: {},
			_rev: '1-abc',
			_meta: { lwt: Date.now() }
		};
		
		const result = await instance.bulkWrite([{ document: doc }], 'test-context');
		
		expect(result.error).toHaveLength(0);
		await instance.remove();
	});
	
	it('findDocumentsById retrieves documents', async () => {
		const doc: RxDocumentData<TestDocType> = {
			id: 'user1',
			name: 'Alice',
			age: 30,
			_deleted: false,
			_attachments: {},
			_rev: '1-abc',
			_meta: { lwt: Date.now() }
		};
		
		await instance.bulkWrite([{ document: doc }], 'test-context');
		
		const found = await instance.findDocumentsById(['user1'], false);
		
		expect(found).toHaveLength(1);
		expect(found[0].id).toBe('user1');
		expect(found[0].name).toBe('Alice');
		await instance.remove();
	});
	
	it('query returns all documents', async () => {
		const docs: RxDocumentData<TestDocType>[] = [
			{ id: 'user1', name: 'Alice', age: 30, _deleted: false, _attachments: {}, _rev: '1-a', _meta: { lwt: Date.now() } },
			{ id: 'user2', name: 'Bob', age: 25, _deleted: false, _attachments: {}, _rev: '1-b', _meta: { lwt: Date.now() } }
		];
		
		await instance.bulkWrite(docs.map(doc => ({ document: doc })), 'test-context');
		
		const result = await instance.query({
			query: { selector: {}, sort: [], skip: 0 },
			queryPlan: { index: [], startKeys: [], endKeys: [], inclusiveStart: true, inclusiveEnd: true, sortSatisfiedByIndex: false, selectorSatisfiedByIndex: false }
		});
		
		expect(result.documents).toHaveLength(2);
		await instance.remove();
	});
	
	it('query filters by selector', async () => {
		const docs: RxDocumentData<TestDocType>[] = [
			{ id: 'user1', name: 'Alice', age: 30, _deleted: false, _attachments: {}, _rev: '1-a', _meta: { lwt: Date.now() } },
			{ id: 'user2', name: 'Bob', age: 25, _deleted: false, _attachments: {}, _rev: '1-b', _meta: { lwt: Date.now() } }
		];
		
		await instance.bulkWrite(docs.map(doc => ({ document: doc })), 'test-context');
		
		const result = await instance.query({ 
			query: { selector: { age: { $gt: 26 } }, sort: [], skip: 0 },
			queryPlan: { index: [], startKeys: [], endKeys: [], inclusiveStart: true, inclusiveEnd: true, sortSatisfiedByIndex: false, selectorSatisfiedByIndex: false }
		});
		
		expect(result.documents).toHaveLength(1);
		expect(result.documents[0].name).toBe('Alice');
		await instance.remove();
	});
	
	it('count returns document count', async () => {
		const docs: RxDocumentData<TestDocType>[] = [
			{ id: 'user1', name: 'Alice', age: 30, _deleted: false, _attachments: {}, _rev: '1-a', _meta: { lwt: Date.now() } },
			{ id: 'user2', name: 'Bob', age: 25, _deleted: false, _attachments: {}, _rev: '1-b', _meta: { lwt: Date.now() } }
		];
		
		await instance.bulkWrite(docs.map(doc => ({ document: doc })), 'test-context');
		
		const result = await instance.count({
			query: { selector: {}, sort: [], skip: 0 },
			queryPlan: { index: [], startKeys: [], endKeys: [], inclusiveStart: true, inclusiveEnd: true, sortSatisfiedByIndex: false, selectorSatisfiedByIndex: false }
		});
		
		expect(result.count).toBe(2);
		expect(result.mode).toBe('fast');
		await instance.remove();
	});
	
	it('cleanup removes old deleted documents', async () => {
		const doc: RxDocumentData<TestDocType> = {
			id: 'user1',
			name: 'Alice',
			age: 30,
			_deleted: true,
			_attachments: {},
			_rev: '2-deleted',
			_meta: { lwt: Date.now() - 10000 }
		};
		
		await instance.bulkWrite([{ document: doc }], 'test-context');
		
		const cleaned = await instance.cleanup(Date.now() - 5000);
		
		expect(cleaned).toBe(false);
		
		const found = await instance.findDocumentsById(['user1'], true);
		expect(found).toHaveLength(0);
		await instance.remove();
	});
	
	it('changeStream emits events', async () => {
		const events: EventBulk<RxStorageChangeEvent<TestDocType>, unknown>[] = [];
		const subscription = instance.changeStream().subscribe((event) => {
			events.push(event);
		});
		
		const doc: RxDocumentData<TestDocType> = {
			id: 'user1',
			name: 'Alice',
			age: 30,
			_deleted: false,
			_attachments: {},
			_rev: '1-abc',
			_meta: { lwt: Date.now() }
		};
		
		await instance.bulkWrite([{ document: doc }], 'test-context');
		
		expect(events).toHaveLength(1);
		expect(events[0].context).toBe('test-context');
		
		subscription.unsubscribe();
		await instance.remove();
	});

	it('enables WAL mode for performance', async () => {
		const storage = getRxStorageBunSQLite({ filename: './test-wal.db' });
		const instance = await storage.createStorageInstance<TestDocType>({
			databaseInstanceToken: 'test-token',
			databaseName: 'testdb-wal',
			collectionName: 'wal_test',
			schema: {
				version: 0,
				primaryKey: 'id',
				type: 'object',
				properties: {
					id: { type: 'string', maxLength: 100 },
					name: { type: 'string' },
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

		const db = instance.internals.db;
		const result = db.prepare('PRAGMA journal_mode').get() as { journal_mode: string };
		
		expect(result.journal_mode).toBe('wal');
		
		await instance.remove();
	});

	it('detects conflicts and returns 409 error', async () => {
		const storage = getRxStorageBunSQLite();
		const instance = await storage.createStorageInstance<TestDocType>({
			databaseInstanceToken: 'test-token',
			databaseName: 'testdb',
			collectionName: 'conflict_test',
			schema: {
				version: 0,
				primaryKey: 'id',
				type: 'object',
				properties: {
					id: { type: 'string', maxLength: 100 },
					name: { type: 'string' },
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

		const doc: RxDocumentData<TestDocType> = {
			id: 'conflict-1',
			name: 'Original',
			age: 30,
			_deleted: false,
			_attachments: {},
			_rev: '1-abc',
			_meta: { lwt: Date.now() }
		};

		await instance.bulkWrite([{ document: doc }], 'test');

		const conflictDoc: RxDocumentData<TestDocType> = {
			...doc,
			name: 'Conflict',
			_rev: '2-def'
		};

		const result = await instance.bulkWrite([{ document: conflictDoc }], 'test');

		expect(result.error.length).toBe(1);
		expect(result.error[0].status).toBe(409);
		expect(result.error[0].documentId).toBe('conflict-1');
		if ('documentInDb' in result.error[0]) {
			expect(result.error[0].documentInDb?.name).toBe('Original');
		}

		await instance.remove();
	});

	it('emits checkpoint with correct structure', async () => {
		const storage = getRxStorageBunSQLite();
		const instance = await storage.createStorageInstance<TestDocType>({
			databaseInstanceToken: 'test-token',
			databaseName: 'testdb',
			collectionName: 'checkpoint_test',
			schema: {
				version: 0,
				primaryKey: 'id',
				type: 'object',
				properties: {
					id: { type: 'string', maxLength: 100 },
					name: { type: 'string' },
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

		const events: any[] = [];
		const subscription = instance.changeStream().subscribe(event => {
			events.push(event);
		});

		const lwt = Date.now();
		const doc: RxDocumentData<TestDocType> = {
			id: 'checkpoint-1',
			name: 'Test',
			age: 25,
			_deleted: false,
			_attachments: {},
			_rev: '1-abc',
			_meta: { lwt }
		};

		await instance.bulkWrite([{ document: doc }], 'test');

		await new Promise(resolve => setTimeout(resolve, 50));

		expect(events.length).toBe(1);
		expect(events[0].checkpoint).toEqual({ id: 'checkpoint-1', lwt });

		subscription.unsubscribe();
		await instance.remove();
	});

	it('uses MessagePack for efficient storage', async () => {
		const storage = getRxStorageBunSQLite();
		const instance = await storage.createStorageInstance<TestDocType>({
			databaseInstanceToken: 'test-token',
			databaseName: 'testdb',
			collectionName: 'msgpack_test',
			schema: {
				version: 0,
				primaryKey: 'id',
				type: 'object',
				properties: {
					id: { type: 'string', maxLength: 100 },
					name: { type: 'string' },
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

		const doc: RxDocumentData<TestDocType> = {
			id: 'msgpack-1',
			name: 'Test MessagePack',
			age: 42,
			_deleted: false,
			_attachments: {},
			_rev: '1-abc',
			_meta: { lwt: Date.now() }
		};

		await instance.bulkWrite([{ document: doc }], 'test');

		const result = await instance.findDocumentsById(['msgpack-1'], false);
		
		expect(result.length).toBe(1);
		expect(result[0].id).toBe('msgpack-1');
		expect(result[0].name).toBe('Test MessagePack');
		expect(result[0].age).toBe(42);

		await instance.remove();
	});

	it('query and count include deleted documents (storage layer returns ALL)', async () => {
		const docs: RxDocumentData<TestDocType>[] = [
			{ id: 'user1', name: 'Alice', age: 30, _deleted: false, _attachments: {}, _rev: '1-a', _meta: { lwt: 1000 } },
			{ id: 'user2', name: 'Bob', age: 25, _deleted: true, _attachments: {}, _rev: '2-b', _meta: { lwt: 2000 } },
			{ id: 'user3', name: 'Charlie', age: 35, _deleted: false, _attachments: {}, _rev: '1-c', _meta: { lwt: 3000 } }
		];

		await instance.bulkWrite(docs.map(doc => ({ document: doc })), 'test');

		const queryResult = await instance.query({
			query: { selector: {}, sort: [], skip: 0 },
			queryPlan: { index: [], startKeys: [], endKeys: [], inclusiveStart: true, inclusiveEnd: true, sortSatisfiedByIndex: false, selectorSatisfiedByIndex: false }
		});

		// Storage layer returns ALL documents including deleted
		expect(queryResult.documents).toHaveLength(3);
		expect(queryResult.documents.find(d => d.id === 'user2')).toBeDefined();

		const countResult = await instance.count({
			query: { selector: {}, sort: [], skip: 0 },
			queryPlan: { index: [], startKeys: [], endKeys: [], inclusiveStart: true, inclusiveEnd: true, sortSatisfiedByIndex: false, selectorSatisfiedByIndex: false }
		});

		// Storage layer counts ALL documents including deleted
		expect(countResult.count).toBe(3);
		await instance.remove();
	});

	it('getChangedDocumentsSince returns documents after checkpoint', async () => {
		const docs: RxDocumentData<TestDocType>[] = [
			{ id: 'user1', name: 'Alice', age: 30, _deleted: false, _attachments: {}, _rev: '1-a', _meta: { lwt: 1000 } },
			{ id: 'user2', name: 'Bob', age: 25, _deleted: false, _attachments: {}, _rev: '1-b', _meta: { lwt: 2000 } },
			{ id: 'user3', name: 'Charlie', age: 35, _deleted: false, _attachments: {}, _rev: '1-c', _meta: { lwt: 3000 } }
		];

		await instance.bulkWrite(docs.map(doc => ({ document: doc })), 'test');

		const result = await instance.getChangedDocumentsSince!(10, { id: '', lwt: 1500 });

		expect(result.documents).toHaveLength(2);
		expect(result.documents[0].id).toBe('user2');
		expect(result.documents[1].id).toBe('user3');
		expect(result.checkpoint).toEqual({ id: 'user3', lwt: 3000 });
		await instance.remove();
	});

	it('changeStream only emits events for successful operations', async () => {
		const events: any[] = [];
		const subscription = instance.changeStream().subscribe(event => {
			events.push(event);
		});

		const doc1: RxDocumentData<TestDocType> = {
			id: 'user1',
			name: 'Alice',
			age: 30,
			_deleted: false,
			_attachments: {},
			_rev: '1-a',
			_meta: { lwt: 1000 }
		};

		await instance.bulkWrite([{ document: doc1 }], 'test');

		const conflictDoc: RxDocumentData<TestDocType> = {
			...doc1,
			name: 'Bob',
			_rev: '2-b',
			_meta: { lwt: 2000 }
		};

		const result = await instance.bulkWrite([{ document: conflictDoc }], 'test');

		expect(result.error.length).toBe(1);
		expect(result.error[0].status).toBe(409);

		await new Promise(resolve => setTimeout(resolve, 50));

		expect(events.length).toBe(1);
		expect(events[0].events.length).toBe(1);
		expect(events[0].events[0].documentId).toBe('user1');
		expect(events[0].events[0].operation).toBe('INSERT');

		subscription.unsubscribe();
		await instance.remove();
	});
});
