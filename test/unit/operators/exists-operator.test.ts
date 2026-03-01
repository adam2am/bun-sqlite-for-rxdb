import { describe, it, expect } from 'bun:test';
import { translateExists } from '$app/query/operators';
import { buildWhereClause } from '$app/query/builder';
import type { RxJsonSchema, RxDocumentData } from 'rxdb';

interface TestDoc {
	id: string;
	name: string;
	age: number;
	optional?: string;
}

const testSchema: RxJsonSchema<RxDocumentData<TestDoc>> = {
	version: 0,
	primaryKey: 'id',
	type: 'object',
	properties: {
		id: { type: 'string' },
		name: { type: 'string' },
		age: { type: 'number' },
		optional: { type: 'string' },
		_deleted: { type: 'boolean' },
		_attachments: { type: 'object' },
		_rev: { type: 'string' },
		_meta: { type: 'object', properties: { lwt: { type: 'number' } }, required: ['lwt'] }
	},
	required: ['id', 'name', 'age', '_deleted', '_rev', '_meta']
};

describe('$exists Operator', () => {
	it('translates $exists: true to IS NOT NULL', () => {
		const result = translateExists('age', true);
		expect(result.sql).toBe('age IS NOT NULL');
		expect(result.args).toEqual([]);
	});

	it('translates $exists: false to IS NULL', () => {
		const result = translateExists('age', false);
		expect(result.sql).toBe('age IS NULL');
		expect(result.args).toEqual([]);
	});

	it('works with nested fields using json_extract', () => {
		const result = translateExists("json_extract(data, '$.address.city')", true);
		expect(result.sql).toBe("json_extract(data, '$.address.city') IS NOT NULL");
		expect(result.args).toEqual([]);
	});

	it('handles boolean false correctly', () => {
		const result = translateExists('status', false);
		expect(result.sql).toBe('status IS NULL');
		expect(result.args).toEqual([]);
	});

	it('CORRECT: $exists on optional field should use IS NOT NULL', () => {
		const result = buildWhereClause(
			{ optional: { $exists: true } },
			testSchema,
			'test'
		);
		expect(result?.sql).toContain('IS NOT NULL');
	});

	it('CORRECT: $exists on required field should use IS NOT NULL', () => {
		const result = buildWhereClause(
			{ name: { $exists: true } },
			testSchema,
			'test'
		);
		expect(result?.sql).toContain('IS NOT NULL');
	});
});
