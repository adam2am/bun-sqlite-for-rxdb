import { describe, it, expect } from 'bun:test';
import { buildWhereClause } from '$app/query/builder';
import type { RxJsonSchema, RxDocumentData } from 'rxdb';

interface TestDoc {
	id: string;
	name: string;
	count: number;
	active: boolean;
}

const schema: RxJsonSchema<RxDocumentData<TestDoc>> = {
	version: 0,
	primaryKey: 'id',
	type: 'object',
	properties: {
		id: { type: 'string' },
		name: { type: 'string' },
		count: { type: 'number' },
		active: { type: 'boolean' },
		_deleted: { type: 'boolean' },
		_attachments: { type: 'object' },
		_rev: { type: 'string' },
		_meta: { type: 'object', properties: { lwt: { type: 'number' } } }
	},
	required: ['id', '_deleted', '_attachments', '_rev', '_meta']
};

describe('$not operator with primitive values', () => {
	it('should reject $not with boolean false (MongoDB requires operator expressions)', () => {
		const result = buildWhereClause({ active: { $not: false } }, schema, 'test');
		expect(result).not.toBeNull();
		expect(result!.sql).toBe('1=0');
		expect(result!.args).toEqual([]);
	});

	it('should reject $not with boolean true (MongoDB requires operator expressions)', () => {
		const result = buildWhereClause({ active: { $not: true } }, schema, 'test');
		expect(result).not.toBeNull();
		expect(result!.sql).toBe('1=0');
		expect(result!.args).toEqual([]);
	});

	it('should reject $not with number 0 (MongoDB requires operator expressions)', () => {
		const result = buildWhereClause({ count: { $not: 0 } }, schema, 'test');
		expect(result).not.toBeNull();
		expect(result!.sql).toBe('1=0');
		expect(result!.args).toEqual([]);
	});

	it('should reject $not with empty string (MongoDB requires operator expressions)', () => {
		const result = buildWhereClause({ name: { $not: '' } }, schema, 'test');
		expect(result).not.toBeNull();
		expect(result!.sql).toBe('1=0');
		expect(result!.args).toEqual([]);
	});

	it('should reject $not with null (MongoDB requires operator expressions)', () => {
		const result = buildWhereClause({ name: { $not: null } }, schema, 'test');
		expect(result).not.toBeNull();
		expect(result!.sql).toBe('1=0');
		expect(result!.args).toEqual([]);
	});

	it('should still return 1=0 for empty object', () => {
		const result = buildWhereClause({ name: { $not: {} } }, schema, 'test');
		expect(result).not.toBeNull();
		expect(result!.sql).toBe('1=0');
		expect(result!.args).toEqual([]);
	});
});
