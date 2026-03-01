import { describe, expect, test } from 'bun:test';
import { getRxStorageBunSQLite } from '$app/storage';
import type { RxDocumentData, RxJsonSchema } from 'rxdb';

interface TestDoc {
	id: string;
	name: string;
	age: number;
	_deleted: boolean;
	_attachments: {};
	_rev: string;
	_meta: { lwt: number };
}

const testSchema: RxJsonSchema<RxDocumentData<TestDoc>> = {
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
			},
			required: ['lwt']
		}
	},
	required: ['id', '_deleted', '_rev', '_meta']
};

describe('findDocumentsById - withDeleted semantics', () => {
	test('withDeleted=false returns ONLY non-deleted docs', async () => {
		const storage = getRxStorageBunSQLite();
		const instance = await storage.createStorageInstance({
			databaseName: 'test-db',
			collectionName: 'test-collection',
			schema: testSchema,
			options: {},
			multiInstance: false,
			devMode: false,
			databaseInstanceToken: 'test-token'
		});

		const docs: RxDocumentData<TestDoc>[] = [
			{ id: 'doc1', name: 'Active', age: 25, _deleted: false, _attachments: {}, _rev: '1-a', _meta: { lwt: Date.now() } },
			{ id: 'doc2', name: 'Deleted', age: 30, _deleted: true, _attachments: {}, _rev: '1-b', _meta: { lwt: Date.now() } },
			{ id: 'doc3', name: 'Active2', age: 35, _deleted: false, _attachments: {}, _rev: '1-c', _meta: { lwt: Date.now() } }
		];

		await instance.bulkWrite(docs.map(doc => ({ document: doc })), 'test');

		const result = await instance.findDocumentsById(['doc1', 'doc2', 'doc3'], false);

		expect(result.length).toBe(2);
		expect(result.map(d => d.id).sort()).toEqual(['doc1', 'doc3']);
		expect(result.every(d => d._deleted === false)).toBe(true);

		await instance.remove();
	});

	test('withDeleted=true returns ALL docs (deleted + non-deleted)', async () => {
		const storage = getRxStorageBunSQLite();
		const instance = await storage.createStorageInstance({
			databaseName: 'test-db',
			collectionName: 'test-collection',
			schema: testSchema,
			options: {},
			multiInstance: false,
			devMode: false,
			databaseInstanceToken: 'test-token'
		});

		const docs: RxDocumentData<TestDoc>[] = [
			{ id: 'doc1', name: 'Active', age: 25, _deleted: false, _attachments: {}, _rev: '1-a', _meta: { lwt: Date.now() } },
			{ id: 'doc2', name: 'Deleted', age: 30, _deleted: true, _attachments: {}, _rev: '1-b', _meta: { lwt: Date.now() } },
			{ id: 'doc3', name: 'Active2', age: 35, _deleted: false, _attachments: {}, _rev: '1-c', _meta: { lwt: Date.now() } }
		];

		await instance.bulkWrite(docs.map(doc => ({ document: doc })), 'test');

		const result = await instance.findDocumentsById(['doc1', 'doc2', 'doc3'], true);

		expect(result.length).toBe(3);
		expect(result.map(d => d.id).sort()).toEqual(['doc1', 'doc2', 'doc3']);
		expect(result.filter(d => d._deleted).length).toBe(1);
		expect(result.filter(d => !d._deleted).length).toBe(2);

		await instance.remove();
	});

	test('withDeleted=false with only deleted docs returns empty array', async () => {
		const storage = getRxStorageBunSQLite();
		const instance = await storage.createStorageInstance({
			databaseName: 'test-db',
			collectionName: 'test-collection',
			schema: testSchema,
			options: {},
			multiInstance: false,
			devMode: false,
			databaseInstanceToken: 'test-token'
		});

		const docs: RxDocumentData<TestDoc>[] = [
			{ id: 'doc1', name: 'Deleted1', age: 25, _deleted: true, _attachments: {}, _rev: '1-a', _meta: { lwt: Date.now() } },
			{ id: 'doc2', name: 'Deleted2', age: 30, _deleted: true, _attachments: {}, _rev: '1-b', _meta: { lwt: Date.now() } }
		];

		await instance.bulkWrite(docs.map(doc => ({ document: doc })), 'test');

		const result = await instance.findDocumentsById(['doc1', 'doc2'], false);

		expect(result.length).toBe(0);

		await instance.remove();
	});

	test('bulkWrite handles 40k docs without hitting SQLite parameter limit (exceeds 32,766)', async () => {
		const storage = getRxStorageBunSQLite();
		const instance = await storage.createStorageInstance({
			databaseName: 'test-db-40k',
			collectionName: 'test-collection-40k',
			schema: testSchema,
			options: {},
			multiInstance: false,
			devMode: false,
			databaseInstanceToken: 'test-token-40k'
		});

		const docCount = 40000;
		const docs: RxDocumentData<TestDoc>[] = [];
		for (let i = 0; i < docCount; i++) {
			docs.push({
				id: `doc${i}`,
				name: `User${i}`,
				age: 20 + (i % 50),
				_deleted: false,
				_attachments: {},
				_rev: '1-a',
				_meta: { lwt: Date.now() }
			});
		}

		const result = await instance.bulkWrite(docs.map(doc => ({ document: doc })), 'test');

		expect(result.error.length).toBe(0);

		const retrieved = await instance.findDocumentsById(docs.map(d => d.id), false);
		expect(retrieved.length).toBe(docCount);

		await instance.remove();
	});
});
