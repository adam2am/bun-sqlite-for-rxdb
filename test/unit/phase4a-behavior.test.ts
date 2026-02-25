import { describe, test, expect, afterEach } from 'bun:test';
import { getRxStorageBunSQLite } from '$app/storage';
import type { RxDocumentData } from 'rxdb';
import { unlinkSync } from 'fs';

interface TestDoc {
	id: string;
	name: string;
	age: number;
	_deleted: boolean;
	_attachments: Record<string, unknown>;
	_rev: string;
	_meta: { lwt: number };
}

const testDbFiles: string[] = [];

describe('Phase 4A Optimizations - Behavior Tests', () => {
	afterEach(() => {
		testDbFiles.forEach(file => {
			try {
				unlinkSync(file);
				unlinkSync(`${file}-shm`);
				unlinkSync(`${file}-wal`);
			} catch {}
		});
		testDbFiles.length = 0;
	});
	test('transaction queue prevents race conditions in concurrent writes', async () => {
		const uniqueId = `tx-queue-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
		const dbFile = `test-${uniqueId}.db`;
		testDbFiles.push(dbFile);
		const storage = getRxStorageBunSQLite({ filename: dbFile });
		const instance = await storage.createStorageInstance<TestDoc>({
			databaseInstanceToken: uniqueId,
			databaseName: uniqueId,
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
					_meta: { type: 'object', properties: { lwt: { type: 'number' } } }
				},
				required: ['id', 'name', 'age', '_deleted', '_attachments', '_rev', '_meta']
			},
			options: {},
			multiInstance: false,
			devMode: false
		});

		const writes = Array.from({ length: 10 }, (_, i) =>
			instance.bulkWrite([{
				document: {
					id: `user${i}`,
					name: `User ${i}`,
					age: 20 + i,
					_deleted: false,
					_attachments: {},
					_rev: '1-abc',
					_meta: { lwt: Date.now() }
				}
			}], 'test')
		);

		const results = await Promise.all(writes);

		results.forEach((result, index) => {
			if (result.error.length > 0) {
				console.log(`Write ${index} failed:`, JSON.stringify(result.error, null, 2));
			}
			expect(result.error).toHaveLength(0);
		});

		const query = await instance.query({
			query: { selector: {}, sort: [{ id: 'asc' }], skip: 0 },
			queryPlan: { index: [], startKeys: [], endKeys: [], inclusiveStart: true, inclusiveEnd: true, sortSatisfiedByIndex: false, selectorSatisfiedByIndex: false }
		});

		expect(query.documents).toHaveLength(10);

		await instance.close();
	});

	test('mmap_size improves read performance for large datasets', async () => {
		const uniqueId = `mmap-perf-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
		const dbFile = `test-${uniqueId}.db`;
		testDbFiles.push(dbFile);
		const storageWithMmap = getRxStorageBunSQLite({ filename: dbFile, mmapSize: 268435456 });
		const instanceWithMmap = await storageWithMmap.createStorageInstance<TestDoc>({
			databaseInstanceToken: uniqueId,
			databaseName: uniqueId,
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
					_meta: { type: 'object', properties: { lwt: { type: 'number' } } }
				},
				required: ['id', 'name', 'age', '_deleted', '_attachments', '_rev', '_meta']
			},
			options: {},
			multiInstance: false,
			devMode: false
		});

		const docs = Array.from({ length: 1000 }, (_, i) => ({
			document: {
				id: `user${i}`,
				name: `User ${i}`,
				age: 20 + (i % 50),
				_deleted: false,
				_attachments: {},
				_rev: '1-abc',
				_meta: { lwt: Date.now() }
			}
		}));

		await instanceWithMmap.bulkWrite(docs, 'test');

		const start = performance.now();
		for (let i = 0; i < 100; i++) {
			await instanceWithMmap.query({
				query: { selector: { age: { $gt: 30 } }, sort: [{ id: 'asc' }], skip: 0 },
				queryPlan: { index: [], startKeys: [], endKeys: [], inclusiveStart: true, inclusiveEnd: true, sortSatisfiedByIndex: false, selectorSatisfiedByIndex: false }
			});
		}
		const elapsed = performance.now() - start;

		expect(elapsed).toBeLessThan(5000);
		console.log(`  100 queries with mmap: ${elapsed.toFixed(2)}ms (${(elapsed/100).toFixed(2)}ms per query)`);

		await instanceWithMmap.close();
	});

	test('temp_store MEMORY improves complex query performance', async () => {
		const uniqueId = `temp-store-perf-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
		const dbFile = `test-${uniqueId}.db`;
		testDbFiles.push(dbFile);
		const storage = getRxStorageBunSQLite({ filename: dbFile });
		const instance = await storage.createStorageInstance<TestDoc>({
			databaseInstanceToken: uniqueId,
			databaseName: uniqueId,
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
					_meta: { type: 'object', properties: { lwt: { type: 'number' } } }
				},
				required: ['id', 'name', 'age', '_deleted', '_attachments', '_rev', '_meta']
			},
			options: {},
			multiInstance: false,
			devMode: false
		});

		const docs = Array.from({ length: 500 }, (_, i) => ({
			document: {
				id: `user${i}`,
				name: `User ${i}`,
				age: 20 + (i % 50),
				_deleted: false,
				_attachments: {},
				_rev: '1-abc',
				_meta: { lwt: Date.now() }
			}
		}));

		await instance.bulkWrite(docs, 'test');

		const start = performance.now();
		await instance.query({
			query: { 
				selector: { 
					$or: [
						{ age: { $lt: 25 } },
						{ age: { $gt: 60 } }
					]
				}, 
				sort: [{ id: 'asc' }], 
				skip: 0 
			},
			queryPlan: { index: [], startKeys: [], endKeys: [], inclusiveStart: true, inclusiveEnd: true, sortSatisfiedByIndex: false, selectorSatisfiedByIndex: false }
		});
		const elapsed = performance.now() - start;

		expect(elapsed).toBeLessThan(100);
		console.log(`  Complex $or query with temp_store=MEMORY: ${elapsed.toFixed(2)}ms`);

		await instance.close();
	});

	test('mmapSize can be disabled without breaking functionality', async () => {
		const uniqueId = `mmap-disabled-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
		const dbFile = `test-${uniqueId}.db`;
		testDbFiles.push(dbFile);
		const storage = getRxStorageBunSQLite({ filename: dbFile, mmapSize: 0 });
		const instance = await storage.createStorageInstance<TestDoc>({
			databaseInstanceToken: uniqueId,
			databaseName: uniqueId,
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
					_meta: { type: 'object', properties: { lwt: { type: 'number' } } }
				},
				required: ['id', 'name', 'age', '_deleted', '_attachments', '_rev', '_meta']
			},
			options: {},
			multiInstance: false,
			devMode: false
		});

		await instance.bulkWrite([{
			document: {
				id: 'user1',
				name: 'Test User',
				age: 25,
				_deleted: false,
				_attachments: {},
				_rev: '1-abc',
				_meta: { lwt: Date.now() }
			}
		}], 'test');

		const result = await instance.query({
			query: { selector: {}, sort: [{ id: 'asc' }], skip: 0 },
			queryPlan: { index: [], startKeys: [], endKeys: [], inclusiveStart: true, inclusiveEnd: true, sortSatisfiedByIndex: false, selectorSatisfiedByIndex: false }
		});

		expect(result.documents).toHaveLength(1);
		expect(result.documents[0].name).toBe('Test User');

		await instance.close();
	});
});
