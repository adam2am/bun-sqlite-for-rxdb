import { describe, it, expect } from 'bun:test';
import { buildWhereClause } from '$app/query/builder';
import { mockSchema } from './shared-setup';

describe('Data Corruption - Array Operators', () => {
	describe('$elemMatch - Corrupted Data', () => {
		it('empty criteria object', () => {
			const result = buildWhereClause(
				{ tags: { $elemMatch: {} } },
				mockSchema,
				'test'
			);
			expect(result).toBeNull();
		});

		it('null criteria', () => {
			const result = buildWhereClause(
				{ tags: { $elemMatch: null as any } },
				mockSchema,
				'test'
			);
			expect(result).toBeDefined();
		});

		it('undefined criteria', () => {
			const result = buildWhereClause(
				{ tags: { $elemMatch: undefined as any } },
				mockSchema,
				'test'
			);
			expect(result).toBeDefined();
		});

		it('string instead of object', () => {
			const result = buildWhereClause(
				{ tags: { $elemMatch: 'invalid' as any } },
				mockSchema,
				'test'
			);
			expect(result).toBeDefined();
		});

		it('number instead of object', () => {
			const result = buildWhereClause(
				{ tags: { $elemMatch: 123 as any } },
				mockSchema,
				'test'
			);
			expect(result).toBeDefined();
		});
	});

	describe('$size - Corrupted Data', () => {
		it('$size with string', () => {
			const result = buildWhereClause(
				{ tags: { $size: 'invalid' as any } },
				mockSchema,
				'test'
			);
			expect(result).toBeDefined();
		});

		it('$size with negative number', () => {
			const result = buildWhereClause(
				{ tags: { $size: -5 } },
				mockSchema,
				'test'
			);
			expect(result).toBeDefined();
		});

		it('$size with float', () => {
			const result = buildWhereClause(
				{ tags: { $size: 3.14 } },
				mockSchema,
				'test'
			);
			expect(result).toBeDefined();
		});

		it('$size with NaN', () => {
			const result = buildWhereClause(
				{ tags: { $size: NaN } },
				mockSchema,
				'test'
			);
			expect(result).toBeDefined();
		});

		it('$size with null', () => {
			const result = buildWhereClause(
				{ tags: { $size: null as any } },
				mockSchema,
				'test'
			);
			expect(result).toBeDefined();
		});
	});

	describe('$in/$nin - Corrupted Data', () => {
		it('$in with string instead of array', () => {
			const result = buildWhereClause(
				{ age: { $in: 'not-an-array' as any } },
				mockSchema,
				'test'
			);
			expect(result).toBeDefined();
		});

		it('$in with object instead of array', () => {
			const result = buildWhereClause(
				{ age: { $in: { key: 'value' } as any } },
				mockSchema,
				'test'
			);
			expect(result).toBeDefined();
		});

		it('$in with array containing functions', () => {
			const result = buildWhereClause(
				{ age: { $in: [1, () => {}, 3] as any } },
				mockSchema,
				'test'
			);
			expect(result).toBeDefined();
		});

		it('$in with array containing symbols', () => {
			const result = buildWhereClause(
				{ age: { $in: [1, Symbol('test'), 3] as any } },
				mockSchema,
				'test'
			);
			expect(result).toBeDefined();
		});

		it('$nin with undefined', () => {
			const result = buildWhereClause(
				{ age: { $nin: undefined as any } },
				mockSchema,
				'test'
			);
			expect(result).toBeDefined();
		});

		it('$nin with number', () => {
			const result = buildWhereClause(
				{ age: { $nin: 123 as any } },
				mockSchema,
				'test'
			);
			expect(result).toBeDefined();
		});
	});
});
