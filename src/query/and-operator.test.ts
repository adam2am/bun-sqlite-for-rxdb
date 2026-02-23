import { describe, it, expect } from 'bun:test';
import { buildWhereClause } from './builder';
import type { RxJsonSchema } from 'rxdb';

const testSchema: RxJsonSchema<any> = {
	version: 0,
	primaryKey: 'id',
	type: 'object',
	properties: {
		id: { type: 'string' },
		age: { type: 'number' },
		status: { type: 'string' }
	}
};

describe('$and operator', () => {
	it('explicit $and works same as implicit', () => {
		const implicit = buildWhereClause({ age: 25, status: 'active' }, testSchema, 'test');
		const explicit = buildWhereClause({ $and: [{ age: 25 }, { status: 'active' }] }, testSchema, 'test');
		
		expect(explicit.sql).toBe('json_extract(data, \'$.age\') = ? AND json_extract(data, \'$.status\') = ?');
		expect(explicit.args).toEqual([25, 'active']);
	});

	it('handles nested $and with operators', () => {
		const result = buildWhereClause({
			$and: [
				{ age: { $gt: 18 } },
				{ age: { $lt: 65 } },
				{ status: 'active' }
			]
		}, testSchema, 'test');
		
		expect(result.sql).toContain('json_extract(data, \'$.age\') > ?');
		expect(result.sql).toContain('json_extract(data, \'$.age\') < ?');
		expect(result.sql).toContain('json_extract(data, \'$.status\') = ?');
		expect(result.args).toEqual([18, 65, 'active']);
	});
});
