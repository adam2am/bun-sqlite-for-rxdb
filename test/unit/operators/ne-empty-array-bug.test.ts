import { describe, it, expect } from 'bun:test';
import { buildWhereClause } from '$app/query/builder';
import { Query } from 'mingo';
import type { RxJsonSchema, RxDocumentData } from 'rxdb';

interface TestDoc {
	id: string;
	tags: string[];
}

const schema: RxJsonSchema<RxDocumentData<TestDoc>> = {
	version: 0,
	primaryKey: 'id',
	type: 'object',
	properties: {
		id: { type: 'string' },
		tags: { type: 'array', items: { type: 'string' } },
		_deleted: { type: 'boolean' },
		_attachments: { type: 'object' },
		_rev: { type: 'string' },
		_meta: { type: 'object', properties: { lwt: { type: 'number' } } }
	},
	required: ['id', '_deleted', '_attachments', '_rev', '_meta']
};

describe('BUG: $ne on empty arrays', () => {
	it('should match documents where array does NOT contain value (MongoDB semantics)', () => {
		const docs = [
			{ id: '1', tags: ['admin', 'user'] },
			{ id: '2', tags: ['user'] },
			{ id: '3', tags: [] } // Empty array
		];

		// Test with Mingo (MongoDB reference)
		const mingoQuery = new Query({ tags: { $ne: 20 } });
		const mingoResults = mingoQuery.find<{ id: string; tags: any[] }>(docs).all();
		const mingoIds = mingoResults.map(d => d.id).sort();

		console.log('Mingo results:', mingoIds);
		console.log('Expected: ["1", "2", "3"] because none of the arrays contain 20');

		// Check our SQL generation
		const result = buildWhereClause({ tags: { $ne: 20 } }, schema, 'test');
		console.log('Our SQL:', result?.sql);
		console.log('Our args:', result?.args);

		// MongoDB semantics: {array: {$ne: value}} means "array does NOT contain value"
		// Empty array [] does NOT contain 20 → SHOULD MATCH
		expect(mingoIds).toContain('3');
		
		// Our current SQL: EXISTS (SELECT 1 FROM jsonb_each(field) WHERE value <> ?)
		// This returns FALSE for empty arrays (no elements to check)
		// WRONG! Should be: NOT EXISTS (SELECT 1 FROM jsonb_each(field) WHERE value = ?)
	});

	it('should NOT match documents where array DOES contain value', () => {
		const docs = [
			{ id: '1', tags: ['admin', 20] }, // Contains 20
			{ id: '2', tags: [20] }, // Contains 20
			{ id: '3', tags: [] } // Empty array
		];

		const mingoQuery = new Query({ tags: { $ne: 20 } });
		const mingoResults = mingoQuery.find<{ id: string; tags: any[] }>(docs).all();
		const mingoIds = mingoResults.map(d => d.id).sort();

		console.log('Mingo results:', mingoIds);
		console.log('Expected: ["3"] because only empty array does not contain 20');

		// Should match only doc 3 (empty array)
		expect(mingoIds).toEqual(['3']);
	});

	it('demonstrates the correct SQL pattern', () => {
		console.log('');
		console.log('WRONG (current):');
		console.log('  EXISTS (SELECT 1 FROM jsonb_each(field) WHERE value <> ?)');
		console.log('  Empty array: EXISTS(...) = FALSE (no elements) ❌');
		console.log('');
		console.log('CORRECT (should be):');
		console.log('  NOT EXISTS (SELECT 1 FROM jsonb_each(field) WHERE value = ?)');
		console.log('  Empty array: NOT EXISTS(...) = TRUE (no elements equal value) ✅');
	});
});
