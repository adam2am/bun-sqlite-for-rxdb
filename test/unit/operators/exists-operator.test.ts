import { describe, it, expect } from 'bun:test';
import { translateExists } from '$app/query/operators';

describe('$exists Operator', () => {
	it('translates $exists: true to IS NOT NULL', () => {
		const result = translateExists('age', true);
		expect(result.sql).toBe('age IS NOT NULL');
		expect(result.args).toEqual([]);
	});

	it('translates $exists: false to IS NULL', () => {
		const result = translateExists('age', false);
		expect(result.sql).toBe('age IS NULL');
		expect(result.args).toEqual([]);
	});

	it('works with nested fields using json_extract', () => {
		const result = translateExists("json_extract(data, '$.address.city')", true);
		expect(result.sql).toBe("json_extract(data, '$.address.city') IS NOT NULL");
		expect(result.args).toEqual([]);
	});

	it('handles boolean false correctly', () => {
		const result = translateExists('status', false);
		expect(result.sql).toBe('status IS NULL');
		expect(result.args).toEqual([]);
	});
});
