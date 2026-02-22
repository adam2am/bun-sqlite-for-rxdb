import { describe, it, expect } from 'bun:test';
import { translateEq, translateNe, translateGt, translateGte, translateLt, translateLte } from './operators';

describe('Query Operators', () => {
	describe('translateEq', () => {
		it('translates equality with value', () => {
			const result = translateEq('age', 18);
			expect(result.sql).toBe('age = ?');
			expect(result.args).toEqual([18]);
		});

		it('translates equality with null', () => {
			const result = translateEq('status', null);
			expect(result.sql).toBe('status IS NULL');
			expect(result.args).toEqual([]);
		});

		it('translates equality with string', () => {
			const result = translateEq('name', 'Alice');
			expect(result.sql).toBe('name = ?');
			expect(result.args).toEqual(['Alice']);
		});
	});

	describe('translateNe', () => {
		it('translates not equal with value', () => {
			const result = translateNe('age', 18);
			expect(result.sql).toBe('age <> ?');
			expect(result.args).toEqual([18]);
		});

		it('translates not equal with null', () => {
			const result = translateNe('status', null);
			expect(result.sql).toBe('status IS NOT NULL');
			expect(result.args).toEqual([]);
		});
	});

	describe('translateGt', () => {
		it('translates greater than', () => {
			const result = translateGt('age', 18);
			expect(result.sql).toBe('age > ?');
			expect(result.args).toEqual([18]);
		});
	});

	describe('translateGte', () => {
		it('translates greater than or equal', () => {
			const result = translateGte('age', 18);
			expect(result.sql).toBe('age >= ?');
			expect(result.args).toEqual([18]);
		});
	});

	describe('translateLt', () => {
		it('translates less than', () => {
			const result = translateLt('age', 18);
			expect(result.sql).toBe('age < ?');
			expect(result.args).toEqual([18]);
		});
	});

	describe('translateLte', () => {
		it('translates less than or equal', () => {
			const result = translateLte('age', 18);
			expect(result.sql).toBe('age <= ?');
			expect(result.args).toEqual([18]);
		});
	});
});
