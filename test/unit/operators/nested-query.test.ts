import { describe, expect, test } from 'bun:test';
import { buildWhereClause } from '$app/query/builder';
import type { MangoQuerySelector, RxJsonSchema, RxDocumentData } from 'rxdb';

interface TestDocType {
	id: string;
	name: string;
	age: number;
	status: string;
	verified: boolean;
	country: string;
	role: string;
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
		verified: { type: 'boolean' },
		country: { type: 'string' },
		role: { type: 'string' },
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
	required: ['id']
};

describe('Nested Query Builder - Depth Tracking', () => {
	test('deeply nested $or inside $and inside $or', () => {
		const selector: MangoQuerySelector<any> = {
			$or: [
				{
					$and: [
						{ age: { $gte: 30 } },
						{
							$or: [
								{ status: 'active' },
								{ status: 'premium' }
							]
						}
					]
				},
				{ age: { $lt: 18 } }
			]
		};

	const result = buildWhereClause(selector, mockSchema, 'test');

	expect(result).not.toBeNull();
	expect(result!.sql).toBe(
		"(((json_extract(data, '$.age') >= ? AND ((json_extract(data, '$.status') = ?) OR (json_extract(data, '$.status') = ?)))) OR (json_extract(data, '$.age') < ?))"
	);
	expect(result!.args).toEqual([30, 'active', 'premium', 18]);
	});

	test('triple nested $and inside $or inside $and', () => {
		const selector: MangoQuerySelector<any> = {
			$and: [
				{ name: { $ne: null } },
				{
					$or: [
						{
							$and: [
								{ age: { $gte: 21 } },
								{ status: 'verified' }
							]
						},
						{ role: 'admin' }
					]
				}
			]
		};

	const result = buildWhereClause(selector, mockSchema, 'test');

	expect(result).not.toBeNull();
	expect(result!.sql).toBe(
		"json_extract(data, '$.name') IS NOT NULL AND (((json_extract(data, '$.age') >= ? AND json_extract(data, '$.status') = ?)) OR (json_extract(data, '$.role') = ?))"
	);
	expect(result!.args).toEqual([21, 'verified', 'admin']);
	});

	test('complex nested with $in inside $or inside $and', () => {
		const selector: MangoQuerySelector<any> = {
			$and: [
				{
					$or: [
						{ age: { $in: [18, 19, 20] } },
						{ status: 'student' }
					]
				},
				{ verified: true }
			]
		};

	const result = buildWhereClause(selector, mockSchema, 'test');

	expect(result).not.toBeNull();
	expect(result!.sql).toBe(
		"((json_extract(data, '$.age') IN (SELECT value FROM json_each(?))) OR (json_extract(data, '$.status') = ?)) AND json_extract(data, '$.verified') = ?"
	);
	expect(result!.args).toEqual(['[18,19,20]', 'student', true]);
	});

	test('four-level nesting with mixed operators', () => {
		const selector: MangoQuerySelector<any> = {
			$or: [
				{
					$and: [
						{ country: 'US' },
						{
							$or: [
								{
									$and: [
										{ age: { $gte: 18 } },
										{ age: { $lte: 65 } }
									]
								},
								{ status: 'exempt' }
							]
						}
					]
				},
				{ role: 'admin' }
			]
		};

	const result = buildWhereClause(selector, mockSchema, 'test');

	expect(result).not.toBeNull();
	expect(result!.sql).toBe(
		"(((json_extract(data, '$.country') = ? AND (((json_extract(data, '$.age') >= ? AND json_extract(data, '$.age') <= ?)) OR (json_extract(data, '$.status') = ?)))) OR (json_extract(data, '$.role') = ?))"
	);
	expect(result!.args).toEqual(['US', 18, 65, 'exempt', 'admin']);
	});

	test('nested $or with $nin and $gt', () => {
		const selector: MangoQuerySelector<any> = {
			$or: [
				{
					$and: [
						{ status: { $nin: ['banned', 'suspended'] } },
						{ age: { $gt: 21 } }
					]
				},
				{ role: { $in: ['admin', 'moderator'] } }
			]
		};

	const result = buildWhereClause(selector, mockSchema, 'test');

	expect(result).not.toBeNull();
	expect(result!.sql).toBe(
		"(((json_extract(data, '$.status') NOT IN (SELECT value FROM json_each(?)) AND json_extract(data, '$.age') > ?)) OR (json_extract(data, '$.role') IN (SELECT value FROM json_each(?))))"
	);
	expect(result!.args).toEqual(['["banned","suspended"]', 21, '["admin","moderator"]']);
	});

	test('parentheses placement with single $or at root', () => {
		const selector: MangoQuerySelector<any> = {
			$or: [
				{ age: { $lt: 18 } },
				{ age: { $gt: 65 } }
			]
		};

	const result = buildWhereClause(selector, mockSchema, 'test');

	expect(result).not.toBeNull();
	expect(result!.sql).toBe("((json_extract(data, '$.age') < ?) OR (json_extract(data, '$.age') > ?))");
	expect(result!.args).toEqual([18, 65]);
	});

	test('parentheses placement with nested $or at depth 1', () => {
		const selector: MangoQuerySelector<any> = {
			$and: [
				{ verified: true },
				{
					$or: [
						{ status: 'active' },
						{ status: 'trial' }
					]
				}
			]
		};

	const result = buildWhereClause(selector, mockSchema, 'test');

	expect(result).not.toBeNull();
	expect(result!.sql).toBe("json_extract(data, '$.verified') = ? AND ((json_extract(data, '$.status') = ?) OR (json_extract(data, '$.status') = ?))");
	expect(result!.args).toEqual([true, 'active', 'trial']);
	});
});
