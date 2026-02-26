import { describe, it, expect } from 'bun:test';
import { buildWhereClause } from '$app/query/builder';
import type { RxJsonSchema, RxDocumentData } from 'rxdb';

interface TestDoc {
	passportId: string;
	oneOptional?: string;
}

const schema: RxJsonSchema<RxDocumentData<TestDoc>> = {
	version: 0,
	primaryKey: 'passportId',
	type: 'object',
	properties: {
		passportId: { type: 'string' },
		oneOptional: { type: 'string' },
		_deleted: { type: 'boolean' },
		_attachments: { type: 'object' },
		_rev: { type: 'string' },
		_meta: { type: 'object', properties: { lwt: { type: 'number' } } }
	},
	required: ['passportId', '_deleted', '_attachments', '_rev', '_meta']
};

describe('BUG: Empty object selectors should match nothing', () => {
	it('should return 1=0 for empty object selector', () => {
		const result = buildWhereClause({
			oneOptional: {}
		}, schema, 'test');

		expect(result).not.toBeNull();
		
		const sql = result!.sql;
		console.log('Empty object selector SQL:', sql);
		
		expect(sql).toBe('1=0');
		expect(result!.args).toEqual([]);
	});

	it('should handle empty object in nested query', () => {
		const result = buildWhereClause({
			passportId: 'aaa',
			oneOptional: {}
		}, schema, 'test');

		expect(result).not.toBeNull();
		
		const sql = result!.sql;
		console.log('Nested empty object SQL:', sql);
		
		expect(sql).toContain('1=0');
	});

	it('should handle empty object in $or', () => {
		const result = buildWhereClause({
			$or: [
				{ passportId: 'aaa' },
				{ oneOptional: {} }
			]
		}, schema, 'test');

		expect(result).not.toBeNull();
		
		const sql = result!.sql;
		console.log('Empty object in $or SQL:', sql);
		
		expect(sql).toContain('1=0');
	});

	it('demonstrates the empty object issue', () => {
		console.log('');
		console.log('EMPTY OBJECT SELECTOR ISSUE:');
		console.log('');
		console.log('Query: { oneOptional: {} }');
		console.log('');
		console.log('WRONG (current):');
		console.log('  Object.entries({}) returns []');
		console.log('  No conditions added');
		console.log('  SQL: WHERE 1=1');
		console.log('  Result: Matches ALL rows ❌');
		console.log('');
		console.log('RIGHT (should be):');
		console.log('  Detect empty object');
		console.log('  Return impossible condition');
		console.log('  SQL: WHERE 1=0');
		console.log('  Result: Matches ZERO rows ✅');
		console.log('');
	});
});
