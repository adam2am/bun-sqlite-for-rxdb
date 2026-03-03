import { describe, it, expect } from 'bun:test';
import { translateIn, translateNin } from '$app/query/operators';

describe('$in operator', () => {
	it('generates IN clause for array of values', () => {
		const result = translateIn('age', [25, 30, 35]);
		if (result) {
			expect(result.sql).toBe('age IN (?, ?, ?)');
			expect(result.args).toEqual([25, 30, 35]);
		} else {
			expect(result).not.toBeNull();
		}
	});

	it('handles NULL in array with OR IS NULL', () => {
		const result = translateIn('status', ['active', null, 'pending']);
		if (result) {
			expect(result.sql).toBe('(status IN (?, ?) OR status IS NULL)');
			expect(result.args).toEqual(['active', 'pending']);
		} else {
			expect(result).not.toBeNull();
		}
	});

	it('handles array with only NULL', () => {
		const result = translateIn('field', [null]);
		if (result) {
			expect(result.sql).toBe('field IS NULL');
			expect(result.args).toEqual([]);
		} else {
			expect(result).not.toBeNull();
		}
	});

	it('handles empty array as always false', () => {
		const result = translateIn('field', []);
		if (result) {
			expect(result.sql).toBe('1=0');
			expect(result.args).toEqual([]);
		} else {
			expect(result).not.toBeNull();
		}
	});
});

describe('$nin operator', () => {
	it('generates NOT IN clause for array of values', () => {
		const result = translateNin('age', [25, 30, 35]);
		if (result) {
			expect(result.sql).toBe('(age IS NULL OR age NOT IN (SELECT value FROM json_each(?)))');
			expect(result.args).toEqual(['[25,30,35]']);
		} else {
			expect(result).not.toBeNull();
		}
	});

	it('handles NULL in array with AND IS NOT NULL', () => {
		const result = translateNin('status', ['archived', null, 'deleted']);
		if (result) {
			expect(result.sql).toBe('(status NOT IN (SELECT value FROM json_each(?)) AND status IS NOT NULL)');
			expect(result.args).toEqual(['["archived","deleted"]']);
		} else {
			expect(result).not.toBeNull();
		}
	});

	it('handles array with only NULL', () => {
		const result = translateNin('field', [null]);
		if (result) {
			expect(result.sql).toBe('field IS NOT NULL');
			expect(result.args).toEqual([]);
		} else {
			expect(result).not.toBeNull();
		}
	});

	it('handles empty array as always true', () => {
		const result = translateNin('field', []);
		if (result) {
			expect(result.sql).toBe('1=1');
			expect(result.args).toEqual([]);
		} else {
			expect(result).not.toBeNull();
		}
	});
});
