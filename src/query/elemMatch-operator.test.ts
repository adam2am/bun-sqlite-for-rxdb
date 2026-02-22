import { describe, it, expect } from 'bun:test';
import { translateElemMatch } from './operators';

describe('$elemMatch Operator', () => {
	it('returns null for simple equality match', () => {
		const result = translateElemMatch('tags', { $eq: 'urgent' });
		expect(result).toBeNull();
	});

	it('returns null for object with multiple conditions', () => {
		const result = translateElemMatch('items', { price: { $gt: 100 }, qty: { $gte: 5 } });
		expect(result).toBeNull();
	});

	it('returns null for nested conditions', () => {
		const result = translateElemMatch('awards', { award: 'Turing Award', year: { $gt: 1980 } });
		expect(result).toBeNull();
	});

	it('returns null for complex nested operators', () => {
		const result = translateElemMatch('data', { $and: [{ status: 'active' }, { count: { $gte: 10 } }] });
		expect(result).toBeNull();
	});
});
