import { describe, test, expect } from 'bun:test';
import { Database } from 'bun:sqlite';
import { getRxStorageBunSQLite } from '$app/storage';

describe('PRAGMA Settings', () => {
	test('mmap_size enabled by default (256MB) and works', async () => {
		const storage = getRxStorageBunSQLite({ filename: 'test-mmap-default.db' });
		const instance = await storage.createStorageInstance({
			databaseInstanceToken: 'test-mmap-default',
			databaseName: 'test-mmap-default',
			collectionName: 'users',
			schema: {
				version: 0,
				primaryKey: 'id',
				type: 'object',
				properties: {
					id: { type: 'string', maxLength: 100 },
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

		const db = instance.internals.db;
		const result = db.query('PRAGMA mmap_size').get() as { mmap_size: number } | null;
		
		console.log(`  mmap_size (default): ${result?.mmap_size || 'null'}`);
		expect(result?.mmap_size).toBe(268435456);
		
		await instance.bulkWrite([{
			document: { id: 'test1', _deleted: false, _attachments: {}, _rev: '1-abc', _meta: { lwt: Date.now() } }
		}], 'test');
		
		const query = await instance.query({
			query: { selector: {}, sort: [{ id: 'asc' }], skip: 0 },
			queryPlan: { index: [], startKeys: [], endKeys: [], inclusiveStart: true, inclusiveEnd: true, sortSatisfiedByIndex: false, selectorSatisfiedByIndex: false }
		});
		
		expect(query.documents).toHaveLength(1);
		
		await instance.close();
	});

	test('temp_store set to MEMORY and works', async () => {
		const storage = getRxStorageBunSQLite({ filename: 'test-temp-store.db' });
		const instance = await storage.createStorageInstance({
			databaseInstanceToken: 'test-temp-store',
			databaseName: 'test-temp-store',
			collectionName: 'users',
			schema: {
				version: 0,
				primaryKey: 'id',
				type: 'object',
				properties: {
					id: { type: 'string', maxLength: 100 },
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

		const db = instance.internals.db;
		const result = db.query('PRAGMA temp_store').get() as { temp_store: number } | null;
		
		console.log(`  temp_store: ${result?.temp_store || 'null'} (2=MEMORY)`);
		expect(result?.temp_store).toBe(2);
		
		await instance.bulkWrite([{
			document: { id: 'test1', _deleted: false, _attachments: {}, _rev: '1-abc', _meta: { lwt: Date.now() } }
		}], 'test');
		
		const query = await instance.query({
			query: { selector: {}, sort: [{ id: 'asc' }], skip: 0 },
			queryPlan: { index: [], startKeys: [], endKeys: [], inclusiveStart: true, inclusiveEnd: true, sortSatisfiedByIndex: false, selectorSatisfiedByIndex: false }
		});
		
		expect(query.documents).toHaveLength(1);
		
		await instance.close();
	});

	test('locking_mode set to NORMAL and works', async () => {
		const storage = getRxStorageBunSQLite({ filename: 'test-locking-mode.db' });
		const instance = await storage.createStorageInstance({
			databaseInstanceToken: 'test-locking-mode',
			databaseName: 'test-locking-mode',
			collectionName: 'users',
			schema: {
				version: 0,
				primaryKey: 'id',
				type: 'object',
				properties: {
					id: { type: 'string', maxLength: 100 },
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

		const db = instance.internals.db;
		const result = db.query('PRAGMA locking_mode').get() as { locking_mode: string } | null;
		
		console.log(`  locking_mode: ${result?.locking_mode || 'null'}`);
		expect(result?.locking_mode).toBe('normal');
		
		await instance.bulkWrite([{
			document: { id: 'test1', _deleted: false, _attachments: {}, _rev: '1-abc', _meta: { lwt: Date.now() } }
		}], 'test');
		
		const query = await instance.query({
			query: { selector: {}, sort: [{ id: 'asc' }], skip: 0 },
			queryPlan: { index: [], startKeys: [], endKeys: [], inclusiveStart: true, inclusiveEnd: true, sortSatisfiedByIndex: false, selectorSatisfiedByIndex: false }
		});
		
		expect(query.documents).toHaveLength(1);
		
		await instance.close();
	});

	test('in-memory database skips mmap and works', async () => {
		const storage = getRxStorageBunSQLite();
		const instance = await storage.createStorageInstance({
			databaseInstanceToken: 'test-memory-pragma',
			databaseName: 'test-memory-pragma',
			collectionName: 'users',
			schema: {
				version: 0,
				primaryKey: 'id',
				type: 'object',
				properties: {
					id: { type: 'string', maxLength: 100 },
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

		const db = instance.internals.db;
		const result = db.query('PRAGMA mmap_size').get() as { mmap_size: number } | null;
		
		console.log(`  mmap_size (in-memory): ${result?.mmap_size ?? 'null'}`);
		
		await instance.bulkWrite([{
			document: { id: 'test1', _deleted: false, _attachments: {}, _rev: '1-abc', _meta: { lwt: Date.now() } }
		}], 'test');
		
		const query = await instance.query({
			query: { selector: {}, sort: [{ id: 'asc' }], skip: 0 },
			queryPlan: { index: [], startKeys: [], endKeys: [], inclusiveStart: true, inclusiveEnd: true, sortSatisfiedByIndex: false, selectorSatisfiedByIndex: false }
		});
		
		expect(query.documents).toHaveLength(1);
		
		await instance.close();
	});
});
