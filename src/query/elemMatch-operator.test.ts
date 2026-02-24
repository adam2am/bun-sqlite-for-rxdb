import { describe, it, expect } from 'bun:test';
import { translateElemMatch } from './operators';

describe('$elemMatch Operator', () => {
	it('translates simple equality match', () => {
		const result = translateElemMatch('tags', { $eq: 'urgent' });
		expect(result).not.toBeNull();
		expect(result?.sql).toBe('EXISTS (SELECT 1 FROM json_each(tags) WHERE json_each.value = ?)');
		expect(result?.args).toEqual(['urgent']);
	});

	it('translates object with multiple conditions', () => {
		const result = translateElemMatch('items', { price: { $gt: 100 }, qty: { $gte: 5 } });
		expect(result).not.toBeNull();
		expect(result?.sql).toBe("EXISTS (SELECT 1 FROM json_each(items) WHERE json_extract(json_each.value, '$.price') > ? AND json_extract(json_each.value, '$.qty') >= ?)");
		expect(result?.args).toEqual([100, 5]);
	});

	it('translates nested conditions', () => {
		const result = translateElemMatch('awards', { award: 'Turing Award', year: { $gt: 1980 } });
		expect(result).not.toBeNull();
		expect(result?.sql).toBe("EXISTS (SELECT 1 FROM json_each(awards) WHERE json_extract(json_each.value, '$.award') = ? AND json_extract(json_each.value, '$.year') > ?)");
		expect(result?.args).toEqual(['Turing Award', 1980]);
	});

	it('returns null for complex nested operators ($and, $or, $nor)', () => {
		const result = translateElemMatch('data', { $and: [{ status: 'active' }, { count: { $gte: 10 } }] });
		expect(result).toBeNull();
	});
});
