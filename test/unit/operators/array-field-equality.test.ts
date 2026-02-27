import { describe, it, expect } from 'bun:test';
import { buildWhereClause } from '$app/query/builder';
import type { RxJsonSchema, RxDocumentData } from 'rxdb';

interface TestDoc {
	id: string;
	name: string;
	tags: string[];
	count: number;
}

const schema: RxJsonSchema<RxDocumentData<TestDoc>> = {
	version: 0,
	primaryKey: 'id',
	type: 'object',
	properties: {
		id: { type: 'string' },
		name: { type: 'string' },
		tags: { type: 'array', items: { type: 'string' } },
		count: { type: 'number' },
		_deleted: { type: 'boolean' },
		_attachments: { type: 'object' },
		_rev: { type: 'string' },
		_meta: { type: 'object', properties: { lwt: { type: 'number' } } }
	},
	required: ['id', '_deleted', '_attachments', '_rev', '_meta']
};

describe('Array field direct equality (MongoDB behavior)', () => {
	it('should match documents where array contains the value', () => {
		const result = buildWhereClause({ tags: { $eq: 'moderator' } }, schema, 'test');
		expect(result).not.toBeNull();
		expect(result!.sql).toContain('jsonb_each');
		expect(result!.sql).toContain('value = ?');
		expect(result!.args).toContain('moderator');
	});

	it('should match documents where array contains "admin"', () => {
		const result = buildWhereClause({ tags: { $eq: 'admin' } }, schema, 'test');
		expect(result).not.toBeNull();
		expect(result!.sql).toContain('jsonb_each');
		expect(result!.args).toContain('admin');
	});

	it('should handle non-existent value in array', () => {
		const result = buildWhereClause({ tags: { $eq: 'nonexistent' } }, schema, 'test');
		expect(result).not.toBeNull();
		expect(result!.sql).toContain('jsonb_each');
		expect(result!.args).toContain('nonexistent');
	});

	it('should NOT use jsonb_each for non-array fields', () => {
		const result = buildWhereClause({ name: 'Alice' }, schema, 'test');
		expect(result).not.toBeNull();
		expect(result!.sql).not.toContain('jsonb_each');
		expect(result!.sql).toContain('= ?');
		expect(result!.args).toContain('Alice');
	});

	it('should NOT use jsonb_each for number fields', () => {
		const result = buildWhereClause({ count: 5 }, schema, 'test');
		expect(result).not.toBeNull();
		expect(result!.sql).not.toContain('jsonb_each');
		expect(result!.sql).toContain('= ?');
		expect(result!.args).toContain(5);
	});
});
