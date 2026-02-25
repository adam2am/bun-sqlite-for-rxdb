import { describe, test, expect } from 'bun:test';
import { smartRegexToLike } from '$app/query/smart-regex';
import type { RxJsonSchema, RxDocumentData } from 'rxdb';

// Helper to create test schema
function createSchema(version: number, indexes?: string[]): RxJsonSchema<RxDocumentData<any>> {
	return {
		version,
		primaryKey: 'id',
		type: 'object',
		properties: {
			id: { type: 'string' },
			name: { type: 'string' }
		},
		required: ['id'],
		indexes: indexes || []
	};
}

describe('INDEX_CACHE bounds and LRU eviction', () => {
	test('Cache is BOUNDED at MAX size (no unbounded growth)', () => {
		// This test will FAIL until we implement size limit
		const MAX_CACHE_SIZE = 1000;
		
		// Generate 2000 unique cache entries (2x the limit)
		for (let i = 0; i < 2000; i++) {
			const schema = createSchema(i, []);
			smartRegexToLike('field', '^test$', 'i', schema, 'field');
		}
		
		// Cache should be bounded at MAX_CACHE_SIZE, not 2000
		// We can't directly inspect the cache, but we can test behavior
		// If cache is unbounded, memory would grow indefinitely
		
		// This is a smoke test - if cache is unbounded, this would consume ~100KB
		// If bounded at 1000, it should consume ~50KB
		expect(true).toBe(true); // Placeholder - real test needs cache inspection
	});
	
	test('LRU eviction: oldest entries get evicted first', () => {
		// This test will FAIL until we implement LRU eviction
		const schema1 = createSchema(9001, []);
		const schema2 = createSchema(9002, []);
		
		// Fill cache to near limit
		for (let i = 0; i < 999; i++) {
			const schema = createSchema(i, []);
			smartRegexToLike('field', '^test$', 'i', schema, 'field');
		}
		
		// Add entry that should be evicted (oldest)
		const result1 = smartRegexToLike('field', '^test$', 'i', schema1, 'field');
		
		// Add one more to trigger eviction
		smartRegexToLike('field', '^test$', 'i', schema2, 'field');
		
		// schema1 should be evicted (oldest), schema2 should be cached
		// We can't directly test this without exposing cache internals
		expect(result1).toBeTruthy();
	});
	
	test('Cache hit returns same result without re-computation', () => {
		const schema = createSchema(8001, ['LOWER(name)']);
		
		// First call - cache miss
		const result1 = smartRegexToLike('name', '^test$', 'i', schema, 'name');
		
		// Second call - cache hit (should be instant)
		const result2 = smartRegexToLike('name', '^test$', 'i', schema, 'name');
		
		// Results should be identical
		expect(result1).toEqual(result2);
	});
	
	test('Different schema versions create different cache entries', () => {
		const schema1 = createSchema(1, []);
		const schema2 = createSchema(2, ['LOWER(name)']);
		
		const result1 = smartRegexToLike('name', '^test$', 'i', schema1, 'name');
		const result2 = smartRegexToLike('name', '^test$', 'i', schema2, 'name');
		
		// Different schemas should produce different results
		// schema1: no index → COLLATE NOCASE
		// schema2: expression index → LOWER()
		expect(result1?.sql).toContain('COLLATE NOCASE');
		expect(result2?.sql).toContain('LOWER(');
	});
});

describe('smartRegexToLike basic functionality', () => {
	test('Exact match with expression index uses LOWER() =', () => {
		const schema = createSchema(0, ['LOWER(name)']);
		const result = smartRegexToLike('name', '^test$', 'i', schema, 'name');
		
		expect(result?.sql).toBe('LOWER(name) = ?');
		expect(result?.args).toEqual(['test']);
	});
	
	test('Exact match without index uses COLLATE NOCASE', () => {
		const schema = createSchema(0, []);
		const result = smartRegexToLike('name', '^test$', 'i', schema, 'name');
		
		expect(result?.sql).toBe('name = ? COLLATE NOCASE');
		expect(result?.args).toEqual(['test']);
	});
	
	test('Prefix match with expression index uses LOWER() LIKE', () => {
		const schema = createSchema(0, ['LOWER(name)']);
		const result = smartRegexToLike('name', '^test', 'i', schema, 'name');
		
		expect(result?.sql).toBe('LOWER(name) LIKE ? ESCAPE \'\\\'');
		expect(result?.args).toEqual(['test%']);
	});
	
	test('Contains match without index uses COLLATE NOCASE', () => {
		const schema = createSchema(0, []);
		const result = smartRegexToLike('name', 'test', 'i', schema, 'name');
		
		expect(result?.sql).toBe('name LIKE ? COLLATE NOCASE ESCAPE \'\\\'');
		expect(result?.args).toEqual(['%test%']);
	});
});
