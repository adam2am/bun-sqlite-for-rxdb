import { describe, it, expect } from 'bun:test';
import { translateRegex } from './operators';
import type { RxJsonSchema, RxDocumentData } from 'rxdb';

const mockSchema: RxJsonSchema<RxDocumentData<{ id: string; name: string }>> = {
	version: 0,
	primaryKey: 'id',
	type: 'object',
	properties: {
		id: { type: 'string' },
		name: { type: 'string' },
		_deleted: { type: 'boolean' },
		_attachments: { type: 'object' },
		_rev: { type: 'string' },
		_meta: { type: 'object', properties: { lwt: { type: 'number' } } }
	},
	required: ['id', 'name', '_deleted', '_attachments', '_rev', '_meta']
};

describe('$regex Operator', () => {
	it('translates simple pattern to LIKE', () => {
		const result = translateRegex('name', '^John', undefined, mockSchema, 'name');
		expect(result?.sql).toBe("name LIKE ? ESCAPE '\\'");
		expect(result?.args).toEqual(['John%']);
	});

	it('translates end anchor to LIKE', () => {
		const result = translateRegex('email', '@gmail\\.com$', undefined, mockSchema, 'email');
		expect(result?.sql).toBe("email LIKE ? ESCAPE '\\'");
		expect(result?.args).toEqual(['%@gmail.com']);
	});

	it('translates contains pattern to LIKE', () => {
		const result = translateRegex('description', 'urgent', undefined, mockSchema, 'description');
		expect(result?.sql).toBe("description LIKE ? ESCAPE '\\'");
		expect(result?.args).toEqual(['%urgent%']);
	});

	it('escapes LIKE special chars', () => {
		const result = translateRegex('username', 'user_name', undefined, mockSchema, 'username');
		expect(result?.sql).toBe("username LIKE ? ESCAPE '\\'");
		expect(result?.args).toEqual(['%user\\_name%']);
	});

	it('handles case-insensitive with COLLATE NOCASE', () => {
		const result = translateRegex('name', 'john', 'i', mockSchema, 'name');
		expect(result?.sql).toBe("name LIKE ? COLLATE NOCASE ESCAPE '\\'");
		expect(result?.args).toEqual(['%john%']);
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
