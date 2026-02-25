import { describe, test, expect, afterEach } from 'bun:test';
import { createRxDatabase, addRxPlugin } from 'rxdb';
import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { getRxStorageBunSQLite } from '$app/index';
import type { RxDatabase } from 'rxdb';

addRxPlugin(RxDBDevModePlugin);

describe('Multi-Instance Event Propagation', () => {
	const databases: RxDatabase[] = [];

	afterEach(async () => {
		for (const db of databases) {
			await db.remove();
		}
		databases.length = 0;
	});

	test('events should propagate from instance A to instance B', async () => {
		const dbName = 'testdb-' + Date.now();
		
		const db1 = await createRxDatabase({
			name: dbName,
			storage: wrappedValidateAjvStorage({ storage: getRxStorageBunSQLite() }),
			multiInstance: true,
			ignoreDuplicate: true
		});

		const db2 = await createRxDatabase({
			name: dbName,
			storage: wrappedValidateAjvStorage({ storage: getRxStorageBunSQLite() }),
			multiInstance: true,
			ignoreDuplicate: true
		});

		databases.push(db1, db2);

		await db1.addCollections({
			users: {
				schema: {
					version: 0,
					primaryKey: 'id',
					type: 'object',
					properties: {
						id: { type: 'string', maxLength: 100 },
						name: { type: 'string' }
					},
					required: ['id', 'name']
				}
			}
		});

		await db2.addCollections({
			users: {
				schema: {
					version: 0,
					primaryKey: 'id',
					type: 'object',
					properties: {
						id: { type: 'string', maxLength: 100 },
						name: { type: 'string' }
					},
					required: ['id', 'name']
				}
			}
		});

		let eventsReceived = 0;
		db2.users.$.subscribe(() => eventsReceived++);

		await new Promise(resolve => setTimeout(resolve, 50));

		await db1.users.insert({ id: 'user1', name: 'Alice' });

		await new Promise(resolve => setTimeout(resolve, 200));

		expect(eventsReceived).toBeGreaterThan(0);
	});

	test('events should propagate bidirectionally', async () => {
		const dbName = 'testdb-' + Date.now();
		
		const db1 = await createRxDatabase({
			name: dbName,
			storage: wrappedValidateAjvStorage({ storage: getRxStorageBunSQLite() }),
			multiInstance: true,
			ignoreDuplicate: true
		});

		const db2 = await createRxDatabase({
			name: dbName,
			storage: wrappedValidateAjvStorage({ storage: getRxStorageBunSQLite() }),
			multiInstance: true,
			ignoreDuplicate: true
		});

		databases.push(db1, db2);

		await db1.addCollections({
			users: {
				schema: {
					version: 0,
					primaryKey: 'id',
					type: 'object',
					properties: {
						id: { type: 'string', maxLength: 100 },
						name: { type: 'string' }
					},
					required: ['id', 'name']
				}
			}
		});

		await db2.addCollections({
			users: {
				schema: {
					version: 0,
					primaryKey: 'id',
					type: 'object',
					properties: {
						id: { type: 'string', maxLength: 100 },
						name: { type: 'string' }
					},
					required: ['id', 'name']
				}
			}
		});

		let events1 = 0;
		let events2 = 0;
		db1.users.$.subscribe(() => events1++);
		db2.users.$.subscribe(() => events2++);

		await new Promise(resolve => setTimeout(resolve, 50));

		await db1.users.insert({ id: 'user1', name: 'Alice' });
		await db2.users.insert({ id: 'user2', name: 'Bob' });

		await new Promise(resolve => setTimeout(resolve, 200));

		expect(events1).toBeGreaterThan(1);
		expect(events2).toBeGreaterThan(1);
	});

	test('instances with different databaseNames should NOT share events', async () => {
		const db1 = await createRxDatabase({
			name: 'testdb1-' + Date.now(),
			storage: wrappedValidateAjvStorage({ storage: getRxStorageBunSQLite() }),
			multiInstance: true,
			ignoreDuplicate: true
		});

		const db2 = await createRxDatabase({
			name: 'testdb2-' + Date.now(),
			storage: wrappedValidateAjvStorage({ storage: getRxStorageBunSQLite() }),
			multiInstance: true,
			ignoreDuplicate: true
		});

		databases.push(db1, db2);

		await db1.addCollections({
			users: {
				schema: {
					version: 0,
					primaryKey: 'id',
					type: 'object',
					properties: {
						id: { type: 'string', maxLength: 100 },
						name: { type: 'string' }
					},
					required: ['id', 'name']
				}
			}
		});

		await db2.addCollections({
			users: {
				schema: {
					version: 0,
					primaryKey: 'id',
					type: 'object',
					properties: {
						id: { type: 'string', maxLength: 100 },
						name: { type: 'string' }
					},
					required: ['id', 'name']
				}
			}
		});

		let eventsReceived = 0;
		db2.users.$.subscribe(() => eventsReceived++);

		await new Promise(resolve => setTimeout(resolve, 50));

		await db1.users.insert({ id: 'user1', name: 'Alice' });

		await new Promise(resolve => setTimeout(resolve, 200));

		expect(eventsReceived).toBe(0);
	});
});
