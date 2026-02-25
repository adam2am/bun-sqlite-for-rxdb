import { describe, it, expect } from 'bun:test';
import { buildWhereClause } from '$app/query/builder';
import { mockSchema } from './shared-setup';

describe('Data Corruption - Malicious Input', () => {
	describe('SQL Injection Attempts', () => {
		it('SQL injection in string value', () => {
			const result = buildWhereClause(
				{ name: "'; DROP TABLE users; --" },
				mockSchema,
				'test'
			);
			expect(result).not.toBeNull();
			expect(result?.args).toContain("'; DROP TABLE users; --");
		});

		it('SQL injection in field name', () => {
			const result = buildWhereClause(
				{ "name'; DROP TABLE users; --": 'test' },
				mockSchema,
				'test'
			);
			expect(result).toBeDefined();
		});

		it('SQL keywords in values', () => {
			const result = buildWhereClause(
				{ name: 'SELECT * FROM users WHERE 1=1' },
				mockSchema,
				'test'
			);
			expect(result).not.toBeNull();
			expect(result?.args).toContain('SELECT * FROM users WHERE 1=1');
		});
	});

	describe('Unknown/Invalid Operators - Trash Data', () => {
		it('completely unknown operator', () => {
			const result = buildWhereClause(
				{ age: { $invalidOperator: 18 } as any },
				mockSchema,
				'test'
			);
			expect(result).toBeDefined();
		});

		it('typo in operator name', () => {
			const result = buildWhereClause(
				{ age: { $gtt: 18 } as any },
				mockSchema,
				'test'
			);
			expect(result).toBeDefined();
		});

		it('random garbage operator', () => {
			const result = buildWhereClause(
				{ age: { $randomGarbage123: 'trash' } as any },
				mockSchema,
				'test'
			);
			expect(result).toBeDefined();
		});

		it('operator with special characters', () => {
			const result = buildWhereClause(
				{ age: { '$gt!@#$%': 18 } as any },
				mockSchema,
				'test'
			);
			expect(result).toBeDefined();
		});

		it('empty string as operator', () => {
			const result = buildWhereClause(
				{ age: { '': 18 } as any },
				mockSchema,
				'test'
			);
			expect(result).toBeDefined();
		});
	});

	describe('Random Garbage Values', () => {
		it('Buffer as operator value', () => {
			const result = buildWhereClause(
				{ age: { $eq: Buffer.from('test') as any } },
				mockSchema,
				'test'
			);
			expect(result).toBeDefined();
		});

		it('Date object as operator value', () => {
			const result = buildWhereClause(
				{ age: { $eq: new Date() as any } },
				mockSchema,
				'test'
			);
			expect(result).toBeDefined();
		});

		it('RegExp object as operator value', () => {
			const result = buildWhereClause(
				{ age: { $eq: /test/gi as any } },
				mockSchema,
				'test'
			);
			expect(result).toBeDefined();
		});

		it('Map object as operator value', () => {
			const result = buildWhereClause(
				{ age: { $eq: new Map([['key', 'value']]) as any } },
				mockSchema,
				'test'
			);
			expect(result).toBeDefined();
		});

		it('Set object as operator value', () => {
			const result = buildWhereClause(
				{ age: { $eq: new Set([1, 2, 3]) as any } },
				mockSchema,
				'test'
			);
			expect(result).toBeDefined();
		});

		it('WeakMap as operator value', () => {
			const result = buildWhereClause(
				{ age: { $eq: new WeakMap() as any } },
				mockSchema,
				'test'
			);
			expect(result).toBeDefined();
		});

		it('Promise as operator value', () => {
			const result = buildWhereClause(
				{ age: { $eq: Promise.resolve(18) as any } },
				mockSchema,
				'test'
			);
			expect(result).toBeDefined();
		});

		it('Error object as operator value', () => {
			const result = buildWhereClause(
				{ age: { $eq: new Error('test') as any } },
				mockSchema,
				'test'
			);
			expect(result).toBeDefined();
		});
	});
});
