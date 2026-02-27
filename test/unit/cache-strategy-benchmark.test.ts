import { describe, it, expect } from 'bun:test';
import { stableStringify } from '$app/utils/stable-stringify';
import type { PreparedQuery, RxDocumentData, RxJsonSchema } from 'rxdb';

interface TestDocType {
	id: string;
	name: string;
	age: number;
	status: string;
}

const mockSchema: RxJsonSchema<RxDocumentData<TestDocType>> = {
	version: 0,
	primaryKey: 'id',
	type: 'object',
	properties: {
		id: { type: 'string' },
		name: { type: 'string' },
		age: { type: 'number' },
		status: { type: 'string' },
		_deleted: { type: 'boolean' },
		_attachments: { type: 'object' },
		_rev: { type: 'string' },
		_meta: { 
			type: 'object',
			properties: {
				lwt: { type: 'number' }
			}
		}
	},
	required: ['id']
};

function createMockPreparedQuery(selector: any, sort?: any[], limit?: number, skip?: number): PreparedQuery<TestDocType> {
	return {
		query: {
			selector,
			sort: sort || [],
			limit: limit,
			skip: skip || 0
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
	} as any;
}

describe('Cache Strategy Benchmark: selector vs query', () => {
	describe('Stringify Performance', () => {
		it('measures stringify overhead for selector-only (current)', () => {
			const queries = [
				createMockPreparedQuery({ age: { $gt: 18 } }),
				createMockPreparedQuery({ status: 'active' }),
				createMockPreparedQuery({ $and: [{ age: { $gte: 21 } }, { status: 'verified' }] })
			];

			const iterations = 10000;
			const start = performance.now();
			
			for (let i = 0; i < iterations; i++) {
				for (const query of queries) {
					stableStringify(query.query.selector);
				}
			}
			
			const elapsed = performance.now() - start;
			const perQuery = elapsed / (iterations * queries.length);
			
			console.log(`Selector-only: ${elapsed.toFixed(2)}ms total, ${perQuery.toFixed(4)}ms per query`);
			expect(perQuery).toBeLessThan(0.1);
		});

		it('measures stringify overhead for entire query (Option C)', () => {
			const queries = [
				createMockPreparedQuery({ age: { $gt: 18 } }, [{ age: 'asc' }], 10),
				createMockPreparedQuery({ status: 'active' }, [{ name: 'desc' }], 20, 5),
				createMockPreparedQuery({ $and: [{ age: { $gte: 21 } }, { status: 'verified' }] }, [], 100)
			];

			const iterations = 10000;
			const start = performance.now();
			
			for (let i = 0; i < iterations; i++) {
				for (const query of queries) {
					stableStringify(query.query);
				}
			}
			
			const elapsed = performance.now() - start;
			const perQuery = elapsed / (iterations * queries.length);
			
			console.log(`Entire query: ${elapsed.toFixed(2)}ms total, ${perQuery.toFixed(4)}ms per query`);
			expect(perQuery).toBeLessThan(0.2);
		});

		it('compares overhead: selector vs query', () => {
			const query = createMockPreparedQuery(
				{ $and: [{ age: { $gte: 21 } }, { status: 'verified' }] },
				[{ age: 'asc' }, { name: 'desc' }],
				50,
				10
			);

			const iterations = 100000;

			const selectorStart = performance.now();
			for (let i = 0; i < iterations; i++) {
				stableStringify(query.query.selector);
			}
			const selectorTime = performance.now() - selectorStart;

			const queryStart = performance.now();
			for (let i = 0; i < iterations; i++) {
				stableStringify(query.query);
			}
			const queryTime = performance.now() - queryStart;

			const overhead = ((queryTime - selectorTime) / selectorTime * 100).toFixed(1);
			console.log(`Selector: ${selectorTime.toFixed(2)}ms, Query: ${queryTime.toFixed(2)}ms, Overhead: ${overhead}%`);
			
			expect(queryTime).toBeLessThan(selectorTime * 3);
		});
	});

	describe('Cache Hit Rate Analysis', () => {
		it('selector-only: same selector with different sort/limit (current behavior)', () => {
			const cache = new Map<string, string>();
			const selector = { age: { $gt: 18 } };

			const queries = [
				createMockPreparedQuery(selector, [{ age: 'asc' }], 10),
				createMockPreparedQuery(selector, [{ age: 'desc' }], 10),
				createMockPreparedQuery(selector, [{ age: 'asc' }], 20),
				createMockPreparedQuery(selector, [], 50)
			];

			let hits = 0;
			let misses = 0;

			for (const query of queries) {
				const key = stableStringify(query.query.selector);
				if (cache.has(key)) {
					hits++;
				} else {
					misses++;
					cache.set(key, 'WHERE age > ?');
				}
			}

			console.log(`Selector-only: ${hits} hits, ${misses} misses (${(hits / queries.length * 100).toFixed(1)}% hit rate)`);
			expect(hits).toBe(3);
			expect(misses).toBe(1);
		});

		it('entire query: same selector with different sort/limit (Option C)', () => {
			const cache = new Map<string, string>();
			const selector = { age: { $gt: 18 } };

			const queries = [
				createMockPreparedQuery(selector, [{ age: 'asc' }], 10),
				createMockPreparedQuery(selector, [{ age: 'desc' }], 10),
				createMockPreparedQuery(selector, [{ age: 'asc' }], 20),
				createMockPreparedQuery(selector, [], 50)
			];

			let hits = 0;
			let misses = 0;

			for (const query of queries) {
				const key = stableStringify(query.query);
				if (cache.has(key)) {
					hits++;
				} else {
					misses++;
					cache.set(key, 'WHERE age > ?');
				}
			}

			console.log(`Entire query: ${hits} hits, ${misses} misses (${(hits / queries.length * 100).toFixed(1)}% hit rate)`);
			expect(hits).toBe(0);
			expect(misses).toBe(4);
		});

		it('realistic workload: mixed queries', () => {
			const selectorCache = new Map<string, string>();
			const queryCache = new Map<string, string>();

			const workload = [
				createMockPreparedQuery({ age: { $gt: 18 } }),
				createMockPreparedQuery({ age: { $gt: 18 } }, [{ age: 'asc' }]),
				createMockPreparedQuery({ age: { $gt: 18 } }, [{ age: 'desc' }]),
				createMockPreparedQuery({ status: 'active' }),
				createMockPreparedQuery({ status: 'active' }, [], 10),
				createMockPreparedQuery({ status: 'active' }, [], 20),
				createMockPreparedQuery({ age: { $gt: 18 } }),
				createMockPreparedQuery({ status: 'active' }),
				createMockPreparedQuery({ age: { $gt: 18 } }, [{ age: 'asc' }]),
				createMockPreparedQuery({ status: 'active' }, [], 10)
			];

			let selectorHits = 0, selectorMisses = 0;
			let queryHits = 0, queryMisses = 0;

			for (const query of workload) {
				const selectorKey = stableStringify(query.query.selector);
				if (selectorCache.has(selectorKey)) {
					selectorHits++;
				} else {
					selectorMisses++;
					selectorCache.set(selectorKey, 'WHERE ...');
				}

				const queryKey = stableStringify(query.query);
				if (queryCache.has(queryKey)) {
					queryHits++;
				} else {
					queryMisses++;
					queryCache.set(queryKey, 'WHERE ...');
				}
			}

			const selectorHitRate = (selectorHits / workload.length * 100).toFixed(1);
			const queryHitRate = (queryHits / workload.length * 100).toFixed(1);

			console.log(`Selector-only: ${selectorHits} hits, ${selectorMisses} misses (${selectorHitRate}% hit rate)`);
			console.log(`Entire query: ${queryHits} hits, ${queryMisses} misses (${queryHitRate}% hit rate)`);
			console.log(`Cache entries: Selector=${selectorCache.size}, Query=${queryCache.size}`);

			expect(selectorHits).toBeGreaterThan(queryHits);
		});
	});

	describe('Scale Testing', () => {
		it('stress test: 10k queries with selector-only caching', () => {
			const cache = new Map<string, string>();
			const selectors = [
				{ age: { $gt: 18 } },
				{ status: 'active' },
				{ $and: [{ age: { $gte: 21 } }, { status: 'verified' }] },
				{ name: { $regex: '^A' } },
				{ age: { $in: [25, 30, 35] } }
			];

			const iterations = 10000;
			let hits = 0, misses = 0;
			const start = performance.now();

			for (let i = 0; i < iterations; i++) {
				const selector = selectors[i % selectors.length];
				const query = createMockPreparedQuery(selector, [{ age: 'asc' }], 10 + (i % 5));
				const key = stableStringify(query.query.selector);

				if (cache.has(key)) {
					hits++;
				} else {
					misses++;
					cache.set(key, 'WHERE ...');
				}
			}

			const elapsed = performance.now() - start;
			const hitRate = (hits / iterations * 100).toFixed(1);
			const perQuery = (elapsed / iterations).toFixed(4);

			console.log(`10k queries (selector): ${elapsed.toFixed(2)}ms total, ${perQuery}ms per query`);
			console.log(`Hit rate: ${hitRate}%, Cache size: ${cache.size}`);

			expect(hits).toBeGreaterThan(iterations * 0.9);
		});

		it('stress test: 10k queries with entire query caching', () => {
			const cache = new Map<string, string>();
			const selectors = [
				{ age: { $gt: 18 } },
				{ status: 'active' },
				{ $and: [{ age: { $gte: 21 } }, { status: 'verified' }] },
				{ name: { $regex: '^A' } },
				{ age: { $in: [25, 30, 35] } }
			];

			const iterations = 10000;
			let hits = 0, misses = 0;
			const start = performance.now();

			for (let i = 0; i < iterations; i++) {
				const selector = selectors[i % selectors.length];
				const query = createMockPreparedQuery(selector, [{ age: 'asc' }], 10 + (i % 5));
				const key = stableStringify(query.query);

				if (cache.has(key)) {
					hits++;
				} else {
					misses++;
					cache.set(key, 'WHERE ...');
				}
			}

			const elapsed = performance.now() - start;
			const hitRate = (hits / iterations * 100).toFixed(1);
			const perQuery = (elapsed / iterations).toFixed(4);

			console.log(`10k queries (entire): ${elapsed.toFixed(2)}ms total, ${perQuery}ms per query`);
			console.log(`Hit rate: ${hitRate}%, Cache size: ${cache.size}`);

			expect(cache.size).toBeGreaterThanOrEqual(selectors.length);
		});
	});

	describe('Cache Pollution Analysis', () => {
		it('demonstrates cache pollution with Option C', () => {
			const selectorCache = new Map<string, string>();
			const queryCache = new Map<string, string>();

			const selector = { age: { $gt: 18 } };
			const limits = [10, 20, 50, 100];
			const sorts = [
				[{ age: 'asc' }],
				[{ age: 'desc' }],
				[{ name: 'asc' }],
				[]
			];

			for (const limit of limits) {
				for (const sort of sorts) {
					const query = createMockPreparedQuery(selector, sort, limit);
					
					const selectorKey = stableStringify(query.query.selector);
					selectorCache.set(selectorKey, 'WHERE age > ?');

					const queryKey = stableStringify(query.query);
					queryCache.set(queryKey, 'WHERE age > ?');
				}
			}

			console.log(`Same WHERE clause cached:`);
			console.log(`  Selector-only: ${selectorCache.size} entries (correct)`);
			console.log(`  Entire query: ${queryCache.size} entries (pollution)`);
			console.log(`  Pollution factor: ${queryCache.size}x`);

			expect(selectorCache.size).toBe(1);
			expect(queryCache.size).toBe(16);
		});
	});
});
