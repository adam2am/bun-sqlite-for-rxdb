import { describe, it, expect } from 'bun:test';
import { translateSize } from '$app/query/operators';
import { buildWhereClause } from '$app/query/builder';
import type { RxJsonSchema, RxDocumentData } from 'rxdb';

interface TestDoc {
	id: string;
	name: string;
	age: number;
	tags: string[];
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
		_deleted: { type: 'boolean' },
		_attachments: { type: 'object' },
		_rev: { type: 'string' },
		_meta: { type: 'object', properties: { lwt: { type: 'number' } }, required: ['lwt'] }
	},
	required: ['id', 'name', 'age', 'tags', '_deleted', '_rev', '_meta']
};

describe('$size Operator', () => {
	it('translates array size check to json_array_length', () => {
		const result = translateSize('data', 'tags', 3);
		expect(result?.sql).toBe("json_array_length(data, '$.tags') = ?");
		expect(result?.args).toEqual([3]);
	});

	it('handles size 0', () => {
		const result = translateSize('data', 'items', 0);
		expect(result?.sql).toBe("json_array_length(data, '$.items') = ?");
		expect(result?.args).toEqual([0]);
	});

	it('handles large array sizes', () => {
		const result = translateSize('data', 'myArray', 100);
		expect(result?.sql).toBe("json_array_length(data, '$.myArray') = ?");
		expect(result?.args).toEqual([100]);
	});

	it('BUG: $size on string field should return 1=0 (no matches)', () => {
		const result = buildWhereClause(
			{ name: { $size: 5 } },
			testSchema,
			'test'
		);
		expect(result?.sql).toBe('1=0');
		expect(result?.args).toEqual([]);
	});

	it('BUG: $size on number field should return 1=0 (no matches)', () => {
		const result = buildWhereClause(
			{ age: { $size: 3 } },
			testSchema,
			'test'
		);
		expect(result?.sql).toBe('1=0');
		expect(result?.args).toEqual([]);
	});

	it('CORRECT: $size on array field should use json_array_length', () => {
		const result = buildWhereClause(
			{ tags: { $size: 2 } },
			testSchema,
			'test'
		);
		expect(result?.sql).toContain('json_array_length');
		expect(result?.args).toContain(2);
	});
});
