import { describe, test, expect } from 'bun:test';
import { categorizeBulkWriteRows, ensureRxStorageInstanceParamsAreCorrect } from '$app/rxdb-helpers';
import type { BulkWriteRow, RxDocumentData, RxStorageInstance, RxStorageInstanceCreationParams, RxStorageDefaultCheckpoint, RxStorageCountResult, EventBulk, RxStorageChangeEvent, RxJsonSchema } from 'rxdb';
import { Subject } from 'rxjs';

type TestDoc = {
	id: string;
	name: string;
	age: number;
};

type TestInternals = Record<string, never>;
type TestOptions = Record<string, never>;

const createTestSchema = (overrides: Partial<RxJsonSchema<RxDocumentData<TestDoc>>> = {}): RxJsonSchema<RxDocumentData<TestDoc>> => ({
	version: 0,
	primaryKey: 'id',
	type: 'object',
	properties: {
		id: { type: 'string', maxLength: 100 },
		name: { type: 'string' },
		age: { type: 'number' },
		_deleted: { type: 'boolean' },
		_attachments: { type: 'object' },
		_rev: { type: 'string' },
		_meta: { type: 'object' }
	},
	required: ['id'],
	...overrides
} as RxJsonSchema<RxDocumentData<TestDoc>>);

function createMockStorageInstance<T>(): RxStorageInstance<T, TestInternals, TestOptions, RxStorageDefaultCheckpoint> {
	const changeStreamSubject = new Subject<EventBulk<RxStorageChangeEvent<T>, RxStorageDefaultCheckpoint>>();
	
	return {
		schema: createTestSchema() as Readonly<RxJsonSchema<RxDocumentData<T>>>,
		collectionName: 'test',
		databaseName: 'testdb',
		options: {},
		internals: {},
		bulkWrite: async () => ({ error: [] }),
		findDocumentsById: async () => [],
		query: async () => ({ documents: [] }),
		count: async (): Promise<RxStorageCountResult> => ({ count: 0, mode: 'fast' }),
		getAttachmentData: async () => '',
		getChangedDocumentsSince: async () => ({ 
			documents: [], 
			checkpoint: { id: '', lwt: 0 } 
		}),
		changeStream: () => changeStreamSubject.asObservable(),
		cleanup: async () => true,
		close: async () => {},
		remove: async () => {}
	};
}

