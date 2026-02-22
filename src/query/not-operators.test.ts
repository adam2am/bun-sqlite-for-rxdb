import { describe, it, expect } from 'bun:test';
import { translateNot, translateNor } from './operators';

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

describe('$nor Operator', () => {
	it('negates OR of two conditions', () => {
		const result = translateNor([
			{ age: { $lt: 18 } },
			{ age: { $gt: 65 } }
		]);
		expect(result.sql).toBe('NOT((age < ?) OR (age > ?))');
		expect(result.args).toEqual([18, 65]);
	});

	it('negates OR of multiple conditions', () => {
		const result = translateNor([
			{ status: { $eq: 'inactive' } },
			{ status: { $eq: 'deleted' } },
			{ status: { $eq: 'banned' } }
		]);
		expect(result.sql).toBe('NOT((status = ?) OR (status = ?) OR (status = ?))');
		expect(result.args).toEqual(['inactive', 'deleted', 'banned']);
	});

	it('handles empty array', () => {
		const result = translateNor([]);
		expect(result.sql).toBe('1=1');
		expect(result.args).toEqual([]);
	});
});
