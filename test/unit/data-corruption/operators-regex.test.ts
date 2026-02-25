import { describe, it, expect } from 'bun:test';
import { buildWhereClause } from '$app/query/builder';
import { mockSchema } from './shared-setup';

describe('Data Corruption - Regex Operators', () => {
	describe('$regex - Corrupted Patterns', () => {
		it('null pattern', () => {
			const result = buildWhereClause(
				{ name: { $regex: null as any } },
				mockSchema,
				'test'
			);
			expect(result).toBeDefined();
		});

		it('undefined pattern', () => {
			const result = buildWhereClause(
				{ name: { $regex: undefined as any } },
				mockSchema,
				'test'
			);
			expect(result).toBeDefined();
		});

		it('numeric pattern', () => {
			const result = buildWhereClause(
				{ name: { $regex: 123 as any } },
				mockSchema,
				'test'
			);
			expect(result).toBeDefined();
		});

		it('object pattern', () => {
			const result = buildWhereClause(
				{ name: { $regex: { nested: 'object' } as any } },
				mockSchema,
				'test'
			);
			expect(result).toBeDefined();
		});

		it('empty string pattern', () => {
			const result = buildWhereClause(
				{ name: { $regex: '' } },
				mockSchema,
				'test'
			);
			expect(result).toBeDefined();
		});
	});
});
