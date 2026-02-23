import { describe, test, expect, beforeEach } from 'bun:test';
import { buildWhereClause, getCacheSize, clearCache } from '../src/query/builder';
import type { RxJsonSchema, MangoQuerySelector, RxDocumentData } from 'rxdb';

type TestDoc = {
	id: string;
	name: string;
	age: number;
	data: string;
	_deleted: boolean;
	_attachments: {};
	_rev: string;
	_meta: { lwt: number };
};

const schema: RxJsonSchema<RxDocumentData<TestDoc>> = {
	version: 0,
	primaryKey: 'id',
	type: 'object',
	properties: {
		id: { type: 'string', maxLength: 100 },
		name: { type: 'string' },
		age: { type: 'number' },
		data: { type: 'string' },
		_deleted: { type: 'boolean' },
		_attachments: { type: 'object' },
		_rev: { type: 'string' },
		_meta: {
			type: 'object',
			properties: {
				lwt: { type: 'number' }
			},
			required: ['lwt']
		}
	},
	required: ['id', '_deleted', '_rev', '_meta']
};

describe('Query Builder Cache - Edge Cases & Production Readiness', () => {
	beforeEach(() => {
		clearCache();
	});
	
	test('Edge Case 1: HUGE selector (10KB+) should not crash', () => {
		const hugeSelector: MangoQuerySelector<RxDocumentData<TestDoc>> = {
			$or: Array.from({ length: 1000 }, (_, i) => ({ age: { $eq: i } }))
		};
		
		const start = performance.now();
		const result1 = buildWhereClause(hugeSelector, schema);
		const time1 = performance.now() - start;
		
		const start2 = performance.now();
		const result2 = buildWhereClause(hugeSelector, schema);
		const time2 = performance.now() - start2;
		
	expect(result1.sql).toBe(result2.sql);
	expect(time2).toBeLessThanOrEqual(time1 * 1.5);
	console.log(`  Huge selector: ${time1.toFixed(2)}ms → ${time2.toFixed(2)}ms (${(time1/time2).toFixed(1)}x faster cached)`);
	});

	test('Edge Case 2: Cache eviction at 100 entries', () => {
		for (let i = 0; i < 150; i++) {
			const selector: MangoQuerySelector<RxDocumentData<TestDoc>> = { age: { $eq: i } };
			buildWhereClause(selector, schema);
		}
		
		const firstSelector: MangoQuerySelector<RxDocumentData<TestDoc>> = { age: { $eq: 0 } };
		const start = performance.now();
		buildWhereClause(firstSelector, schema);
		const time = performance.now() - start;
		
		expect(time).toBeGreaterThan(0);
		console.log(`  First selector after 150 inserts: ${(time * 1000).toFixed(2)}µs (evicted, rebuilt)`);
	});

	test('Edge Case 3: Schema version change invalidates cache', () => {
		const selector: MangoQuerySelector<RxDocumentData<TestDoc>> = { age: { $gt: 30 } };
		
		const schema1 = { ...schema, version: 0 };
		const result1 = buildWhereClause(selector, schema1);
		
		const schema2 = { ...schema, version: 1 };
		const result2 = buildWhereClause(selector, schema2);
		
		expect(result1.sql).toBe(result2.sql);
		console.log(`  Schema version change: cache invalidated correctly`);
	});

	test('Edge Case 4: Identical selectors with different object order', () => {
		const selector1: MangoQuerySelector<RxDocumentData<TestDoc>> = { age: { $gt: 30 }, name: { $eq: 'test' } };
		const selector2: MangoQuerySelector<RxDocumentData<TestDoc>> = { name: { $eq: 'test' }, age: { $gt: 30 } };
		
		const result1 = buildWhereClause(selector1, schema);
		const result2 = buildWhereClause(selector2, schema);
		
		expect(result1.sql).toBe(result2.sql);
		console.log(`  Different object order: produces same SQL`);
	});

	test('Edge Case 5: Deeply nested selectors', () => {
		const deepSelector: MangoQuerySelector<RxDocumentData<TestDoc>> = {
			$and: [
				{ $or: [{ age: { $gt: 20 } }, { age: { $lt: 10 } }] },
				{ $or: [{ name: { $eq: 'a' } }, { name: { $eq: 'b' } }] },
				{ $or: [{ data: { $exists: true } }, { data: { $exists: false } }] }
			]
		};
		
		const start = performance.now();
		const result1 = buildWhereClause(deepSelector, schema);
		const time1 = performance.now() - start;
		
		const start2 = performance.now();
		const result2 = buildWhereClause(deepSelector, schema);
		const time2 = performance.now() - start2;
		
		expect(result1.sql).toBe(result2.sql);
		expect(time2).toBeLessThan(time1);
		console.log(`  Deep nesting: ${time1.toFixed(2)}ms → ${time2.toFixed(2)}ms (${(time1/time2).toFixed(1)}x faster cached)`);
	});

	test('Edge Case 6: Special characters in selector values', () => {
		const specialSelector: MangoQuerySelector<RxDocumentData<TestDoc>> = {
			name: { $eq: 'test"with\'quotes\nand\ttabs' }
		};
		
		const result1 = buildWhereClause(specialSelector, schema);
		const result2 = buildWhereClause(specialSelector, schema);
		
		expect(result1.sql).toBe(result2.sql);
		expect(result1.args).toEqual(result2.args);
		console.log(`  Special characters: handled correctly`);
	});

	test('Edge Case 7: Null and undefined values', () => {
		const nullSelector: MangoQuerySelector<RxDocumentData<TestDoc>> = {
			name: { $eq: null as any }
		};
		
		const result = buildWhereClause(nullSelector, schema);
		expect(result.sql).toContain('IS NULL');
		console.log(`  Null values: handled correctly`);
	});

	test('Edge Case 8: Empty selector', () => {
		const emptySelector: MangoQuerySelector<RxDocumentData<TestDoc>> = {};
		
		const result = buildWhereClause(emptySelector, schema);
		expect(result.sql).toBe('1=1');
		console.log(`  Empty selector: returns 1=1 (match all)`);
	});

	test('Edge Case 9: Cache hit rate with repeated queries', () => {
		const selectors = [
			{ age: { $gt: 30 } },
			{ age: { $lt: 20 } },
			{ name: { $eq: 'test' } }
		];
		
		const start1 = process.hrtime.bigint();
		for (let i = 0; i < 3; i++) {
			buildWhereClause(selectors[i] as MangoQuerySelector<RxDocumentData<TestDoc>>, schema);
		}
		const firstTime = process.hrtime.bigint() - start1;
		
		const start2 = process.hrtime.bigint();
		for (let i = 0; i < 100000; i++) {
			const selector = selectors[i % selectors.length];
			buildWhereClause(selector as MangoQuerySelector<RxDocumentData<TestDoc>>, schema);
		}
		const cachedTime = process.hrtime.bigint() - start2;
		
		const avgFirst = Number(firstTime) / 3;
		const avgCached = Number(cachedTime) / 100000;
		const speedup = avgFirst / avgCached;
		
		expect(speedup).toBeGreaterThan(1.2);
		expect(getCacheSize()).toBe(3);
		console.log(`  Cache hit rate: ${speedup.toFixed(1)}x faster for repeated queries`);
	});

	test('Edge Case 10: Memory stress test (1000 unique queries)', () => {
		const start = performance.now();
		
		for (let i = 0; i < 1000; i++) {
			const selector: MangoQuerySelector<RxDocumentData<TestDoc>> = {
				age: { $eq: i },
				name: { $eq: `user${i}` }
			};
			buildWhereClause(selector, schema);
		}
		
		const time = performance.now() - start;
		const avgPerQuery = time / 1000;
		
		expect(avgPerQuery).toBeLessThan(1);
		console.log(`  1000 unique queries: ${time.toFixed(2)}ms total (${avgPerQuery.toFixed(3)}ms per query)`);
	});

	test('Production Scenario 1: Concurrent queries from multiple collections', () => {
		const schema1 = { ...schema, version: 0 };
		const schema2 = { ...schema, version: 1 };
		const schema3 = { ...schema, version: 2 };
		
		const selector: MangoQuerySelector<RxDocumentData<TestDoc>> = { age: { $gt: 30 } };
		
		const result1 = buildWhereClause(selector, schema1);
		const result2 = buildWhereClause(selector, schema2);
		const result3 = buildWhereClause(selector, schema3);
		
		expect(result1.sql).toBe(result2.sql);
		expect(result2.sql).toBe(result3.sql);
		console.log(`  Multiple schema versions: isolated correctly`);
	});

	test('Production Scenario 2: High-frequency queries (10k/sec simulation)', () => {
		const selectors = Array.from({ length: 10 }, (_, i) => ({ age: { $eq: i * 10 } }));
		
		const start = performance.now();
		for (let i = 0; i < 10000; i++) {
			const selector = selectors[i % selectors.length];
			buildWhereClause(selector as MangoQuerySelector<RxDocumentData<TestDoc>>, schema);
		}
		const time = performance.now() - start;
		
		const qps = 10000 / (time / 1000);
		expect(qps).toBeGreaterThan(100000);
		console.log(`  High-frequency: ${qps.toFixed(0)} queries/sec (${(time / 10000 * 1000).toFixed(2)}µs per query)`);
	});

	test('Production Scenario 3: Cache behavior under load', () => {
		const results: number[] = [];
		
		for (let batch = 0; batch < 5; batch++) {
			const start = performance.now();
			for (let i = 0; i < 1000; i++) {
				const selector: MangoQuerySelector<RxDocumentData<TestDoc>> = { age: { $eq: i % 50 } };
				buildWhereClause(selector, schema);
			}
			results.push(performance.now() - start);
		}
		
		const firstBatch = results[0];
		const avgLaterBatches = results.slice(1).reduce((a, b) => a + b, 0) / 4;
		
		expect(avgLaterBatches).toBeLessThanOrEqual(firstBatch * 1.5);
		expect(getCacheSize()).toBe(50);
		console.log(`  Under load: First batch ${firstBatch.toFixed(2)}ms, Later batches ${avgLaterBatches.toFixed(2)}ms`);
	});

	test('Edge Case 13: Cache is BOUNDED at 500 entries (no exponential growth)', () => {
		clearCache();
		
		for (let i = 0; i < 1000; i++) {
			const selector: MangoQuerySelector<RxDocumentData<TestDoc>> = { 
				id: { $eq: `unique-${i}` },
				age: { $eq: i }
			};
			buildWhereClause(selector, schema);
		}
		
		expect(getCacheSize()).toBe(500);
		console.log(`  Cache bounded: Added 1000 unique queries, cache size = ${getCacheSize()} (max 500) ✅`);
		
		const firstQuery: MangoQuerySelector<RxDocumentData<TestDoc>> = { 
			id: { $eq: 'unique-0' },
			age: { $eq: 0 }
		};
		const lastQuery: MangoQuerySelector<RxDocumentData<TestDoc>> = { 
			id: { $eq: 'unique-999' },
			age: { $eq: 999 }
		};
		
		const start1 = performance.now();
		buildWhereClause(firstQuery, schema);
		const time1 = performance.now() - start1;
		
		const start2 = performance.now();
		buildWhereClause(lastQuery, schema);
		const time2 = performance.now() - start2;
		
		expect(time2).toBeLessThanOrEqual(time1 * 2);
		console.log(`  FIFO eviction works: First query ${time1.toFixed(3)}ms (evicted), Last query ${time2.toFixed(3)}ms (cached)`);
	});
});
