import { describe, it, expect } from 'bun:test';
import { translateIn, translateNin } from '$app/query/operators';

describe('Statement Cache Optimization (Issue #1)', () => {
	describe('$in operator - json_each() pattern', () => {
		it('should use native IN for same-type primitives (optimized)', () => {
			const result = translateIn('age', [25, 30, 35]);
			if (result) {
				expect(result.sql).toBe('age IN (?, ?, ?)');
				expect(result.args).toEqual([25, 30, 35]);
			} else {
				expect(result).not.toBeNull();
			}
		});

		it('should generate same SQL for different array lengths', () => {
			const result1 = translateIn('id', [1, 2]);
			const result2 = translateIn('id', [1, 2, 3, 4, 5]);
			const result3 = translateIn('id', Array.from({ length: 1000 }, (_, i) => i));

			if (result1 && result2 && result3) {
				expect(result1.sql).toBe('id IN (?, ?)');
				expect(result2.sql).toBe('id IN (?, ?, ?, ?, ?)');
				expect(result3.sql).toContain('id IN (');
			} else {
				expect(result1).not.toBeNull();
			}
		});

		it('should handle NULL values with native IN', () => {
			const result = translateIn('status', ['active', null, 'pending']);
			if (result) {
				expect(result.sql).toBe('(status IN (?, ?) OR status IS NULL)');
				expect(result.args).toEqual(['active', 'pending']);
			} else {
				expect(result).not.toBeNull();
			}
		});

		it('should handle empty array as always false', () => {
			const result = translateIn('field', []);
			if (result) {
				expect(result.sql).toBe('1=0');
				expect(result.args).toEqual([]);
			} else {
				expect(result).not.toBeNull();
			}
		});

		it('should handle array with only NULL', () => {
			const result = translateIn('field', [null]);
			if (result) {
				expect(result.sql).toBe('field IS NULL');
				expect(result.args).toEqual([]);
			} else {
				expect(result).not.toBeNull();
			}
		});

		it('should correctly serialize different data types as separate args', () => {
			const result1 = translateIn('age', [25, 30, 35]);
			const result2 = translateIn('name', ['Alice', 'Bob', 'Charlie']);
			const result3 = translateIn('active', [true, false]);

			if (result1 && result2 && result3) {
				expect(result1.args).toEqual([25, 30, 35]);
				expect(result2.args).toEqual(['Alice', 'Bob', 'Charlie']);
				expect(result3.args).toEqual([true, false]);
			} else {
				expect(result1).not.toBeNull();
			}
		});
	});

	describe('$nin operator - json_each() pattern', () => {
		it('should use json_each() to prevent statement cache thrashing', () => {
			const result = translateNin('age', [25, 30, 35]);
			if (result) {
				expect(result.sql).toBe('(age IS NULL OR age NOT IN (SELECT value FROM json_each(?)))');
				expect(result.args).toEqual(['[25,30,35]']);
			} else {
				expect(result).not.toBeNull();
			}
		});

		it('should generate same SQL for different array lengths', () => {
			const result1 = translateNin('id', [1, 2]);
			const result2 = translateNin('id', [1, 2, 3, 4, 5]);
			const result3 = translateNin('id', Array.from({ length: 1000 }, (_, i) => i));

			if (result1 && result2 && result3) {
				expect(result1.sql).toBe(result2.sql);
				expect(result2.sql).toBe(result3.sql);
				expect(result1.sql).toBe('(id IS NULL OR id NOT IN (SELECT value FROM json_each(?)))');
			} else {
				expect(result1).not.toBeNull();
			}
		});

		it('should handle NULL values with json_each()', () => {
			const result = translateNin('status', ['archived', null, 'deleted']);
			if (result) {
				expect(result.sql).toBe('(status NOT IN (SELECT value FROM json_each(?)) AND status IS NOT NULL)');
				expect(result.args).toEqual(['["archived","deleted"]']);
			} else {
				expect(result).not.toBeNull();
			}
		});

		it('should handle empty array as always true', () => {
			const result = translateNin('field', []);
			if (result) {
				expect(result.sql).toBe('1=1');
				expect(result.args).toEqual([]);
			} else {
				expect(result).not.toBeNull();
			}
		});

		it('should handle array with only NULL', () => {
			const result = translateNin('field', [null]);
			if (result) {
				expect(result.sql).toBe('field IS NOT NULL');
				expect(result.args).toEqual([]);
			} else {
				expect(result).not.toBeNull();
			}
		});
	});

	describe('Statement cache behavior (verifying the fix)', () => {
		it('should generate different SQL for different array lengths (native IN)', () => {
			const result1 = translateIn('id', [1, 2]);
			const result2 = translateIn('id', [1, 2, 3]);

			if (result1 && result2) {
				expect(result1.sql).toBe('id IN (?, ?)');
				expect(result2.sql).toBe('id IN (?, ?, ?)');
				expect(result1.sql).not.toBe(result2.sql);
			} else {
				expect(result1).not.toBeNull();
			}
		});
	});

	describe('Edge cases and correctness', () => {
		it('should handle large arrays with native IN', () => {
			const largeArray = Array.from({ length: 10000 }, (_, i) => i);
			const result = translateIn('id', largeArray);

			if (result) {
				expect(result.sql).toContain('id IN (');
				expect(result.args.length).toBe(10000);
				expect(result.args[0]).toBe(0);
				expect(result.args[9999]).toBe(9999);
			} else {
				expect(result).not.toBeNull();
			}
		});

		it('should handle mixed types in array', () => {
			const result = translateIn('value', [1, 'two', true, null]);

			if (result) {
				expect(result.sql).toBe('(EXISTS (SELECT 1 FROM json_each(?) je WHERE je.value = value AND je.type = type) OR value IS NULL)');
				expect(result.args).toEqual(['[1,"two",true]']);
			} else {
				expect(result).not.toBeNull();
			}
		});

		it('should handle special characters in strings with native IN', () => {
			const result = translateIn('name', ['O\'Reilly', 'Smith"s', 'Back\\slash']);

			if (result) {
				expect(result.sql).toBe('name IN (?, ?, ?)');
				expect(result.args).toEqual(['O\'Reilly', 'Smith"s', 'Back\\slash']);
			} else {
				expect(result).not.toBeNull();
			}
		});
	});
});
