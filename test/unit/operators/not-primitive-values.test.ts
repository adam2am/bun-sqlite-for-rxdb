import { describe, it, expect, afterEach } from 'bun:test';
import { buildWhereClause, clearCache } from '$app/query/builder';
import type { RxJsonSchema, RxDocumentData } from 'rxdb';

afterEach(() => {
	clearCache();
});

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
	it('should accept $not with boolean false (Mingo compatibility - Tolerant Reader)', () => {
		const result = buildWhereClause({ active: { $not: false } }, schema, 'test');
		expect(result).not.toBeNull();
		expect(result!.sql).toContain('NOT');
		expect(result!.sql).toContain('=');
		expect(result!.args).toContain(false);
	});

	it('should accept $not with boolean true (Mingo compatibility - Tolerant Reader)', () => {
		const result = buildWhereClause({ active: { $not: true } }, schema, 'test');
		expect(result).not.toBeNull();
		expect(result!.sql).toContain('NOT');
		expect(result!.sql).toContain('=');
		expect(result!.args).toContain(true);
	});

	it('should accept $not with number 0 (Mingo compatibility - Tolerant Reader)', () => {
		const result = buildWhereClause({ count: { $not: 0 } }, schema, 'test');
		expect(result).not.toBeNull();
		expect(result!.sql).toContain('NOT');
		expect(result!.sql).toContain('=');
		expect(result!.args).toContain(0);
	});

	it('should accept $not with empty string (Mingo compatibility - Tolerant Reader)', () => {
		const result = buildWhereClause({ name: { $not: '' } }, schema, 'test');
		expect(result).not.toBeNull();
		expect(result!.sql).toContain('NOT');
		expect(result!.sql).toContain('=');
		expect(result!.args).toContain('');
	});

	it('should accept $not with null (Mingo compatibility - Tolerant Reader)', () => {
		const result = buildWhereClause({ name: { $not: null } }, schema, 'test');
		expect(result).not.toBeNull();
		expect(result!.sql).toContain('NOT');
		expect(result!.sql).toContain('IS NULL');
		expect(result!.args).toEqual([]);
	});

	it('should still return 1=0 for empty object', () => {
		const result = buildWhereClause({ name: { $not: {} } }, schema, 'test');
		expect(result).not.toBeNull();
		expect(result!.sql).toBe('1=0');
		expect(result!.args).toEqual([]);
	});
});
