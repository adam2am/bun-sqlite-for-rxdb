import { describe, it, expect, beforeEach } from 'bun:test';
import { getRxStorageBunSQLite } from './storage';
import type { RxDocumentData } from 'rxdb';

describe('BunSQLiteStorage', () => {
	it('creates storage instance', async () => {
		const storage = getRxStorageBunSQLite();
		
		expect(storage.name).toBe('bun-sqlite');
		expect(storage.rxdbVersion).toBe('16.21.1');
		
		const instance = await storage.createStorageInstance({
			databaseName: 'testdb',
			collectionName: 'users',
			schema: {
				version: 0,
				primaryKey: 'id',
				type: 'object',
				properties: {
					id: { type: 'string', maxLength: 100 },
					name: { type: 'string' },
					age: { type: 'number' }
				},
				required: ['id']
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
	let storage: any;
	let instance: any;
	
	beforeEach(async () => {
		storage = getRxStorageBunSQLite();
		instance = await storage.createStorageInstance({
			databaseName: 'testdb',
			collectionName: 'users',
			schema: {
				version: 0,
				primaryKey: 'id',
				type: 'object',
				properties: {
					id: { type: 'string', maxLength: 100 },
					name: { type: 'string' },
					age: { type: 'number' }
				},
				required: ['id']
			},
			options: {},
			multiInstance: false,
			devMode: false
		});
	});
	
	it('bulkWrite inserts documents', async () => {
		const doc: RxDocumentData<any> = {
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
		const doc: RxDocumentData<any> = {
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
		const docs = [
			{ id: 'user1', name: 'Alice', age: 30, _deleted: false, _attachments: {}, _rev: '1-a', _meta: { lwt: Date.now() } },
			{ id: 'user2', name: 'Bob', age: 25, _deleted: false, _attachments: {}, _rev: '1-b', _meta: { lwt: Date.now() } }
		];
		
		await instance.bulkWrite(docs.map(doc => ({ document: doc })), 'test-context');
		
		const result = await instance.query({ selector: {}, sort: [], skip: 0 });
		
		expect(result.documents).toHaveLength(2);
	});
	
	it('query filters by selector', async () => {
		const docs = [
			{ id: 'user1', name: 'Alice', age: 30, _deleted: false, _attachments: {}, _rev: '1-a', _meta: { lwt: Date.now() } },
			{ id: 'user2', name: 'Bob', age: 25, _deleted: false, _attachments: {}, _rev: '1-b', _meta: { lwt: Date.now() } }
		];
		
		await instance.bulkWrite(docs.map(doc => ({ document: doc })), 'test-context');
		
		const result = await instance.query({ 
			selector: { age: { $gt: 26 } }, 
			sort: [], 
			skip: 0 
		});
		
		expect(result.documents).toHaveLength(1);
		expect(result.documents[0].name).toBe('Alice');
	});
	
	it('count returns document count', async () => {
		const docs = [
			{ id: 'user1', name: 'Alice', age: 30, _deleted: false, _attachments: {}, _rev: '1-a', _meta: { lwt: Date.now() } },
			{ id: 'user2', name: 'Bob', age: 25, _deleted: false, _attachments: {}, _rev: '1-b', _meta: { lwt: Date.now() } }
		];
		
		await instance.bulkWrite(docs.map(doc => ({ document: doc })), 'test-context');
		
		const result = await instance.count({ selector: {}, sort: [], skip: 0 });
		
		expect(result.count).toBe(2);
		expect(result.mode).toBe('fast');
	});
	
	it('cleanup removes old deleted documents', async () => {
		const doc: RxDocumentData<any> = {
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
		const events: any[] = [];
		const subscription = instance.changeStream().subscribe((event: any) => {
			events.push(event);
		});
		
		const doc: RxDocumentData<any> = {
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
