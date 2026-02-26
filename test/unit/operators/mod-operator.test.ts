import { describe, it, expect } from 'bun:test';
import { translateMod } from '$app/query/operators';

describe('$mod Operator', () => {
	it('translates modulo check to % operator', () => {
		const result = translateMod('count', [5, 0]);
		expect(result?.sql).toBe('(count - (CAST(count / ? AS INTEGER) * ?)) = ?');
		expect(result?.args).toEqual([5, 5, 0]);
	});

	it('handles non-zero remainder', () => {
		const result = translateMod('age', [10, 3]);
		expect(result?.sql).toBe('(age - (CAST(age / ? AS INTEGER) * ?)) = ?');
		expect(result?.args).toEqual([10, 10, 3]);
	});

	it('handles divisor of 1', () => {
		const result = translateMod('value', [1, 0]);
		expect(result?.sql).toBe('(value - (CAST(value / ? AS INTEGER) * ?)) = ?');
		expect(result?.args).toEqual([1, 1, 0]);
	});
});
