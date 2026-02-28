import { describe, it, expect } from 'bun:test';
import { buildWhereClause } from '../../src/query/builder';
import type { RxJsonSchema } from 'rxdb';

const mockSchema: RxJsonSchema<any> = {
	version: 0,
	primaryKey: 'id',
	type: 'object',
	properties: {
		id: { type: 'string', maxLength: 100 },
		age: { type: 'number' },
		items: { type: 'array' }
	}
};

describe('[DEBUG]: $elemMatch Triple Nesting', () => {
	it('DEBUG Test 1: $not with $or containing $and', () => {
		const selector = {
			age: {
				$not: {
					$or: [
						{ $and: [{ $gt: 20 }, { $lt: 28 }] },
						{ $eq: 35 }
					]
				}
			}
		};

		console.log('\n=== DEBUG TEST 1: $not with $or containing $and ===');
		console.log('Selector:', JSON.stringify(selector, null, 2));

		const result = buildWhereClause(selector, mockSchema, 'test');

		console.log('Result:', result);
		if (result) {
			console.log('SQL:', result.sql);
			console.log('Args:', result.args);
			console.log('Args types:', result.args.map(a => typeof a + ': ' + JSON.stringify(a)));
		}
		console.log('=== END DEBUG TEST 1 ===\n');

		expect(result).not.toBeNull();
		expect(result?.sql).toContain('NOT');
		expect(result?.sql).toContain('json_extract(data, \'$.age\')');
		expect(result?.args.every(arg => 
			typeof arg === 'string' || 
			typeof arg === 'number' || 
			typeof arg === 'boolean' || 
			arg === null
		)).toBe(true);
	});

	it('DEBUG Test 2: $elemMatch with nested object value', () => {
		const selector = {
			items: {
				$elemMatch: {
					config: { enabled: true, level: 5 }
				}
			}
		};

		console.log('\n=== DEBUG TEST 2: $elemMatch with nested object value ===');
		console.log('Selector:', JSON.stringify(selector, null, 2));

		const result = buildWhereClause(selector, mockSchema, 'test');

		console.log('Result:', result);
		if (result) {
			console.log('SQL:', result.sql);
			console.log('Args:', result.args);
			console.log('Args types:', result.args.map(a => typeof a + ': ' + JSON.stringify(a)));
		}
		console.log('=== END DEBUG TEST 2 ===\n');

		expect(result).not.toBeNull();
	});

	it('DEBUG Test 3: $elemMatch with $and containing $or (PASSING)', () => {
		const selector = {
			items: {
				$elemMatch: {
					$and: [
						{ $or: [{ type: 'A' }, { type: 'B' }] },
						{ status: 'active' }
					]
				}
			}
		};

		console.log('\n=== DEBUG TEST 3: $elemMatch with $and containing $or ===');
		console.log('Selector:', JSON.stringify(selector, null, 2));

		const result = buildWhereClause(selector, mockSchema, 'test');

		console.log('Result:', result);
		if (result) {
			console.log('SQL:', result.sql);
			console.log('Args:', result.args);
			console.log('Args types:', result.args.map(a => typeof a + ': ' + JSON.stringify(a)));
		}
		console.log('=== END DEBUG TEST 3 ===\n');

		expect(result).not.toBeNull();
	});
});
