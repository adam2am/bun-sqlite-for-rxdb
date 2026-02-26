import { describe, it, expect } from 'bun:test';
import { translateNot } from '$app/query/operators';
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
		const result = translateNot('age', { $eq: 25 }, mockSchema, 'age');
		expect(result).not.toBeNull();
		expect(result!.sql).toBe('NOT (age = ?)');
		expect(result!.args).toEqual([25]);
	});

	it('negates greater than', () => {
		const result = translateNot('age', { $gt: 50 }, mockSchema, 'age');
		expect(result).not.toBeNull();
		expect(result!.sql).toBe('NOT (age > ?)');
		expect(result!.args).toEqual([50]);
	});

	it('negates IN operator', () => {
		const result = translateNot('status', { $in: ['active', 'pending'] }, mockSchema, 'status');
		expect(result).not.toBeNull();
		expect(result!.sql).toBe('NOT (status IN (SELECT value FROM json_each(?)))');
		expect(result!.args).toEqual(['["active","pending"]']);
	});
});
