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

describe('BUG: $or operator precedence with AND', () => {
	it('should wrap $or in parentheses when combined with other conditions', () => {
		// This is the EXACT query that fails in RxDB test suite
		const result = buildWhereClause({
			passportId: { $eq: 'ccc' },
			$or: [
				{ oneOptional: { $ne: 'foobar1' } },
				{ oneOptional: { $ne: 'foobar2' } }
			]
		}, schema, 'test');

		expect(result).not.toBeNull();
		
		// The SQL MUST have outer parentheses around the entire $or expression
		// WRONG: passportId = 'ccc' AND (cond1) OR (cond2)
		// RIGHT: passportId = 'ccc' AND ((cond1) OR (cond2))
		
		const sql = result!.sql;
		console.log('Generated SQL:', sql);
		
		// Check that $or expression is wrapped in outer parentheses
		// The pattern should be: field = ? AND ((...) OR (...))
		expect(sql).toMatch(/AND \(\(\(/); // AND followed by triple opening parens (outer + inner)
		
		// Verify the structure: id condition AND (OR expression)
		expect(sql).toContain('id = ?');
		expect(sql).toContain('AND');
		expect(sql).toContain('OR');
		
		// Count parentheses - should have proper nesting
		const openParens = (sql.match(/\(/g) || []).length;
		const closeParens = (sql.match(/\)/g) || []).length;
		expect(openParens).toBe(closeParens); // Balanced
		expect(openParens).toBeGreaterThanOrEqual(4); // At least 4 parens for proper nesting
	});

	it('should handle simple $or at top level correctly', () => {
		const result = buildWhereClause({
			$or: [
				{ passportId: 'aaa' },
				{ passportId: 'bbb' }
			]
		}, schema, 'test');

		expect(result).not.toBeNull();
		
		const sql = result!.sql;
		console.log('Simple $or SQL:', sql);
		
		// Even at top level, $or should be wrapped in parens for consistency
		expect(sql).toMatch(/^\(/); // Starts with opening paren
		expect(sql).toMatch(/\)$/); // Ends with closing paren
	});

	it('demonstrates the SQL precedence issue', () => {
		console.log('');
		console.log('SQL OPERATOR PRECEDENCE ISSUE:');
		console.log('');
		console.log('WRONG (without outer parens):');
		console.log('  passportId = "ccc" AND (oneOptional != "foobar1" OR oneOptional IS NULL) OR (oneOptional != "foobar2" OR oneOptional IS NULL)');
		console.log('  Parsed as: (passportId = "ccc" AND cond1) OR cond2');
		console.log('  Result: Matches ANY row where cond2 is true, ignoring passportId! ❌');
		console.log('');
		console.log('RIGHT (with outer parens):');
		console.log('  passportId = "ccc" AND ((oneOptional != "foobar1" OR oneOptional IS NULL) OR (oneOptional != "foobar2" OR oneOptional IS NULL))');
		console.log('  Parsed as: passportId = "ccc" AND (cond1 OR cond2)');
		console.log('  Result: Only matches rows where passportId = "ccc" AND (cond1 OR cond2) ✅');
		console.log('');
	});
});
