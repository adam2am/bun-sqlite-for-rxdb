import { describe, it, expect } from 'bun:test';
import { buildWhereClause } from '$app/query/builder';
import { mockSchema } from './shared-setup';

describe('Data Corruption - Partial Data', () => {
	describe('Partial/Incomplete Data - Simulating Crashes', () => {
		it('operator object with missing value', () => {
			const result = buildWhereClause(
				{ age: { $gt: undefined } as any },
				mockSchema,
				'test'
			);
			expect(result).toBeDefined();
		});

		it('incomplete $and array (partial crash)', () => {
			const result = buildWhereClause(
				{ $and: [{ age: 18 }, undefined, { name: 'test' }] as any },
				mockSchema,
				'test'
			);
			expect(result).toBeDefined();
		});

		it('incomplete $or array (partial crash)', () => {
			const result = buildWhereClause(
				{ $or: [null, { age: 18 }, undefined] as any },
				mockSchema,
				'test'
			);
			expect(result).toBeDefined();
		});

		it('half-written operator object', () => {
			const result = buildWhereClause(
				{ age: { $gt: 10, $lt: undefined } as any },
				mockSchema,
				'test'
			);
			expect(result).toBeDefined();
		});

		it('corrupted nested structure', () => {
			const result = buildWhereClause(
				{ $and: [{ age: { $gt: null } }, undefined] as any },
				mockSchema,
				'test'
			);
			expect(result).toBeDefined();
		});
	});

	describe('Mixed Valid/Invalid Operators', () => {
		it('valid + invalid operators in same query', () => {
			const result = buildWhereClause(
				{ age: { $gt: 18, $invalidOp: 'trash' } as any },
				mockSchema,
				'test'
			);
			expect(result).toBeDefined();
		});

		it('multiple invalid operators', () => {
			const result = buildWhereClause(
				{ age: { $fake1: 1, $fake2: 2, $fake3: 3 } as any },
				mockSchema,
				'test'
			);
			expect(result).toBeDefined();
		});

		it('valid operator with corrupted value + invalid operator', () => {
			const result = buildWhereClause(
				{ age: { $gt: null, $randomOp: 'garbage' } as any },
				mockSchema,
				'test'
			);
			expect(result).toBeDefined();
		});
	});

	describe('Wrong Value Types for Operators', () => {
		it('$and with object instead of array', () => {
			const result = buildWhereClause(
				{ $and: { age: 18 } as any },
				mockSchema,
				'test'
			);
			expect(result).toBeDefined();
		});

		it('$or with string instead of array', () => {
			const result = buildWhereClause(
				{ $or: 'not-an-array' as any },
				mockSchema,
				'test'
			);
			expect(result).toBeDefined();
		});

		it('$nor with number instead of array', () => {
			const result = buildWhereClause(
				{ $nor: 123 as any },
				mockSchema,
				'test'
			);
			expect(result).toBeDefined();
		});

		it('$elemMatch with array instead of object', () => {
			const result = buildWhereClause(
				{ tags: { $elemMatch: [1, 2, 3] as any } },
				mockSchema,
				'test'
			);
			expect(result).toBeDefined();
		});
	});

	describe('Malformed Nested Structures', () => {
		it('deeply nested with nulls at random levels', () => {
			const result = buildWhereClause(
				{ $and: [{ $or: [null, { age: 18 }] }, null] as any },
				mockSchema,
				'test'
			);
			expect(result).toBeDefined();
		});

		it('nested operators with undefined values', () => {
			const result = buildWhereClause(
				{ $and: [{ age: { $gt: undefined } }, { name: undefined }] as any },
				mockSchema,
				'test'
			);
			expect(result).toBeDefined();
		});

		it('$not wrapping invalid operator', () => {
			const result = buildWhereClause(
				{ age: { $not: { $invalidOp: 18 } } as any },
				mockSchema,
				'test'
			);
			expect(result).toBeDefined();
		});

		it('$elemMatch with corrupted nested $and', () => {
			const result = buildWhereClause(
				{ tags: { $elemMatch: { $and: null } } as any },
				mockSchema,
				'test'
			);
			expect(result).toBeDefined();
		});
	});
});
