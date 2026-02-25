import { describe, it, expect } from 'bun:test';
import { buildWhereClause } from '$app/query/builder';
import { mockSchema } from './shared-setup';

describe('Data Corruption - Comparison Operators', () => {
	describe('$eq/$ne - Corrupted Data', () => {
		it('$eq with NaN', () => {
			const result = buildWhereClause(
				{ age: { $eq: NaN } },
				mockSchema,
				'test'
			);
			expect(result).toBeDefined();
		});

		it('$eq with Infinity', () => {
			const result = buildWhereClause(
				{ age: { $eq: Infinity } },
				mockSchema,
				'test'
			);
			expect(result).toBeDefined();
		});

		it('$eq with -Infinity', () => {
			const result = buildWhereClause(
				{ age: { $eq: -Infinity } },
				mockSchema,
				'test'
			);
			expect(result).toBeDefined();
		});

		it('$ne with function', () => {
			const result = buildWhereClause(
				{ age: { $ne: (() => {}) as any } },
				mockSchema,
				'test'
			);
			expect(result).toBeDefined();
		});

		it('$ne with symbol', () => {
			const result = buildWhereClause(
				{ age: { $ne: Symbol('test') as any } },
				mockSchema,
				'test'
			);
			expect(result).toBeDefined();
		});
	});

	describe('$gt/$gte/$lt/$lte - Corrupted Data', () => {
		it('$gt with string', () => {
			const result = buildWhereClause(
				{ age: { $gt: 'invalid' as any } },
				mockSchema,
				'test'
			);
			expect(result).toBeDefined();
		});

		it('$gte with array', () => {
			const result = buildWhereClause(
				{ age: { $gte: [1, 2, 3] as any } },
				mockSchema,
				'test'
			);
			expect(result).toBeDefined();
		});

		it('$lt with object', () => {
			const result = buildWhereClause(
				{ age: { $lt: { nested: 'object' } as any } },
				mockSchema,
				'test'
			);
			expect(result).toBeDefined();
		});

		it('$lte with boolean', () => {
			const result = buildWhereClause(
				{ age: { $lte: true as any } },
				mockSchema,
				'test'
			);
			expect(result).toBeDefined();
		});

		it('$gt with NaN', () => {
			const result = buildWhereClause(
				{ age: { $gt: NaN } },
				mockSchema,
				'test'
			);
			expect(result).toBeDefined();
		});

		it('$lt with Infinity', () => {
			const result = buildWhereClause(
				{ age: { $lt: Infinity } },
				mockSchema,
				'test'
			);
			expect(result).toBeDefined();
		});

		it('$in with null', () => {
			const result = buildWhereClause(
				{ age: { $in: null as any } },
				mockSchema,
				'test'
			);
			expect(result).toBeDefined();
		});

		it('$in with non-array', () => {
			const result = buildWhereClause(
				{ age: { $in: 'invalid' as any } },
				mockSchema,
				'test'
			);
			expect(result).toBeDefined();
		});

		it('$gt with null', () => {
			const result = buildWhereClause(
				{ age: { $gt: null as any } },
				mockSchema,
				'test'
			);
			expect(result).toBeDefined();
		});

		it('$gt with undefined', () => {
			const result = buildWhereClause(
				{ age: { $gt: undefined as any } },
				mockSchema,
				'test'
			);
			expect(result).toBeDefined();
		});
	});

	describe('$mod - Corrupted Data', () => {
		it('$mod with string', () => {
			const result = buildWhereClause(
				{ age: { $mod: 'invalid' as any } },
				mockSchema,
				'test'
			);
			expect(result).toBeDefined();
		});

		it('$mod with single number instead of array', () => {
			const result = buildWhereClause(
				{ age: { $mod: 5 as any } },
				mockSchema,
				'test'
			);
			expect(result).toBeDefined();
		});

		it('$mod with empty array', () => {
			const result = buildWhereClause(
				{ age: { $mod: [] as any } },
				mockSchema,
				'test'
			);
			expect(result).toBeDefined();
		});

		it('$mod with array of 1 element', () => {
			const result = buildWhereClause(
				{ age: { $mod: [5] as any } },
				mockSchema,
				'test'
			);
			expect(result).toBeDefined();
		});

		it('$mod with array of 3+ elements', () => {
			const result = buildWhereClause(
				{ age: { $mod: [5, 2, 3] as any } },
				mockSchema,
				'test'
			);
			expect(result).toBeDefined();
		});

		it('$mod with null', () => {
			const result = buildWhereClause(
				{ age: { $mod: null as any } },
				mockSchema,
				'test'
			);
			expect(result).toBeDefined();
		});

		it('$mod with [0, 0] (division by zero)', () => {
			const result = buildWhereClause(
				{ age: { $mod: [0, 0] } },
				mockSchema,
				'test'
			);
			expect(result).toBeDefined();
		});
	});
});
