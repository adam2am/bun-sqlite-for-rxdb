import { describe, it, expect } from 'bun:test';
import { matchesSelector } from '../../src/query/lightweight-matcher';
import { buildWhereClause } from '../../src/query/builder';
import type { RxJsonSchema, RxDocumentData } from 'rxdb';

/**
 * [REGRESSION TEST] Verify the 3 Critical "Black Holes" Are FIXED
 * 
 * These tests verify that the following bugs are FIXED:
 * 1. Exact Object Match vs. Drill-Down Illusion (SQL translation generates loose matches)
 * 2. In-Memory Fallback === Disaster (Array/Object strict equality fails)
 * 3. The Fallback Ignorance Bug (Silent matches for literal objects and $not primitives)
 * 
 * If any of these tests FAIL, it means the bug has REGRESSED.
 */

describe('[REGRESSION] The 3 Architectural Black Holes (FIXED)', () => {

	// Dummy schema for SQL builder tests
	const mockSchema: RxJsonSchema<RxDocumentData<any>> = {
		version: 0,
		primaryKey: 'id',
		type: 'object',
		properties: {
			id: { type: 'string' },
			address: { type: 'object' },
			tags: { type: 'array' }
		},
		required: ['id']
	};

	// ============================================================
	// BLACK HOLE 1: Exact Object Match (FIXED)
	// ============================================================
	describe('BLACK HOLE 1: SQL Builder Does Exact Match (FIXED)', () => {
		it('VERIFIES FIX: Translates { address: { city: "NY" } } to exact object match', () => {
			const query = { address: { city: 'NY' } };
			
			console.log('\n=== BLACK HOLE 1: Exact Object Match (FIXED) ===');
			console.log('Query:', JSON.stringify(query));
			
			const result = buildWhereClause(query, mockSchema, 'test');
			
			console.log('Generated SQL:', result?.sql);
			console.log('Expected: json_extract(data, \'$.address\') = json(?)');
			console.log('Actual:', result?.sql);

			// Should use json() for exact object match, not drill down
			expect(result?.sql).toContain('json_extract(data, \'$.address\') = json(?)');
			expect(result?.sql).not.toContain('$.address.city');
		});
	});

	// ============================================================
	// BLACK HOLE 2: Array Equality (FIXED)
	// ============================================================
	describe('BLACK HOLE 2: JS Matcher uses stableStringify for Arrays/Objects (FIXED)', () => {
		it('VERIFIES FIX: Matches identical arrays correctly', () => {
			const doc = { id: '1', tags: ['admin', 'user'] };
			const query = { tags: { $eq: ['admin', 'user'] } };

			console.log('\n=== BLACK HOLE 2: Array Equality (FIXED) ===');
			console.log('Doc:', JSON.stringify(doc));
			console.log('Query:', JSON.stringify(query));

			const result = matchesSelector(doc, query);

			console.log('Result:', result);
			console.log('Expected: true (arrays are structurally identical)');
			console.log('Actual:', result);

			// Should match identical arrays using stableStringify
			expect(result).toBe(true); 
		});
	});

	// ============================================================
	// BLACK HOLE 3: Literal Objects and Primitives (FIXED)
	// ============================================================
	describe('BLACK HOLE 3: JS Matcher handles literal objects and primitives (FIXED)', () => {
		
		it('VERIFIES FIX 3a: Correctly rejects non-matching objects', () => {
			// Document is in LA, query is for NY
			const doc = { id: '1', address: { city: 'LA' } };
			const query = { address: { city: 'NY' } };

			console.log('\n=== BLACK HOLE 3a: Literal Object Matching (FIXED) ===');
			console.log('Doc (LA):', JSON.stringify(doc));
			console.log('Query (NY):', JSON.stringify(query));

			const result = matchesSelector(doc, query);

			console.log('Result:', result);
			console.log('Expected: false (LA != NY)');
			console.log('Actual:', result);

			// Should correctly detect literal objects and compare them
			expect(result).toBe(false);
		});

		it('VERIFIES FIX 3b: Handles primitives inside $not correctly', () => {
			const doc = { id: '1', age: 10 };
			const query = { age: { $not: 5 } }; // Age is NOT 5

			console.log('\n=== BLACK HOLE 3b: $not with primitive (FIXED) ===');
			console.log('Doc (age 10):', JSON.stringify(doc));
			console.log('Query (age NOT 5):', JSON.stringify(query));

			const result = matchesSelector(doc, query);

			console.log('Result:', result);
			console.log('Expected: true (10 is not 5)');
			console.log('Actual:', result);

			// Should convert $not with primitive to $ne
			expect(result).toBe(true);
		});
	});
});
