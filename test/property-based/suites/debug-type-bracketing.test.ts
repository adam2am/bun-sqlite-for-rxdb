import { describe, it } from 'bun:test';
import { getRxStorageBunSQLite } from '$app/storage';
import type { RxStorageInstance } from 'rxdb';
import type { BunSQLiteStorageSettings, BunSQLiteInternals } from '$app/types';
import { TestDocumentArbitrary } from '$tests/property-based/generators/document.gen';
import { runSQLQuery, runMingoQuery } from '$tests/property-based/engine/runner';
import fc from 'fast-check';

describe('Debug: Type Bracketing Investigation', () => {
	it('Pattern 1: $gt with numbers - Why SQL returns more?', async () => {
		const storage = getRxStorageBunSQLite({ strict: true });
		const instance = await storage.createStorageInstance({
			databaseInstanceToken: 'debug-gt',
			databaseName: 'testdb',
			collectionName: 'users',
			schema: {
				version: 0,
				primaryKey: 'id',
				type: 'object',
				properties: {
					id: { type: 'string', maxLength: 100 },
					age: { type: 'number' },
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

		const docs = fc.sample(TestDocumentArbitrary, 20);
		await instance.bulkWrite(docs.map(doc => ({ document: doc })), 'test');

		const query = { age: { $gt: 25 } };
		console.log(`\n${'='.repeat(80)}`);
		console.log(`Query: ${JSON.stringify(query)}`);
		console.log('='.repeat(80));

		const sqlResult = await runSQLQuery(instance, query);
		const mingoResult = runMingoQuery(docs, query);

		console.log(`\nSQL returned: ${sqlResult.count} docs`);
		console.log(`Mingo returned: ${mingoResult.count} docs`);

		console.log(`\nSQL IDs: [${sqlResult.ids.join(', ')}]`);
		console.log(`Mingo IDs: [${mingoResult.ids.join(', ')}]`);

		const sqlOnly = sqlResult.ids.filter(id => !mingoResult.ids.includes(id));
		const mingoOnly = mingoResult.ids.filter(id => !sqlResult.ids.includes(id));

		if (sqlOnly.length > 0) {
			console.log(`\n❌ SQL matched but Mingo didn't: [${sqlOnly.join(', ')}]`);
			for (const id of sqlOnly.slice(0, 3)) {
				const doc = docs.find(d => d.id === id);
				console.log(`  Doc ${id}: age = ${JSON.stringify(doc?.age)} (type: ${typeof doc?.age})`);
			}
		}

		if (mingoOnly.length > 0) {
			console.log(`\n❌ Mingo matched but SQL didn't: [${mingoOnly.join(', ')}]`);
			for (const id of mingoOnly.slice(0, 3)) {
				const doc = docs.find(d => d.id === id);
				console.log(`  Doc ${id}: age = ${JSON.stringify(doc?.age)} (type: ${typeof doc?.age})`);
			}
		}

		await instance.remove();
	}, 30000);

	it('Pattern 2: $ne with numbers - Why 60x more results?', async () => {
		const storage = getRxStorageBunSQLite({ strict: true });
		const instance = await storage.createStorageInstance({
			databaseInstanceToken: 'debug-ne',
			databaseName: 'testdb',
			collectionName: 'users',
			schema: {
				version: 0,
				primaryKey: 'id',
				type: 'object',
				properties: {
					id: { type: 'string', maxLength: 100 },
					score: { type: 'number' },
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

		const docs = fc.sample(TestDocumentArbitrary, 20);
		await instance.bulkWrite(docs.map(doc => ({ document: doc })), 'test');

		const query = { score: { $ne: 50 } };
		console.log(`\n${'='.repeat(80)}`);
		console.log(`Query: ${JSON.stringify(query)}`);
		console.log('='.repeat(80));

		const sqlResult = await runSQLQuery(instance, query);
		const mingoResult = runMingoQuery(docs, query);

		console.log(`\nSQL returned: ${sqlResult.count} docs`);
		console.log(`Mingo returned: ${mingoResult.count} docs`);

		const sqlOnly = sqlResult.ids.filter(id => !mingoResult.ids.includes(id));

		if (sqlOnly.length > 0) {
			console.log(`\n❌ SQL matched ${sqlOnly.length} extra docs. Sampling first 5:`);
			for (const id of sqlOnly.slice(0, 5)) {
				const doc = docs.find(d => d.id === id);
				console.log(`  Doc ${id}: score = ${JSON.stringify(doc?.score)} (type: ${typeof doc?.score})`);
			}
		}

		await instance.remove();
	}, 30000);

	it('Pattern 3: $ne with null - Why 35x more results?', async () => {
		const storage = getRxStorageBunSQLite({ strict: true });
		const instance = await storage.createStorageInstance({
			databaseInstanceToken: 'debug-ne-null',
			databaseName: 'testdb',
			collectionName: 'users',
			schema: {
				version: 0,
				primaryKey: 'id',
				type: 'object',
				properties: {
					id: { type: 'string', maxLength: 100 },
					active: { type: 'boolean' },
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

		const docs = fc.sample(TestDocumentArbitrary, 20);
		await instance.bulkWrite(docs.map(doc => ({ document: doc })), 'test');

		const query = { active: { $ne: null } };
		console.log(`\n${'='.repeat(80)}`);
		console.log(`Query: ${JSON.stringify(query)}`);
		console.log('='.repeat(80));

		const sqlResult = await runSQLQuery(instance, query);
		const mingoResult = runMingoQuery(docs, query);

		console.log(`\nSQL returned: ${sqlResult.count} docs`);
		console.log(`Mingo returned: ${mingoResult.count} docs`);

		const sqlOnly = sqlResult.ids.filter(id => !mingoResult.ids.includes(id));

		if (sqlOnly.length > 0) {
			console.log(`\n❌ SQL matched ${sqlOnly.length} extra docs. Sampling first 5:`);
			for (const id of sqlOnly.slice(0, 5)) {
				const doc = docs.find(d => d.id === id);
				console.log(`  Doc ${id}: active = ${JSON.stringify(doc?.active)} (type: ${typeof doc?.active})`);
			}
		}

		await instance.remove();
	}, 30000);

	it('Pattern 4: $all with strings - Why SQL returns more?', async () => {
		const storage = getRxStorageBunSQLite({ strict: true });
		const instance = await storage.createStorageInstance({
			databaseInstanceToken: 'debug-all',
			databaseName: 'testdb',
			collectionName: 'users',
			schema: {
				version: 0,
				primaryKey: 'id',
				type: 'object',
				properties: {
					id: { type: 'string', maxLength: 100 },
					tags: { type: 'array', items: { type: 'string' } },
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

		const docs = fc.sample(TestDocumentArbitrary, 20);
		await instance.bulkWrite(docs.map(doc => ({ document: doc })), 'test');

		const query = { tags: { $all: ['admin'] } };
		console.log(`\n${'='.repeat(80)}`);
		console.log(`Query: ${JSON.stringify(query)}`);
		console.log('='.repeat(80));

		const sqlResult = await runSQLQuery(instance, query);
		const mingoResult = runMingoQuery(docs, query);

		console.log(`\nSQL returned: ${sqlResult.count} docs`);
		console.log(`Mingo returned: ${mingoResult.count} docs`);

		const sqlOnly = sqlResult.ids.filter(id => !mingoResult.ids.includes(id));

		if (sqlOnly.length > 0) {
			console.log(`\n❌ SQL matched ${sqlOnly.length} extra docs. Sampling first 5:`);
			for (const id of sqlOnly.slice(0, 5)) {
				const doc = docs.find(d => d.id === id);
				console.log(`  Doc ${id}: tags = ${JSON.stringify(doc?.tags)}`);
			}
		}

		await instance.remove();
	}, 30000);

	it('Pattern 5: $in with strings - FLAKY (85.5%)', async () => {
		const storage = getRxStorageBunSQLite({ strict: true });
		const instance = await storage.createStorageInstance({
			databaseInstanceToken: 'debug-in',
			databaseName: 'testdb',
			collectionName: 'users',
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
					_meta: { type: 'object', properties: { lwt: { type: 'number' } } }
				},
				required: ['id', '_deleted', '_attachments', '_rev', '_meta']
			},
			options: {},
			multiInstance: false,
			devMode: false
		});

		const docs = fc.sample(TestDocumentArbitrary, 20);
		await instance.bulkWrite(docs.map(doc => ({ document: doc })), 'test');

		const query = { name: { $in: ['Alice', 'Bob', 'Charlie'] } };
		console.log(`\n${'='.repeat(80)}`);
		console.log(`Query: ${JSON.stringify(query)}`);
		console.log('='.repeat(80));

		const sqlResult = await runSQLQuery(instance, query);
		const mingoResult = runMingoQuery(docs, query);

		console.log(`\nSQL returned: ${sqlResult.count} docs`);
		console.log(`Mingo returned: ${mingoResult.count} docs`);

		const sqlOnly = sqlResult.ids.filter(id => !mingoResult.ids.includes(id));
		const mingoOnly = mingoResult.ids.filter(id => !sqlResult.ids.includes(id));

		if (sqlOnly.length > 0) {
			console.log(`\n❌ SQL matched but Mingo didn't: [${sqlOnly.join(', ')}]`);
			for (const id of sqlOnly.slice(0, 3)) {
				const doc = docs.find(d => d.id === id);
				console.log(`  Doc ${id}: name = ${JSON.stringify(doc?.name)} (type: ${typeof doc?.name})`);
			}
		}

		if (mingoOnly.length > 0) {
			console.log(`\n❌ Mingo matched but SQL didn't: [${mingoOnly.join(', ')}]`);
			for (const id of mingoOnly.slice(0, 3)) {
				const doc = docs.find(d => d.id === id);
				console.log(`  Doc ${id}: name = ${JSON.stringify(doc?.name)} (type: ${typeof doc?.name})`);
			}
		}

		await instance.remove();
	}, 30000);
});
