import { describe, it, expect } from 'bun:test';
import { translateElemMatch } from '$app/query/operators';
import type { RxJsonSchema, RxDocumentData } from 'rxdb';

const mockSchema: RxJsonSchema<RxDocumentData<any>> = {
	version: 0,
	primaryKey: 'id',
	type: 'object',
	properties: {},
	required: []
};

describe('$elemMatch Operator', () => {
	it('translates simple equality match', () => {
		const result = translateElemMatch('tags', { $eq: 'urgent' }, mockSchema, 'tags');
		expect(result).not.toBeNull();
		expect(result?.sql).toBe('EXISTS (SELECT 1 FROM jsonb_each(data, \'$.tags\') WHERE COALESCE(((type = \'text\' AND value = ?)), 0))');
		expect(result?.args).toEqual(['urgent']);
	});

	it('translates object with multiple conditions', () => {
		const result = translateElemMatch('items', { price: { $gt: 100 }, qty: { $gte: 5 } }, mockSchema, 'items');
		expect(result).not.toBeNull();
		expect(result?.sql).toBe("EXISTS (SELECT 1 FROM jsonb_each(data, '$.items') WHERE COALESCE(((json_type(value, '$.price') IN ('integer', 'real') AND json_extract(value, '$.price') > ?) AND (json_type(value, '$.qty') IN ('integer', 'real') AND json_extract(value, '$.qty') >= ?)), 0))");
		expect(result?.args).toEqual([100, 5]);
	});

	it('translates nested conditions', () => {
		const result = translateElemMatch('awards', { award: 'Turing Award', year: { $gt: 1980 } }, mockSchema, 'awards');
		expect(result).not.toBeNull();
		expect(result?.sql).toBe("EXISTS (SELECT 1 FROM jsonb_each(data, '$.awards') WHERE COALESCE(((json_type(value, '$.award') = 'text' AND json_extract(value, '$.award') = ?) AND (json_type(value, '$.year') IN ('integer', 'real') AND json_extract(value, '$.year') > ?)), 0))");
		expect(result?.args).toEqual(['Turing Award', 1980]);
	});

	it('translates $and operator', () => {
		const result = translateElemMatch('data', { $and: [{ status: 'active' }, { age: { $gt: 18 } }] }, mockSchema, 'data');
		expect(result).not.toBeNull();
		expect(result?.sql).toBe("EXISTS (SELECT 1 FROM jsonb_each(data, '$.data') WHERE COALESCE(((json_type(value, '$.status') = 'text' AND json_extract(value, '$.status') = ?)), 0) AND COALESCE(((json_type(value, '$.age') IN ('integer', 'real') AND json_extract(value, '$.age') > ?)), 0))");
		expect(result?.args).toEqual(['active', 18]);
	});

	it('translates $or operator', () => {
		const result = translateElemMatch('data', { $or: [{ status: 'active' }, { status: 'pending' }] }, mockSchema, 'data');
		expect(result).not.toBeNull();
		expect(result?.sql).toBe("EXISTS (SELECT 1 FROM jsonb_each(data, '$.data') WHERE COALESCE(((json_type(value, '$.status') = 'text' AND json_extract(value, '$.status') = ?)), 0) OR COALESCE(((json_type(value, '$.status') = 'text' AND json_extract(value, '$.status') = ?)), 0))");
		expect(result?.args).toEqual(['active', 'pending']);
	});

	it('translates $nor operator', () => {
		const result = translateElemMatch('data', { $nor: [{ status: 'deleted' }, { status: 'archived' }] }, mockSchema, 'data');
		expect(result).not.toBeNull();
		expect(result?.sql).toBe("EXISTS (SELECT 1 FROM jsonb_each(data, '$.data') WHERE NOT (COALESCE(((json_type(value, '$.status') = 'text' AND json_extract(value, '$.status') = ?)), 0) OR COALESCE(((json_type(value, '$.status') = 'text' AND json_extract(value, '$.status') = ?)), 0)))");
		expect(result?.args).toEqual(['deleted', 'archived']);
	});
});
