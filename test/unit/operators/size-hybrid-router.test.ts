import { describe, it, expect } from 'bun:test';
import { buildWhereClause } from '../../../src/query/builder';
import type { RxJsonSchema, RxDocumentData } from 'rxdb';

interface TestDoc {
	id: string;
	name: string;
	tags: string[];
}

const testSchema: RxJsonSchema<RxDocumentData<TestDoc>> = {
	version: 0,
	primaryKey: 'id',
	type: 'object',
	properties: {
		id: { type: 'string' },
		name: { type: 'string' },
		tags: { type: 'array', items: { type: 'string' } },
		_deleted: { type: 'boolean' },
		_attachments: { type: 'object' },
		_rev: { type: 'string' },
		_meta: { type: 'object', properties: { lwt: { type: 'number' } }, required: ['lwt'] }
	},
	required: ['id', 'name', 'tags', '_deleted', '_attachments', '_rev', '_meta']
};

describe('Hybrid $size Router Architecture', () => {
	
	it('PATH 1 (Data Corruption Protection): Known non-array returns 1=0', () => {
		const result = buildWhereClause({ name: { $size: 2 } }, testSchema, 'test');
		expect(result?.sql).toBe('1=0');
		expect(result?.args).toEqual([]);
	});

	it('PATH 2 (Fast Path): Known array omits runtime type guard', () => {
		const result = buildWhereClause({ tags: { $size: 2 } }, testSchema, 'test');
		expect(result?.sql).toBe("json_array_length(data, '$.tags') = ?");
		expect(result?.args).toEqual([2]);
	});

	it('PATH 3 (Safe Path): Unknown type includes runtime type guard', () => {
		const selector: any = { dynamicData: { $size: 2 } };
		const result = buildWhereClause(selector, testSchema, 'test');
		expect(result?.sql).toBe("(json_type(data, '$.dynamicData') = 'array' AND json_array_length(data, '$.dynamicData') = ?)");
		expect(result?.args).toEqual([2]);
	});
});
