import { describe, it, expect } from 'bun:test';
import { buildWhereClause } from '$app/query/builder';
import type { RxJsonSchema, RxDocumentData } from 'rxdb';

interface TestDoc {
	id: string;
	items: Array<{
		name: string;
		category: string;
		price: number;
	}>;
}

const schema: RxJsonSchema<RxDocumentData<TestDoc>> = {
	version: 0,
	primaryKey: 'id',
	type: 'object',
	properties: {
		id: { type: 'string' },
		items: {
			type: 'array',
			items: {
				type: 'object',
				properties: {
					name: { type: 'string' },
					category: { type: 'string' },
					price: { type: 'number' }
				}
			}
		},
		_deleted: { type: 'boolean' },
		_attachments: { type: 'object' },
		_rev: { type: 'string' },
		_meta: { type: 'object', properties: { lwt: { type: 'number' } } }
	},
	required: ['id', '_deleted', '_attachments', '_rev', '_meta']
};

describe('BLACK HOLE #4: Implicit Array Traversal (dot notation)', () => {
	it('should detect dot notation into array fields and return null (fallback to Mingo)', () => {
		const result = buildWhereClause({ 'items.category': 'A' } as any, schema, 'test');
		
		// Should return null to trigger Mingo fallback
		// because SQLite cannot handle implicit array traversal correctly
		expect(result).toBeNull();
	});

	it('should detect dot notation into nested array properties', () => {
		const result = buildWhereClause({ 'items.price': 100 } as any, schema, 'test');
		expect(result).toBeNull();
	});

	it('should detect dot notation into nested array string fields', () => {
		const result = buildWhereClause({ 'items.name': 'item1' } as any, schema, 'test');
		expect(result).toBeNull();
	});

	it('should still handle $elemMatch correctly (explicit array traversal)', () => {
		const result = buildWhereClause({ items: { $elemMatch: { category: 'A' } } }, schema, 'test');
		
		// $elemMatch is explicit and should work
		expect(result).not.toBeNull();
		expect(result!.sql).toContain('EXISTS');
		expect(result!.sql).toContain('jsonb_each');
	});
});
