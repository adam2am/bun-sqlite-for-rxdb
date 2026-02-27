import { describe, it, expect } from 'bun:test';
import { buildWhereClause } from '$app/query/builder';
import type { RxJsonSchema, RxDocumentData } from 'rxdb';

interface TestDoc {
	id: string;
	tags: string[];
}

const schema: RxJsonSchema<RxDocumentData<TestDoc>> = {
	version: 0,
	primaryKey: 'id',
	type: 'object',
	properties: {
		id: { type: 'string' },
		tags: { type: 'array', items: { type: 'string' } },
		_deleted: { type: 'boolean' },
		_attachments: { type: 'object' },
		_rev: { type: 'string' },
		_meta: { type: 'object', properties: { lwt: { type: 'number' } } }
	},
	required: ['id', '_deleted', '_attachments', '_rev', '_meta']
};

describe('DEBUG: $elemMatch with $type SQL Generation', () => {
	it('should generate valid SQL for { tags: { $elemMatch: { $type: "string" } } }', () => {
		const selector = { tags: { $elemMatch: { $type: 'string' } } };
		
		console.log('\n[DEBUG] Testing selector:', JSON.stringify(selector));
		
		const result = buildWhereClause(selector, schema, 'test');
		
		console.log('[DEBUG] Generated SQL:', result?.sql);
		console.log('[DEBUG] Generated args:', result?.args);
		console.log('[DEBUG] Result is null?', result === null);
		
		expect(result).not.toBeNull();
		
		if (result) {
			console.log('\n[DEBUG] Full SQL fragment:');
			console.log('  sql:', result.sql);
			console.log('  args:', result.args);
			
			expect(result.sql).toContain('type');
			expect(result.sql).not.toContain("json_type");
		}
	});
	
	it('should generate valid SQL for { tags: { $elemMatch: { $type: "number" } } }', () => {
		const selector = { tags: { $elemMatch: { $type: 'number' } } };
		
		console.log('\nDEBUG Testing selector:', JSON.stringify(selector));
		
		const result = buildWhereClause(selector, schema, 'test');
		
		console.log('[DEBUG] Generated SQL:', result?.sql);
		console.log('[DEBUG] Generated args:', result?.args);
		
		expect(result).not.toBeNull();
	});
});
