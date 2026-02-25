import { describe, it, expect } from 'bun:test';
import { buildWhereClause } from '$app/query/builder';
import { mockSchema } from './shared-setup';

describe('Data Corruption - Extreme Values', () => {
	describe('Circular References', () => {
		it('selector with circular reference', () => {
			const circular: any = { age: 18 };
			circular.self = circular;
			
			const result = buildWhereClause(circular, mockSchema, 'test');
			expect(result).toBeDefined();
		});

		it('nested selector with circular reference', () => {
			const inner: any = { $gt: 18 };
			inner.self = inner;
			
			const result = buildWhereClause({ age: inner }, mockSchema, 'test');
			expect(result).toBeDefined();
		});
	});

	describe('Extreme Values', () => {
		it('extremely long string value', () => {
			const longString = 'a'.repeat(1000000);
			const result = buildWhereClause(
				{ name: longString },
				mockSchema,
				'test'
			);
			expect(result).toBeDefined();
		});

		it('extremely large number', () => {
			const result = buildWhereClause(
				{ age: Number.MAX_SAFE_INTEGER },
				mockSchema,
				'test'
			);
			expect(result).toBeDefined();
		});

		it('extremely small number', () => {
			const result = buildWhereClause(
				{ age: Number.MIN_SAFE_INTEGER },
				mockSchema,
				'test'
			);
			expect(result).toBeDefined();
		});

		it('deeply nested selector (100 levels)', () => {
			let selector: any = { age: 18 };
			for (let i = 0; i < 100; i++) {
				selector = { $and: selector };
			}
			
			const result = buildWhereClause(selector, mockSchema, 'test');
			expect(result).toBeDefined();
		});
	});

	describe('Unicode and Special Characters', () => {
		it('emoji in field value', () => {
			const result = buildWhereClause(
				{ name: '🔥💯🚀' },
				mockSchema,
				'test'
			);
			expect(result).toBeDefined();
		});

		it('null bytes in string', () => {
			const result = buildWhereClause(
				{ name: 'test\x00null\x00bytes' },
				mockSchema,
				'test'
			);
			expect(result).toBeDefined();
		});

		it('unicode escape sequences', () => {
			const result = buildWhereClause(
				{ name: '\u0000\u0001\u0002' },
				mockSchema,
				'test'
			);
			expect(result).toBeDefined();
		});

		it('RTL characters', () => {
			const result = buildWhereClause(
				{ name: 'مرحبا العالم' },
				mockSchema,
				'test'
			);
			expect(result).toBeDefined();
		});
	});
});
