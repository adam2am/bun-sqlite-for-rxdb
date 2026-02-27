import { describe, it, expect } from 'bun:test';
import { translateIn, translateNin } from '$app/query/operators';

describe('Statement Cache Optimization (Issue #1)', () => {
	describe('$in operator - json_each() pattern', () => {
		it('should use json_each() to prevent statement cache thrashing', () => {
			const result = translateIn('age', [25, 30, 35]);
			
			expect(result.sql).toBe('age IN (SELECT value FROM json_each(?))');
			expect(result.args).toEqual(['[25,30,35]']);
		});

		it('should generate same SQL for different array lengths', () => {
			const result1 = translateIn('id', [1, 2]);
			const result2 = translateIn('id', [1, 2, 3, 4, 5]);
			const result3 = translateIn('id', Array.from({ length: 1000 }, (_, i) => i));

			expect(result1.sql).toBe(result2.sql);
			expect(result2.sql).toBe(result3.sql);
			expect(result1.sql).toBe('id IN (SELECT value FROM json_each(?))');
		});

		it('should handle NULL values with json_each()', () => {
			const result = translateIn('status', ['active', null, 'pending']);
			
			expect(result.sql).toBe('(status IN (SELECT value FROM json_each(?)) OR status IS NULL)');
			expect(result.args).toEqual(['["active","pending"]']);
		});

		it('should handle empty array as always false', () => {
			const result = translateIn('field', []);
			
			expect(result.sql).toBe('1=0');
			expect(result.args).toEqual([]);
		});

		it('should handle array with only NULL', () => {
			const result = translateIn('field', [null]);
			
			expect(result.sql).toBe('field IS NULL');
			expect(result.args).toEqual([]);
		});

		it('should correctly serialize different data types in JSON', () => {
			const result1 = translateIn('age', [25, 30, 35]);
			const result2 = translateIn('name', ['Alice', 'Bob', 'Charlie']);
			const result3 = translateIn('active', [true, false]);

			expect(result1.args).toEqual(['[25,30,35]']);
			expect(result2.args).toEqual(['["Alice","Bob","Charlie"]']);
			expect(result3.args).toEqual(['[true,false]']);
		});
	});

	describe('$nin operator - json_each() pattern', () => {
		it('should use json_each() to prevent statement cache thrashing', () => {
			const result = translateNin('age', [25, 30, 35]);
			
			expect(result.sql).toBe('(age IS NULL OR age NOT IN (SELECT value FROM json_each(?)))');
			expect(result.args).toEqual(['[25,30,35]']);
		});

		it('should generate same SQL for different array lengths', () => {
			const result1 = translateNin('id', [1, 2]);
			const result2 = translateNin('id', [1, 2, 3, 4, 5]);
			const result3 = translateNin('id', Array.from({ length: 1000 }, (_, i) => i));

			expect(result1.sql).toBe(result2.sql);
			expect(result2.sql).toBe(result3.sql);
			expect(result1.sql).toBe('(id IS NULL OR id NOT IN (SELECT value FROM json_each(?)))');
		});

		it('should handle NULL values with json_each()', () => {
			const result = translateNin('status', ['archived', null, 'deleted']);
			
			expect(result.sql).toBe('(status NOT IN (SELECT value FROM json_each(?)) AND status IS NOT NULL)');
			expect(result.args).toEqual(['["archived","deleted"]']);
		});

		it('should handle empty array as always true', () => {
			const result = translateNin('field', []);
			
			expect(result.sql).toBe('1=1');
			expect(result.args).toEqual([]);
		});

		it('should handle array with only NULL', () => {
			const result = translateNin('field', [null]);
			
			expect(result.sql).toBe('field IS NOT NULL');
			expect(result.args).toEqual([]);
		});
	});

	describe('Statement cache behavior (verifying the fix)', () => {
		it('should generate identical SQL for different array lengths', () => {
			const result1 = translateIn('id', [1, 2]);
			const result2 = translateIn('id', [1, 2, 3]);

			expect(result1.sql).toBe('id IN (SELECT value FROM json_each(?))');
			expect(result2.sql).toBe('id IN (SELECT value FROM json_each(?))');
			expect(result1.sql).toBe(result2.sql);
		});
	});

	describe('Edge cases and correctness', () => {
		it('should handle large arrays without statement cache pollution', () => {
			const largeArray = Array.from({ length: 10000 }, (_, i) => i);
			const result = translateIn('id', largeArray);

			expect(result.sql).toBe('id IN (SELECT value FROM json_each(?))');
			expect(result.args.length).toBe(1);
			expect(result.args[0]).toContain('[0,1,2,3,4,5,6,7,8,9');
		});

		it('should handle mixed types in array', () => {
			const result = translateIn('value', [1, 'two', true, null]);

			expect(result.sql).toBe('(value IN (SELECT value FROM json_each(?)) OR value IS NULL)');
			expect(result.args).toEqual(['[1,"two",true]']);
		});

		it('should handle special characters in strings', () => {
			const result = translateIn('name', ['O\'Reilly', 'Smith"s', 'Back\\slash']);

			expect(result.sql).toBe('name IN (SELECT value FROM json_each(?))');
			const jsonArray = JSON.parse(result.args[0] as string);
			expect(jsonArray).toEqual(['O\'Reilly', 'Smith"s', 'Back\\slash']);
		});
	});
});
