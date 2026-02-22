import { describe, it, expect } from 'bun:test';
import { translateSize } from './operators';

describe('$size Operator', () => {
	it('translates array size check to json_array_length', () => {
		const result = translateSize('tags', 3);
		expect(result?.sql).toBe('json_array_length(tags) = ?');
		expect(result?.args).toEqual([3]);
	});

	it('handles size 0', () => {
		const result = translateSize('items', 0);
		expect(result?.sql).toBe('json_array_length(items) = ?');
		expect(result?.args).toEqual([0]);
	});

	it('handles large array sizes', () => {
		const result = translateSize('data', 100);
		expect(result?.sql).toBe('json_array_length(data) = ?');
		expect(result?.args).toEqual([100]);
	});
});
