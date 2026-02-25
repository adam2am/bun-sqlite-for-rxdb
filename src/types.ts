import type { Database } from 'bun:sqlite';

export interface BunSQLiteStorageSettings {
	/**
	 * Database file path. Use ':memory:' for in-memory database.
	 * @default ':memory:'
	 */
	filename?: string;

	/**
	 * Memory-mapped I/O size in bytes. Set to 0 to disable.
	 * Enables 2-5x faster reads for large databases (>500MB).
	 * Trade-off: I/O errors become signals (SIGBUS) instead of returnable errors.
	 * @default 268435456 (256MB)
	 */
	mmapSize?: number;
}

export interface BunSQLiteInternals {
	db: Database;
	primaryPath: string;
}
