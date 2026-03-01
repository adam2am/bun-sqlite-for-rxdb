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

	/**
	 * Use generated columns for _deleted and _meta.lwt fields.
	 * - false: Regular columns with manual extraction (baseline)
	 * - 'virtual': VIRTUAL generated columns (computed on-the-fly, no storage overhead) - RECOMMENDED
	 * - 'stored': STORED generated columns (pre-computed, +11% storage, 58% faster queries)
	 * Requires SQLite 3.31.0+ (Bun 1.0+ includes SQLite 3.42+).
	 * @default 'virtual'
	 * @experimental Alpha feature - opt-in for testing
	 */
	useStoredColumns?: false | 'virtual' | 'stored';
}

export interface BunSQLiteInternals {
	db: Database;
	primaryPath: string;
}
