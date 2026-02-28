import { describe, it, expect } from 'bun:test';
import { translateRegex } from '$app/query/operators';
import type { RxJsonSchema, RxDocumentData } from 'rxdb';

const mockSchema: RxJsonSchema<RxDocumentData<any>> = {
	version: 0,
	primaryKey: 'id',
	type: 'object',
	properties: {}
};

describe('$regex Invalid Flags', () => {
	it('rejects "g" flag (global not supported in MongoDB)', () => {
		expect(() => {
			translateRegex('name', 'test', 'g', mockSchema, 'name');
		}).toThrow(/invalid.*option.*g/i);
	});

	it('rejects "mg" flags (multiple invalid)', () => {
		expect(() => {
			translateRegex('name', 'test', 'mg', mockSchema, 'name');
		}).toThrow(/invalid.*option/i);
	});

	it('rejects "ig" flags (valid + invalid)', () => {
		expect(() => {
			translateRegex('name', 'test', 'ig', mockSchema, 'name');
		}).toThrow(/invalid.*option.*g/i);
	});

	it('accepts "i" flag (case-insensitive)', () => {
		const result = translateRegex('name', 'test', 'i', mockSchema, 'name');
		expect(result).not.toBeNull();
		expect(result?.sql).toContain('COLLATE NOCASE');
	});

	it('accepts "m" flag (multiline)', () => {
		const result = translateRegex('name', '^test', 'm', mockSchema, 'name');
		expect(result).not.toBeNull();
	});

	it('accepts "im" flags (multiple valid)', () => {
		const result = translateRegex('name', 'test', 'im', mockSchema, 'name');
		expect(result).not.toBeNull();
	});
});
