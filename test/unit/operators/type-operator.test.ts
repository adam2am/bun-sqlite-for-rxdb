import { describe, it, expect } from 'bun:test';
import { translateType } from '$app/query/operators';
import { buildWhereClause } from '$app/query/builder';
import type { RxJsonSchema, RxDocumentData } from 'rxdb';

interface TestDoc {
	id: string;
	name: string;
	age: number;
	tags: string[];
	active: boolean;
}

const testSchema: RxJsonSchema<RxDocumentData<TestDoc>> = {
	version: 0,
	primaryKey: 'id',
	type: 'object',
	properties: {
		id: { type: 'string' },
		name: { type: 'string' },
		age: { type: 'number' },
		tags: { type: 'array', items: { type: 'string' } },
		active: { type: 'boolean' },
		_deleted: { type: 'boolean' },
		_attachments: { type: 'object' },
		_rev: { type: 'string' },
		_meta: { type: 'object', properties: { lwt: { type: 'number' } }, required: ['lwt'] }
	},
	required: ['id', 'name', 'age', 'tags', 'active', '_deleted', '_rev', '_meta']
};

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
		expect(result?.sql).toBe("COALESCE(json_type(data, '$.name') = 'text', 0)");
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

	it('handles $type with array of types (OR logic)', () => {
		const result = buildWhereClause({ age: { $type: ['string', 'number'] } }, testSchema, 'test');
		expect(result?.sql).toContain("json_type(data, '$.age') = 'text'");
		expect(result?.sql).toContain("json_type(data, '$.age') IN ('integer', 'real')");
		expect(result?.sql).toContain(' OR ');
	});

	it('handles $type with empty array', () => {
		const result = buildWhereClause({ age: { $type: [] } }, testSchema, 'test');
		expect(result?.sql).toBe('1=0');
	});

	it('handles $type with invalid types in array', () => {
		const result = buildWhereClause({ age: { $type: ['invalidType'] } }, testSchema, 'test');
		expect(result?.sql).toBe('1=0');
	});

	it('handles $type with mixed valid and invalid types', () => {
		const result = buildWhereClause({ age: { $type: ['string', 'invalidType', 'number'] } }, testSchema, 'test');
		expect(result?.sql).toContain("json_type(data, '$.age') = 'text'");
		expect(result?.sql).toContain("json_type(data, '$.age') IN ('integer', 'real')");
		expect(result?.sql).toContain(' OR ');
	});
});
