import { describe, it, expect } from 'bun:test';
import { buildWhereClause } from '../../../src/query/builder';
import { mockSchema } from '../data-corruption/shared-setup';

describe('$not with nested $and bug', () => {
	it('should handle impossible $and condition (should match all)', () => {
		const result = buildWhereClause(
			{ age: { $not: { $and: [{ age: { $gt: 20 } }, { age: { $lt: 20 } }] } } },
			mockSchema,
			'test'
		);

		expect(result).not.toBeNull();
		expect(result!.sql).toContain('NOT');
		expect(result!.sql).toContain('json_extract(data');
		expect(result!.sql).toContain('>');
		expect(result!.sql).toContain('<');
	});

	it('should handle valid $and condition', () => {
		const result = buildWhereClause(
			{ age: { $not: { $and: [{ age: { $gte: 25 } }, { age: { $lte: 30 } }] } } },
			mockSchema,
			'test'
		);

		expect(result).not.toBeNull();
		expect(result!.sql).toContain('NOT');
		expect(result!.sql).toContain('json_extract(data');
		expect(result!.sql).toContain('>=');
		expect(result!.sql).toContain('<=');
	});

	it('should handle $or inside $not', () => {
		const result = buildWhereClause(
			{ age: { $not: { $or: [{ age: { $lt: 20 } }, { age: { $gt: 40 } }] } } },
			mockSchema,
			'test'
		);

		expect(result).not.toBeNull();
		expect(result!.sql).toContain('NOT');
		expect(result!.sql).toContain('json_extract(data');
		expect(result!.sql).toContain('<');
		expect(result!.sql).toContain('>');
	});
});
