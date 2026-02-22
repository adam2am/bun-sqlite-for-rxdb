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
		
		expect(cleaned).toBe(true);
		
		const found = await instance.findDocumentsById(['user1'], true);
		expect(found).toHaveLength(0);
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
	});
});
