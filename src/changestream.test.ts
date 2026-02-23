import { describe, test, expect, afterEach } from 'bun:test';
import { getRxStorageBunSQLite } from './index';
import type { RxStorageInstance, EventBulk, RxStorageChangeEvent, RxDocumentData, RxStorageDefaultCheckpoint } from 'rxdb';

interface TestDoc {
	id: string;
	name: string;
}

describe('Storage Instance ChangeStream', () => {
	const instances: RxStorageInstance<TestDoc, unknown, unknown>[] = [];

	afterEach(async () => {
		for (const instance of instances) {
			await instance.close();
		}
		instances.length = 0;
	});

	test('bulkWrite emits to changeStream', async () => {
		const storage = getRxStorageBunSQLite();
		const instance = await storage.createStorageInstance<TestDoc>({
			databaseName: 'testdb',
			collectionName: 'users',
			databaseInstanceToken: 'test-token',
			schema: {
				version: 0,
				primaryKey: 'id',
				type: 'object',
				properties: {
					id: { type: 'string', maxLength: 100 },
					name: { type: 'string' },
					_deleted: { type: 'boolean' },
					_attachments: { type: 'object' },
					_rev: { type: 'string' },
					_meta: { type: 'object' }
				},
				required: ['id', 'name']
			},
			options: {},
			devMode: false,
			multiInstance: false
		});
		instances.push(instance);

		const events: EventBulk<RxStorageChangeEvent<TestDoc>, unknown>[] = [];
		instance.changeStream().subscribe(ev => events.push(ev));

		const doc: RxDocumentData<TestDoc> = {
			id: 'user1',
			name: 'Alice',
			_deleted: false,
			_attachments: {},
			_meta: { lwt: Date.now() },
			_rev: '1-abc'
		};

		await instance.bulkWrite([{ document: doc }], 'test-context');

		expect(events.length).toBe(1);
		expect(events[0].events.length).toBe(1);
		expect(events[0].events[0].operation).toBe('INSERT');
		expect(events[0].events[0].documentId).toBe('user1');
		expect(events[0].events[0].documentData.name).toBe('Alice');
	});

	test('bulkWrite with multiple documents emits all events', async () => {
		const storage = getRxStorageBunSQLite();
		const instance = await storage.createStorageInstance<TestDoc>({
			databaseName: 'testdb',
			collectionName: 'users',
			databaseInstanceToken: 'test-token',
			schema: {
				version: 0,
				primaryKey: 'id',
				type: 'object',
				properties: {
					id: { type: 'string', maxLength: 100 },
					name: { type: 'string' },
					_deleted: { type: 'boolean' },
					_attachments: { type: 'object' },
					_rev: { type: 'string' },
					_meta: { type: 'object' }
				},
				required: ['id', 'name']
			},
			options: {},
			devMode: false,
			multiInstance: false
		});
		instances.push(instance);

		const events: EventBulk<RxStorageChangeEvent<TestDoc>, unknown>[] = [];
		instance.changeStream().subscribe(ev => events.push(ev));

		const docs: RxDocumentData<TestDoc>[] = [
			{
				id: 'user1',
				name: 'Alice',
				_deleted: false,
				_attachments: {},
				_meta: { lwt: Date.now() },
				_rev: '1-abc'
			},
			{
				id: 'user2',
				name: 'Bob',
				_deleted: false,
				_attachments: {},
				_meta: { lwt: Date.now() + 1 },
				_rev: '1-def'
			}
		];

		await instance.bulkWrite(
			docs.map(document => ({ document })),
			'test-context'
		);

		expect(events.length).toBe(1);
		expect(events[0].events.length).toBe(2);
		expect(events[0].events[0].operation).toBe('INSERT');
		expect(events[0].events[1].operation).toBe('INSERT');
		expect(events[0].events[0].documentId).toBe('user1');
		expect(events[0].events[1].documentId).toBe('user2');
	});

	test('UPDATE operation emits to changeStream', async () => {
		const storage = getRxStorageBunSQLite();
		const instance = await storage.createStorageInstance<TestDoc>({
			databaseName: 'testdb',
			collectionName: 'users',
			databaseInstanceToken: 'test-token',
			schema: {
				version: 0,
				primaryKey: 'id',
				type: 'object',
				properties: {
					id: { type: 'string', maxLength: 100 },
					name: { type: 'string' },
					_deleted: { type: 'boolean' },
					_attachments: { type: 'object' },
					_rev: { type: 'string' },
					_meta: { type: 'object' }
				},
				required: ['id', 'name']
			},
			options: {},
			devMode: false,
			multiInstance: false
		});
		instances.push(instance);

		const doc: RxDocumentData<TestDoc> = {
			id: 'user1',
			name: 'Alice',
			_deleted: false,
			_attachments: {},
			_meta: { lwt: Date.now() },
			_rev: '1-abc'
		};

		await instance.bulkWrite([{ document: doc }], 'test-context');

		const events: EventBulk<RxStorageChangeEvent<TestDoc>, unknown>[] = [];
		instance.changeStream().subscribe(ev => events.push(ev));

		const updatedDoc: RxDocumentData<TestDoc> = {
			...doc,
			name: 'Alice Updated',
			_meta: { lwt: Date.now() + 1 },
			_rev: '2-def'
		};

		await instance.bulkWrite([{ document: updatedDoc, previous: doc }], 'test-context');

		expect(events.length).toBe(1);
		expect(events[0].events[0].operation).toBe('UPDATE');
		expect(events[0].events[0].documentData.name).toBe('Alice Updated');
		expect(events[0].events[0].previousDocumentData?.name).toBe('Alice');
	});
});
