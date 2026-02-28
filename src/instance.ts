import { Database } from 'bun:sqlite';
import type { SQLQueryBindings } from 'bun:sqlite';
import { Subject, Observable } from 'rxjs';
import { matchesRegex } from './query/regex-matcher';
import type {
	RxStorageInstance,
	RxStorageInstanceCreationParams,
	BulkWriteRow,
	RxDocumentData,
	RxStorageBulkWriteResponse,
	RxStorageQueryResult,
	RxStorageCountResult,
	EventBulk,
	RxStorageChangeEvent,
	RxStorageWriteError,
	PreparedQuery,
	RxJsonSchema,
	MangoQuerySelector,
	MangoQuerySortPart,
	RxStorageDefaultCheckpoint
} from 'rxdb';
import type { BunSQLiteStorageSettings, BunSQLiteInternals } from './types';
import { buildWhereClause } from './query/builder';
import { matchesSelector } from './query/lightweight-matcher';
import { categorizeBulkWriteRows, ensureRxStorageInstanceParamsAreCorrect } from './rxdb-helpers';
import { StatementManager } from './statement-manager';
import { getDatabase, releaseDatabase } from './connection-pool';
import { sqliteTransaction } from './transaction-queue';

export class BunSQLiteStorageInstance<RxDocType> implements RxStorageInstance<RxDocType, BunSQLiteInternals, BunSQLiteStorageSettings> {
	private db: Database;
	private stmtManager: StatementManager;
	private changeStream$ = new Subject<EventBulk<RxStorageChangeEvent<RxDocumentData<RxDocType>>, RxStorageDefaultCheckpoint>>();
	private queryCache = new Map<string, import('./query/operators').SqlFragment | null>();
	public readonly databaseName: string;
	public readonly collectionName: string;
	public readonly schema: Readonly<RxJsonSchema<RxDocumentData<RxDocType>>>;
	public readonly internals: Readonly<BunSQLiteInternals>;
	public readonly options: Readonly<BunSQLiteStorageSettings>;
	private primaryPath: string;
	private tableName: string;
	public closed?: Promise<void>;

	constructor(
		params: RxStorageInstanceCreationParams<RxDocType, BunSQLiteStorageSettings>,
		settings: BunSQLiteStorageSettings = {}
	) {
		ensureRxStorageInstanceParamsAreCorrect(params);
		
		this.databaseName = params.databaseName;
		this.collectionName = params.collectionName;
		this.schema = params.schema;
		
		this.options = params.options;
		const primaryKey = params.schema.primaryKey;
		this.primaryPath = typeof primaryKey === 'string' ? primaryKey : primaryKey.key;
		this.tableName = `${params.collectionName}_v${params.schema.version}`;

		const filename = settings.filename || ':memory:';
		this.db = getDatabase(this.databaseName, filename);
		this.stmtManager = new StatementManager(this.db);

		this.internals = {
			db: this.db,
			primaryPath: this.primaryPath
		};

		this.initTable(filename);
	}

