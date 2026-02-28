import { describe, it, expect } from 'bun:test';
import { buildWhereClause } from '../../../src/query/builder';
import { mockSchema } from '../data-corruption/shared-setup';

describe('$not with nested $and integration test', () => {
	it('should generate correct SQL for impossible $and condition', () => {
		const selector = {
			age: {
				$not: {
					$and: [
						{ age: { $gt: 20 } },
						{ age: { $lt: 20 } }
					]
				}
			}
		};

		const result = buildWhereClause(selector, mockSchema, 'test');
		
		console.log('\n=== IMPOSSIBLE $AND TEST ===');
		console.log('Selector:', JSON.stringify(selector, null, 2));
		console.log('Generated SQL:', result?.sql);
		console.log('Args:', result?.args);
		console.log('Expected: NOT ((json_extract(data, \'$.age\') > ? AND json_extract(data, \'$.age\') < ?))');
		console.log('===========================\n');

		expect(result).not.toBeNull();
		expect(result!.sql).toContain('NOT');
		expect(result!.sql).toContain('json_extract');
		expect(result!.sql).not.toContain('no such column');
	});

	it('should generate correct SQL for valid $and condition', () => {
		const selector = {
			age: {
				$not: {
					$and: [
						{ age: { $gte: 25 } },
						{ age: { $lte: 30 } }
					]
				}
			}
		};

		const result = buildWhereClause(selector, mockSchema, 'test');
		
		console.log('\n=== VALID $AND TEST ===');
		console.log('Selector:', JSON.stringify(selector, null, 2));
		console.log('Generated SQL:', result?.sql);
		console.log('Args:', result?.args);
		console.log('===========================\n');

		expect(result).not.toBeNull();
		expect(result!.sql).toContain('NOT');
		expect(result!.sql).toContain('json_extract');
	});

	it('should generate correct SQL for $or inside $not', () => {
		const selector = {
			age: {
				$not: {
					$or: [
						{ age: { $lt: 20 } },
						{ age: { $gt: 40 } }
					]
				}
			}
		};

		const result = buildWhereClause(selector, mockSchema, 'test');
		
		console.log('\n=== $OR INSIDE $NOT TEST ===');
		console.log('Selector:', JSON.stringify(selector, null, 2));
		console.log('Generated SQL:', result?.sql);
		console.log('Args:', result?.args);
		console.log('===========================\n');

		expect(result).not.toBeNull();
		expect(result!.sql).toContain('NOT');
		expect(result!.sql).toContain('json_extract');
	});
});
