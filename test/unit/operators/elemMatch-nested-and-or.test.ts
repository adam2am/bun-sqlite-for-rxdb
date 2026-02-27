import { describe, it, expect } from 'bun:test';
import { translateElemMatch } from '../../../src/query/operators';
import type { RxJsonSchema } from 'rxdb';

describe('$elemMatch with nested $and/$or', () => {
	const mockSchema: RxJsonSchema<any> = {
		version: 0,
		primaryKey: 'id',
		type: 'object',
		properties: {
			id: { type: 'string' },
			items: { type: 'array' }
		},
		required: ['id']
	};

	it('handles $elemMatch with $and containing $or', () => {
		const result = translateElemMatch(
			'items',
			{
				$and: [
					{ $or: [{ type: 'A' }, { type: 'B' }] },
					{ status: 'active' }
				]
			},
			mockSchema,
			'items'
		);

		console.log('Generated SQL:', result?.sql);
		console.log('Generated args:', result?.args);

		expect(result).not.toBeNull();
		expect(result?.sql).toContain('EXISTS');
		expect(result?.sql).toContain('jsonb_each');
	});
});
