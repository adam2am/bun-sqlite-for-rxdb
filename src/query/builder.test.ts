import { describe, it, expect } from 'bun:test';
import { buildWhereClause } from './builder';
import type { RxJsonSchema, RxDocumentData } from 'rxdb';

interface TestDocType {
	id: string;
	name: string;
	age: number;
	status: string;
}

const mockSchema: RxJsonSchema<RxDocumentData<TestDocType>> = {
	version: 0,
	primaryKey: 'id',
	type: 'object',
	properties: {
		id: { type: 'string' },
		name: { type: 'string' },
		age: { type: 'number' },
		status: { type: 'string' },
		_deleted: { type: 'boolean' },
		_attachments: { type: 'object' },
		_rev: { type: 'string' },
		_meta: { 
			type: 'object',
			properties: {
				lwt: { type: 'number' }
			}
		}
	},
	required: ['id', '_deleted', '_attachments', '_rev', '_meta']
};

describe('Query Builder', () => {
	describe('buildWhereClause', () => {
		it('builds simple equality', () => {
			const result = buildWhereClause({ age: 18 }, mockSchema);
			expect(result.sql).toContain('=');
			expect(result.args).toEqual([18]);
		});

		it('builds $gt operator', () => {
			const result = buildWhereClause({ age: { $gt: 18 } }, mockSchema);
			expect(result.sql).toContain('>');
			expect(result.args).toEqual([18]);
		});

		it('builds $gte operator', () => {
			const result = buildWhereClause({ age: { $gte: 18 } }, mockSchema);
			expect(result.sql).toContain('>=');
			expect(result.args).toEqual([18]);
		});

		it('builds $lt operator', () => {
			const result = buildWhereClause({ age: { $lt: 18 } }, mockSchema);
			expect(result.sql).toContain('<');
			expect(result.args).toEqual([18]);
		});

		it('builds $lte operator', () => {
			const result = buildWhereClause({ age: { $lte: 18 } }, mockSchema);
			expect(result.sql).toContain('<=');
			expect(result.args).toEqual([18]);
		});

		it('builds multiple conditions with AND', () => {
			const result = buildWhereClause({ age: 18, status: 'active' }, mockSchema);
			expect(result.sql).toContain('AND');
			expect(result.args).toEqual([18, 'active']);
		});

		it('handles null values', () => {
			const result = buildWhereClause({ status: { $eq: null } }, mockSchema);
			expect(result.sql).toContain('IS NULL');
			expect(result.args).toEqual([]);
		});

		it('handles empty selector', () => {
			const result = buildWhereClause({}, mockSchema);
			expect(result.sql).toBe('1=1');
			expect(result.args).toEqual([]);
		});

		it('uses column for _deleted', () => {
			const result = buildWhereClause({ _deleted: false }, mockSchema);
			expect(result.sql).toContain('deleted');
			expect(result.args).toEqual([false]);
		});

		it('uses column for primary key', () => {
			const result = buildWhereClause({ id: 'user1' }, mockSchema);
			expect(result.sql).toContain('id');
			expect(result.args).toEqual(['user1']);
		});
	});
});
