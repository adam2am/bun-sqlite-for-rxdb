import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { getRxStorageBunSQLite } from '$app/storage';
import type { RxStorageInstance, RxDocumentData } from 'rxdb';

interface TestDoc {
	id: string;
	name: string;
	age: number;
	status: string;
	_deleted: boolean;
	_attachments: {};
	_rev: string;
	_meta: { lwt: number };
}

describe('Partial SQL Pushdown - Performance Bugs', () => {
	let instance: RxStorageInstance<TestDoc, any, any>;

	beforeAll(async () => {
		const storage = getRxStorageBunSQLite();
		instance = await storage.createStorageInstance<TestDoc>({
			databaseInstanceToken: `partial-pushdown-bugs-${Date.now()}`,
			databaseName: 'test',
			collectionName: 'users',
			schema: {
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
					_meta: {
						type: 'object',
						properties: { lwt: { type: 'number' } }
					}
				},
				required: ['id', 'name', 'age', 'status', '_deleted', '_attachments', '_rev', '_meta']
			},
			options: {},
			multiInstance: false,
			devMode: false
		});

		// Insert 1000 test documents
		const docs: Array<{ document: RxDocumentData<TestDoc> }> = [];
		for (let i = 0; i < 1000; i++) {
			docs.push({
				document: {
					id: `user${i}`,
					name: `Alice${i % 100}`,
					age: 18 + (i % 50),
					status: i % 2 === 0 ? 'active' : 'inactive',
					_deleted: false,
					_attachments: {},
					_rev: '1-abc',
					_meta: { lwt: Date.now() }
				}
			});
		}
		await instance.bulkWrite(docs, 'test');
	});

	afterAll(async () => {
		await instance.close();
	});

	describe('Bug 1: LIMIT/OFFSET not pushed to SQL when jsSelector === null', () => {
		it('should push LIMIT to SQL for pure SQL queries (no JS filtering needed)', async () => {
			// Pure SQL query: { status: 'active' }
			// jsSelector should be null, so LIMIT should be pushed to SQL
			const result = await instance.query({
				query: {
					selector: { status: 'active' },
					sort: [],
					skip: 0,
					limit: 10
				},
				queryPlan: {
					index: [],
					startKeys: [],
					endKeys: [],
					inclusiveStart: true,
					inclusiveEnd: true,
					sortSatisfiedByIndex: false,
					selectorSatisfiedByIndex: false
				}
			});

			expect(result.documents.length).toBe(10);
			
			// Performance check: Should be fast because SQL does LIMIT
			// If we fetch all 500 active docs and slice in JS, it's slower
			const start = performance.now();
			for (let i = 0; i < 10; i++) {
				await instance.query({
					query: { selector: { status: 'active' }, sort: [], skip: 0, limit: 10 },
					queryPlan: { index: [], startKeys: [], endKeys: [], inclusiveStart: true, inclusiveEnd: true, sortSatisfiedByIndex: false, selectorSatisfiedByIndex: false }
				});
			}
			const elapsed = performance.now() - start;
			
			// Should be < 50ms for 10 iterations (avg 5ms per query)
			// If fetching all 500 rows, would be > 100ms
			console.log(`   ⏱️  Pure SQL with LIMIT: ${(elapsed / 10).toFixed(2)}ms per query`);
			expect(elapsed).toBeLessThan(100);
		});

		it('should push SKIP to SQL for pure SQL queries', async () => {
			const result = await instance.query({
				query: {
					selector: { status: 'active' },
					sort: [{ id: 'asc' }],
					skip: 10,
					limit: 5
				},
				queryPlan: {
					index: [],
					startKeys: [],
					endKeys: [],
					inclusiveStart: true,
					inclusiveEnd: true,
					sortSatisfiedByIndex: false,
					selectorSatisfiedByIndex: false
				}
			});

			expect(result.documents.length).toBe(5);
			expect(result.documents[0].id).toBe('user116');
			
			const start = performance.now();
			for (let i = 0; i < 10; i++) {
				await instance.query({
					query: { selector: { status: 'active' }, sort: [{ id: 'asc' }], skip: 400, limit: 5 },
					queryPlan: { index: [], startKeys: [], endKeys: [], inclusiveStart: true, inclusiveEnd: true, sortSatisfiedByIndex: false, selectorSatisfiedByIndex: false }
				});
			}
			const elapsed = performance.now() - start;
			
			console.log(`   ⏱️  Pure SQL with SKIP+LIMIT: ${(elapsed / 10).toFixed(2)}ms per query`);
			expect(elapsed).toBeLessThan(100);
		});

		it('should NOT push LIMIT to SQL when jsSelector !== null (mixed query)', async () => {
			const result = await instance.query({
				query: {
					selector: { status: 'active', name: { $regex: '^Alice[0-9]$' } },
					sort: [],
					skip: 0,
					limit: 5
				},
				queryPlan: {
					index: [],
					startKeys: [],
					endKeys: [],
					inclusiveStart: true,
					inclusiveEnd: true,
					sortSatisfiedByIndex: false,
					selectorSatisfiedByIndex: false
				}
			});

			expect(result.documents.length).toBe(5);
			
			for (const doc of result.documents) {
				expect(doc.status).toBe('active');
				expect(doc.name).toMatch(/^Alice[0-9]$/);
			}
		});
	});

	describe('Bug 2: count() does not handle partial SQL correctly', () => {
		it('should use partial SQL for count() with mixed queries', async () => {
			const result = await instance.count({
				query: {
					selector: { status: 'active', name: { $regex: '^Alice[0-9]$' } },
					sort: [],
					skip: 0
				},
				queryPlan: {
					index: [],
					startKeys: [],
					endKeys: [],
					inclusiveStart: true,
					inclusiveEnd: true,
					sortSatisfiedByIndex: false,
					selectorSatisfiedByIndex: false
				}
			});

			expect(result.count).toBe(50);
			expect(result.mode).toBe('fast');
		});

		it('should return correct count for pure SQL queries', async () => {
			const result = await instance.count({
				query: {
					selector: { status: 'active' },
					sort: [],
					skip: 0
				},
				queryPlan: {
					index: [],
					startKeys: [],
					endKeys: [],
					inclusiveStart: true,
					inclusiveEnd: true,
					sortSatisfiedByIndex: false,
					selectorSatisfiedByIndex: false
				}
			});

			expect(result.count).toBe(500);
			expect(result.mode).toBe('fast');
		});

		it('should return correct count for pure regex queries', async () => {
			const result = await instance.count({
				query: {
					selector: { name: { $regex: '^Alice[0-9]$' } },
					sort: [],
					skip: 0
				},
				queryPlan: {
					index: [],
					startKeys: [],
					endKeys: [],
					inclusiveStart: true,
					inclusiveEnd: true,
					sortSatisfiedByIndex: false,
					selectorSatisfiedByIndex: false
				}
			});

			expect(result.count).toBe(100);
			expect(result.mode).toBe('fast');
		});

		it('should be faster with partial SQL than full table scan', async () => {
			const start1 = performance.now();
			await instance.count({
				query: { selector: { name: { $regex: '^Alice[0-9]$' } }, sort: [], skip: 0 },
				queryPlan: { index: [], startKeys: [], endKeys: [], inclusiveStart: true, inclusiveEnd: true, sortSatisfiedByIndex: false, selectorSatisfiedByIndex: false }
			});
			const pureRegexTime = performance.now() - start1;

			const start2 = performance.now();
			await instance.count({
				query: { selector: { status: 'active', name: { $regex: '^Alice[0-9]$' } }, sort: [], skip: 0 },
				queryPlan: { index: [], startKeys: [], endKeys: [], inclusiveStart: true, inclusiveEnd: true, sortSatisfiedByIndex: false, selectorSatisfiedByIndex: false }
			});
			const mixedTime = performance.now() - start2;

			console.log(`   ⏱️  Pure regex count: ${pureRegexTime.toFixed(2)}ms`);
			console.log(`   ⏱️  Mixed SQL+regex count: ${mixedTime.toFixed(2)}ms`);

			expect(mixedTime).toBeLessThan(pureRegexTime * 1.5);
		});
	});
});
