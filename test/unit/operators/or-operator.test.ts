import { describe, it, expect } from 'bun:test';
import { buildWhereClause } from '$app/query/builder';
import type { RxJsonSchema } from 'rxdb';

const testSchema: RxJsonSchema<any> = {
	version: 0,
	primaryKey: 'id',
	type: 'object',
	properties: {
		id: { type: 'string' },
		age: { type: 'number' },
		status: { type: 'string' },
		deleted: { type: 'boolean' }
	}
};

describe('$or operator', () => {
	it('generates simple OR clause', () => {
		const result = buildWhereClause({
			$or: [
				{ age: 25 },
				{ age: 30 }
			]
		}, testSchema, 'test');
		
		expect(result).not.toBeNull();
		expect(result!.sql).toBe('(json_extract(data, \'$.age\') = ? OR json_extract(data, \'$.age\') = ?)');
		expect(result!.args).toEqual([25, 30]);
	});

	it('handles OR with nested AND', () => {
		const result = buildWhereClause({
			$or: [
				{ age: { $gt: 50 } },
				{ $and: [{ age: { $eq: 50 } }, { status: 'active' }] }
			]
		}, testSchema, 'test');
		
		expect(result).not.toBeNull();
		expect(result!.sql).toContain('json_extract(data, \'$.age\') > ?');
		expect(result!.sql).toContain('OR');
		expect(result!.sql).toContain('(json_extract(data, \'$.age\') = ? AND json_extract(data, \'$.status\') = ?)');
		expect(result!.args).toEqual([50, 50, 'active']);
	});

	it('handles complex nested OR with parentheses', () => {
		const result = buildWhereClause({
			$or: [
				{ age: { $gt: 50 } },
				{ $and: [{ age: { $eq: 50 } }, { status: 'active' }] },
				{
					$and: [
						{ deleted: false },
						{
							$or: [
								{ age: { $lte: 30 } },
								{ age: 30 },
								{ age: 35 }
							]
						}
					]
				}
			]
		}, testSchema, 'test');
		
		expect(result).not.toBeNull();
		expect(result!.sql).toContain('OR');
		expect(result!.sql).toContain('(');
		expect(result!.sql).toContain(')');
	});
});
