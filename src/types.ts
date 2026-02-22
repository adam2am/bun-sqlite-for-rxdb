import type { Database } from 'bun:sqlite';

export interface BunSQLiteStorageSettings {
	/**
	 * Database file path. Use ':memory:' for in-memory database.
	 * @default ':memory:'
	 */
	filename?: string;
}

export interface BunSQLiteInternals {
	db: Database;
	primaryPath: string;
}
