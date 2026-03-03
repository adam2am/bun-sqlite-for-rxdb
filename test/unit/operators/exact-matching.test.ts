import { describe, it, expect } from 'bun:test';
import { translateEq } from '$app/query/operators';
import type { RxJsonSchema, RxDocumentData } from 'rxdb';

interface TestDoc {
	id: string;
	tags: string[];
	config: { enabled: boolean };
}

const schema: RxJsonSchema<RxDocumentData<TestDoc>> = {
	version: 0,
	primaryKey: 'id',
	type: 'object',
	properties: {
		id: { type: 'string' },
		tags: { type: 'array', items: { type: 'string' } },
		config: { type: 'object' },
		_deleted: { type: 'boolean' },
		_attachments: { type: 'object' },
		_rev: { type: 'string' },
		_meta: { type: 'object', properties: { lwt: { type: 'number' } } }
	},
	required: ['id', '_deleted', '_attachments', '_rev', '_meta']
};

describe('BLACK HOLE #3: Exact array matching with JSON.stringify', () => {
	it('should use json() for exact array comparison', () => {
		const field = "json_extract(data, '$.tags')";
		const value = ['admin', 'user'];
		const result = translateEq(field, value);
		
		if (result) {
			expect(result.sql).toContain('= json(?)');
			expect(result.args).toEqual(['["admin","user"]']);
		} else {
			expect(result).not.toBeNull();
		}
	});

	it('should preserve array order in JSON string', () => {
		const field = "json_extract(data, '$.tags')";
		const value = ['user', 'admin'];
		const result = translateEq(field, value);
		
		if (result) {
			expect(result.args).toEqual(['["user","admin"]']);
		} else {
			expect(result).not.toBeNull();
		}
	});

	it('should handle empty arrays', () => {
		const field = "json_extract(data, '$.tags')";
		const value: string[] = [];
		const result = translateEq(field, value);
		
		if (result) {
			expect(result.sql).toContain('= json(?)');
			expect(result.args).toEqual(['[]']);
		} else {
			expect(result).not.toBeNull();
		}
	});
});

describe('BLACK HOLE #2: Exact object matching delegates to Mingo', () => {
	it('should return null for exact object comparison (Mingo fallback)', () => {
		const field = "json_extract(data, '$.config')";
		const value = { enabled: true };
		const result = translateEq(field, value);
		
		// Should return null to trigger Mingo fallback (SQLite json() preserves key order, MongoDB doesn't)
		expect(result).toBeNull();
	});

	it('should return null for all plain objects (Mingo handles key order)', () => {
		const field = "json_extract(data, '$.config')";
		const value1 = { enabled: true };
		const value2 = { enabled: true, level: 5 };
		
		const result1 = translateEq(field, value1);
		const result2 = translateEq(field, value2);
		
		// Both should return null (Mingo fallback)
		expect(result1).toBeNull();
		expect(result2).toBeNull();
	});
});
