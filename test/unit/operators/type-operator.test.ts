import { describe, it, expect } from 'bun:test';
import { translateType } from './operators';

describe('$type Operator', () => {
	it('translates null type to SQL', () => {
		const result = translateType('data', 'deleted', 'null');
		expect(result?.sql).toBe("json_type(data, '$.deleted') = 'null'");
		expect(result?.args).toEqual([]);
	});

	it('translates number type to SQL', () => {
		const result = translateType('data', 'age', 'number');
		expect(result?.sql).toBe("json_type(data, '$.age') IN ('integer', 'real')");
		expect(result?.args).toEqual([]);
	});

	it('translates string type to SQL', () => {
		const result = translateType('data', 'name', 'string');
		expect(result?.sql).toBe("json_type(data, '$.name') = 'text'");
		expect(result?.args).toEqual([]);
	});

	it('translates boolean type to SQL', () => {
		const result = translateType('data', 'active', 'boolean');
		expect(result?.sql).toBe("json_type(data, '$.active') IN ('true', 'false')");
		expect(result?.args).toEqual([]);
	});

	it('translates array type to SQL', () => {
		const result = translateType('data', 'tags', 'array');
		expect(result?.sql).toBe("json_type(data, '$.tags') = 'array'");
		expect(result?.args).toEqual([]);
	});

	it('translates object type to SQL', () => {
		const result = translateType('data', 'metadata', 'object');
		expect(result?.sql).toBe("json_type(data, '$.metadata') = 'object'");
		expect(result?.args).toEqual([]);
	});
});
