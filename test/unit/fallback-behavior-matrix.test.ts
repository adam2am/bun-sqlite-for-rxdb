import { describe, it, expect } from 'bun:test';
import { buildWhereClause } from '../../src/query/builder';
import type { RxJsonSchema, RxDocumentData } from 'rxdb';

interface TestDoc {
	id: string;
	name: string;
	age: number;
	tags: string[];
	metadata?: any;
	config?: any;
}

const schema: RxJsonSchema<RxDocumentData<TestDoc>> = {
	version: 0,
	primaryKey: 'id',
	type: 'object',
	properties: {
		id: { type: 'string' },
		name: { type: 'string' },
		age: { type: 'number' },
		tags: { type: 'array', items: { type: 'string' } },
		metadata: { type: 'object' },
		_deleted: { type: 'boolean' },
		_attachments: { type: 'object' },
		_rev: { type: 'string' },
		_meta: { type: 'object', properties: { lwt: { type: 'number' } } }
	},
	required: ['id', 'name', 'age', 'tags', '_deleted', '_attachments', '_rev', '_meta']
} as any;

describe('Fallback Behavior Matrix: SQL vs Mingo', () => {
	describe('✅ STAYS IN SQL (Fast Path)', () => {
		it('Simple field equality', () => {
			const result = buildWhereClause({ name: 'Alice' }, schema, 'test');
			expect(result).not.toBeNull();
			expect(result?.sql).toContain('json_extract');
		});

		it('Comparison operators on known fields', () => {
			const result = buildWhereClause({ age: { $gt: 25 } }, schema, 'test');
			expect(result).not.toBeNull();
			expect(result?.sql).toContain('>');
		});

		it('$in operator', () => {
			const result = buildWhereClause({ name: { $in: ['Alice', 'Bob'] } }, schema, 'test');
			expect(result).not.toBeNull();
			expect(result?.sql).toContain('IN');
		});

		it('$exists operator', () => {
			const result = buildWhereClause({ name: { $exists: true } }, schema, 'test');
			expect(result).not.toBeNull();
			expect(result?.sql).toContain('IS NOT NULL');
		});

		it('$size on known array', () => {
			const result = buildWhereClause({ tags: { $size: 3 } }, schema, 'test');
			expect(result).not.toBeNull();
			expect(result?.sql).toContain('json_array_length');
		});

		it('Array equality', () => {
			const result = buildWhereClause({ tags: ['a', 'b'] }, schema, 'test');
			expect(result).not.toBeNull();
			expect(result?.sql).toContain('json(?)');
		});

		it('$elemMatch on known array', () => {
			const result = buildWhereClause({ tags: { $elemMatch: { $eq: 'test' } } }, schema, 'test');
			expect(result).not.toBeNull();
			expect(result?.sql).toContain('EXISTS');
			expect(result?.sql).toContain('jsonb_each');
		});
	});

	describe('❌ FALLS BACK TO MINGO (Correctness Over Performance)', () => {
		it('Dot-notation with unknown nested type', () => {
			const result = buildWhereClause({ 'metadata.user.name': 'Alice' }, schema, 'test');
			expect(result).toBeNull();
		});

		it('Plain object equality (key-order independence)', () => {
			const result = buildWhereClause({ config: { enabled: true, level: 5 } }, schema, 'test');
			expect(result).toBeNull();
		});

		it('Nested object in unknown field', () => {
			const result = buildWhereClause({ 'metadata.settings': { theme: 'dark' } }, schema, 'test');
			expect(result).toBeNull();
		});
	});

	describe('📊 HYBRID: SQL with Runtime Guards', () => {
		it('$size on unknown field (adds type guard)', () => {
			const result = buildWhereClause({ metadata: { $size: 2 } }, schema, 'test');
			expect(result).not.toBeNull();
			expect(result?.sql).toContain('json_type');
			expect(result?.sql).toContain('json_array_length');
		});

		it('Comparison with type guards', () => {
			const result = buildWhereClause({ age: { $gt: 25 } }, schema, 'test');
			expect(result).not.toBeNull();
			expect(result?.sql).toContain('json_type');
		});
	});

	describe('🚫 REJECTED IN SQL (Returns 1=0)', () => {
		it('$size on known non-array', () => {
			const result = buildWhereClause({ name: { $size: 5 } }, schema, 'test');
			expect(result).not.toBeNull();
			expect(result?.sql).toBe('1=0');
		});

		it('Empty object selector', () => {
			const result = buildWhereClause({ name: {} }, schema, 'test');
			expect(result).not.toBeNull();
			expect(result?.sql).toBe('1=0');
		});
	});
});

describe('Documentation: Why Each Fallback Happens', () => {
	it('Dot-notation fallback: Prevents silent data loss from array traversal', () => {
		const result = buildWhereClause({ 'metadata.user.name': 'Alice' }, schema, 'test');
		expect(result).toBeNull();
	});

	it('Object equality fallback: SQLite preserves key order, MongoDB does not', () => {
		const result = buildWhereClause({ config: { a: 1, b: 2 } }, schema, 'test');
		expect(result).toBeNull();
	});
});
