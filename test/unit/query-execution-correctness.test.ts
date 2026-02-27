import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { getRxStorageBunSQLite } from '$app/index';
import type { RxJsonSchema, RxStorageInstance, RxDocumentData } from 'rxdb';
import type { BunSQLiteStorageSettings, BunSQLiteInternals } from '$app/types';

interface TestDoc {
	id: string;
	name: string;
	age: number;
	status: string;
}

const schema: RxJsonSchema<RxDocumentData<TestDoc>> = {
	version: 0,
	primaryKey: 'id',
	type: 'object',
	properties: {
		id: { type: 'string', maxLength: 100 },
		name: { type: 'string' },
		age: { type: 'number' },
		status: { type: 'string' },
		_deleted: { type: 'boolean' },
		_attachments: { type: 'object' },
		_rev: { type: 'string' },
		_meta: { type: 'object', properties: { lwt: { type: 'number' } } }
	},
	required: ['id', '_deleted', '_attachments', '_rev', '_meta']
};

describe('Query Execution Correctness - Lazy vs Eager Paths', () => {
	let instance: RxStorageInstance<TestDoc, BunSQLiteInternals, BunSQLiteStorageSettings>;
	let testData: RxDocumentData<TestDoc>[];

	beforeAll(async () => {
		const storage = getRxStorageBunSQLite({ filename: ':memory:' });
		instance = await storage.createStorageInstance({
			databaseInstanceToken: 'correctness-token',
			databaseName: 'correctness-db',
			collectionName: 'correctness-collection',
			schema,
			options: {},
			multiInstance: false,
			devMode: false
		});

		// Insert 100 documents with deterministic IDs (zero-padded for string sorting)
		const docs = [];
		for (let i = 0; i < 100; i++) {
			const id = `doc-${String(i).padStart(3, '0')}`; // doc-000, doc-001, ..., doc-099
			docs.push({
				document: {
					id,
					name: `User ${i}`,
					age: 20 + (i % 50),
					status: i % 3 === 0 ? 'active' : 'inactive',
					_deleted: false,
					_attachments: {},
					_rev: '1-abc',
					_meta: { lwt: Date.now() + i } // Unique timestamps
				}
			});
		}
		await instance.bulkWrite(docs, 'correctness-setup');

		// Store test data for assertions
		const allDocs = await instance.query({
			query: { selector: {}, sort: [], skip: 0 },
			queryPlan: {
				index: ['id'],
				sortSatisfiedByIndex: false,
				selectorSatisfiedByIndex: false,
				startKeys: [],
				endKeys: [],
				inclusiveStart: true,
				inclusiveEnd: true
			}
		});
		testData = allDocs.documents;
	});

	afterAll(async () => {
		await instance.remove();
	});

	describe('Lazy Path (No Sort) - Insertion Order', () => {
		it('returns first N matching documents in insertion order', async () => {
			const result = await instance.query({
				query: {
					selector: { status: { $regex: '^active$' } },
					sort: [], // NO SORT = lazy path
					skip: 0,
					limit: 3
				},
				queryPlan: {
					index: ['id'],
					sortSatisfiedByIndex: false,
					selectorSatisfiedByIndex: false,
					startKeys: [],
					endKeys: [],
					inclusiveStart: true,
					inclusiveEnd: true
				}
			});

			// Active docs: doc-000, doc-003, doc-006, doc-009, ...
			expect(result.documents.map(d => d.id)).toEqual(['doc-000', 'doc-003', 'doc-006']);
		});

		it('respects skip in insertion order', async () => {
			const result = await instance.query({
				query: {
					selector: { status: { $regex: '^active$' } },
					sort: [],
					skip: 2,
					limit: 3
				},
				queryPlan: {
					index: ['id'],
					sortSatisfiedByIndex: false,
					selectorSatisfiedByIndex: false,
					startKeys: [],
					endKeys: [],
					inclusiveStart: true,
					inclusiveEnd: true
				}
			});

			// Skip first 2 active (doc-000, doc-003), return next 3
			expect(result.documents.map(d => d.id)).toEqual(['doc-006', 'doc-009', 'doc-012']);
		});

		it('handles skip beyond total matches', async () => {
			const result = await instance.query({
				query: {
					selector: { status: { $regex: '^active$' } },
					sort: [],
					skip: 1000,
					limit: 10
				},
				queryPlan: {
					index: ['id'],
					sortSatisfiedByIndex: false,
					selectorSatisfiedByIndex: false,
					startKeys: [],
					endKeys: [],
					inclusiveStart: true,
					inclusiveEnd: true
				}
			});

			expect(result.documents).toEqual([]);
		});
	});

	describe('Eager Path (With Sort) - Sorted Order', () => {
		it('returns first N matching documents in sorted order', async () => {
			const result = await instance.query({
				query: {
					selector: { status: { $regex: '^active$' } },
					sort: [{ id: 'asc' }], // WITH SORT = eager path
					skip: 0,
					limit: 3
				},
				queryPlan: {
					index: ['id'],
					sortSatisfiedByIndex: false,
					selectorSatisfiedByIndex: false,
					startKeys: [],
					endKeys: [],
					inclusiveStart: true,
					inclusiveEnd: true
				}
			});

			// Sorted by id: doc-000, doc-003, doc-006, ...
			expect(result.documents.map(d => d.id)).toEqual(['doc-000', 'doc-003', 'doc-006']);
		});

		it('respects skip in sorted order', async () => {
			const result = await instance.query({
				query: {
					selector: { status: { $regex: '^active$' } },
					sort: [{ id: 'asc' }],
					skip: 2,
					limit: 3
				},
				queryPlan: {
					index: ['id'],
					sortSatisfiedByIndex: false,
					selectorSatisfiedByIndex: false,
					startKeys: [],
					endKeys: [],
					inclusiveStart: true,
					inclusiveEnd: true
				}
			});

			// Skip first 2 sorted (doc-000, doc-003), return next 3
			expect(result.documents.map(d => d.id)).toEqual(['doc-006', 'doc-009', 'doc-012']);
		});

		it('sort changes which documents are selected', async () => {
			// Get last 3 active docs in sorted order
			const result = await instance.query({
				query: {
					selector: { status: { $regex: '^active$' } },
					sort: [{ id: 'desc' }], // Descending
					skip: 0,
					limit: 3
				},
				queryPlan: {
					index: ['id'],
					sortSatisfiedByIndex: false,
					selectorSatisfiedByIndex: false,
					startKeys: [],
					endKeys: [],
					inclusiveStart: true,
					inclusiveEnd: true
				}
			});

			// Highest IDs first: doc-099, doc-096, doc-093
			expect(result.documents.map(d => d.id)).toEqual(['doc-099', 'doc-096', 'doc-093']);
		});
	});

	describe('Invariants - Both Paths Must Satisfy', () => {
		const testCases = [
			{ skip: 0, limit: 10 },
			{ skip: 5, limit: 10 },
			{ skip: 30, limit: 10 },
			{ skip: 0, limit: undefined },
			{ skip: 10, limit: undefined }
		];

		for (const { skip, limit } of testCases) {
			it(`invariants hold for skip=${skip}, limit=${limit}`, async () => {
				const selector = { status: { $regex: '^active$' } };
				
				// Count total matching docs
				const totalMatching = testData.filter(d => d.status === 'active').length;

				// Query lazy path
				const lazyResult = await instance.query({
					query: { selector, sort: [], skip, limit },
					queryPlan: {
						index: ['id'],
						sortSatisfiedByIndex: false,
						selectorSatisfiedByIndex: false,
						startKeys: [],
						endKeys: [],
						inclusiveStart: true,
						inclusiveEnd: true
					}
				});

				// Query eager path
				const eagerResult = await instance.query({
					query: { selector, sort: [{ id: 'asc' }], skip, limit },
					queryPlan: {
						index: ['id'],
						sortSatisfiedByIndex: false,
						selectorSatisfiedByIndex: false,
						startKeys: [],
						endKeys: [],
						inclusiveStart: true,
						inclusiveEnd: true
					}
				});

				// Invariant 1: Result length <= limit (if limit specified)
				if (limit !== undefined) {
					expect(lazyResult.documents.length).toBeLessThanOrEqual(limit);
					expect(eagerResult.documents.length).toBeLessThanOrEqual(limit);
				}

				// Invariant 2: skip + result.length <= total matching
				expect(skip + lazyResult.documents.length).toBeLessThanOrEqual(totalMatching);
				expect(skip + eagerResult.documents.length).toBeLessThanOrEqual(totalMatching);

				// Invariant 3: All results match selector
				for (const doc of lazyResult.documents) {
					expect(doc.status).toBe('active');
				}
				for (const doc of eagerResult.documents) {
					expect(doc.status).toBe('active');
				}

				// Invariant 4: No duplicates
				const lazyIds = lazyResult.documents.map(d => d.id);
				const eagerIds = eagerResult.documents.map(d => d.id);
				expect(new Set(lazyIds).size).toBe(lazyIds.length);
				expect(new Set(eagerIds).size).toBe(eagerIds.length);
			});
		}
	});
});
