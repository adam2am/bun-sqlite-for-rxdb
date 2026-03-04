import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { getRxStorageBunSQLite } from '../../src/storage';
import type { RxJsonSchema, RxDocumentData, RxStorageInstance } from 'rxdb';

interface TestDoc {
	id: string;
	status: string;
	metadata: { score: number };
	_deleted: boolean;
	_attachments: {};
	_rev: string;
	_meta: { lwt: number };
}

const schema: RxJsonSchema<RxDocumentData<TestDoc>> = {
	version: 0,
	primaryKey: 'id',
	type: 'object',
	properties: {
		id: { type: 'string', maxLength: 100 },
		status: { type: 'string' },
		metadata: { type: 'object' },
		_deleted: { type: 'boolean' },
		_attachments: { type: 'object' },
		_rev: { type: 'string' },
		_meta: { type: 'object', properties: { lwt: { type: 'number' } }, required: ['lwt'] }
	},
	required: ['id', 'status', 'metadata', '_deleted', '_attachments', '_rev', '_meta']
};

describe('Top-K Heap OOM Fix', () => {
	let instance: RxStorageInstance<TestDoc, any, any>;

	beforeAll(async () => {
		const storage = getRxStorageBunSQLite({ filename: ':memory:' });
		instance = await storage.createStorageInstance({
			databaseInstanceToken: 'oom-fix-test',
			databaseName: 'testdb',
			collectionName: 'test',
			schema,
			options: {},
			multiInstance: false,
			devMode: false
		});

		const docs: RxDocumentData<TestDoc>[] = [];
		for (let i = 0; i < 10000; i++) {
			docs.push({
				id: `doc-${i}`,
				status: 'active',
				metadata: { score: 20 + (i % 50) },
				_deleted: false,
				_attachments: {},
				_rev: '1-a',
				_meta: { lwt: 1000 + i }
			});
		}

		await instance.bulkWrite(docs.map(doc => ({ document: doc })), 'test');
	});

	afterAll(async () => {
		await instance.remove();
	});

	it('should only keep top K documents in memory when JS sorting is required', async () => {
		const result = await instance.query({
			query: {
				selector: { status: { $regex: '^act' } } as any,
				sort: [{ metadata: 'asc' }],
				skip: 0,
				limit: 10
			},
			queryPlan: {
				index: ['id'],
				sortSatisfiedByIndex: false,
				selectorSatisfiedByIndex: false,
				startKeys: [],
				endKeys: [],
				inclusiveStart: true,
				inclusiveEnd: true
			}
		});

		expect(result.documents.length).toBe(10);
	});

	it('should handle skip + limit correctly with Top-K heap', async () => {
		const result = await instance.query({
			query: {
				selector: { status: { $regex: '^act' } } as any,
				sort: [{ metadata: 'asc' }],
				skip: 5,
				limit: 10
			},
			queryPlan: {
				index: ['id'],
				sortSatisfiedByIndex: false,
				selectorSatisfiedByIndex: false,
				startKeys: [],
				endKeys: [],
				inclusiveStart: true,
				inclusiveEnd: true
			}
		});

		expect(result.documents.length).toBe(10);
	});
});
