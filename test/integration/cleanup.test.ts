import { describe, test, expect, afterEach } from 'bun:test';
import { BunSQLiteStorageInstance } from '$app/instance';
import type { RxStorageInstanceCreationParams } from 'rxdb';

describe('cleanup() - TDD Red Phase', () => {
	const instances: BunSQLiteStorageInstance<any>[] = [];

	afterEach(async () => {
		for (const instance of instances) {
			await instance.close();
		}
		instances.length = 0;
	});

	test('cleanup() should return false when documents are deleted', async () => {
		const instance = new BunSQLiteStorageInstance({
			databaseName: 'testdb',
			collectionName: 'users',
			databaseInstanceToken: 'test',
			schema: {
				version: 0,
				primaryKey: 'id',
				type: 'object',
				properties: { id: { type: 'string' } }
			},
			options: {},
			devMode: false,
			multiInstance: false,
			internals: {}
		} as RxStorageInstanceCreationParams<any, any>);
		instances.push(instance);

		const doc = {
			id: 'doc1',
			_deleted: false,
			_attachments: {},
			_meta: { lwt: Date.now() },
			_rev: '1-abc'
		};

		await instance.bulkWrite([{ document: doc }], 'test');

		const deletedDoc = { ...doc, _deleted: true, _rev: '2-def', _meta: { lwt: Date.now() } };
		await instance.bulkWrite([{ previous: doc, document: deletedDoc }], 'test');

		const result = await instance.cleanup(Date.now() + 1000);
		
		expect(result).toBe(false);
	});

	test('cleanup() should return true when no documents to clean', async () => {
		const instance = new BunSQLiteStorageInstance({
			databaseName: 'testdb',
			collectionName: 'users',
			databaseInstanceToken: 'test',
			schema: {
				version: 0,
				primaryKey: 'id',
				type: 'object',
				properties: { id: { type: 'string' } }
			},
			options: {},
			devMode: false,
			multiInstance: false,
			internals: {}
		} as RxStorageInstanceCreationParams<any, any>);
		instances.push(instance);

		const result = await instance.cleanup(0);
		
		expect(result).toBe(true);
	});

	test('cleanup() should actually remove deleted documents', async () => {
		const instance = new BunSQLiteStorageInstance({
			databaseName: 'testdb',
			collectionName: 'users',
			databaseInstanceToken: 'test',
			schema: {
				version: 0,
				primaryKey: 'id',
				type: 'object',
				properties: { id: { type: 'string' } }
			},
			options: {},
			devMode: false,
			multiInstance: false,
			internals: {}
		} as RxStorageInstanceCreationParams<any, any>);
		instances.push(instance);

		const doc = {
			id: 'doc1',
			_deleted: false,
			_attachments: {},
			_meta: { lwt: Date.now() },
			_rev: '1-abc'
		};

		await instance.bulkWrite([{ document: doc }], 'test');

		const deletedDoc = { ...doc, _deleted: true, _rev: '2-def', _meta: { lwt: Date.now() } };
		await instance.bulkWrite([{ previous: doc, document: deletedDoc }], 'test');

		await instance.cleanup(Date.now() + 1000);

		const found = await instance.findDocumentsById(['doc1'], true);
		expect(found.length).toBe(0);
	});
});
