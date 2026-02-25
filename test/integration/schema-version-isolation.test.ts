import { describe, test, expect, afterEach } from 'bun:test';
import { BunSQLiteStorageInstance } from './instance';
import type { RxStorageInstanceCreationParams } from 'rxdb';

describe('Schema Version Isolation', () => {
	const instances: BunSQLiteStorageInstance<any>[] = [];

	afterEach(async () => {
		for (const instance of instances) {
			await instance.close();
		}
		instances.length = 0;
	});

	test('different schema versions should use different tables', async () => {
		const baseParams = {
			databaseName: 'testdb',
			collectionName: 'users',
			databaseInstanceToken: 'test',
			options: {},
			devMode: false,
			multiInstance: false
		};

		const instanceV0 = new BunSQLiteStorageInstance({
			...baseParams,
			schema: {
				version: 0,
				primaryKey: 'id',
				type: 'object',
				properties: { id: { type: 'string' } }
			},
			internals: {}
		} as RxStorageInstanceCreationParams<any, any>);
		instances.push(instanceV0);

		const instanceV1 = new BunSQLiteStorageInstance({
			...baseParams,
			schema: {
				version: 1,
				primaryKey: 'id',
				type: 'object',
				properties: { id: { type: 'string' } }
			},
			internals: {}
		} as RxStorageInstanceCreationParams<any, any>);
		instances.push(instanceV1);

		const docV0 = {
			id: 'doc1',
			_deleted: false,
			_attachments: {},
			_meta: { lwt: Date.now() },
			_rev: '1-abc'
		};

		const docV1 = {
			id: 'doc2',
			_deleted: false,
			_attachments: {},
			_meta: { lwt: Date.now() },
			_rev: '1-def'
		};

		await instanceV0.bulkWrite([{ document: docV0 }], 'test');
		await instanceV1.bulkWrite([{ document: docV1 }], 'test');

		const docsV0 = await instanceV0.findDocumentsById(['doc1', 'doc2'], false);
		const docsV1 = await instanceV1.findDocumentsById(['doc1', 'doc2'], false);

		expect(docsV0.length).toBe(1);
		expect(docsV0[0].id).toBe('doc1');

		expect(docsV1.length).toBe(1);
		expect(docsV1[0].id).toBe('doc2');
	});

	test('same schema version should share table', async () => {
		const baseParams = {
			databaseName: 'testdb',
			collectionName: 'users',
			databaseInstanceToken: 'test',
			options: {},
			devMode: false,
			multiInstance: false
		};

		const instance1 = new BunSQLiteStorageInstance({
			...baseParams,
			schema: {
				version: 0,
				primaryKey: 'id',
				type: 'object',
				properties: { id: { type: 'string' } }
			},
			internals: {}
		} as RxStorageInstanceCreationParams<any, any>);
		instances.push(instance1);

		const instance2 = new BunSQLiteStorageInstance({
			...baseParams,
			schema: {
				version: 0,
				primaryKey: 'id',
				type: 'object',
				properties: { id: { type: 'string' } }
			},
			internals: {}
		} as RxStorageInstanceCreationParams<any, any>);
		instances.push(instance2);

		const doc = {
			id: 'doc1',
			_deleted: false,
			_attachments: {},
			_meta: { lwt: Date.now() },
			_rev: '1-abc'
		};

		await instance1.bulkWrite([{ document: doc }], 'test');

		const docs = await instance2.findDocumentsById(['doc1'], false);
		expect(docs.length).toBe(1);
		expect(docs[0].id).toBe('doc1');
	});
});
