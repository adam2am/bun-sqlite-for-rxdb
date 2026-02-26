import { describe, it, expect } from 'bun:test';
import { buildWhereClause } from '$app/query/builder';
import { mockSchema } from './shared-setup';

describe('Data Corruption - Type Operators', () => {
	describe('$type - Invalid Type Values', () => {
		it('invalid type string', () => {
			const result = buildWhereClause(
				{ age: { $type: 'invalid' } },
				mockSchema,
				'test'
			);
			expect(result).toEqual({ sql: '1=0', args: [] });
		});

		it('numeric type value', () => {
			const result = buildWhereClause(
				{ age: { $type: 123 as any } },
				mockSchema,
				'test'
			);
			expect(result).toEqual({ sql: '1=0', args: [] });
		});

		it('null type value', () => {
			const result = buildWhereClause(
				{ age: { $type: null as any } },
				mockSchema,
				'test'
			);
			expect(result).toBeDefined();
		});

		it('undefined type value', () => {
			const result = buildWhereClause(
				{ age: { $type: undefined as any } },
				mockSchema,
				'test'
			);
			expect(result).toBeDefined();
		});

		it('object type value', () => {
			const result = buildWhereClause(
				{ age: { $type: { nested: 'object' } as any } },
				mockSchema,
				'test'
			);
			expect(result).toBeDefined();
		});

		it('all 6 valid types should work', () => {
			const validTypes = ['null', 'boolean', 'number', 'string', 'array', 'object'];
			validTypes.forEach(type => {
				const result = buildWhereClause(
					{ age: { $type: type } },
					mockSchema,
					'test'
				);
				expect(result).not.toBeNull();
				expect(result?.sql).toContain('json_type');
			});
		});
	});

	describe('$exists - Corrupted Data', () => {
		it('$exists with string', () => {
			const result = buildWhereClause(
				{ name: { $exists: 'yes' as any } },
				mockSchema,
				'test'
			);
			expect(result).toBeDefined();
		});

		it('$exists with number', () => {
			const result = buildWhereClause(
				{ name: { $exists: 1 as any } },
				mockSchema,
				'test'
			);
			expect(result).toBeDefined();
		});

		it('$exists with null', () => {
			const result = buildWhereClause(
				{ name: { $exists: null as any } },
				mockSchema,
				'test'
			);
			expect(result).toBeDefined();
		});

		it('$exists with undefined', () => {
			const result = buildWhereClause(
				{ name: { $exists: undefined as any } },
				mockSchema,
				'test'
			);
			expect(result).toBeDefined();
		});
	});
});
