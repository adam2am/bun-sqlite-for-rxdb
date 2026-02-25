import { describe, it, expect } from 'bun:test';
import { translateNot } from './operators';

describe('$not Operator', () => {
	it('negates simple equality', () => {
		const result = translateNot('age', { $eq: 25 });
		expect(result.sql).toBe('NOT(age = ?)');
		expect(result.args).toEqual([25]);
	});

	it('negates greater than', () => {
		const result = translateNot('age', { $gt: 50 });
		expect(result.sql).toBe('NOT(age > ?)');
		expect(result.args).toEqual([50]);
	});

	it('negates IN operator', () => {
		const result = translateNot('status', { $in: ['active', 'pending'] });
		expect(result.sql).toBe('NOT(status IN (?, ?))');
		expect(result.args).toEqual(['active', 'pending']);
	});
});