describe('categorizeBulkWriteRows', () => {
	test('INSERT: no previous, no doc in DB → bulkInsertDocs', () => {
		const docsInDb = new Map<string, RxDocumentData<TestDoc>>();
		const writeRows: BulkWriteRow<TestDoc>[] = [{
			document: {
				id: 'doc1',
				name: 'Test',
				age: 25,
				_deleted: false,
				_attachments: {},
				_rev: '1-a',
				_meta: { lwt: 1000 }
			}
		}];

		const result = categorizeBulkWriteRows(
			createMockStorageInstance<TestDoc>(),
			'id',
			docsInDb,
			writeRows,
			'test-context'
		);

		expect(result.bulkInsertDocs.length).toBe(1);
		expect(result.bulkUpdateDocs.length).toBe(0);
		expect(result.errors.length).toBe(0);
		expect(result.eventBulk.events.length).toBe(1);
		expect(result.eventBulk.events[0].operation).toBe('INSERT');
	});

	test('INSERT conflict: no previous, doc exists in DB → error 409', () => {
		const existingDoc: RxDocumentData<TestDoc> = {
			id: 'doc1',
			name: 'Existing',
			age: 30,
			_deleted: false,
			_attachments: {},
			_rev: '1-a',
			_meta: { lwt: 500 }
		};
		const docsInDb = new Map([['doc1', existingDoc]]);
		const writeRows: BulkWriteRow<TestDoc>[] = [{
			document: {
				id: 'doc1',
				name: 'New',
				age: 25,
				_deleted: false,
				_attachments: {},
				_rev: '1-b',
				_meta: { lwt: 1000 }
			}
		}];

		const result = categorizeBulkWriteRows(
			createMockStorageInstance<TestDoc>(),
			'id',
			docsInDb,
			writeRows,
			'test-context'
		);

		expect(result.bulkInsertDocs.length).toBe(0);
		expect(result.bulkUpdateDocs.length).toBe(0);
		expect(result.errors.length).toBe(1);
		expect(result.errors[0].status).toBe(409);
		expect('documentInDb' in result.errors[0]).toBe(true);
		if ('documentInDb' in result.errors[0]) {
			expect(result.errors[0].documentInDb).toEqual(existingDoc);
		}
		expect(result.eventBulk.events.length).toBe(0);
	});

	test('UPDATE: previous matches DB revision → bulkUpdateDocs', () => {
		const existingDoc: RxDocumentData<TestDoc> = {
			id: 'doc1',
			name: 'Old',
			age: 30,
			_deleted: false,
			_attachments: {},
			_rev: '1-a',
			_meta: { lwt: 500 }
		};
		const docsInDb = new Map([['doc1', existingDoc]]);
		const writeRows: BulkWriteRow<TestDoc>[] = [{
			previous: existingDoc,
			document: {
				id: 'doc1',
				name: 'Updated',
				age: 31,
				_deleted: false,
				_attachments: {},
				_rev: '2-b',
				_meta: { lwt: 1000 }
			}
		}];

		const result = categorizeBulkWriteRows(
			createMockStorageInstance<TestDoc>(),
			'id',
			docsInDb,
			writeRows,
			'test-context'
		);

		expect(result.bulkInsertDocs.length).toBe(0);
		expect(result.bulkUpdateDocs.length).toBe(1);
		expect(result.errors.length).toBe(0);
		expect(result.eventBulk.events.length).toBe(1);
		expect(result.eventBulk.events[0].operation).toBe('UPDATE');
	});

	test('UPDATE conflict: previous revision mismatch → error 409', () => {
		const existingDoc: RxDocumentData<TestDoc> = {
			id: 'doc1',
			name: 'Current',
			age: 30,
			_deleted: false,
			_attachments: {},
			_rev: '2-b',
			_meta: { lwt: 800 }
		};
		const docsInDb = new Map([['doc1', existingDoc]]);
		const writeRows: BulkWriteRow<TestDoc>[] = [{
			previous: {
				id: 'doc1',
				name: 'Old',
				age: 30,
				_deleted: false,
				_attachments: {},
				_rev: '1-a',
				_meta: { lwt: 500 }
			},
			document: {
				id: 'doc1',
				name: 'Updated',
				age: 31,
				_deleted: false,
				_attachments: {},
				_rev: '3-c',
				_meta: { lwt: 1000 }
			}
		}];

		const result = categorizeBulkWriteRows(
			createMockStorageInstance<TestDoc>(),
			'id',
			docsInDb,
			writeRows,
			'test-context'
		);

		expect(result.bulkInsertDocs.length).toBe(0);
		expect(result.bulkUpdateDocs.length).toBe(0);
		expect(result.errors.length).toBe(1);
		expect(result.errors[0].status).toBe(409);
		expect('documentInDb' in result.errors[0]).toBe(true);
		if ('documentInDb' in result.errors[0]) {
			expect(result.errors[0].documentInDb).toEqual(existingDoc);
		}
		expect(result.eventBulk.events.length).toBe(0);
	});

	test('DELETE operation: previous not deleted, document deleted → DELETE event', () => {
		const existingDoc: RxDocumentData<TestDoc> = {
			id: 'doc1',
			name: 'Active',
			age: 30,
			_deleted: false,
			_attachments: {},
			_rev: '1-a',
			_meta: { lwt: 500 }
		};
		const docsInDb = new Map([['doc1', existingDoc]]);
		const writeRows: BulkWriteRow<TestDoc>[] = [{
			previous: existingDoc,
			document: {
				id: 'doc1',
				name: 'Active',
				age: 30,
				_deleted: true,
				_attachments: {},
				_rev: '2-b',
				_meta: { lwt: 1000 }
			}
		}];

		const result = categorizeBulkWriteRows(
			createMockStorageInstance<TestDoc>(),
			'id',
			docsInDb,
			writeRows,
			'test-context'
		);

		expect(result.bulkUpdateDocs.length).toBe(1);
		expect(result.eventBulk.events[0].operation).toBe('DELETE');
	});

	test('checkpoint: uses newestRow document for checkpoint', () => {
		const docsInDb = new Map<string, RxDocumentData<TestDoc>>();
		const writeRows: BulkWriteRow<TestDoc>[] = [
			{
				document: {
					id: 'doc1',
					name: 'First',
					age: 25,
					_deleted: false,
					_attachments: {},
					_rev: '1-a',
					_meta: { lwt: 1000 }
				}
			},
			{
				document: {
					id: 'doc2',
					name: 'Last',
					age: 30,
					_deleted: false,
					_attachments: {},
					_rev: '1-b',
					_meta: { lwt: 2000 }
				}
			}
		];

		const result = categorizeBulkWriteRows(
			createMockStorageInstance<TestDoc>(),
			'id',
			docsInDb,
			writeRows,
			'test-context'
		);

		expect(result.newestRow).toBeDefined();
		expect(result.newestRow?.document.id).toBe('doc2');
		expect(result.newestRow?.document._meta.lwt).toBe(2000);
		
		if (result.newestRow) {
			result.eventBulk.checkpoint = {
				id: result.newestRow.document.id,
				lwt: result.newestRow.document._meta.lwt
			};
		}
		
		expect(result.eventBulk.checkpoint).toEqual({ id: 'doc2', lwt: 2000 });
	});
});

describe('ensureRxStorageInstanceParamsAreCorrect', () => {
	test('throws UT6 when schema uses encryption but no password', () => {
		const params: RxStorageInstanceCreationParams<TestDoc, TestOptions> = {
			schema: createTestSchema({ encrypted: ['field1'] }),
			password: undefined,
			databaseInstanceToken: 'test-token',
			databaseName: 'testdb',
			collectionName: 'testcol',
			options: {},
			multiInstance: false,
			devMode: false
		};

		expect(() => ensureRxStorageInstanceParamsAreCorrect(params)).toThrow('UT6');
	});

	test('does not throw when schema has no encryption', () => {
		const params: RxStorageInstanceCreationParams<TestDoc, TestOptions> = {
			schema: createTestSchema(),
			databaseInstanceToken: 'test-token',
			databaseName: 'testdb',
			collectionName: 'testcol',
			options: {},
			multiInstance: false,
			devMode: false
		};

		expect(() => ensureRxStorageInstanceParamsAreCorrect(params)).not.toThrow();
	});

	test('throws UT5 when schema uses keyCompression', () => {
		const params: RxStorageInstanceCreationParams<TestDoc, TestOptions> = {
			schema: createTestSchema({ keyCompression: true }),
			databaseInstanceToken: 'test-token',
			databaseName: 'testdb',
			collectionName: 'testcol',
			options: {},
			multiInstance: false,
			devMode: false
		};

		expect(() => ensureRxStorageInstanceParamsAreCorrect(params)).toThrow('UT5');
	});
});
