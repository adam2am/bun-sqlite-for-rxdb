import { Database } from 'bun:sqlite';

type DatabaseState = {
	db: Database;
	filename: string;
	openConnections: number;
};

const DATABASE_POOL = new Map<string, DatabaseState>();

export function getDatabase(databaseName: string, filename: string): Database {
	let state = DATABASE_POOL.get(databaseName);
	if (!state) {
		state = {
			db: new Database(filename),
			filename,
			openConnections: 1
		};
		DATABASE_POOL.set(databaseName, state);
	} else {
		if (state.filename !== filename) {
			throw new Error(`Database '${databaseName}' already opened with different filename: '${state.filename}' vs '${filename}'`);
		}
		state.openConnections++;
	}
	return state.db;
}

export function releaseDatabase(databaseName: string): void {
	const state = DATABASE_POOL.get(databaseName);
	if (state) {
		state.openConnections--;
		if (state.openConnections === 0) {
			state.db.close();
			DATABASE_POOL.delete(databaseName);
		}
	}
}