	private initTable(filename: string) {
		if (filename !== ':memory:') {
			this.db.run("PRAGMA journal_mode = WAL");
			this.db.run("PRAGMA synchronous = NORMAL");
			this.db.run("PRAGMA wal_autocheckpoint = 1000");
			this.db.run("PRAGMA cache_size = -32000");
			this.db.run("PRAGMA analysis_limit = 400");
			
			const mmapSize = this.options.mmapSize ?? 268435456;
			if (mmapSize > 0) {
				this.db.run(`PRAGMA mmap_size = ${mmapSize}`);
			}
			
			this.db.run("PRAGMA temp_store = MEMORY");
			this.db.run("PRAGMA locking_mode = NORMAL");
		}

		this.db.run(`
			CREATE TABLE IF NOT EXISTS "${this.tableName}" (
				id TEXT PRIMARY KEY NOT NULL,
				data BLOB NOT NULL,
				deleted INTEGER NOT NULL DEFAULT 0,
				rev TEXT NOT NULL,
				mtime_ms REAL NOT NULL
			)
		`);

		this.db.run(`CREATE INDEX IF NOT EXISTS "idx_${this.tableName}_deleted_id" ON "${this.tableName}"(deleted, id)`);
		this.db.run(`CREATE INDEX IF NOT EXISTS "idx_${this.tableName}_mtime_ms_id" ON "${this.tableName}"(mtime_ms, id)`);
		
		if (this.schema.indexes) {
			for (const index of this.schema.indexes) {
				const fields = Array.isArray(index) ? index : [index];
				const indexName = `idx_${this.tableName}_${fields.join('_').replace(/[()]/g, '_')}`;
				const columns = fields.map(field => {
					if (typeof field !== 'string') return `json_extract(data, '$.${field}')`;
					const funcMatch = field.match(/^(\w+)\((.+)\)$/);
					if (funcMatch) {
						const [, func, fieldName] = funcMatch;
						return `${func}(json_extract(data, '$.${fieldName}'))`;
					}
					return `json_extract(data, '$.${field}')`;
				}).join(', ');
				this.db.run(`CREATE INDEX IF NOT EXISTS "${indexName}" ON "${this.tableName}"(${columns})`);
			}
		}
		
		this.db.run(`
			CREATE TABLE IF NOT EXISTS "${this.tableName}_attachments" (
				id TEXT PRIMARY KEY NOT NULL,
				data TEXT NOT NULL,
				digest TEXT NOT NULL
			)
		`);
	}

	async bulkWrite(
		documentWrites: BulkWriteRow<RxDocType>[],
		context: string
	): Promise<RxStorageBulkWriteResponse<RxDocType>> {
		return sqliteTransaction(this.db, async () => {
			if (documentWrites.length === 0) {
				return { error: [] };
			}

			const ids = documentWrites.map(w => (w.document as RxDocumentData<RxDocType>)[this.primaryPath as keyof RxDocumentData<RxDocType>] as string);
			const docsInDb = await this.findDocumentsById(ids, true);
			const docsInDbMap = new Map(docsInDb.map(d => [d[this.primaryPath as keyof RxDocumentData<RxDocType>] as string, d]));

			const categorized = categorizeBulkWriteRows(
				this,
				this.primaryPath,
				docsInDbMap,
				documentWrites,
				context
			);

			const updateQuery = `UPDATE "${this.tableName}" SET data = jsonb(?), deleted = ?, rev = ?, mtime_ms = ? WHERE id = ?`;

			const BATCH_SIZE = 100;
			for (let i = 0; i < categorized.bulkInsertDocs.length; i += BATCH_SIZE) {
				const batch = categorized.bulkInsertDocs.slice(i, i + BATCH_SIZE);
				const placeholders = batch.map(() => '(?, jsonb(?), ?, ?, ?)').join(', ');
				const insertQuery = `INSERT INTO "${this.tableName}" (id, data, deleted, rev, mtime_ms) VALUES ${placeholders}`;
				const params: any[] = [];
				
				for (const row of batch) {
					const doc = row.document;
					const id = doc[this.primaryPath as keyof RxDocumentData<RxDocType>] as string;
					params.push(id, JSON.stringify(doc), doc._deleted ? 1 : 0, doc._rev, doc._meta.lwt);
				}
				
				try {
					this.stmtManager.run({ query: insertQuery, params });
				} catch (err: unknown) {
					if (err && typeof err === 'object' && 'code' in err && (err.code === 'SQLITE_CONSTRAINT_PRIMARYKEY' || err.code === 'SQLITE_CONSTRAINT_UNIQUE')) {
						for (const row of batch) {
							const doc = row.document;
							const id = doc[this.primaryPath as keyof RxDocumentData<RxDocType>] as string;
							const documentInDb = docsInDbMap.get(id);
							categorized.errors.push({
								isError: true,
								status: 409,
								documentId: id,
								writeRow: row,
								documentInDb: documentInDb || doc
							});
						}
					} else {
						throw err;
					}
				}
			}

			for (let i = 0; i < categorized.bulkUpdateDocs.length; i += BATCH_SIZE) {
				const batch = categorized.bulkUpdateDocs.slice(i, i + BATCH_SIZE);
				for (const row of batch) {
					const doc = row.document;
					const id = doc[this.primaryPath as keyof RxDocumentData<RxDocType>] as string;
					this.stmtManager.run({ query: updateQuery, params: [JSON.stringify(doc), doc._deleted ? 1 : 0, doc._rev, doc._meta.lwt, id] });
				}
			}

			const insertAttQuery = `INSERT OR REPLACE INTO "${this.tableName}_attachments" (id, data, digest) VALUES (?, ?, ?)`;
			const deleteAttQuery = `DELETE FROM "${this.tableName}_attachments" WHERE id = ?`;

			for (const att of [...categorized.attachmentsAdd, ...categorized.attachmentsUpdate]) {
				this.stmtManager.run({
					query: insertAttQuery,
					params: [
						this.attachmentMapKey(att.documentId, att.attachmentId),
						att.attachmentData.data,
						att.digest
					]
				});
			}

			for (const att of categorized.attachmentsRemove) {
				this.stmtManager.run({
					query: deleteAttQuery,
					params: [this.attachmentMapKey(att.documentId, att.attachmentId)]
				});
			}

			const failedDocIds = new Set(categorized.errors.map(e => e.documentId));
			categorized.eventBulk.events = categorized.eventBulk.events.filter(
				event => !failedDocIds.has(event.documentId)
			);

			if (categorized.eventBulk.events.length > 0 && categorized.newestRow) {
				const lastState = categorized.newestRow.document;
				categorized.eventBulk.checkpoint = {
					id: lastState[this.primaryPath as keyof typeof lastState] as string,
					lwt: lastState._meta.lwt
				};
				this.changeStream$.next(categorized.eventBulk);
			}

			return { error: categorized.errors };
		});
	}

