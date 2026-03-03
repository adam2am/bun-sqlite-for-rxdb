import { describe, it, expect } from 'bun:test';
import { buildWhereClause } from '$app/query/builder';
import { matchesSelector } from '$app/query/lightweight-matcher';
import type { RxJsonSchema, RxDocumentData } from 'rxdb';

const testSchema: RxJsonSchema<any> = {
	version: 0,
	primaryKey: 'id',
	type: 'object',
	properties: {
		id: { type: 'string' },
		tags: { type: 'array', items: { type: 'string' } },
		items: { 
			type: 'array', 
			items: { 
				type: 'object',
				properties: {
					name: { type: 'string' }
				}
			}
		}
	},
	required: ['id']
};

describe('$all Operator', () => {
	describe('SQL Builder', () => {
		it('translates $all to multiple $eq checks linked by AND', () => {
			const result = buildWhereClause({ tags: { $all: ['admin', 'user'] } }, testSchema, 'test');
			
			expect(result).not.toBeNull();
			expect(result!.sql).toContain('WITH RECURSIVE flattened');
			expect(result!.sql).toContain('jsonb_each');
			expect(result!.sql).toContain('AND');
			expect(result!.args).toEqual(['admin', 'user']);
		});

		it('returns 1=0 for empty arrays', () => {
			const result = buildWhereClause({ tags: { $all: [] } }, testSchema, 'test');
			expect(result!.sql).toBe('1=0');
		});
	});

	describe('Lightweight Matcher (JS Fallback)', () => {
		const doc: RxDocumentData<{ tags: string[] }> = { 
			tags: ['admin', 'user', 'moderator'],
			_deleted: false,
			_attachments: {},
			_rev: '1-a',
			_meta: { lwt: 1000 }
		};

		it('matches when array contains all scalar elements', () => {
			expect(matchesSelector(doc, { tags: { $all: ['admin', 'user'] } })).toBe(true);
			expect(matchesSelector(doc, { tags: { $all: ['admin', 'guest'] } })).toBe(false);
		});

		it('matches when array contains all object elements (deep equality)', () => {
			const docObj: RxDocumentData<{ items: Array<{ name: string }> }> = { 
				items: [{ name: 'A' }, { name: 'B' }],
				_deleted: false,
				_attachments: {},
				_rev: '1-a',
				_meta: { lwt: 1000 }
			};
			expect(matchesSelector(docObj, { items: { $all: [{ name: 'A' }] } })).toBe(true);
			expect(matchesSelector(docObj, { items: { $all: [{ name: 'C' }] } })).toBe(false);
		});

		it('returns false for scalar fields (strict like Mingo)', () => {
			const scalarDoc: RxDocumentData<{ tags: string }> = { 
				tags: 'admin',
				_deleted: false,
				_attachments: {},
				_rev: '1-a',
				_meta: { lwt: 1000 }
			};
			expect(matchesSelector(scalarDoc, { tags: { $all: ['admin'] } })).toBe(false);
			expect(matchesSelector(scalarDoc, { tags: { $all: ['admin', 'user'] } })).toBe(false);
		});
	});
});
