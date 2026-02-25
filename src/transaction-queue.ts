import type { Database } from 'bun:sqlite';

const TX_QUEUE_BY_DATABASE: WeakMap<Database, Promise<void>> = new WeakMap();

export async function sqliteTransaction<T>(
	database: Database,
	handler: () => Promise<T>
): Promise<T> {
	let queue = TX_QUEUE_BY_DATABASE.get(database);
	if (!queue) {
		queue = Promise.resolve();
	}

	const result = queue.then(async () => {
		database.run('BEGIN IMMEDIATE');
		try {
			const handlerResult = await handler();
			database.run('COMMIT');
			return handlerResult;
		} catch (error) {
			database.run('ROLLBACK');
			throw error;
		}
	});

	TX_QUEUE_BY_DATABASE.set(database, result.then(() => {}).catch(() => {}));
	return result;
}
