import { Database } from 'bun:sqlite';
import type {
	RxStorageInstance,
	RxStorageInstanceCreationParams,
	BulkWriteRow,
	RxDocumentData,
	RxStorageBulkWriteResponse,
	RxStorageQueryResult,
	RxStorageCountResult,
	EventBulk,
	RxStorageChangeEvent
} from 'rxdb';
import { Subject, Observable } from 'rxjs';
import type { BunSQLiteStorageSettings } from './types';

export class BunSQLiteStorageInstance<RxDocType> implements RxStorageInstance<RxDocType, unknown, unknown> {
	private db: Database;
	private changeStream$ = new Subject<EventBulk<RxStorageChangeEvent<RxDocumentData<RxDocType>>, unknown>>();
	public readonly databaseName: string;
	public readonly collectionName: string;
	public readonly schema: any;
	public readonly internals: Readonly<unknown> = {};
	public readonly options: any;
	private primaryPath: string;

	constructor(
		params: RxStorageInstanceCreationParams<RxDocType, unknown>,
		settings: BunSQLiteStorageSettings = {}
	) {
		this.databaseName = params.databaseName;
		this.collectionName = params.collectionName;
		this.schema = params.schema;
		this.options = params.options;
		this.primaryPath = params.schema.primaryKey as string;

		const filename = settings.filename || ':memory:';
		this.db = new Database(filename);

		this.initTable();
	}

	private initTable() {
		const tableName = this.collectionName;
		this.db.run(`
			CREATE TABLE IF NOT EXISTS "${tableName}" (
				id TEXT PRIMARY KEY NOT NULL,
				data TEXT NOT NULL,
				deleted INTEGER NOT NULL DEFAULT 0,
				rev TEXT NOT NULL,
				mtime_ms REAL NOT NULL
			)
		`);
		
		this.db.run(`CREATE INDEX IF NOT EXISTS "idx_${tableName}_deleted_id" ON "${tableName}"(deleted, id)`);
		this.db.run(`CREATE INDEX IF NOT EXISTS "idx_${tableName}_mtime_ms_id" ON "${tableName}"(mtime_ms, id)`);
	}

	async bulkWrite(
		documentWrites: BulkWriteRow<RxDocType>[],
		context: string
	): Promise<RxStorageBulkWriteResponse<RxDocType>> {
		const error: any[] = [];

		const transaction = this.db.transaction((writes: BulkWriteRow<RxDocType>[]) => {
			for (const write of writes) {
				try {
					const doc = write.document;
					const id = (doc as any)[this.primaryPath];
					const deleted = (doc as any)._deleted ? 1 : 0;
					const rev = (doc as any)._rev;
					const mtime_ms = (doc as any)._meta?.lwt || Date.now();
					const data = JSON.stringify(doc);

					const stmt = this.db.prepare(`
						INSERT OR REPLACE INTO "${this.collectionName}" (id, data, deleted, rev, mtime_ms)
						VALUES (?, ?, ?, ?, ?)
					`);
					
					stmt.run(id, data, deleted, rev, mtime_ms);
				} catch (err: unknown) {
					error.push({
						status: 500,
						documentId: (write.document as any)[this.primaryPath],
						writeRow: write,
						error: err
					});
				}
			}
		});

		transaction(documentWrites);

		if (error.length === 0) {
			this.changeStream$.next({
				checkpoint: null,
				context,
				events: documentWrites.map(w => ({
					operation: 'INSERT',
					documentId: (w.document as any)[this.primaryPath],
					documentData: w.document as any,
					previousDocumentData: w.previous
				})),
				id: ''
			} as any);
		}

		return { error };
	}

	async findDocumentsById(ids: string[], deleted: boolean): Promise<RxDocumentData<RxDocType>[]> {
		if (ids.length === 0) return [];

		const placeholders = ids.map(() => '?').join(',');
		const stmt = this.db.prepare(`
			SELECT data FROM "${this.collectionName}"
			WHERE id IN (${placeholders}) AND deleted = ?
		`);

		const rows = stmt.all(...ids, deleted ? 1 : 0) as Array<{ data: string }>;
		return rows.map(row => JSON.parse(row.data) as RxDocumentData<RxDocType>);
	}

	async query(preparedQuery: any): Promise<RxStorageQueryResult<RxDocType>> {
		const stmt = this.db.prepare(`
			SELECT data FROM "${this.collectionName}"
			WHERE deleted = 0
			ORDER BY id
		`);

		const rows = stmt.all() as Array<{ data: string }>;
		let documents = rows.map(row => JSON.parse(row.data) as RxDocumentData<RxDocType>);

		if (preparedQuery.selector) {
			documents = documents.filter(doc => this.matchesSelector(doc, preparedQuery.selector));
		}

		if (preparedQuery.sort) {
			documents = this.sortDocuments(documents, preparedQuery.sort);
		}

		if (preparedQuery.skip) {
			documents = documents.slice(preparedQuery.skip);
		}

		if (preparedQuery.limit) {
			documents = documents.slice(0, preparedQuery.limit);
		}

		return { documents };
	}

	private matchesSelector(doc: any, selector: any): boolean {
		for (const [key, value] of Object.entries(selector)) {
			const docValue = this.getNestedValue(doc, key);
			
			if (typeof value === 'object' && value !== null) {
				for (const [op, opValue] of Object.entries(value)) {
					if (op === '$eq' && docValue !== opValue) return false;
					if (op === '$ne' && docValue === opValue) return false;
					if (op === '$gt' && !(docValue > opValue)) return false;
					if (op === '$gte' && !(docValue >= opValue)) return false;
					if (op === '$lt' && !(docValue < opValue)) return false;
					if (op === '$lte' && !(docValue <= opValue)) return false;
				}
			} else {
				if (docValue !== value) return false;
			}
		}
		return true;
	}

	private sortDocuments(docs: any[], sort: any[]): any[] {
		return docs.sort((a, b) => {
			for (const sortField of sort) {
				const [key, direction] = Object.entries(sortField)[0];
				const aVal = this.getNestedValue(a, key);
				const bVal = this.getNestedValue(b, key);
				
				if (aVal < bVal) return direction === 'asc' ? -1 : 1;
				if (aVal > bVal) return direction === 'asc' ? 1 : -1;
			}
			return 0;
		});
	}

	private getNestedValue(obj: any, path: string): any {
		return path.split('.').reduce((current, key) => current?.[key], obj);
	}

	async count(preparedQuery: any): Promise<RxStorageCountResult> {
		const result = await this.query(preparedQuery);
		return {
			count: result.documents.length,
			mode: 'fast'
		};
	}

	changeStream(): Observable<EventBulk<RxStorageChangeEvent<RxDocumentData<RxDocType>>, unknown>> {
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

	conflictResultionTasks(): Observable<any> {
		return new Observable();
	}

	async resolveConflictResultionTask(taskSolution: any): Promise<void> {
	}

	async getAttachmentData(documentId: string, attachmentId: string, digest: string): Promise<string> {
		throw new Error('Attachments not yet implemented');
	}
}