	async findDocumentsById(ids: string[], withDeleted: boolean): Promise<RxDocumentData<RxDocType>[]> {
		if (ids.length === 0) return [];

		const placeholders = ids.map(() => '?').join(',');
		
		const whereClause = withDeleted
			? `WHERE id IN (${placeholders})`
			: `WHERE id IN (${placeholders}) AND deleted = 0`;
		
		const query = `SELECT json(data) as data FROM "${this.tableName}" ${whereClause}`;
		const rows = this.stmtManager.all({ query, params: ids }) as Array<{ data: string }>;
		return rows.map(row => JSON.parse(row.data) as RxDocumentData<RxDocType>);
	}

	async query(preparedQuery: PreparedQuery<RxDocType>): Promise<RxStorageQueryResult<RxDocType>> {
		const whereResult = buildWhereClause(preparedQuery.query.selector, this.schema, this.collectionName, this.queryCache);
		if (!whereResult) {
			return this.queryWithOurMemory(preparedQuery);
		}

		const { sql: whereClause, args } = whereResult;

		let sql = `SELECT json(data) as data FROM "${this.tableName}" WHERE (${whereClause})`;
		const queryArgs = [...args];

		if (preparedQuery.query.sort && preparedQuery.query.sort.length > 0) {
			const orderBy = preparedQuery.query.sort.map(sortField => {
				const [field, direction] = Object.entries(sortField)[0];
				const dir = direction === 'asc' ? 'ASC' : 'DESC';
				return `json_extract(data, '$.${field}') ${dir}`;
			}).join(', ');
			sql += ` ORDER BY ${orderBy}`;
		}

		if (preparedQuery.query.limit) {
			sql += ` LIMIT ?`;
			queryArgs.push(preparedQuery.query.limit);
		}

		if (preparedQuery.query.skip) {
			if (!preparedQuery.query.limit) {
				sql += ` LIMIT -1`;
			}
			sql += ` OFFSET ?`;
			queryArgs.push(preparedQuery.query.skip);
		}

		if (process.env.DEBUG_QUERIES) {
			const explainSql = `EXPLAIN QUERY PLAN ${sql}`;
			const plan = this.stmtManager.all({ query: explainSql, params: queryArgs });
			console.log('[DEBUG_QUERIES] Query plan:', JSON.stringify(plan, null, 2));
			console.log('[DEBUG_QUERIES] SQL:', sql);
			console.log('[DEBUG_QUERIES] Args:', queryArgs);
		}

		const rows = this.stmtManager.all({ query: sql, params: queryArgs }) as Array<{ data: string }>;
		const documents = rows.map(row => JSON.parse(row.data) as RxDocumentData<RxDocType>);

		return { documents };
	}



