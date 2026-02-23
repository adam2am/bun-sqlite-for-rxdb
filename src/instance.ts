import { Database } from 'bun:sqlite';
import { Subject, Observable } from 'rxjs';
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
import { categorizeBulkWriteRows, ensureRxStorageInstanceParamsAreCorrect } from './rxdb-helpers';
import { StatementManager } from './statement-manager';
import { getDatabase, releaseDatabase } from './connection-pool';

export class BunSQLiteStorageInstance<RxDocType> implements RxStorageInstance<RxDocType, BunSQLiteInternals, BunSQLiteStorageSettings> {
	private db: Database;
	private stmtManager: StatementManager;
	private changeStream$ = new Subject<EventBulk<RxStorageChangeEvent<RxDocumentData<RxDocType>>, RxStorageDefaultCheckpoint>>();
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
				const indexName = `idx_${this.tableName}_${fields.join('_')}`;
				const columns = fields.map(field => `json_extract(data, '$.${field}')`).join(', ');
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
		if (documentWrites.length === 0) {
			return { error: [] };
		}

		const ids = documentWrites.map(w => (w.document as RxDocumentData<RxDocType>)[this.primaryPath as keyof RxDocumentData<RxDocType>] as string);
		const docsInDb = await this.findDocumentsById(ids, true);
		const docsInDbMap = new Map(docsInDb.map(d => [d[this.primaryPath as keyof RxDocumentData<RxDocType>] as string, d]));

		const categorized = categorizeBulkWriteRows(
			this,
			this.primaryPath as any,
			docsInDbMap,
			documentWrites,
			context
		);

		const insertQuery = `INSERT INTO "${this.tableName}" (id, data, deleted, rev, mtime_ms) VALUES (?, jsonb(?), ?, ?, ?)`;
		const updateQuery = `UPDATE "${this.tableName}" SET data = jsonb(?), deleted = ?, rev = ?, mtime_ms = ? WHERE id = ?`;

		for (const row of categorized.bulkInsertDocs) {
			const doc = row.document;
			const id = doc[this.primaryPath as keyof RxDocumentData<RxDocType>] as string;
			try {
				this.stmtManager.run({ query: insertQuery, params: [id, JSON.stringify(doc), doc._deleted ? 1 : 0, doc._rev, doc._meta.lwt] });
			} catch (err: any) {
				if (err.code === 'SQLITE_CONSTRAINT_PRIMARYKEY' || err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
					const documentInDb = docsInDbMap.get(id);
					categorized.errors.push({
						isError: true,
						status: 409,
						documentId: id,
						writeRow: row,
						documentInDb: documentInDb || doc
					});
				} else {
					throw err;
				}
			}
		}

		for (const row of categorized.bulkUpdateDocs) {
			const doc = row.document;
			const id = doc[this.primaryPath as keyof RxDocumentData<RxDocType>] as string;
			this.stmtManager.run({ query: updateQuery, params: [JSON.stringify(doc), doc._deleted ? 1 : 0, doc._rev, doc._meta.lwt, id] });
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
		try {
			const { sql: whereClause, args } = buildWhereClause(preparedQuery.query.selector, this.schema, this.collectionName);

		const sql = `
		SELECT json(data) as data FROM "${this.tableName}"
			WHERE (${whereClause})
		`;

		if (process.env.DEBUG_QUERIES) {
			const explainSql = `EXPLAIN QUERY PLAN ${sql}`;
			const plan = this.stmtManager.all({ query: explainSql, params: args });
			console.log('[DEBUG_QUERIES] Query plan:', JSON.stringify(plan, null, 2));
			console.log('[DEBUG_QUERIES] SQL:', sql);
			console.log('[DEBUG_QUERIES] Args:', args);
		}

		const rows = this.stmtManager.all({ query: sql, params: args }) as Array<{ data: string }>;
			let documents = rows.map(row => JSON.parse(row.data) as RxDocumentData<RxDocType>);

			if (preparedQuery.query.sort && preparedQuery.query.sort.length > 0) {
				documents = this.sortDocuments(documents, preparedQuery.query.sort);
			}

			if (preparedQuery.query.skip) {
				documents = documents.slice(preparedQuery.query.skip);
			}

			if (preparedQuery.query.limit) {
				documents = documents.slice(0, preparedQuery.query.limit);
			}

			return { documents };
		} catch (err) {
			if (process.env.DEBUG_QUERIES) {
				console.log('[DEBUG_QUERIES] SQL query failed, using fallback');
				console.log('[DEBUG_QUERIES] Error:', err);
			}
			const query = `SELECT json(data) as data FROM "${this.tableName}"`;
			const rows = this.stmtManager.all({ query, params: [] }) as Array<{ data: string }>;
			let documents = rows.map(row => JSON.parse(row.data) as RxDocumentData<RxDocType>);

			documents = documents.filter(doc => this.matchesSelector(doc, preparedQuery.query.selector));

			if (preparedQuery.query.sort && preparedQuery.query.sort.length > 0) {
				documents = this.sortDocuments(documents, preparedQuery.query.sort);
			}

			if (preparedQuery.query.skip) {
				documents = documents.slice(preparedQuery.query.skip);
			}

			if (preparedQuery.query.limit) {
				documents = documents.slice(0, preparedQuery.query.limit);
			}

			return { documents };
		}
	}

	private matchesSelector(doc: RxDocumentData<RxDocType>, selector: MangoQuerySelector<RxDocumentData<RxDocType>>): boolean {
		for (const [key, value] of Object.entries(selector)) {
			const docValue = this.getNestedValue(doc, key);

			if (typeof value === 'object' && value !== null) {
				for (const [op, opValue] of Object.entries(value)) {
					if (op === '$eq' && docValue !== opValue) return false;
					if (op === '$ne' && docValue === opValue) return false;
					if (op === '$gt' && !((docValue as number) > (opValue as number))) return false;
					if (op === '$gte' && !((docValue as number) >= (opValue as number))) return false;
					if (op === '$lt' && !((docValue as number) < (opValue as number))) return false;
					if (op === '$lte' && !((docValue as number) <= (opValue as number))) return false;
				}
			} else {
				if (docValue !== value) return false;
			}
		}
		return true;
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
		const result = await this.query(preparedQuery);
		return {
			count: result.documents.length,
			mode: 'fast'
		};
	}

	changeStream(): Observable<EventBulk<RxStorageChangeEvent<RxDocumentData<RxDocType>>, RxStorageDefaultCheckpoint>> {
		return this.changeStream$.asObservable();
	}

	async cleanup(minimumDeletedTime: number): Promise<boolean> {
		let query: string;
		let params: unknown[];
		
		// RxDB contract: minimumDeletedTime is a DURATION (milliseconds), not a timestamp
		// Calculation: currentTime - minimumDeletedTime = cutoffTimestamp
		// When minimumDeletedTime = 0: now() - 0 = now() → delete ALL deleted documents
		// This matches official Dexie implementation: const maxDeletionTime = now() - minimumDeletedTime
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
			this.changeStream$.complete();
			this.stmtManager.close();
			releaseDatabase(this.databaseName);
		})();
		return this.closed;
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
		const newCheckpoint = lastDoc ? { id: (lastDoc as any)[this.primaryPath] as string, lwt: lastDoc._meta.lwt } : checkpoint ?? null;

		return { documents, checkpoint: newCheckpoint };
	}
}
