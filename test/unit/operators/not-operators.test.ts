import { describe, it, expect } from 'bun:test';
import { buildWhereClause } from '$app/query/builder';
import type { RxJsonSchema, RxDocumentData } from 'rxdb';

const mockSchema: RxJsonSchema<RxDocumentData<any>> = {
	version: 0,
	primaryKey: 'id',
	type: 'object',
	properties: {},
	required: []
};

describe('$not Operator', () => {
	it('negates simple equality', () => {
		const result = buildWhereClause({ age: { $not: { $eq: 25 } } }, mockSchema, 'test');
		expect(result).not.toBeNull();
		expect(result!.sql).toContain('NOT');
		expect(result!.sql).toContain('=');
		expect(result!.args).toContain(25);
	});

	it('negates greater than', () => {
		const result = buildWhereClause({ age: { $not: { $gt: 50 } } }, mockSchema, 'test');
		expect(result).not.toBeNull();
		expect(result!.sql).toContain('NOT');
		expect(result!.sql).toContain('>');
		expect(result!.args).toContain(50);
	});

	it('negates IN operator', () => {
		const result = buildWhereClause({ status: { $not: { $in: ['active', 'pending'] } } }, mockSchema, 'test');
		expect(result).not.toBeNull();
		expect(result!.sql).toContain('NOT');
		expect(result!.sql).toContain('IN');
	});

	it('handles Date objects (Mingo compatibility)', () => {
		const date = new Date('2024-01-01');
		const result = buildWhereClause({ createdAt: { $not: date } }, mockSchema, 'test');
		expect(result).not.toBeNull();
		expect(result!.sql).toContain('NOT');
		expect(result!.sql).toContain('=');
		expect(result!.args).toContain(date.toISOString());
	});

	it('handles RegExp objects (Mingo compatibility)', () => {
		const pattern = /test/i;
		const result = buildWhereClause({ name: { $not: pattern } }, mockSchema, 'test');
		expect(result).not.toBeNull();
		expect(result!.sql).toContain('NOT');
		expect(result!.sql).toMatch(/LIKE|REGEXP/i);
	});

	it('handles empty objects as impossible condition', () => {
		const result = buildWhereClause({ age: { $not: {} } }, mockSchema, 'test');
		expect(result).not.toBeNull();
		expect(result!.sql).toBe('1=0');
		expect(result!.args).toEqual([]);
	});
});
