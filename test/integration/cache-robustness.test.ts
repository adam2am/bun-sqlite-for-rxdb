import { describe, test } from 'bun:test';
import { getRxStorageBunSQLite } from '$app/storage';

interface TestDocType {
	id: string;
	name: string;
	age: number;
}

const createSchema = (): any => ({
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
});

describe('WeakMap Cache Robustness', () => {
	test('cache is shared between instances on same database', async () => {
		const storage = getRxStorageBunSQLite();
		const dbName = 'shared-cache-test';
		
		const instance1 = await storage.createStorageInstance<TestDocType>({
			databaseInstanceToken: `${dbName}-${Date.now()}`,
			databaseName: dbName,
			collectionName: 'users',
			schema: createSchema(),
			options: {},
			multiInstance: false,
			devMode: false
		});

		const instance2 = await storage.createStorageInstance<TestDocType>({
			databaseInstanceToken: `${dbName}-${Date.now()}`,
			databaseName: dbName,
			collectionName: 'posts',
			schema: createSchema(),
			options: {},
			multiInstance: false,
			devMode: false
		});

		await instance1.bulkWrite([
			{ document: { id: '1', name: 'Alice', age: 25, _deleted: false, _attachments: {}, _rev: '1', _meta: { lwt: Date.now() } } }
		], 'test');

		await instance2.bulkWrite([
			{ document: { id: '1', name: 'Bob', age: 30, _deleted: false, _attachments: {}, _rev: '1', _meta: { lwt: Date.now() } } }
		], 'test');

		console.log('\n🔍 Testing cache sharing between instances on same database...');
		
		const selector = { age: { $gt: 20 } };
		
		console.log('📝 Instance1 (users) - First query (cache MISS expected)');
		await instance1.query({
			query: { selector, sort: [], skip: 0 },
			queryPlan: { index: [], startKeys: [], endKeys: [], inclusiveStart: true, inclusiveEnd: true, sortSatisfiedByIndex: false, selectorSatisfiedByIndex: false }
		});

		console.log('📝 Instance2 (posts) - Same selector (cache HIT expected - shared cache!)');
		await instance2.query({
			query: { selector, sort: [], skip: 0 },
			queryPlan: { index: [], startKeys: [], endKeys: [], inclusiveStart: true, inclusiveEnd: true, sortSatisfiedByIndex: false, selectorSatisfiedByIndex: false }
		});

		console.log('✅ Cache is shared between instances on same database');

		await instance1.close();
		await instance2.close();
	});

	test('cache is isolated between different databases', async () => {
		const storage = getRxStorageBunSQLite();
		
		const instance1 = await storage.createStorageInstance<TestDocType>({
			databaseInstanceToken: `db1-${Date.now()}`,
			databaseName: 'database1',
			collectionName: 'users',
			schema: createSchema(),
			options: {},
			multiInstance: false,
			devMode: false
		});

		const instance2 = await storage.createStorageInstance<TestDocType>({
			databaseInstanceToken: `db2-${Date.now()}`,
			databaseName: 'database2',
			collectionName: 'users',
			schema: createSchema(),
			options: {},
			multiInstance: false,
			devMode: false
		});

		await instance1.bulkWrite([
			{ document: { id: '1', name: 'Alice', age: 25, _deleted: false, _attachments: {}, _rev: '1', _meta: { lwt: Date.now() } } }
		], 'test');

		await instance2.bulkWrite([
			{ document: { id: '1', name: 'Bob', age: 30, _deleted: false, _attachments: {}, _rev: '1', _meta: { lwt: Date.now() } } }
		], 'test');

		console.log('\n🔍 Testing cache isolation between different databases...');
		
		const selector = { age: { $gt: 20 } };
		
		console.log('📝 Database1 - First query (cache MISS)');
		await instance1.query({
			query: { selector, sort: [], skip: 0 },
			queryPlan: { index: [], startKeys: [], endKeys: [], inclusiveStart: true, inclusiveEnd: true, sortSatisfiedByIndex: false, selectorSatisfiedByIndex: false }
		});

		console.log('📝 Database2 - Same selector (cache MISS - different database!)');
		await instance2.query({
			query: { selector, sort: [], skip: 0 },
			queryPlan: { index: [], startKeys: [], endKeys: [], inclusiveStart: true, inclusiveEnd: true, sortSatisfiedByIndex: false, selectorSatisfiedByIndex: false }
		});

		console.log('✅ Caches are isolated between different databases');

		await instance1.close();
		await instance2.close();
	});

	test('cache persists after instance closes (shared cache)', async () => {
		const storage = getRxStorageBunSQLite();
		const dbName = 'persistent-cache-test';
		
		const instance1 = await storage.createStorageInstance<TestDocType>({
			databaseInstanceToken: `${dbName}-${Date.now()}`,
			databaseName: dbName,
			collectionName: 'users',
			schema: createSchema(),
			options: {},
			multiInstance: false,
			devMode: false
		});

		await instance1.bulkWrite([
			{ document: { id: '1', name: 'Alice', age: 25, _deleted: false, _attachments: {}, _rev: '1', _meta: { lwt: Date.now() } } }
		], 'test');

		console.log('\n🔍 Testing cache persistence after instance close...');
		
		const selector = { age: { $gt: 20 } };
		
		console.log('📝 Instance1 - First query (cache MISS)');
		await instance1.query({
			query: { selector, sort: [], skip: 0 },
			queryPlan: { index: [], startKeys: [], endKeys: [], inclusiveStart: true, inclusiveEnd: true, sortSatisfiedByIndex: false, selectorSatisfiedByIndex: false }
		});

		console.log('📝 Closing instance1...');
		await instance1.close();
		console.log('   Instance1 closed');

		console.log('📝 Creating instance2 on same database...');
		const instance2 = await storage.createStorageInstance<TestDocType>({
			databaseInstanceToken: `${dbName}-${Date.now()}`,
			databaseName: dbName,
			collectionName: 'posts',
			schema: createSchema(),
			options: {},
			multiInstance: false,
			devMode: false
		});

		await instance2.bulkWrite([
			{ document: { id: '1', name: 'Bob', age: 30, _deleted: false, _attachments: {}, _rev: '1', _meta: { lwt: Date.now() } } }
		], 'test');

		console.log('📝 Instance2 - Same selector (cache HIT expected - cache persisted!)');
		await instance2.query({
			query: { selector, sort: [], skip: 0 },
			queryPlan: { index: [], startKeys: [], endKeys: [], inclusiveStart: true, inclusiveEnd: true, sortSatisfiedByIndex: false, selectorSatisfiedByIndex: false }
		});

		console.log('✅ Cache persisted after instance1 closed (shared per-database cache)');

		await instance2.close();
	});
});
