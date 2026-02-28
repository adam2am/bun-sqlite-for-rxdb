import { describe, it, expect } from 'bun:test';
import { buildWhereClause, clearCache } from '../../../src/query/builder';
import type { RxJsonSchema } from 'rxdb';
import type { RxDocumentData } from 'rxdb';

/**
 * TDD: GLOBAL_CACHE RegExp Stringify Pollution Regression Test
 * 
 * ROOT CAUSE: stableStringify() used JSON.stringify() for RegExp objects,
 * which returns "{}". This caused cache key collisions:
 * - { name: { $not: {} } } → cached as "1=0"
 * - { name: { $not: /test/i } } → stringifies to same key → returns cached "1=0"
 * 
 * SYMPTOM: { name: { $not: /test/i } } returns "1=0" instead of SQL with NOT
 * 
 * FIX: Updated stableStringify() to serialize RegExp as {"$regex":"pattern","$options":"flags"}
 */

describe('TDD: GLOBAL_CACHE regex stringify pollution regression test', () => {
	const mockSchema: RxJsonSchema<RxDocumentData<any>> = {
		version: 0,
		primaryKey: 'id',
		type: 'object',
		properties: {},
		required: []
	};

	it('should handle $not with RegExp after empty object cache pollution', () => {
		clearCache();
		
		const emptyResult = buildWhereClause({ name: { $not: {} } }, mockSchema, 'test');
		expect(emptyResult).not.toBeNull();
		expect(emptyResult!.sql).toBe('1=0');

		const pattern = /test/i;
		const result = buildWhereClause({ name: { $not: pattern } }, mockSchema, 'test');
		
		expect(result).not.toBeNull();
		expect(result!.sql).toContain('NOT');
		expect(result!.sql).toMatch(/LIKE|REGEXP/i);
		expect(result!.sql).not.toBe('1=0');
	});

	it('should handle multiple regex queries with same schema without cache issues', () => {
		clearCache();
		
		const queries = [
			{ name: { $regex: '^A' } },
			{ name: { $regex: 'test' } },
			{ name: { $not: /pattern/i } },
			{ name: { $regex: 'end$' } },
		];

		for (const query of queries) {
			const result = buildWhereClause(query, mockSchema, 'test');
			expect(result).not.toBeNull();
			expect(result!.sql).not.toBe('1=0');
		}
	});
});
