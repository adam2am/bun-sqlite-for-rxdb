import { describe, it, expect } from 'bun:test';
import { translateNin } from '../../../src/query/operators';
import { mockSchema } from '../data-corruption/shared-setup';

describe('$nin with undefined fields (MongoDB spec compliance)', () => {
	it('should generate IS NULL check for non-null values', () => {
		const result = translateNin('optional', ['present']);
		if (result) {
			expect(result.sql).toBe('(optional IS NULL OR optional NOT IN (SELECT value FROM json_each(?)))');
			expect(result.args).toEqual(['["present"]']);
		} else {
			expect(result).not.toBeNull();
		}
	});

	it('should NOT include IS NULL when array contains null', () => {
		const result = translateNin('optional', ['present', null]);
		if (result) {
			expect(result.sql).toBe('(optional NOT IN (SELECT value FROM json_each(?)) AND optional IS NOT NULL)');
			expect(result.args).toEqual(['["present"]']);
		} else {
			expect(result).not.toBeNull();
		}
	});

	it('should handle empty array', () => {
		const result = translateNin('field', []);
		if (result) {
			expect(result.sql).toBe('1=1');
			expect(result.args).toEqual([]);
		} else {
			expect(result).not.toBeNull();
		}
	});

	it('should handle array with only null', () => {
		const result = translateNin('field', [null]);
		if (result) {
			expect(result.sql).toBe('field IS NOT NULL');
			expect(result.args).toEqual([]);
		} else {
			expect(result).not.toBeNull();
		}
	});

	it('should handle array fields with IS NULL check', () => {
		const result = translateNin('tags', ['admin']);
		if (result) {
			expect(result.sql).toBe('(tags IS NULL OR tags NOT IN (SELECT value FROM json_each(?)))');
			expect(result.args).toEqual(['["admin"]']);
		} else {
			expect(result).not.toBeNull();
		}
	});
});