	private sortDocuments(docs: RxDocumentData<RxDocType>[], sort: MangoQuerySortPart<RxDocType>[]): RxDocumentData<RxDocType>[] {
		return docs.sort((a, b) => {
			for (const sortField of sort) {
				const [key, direction] = Object.entries(sortField)[0];
				const aVal = this.getNestedValue(a, key) as number | string;
				const bVal = this.getNestedValue(b, key) as number | string;

				if (aVal < bVal) return direction === 'asc' ? -1 : 1;
				if (aVal > bVal) return direction === 'asc' ? 1 : -1;
			}
			return 0;
		});
	}

	private getNestedValue(obj: RxDocumentData<RxDocType>, path: string): unknown {
		return path.split('.').reduce((current, key) => (current as Record<string, unknown>)?.[key], obj as unknown);
	}

	async count(preparedQuery: PreparedQuery<RxDocType>): Promise<RxStorageCountResult> {
		const whereResult = buildWhereClause(
			preparedQuery.query.selector,
			this.schema,
			this.collectionName,
			this.queryCache
		);
		
		if (!whereResult) {
			const allDocs = await this.queryWithOurMemory(preparedQuery);
			return {
				count: allDocs.documents.length,
				mode: 'fast'
			};
		}
		
		const { sql, args } = whereResult;
		const result = this.db.query(
			`SELECT COUNT(*) as count FROM "${this.tableName}" WHERE (${sql})`
		).get(...args) as { count: number } | undefined;
		
		return {
			count: result?.count ?? 0,
			mode: 'fast'
		};
	}

	changeStream(): Observable<EventBulk<RxStorageChangeEvent<RxDocumentData<RxDocType>>, RxStorageDefaultCheckpoint>> {
		return this.changeStream$.asObservable();
	}

	async cleanup(minimumDeletedTime: number): Promise<boolean> {
		let query: string;
		let params: SQLQueryBindings[];

		if (minimumDeletedTime === 0) {
			query = `DELETE FROM "${this.tableName}" WHERE deleted = 1`;
			params = [];
		} else {
			query = `DELETE FROM "${this.tableName}" WHERE deleted = 1 AND mtime_ms < ?`;
			params = [minimumDeletedTime];
		}
		
		const result = this.stmtManager.run({ query, params });
		return result.changes === 0;
	}

	async close(): Promise<void> {
		if (this.closed) return this.closed;
		this.closed = (async () => {
			this.queryCache.clear();
			this.changeStream$.complete();
			this.stmtManager.close();
			releaseDatabase(this.databaseName);
		})();
		return this.closed;
	}

	getCacheSize(): number {
		return this.queryCache.size;
	}

	async remove(): Promise<void> {
		if (this.closed) throw new Error('already closed');
		try {
			this.db.run(`DROP TABLE IF EXISTS "${this.tableName}"`);
		} catch {}
		return this.close();
	}

