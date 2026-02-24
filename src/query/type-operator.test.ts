import { describe, it, expect } from 'bun:test';
import { translateType } from './operators';

describe('$type Operator', () => {
	it('translates number type to typeof check', () => {
		const result = translateType('age', 'number');
		expect(result?.sql).toBe("(typeof(age) = 'integer' OR typeof(age) = 'real')");
		expect(result?.args).toEqual([]);
	});

	it('translates string type to typeof check', () => {
		const result = translateType('name', 'string');
		expect(result?.sql).toBe("typeof(name) = 'text'");
		expect(result?.args).toEqual([]);
	});

	it('translates null type to typeof check', () => {
		const result = translateType('deleted', 'null');
		expect(result?.sql).toBe("typeof(deleted) = 'null'");
		expect(result?.args).toEqual([]);
	});

	it('returns null for boolean type (Mingo fallback)', () => {
		const result = translateType('active', 'boolean');
		expect(result).toBeNull();
	});

	it('translates array type to json_type check with json_quote no-op', () => {
		const result = translateType('tags', 'array');
		expect(result?.sql).toBe("json_type(json_quote(tags)) = 'array'");
		expect(result?.args).toEqual([]);
	});

	it('returns null for object type (Mingo fallback)', () => {
		const result = translateType('metadata', 'object');
		expect(result).toBeNull();
	});
});
