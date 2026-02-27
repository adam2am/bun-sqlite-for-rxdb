import { describe, it, expect } from 'bun:test';
import { buildWhereClause } from '$app/query/builder';
import type { RxJsonSchema, RxDocumentData } from 'rxdb';

interface TestDoc {
	id: string;
	name: string;
	tags: string[];
	scores: number[];
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
		scores: { type: 'array', items: { type: 'number' } },
		count: { type: 'number' },
		_deleted: { type: 'boolean' },
		_attachments: { type: 'object' },
		_rev: { type: 'string' },
		_meta: { type: 'object', properties: { lwt: { type: 'number' } } }
	},
	required: ['id', '_deleted', '_attachments', '_rev', '_meta']
};

describe('Array operators: $ne', () => {
	it('should use jsonb_each for array fields', () => {
		const result = buildWhereClause({ tags: { $ne: 'admin' } }, schema, 'test');
		expect(result).not.toBeNull();
		expect(result!.sql).toContain('NOT EXISTS');
		expect(result!.sql).toContain('jsonb_each');
		expect(result!.sql).toContain('value = ?');
		expect(result!.args).toContain('admin');
	});

	it('should NOT use jsonb_each for non-array fields', () => {
		const result = buildWhereClause({ name: { $ne: 'Alice' } }, schema, 'test');
		expect(result).not.toBeNull();
		expect(result!.sql).not.toContain('jsonb_each');
		expect(result!.sql).toContain('<> ?');
		expect(result!.args).toContain('Alice');
	});

	it('should handle null values correctly', () => {
		const result = buildWhereClause({ tags: { $ne: null } }, schema, 'test');
		expect(result).not.toBeNull();
		expect(result!.sql).toContain('IS NOT NULL');
	});
});

describe('Array operators: $gt', () => {
	it('should use jsonb_each for array fields', () => {
		const result = buildWhereClause({ scores: { $gt: 50 } }, schema, 'test');
		expect(result).not.toBeNull();
		expect(result!.sql).toContain('EXISTS');
		expect(result!.sql).toContain('jsonb_each');
		expect(result!.sql).toContain('value > ?');
		expect(result!.args).toContain(50);
	});

	it('should NOT use jsonb_each for non-array fields', () => {
		const result = buildWhereClause({ count: { $gt: 10 } }, schema, 'test');
		expect(result).not.toBeNull();
		expect(result!.sql).not.toContain('jsonb_each');
		expect(result!.sql).toContain('> ?');
		expect(result!.args).toContain(10);
	});
});

describe('Array operators: $gte', () => {
	it('should use jsonb_each for array fields', () => {
		const result = buildWhereClause({ scores: { $gte: 50 } }, schema, 'test');
		expect(result).not.toBeNull();
		expect(result!.sql).toContain('EXISTS');
		expect(result!.sql).toContain('jsonb_each');
		expect(result!.sql).toContain('value >= ?');
		expect(result!.args).toContain(50);
	});

	it('should NOT use jsonb_each for non-array fields', () => {
		const result = buildWhereClause({ count: { $gte: 10 } }, schema, 'test');
		expect(result).not.toBeNull();
		expect(result!.sql).not.toContain('jsonb_each');
		expect(result!.sql).toContain('>= ?');
		expect(result!.args).toContain(10);
	});
});

describe('Array operators: $lt', () => {
	it('should use jsonb_each for array fields', () => {
		const result = buildWhereClause({ scores: { $lt: 100 } }, schema, 'test');
		expect(result).not.toBeNull();
		expect(result!.sql).toContain('EXISTS');
		expect(result!.sql).toContain('jsonb_each');
		expect(result!.sql).toContain('value < ?');
		expect(result!.args).toContain(100);
	});

	it('should NOT use jsonb_each for non-array fields', () => {
		const result = buildWhereClause({ count: { $lt: 100 } }, schema, 'test');
		expect(result).not.toBeNull();
		expect(result!.sql).not.toContain('jsonb_each');
		expect(result!.sql).toContain('< ?');
		expect(result!.args).toContain(100);
	});
});

describe('Array operators: $lte', () => {
	it('should use jsonb_each for array fields', () => {
		const result = buildWhereClause({ scores: { $lte: 100 } }, schema, 'test');
		expect(result).not.toBeNull();
		expect(result!.sql).toContain('EXISTS');
		expect(result!.sql).toContain('jsonb_each');
		expect(result!.sql).toContain('value <= ?');
		expect(result!.args).toContain(100);
	});

	it('should NOT use jsonb_each for non-array fields', () => {
		const result = buildWhereClause({ count: { $lte: 100 } }, schema, 'test');
		expect(result).not.toBeNull();
		expect(result!.sql).not.toContain('jsonb_each');
		expect(result!.sql).toContain('<= ?');
		expect(result!.args).toContain(100);
	});
});

describe('Array operators: $in', () => {
	it('should use jsonb_each for array fields', () => {
		const result = buildWhereClause({ tags: { $in: ['admin', 'user'] } }, schema, 'test');
		expect(result).not.toBeNull();
		expect(result!.sql).toContain('EXISTS');
		expect(result!.sql).toContain('jsonb_each');
		expect(result!.sql).toContain('value IN');
		expect(result!.args).toContain(JSON.stringify(['admin', 'user']));
	});

	it('should NOT use jsonb_each for non-array fields', () => {
		const result = buildWhereClause({ name: { $in: ['Alice', 'Bob'] } }, schema, 'test');
		expect(result).not.toBeNull();
		expect(result!.sql).not.toContain('EXISTS');
		expect(result!.sql).toContain('IN');
		expect(result!.args).toContain(JSON.stringify(['Alice', 'Bob']));
	});

	it('should handle mixed types in $in array', () => {
		const result = buildWhereClause({ tags: { $in: ['admin', 20] } }, schema, 'test');
		expect(result).not.toBeNull();
		expect(result!.sql).toContain('EXISTS');
		expect(result!.sql).toContain('jsonb_each');
	});

	it('should handle null in $in array', () => {
		const result = buildWhereClause({ tags: { $in: ['admin', null] } }, schema, 'test');
		expect(result).not.toBeNull();
		expect(result!.sql).toContain('OR');
		expect(result!.sql).toContain('IS NULL');
	});
});

describe('Array operators: $nin', () => {
	it('should use jsonb_each for array fields', () => {
		const result = buildWhereClause({ tags: { $nin: ['admin', 'user'] } }, schema, 'test');
		expect(result).not.toBeNull();
		expect(result!.sql).toContain('NOT EXISTS');
		expect(result!.sql).toContain('jsonb_each');
		expect(result!.sql).toContain('value IN');
		expect(result!.args).toContain(JSON.stringify(['admin', 'user']));
	});

	it('should NOT use jsonb_each for non-array fields', () => {
		const result = buildWhereClause({ name: { $nin: ['Alice', 'Bob'] } }, schema, 'test');
		expect(result).not.toBeNull();
		expect(result!.sql).not.toContain('EXISTS');
		expect(result!.sql).toContain('NOT IN');
		expect(result!.args).toContain(JSON.stringify(['Alice', 'Bob']));
	});

	it('should handle null in $nin array', () => {
		const result = buildWhereClause({ tags: { $nin: ['admin', null] } }, schema, 'test');
		expect(result).not.toBeNull();
		expect(result!.sql).toContain('AND');
		expect(result!.sql).toContain('IS NOT NULL');
	});
});
