import { describe, it, expect } from 'bun:test';
import { translateRegex } from '$app/query/operators';
import type { RxJsonSchema, RxDocumentData } from 'rxdb';

const mockSchema: RxJsonSchema<RxDocumentData<any>> = {
	version: 0,
	primaryKey: 'id',
	type: 'object',
	properties: {}
};

describe('$regex Operator', () => {
	it('translates simple pattern to LIKE', () => {
		const result = translateRegex('name', '^John', undefined, mockSchema, 'name');
		expect(result?.sql).toBe("(name LIKE ? ESCAPE '\\' OR EXISTS (SELECT 1 FROM jsonb_each(data, '$.name') WHERE value LIKE ? ESCAPE '\\'))");
		expect(result?.args).toEqual(['John%', 'John%']);
	});

	it('translates end anchor to LIKE', () => {
		const result = translateRegex('email', '@gmail\\.com$', undefined, mockSchema, 'email');
		expect(result?.sql).toBe("(email LIKE ? ESCAPE '\\' OR EXISTS (SELECT 1 FROM jsonb_each(data, '$.email') WHERE value LIKE ? ESCAPE '\\'))");
		expect(result?.args).toEqual(['%@gmail.com', '%@gmail.com']);
	});

	it('translates contains pattern to LIKE', () => {
		const result = translateRegex('description', 'urgent', undefined, mockSchema, 'description');
		expect(result?.sql).toBe("(description LIKE ? ESCAPE '\\' OR EXISTS (SELECT 1 FROM jsonb_each(data, '$.description') WHERE value LIKE ? ESCAPE '\\'))");
		expect(result?.args).toEqual(['%urgent%', '%urgent%']);
	});

	it('escapes LIKE special chars', () => {
		const result = translateRegex('username', 'user_name', undefined, mockSchema, 'username');
		expect(result?.sql).toBe("(username LIKE ? ESCAPE '\\' OR EXISTS (SELECT 1 FROM jsonb_each(data, '$.username') WHERE value LIKE ? ESCAPE '\\'))");
		expect(result?.args).toEqual(['%user\\_name%', '%user\\_name%']);
	});

	it('handles case-insensitive with COLLATE NOCASE', () => {
		const result = translateRegex('name', 'john', 'i', mockSchema, 'name');
		expect(result?.sql).toBe("(LOWER(name) LIKE LOWER(?) ESCAPE '\\' OR EXISTS (SELECT 1 FROM jsonb_each(data, '$.name') WHERE LOWER(value) LIKE LOWER(?) ESCAPE '\\'))");
		expect(result?.args).toEqual(['%john%', '%john%']);
	});

	it('handles case-insensitive prefix pattern', () => {
		const result = translateRegex('name', '^john', 'i', mockSchema, 'name');
		expect(result?.sql).toBe("(LOWER(name) LIKE LOWER(?) ESCAPE '\\' OR EXISTS (SELECT 1 FROM jsonb_each(data, '$.name') WHERE LOWER(value) LIKE LOWER(?) ESCAPE '\\'))");
		expect(result?.args).toEqual(['john%', 'john%']);
	});

	it('handles case-insensitive suffix pattern', () => {
		const result = translateRegex('email', '@gmail\\.com$', 'i', mockSchema, 'email');
		expect(result?.sql).toBe("(LOWER(email) LIKE LOWER(?) ESCAPE '\\' OR EXISTS (SELECT 1 FROM jsonb_each(data, '$.email') WHERE LOWER(value) LIKE LOWER(?) ESCAPE '\\'))");
		expect(result?.args).toEqual(['%@gmail.com', '%@gmail.com']);
	});

	it('handles case-insensitive exact match', () => {
		const result = translateRegex('code', '^ABC$', 'i', mockSchema, 'code');
		expect(result?.sql).toBe("(LOWER(code) = LOWER(?) OR EXISTS (SELECT 1 FROM jsonb_each(data, '$.code') WHERE LOWER(value) = LOWER(?)))");
		expect(result?.args).toEqual(['ABC', 'ABC']);
	});

	it('returns null for complex regex patterns', () => {
		const result = translateRegex('phone', '\\d{3}-\\d{4}', undefined, mockSchema, 'phone');
		expect(result).toBeNull();
	});

	it('returns null for character classes', () => {
		const result = translateRegex('code', '[A-Z]{3}', undefined, mockSchema, 'code');
		expect(result).toBeNull();
	});
});
