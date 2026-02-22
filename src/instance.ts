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

export class BunSQLiteStorageInstance<RxDocType> implements RxStorageInstance<RxDocType, BunSQLiteInternals, BunSQLiteStorageSettings> {
	private db: Database;
	private changeStream$ = new Subject<EventBulk<RxStorageChangeEvent<RxDocumentData<RxDocType>>, RxStorageDefaultCheckpoint>>();
	public readonly databaseName: string;
	public readonly collectionName: string;
	public readonly schema: Readonly<RxJsonSchema<RxDocumentData<RxDocType>>>;
	public readonly internals: Readonly<BunSQLiteInternals>;
	public readonly options: Readonly<BunSQLiteStorageSettings>;
	private primaryPath: string;
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
		this.primaryPath = params.schema.primaryKey as string;

		const filename = settings.filename || ':memory:';
		this.db = new Database(filename);

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

		const tableName = this.collectionName;
		this.db.run(`
			CREATE TABLE IF NOT EXISTS "${tableName}" (
				id TEXT PRIMARY KEY NOT NULL,
				data BLOB NOT NULL,
				deleted INTEGER NOT NULL DEFAULT 0,
				rev TEXT NOT NULL,
				mtime_ms REAL NOT NULL
			)
		`);

		this.db.run(`CREATE INDEX IF NOT EXISTS "idx_${tableName}_deleted_id" ON "${tableName}"(deleted, id)`);
		this.db.run(`CREATE INDEX IF NOT EXISTS "idx_${tableName}_mtime_ms_id" ON "${tableName}"(mtime_ms, id)`);
		
		this.db.run(`CREATE INDEX IF NOT EXISTS "idx_${tableName}_age" ON "${tableName}"(json_extract(data, '$.age'))`);
		this.db.run(`CREATE INDEX IF NOT EXISTS "idx_${tableName}_status" ON "${tableName}"(json_extract(data, '$.status'))`);
		this.db.run(`CREATE INDEX IF NOT EXISTS "idx_${tableName}_email" ON "${tableName}"(json_extract(data, '$.email'))`);
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

		const insertStmt = this.db.prepare(`
			INSERT INTO "${this.collectionName}" (id, data, deleted, rev, mtime_ms)
			VALUES (?, jsonb(?), ?, ?, ?)
		`);

		const updateStmt = this.db.prepare(`
			UPDATE "${this.collectionName}"
			SET data = jsonb(?), deleted = ?, rev = ?, mtime_ms = ?
			WHERE id = ?
		`);

		for (const row of categorized.bulkInsertDocs) {
			const doc = row.document;
			const id = doc[this.primaryPath as keyof RxDocumentData<RxDocType>] as string;
			try {
				insertStmt.run(id, JSON.stringify(doc), doc._deleted ? 1 : 0, doc._rev, doc._meta.lwt);
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
			updateStmt.run(JSON.stringify(doc), doc._deleted ? 1 : 0, doc._rev, doc._meta.lwt, id);
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
		
		const stmt = this.db.prepare(`
			SELECT json(data) as data FROM "${this.collectionName}"
			${whereClause}
		`);

		const rows = stmt.all(...ids) as Array<{ data: string }>;
		return rows.map(row => JSON.parse(row.data) as RxDocumentData<RxDocType>);
	}

	async query(preparedQuery: PreparedQuery<RxDocType>): Promise<RxStorageQueryResult<RxDocType>> {
		try {
			const { sql: whereClause, args } = buildWhereClause(preparedQuery.query.selector, this.schema);

			const sql = `
				SELECT json(data) as data FROM "${this.collectionName}"
				WHERE (${whereClause})
				ORDER BY id
			`;

			const rows = this.db.prepare(sql).all(...args) as Array<{ data: string }>;
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
			const allStmt = this.db.prepare(`SELECT json(data) as data FROM "${this.collectionName}"`);
			const rows = allStmt.all() as Array<{ data: string }>;
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
		const stmt = this.db.prepare(`
			DELETE FROM "${this.collectionName}"
			WHERE deleted = 1 AND mtime_ms < ?
		`);
		const result = stmt.run(minimumDeletedTime);
		return result.changes > 0;
	}

	async close(): Promise<void> {
		if (this.closed) return this.closed;
		this.closed = (async () => {
			this.changeStream$.complete();
			this.db.close();
		})();
		return this.closed;
	}

	async remove(): Promise<void> {
		if (this.closed) throw new Error('already closed');
		try {
			this.db.run(`DROP TABLE IF EXISTS "${this.collectionName}"`);
		} catch {}
		return this.close();
	}

	async getAttachmentData(documentId: string, attachmentId: string, digest: string): Promise<string> {
		throw new Error('Attachments not yet implemented');
	}

	async getChangedDocumentsSince(limit: number, checkpoint?: { id: string; lwt: number }) {
		const checkpointLwt = checkpoint?.lwt ?? 0;
		const checkpointId = checkpoint?.id ?? '';

		const sql = `
			SELECT json(data) as data FROM "${this.collectionName}"
			WHERE (mtime_ms > ? OR (mtime_ms = ? AND id > ?))
			ORDER BY mtime_ms ASC, id ASC
			LIMIT ?
		`;

		const rows = this.db.prepare(sql).all(checkpointLwt, checkpointLwt, checkpointId, limit) as Array<{ data: string }>;
		const documents = rows.map(row => JSON.parse(row.data) as RxDocumentData<RxDocType>);

		const lastDoc = documents[documents.length - 1];
		const newCheckpoint = lastDoc ? { id: (lastDoc as any)[this.primaryPath] as string, lwt: lastDoc._meta.lwt } : checkpoint ?? null;

		return { documents, checkpoint: newCheckpoint };
	}
}