	// Gate 2: Helper function
	private attachmentMapKey(documentId: string, attachmentId: string): string {
		return documentId + '||' + attachmentId;
	}

	// Gate 3: getAttachmentData with digest validation
	async getAttachmentData(documentId: string, attachmentId: string, digest: string): Promise<string> {
		const key = this.attachmentMapKey(documentId, attachmentId);
		const result = this.db.query(
			`SELECT data, digest FROM "${this.tableName}_attachments" WHERE id = ?`
		).get(key) as { data: string; digest: string } | undefined;
		
		if (!result || result.digest !== digest) {
			throw new Error('attachment does not exist: ' + key);
		}
		
		return result.data;
	}

	async getChangedDocumentsSince(limit: number, checkpoint?: { id: string; lwt: number }) {
		const checkpointLwt = checkpoint?.lwt ?? 0;
		const checkpointId = checkpoint?.id ?? '';

		const sql = `
			SELECT json(data) as data FROM "${this.tableName}"
			WHERE (mtime_ms > ? OR (mtime_ms = ? AND id > ?))
			ORDER BY mtime_ms ASC, id ASC
			LIMIT ?
		`;

		const rows = this.stmtManager.all({ query: sql, params: [checkpointLwt, checkpointLwt, checkpointId, limit] }) as Array<{ data: string }>;
		const documents = rows.map(row => JSON.parse(row.data) as RxDocumentData<RxDocType>);

		const lastDoc = documents[documents.length - 1];
		const newCheckpoint = lastDoc ? { 
			id: String(lastDoc[this.primaryPath as keyof RxDocumentData<RxDocType>]), 
			lwt: lastDoc._meta.lwt 
		} : checkpoint ?? null;

		return { documents, checkpoint: newCheckpoint };
	}

	private queryWithOurMemory(preparedQuery: PreparedQuery<RxDocType>): RxStorageQueryResult<RxDocType> {
		const query = `SELECT json(data) as data FROM "${this.tableName}"`;
		const selector = preparedQuery.query.selector;
		const hasSort = preparedQuery.query.sort && preparedQuery.query.sort.length > 0;

		if (hasSort) {
			const rows = this.stmtManager.all({ query, params: [] }) as Array<{ data: string }>;
			let documents = rows.map(row => JSON.parse(row.data) as RxDocumentData<RxDocType>);
			documents = documents.filter(doc => matchesSelector(doc, selector));
			documents = this.sortDocuments(documents, preparedQuery.query.sort);

			if (preparedQuery.query.skip) {
				documents = documents.slice(preparedQuery.query.skip);
			}

			if (preparedQuery.query.limit) {
				documents = documents.slice(0, preparedQuery.query.limit);
			}

			return { documents };
		}

		const stmt = this.db.prepare(query);
		const documents: RxDocumentData<RxDocType>[] = [];
		const skip = preparedQuery.query.skip || 0;
		const limit = preparedQuery.query.limit;
		let skipped = 0;

		for (const row of stmt.iterate() as IterableIterator<{ data: string }>) {
			const doc = JSON.parse(row.data) as RxDocumentData<RxDocType>;

			if (matchesSelector(doc, selector)) {
				if (skipped < skip) {
					skipped++;
					continue;
				}

				documents.push(doc);

				if (limit && documents.length >= limit) {
					break;
				}
			}
		}

		return { documents };
	}

	private matchesRegexSelector(doc: RxDocumentData<RxDocType>, selector: MangoQuerySelector<RxDocumentData<RxDocType>>): boolean {
		for (const [field, value] of Object.entries(selector)) {
			if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
				const ops = value as Record<string, unknown>;
				if (ops.$regex) {
					const fieldValue = this.getNestedValue(doc, field);
					const pattern = ops.$regex as string;
					const options = ops.$options as string | undefined;
					if (!matchesRegex(fieldValue, pattern, options)) return false;
				}
			}
		}
		return true;
	}
}
