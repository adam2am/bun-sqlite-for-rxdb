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
	MangoQuerySortPart
} from 'rxdb';
import type { BunSQLiteStorageSettings, BunSQLiteInternals } from './types';
import { buildWhereClause } from './query/builder';

export class BunSQLiteStorageInstance<RxDocType> implements RxStorageInstance<RxDocType, BunSQLiteInternals, BunSQLiteStorageSettings> {
	private db: Database;
	private changeStream$ = new Subject<EventBulk<RxStorageChangeEvent<RxDocType>, unknown>>();
	public readonly databaseName: string;
	public readonly collectionName: string;
	public readonly schema: Readonly<RxJsonSchema<RxDocumentData<RxDocType>>>;
	public readonly internals: Readonly<BunSQLiteInternals>;
	public readonly options: Readonly<BunSQLiteStorageSettings>;
	private primaryPath: string;

	constructor(
		params: RxStorageInstanceCreationParams<RxDocType, BunSQLiteStorageSettings>,
		settings: BunSQLiteStorageSettings = {}
	) {
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
		const error: RxStorageWriteError<RxDocType>[] = [];

		for (const write of documentWrites) {
			try {
				const doc = write.document as RxDocumentData<RxDocType>;
				const id = doc[this.primaryPath as keyof RxDocumentData<RxDocType>] as string;
				const deleted = doc._deleted ? 1 : 0;
				const rev = doc._rev;
				const mtime_ms = doc._meta?.lwt || Date.now();
				const data = JSON.stringify(doc);

				const stmt = this.db.prepare(`
					INSERT INTO "${this.collectionName}" (id, data, deleted, rev, mtime_ms)
					VALUES (?, jsonb(?), ?, ?, ?)
				`);

				stmt.run(id, data, deleted, rev, mtime_ms);
			} catch (err: any) {
				if (err.message?.includes('UNIQUE constraint failed')) {
					const doc = write.document as RxDocumentData<RxDocType>;
					const id = doc[this.primaryPath as keyof RxDocumentData<RxDocType>] as string;

					const existing = this.db.prepare(`SELECT json(data) as data FROM "${this.collectionName}" WHERE id = ?`).get(id) as { data: string };
					const documentInDb = JSON.parse(existing.data) as RxDocumentData<RxDocType>;

					error.push({
						status: 409,
						documentId: id,
						writeRow: write,
						documentInDb,
						isError: true
					});
				} else {
					throw err;
				}
			}
		}

		const success = documentWrites
			.filter(w => !error.find(e => e.documentId === (w.document as RxDocumentData<RxDocType>)[this.primaryPath as keyof RxDocumentData<RxDocType>]))
			.map(w => ({
				...w.document as RxDocumentData<RxDocType>
			}));

		const lastDoc = success[success.length - 1];
		const checkpoint = lastDoc ? {
			id: lastDoc[this.primaryPath as keyof RxDocumentData<RxDocType>] as string,
			lwt: (lastDoc._meta as { lwt: number }).lwt
		} : null;

		this.changeStream$.next({
			checkpoint,
			context,
			events: success.map(doc => ({
				documentId: doc[this.primaryPath as keyof RxDocumentData<RxDocType>] as string,
				documentData: doc,
				operation: 'INSERT' as const,
				previousDocumentData: undefined
			})),
			id: ''
		});

		return { error };
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
				WHERE deleted = 0 AND (${whereClause})
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
			const allStmt = this.db.prepare(`SELECT json(data) as data FROM "${this.collectionName}" WHERE deleted = 0`);
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

	changeStream(): Observable<EventBulk<RxStorageChangeEvent<RxDocType>, unknown>> {
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
		this.db.close();
		this.changeStream$.complete();
	}

	async remove(): Promise<void> {
		this.db.run(`DROP TABLE IF EXISTS "${this.collectionName}"`);
		await this.close();
	}

	async getAttachmentData(documentId: string, attachmentId: string, digest: string): Promise<string> {
		throw new Error('Attachments not yet implemented');
	}
}
