import { describe, it, expect } from 'bun:test';
import { BunSQLiteStorageInstance } from '$app/instance';
import { getCacheSize } from '$app/query/builder';
import type { RxJsonSchema, RxDocumentData } from 'rxdb';

interface TestDoc {
	id: string;
	age: number;
}

const schema: RxJsonSchema<RxDocumentData<TestDoc>> = {
	version: 0,
	primaryKey: 'id',
	type: 'object',
	properties: {
		id: { type: 'string' },
		age: { type: 'number' },
		_deleted: { type: 'boolean' },
		_attachments: { type: 'object' },
		_rev: { type: 'string' },
		_meta: { type: 'object', properties: { lwt: { type: 'number' } } }
	},
	required: ['id', '_deleted', '_attachments', '_rev', '_meta']
};

describe('Cache Pollution Prevention (TDD)', () => {
	it('cache should be isolated between storage instances', async () => {
		const instance1 = new BunSQLiteStorageInstance({
			databaseName: 'test-db-1',
			collectionName: 'users',
			databaseInstanceToken: 'test-token-1',
			schema,
			options: {},
			devMode: false,
			multiInstance: false
		});

		const instance2 = new BunSQLiteStorageInstance({
			databaseName: 'test-db-2',
			collectionName: 'users',
			databaseInstanceToken: 'test-token-2',
			schema,
			options: {},
			devMode: false,
			multiInstance: false
		});

		expect(instance1.getCacheSize()).toBe(0);
		expect(instance2.getCacheSize()).toBe(0);

		await instance1.query({
			query: {
				selector: { age: { $gt: 20 } },
				sort: [],
				skip: 0
			},
			queryPlan: { index: [], startKeys: [], endKeys: [], inclusiveStart: true, inclusiveEnd: true, sortSatisfiedByIndex: false, selectorSatisfiedByIndex: false }
		});

		expect(instance1.getCacheSize()).toBe(1);
		expect(instance2.getCacheSize()).toBe(0);

		await instance2.query({
			query: {
				selector: { age: { $gt: 20 } },
				sort: [],
				skip: 0
			},
			queryPlan: { index: [], startKeys: [], endKeys: [], inclusiveStart: true, inclusiveEnd: true, sortSatisfiedByIndex: false, selectorSatisfiedByIndex: false }
		});

		expect(instance1.getCacheSize()).toBe(1);
		expect(instance2.getCacheSize()).toBe(1);
		
		await instance1.close();
		await instance2.close();
	});

	it('cache should persist after instance is closed (per-database cache)', async () => {
		const instance = new BunSQLiteStorageInstance({
			databaseName: 'test-db',
			collectionName: 'users',
			databaseInstanceToken: 'test-token',
			schema,
			options: {},
			devMode: false,
			multiInstance: false
		});

		expect(instance.getCacheSize()).toBe(0);

		await instance.query({
			query: {
				selector: { age: { $gt: 20 } },
				sort: [],
				skip: 0
			},
			queryPlan: { index: [], startKeys: [], endKeys: [], inclusiveStart: true, inclusiveEnd: true, sortSatisfiedByIndex: false, selectorSatisfiedByIndex: false }
		});

		expect(instance.getCacheSize()).toBe(1);

		await instance.close();

		expect(instance.getCacheSize()).toBe(1);
	});

	it('multiple instances on different databases have isolated caches', async () => {
		const instance1 = new BunSQLiteStorageInstance({
			databaseName: 'db1',
			collectionName: 'collection1',
			databaseInstanceToken: 'token-1',
			schema,
			options: {},
			devMode: false,
			multiInstance: false
		});

		const instance2 = new BunSQLiteStorageInstance({
			databaseName: 'db2',
			collectionName: 'collection2',
			databaseInstanceToken: 'token-2',
			schema: {
				...schema,
				version: 1
			},
			options: {},
			devMode: false,
			multiInstance: false
		});

		const query = {
			query: {
				selector: { age: { $gt: 20 } },
				sort: [],
				skip: 0
			},
			queryPlan: { index: [], startKeys: [], endKeys: [], inclusiveStart: true, inclusiveEnd: true, sortSatisfiedByIndex: false, selectorSatisfiedByIndex: false }
		};

		await instance1.query(query);
		await instance2.query(query);

		expect(instance1.getCacheSize()).toBe(1);
		expect(instance2.getCacheSize()).toBe(1);

		await instance1.close();

		expect(instance1.getCacheSize()).toBe(1);
		expect(instance2.getCacheSize()).toBe(1);

		await instance2.close();

		expect(instance2.getCacheSize()).toBe(1);
	});
});

