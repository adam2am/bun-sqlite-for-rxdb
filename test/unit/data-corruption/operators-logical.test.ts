import { describe, it, expect } from 'bun:test';
import { buildWhereClause } from '$app/query/builder';
import { mockSchema } from './shared-setup';

describe('Data Corruption - Logical Operators', () => {
	describe('Logical Operators - Corrupted Data', () => {
		it('$and with empty array', () => {
			const result = buildWhereClause(
				{ $and: [] },
				mockSchema,
				'test'
			);
			expect(result).toBeDefined();
		});

		it('$and with null', () => {
			const result = buildWhereClause(
				{ $and: null as any },
				mockSchema,
				'test'
			);
			expect(result).toBeDefined();
		});

		it('$or with empty array', () => {
			const result = buildWhereClause(
				{ $or: [] },
				mockSchema,
				'test'
			);
			expect(result).toBeDefined();
		});

		it('$or with non-array', () => {
			const result = buildWhereClause(
				{ $or: 'invalid' as any },
				mockSchema,
				'test'
			);
			expect(result).toBeDefined();
		});
	});

	describe('$not - Corrupted Data', () => {
		it('$not with null', () => {
			const result = buildWhereClause(
				{ age: { $not: null as any } },
				mockSchema,
				'test'
			);
			expect(result).toBeDefined();
		});

		it('$not with undefined', () => {
			const result = buildWhereClause(
				{ age: { $not: undefined as any } },
				mockSchema,
				'test'
			);
			expect(result).toBeDefined();
		});

		it('$not with string', () => {
			const result = buildWhereClause(
				{ age: { $not: 'invalid' as any } },
				mockSchema,
				'test'
			);
			expect(result).toBeDefined();
		});

		it('$not with empty object', () => {
			const result = buildWhereClause(
				{ age: { $not: {} } },
				mockSchema,
				'test'
			);
			expect(result).toBeDefined();
		});
	});
});
