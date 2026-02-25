import { describe, it, expect } from 'bun:test';
import { translateIn, translateNin } from './operators';

describe('$in operator', () => {
	it('generates IN clause for array of values', () => {
		const result = translateIn('age', [25, 30, 35]);
		expect(result.sql).toBe('age IN (?, ?, ?)');
		expect(result.args).toEqual([25, 30, 35]);
	});

	it('handles NULL in array with OR IS NULL', () => {
		const result = translateIn('status', ['active', null, 'pending']);
		expect(result.sql).toBe('(status IN (?, ?) OR status IS NULL)');
		expect(result.args).toEqual(['active', 'pending']);
	});

	it('handles array with only NULL', () => {
		const result = translateIn('field', [null]);
		expect(result.sql).toBe('field IS NULL');
		expect(result.args).toEqual([]);
	});

	it('handles empty array as always false', () => {
		const result = translateIn('field', []);
		expect(result.sql).toBe('1=0');
		expect(result.args).toEqual([]);
	});
});

describe('$nin operator', () => {
	it('generates NOT IN clause for array of values', () => {
		const result = translateNin('age', [25, 30, 35]);
		expect(result.sql).toBe('age NOT IN (?, ?, ?)');
		expect(result.args).toEqual([25, 30, 35]);
	});

	it('handles NULL in array with AND IS NOT NULL', () => {
		const result = translateNin('status', ['archived', null, 'deleted']);
		expect(result.sql).toBe('(status NOT IN (?, ?) AND status IS NOT NULL)');
		expect(result.args).toEqual(['archived', 'deleted']);
	});

	it('handles array with only NULL', () => {
		const result = translateNin('field', [null]);
		expect(result.sql).toBe('field IS NOT NULL');
		expect(result.args).toEqual([]);
	});

	it('handles empty array as always true', () => {
		const result = translateNin('field', []);
		expect(result.sql).toBe('1=1');
		expect(result.args).toEqual([]);
	});
});