describe('Cache Cleanup Verification', () => {
	it('clearCache() should clear global cache (backwards compatibility)', () => {
		const { clearCache, getCacheSize } = require('$app/query/builder');
		
		clearCache();
		expect(getCacheSize()).toBe(0);
	});
});

describe('Cache Architecture - Extreme Edge Cases', () => {
	it('STRESS: 100 concurrent instances with per-database caches', async () => {
		const instances = await Promise.all(
			Array.from({ length: 100 }, (_, i) => 
				Promise.resolve(new BunSQLiteStorageInstance({
					databaseName: `stress-db-${i}`,
					collectionName: `collection-${i}`,
					databaseInstanceToken: `token-${i}`,
					schema,
					options: {},
					devMode: false,
					multiInstance: false
				}))
			)
		);

		await Promise.all(instances.map((instance, i) => 
			instance.query({
				query: {
					selector: { age: { $gt: i } },
					sort: [],
					skip: 0
				},
				queryPlan: { index: [], startKeys: [], endKeys: [], inclusiveStart: true, inclusiveEnd: true, sortSatisfiedByIndex: false, selectorSatisfiedByIndex: false }
			})
		));

		instances.forEach(instance => {
			expect(instance.getCacheSize()).toBe(1);
		});

		await Promise.all(instances.map(i => i.close()));

		instances.forEach(instance => {
			expect(instance.getCacheSize()).toBe(1);
		});
	});

	it('EDGE: Cache survives multiple queries and persists after close', async () => {
		const instance = new BunSQLiteStorageInstance({
			databaseName: 'multi-query-db',
			collectionName: 'users',
			databaseInstanceToken: 'multi-token',
			schema,
			options: {},
			devMode: false,
			multiInstance: false
		});

		for (let i = 0; i < 50; i++) {
			await instance.query({
				query: {
					selector: { age: { $gt: i } },
					sort: [],
					skip: 0
				},
				queryPlan: { index: [], startKeys: [], endKeys: [], inclusiveStart: true, inclusiveEnd: true, sortSatisfiedByIndex: false, selectorSatisfiedByIndex: false }
			});
		}

		expect(instance.getCacheSize()).toBe(50);

		for (let i = 0; i < 50; i++) {
			await instance.query({
				query: {
					selector: { age: { $gt: i } },
					sort: [],
					skip: 0
				},
				queryPlan: { index: [], startKeys: [], endKeys: [], inclusiveStart: true, inclusiveEnd: true, sortSatisfiedByIndex: false, selectorSatisfiedByIndex: false }
			});
		}

		expect(instance.getCacheSize()).toBe(50);

		await instance.close();
		expect(instance.getCacheSize()).toBe(50);
	});

	it('EDGE: Cache persists through rapid open/close cycles', async () => {
		for (let cycle = 0; cycle < 10; cycle++) {
			const instance = new BunSQLiteStorageInstance({
				databaseName: `cycle-db-${cycle}`,
				collectionName: 'users',
				databaseInstanceToken: `cycle-token-${cycle}`,
				schema,
				options: {},
				devMode: false,
				multiInstance: false
			});

			await instance.query({
				query: {
					selector: { age: { $gt: 20 } },
					sort: [],
					skip: 0
				},
				queryPlan: { index: [], startKeys: [], endKeys: [], inclusiveStart: true, inclusiveEnd: true, sortSatisfiedByIndex: false, selectorSatisfiedByIndex: false }
			});

			expect(instance.getCacheSize()).toBe(1);
			await instance.close();
			expect(instance.getCacheSize()).toBe(1);
		}
	});

	it('EDGE: Different schemas with same selector produce different cache entries', async () => {
		const schema1 = { ...schema, version: 0 };
		const schema2 = { ...schema, version: 1 };

		const instance1 = new BunSQLiteStorageInstance({
			databaseName: 'schema-test-1',
			collectionName: 'users',
			databaseInstanceToken: 'schema-token-1',
			schema: schema1,
			options: {},
			devMode: false,
			multiInstance: false
		});

		const instance2 = new BunSQLiteStorageInstance({
			databaseName: 'schema-test-2',
			collectionName: 'users',
			databaseInstanceToken: 'schema-token-2',
			schema: schema2,
			options: {},
			devMode: false,
			multiInstance: false
		});

		const query = {
			query: {
				selector: { age: { $gt: 20 } },
				sort: [],
				skip: 0
			},
			queryPlan: { index: [], startKeys: [], endKeys: [], inclusiveStart: true, inclusiveEnd: true, sortSatisfiedByIndex: false, selectorSatisfiedByIndex: false }
		};

		await instance1.query(query);
		await instance2.query(query);

		expect(instance1.getCacheSize()).toBe(1);
		expect(instance2.getCacheSize()).toBe(1);

		await instance1.close();
		await instance2.close();
	});

	it('EDGE: Cache respects MAX_CACHE_SIZE limit per database', async () => {
		const instance = new BunSQLiteStorageInstance({
			databaseName: 'limit-test-db',
			collectionName: 'users',
			databaseInstanceToken: 'limit-token',
			schema,
			options: {},
			devMode: false,
			multiInstance: false
		});

		for (let i = 0; i < 1500; i++) {
			await instance.query({
				query: {
					selector: { age: { $eq: i } },
					sort: [],
					skip: 0
				},
				queryPlan: { index: [], startKeys: [], endKeys: [], inclusiveStart: true, inclusiveEnd: true, sortSatisfiedByIndex: false, selectorSatisfiedByIndex: false }
			});
		}

		expect(instance.getCacheSize()).toBe(1500);

		await instance.close();
		expect(instance.getCacheSize()).toBe(1500);
	});

	it('BUG: Closing one instance should NOT clear cache for other instances on SAME database', async () => {
		const instance1 = new BunSQLiteStorageInstance({
			databaseName: 'shared-db',
			collectionName: 'users',
			databaseInstanceToken: 'token-1',
			schema,
			options: {},
			devMode: false,
			multiInstance: false
		});

		const instance2 = new BunSQLiteStorageInstance({
			databaseName: 'shared-db',
			collectionName: 'posts',
			databaseInstanceToken: 'token-2',
			schema,
			options: {},
			devMode: false,
			multiInstance: false
		});

		await instance1.query({
			query: {
				selector: { age: { $gt: 20 } },
				sort: [],
				skip: 0
			},
			queryPlan: { index: [], startKeys: [], endKeys: [], inclusiveStart: true, inclusiveEnd: true, sortSatisfiedByIndex: false, selectorSatisfiedByIndex: false }
		});

		await instance2.query({
			query: {
				selector: { age: { $lt: 50 } },
				sort: [],
				skip: 0
			},
			queryPlan: { index: [], startKeys: [], endKeys: [], inclusiveStart: true, inclusiveEnd: true, sortSatisfiedByIndex: false, selectorSatisfiedByIndex: false }
		});

		expect(instance1.getCacheSize()).toBe(2);
		expect(instance2.getCacheSize()).toBe(2);

		await instance1.close();

		expect(instance2.getCacheSize()).toBe(2);

		await instance2.close();
	});
});
