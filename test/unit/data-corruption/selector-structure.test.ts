import { describe, it, expect } from 'bun:test';
import { buildWhereClause } from '$app/query/builder';
import { mockSchema } from './shared-setup';

describe('Data Corruption - Selector Structure', () => {
	describe('Selector Structure - Corrupted Data', () => {
		it('empty selector', () => {
			const result = buildWhereClause({}, mockSchema, 'test');
			expect(result).not.toBeNull();
			expect(result?.sql).toBe('1=1');
		});

		it('null selector', () => {
			const result = buildWhereClause(null as any, mockSchema, 'test');
			expect(result).toBeDefined();
		});

		it('undefined selector', () => {
			const result = buildWhereClause(undefined as any, mockSchema, 'test');
			expect(result).toBeDefined();
		});

		it('selector with undefined values', () => {
			const result = buildWhereClause(
				{ age: undefined as any },
				mockSchema,
				'test'
			);
			expect(result).toBeDefined();
		});

		it('selector with null values', () => {
			const result = buildWhereClause(
				{ age: null },
				mockSchema,
				'test'
			);
			expect(result).not.toBeNull();
			expect(result?.sql).toContain('IS NULL');
		});
	});

	describe('Nested Fields - Corrupted Data', () => {
		it('deeply nested field with dots', () => {
			const result = buildWhereClause(
				{ 'metadata.user.profile.name': 'test' },
				mockSchema,
				'test'
			);
		expect(result).not.toBeNull();
		expect(result?.sql).toContain('json_extract');
		});

		it('field with special characters', () => {
			const result = buildWhereClause(
				{ 'field-with-dashes': 'test' },
				mockSchema,
				'test'
			);
			expect(result).toBeDefined();
		});

		it('field with spaces', () => {
			const result = buildWhereClause(
				{ 'field with spaces': 'test' },
				mockSchema,
				'test'
			);
			expect(result).toBeDefined();
		});
	});
});
