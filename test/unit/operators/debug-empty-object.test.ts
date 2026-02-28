import { describe, it, expect } from 'bun:test';
import { buildWhereClause } from '$app/query/builder';
import type { RxJsonSchema, RxDocumentData } from 'rxdb';

interface TestDoc {
	id: string;
	name: string;
}

const schema: RxJsonSchema<RxDocumentData<TestDoc>> = {
	version: 0,
	primaryKey: 'id',
	type: 'object',
	properties: {
		id: { type: 'string' },
		name: { type: 'string' },
		_deleted: { type: 'boolean' },
		_attachments: { type: 'object' },
		_rev: { type: 'string' },
		_meta: { type: 'object', properties: { lwt: { type: 'number' } } }
	},
	required: ['id', '_deleted', '_attachments', '_rev', '_meta']
};

describe('DEBUG: $not with empty object', () => {
	it('ISOLATED: should return 1=0 for empty object', () => {
		console.log('\n=== STARTING ISOLATED TEST ===');
		const query = { name: { $not: {} } };
		console.log('Query:', JSON.stringify(query, null, 2));
		
		const result = buildWhereClause(query, schema, 'test');
		
		console.log('Result:', result);
		console.log('SQL:', result?.sql);
		console.log('Args:', result?.args);
		console.log('=== END ISOLATED TEST ===\n');
		
		expect(result).not.toBeNull();
		expect(result!.sql).toBe('1=0');
		expect(result!.args).toEqual([]);
	});
});
